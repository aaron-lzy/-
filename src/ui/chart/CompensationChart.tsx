import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { selectComputed, useStore } from '../store';

interface ChartRow {
  year: number;
  base: number;
  signOn: number;
  stock: number;
  allowances: number;
  gross: number | null;
  net: number | null;
}

/**
 * 逐年薪酬构成图（R9 AC 5）：Base / Sign-on / Stock / Allowances 堆叠柱状 + Gross/Net 折线。
 * Stock 缺失时该年度以 null 传入，Recharts 会跳过该点的 Gross/Net 折线。
 */
export function CompensationChart() {
  const rows = useStore(selectComputed);
  const data: ChartRow[] = rows.map((r) => ({
    year: r.year,
    base: r.baseSalaryCny,
    signOn: r.signOnBonusCny,
    stock: r.stockValueCny ?? 0,
    allowances: r.totalAllowancesCny,
    gross: r.grossAnnualCny,
    net: r.netAnnualCny,
  }));

  const fmt = (v: number) =>
    v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  return (
    <section className="chart-section">
      <h2>逐年薪酬构成图</h2>
      <div className="chart-section__wrap">
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis tickFormatter={fmt} />
            <Tooltip
              formatter={(value: number | null, name: string) => {
                if (value === null || value === undefined) return ['—', name];
                return [fmt(value), name];
              }}
            />
            <Legend />
            <Bar dataKey="base" stackId="gross" name="Base" fill="#4c78a8" />
            <Bar dataKey="signOn" stackId="gross" name="Sign-on" fill="#f58518" />
            <Bar dataKey="stock" stackId="gross" name="Stock" fill="#54a24b" />
            <Bar dataKey="allowances" stackId="gross" name="免税补贴" fill="#b279a2" />
            <Line
              type="monotone"
              dataKey="gross"
              name="Gross 税前"
              stroke="#e45756"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Net 税后"
              stroke="#000"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
