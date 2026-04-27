# Amazon Annual Compensation Viewer

一个帮助亚马逊员工查看和估算未来若干年度总薪酬（Total Compensation）的纯前端工具。

## 功能特性

- **薪酬构成**：Base Salary（支持逐年普调） + Sign-on Bonus（分年度） + Stock（RSU vesting） + 三项免税补贴（餐饮 / 花费 / 住房）
- **税费估算**：
  - RSU 确权代扣个税：按境外上市公司股权激励**单独计税**（财税[2016]101号、公告 [2023]30号，优惠期至 2027-12-31），使用综合所得 7 档累进税率表
  - RSU 卖出资本利得税：按"财产转让所得"20%（《个人所得税法》第三条第五项）
- **Amazon 默认 vesting 模板**：一键填充 5% / 15% / 40% / 40%
- **股价与汇率**：由用户手动输入（USD → CNY），变动即时重算
- **本地持久化**：所有输入保存到浏览器 localStorage

## 在 GitHub Codespaces 中运行（推荐）

1. 把仓库推到 GitHub
2. 点 `Code` → `Codespaces` → `Create codespace on main`
3. 等待容器启动（首次约 1–2 分钟，`npm install` 会自动跑完）
4. 终端里运行：

   ```bash
   npm run dev
   ```

5. Codespaces 会自动弹出端口转发，打开浏览器预览

## 本地运行

### 先决条件

- Node.js 20 LTS 或更新版本
- npm 10+

### 启动

```bash
npm install
npm run dev
```

开发服务器会在 `http://localhost:5173` 启动。

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（带 HMR） |
| `npm run build` | 类型检查 + 构建产物到 `dist/` |
| `npm run test` | 一次性跑完所有单元测试与 Property-Based Tests |
| `npm run test:watch` | 以 watch 模式跑测试 |
| `npm run test:ui` | 启动 Vitest UI |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | 只跑 TypeScript 类型检查 |

## 项目结构

```
src/
├── core/           # 纯函数计算层（税费、vesting、薪酬汇总、序列化、校验）
├── adapters/       # localStorage 适配器
├── ui/             # React 组件 + Zustand store
└── types.ts        # Zod schema + TS 类型定义
```

## 已知限制

- **首年 raise 语义**：当前实现 `base[0] = startBase × (1 + raiseRates[0]/100)`。如果希望首年保持 `startBase`，在 UI 把 Year 1 的普调比例设为 0。
- **Vesting_FMV 兜底**：若未提供历史 FMV，计算资本利得时会用当前输入的 Stock_Price 兜底并标注"估算"。
- **localStorage 容量**：约 5MB 上限；>50 年规划 + 多笔卖出可能接近上限。
- **优惠政策到期**：2027-12-31 是境外上市公司股权激励单独计税优惠的当前截止日（依据公告 [2023]30号）。2028 及之后的年度会标注"优惠政策到期提醒"，税法变化由用户评估。
- **单独计税合并规则**：公告 [2024]2 号规定同年多次股权激励应合并计税。本工具目前仅支持单一 RSU Grant。

## 税法依据参考

计算模型依据的中国现行法规（详见 `.kiro/specs/amazon-annual-compensation-viewer/requirements.md` 的"税务政策依据"小节）：

- 财税[2016]101号：股权激励所得单独计税
- 公告 [2023]30号：将单独计税优惠延续至 2027-12-31
- 公告 [2024]2号：同年多次股权激励合并计税
- 《个人所得税法》第三条第五项：财产转让所得 20%
- 财税字[1998]61号：境内股票暂免、境外不适用
- 国税发[1994]89号 / 国税函[2009]3号：津补贴免税口径

## 文档

- 需求：`.kiro/specs/amazon-annual-compensation-viewer/requirements.md`
- 设计：`.kiro/specs/amazon-annual-compensation-viewer/design.md`
- 任务清单：`.kiro/specs/amazon-annual-compensation-viewer/tasks.md`
