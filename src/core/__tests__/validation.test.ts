import { describe, expect, it } from 'vitest';
import { validatePlan, validatePlanSells } from '../validation';
import type { CompensationPlan } from '../../types';

// Feature: amazon-annual-compensation-viewer
// Unit tests for src/core/validation.ts

const basePlan: CompensationPlan = {
  startYear: 2026,
  baseSalaryStart: 400_000,
  rsuGrant: 100,
  fxRate: 7.2,
  stockPriceUsd: 180,
  years: [
    { raiseRate: 0, signOnBonus: 0, vestingPct: 5, sells: [] },
    { raiseRate: 5, signOnBonus: 0, vestingPct: 15, sells: [] },
  ],
  disableWithholdingTax: false,
};

describe('validatePlanSells（R8 AC 4）', () => {
  it('不超额 → ok', () => {
    const plan: CompensationPlan = {
      ...basePlan,
      years: basePlan.years.map((y, i) =>
        i === 0 ? { ...y, sells: [{ sellPriceUsd: 200, sellQuantity: 3 }] } : y,
      ),
    };
    const res = validatePlanSells(plan);
    expect(res.ok).toBe(true);
  });

  it('超过已确权 → ok=false，错误 path 指向 years.i.sells', () => {
    const plan: CompensationPlan = {
      ...basePlan,
      rsuGrant: 100,
      years: basePlan.years.map((y, i) =>
        // Year 0 vestingPct=5% → vested=5；卖 10 超额
        i === 0 ? { ...y, sells: [{ sellPriceUsd: 200, sellQuantity: 10 }] } : y,
      ),
    };
    const res = validatePlanSells(plan);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const issue = res.issues[0];
      expect(issue?.path).toEqual(['years', 0, 'sells']);
    }
  });
});

describe('validatePlan 全流程校验', () => {
  it('合法 plan → ok', () => {
    const res = validatePlan(basePlan);
    expect(res.ok).toBe(true);
  });

  it('Σ vestingPct > 100 → ok=false', () => {
    const res = validatePlan({
      ...basePlan,
      years: [
        { raiseRate: 0, signOnBonus: 0, vestingPct: 70, sells: [] },
        { raiseRate: 0, signOnBonus: 0, vestingPct: 40, sells: [] },
      ],
    });
    expect(res.ok).toBe(false);
  });

  it('Base 为负数 → ok=false', () => {
    const res = validatePlan({ ...basePlan, baseSalaryStart: -1 });
    expect(res.ok).toBe(false);
  });

  it('RSU 非整数 → ok=false', () => {
    const res = validatePlan({ ...basePlan, rsuGrant: 1.5 });
    expect(res.ok).toBe(false);
  });

  it('FX_Rate 为 0 → ok=false', () => {
    const res = validatePlan({ ...basePlan, fxRate: 0 });
    expect(res.ok).toBe(false);
  });

  it('Raise 超出 [0, 100] → ok=false', () => {
    const res = validatePlan({
      ...basePlan,
      years: [
        { raiseRate: 120, signOnBonus: 0, vestingPct: 5, sells: [] },
        { raiseRate: 0, signOnBonus: 0, vestingPct: 5, sells: [] },
      ],
    });
    expect(res.ok).toBe(false);
  });

  it('负 allowance → ok=false', () => {
    const res = validatePlan({
      ...basePlan,
      years: [
        { raiseRate: 0, signOnBonus: 0, vestingPct: 5, sells: [], mealAllowance: -1 },
        { raiseRate: 0, signOnBonus: 0, vestingPct: 15, sells: [] },
      ],
    });
    expect(res.ok).toBe(false);
  });
});
