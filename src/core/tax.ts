import { TAX_BRACKETS } from './constants';

/**
 * 保留两位小数（分位舍入）。
 * 内部中间量不提前调用；仅用于对外输出字段。
 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * 计算 RSU 确权代扣个人所得税（CNY）。
 *
 * R7 AC 2–3：查综合所得年度 7 档累进税率表；Withholding_Tax = 应纳税额 × Tax_Rate − Quick_Deduction；
 * 不足 0 取 0。应税额 ≤ 0 直接返回 0。
 */
export function computeWithholdingTax(taxableRsuIncomeCny: number): number {
  if (!Number.isFinite(taxableRsuIncomeCny) || taxableRsuIncomeCny <= 0) return 0;
  const bracket = TAX_BRACKETS.find(
    (b) => b.upperBound === null || taxableRsuIncomeCny <= b.upperBound,
  );
  // bracket 总是存在（最后一档 upperBound 为 null，捕获所有剩余值）
  if (!bracket) return 0;
  const tax = taxableRsuIncomeCny * bracket.rate - bracket.quickDeduction;
  return round2(Math.max(0, tax));
}

/**
 * 计算单笔 RSU 卖出的资本利得税（CNY）。
 *
 * R8 AC 2：Capital_Gains_USD = max(0, (Sell_Price − Cost_Basis) × Quantity)；
 *          Capital_Gains_Tax = Capital_Gains_USD × FX_Rate × 20%。
 * 亏损归零（不得结转），结果保留两位小数。
 */
export function computeCapitalGainsTaxCny(
  sellPriceUsd: number,
  costBasisUsd: number,
  quantity: number,
  fxRate: number,
): number {
  const gainUsd = Math.max(0, (sellPriceUsd - costBasisUsd) * quantity);
  return round2(gainUsd * fxRate * 0.2);
}
