import type { CompensationPlan } from '../types';
import { CompensationPlanSchema } from '../types';
import { computeVestedShares } from './vesting';

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export type ValidationResult =
  | { ok: true; plan: CompensationPlan }
  | { ok: false; issues: ValidationIssue[] };

/**
 * 跨字段校验：每个年度的 Σ sellQuantity 不得超过该年度的 Vested_Shares。
 *
 * R8 AC 4。由于该约束依赖 `rsuGrant × vestingPct / 100`，且 Vested_Shares 可能是小数
 * （虽然实操中通常是整数），此处直接比较数值；浮点容忍 1e-9。
 */
export function validatePlanSells(plan: CompensationPlan): ValidationResult {
  const issues: ValidationIssue[] = [];
  plan.years.forEach((year, i) => {
    const vested = computeVestedShares(plan.rsuGrant, year.vestingPct);
    const soldSum = year.sells.reduce((s, x) => s + x.sellQuantity, 0);
    if (soldSum > vested + 1e-9) {
      issues.push({
        path: ['years', i, 'sells'],
        message: `第 ${i + 1} 年卖出股数合计 ${soldSum} 超过已确权 ${vested} 股`,
      });
    }
  });
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, plan };
}

/**
 * 整体校验：先跑 Zod schema（含 superRefine 的 Σ vestingPct ≤ 100），
 * 再跑跨字段的卖出股数校验。
 *
 * R11 AC 2；R3 AC 6；R8 AC 4。
 */
export function validatePlan(plan: unknown): ValidationResult {
  const parsed = CompensationPlanSchema.safeParse(plan);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((x) => ({
      path: [...x.path],
      message: x.message,
    }));
    return { ok: false, issues };
  }
  return validatePlanSells(parsed.data);
}
