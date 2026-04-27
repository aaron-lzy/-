import {
  MEAL_ALLOWANCE_DEFAULT_CNY,
  MISC_ALLOWANCE_DEFAULT_CNY,
  defaultHousingAllowanceForYearIndex,
} from '../../core/constants';
import { useStore } from '../store';
import { NumberField } from './NumberField';
import { SellsEditor } from './SellsEditor';

export interface YearRowProps {
  yearIdx: number;
}

/**
 * 单一年度输入行：raiseRate / signOn / vestingPct / vestingFmv / 三项 allowance / 卖出编辑器。
 * 对应 R1–R3、R8、R12。
 */
export function YearRow({ yearIdx }: YearRowProps) {
  const year = useStore((s) => s.plan.years[yearIdx]);
  const absoluteYear = useStore((s) => s.plan.startYear + yearIdx);
  const errors = useStore((s) => s.errors);
  const setYearField = useStore((s) => s.setYearField);

  if (!year) return null;

  const err = (field: string) => errors[`years.${yearIdx}.${field}`];

  const housingDefault = defaultHousingAllowanceForYearIndex(yearIdx);

  return (
    <details className="year-row" open>
      <summary>
        Year {yearIdx + 1} ({absoluteYear})
      </summary>
      <div className="year-row__grid">
        <NumberField
          label="普调比例"
          value={year.raiseRate === 0 ? undefined : year.raiseRate}
          onCommit={(v) => setYearField(yearIdx, 'raiseRate', v ?? 0)}
          min={0}
          max={100}
          suffix="%"
          placeholder="0"
          error={err('raiseRate')}
        />
        <NumberField
          label="Sign-on Bonus"
          value={year.signOnBonus === 0 ? undefined : year.signOnBonus}
          onCommit={(v) => setYearField(yearIdx, 'signOnBonus', v ?? 0)}
          min={0}
          suffix="CNY"
          placeholder="0"
          error={err('signOnBonus')}
        />
        <NumberField
          label="Vesting 比例"
          value={year.vestingPct === 0 ? undefined : year.vestingPct}
          onCommit={(v) => setYearField(yearIdx, 'vestingPct', v ?? 0)}
          min={0}
          max={100}
          suffix="%"
          placeholder="0"
          error={err('vestingPct')}
        />
        <NumberField
          label="Vesting 当日 FMV（可选）"
          value={year.vestingFmvUsd}
          onCommit={(v) => setYearField(yearIdx, 'vestingFmvUsd', v)}
          min={0.01}
          suffix="USD"
          placeholder="留空则用当前股价估算"
          error={err('vestingFmvUsd')}
        />
        <NumberField
          label="餐饮补贴（免税）"
          value={year.mealAllowance}
          onCommit={(v) => setYearField(yearIdx, 'mealAllowance', v)}
          min={0}
          suffix="CNY"
          placeholder={`默认 ${MEAL_ALLOWANCE_DEFAULT_CNY}`}
          error={err('mealAllowance')}
        />
        <NumberField
          label="花费补贴（免税）"
          value={year.miscellaneousAllowance}
          onCommit={(v) => setYearField(yearIdx, 'miscellaneousAllowance', v)}
          min={0}
          suffix="CNY"
          placeholder={`默认 ${MISC_ALLOWANCE_DEFAULT_CNY}`}
          error={err('miscellaneousAllowance')}
        />
        <NumberField
          label="住房补贴（免税）"
          value={year.housingAllowance}
          onCommit={(v) => setYearField(yearIdx, 'housingAllowance', v)}
          min={0}
          suffix="CNY"
          placeholder={`默认 ${housingDefault}`}
          error={err('housingAllowance')}
        />
      </div>
      <SellsEditor yearIdx={yearIdx} />
    </details>
  );
}
