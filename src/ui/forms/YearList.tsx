import { useStore } from '../store';
import { YearRow } from './YearRow';

/**
 * 所有年度输入的列表 + 增删年度按钮。
 */
export function YearList() {
  const yearCount = useStore((s) => s.plan.years.length);
  const addYear = useStore((s) => s.addYear);
  const removeLastYear = useStore((s) => s.removeLastYear);

  const indices = Array.from({ length: yearCount }, (_, i) => i);

  return (
    <section className="year-list">
      <header className="year-list__header">
        <h2>按年度输入</h2>
        <div className="year-list__actions">
          <button type="button" onClick={addYear}>
            新增一年
          </button>
          <button
            type="button"
            onClick={removeLastYear}
            disabled={yearCount <= 1}
          >
            删除最后一年
          </button>
        </div>
      </header>
      <div className="year-list__items">
        {indices.map((i) => (
          <YearRow key={i} yearIdx={i} />
        ))}
      </div>
    </section>
  );
}
