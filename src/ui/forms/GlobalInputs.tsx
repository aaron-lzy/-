import { useStore } from '../store';
import { NumberField } from './NumberField';

/**
 * 全局输入：起始年份 / 起始 Base / RSU 总股数 / Stock_Price / FX_Rate / disableWithholdingTax。
 * 对应 R1 (baseSalaryStart) / R3 (rsuGrant) / R4 (stockPriceUsd) / R5 (fxRate) / R7 AC 7。
 */
export function GlobalInputs() {
  const plan = useStore((s) => s.plan);
  const errors = useStore((s) => s.errors);
  const setStartYear = useStore((s) => s.setStartYear);
  const setBaseSalaryStart = useStore((s) => s.setBaseSalaryStart);
  const setRsuGrant = useStore((s) => s.setRsuGrant);
  const setStockPrice = useStore((s) => s.setStockPrice);
  const setFxRate = useStore((s) => s.setFxRate);
  const toggleDisableWithholdingTax = useStore((s) => s.toggleDisableWithholdingTax);
  const applyAmazonDefaultVesting = useStore((s) => s.applyAmazonDefaultVesting);

  return (
    <section className="global-inputs">
      <h2>全局输入</h2>
      <div className="global-inputs__grid">
        <NumberField
          label="起始年份"
          value={plan.startYear}
          onCommit={(v) => setStartYear(v ?? new Date().getFullYear())}
          integer
          min={2000}
          max={2100}
          error={errors['startYear']}
        />
        <NumberField
          label="起始 Base Salary"
          value={plan.baseSalaryStart || undefined}
          onCommit={(v) => setBaseSalaryStart(v ?? 0)}
          min={0}
          suffix="CNY"
          placeholder="例如 400000"
          error={errors['baseSalaryStart']}
        />
        <NumberField
          label="RSU 总授予股数"
          value={plan.rsuGrant || undefined}
          onCommit={(v) => setRsuGrant(v ?? 0)}
          integer
          min={0}
          suffix="股"
          placeholder="例如 100"
          error={errors['rsuGrant']}
        />
        <NumberField
          label="AMZN 股价（手动输入）"
          value={plan.stockPriceUsd}
          onCommit={setStockPrice}
          min={0.01}
          suffix="USD"
          placeholder="例如 180.5"
          error={errors['stockPriceUsd']}
        />
        <NumberField
          label="USD→CNY 汇率（手动输入）"
          value={plan.fxRate}
          onCommit={setFxRate}
          min={0.01}
          placeholder="例如 7.2"
          error={errors['fxRate']}
        />
      </div>
      <div className="global-inputs__actions">
        <button type="button" onClick={applyAmazonDefaultVesting}>
          应用 Amazon 默认 Vesting（5/15/40/40）
        </button>
        <label className="global-inputs__checkbox">
          <input
            type="checkbox"
            checked={plan.disableWithholdingTax}
            onChange={toggleDisableWithholdingTax}
          />
          <span>不计算 RSU 确权代扣税</span>
        </label>
      </div>
    </section>
  );
}
