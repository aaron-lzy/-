import { z } from 'zod';

// ---------- 输入：单笔卖出（R8） ----------
export const SellRecordSchema = z.object({
  sellPriceUsd: z.number().finite().nonnegative(),
  sellQuantity: z.number().int().nonnegative(),
});
export type SellRecord = z.infer<typeof SellRecordSchema>;

// ---------- 输入：单个年度 ----------
export const YearInputSchema = z.object({
  // 相对上一年度的 raise 百分比；首年可为 0
  raiseRate: z.number().finite().min(0).max(100),
  // 该年度 Sign-on（CNY）
  signOnBonus: z.number().finite().nonnegative(),
  // 该年度 vesting 比例（百分数 0–100）
  vestingPct: z.number().finite().min(0).max(100),
  // 该年度 vesting 当日 FMV（USD/股）；未提供则兜底为当前 Stock_Price
  vestingFmvUsd: z.number().finite().positive().optional(),
  // 该年度的卖出记录
  sells: z.array(SellRecordSchema).default([]),
  // R12：三项年度免税补贴（CNY）。均为可选——未提供时由 Core 层根据规则填充默认值
  // （Housing 的默认值依赖年度序号，因此不使用 Zod 的 `.default()`）。
  mealAllowance: z.number().finite().nonnegative().optional(),
  miscellaneousAllowance: z.number().finite().nonnegative().optional(),
  housingAllowance: z.number().finite().nonnegative().optional(),
});
export type YearInput = z.infer<typeof YearInputSchema>;

// ---------- Compensation Plan ----------
export const CompensationPlanSchema = z
  .object({
    startYear: z.number().int().min(2000).max(2100),
    baseSalaryStart: z.number().finite().nonnegative(),
    rsuGrant: z.number().int().nonnegative(),
    // R5 AC 2：FX_Rate 使用前必须存在
    fxRate: z.number().finite().positive().optional(),
    // R4 AC 2：Stock_Price 使用前必须存在（由 User 手动输入）
    stockPriceUsd: z.number().finite().positive().optional(),
    years: z.array(YearInputSchema).min(1),
    // R7 AC 7：关闭代扣税
    disableWithholdingTax: z.boolean().default(false),
  })
  .superRefine((plan, ctx) => {
    const total = plan.years.reduce((s, y) => s + y.vestingPct, 0);
    if (total > 100 + 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['years'],
        message: `Vesting 百分比之和 ${total}% 超过 100%`,
      });
    }
  });
export type CompensationPlan = z.infer<typeof CompensationPlanSchema>;

// ---------- 持久化信封（版本化） ----------
export const PersistedEnvelopeSchema = z.object({
  version: z.literal(1),
  plan: CompensationPlanSchema,
});
export type PersistedEnvelope = z.infer<typeof PersistedEnvelopeSchema>;

// ---------- 单笔卖出的计算结果 ----------
export interface CapitalGainsEntry {
  sellPriceUsd: number;
  sellQuantity: number;
  costBasisUsd: number;
  capitalGainsUsdRaw: number; // 未取 max(0, …)
  capitalGainsTaxCny: number; // 应纳税额（取 max 0 后）
}

// ---------- 年度计算结果 ----------
export interface ComputedYear {
  year: number; // 绝对年份
  baseSalaryCny: number;
  signOnBonusCny: number;
  vestedShares: number;
  stockValueCny: number | null; // FX_Rate 或 Stock_Price 缺失时为 null（R4 AC 3 / R5 AC 3）
  taxableRsuIncomeCny: number | null;
  withholdingTaxCny: number | null;
  // R12：三项免税补贴与其合计（CNY）。不依赖 FX_Rate / Stock_Price，始终非 null。
  mealAllowanceCny: number;
  miscellaneousAllowanceCny: number;
  housingAllowanceCny: number;
  totalAllowancesCny: number;
  grossAnnualCny: number | null;
  // R12 设计决策：当 `stockValueCny === null`（FX_Rate 或 Stock_Price 缺失）时，
  // 仍可给出不含 Stock 的部分 gross，便于 UI 展示部分薪酬信息。
  // `grossAnnualCny` 的空/非空语义保持不变（仍表示完整 gross）。
  partialGrossWithoutStockCny: number;
  netAnnualCny: number | null;
  capitalGains: CapitalGainsEntry[];
  warnings: string[]; // 例如 "优惠政策到期提醒"、"数据不完整"、"缺少股价"、"缺少汇率"
}

// ---------- 税率级距常量 ----------
export interface TaxBracket {
  upperBound: number | null; // CNY；null 表示 +∞
  rate: number; // 0–1
  quickDeduction: number; // CNY
}
