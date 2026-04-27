import type { ComputedYear } from '../../types';
import { selectComputed, useStore } from '../store';

/** 格式化 CNY 金额（保留两位小数、千分位）。*/
function fmt(value: number | null, dash = '—'): string {
  if (value === null || value === undefined) return dash;
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function YearRow({ row }: { row: ComputedYear }) {
  const missingPrice = row.warnings.includes('缺少股价');
  const missingFx = row.warnings.includes('缺少汇率');
  const isIncomplete = row.stockValueCny === null;
  const expiryReminder = row.warnings.includes('优惠政策到期提醒');
  const withholdingDisabled = useStore(
    (s) => s.plan.disableWithholdingTax,
  );

  const grossCell = row.grossAnnualCny === null ? (
    <span className="result-table__degraded">
      {fmt(row.partialGrossWithoutStockCny)}
      <small> · 不含 Stock Value</small>
    </span>
  ) : (
    <span>{fmt(row.grossAnnualCny)}</span>
  );

  return (
    <>
      <tr className={isIncomplete ? 'result-table__row--incomplete' : undefined}>
        <td>{row.year}</td>
        <td>{fmt(row.baseSalaryCny)}</td>
        <td>{fmt(row.signOnBonusCny)}</td>
        <td>{fmt(row.stockValueCny)}</td>
        <td
          title={`餐饮 ${fmt(row.mealAllowanceCny)} + 花费 ${fmt(
            row.miscellaneousAllowanceCny,
          )} + 住房 ${fmt(row.housingAllowanceCny)}`}
        >
          {fmt(row.totalAllowancesCny)}
        </td>
        <td>
          {fmt(row.withholdingTaxCny)}
          {withholdingDisabled ? <small> · 已关闭</small> : null}
        </td>
        <td>{grossCell}</td>
        <td>{fmt(row.netAnnualCny)}</td>
        <td className="result-table__tags">
          {isIncomplete ? <span className="tag tag--warn">数据不完整</span> : null}
          {missingPrice ? <span className="tag">缺少股价</span> : null}
          {missingFx ? <span className="tag">缺少汇率</span> : null}
          {expiryReminder ? (
            <span className="tag tag--info" title="公告 [2023]30号 将境外上市公司股权激励单独计税优惠期延续至 2027-12-31，其后税法变化请自行评估。">
              优惠政策到期提醒
            </span>
          ) : null}
        </td>
      </tr>
      {row.capitalGains.length > 0 ? (
        <tr className="result-table__subrow">
          <td colSpan={9}>
            <strong>该年度卖出资本利得：</strong>
            <ul className="result-table__gains">
              {row.capitalGains.map((g, i) => (
                <li key={i}>
                  {g.sellQuantity} 股 @ {g.sellPriceUsd} USD（成本 {g.costBasisUsd} USD）
                  → 资本利得税 {fmt(g.capitalGainsTaxCny)} CNY
                  {g.capitalGainsUsdRaw < 0 ? (
                    <small>（亏损不得结转抵扣其他所得）</small>
                  ) : null}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * 年度结果表（R9）。列：Year / Base / Sign-on / Stock / Total_Allowances / Withholding / Gross / Net / Tags。
 */
export function ResultTable() {
  const rows = useStore(selectComputed);

  return (
    <section className="result-section">
      <h2>年度薪酬汇总</h2>
      <div className="result-table__scroll">
        <table className="result-table">
          <thead>
            <tr>
              <th>年份</th>
              <th>Base</th>
              <th>Sign-on</th>
              <th>Stock</th>
              <th>免税补贴</th>
              <th>代扣个税</th>
              <th>Gross（税前）</th>
              <th>Net（税后）</th>
              <th>提示</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <YearRow key={i} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
