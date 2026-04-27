import { describe, expect, it } from 'vitest';
import { computeAnnualCompensation } from '../compensation';
import type { CompensationPlan } from '../../types';

// Feature: amazon-annual-compensation-viewer
// Unit tests for src/core/compensation.ts

function makePlan(overrides: Partial<CompensationPlan> = {}): CompensationPlan {
  return {
    startYear: 2026,
    baseSalaryStart: 400_000,
    rsuGrant: 100,
    fxRate: 7.2,
    stockPriceUsd: 180,
    years: [
      { raiseRate: 0, signOnBonus: 100_000, vestingPct: 5, sells: [] },
      { raiseRate: 5, signOnBonus: 50_000, vestingPct: 15, sells: [] },
      { raiseRate: 5, signOnBonus: 0, vestingPct: 40, sells: [] },
      { raiseRate: 5, signOnBonus: 0, vestingPct: 40, sells: [] },
    ],
    disableWithholdingTax: false,
    ...overrides,
  };
}

describe('Allowance 默认值规则', () => {
  it('三项 allowance 全部未提供时使用默认值', () => {
    const rows = computeAnnualCompensation(makePlan());
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      expect(row).toBeDefined();
      if (!row) continue;
      expect(row.mealAllowanceCny).toBe(2610);
      expect(row.miscellaneousAllowanceCny).toBe(600);
      // Housing：Y1/Y2 = 6400，Y3+ = 0
      expect(row.housingAllowanceCny).toBe(i < 2 ? 6400 : 0);
    }
  });

  it('allowance 显式提供 0 也会被采纳（非 undefined）', () => {
    const plan = makePlan();
    if (plan.years[0]) plan.years[0].housingAllowance = 0;
    const rows = computeAnnualCompensation(plan);
    expect(rows[0]?.housingAllowanceCny).toBe(0);
  });

  it('Total_Allowances = Meal + Misc + Housing', () => {
    const rows = computeAnnualCompensation(makePlan());
    for (const row of rows) {
      expect(row.totalAllowancesCny).toBeCloseTo(
        row.mealAllowanceCny + row.miscellaneousAllowanceCny + row.housingAllowanceCny,
        2,
      );
    }
  });
});

describe('FX_Rate / Stock_Price 缺失行为', () => {
  it('缺 fxRate → stockValueCny = null 且含缺失提示', () => {
    const rows = computeAnnualCompensation(makePlan({ fxRate: undefined }));
    for (const row of rows) {
      expect(row.stockValueCny).toBeNull();
      expect(row.withholdingTaxCny).toBeNull();
      expect(row.grossAnnualCny).toBeNull();
      expect(row.netAnnualCny).toBeNull();
      expect(row.warnings).toContain('数据不完整');
      expect(row.warnings).toContain('缺少汇率');
    }
  });

  it('缺 stockPriceUsd → stockValueCny = null 且含缺失提示', () => {
    const rows = computeAnnualCompensation(makePlan({ stockPriceUsd: undefined }));
    for (const row of rows) {
      expect(row.stockValueCny).toBeNull();
      expect(row.warnings).toContain('缺少股价');
    }
  });

  it('缺失时 partialGrossWithoutStockCny 仍非 null', () => {
    const rows = computeAnnualCompensation(makePlan({ stockPriceUsd: undefined }));
    const y0 = rows[0]!;
    // base(400_000) + signOn(100_000) + allowances(2610 + 600 + 6400 = 9610) = 509610
    expect(y0.partialGrossWithoutStockCny).toBeCloseTo(509610, 2);
  });
});

describe('优惠政策到期提醒（R7 AC 6）', () => {
  it('year >= 2028 且 stockValueCny !== null → warnings 含提醒', () => {
    const plan = makePlan({ startYear: 2027 }); // 覆盖 2027/2028/2029/2030
    const rows = computeAnnualCompensation(plan);
    expect(rows[0]?.warnings).not.toContain('优惠政策到期提醒'); // 2027
    expect(rows[1]?.warnings).toContain('优惠政策到期提醒'); // 2028
    expect(rows[2]?.warnings).toContain('优惠政策到期提醒'); // 2029
  });

  it('缺失数据时不标优惠到期（因 stockValue 为 null）', () => {
    const rows = computeAnnualCompensation(
      makePlan({ startYear: 2030, fxRate: undefined }),
    );
    for (const row of rows) {
      expect(row.warnings).not.toContain('优惠政策到期提醒');
    }
  });
});

describe('disableWithholdingTax 切换', () => {
  it('true 时 withholdingTax = 0', () => {
    const rows = computeAnnualCompensation(makePlan({ disableWithholdingTax: true }));
    for (const row of rows) {
      expect(row.withholdingTaxCny).toBe(0);
    }
  });
});

describe('Gross / Net 等式', () => {
  it('Gross = Base + Sign-on + Stock + Total_Allowances', () => {
    const rows = computeAnnualCompensation(makePlan());
    for (const row of rows) {
      if (row.grossAnnualCny === null || row.stockValueCny === null) continue;
      expect(row.grossAnnualCny).toBeCloseTo(
        row.baseSalaryCny +
          row.signOnBonusCny +
          row.stockValueCny +
          row.totalAllowancesCny,
        2,
      );
    }
  });

  it('Net = Gross − Withholding', () => {
    const rows = computeAnnualCompensation(makePlan());
    for (const row of rows) {
      if (
        row.grossAnnualCny === null ||
        row.withholdingTaxCny === null ||
        row.netAnnualCny === null
      )
        continue;
      expect(row.netAnnualCny).toBeCloseTo(
        row.grossAnnualCny - row.withholdingTaxCny,
        2,
      );
    }
  });
});
