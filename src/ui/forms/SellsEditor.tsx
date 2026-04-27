import { useState } from 'react';
import { useStore } from '../store';
import { NumberField } from './NumberField';

export interface SellsEditorProps {
  yearIdx: number;
}

/**
 * 单年度卖出记录编辑器（R8）。
 * 每笔卖出独立行：sellPriceUsd / sellQuantity；跨字段校验"不得超过已确权股数"在 store 层完成。
 */
export function SellsEditor({ yearIdx }: SellsEditorProps) {
  const sells = useStore((s) => s.plan.years[yearIdx]?.sells ?? []);
  const errors = useStore((s) => s.errors);
  const addSell = useStore((s) => s.addSell);
  const updateSell = useStore((s) => s.updateSell);
  const removeSell = useStore((s) => s.removeSell);

  const [draftPrice, setDraftPrice] = useState<number | undefined>(undefined);
  const [draftQty, setDraftQty] = useState<number | undefined>(undefined);

  const err = (field: string) => errors[`years.${yearIdx}.${field}`];
  const sellsError = err('sells');

  const handleAdd = () => {
    if (draftPrice === undefined || draftQty === undefined) return;
    addSell(yearIdx, { sellPriceUsd: draftPrice, sellQuantity: draftQty });
    setDraftPrice(undefined);
    setDraftQty(undefined);
  };

  return (
    <div className="sells-editor">
      <h4>该年度卖出记录</h4>
      {sellsError ? <p className="sells-editor__error">{sellsError}</p> : null}
      {sells.length === 0 ? <p className="sells-editor__empty">暂无卖出记录</p> : null}
      <ul className="sells-editor__list">
        {sells.map((s, i) => (
          <li key={i} className="sells-editor__item">
            <NumberField
              label="卖出单价"
              value={s.sellPriceUsd}
              onCommit={(v) =>
                updateSell(yearIdx, i, { ...s, sellPriceUsd: v ?? 0 })
              }
              min={0}
              suffix="USD"
              error={err(`sells.${i}.sellPriceUsd`)}
            />
            <NumberField
              label="卖出股数"
              value={s.sellQuantity}
              onCommit={(v) =>
                updateSell(yearIdx, i, { ...s, sellQuantity: v ?? 0 })
              }
              integer
              min={0}
              suffix="股"
              error={err(`sells.${i}.sellQuantity`)}
            />
            <button type="button" onClick={() => removeSell(yearIdx, i)}>
              删除
            </button>
          </li>
        ))}
      </ul>
      <div className="sells-editor__add">
        <NumberField
          label="新增 · 单价"
          value={draftPrice}
          onCommit={setDraftPrice}
          min={0}
          suffix="USD"
        />
        <NumberField
          label="新增 · 股数"
          value={draftQty}
          onCommit={setDraftQty}
          integer
          min={0}
          suffix="股"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={draftPrice === undefined || draftQty === undefined}
        >
          添加卖出
        </button>
      </div>
      <p className="sells-editor__note">
        提示：卖出亏损不得结转抵扣其他所得（依据《个人所得税法》第三条第五项，境外股票按财产转让所得 20% 计征）。
      </p>
    </div>
  );
}
