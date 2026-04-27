import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import {
  computeAnnualCompensation,
  computeStockValueCny,
  projectBaseSalaries,
} from '../compensation';
import {
  MEAL_ALLOWANCE_DEFAULT_CNY,
  MISC_ALLOWANCE_DEFAULT_CNY,
  TAX_BRACKETS,
  defaultHousingAllowanceForYearIndex,
} from '../constants';
import { parsePlan, stringifyPlan } from '../serializer';
import { computeCapitalGainsTaxCny, computeWithholdingTax, round2 } from '../tax';
import { validatePlanSells } from '../validation';
import { computeVestedShares } from '../vesting';
import type { CompensationPlan, SellRecord, YearInput } from '../../types';

// Feature: amazon-annual-compensation-viewer
// Property-Based Tests for 16 Correctness Properties (design.md)
// Each property runs with numRuns: 100.

const NUM_RUNS = 100;

// ---------------- Generators ----------------

const finiteNonNeg = fc.double({
  min: 0,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

const finitePositive = fc.double({
  min: 0.01,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

const pct = fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });

/** Generator for a single year, with the 3 allowances possibly undefined. */
function arbYear(maxSellsTotal: number): fc.Arbitrary<YearInput> {
  return fc
    .record({
      raiseRate: pct,
      signOnBonus: finiteNonNeg,
      vestingPct: pct,
      vestingFmvUsd: fc.option(finitePositive, { nil: undefined }),
      // allow up to 3 sells per year (limited later for the test that requires Σ ≤ vested)
      sells: fc.array(
        fc.record({
          sellPriceUsd: fc.double({
            min: 0,
            max: 10_000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          sellQuantity: fc.integer({ min: 0, max: Math.max(0, maxSellsTotal) }),
        }),
        { minLength: 0, maxLength: 2 },
      ),
      mealAllowance: fc.option(finiteNonNeg, { nil: undefined }),
      miscellaneousAllowance: fc.option(finiteNonNeg, { nil: undefined }),
      housingAllowance: fc.option(finiteNonNeg, { nil: undefined }),
    })
    .map(
      (y): YearInput => ({
        raiseRate: y.raiseRate,
        signOnBonus: y.signOnBonus,
        vestingPct: y.vestingPct,
        ...(y.vestingFmvUsd !== undefined ? { vestingFmvUsd: y.vestingFmvUsd } : {}),
        sells: y.sells,
        ...(y.mealAllowance !== undefined ? { mealAllowance: y.mealAllowance } : {}),
        ...(y.miscellaneousAllowance !== undefined
          ? { miscellaneousAllowance: y.miscellaneousAllowance }
          : {}),
        ...(y.housingAllowance !== undefined
          ? { housingAllowance: y.housingAllowance }
          : {}),
      }),
    );
}

/**
 * Build a CompensationPlan with Σ vestingPct ≤ 100 and each year's sellQuantity ≤ vested.
 * Optionally force fx/price on or off.
 */
function arbPlan(opts?: {
  fxRate?: 'required' | 'optional' | 'absent';
  stockPriceUsd?: 'required' | 'optional' | 'absent';
  minYears?: number;
  maxYears?: number;
  startYearMin?: number;
  startYearMax?: number;
}): fc.Arbitrary<CompensationPlan> {
  const fxPolicy = opts?.fxRate ?? 'optional';
  const pricePolicy = opts?.stockPriceUsd ?? 'optional';
  const minYears = opts?.minYears ?? 1;
  const maxYears = opts?.maxYears ?? 6;
  const startYearMin = opts?.startYearMin ?? 2020;
  const startYearMax = opts?.startYearMax ?? 2035;

  return fc
    .record({
      startYear: fc.integer({ min: startYearMin, max: startYearMax }),
      baseSalaryStart: finiteNonNeg,
      rsuGrant: fc.integer({ min: 0, max: 10_000 }),
      fxRate:
        fxPolicy === 'required'
          ? finitePositive.map((v) => v as number | undefined)
          : fxPolicy === 'absent'
            ? fc.constant(undefined as number | undefined)
            : fc.option(finitePositive, { nil: undefined }),
      stockPriceUsd:
        pricePolicy === 'required'
          ? finitePositive.map((v) => v as number | undefined)
          : pricePolicy === 'absent'
            ? fc.constant(undefined as number | undefined)
            : fc.option(finitePositive, { nil: undefined }),
      yearsRaw: fc.array(arbYear(0), { minLength: minYears, maxLength: maxYears }),
      disableWithholdingTax: fc.boolean(),
    })
    .map((raw) => {
      // Normalize Σ vestingPct ≤ 100 by scaling down proportionally if needed
      const total = raw.yearsRaw.reduce((s, y) => s + y.vestingPct, 0);
      const factor = total > 100 ? 100 / total : 1;
      const scaled = raw.yearsRaw.map((y) => ({
        ...y,
        vestingPct: y.vestingPct * factor,
      }));
      // Clamp sellQuantity per year to Σ ≤ vested (rsuGrant × vestingPct / 100)
      const clampedYears = scaled.map((y) => {
        const vested = Math.floor(raw.rsuGrant * (y.vestingPct / 100));
        let remaining = vested;
        const safeSells = y.sells.map((s) => {
          const q = Math.min(s.sellQuantity, Math.max(0, remaining));
          remaining -= q;
          return { ...s, sellQuantity: q };
        });
        return { ...y, sells: safeSells };
      });
      const plan: CompensationPlan = {
        startYear: raw.startYear,
        baseSalaryStart: raw.baseSalaryStart,
        rsuGrant: raw.rsuGrant,
        years: clampedYears,
        disableWithholdingTax: raw.disableWithholdingTax,
        ...(raw.fxRate !== undefined ? { fxRate: raw.fxRate } : {}),
        ...(raw.stockPriceUsd !== undefined ? { stockPriceUsd: raw.stockPriceUsd } : {}),
      };
      return plan;
    });
}

// ---------------- Properties ----------------

describe('PBT', () => {
  // Feature: amazon-annual-compensation-viewer, Property 1: Serializer round-trip
  it('Property 1: Serializer round-trip', () => {
    fc.assert(
      fc.property(arbPlan(), (plan) => {
        const raw = stringifyPlan(plan);
        const parsed = parsePlan(raw);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(parsed.plan).toEqual(plan);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 2: Withholding_Tax monotonic & non-negative
  it('Property 2: Withholding 非负、单调非递减、级距边界连续', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 5_000_000, noNaN: true, noDefaultInfinity: true }),
        (x, y) => {
          const a = Math.min(x, y);
          const b = Math.max(x, y);
          const ta = computeWithholdingTax(a);
          const tb = computeWithholdingTax(b);
          expect(ta).toBeGreaterThanOrEqual(0);
          expect(tb).toBeGreaterThanOrEqual(ta - 0.01); // 浮点容忍
        },
      ),
      { numRuns: NUM_RUNS },
    );

    // 额外：级距上界的连续性测试
    for (const bracket of TAX_BRACKETS) {
      if (bracket.upperBound === null) continue;
      const before = computeWithholdingTax(bracket.upperBound);
      const after = computeWithholdingTax(bracket.upperBound + 0.001);
      expect(Math.abs(after - before)).toBeLessThanOrEqual(0.01);
    }
  });

  // Feature: amazon-annual-compensation-viewer, Property 3: Withholding_Tax independent of Base/Sign-on
  it('Property 3: Withholding 仅依赖 RSU 应税额', () => {
    fc.assert(
      fc.property(
        arbPlan({ fxRate: 'required', stockPriceUsd: 'required' }),
        finiteNonNeg,
        fc.array(pct, { minLength: 1, maxLength: 10 }),
        fc.array(finiteNonNeg, { minLength: 1, maxLength: 10 }),
        (base, otherBase, otherRaises, otherSignOns) => {
          const p2: CompensationPlan = {
            ...base,
            baseSalaryStart: otherBase,
            years: base.years.map((y, i) => ({
              ...y,
              raiseRate: otherRaises[i % otherRaises.length] ?? y.raiseRate,
              signOnBonus: otherSignOns[i % otherSignOns.length] ?? y.signOnBonus,
            })),
          };
          const a = computeAnnualCompensation(base).map((y) => y.withholdingTaxCny);
          const b = computeAnnualCompensation(p2).map((y) => y.withholdingTaxCny);
          expect(b).toEqual(a);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 4: Taxable_RSU_Income equation
  it('Property 4: Taxable_RSU_Income 等式', () => {
    fc.assert(
      fc.property(
        arbPlan({ fxRate: 'required', stockPriceUsd: 'required' }),
        (plan) => {
          const rows = computeAnnualCompensation(plan);
          rows.forEach((row, i) => {
            const y = plan.years[i]!;
            const fmv = y.vestingFmvUsd ?? plan.stockPriceUsd!;
            const expected = round2(row.vestedShares * fmv * plan.fxRate!);
            expect(row.taxableRsuIncomeCny).toBeCloseTo(expected, 2);
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 5: Capital_Gains_Tax non-negative, homogeneous, loss→0
  it('Property 5: Capital_Gains_Tax 非负 + 齐次性 + 亏损归零', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 1_000 }),
        fc.double({ min: 0.01, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 50 }),
        (sell, cost, qty, fx, n) => {
          const tax = computeCapitalGainsTaxCny(sell, cost, qty, fx);
          expect(tax).toBeGreaterThanOrEqual(0);

          if (sell <= cost) {
            expect(tax).toBe(0);
          } else {
            // 齐次性（浮点容忍：近似 n 倍）
            const scaled = computeCapitalGainsTaxCny(sell, cost, n * qty, fx);
            const expected = n * tax;
            // 放宽到 0.5 CNY 容忍（舍入累计）
            expect(Math.abs(scaled - expected)).toBeLessThanOrEqual(
              Math.max(0.5, expected * 1e-9),
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 6: Stock_Value equation + FX monotonicity
  it('Property 6: Stock_Value 等式 + FX 单调性', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 20, noNaN: true, noDefaultInfinity: true }),
        (v, p, fxA, fxB) => {
          const a = Math.min(fxA, fxB);
          const b = Math.max(fxA, fxB);
          expect(computeStockValueCny(v, p, a)).toBe(round2(v * p * a));
          expect(computeStockValueCny(v, p, a)).toBeLessThanOrEqual(
            computeStockValueCny(v, p, b) + 0.01,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 7: projectBaseSalaries recurrence & non-decreasing
  it('Property 7: projectBaseSalaries 递推 + 非递减', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: 0,
          max: 10_000_000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        fc.array(pct, { minLength: 1, maxLength: 20 }),
        (startBase, raises) => {
          const bases = projectBaseSalaries(startBase, raises);
          expect(bases.length).toBe(raises.length);
          let prev = startBase;
          bases.forEach((b, i) => {
            const expected = prev * (1 + raises[i]! / 100);
            // 浮点 + round2 容忍，按值大小放宽
            expect(Math.abs(b - expected)).toBeLessThanOrEqual(
              Math.max(0.01, Math.abs(expected) * 1e-6),
            );
            expect(b).toBeGreaterThanOrEqual(prev - 0.01);
            prev = b;
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 8: Vested_Shares conservation
  it('Property 8: Vested_Shares 守恒', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(pct, { minLength: 1, maxLength: 10 }),
        (grant, pcts) => {
          // 归一化 Σ ≤ 100
          const total = pcts.reduce((s, p) => s + p, 0);
          const normalized = total > 100 ? pcts.map((p) => (p * 100) / total) : pcts;
          let sum = 0;
          for (const p of normalized) {
            const v = computeVestedShares(grant, p);
            expect(v).toBeCloseTo((grant * p) / 100, 6);
            sum += v;
          }
          expect(sum).toBeLessThanOrEqual(grant + 1e-6);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 9: Gross additivity
  it('Property 9: Gross = Base + Sign-on + Stock + Total_Allowances', () => {
    fc.assert(
      fc.property(
        arbPlan({ fxRate: 'required', stockPriceUsd: 'required' }),
        (plan) => {
          const rows = computeAnnualCompensation(plan);
          for (const row of rows) {
            if (row.grossAnnualCny === null || row.stockValueCny === null) continue;
            const expected = round2(
              row.baseSalaryCny +
                row.signOnBonusCny +
                row.stockValueCny +
                row.totalAllowancesCny,
            );
            expect(row.grossAnnualCny).toBeCloseTo(expected, 2);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 10: Net equation
  it('Property 10: Net = Gross − Withholding', () => {
    fc.assert(
      fc.property(
        arbPlan({ fxRate: 'required', stockPriceUsd: 'required' }),
        (plan) => {
          const rows = computeAnnualCompensation(plan);
          for (const row of rows) {
            if (row.grossAnnualCny === null || row.withholdingTaxCny === null)
              continue;
            if (row.netAnnualCny === null) continue;
            expect(row.netAnnualCny).toBeCloseTo(
              row.grossAnnualCny - row.withholdingTaxCny,
              2,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 11: Missing FX or price ⇒ null stock value
  it('Property 11: 缺 FX 或 股价 ⇒ Stock_Value 全 null', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbPlan({ fxRate: 'absent' }),
          arbPlan({ stockPriceUsd: 'absent' }),
        ),
        (plan) => {
          const rows = computeAnnualCompensation(plan);
          for (const row of rows) {
            expect(row.stockValueCny).toBeNull();
            expect(row.withholdingTaxCny).toBeNull();
            expect(row.grossAnnualCny).toBeNull();
            expect(row.netAnnualCny).toBeNull();
            expect(row.warnings).toContain('数据不完整');
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 12: Oversell rejected
  it('Property 12: 超额卖出 schema 拒绝', () => {
    fc.assert(
      fc.property(
        arbPlan({ fxRate: 'required', stockPriceUsd: 'required' }),
        fc.integer({ min: 1, max: 100 }),
        (plan, excess) => {
          if (plan.years.length === 0) return;
          // 找一个 vested > 0 的年度；若都是 0，改 rsuGrant 以确保至少一年可超
          let grant = plan.rsuGrant;
          let yearIdx = plan.years.findIndex((y) => y.vestingPct > 0);
          if (yearIdx < 0) {
            yearIdx = 0;
            plan = {
              ...plan,
              years: plan.years.map((y, i) =>
                i === 0 ? { ...y, vestingPct: 10 } : y,
              ),
              rsuGrant: Math.max(grant, 10),
            };
            grant = plan.rsuGrant;
          }
          const year = plan.years[yearIdx]!;
          const vested = computeVestedShares(grant, year.vestingPct);
          const overSellQty = Math.floor(vested) + excess;
          const newPlan: CompensationPlan = {
            ...plan,
            years: plan.years.map((y, i) =>
              i === yearIdx
                ? { ...y, sells: [{ sellPriceUsd: 100, sellQuantity: overSellQty }] }
                : y,
            ),
          };
          const res = validatePlanSells(newPlan);
          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.issues[0]?.path).toEqual(['years', yearIdx, 'sells']);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 13: 2028+ expiry warning
  it('Property 13: year ≥ 2028 且 stockValue ≠ null ⇒ 含优惠到期提醒', () => {
    fc.assert(
      fc.property(
        arbPlan({
          fxRate: 'required',
          stockPriceUsd: 'required',
          minYears: 3,
          maxYears: 8,
          startYearMin: 2025,
          startYearMax: 2030,
        }),
        (plan) => {
          const rows = computeAnnualCompensation(plan);
          for (const row of rows) {
            if (row.year >= 2028 && row.stockValueCny !== null) {
              expect(row.warnings).toContain('优惠政策到期提醒');
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 14: Allowances don't affect Withholding_Tax
  it('Property 14: 补贴变化不影响 Withholding_Tax', () => {
    fc.assert(
      fc.property(
        arbPlan({ fxRate: 'required', stockPriceUsd: 'required' }),
        fc.array(fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.array(fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.array(fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }), {
          minLength: 1,
          maxLength: 20,
        }),
        (base, meals, miscs, housings) => {
          const p2: CompensationPlan = {
            ...base,
            years: base.years.map((y, i) => ({
              ...y,
              mealAllowance: meals[i % meals.length],
              miscellaneousAllowance: miscs[i % miscs.length],
              housingAllowance: housings[i % housings.length],
            })),
          };
          const a = computeAnnualCompensation(base).map((y) => y.withholdingTaxCny);
          const b = computeAnnualCompensation(p2).map((y) => y.withholdingTaxCny);
          expect(b).toEqual(a);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 15: Total_Allowances sum
  it('Property 15: Total_Allowances = Meal + Misc + Housing', () => {
    fc.assert(
      fc.property(arbPlan(), (plan) => {
        const rows = computeAnnualCompensation(plan);
        for (const row of rows) {
          const expected = round2(
            row.mealAllowanceCny + row.miscellaneousAllowanceCny + row.housingAllowanceCny,
          );
          expect(row.totalAllowancesCny).toBeCloseTo(expected, 2);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: amazon-annual-compensation-viewer, Property 16: Allowance defaults
  it('Property 16: allowance 全部 undefined ⇒ 使用默认值', () => {
    fc.assert(
      fc.property(
        arbPlan({ minYears: 1, maxYears: 10 }).map((plan): CompensationPlan => ({
          ...plan,
          years: plan.years.map((y) => {
            const stripped: YearInput = {
              raiseRate: y.raiseRate,
              signOnBonus: y.signOnBonus,
              vestingPct: y.vestingPct,
              sells: y.sells as SellRecord[],
              ...(y.vestingFmvUsd !== undefined
                ? { vestingFmvUsd: y.vestingFmvUsd }
                : {}),
            };
            return stripped;
          }),
        })),
        (plan) => {
          const rows = computeAnnualCompensation(plan);
          rows.forEach((row, i) => {
            expect(row.mealAllowanceCny).toBe(MEAL_ALLOWANCE_DEFAULT_CNY);
            expect(row.miscellaneousAllowanceCny).toBe(MISC_ALLOWANCE_DEFAULT_CNY);
            expect(row.housingAllowanceCny).toBe(
              defaultHousingAllowanceForYearIndex(i),
            );
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
