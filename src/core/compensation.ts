import type { CapitalGainsEntry, CompensationPlan, ComputedYear } from '../types';
import {
  MEAL_ALLOWANCE_DEFAULT_CNY,
  MISC_ALLOWANCE_DEFAULT_CNY,
  defaultHousingAllowanceForYearIndex,
} from './constants';
import { computeCapitalGainsTaxCny, computeWithholdingTax, round2 } from './tax';
import { computeVestedShares } from './vesting';

/**
 * 按年度逐年复利推算 Base Salary 序列。
 * R1 AC 3：bases[i] = bases[i-1] × (1 + raiseRates[i] / 100)
 * 首年亦按此规则（如需"首年 = startBase"，UI 应令 years[0].raiseRate = 0）。
 */
export function projectBaseSalaries(startBase: number, raiseRates: number[]): number[] {
  const out: number[] = [];
  let current = startBase;
  for (const r of raiseRates) {
    current = current * (1 + r / 100);
    out.push(round2(current));
  }
  return out;
}

/**
 * 计算某一年度的 Stock_Value（CNY）= Vested_Shares × Stock_Price(USD) × FX_Rate。
 * R6 AC 1
 */
export function computeStockValueCny(
  vestedShares: number,
  stockPriceUsd: number,
  fxRate: number,
): number {
  return round2(vestedShares * stockPriceUsd * fxRate);
}

/**
 * 主算子：按 Compensation_Plan 计算每一年度的薪酬与税费摘要。
 *
 * 参见 design.md "Core Computation" 与 requirements.md R1–R12。
 * 股价与汇率均为 plan 上的 optional 字段，由 User 手动输入；任一缺失时对应派生量置 null 并
 * 追加 warnings。
 */
export function computeAnnualCompensation(plan: CompensationPlan): ComputedYear[] {
  const raiseRates = plan.years.map((y) => y.raiseRate);
  const baseSeries = projectBaseSalaries(plan.baseSalaryStart, raiseRates);

  const stockPriceUsd = plan.stockPriceUsd; // R4：User 手动输入
  const fxRate = plan.fxRate; // R5：User 手动输入

  return plan.years.map((y, i): ComputedYear => {
    const year = plan.startYear + i;
    const baseSalaryCny = baseSeries[i] ?? 0;
    const vestedShares = computeVestedShares(plan.rsuGrant, y.vestingPct);
    const warnings: string[] = [];

    // R12：三项免税补贴（始终可得，与 FX_Rate / Stock_Price 无关）
    const mealAllowanceCny = y.mealAllowance ?? MEAL_ALLOWANCE_DEFAULT_CNY;
    const miscellaneousAllowanceCny = y.miscellaneousAllowance ?? MISC_ALLOWANCE_DEFAULT_CNY;
    const housingAllowanceCny = y.housingAllowance ?? defaultHousingAllowanceForYearIndex(i);
    const totalAllowancesCny = round2(
      mealAllowanceCny + miscellaneousAllowanceCny + housingAllowanceCny,
    );

    const missingFx = fxRate === undefined;
    const missingPrice = stockPriceUsd === undefined;

    let stockValueCny: number | null = null;
    let taxableRsuIncomeCny: number | null = null;
    let withholdingTaxCny: number | null = null;

    if (!missingFx && !missingPrice) {
      stockValueCny = computeStockValueCny(vestedShares, stockPriceUsd, fxRate);
      // R7 AC 1：Taxable_RSU_Income = Vested_Shares × Vesting_FMV × FX_Rate
      // Vesting_FMV 缺失时兜底为当前 Stock_Price（Glossary 约定，UI 会标注"估算"）
      const fmv = y.vestingFmvUsd ?? stockPriceUsd;
      taxableRsuIncomeCny = round2(vestedShares * fmv * fxRate);
      // Allowances 不并入 Taxable_RSU_Income（R12 AC 8 / R7 AC 4）
      withholdingTaxCny = plan.disableWithholdingTax
        ? 0
        : computeWithholdingTax(taxableRsuIncomeCny);
      // R7 AC 6：优惠政策 2027-12-31 到期，之后年度仍按相同公式计算但标记提醒
      if (year >= 2028) warnings.push('优惠政策到期提醒');
    } else {
      // R4 AC 3 / R5 AC 3：缺股价或缺汇率时无法计算 Stock_Value
      warnings.push('数据不完整');
      if (missingPrice) warnings.push('缺少股价');
      if (missingFx) warnings.push('缺少汇率');
    }

    // 资本利得（R8）：对每笔 sells 生成一条 CapitalGainsEntry
    const capitalGains: CapitalGainsEntry[] = y.sells.map((s) => {
      // R8 AC 2：Cost_Basis_Per_Share_USD = 该年度的 Vesting_FMV；缺失时兜底为当前 Stock_Price
      const costBasisUsd = y.vestingFmvUsd ?? stockPriceUsd ?? 0;
      return {
        sellPriceUsd: s.sellPriceUsd,
        sellQuantity: s.sellQuantity,
        costBasisUsd,
        capitalGainsUsdRaw: (s.sellPriceUsd - costBasisUsd) * s.sellQuantity,
        capitalGainsTaxCny: missingFx
          ? 0
          : computeCapitalGainsTaxCny(s.sellPriceUsd, costBasisUsd, s.sellQuantity, fxRate),
      };
    });

    // R9 AC 1：Gross = Base + Sign-on + Stock + Total_Allowances（需 stockValueCny 非 null）
    const grossAnnualCny =
      stockValueCny === null
        ? null
        : round2(baseSalaryCny + y.signOnBonus + stockValueCny + totalAllowancesCny);

    // R12 设计决策：partialGrossWithoutStockCny 始终可得，UI 在 stockValueCny 缺失时展示
    const partialGrossWithoutStockCny = round2(
      baseSalaryCny + y.signOnBonus + totalAllowancesCny,
    );

    // R9 AC 2：Net = Gross − Withholding（两者任一为 null 时 Net 置 null）
    const netAnnualCny =
      grossAnnualCny === null || withholdingTaxCny === null
        ? null
        : round2(grossAnnualCny - withholdingTaxCny);

    return {
      year,
      baseSalaryCny,
      signOnBonusCny: y.signOnBonus,
      vestedShares,
      stockValueCny,
      taxableRsuIncomeCny,
      withholdingTaxCny,
      mealAllowanceCny,
      miscellaneousAllowanceCny,
      housingAllowanceCny,
      totalAllowancesCny,
      grossAnnualCny,
      partialGrossWithoutStockCny,
      netAnnualCny,
      capitalGains,
      warnings,
    };
  });
}
