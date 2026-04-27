import type { TaxBracket } from '../types';

/**
 * 中国综合所得年度 7 档累进税率表（2019 年起实施），用于 RSU 确权代扣个税的查表。
 * 依据财税[2016]101号、公告 [2023]30号（优惠延续至 2027-12-31）：
 * 居民个人从境外上市公司取得的股权激励所得单独计税，适用本表。
 * R7 AC 2；Glossary 中的 Comprehensive_Income_Tax_Rate_Table。
 */
export const TAX_BRACKETS: readonly TaxBracket[] = [
  { upperBound: 36_000, rate: 0.03, quickDeduction: 0 },
  { upperBound: 144_000, rate: 0.1, quickDeduction: 2_520 },
  { upperBound: 300_000, rate: 0.2, quickDeduction: 16_920 },
  { upperBound: 420_000, rate: 0.25, quickDeduction: 31_920 },
  { upperBound: 660_000, rate: 0.3, quickDeduction: 52_920 },
  { upperBound: 960_000, rate: 0.35, quickDeduction: 85_920 },
  { upperBound: null, rate: 0.45, quickDeduction: 181_920 },
] as const;

/** R3 AC 8：Amazon 经典 vesting 模板（5% / 15% / 40% / 40%） */
export const DEFAULT_AMAZON_VESTING_PCT = [5, 15, 40, 40] as const;

/** R12 AC 2：餐饮补贴默认年化 = 每工作日 10 元 × 21.75 天/月 × 12 月 = 2,610 元/年 */
export const MEAL_ALLOWANCE_DEFAULT_CNY = 10 * 21.75 * 12;

/** R12 AC 3：花费补贴默认年化 = 每月 50 元 × 12 月 = 600 元/年 */
export const MISC_ALLOWANCE_DEFAULT_CNY = 50 * 12;

/**
 * R12 AC 4–5：住房补贴默认值
 * @param i 0 基索引的年度序号
 * @returns Year 1 / Year 2（i < 2）返回 6400，Year 3 及之后返回 0
 */
export function defaultHousingAllowanceForYearIndex(i: number): number {
  return i < 2 ? 6400 : 0;
}

/** R7 AC 6：境外上市公司股权激励单独计税优惠政策到期日（公告 [2023]30号） */
export const SINGLE_TAX_BENEFIT_EXPIRY = '2027-12-31';
