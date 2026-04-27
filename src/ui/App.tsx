import { useEffect } from 'react';
import './styles.css';
import { CompensationChart } from './chart/CompensationChart';
import { GlobalInputs } from './forms/GlobalInputs';
import { YearList } from './forms/YearList';
import { ResultTable } from './result/ResultTable';
import { useStore } from './store';

function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => dismiss(), 4000);
    return () => window.clearTimeout(t);
  }, [toast, dismiss]);
  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.kind}`} role="status" onClick={dismiss}>
      {toast.text}
    </div>
  );
}

export function App(): JSX.Element {
  const hydrateFromStorage = useStore((s) => s.hydrateFromStorage);
  const save = useStore((s) => s.save);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  return (
    <main className="app">
      <header className="app__header">
        <h1>Amazon 年薪可视化工具</h1>
        <p className="app__sub">
          Base + Sign-on + Stock（RSU vesting）+ 三项免税补贴，含 RSU 代扣个税与卖出资本利得税估算。
          所有数据只保存在你的浏览器里。
        </p>
        <div className="app__actions">
          <button type="button" onClick={save}>
            保存到本地
          </button>
        </div>
      </header>

      <div className="app__grid">
        <div className="app__col app__col--inputs">
          <GlobalInputs />
          <YearList />
        </div>
        <div className="app__col app__col--results">
          <ResultTable />
        </div>
      </div>

      <CompensationChart />

      <footer className="app__footer">
        <small>
          税率依据：财税[2016]101号、公告 [2023]30号（境外上市公司股权激励单独计税至 2027-12-31）、
          《个人所得税法》第三条第五项（财产转让 20%）、财税字[1998]61号（境外股票不适用暂免）。
          本工具仅用于估算，不构成税务建议。
        </small>
      </footer>

      <Toast />
    </main>
  );
}
