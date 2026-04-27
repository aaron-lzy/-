# Requirements Document

## Introduction

本工具用于帮助亚马逊员工查看和估算未来若干年的年度总薪酬（Total Compensation, TC）构成。薪酬由三部分组成：Base Salary（基础工资）、Sign-on Bonus（签约奖金）和 Stock（RSU 确权收益）。工具支持用户手动输入每年的 Base 普调比例、分年度的 Sign-on Bonus 金额、初始授予的 RSU 总数与 vesting 计划；AMZN 股价与 USD→CNY 汇率均由用户手动输入，二者共同用于估算 Stock 部分的价值。工具同时计算 RSU 确权时的个人所得税代扣（sell-to-cover）以及 RSU 卖出后的资本利得税，帮助用户得到税前与税后年度薪酬视图。工具还支持录入三项默认按免税口径处理的补贴（餐饮、花费、住房），它们计入 Gross 与 Net，但不并入 Withholding_Tax 的计税基数。

### 已确认假设

以下决策已由 User 在需求评审中确认，作为后续设计与实现的基线：

1. **运行平台**：Web 应用。
2. **显示币种**：CNY；Stock_Price 以 USD 输入后统一换算为 CNY 展示。
3. **股价数据源**：由 User 手动输入 AMZN 的 Stock_Price（USD），工具不自动获取股价。
4. **汇率数据源**：由 User 手动输入 USD→CNY 的 FX_Rate，工具不自动获取汇率。
5. **RSU 个税算法**：居民个人从境外上市公司取得的股权激励所得（AMZN RSU 属此类），在优惠期内**不并入当年综合所得**，单独适用综合所得年度 7 档累进税率表计算个税。
6. **资本利得税**：境外上市公司股票转让所得按"财产转让所得"适用 20% 比例税率。
7. **数据持久化**：使用浏览器 localStorage 在本地持久化 Compensation_Plan。

### 税务政策依据

本工具的税务计算规则以下列中国现行法规及公告为权威依据，所有 Requirement 中涉及的税率、计税口径与优惠期安排均源自此处：

- **财税[2005]35号**《关于个人股票期权所得征收个人所得税问题的通知》：确立股权激励所得的计税框架。
- **财税[2016]101号**《关于完善股权激励和技术入股有关所得税政策的通知》：股权激励所得单独计税优惠的基础文件。
- **财政部 税务总局公告 [2023]25号**《关于延续实施全年一次性奖金个人所得税政策的公告》。
- **财政部 税务总局公告 [2023]30号**《关于上市公司股权激励有关个人所得税政策的公告》：将境内、境外上市公司股权激励所得"不并入当年综合所得、单独适用综合所得税率表"的优惠政策**延续至 2027-12-31**。
- **财政部 税务总局公告 [2024]2号**：明确同一纳税年度内取得多次股权激励所得应合并计算后再适用税率表。
- **《中华人民共和国个人所得税法》第三条第五项**：财产转让所得适用 20% 比例税率。
- **财税字[1998]61号**《关于个人转让股票所得继续暂免征收个人所得税的通知》：仅对**境内上市公司股票**的转让所得暂免征收个人所得税，境外上市公司股票（含 AMZN）不在免税范围内，须按"财产转让所得"征收 20%。
- **国税发[1994]89号**《关于印发〈征收个人所得税若干问题的规定〉的通知》：明确差旅费津贴、误餐补助等按规定标准发放的补贴可不并入工资薪金计税；定额发放并入工资薪金的需计税。
- **国税函[2009]3号**《关于企业工资薪金及职工福利费扣除问题的通知》：规范企业职工福利费的范围与处理口径。

> 说明：餐饮、花费、住房三项补贴在本工具中按 User 指定的"免税口径"处理，合规性由 User 结合自身发放形式（报销/核销 vs 定额）自行评估，本工具不做合规判定。

## Glossary

- **System**: 本薪酬查看与估算工具的整体软件系统。
- **User**: 使用本工具的亚马逊员工个人。
- **Base_Salary**: 用户每年的税前基础年薪，以 CNY 计。
- **Raise_Rate**: 用户手动输入的 Base Salary 年度普调比例，取值为非负百分数（如 3%）。
- **Sign_On_Bonus**: 用户在入职后按年获得的签约奖金；每一年度的金额独立配置，以 CNY 计。
- **RSU_Grant**: 用户一次性被授予的受限股票单位总数量（股数）。
- **Vesting_Schedule**: RSU 按年度确权的比例计划（例如 Amazon 经典 5/15/40/40）；每年一个百分数，所有年份之和不超过 100%。
- **Vested_Shares**: 某一年度依 Vesting_Schedule 实际确权的股票数量。
- **Vesting_FMV**: 某一年度 RSU 确权当日的公允市值（USD，单股），作为该批 RSU 的 Cost_Basis_Per_Share_USD。若 User 未提供历史实际 FMV，则以 User 当前输入的 Stock_Price 兜底并在界面标注"估算"。
- **Cost_Basis_Per_Share_USD**: RSU 卖出时单股计税成本（USD），等于对应 vesting 批次的 Vesting_FMV。因为 vesting 时已按股权激励所得完税，成本基础为 FMV。
- **Stock_Price**: 亚马逊股票（AMZN）的市场价格，单位为 USD，由 User 手动输入。
- **FX_Rate**: USD 到 CNY 的汇率，由 User 手动输入。
- **Stock_Value**: 某年度确权股票以 CNY 计的市值 = Vested_Shares × Stock_Price × FX_Rate.
- **Sell_To_Cover**: Amazon 在 RSU 确权时通过券商（Morgan Stanley at Work / Fidelity）自动卖出部分股票代扣个税的机制。本工具只计算 Withholding_Tax 的金额，不模拟 sell-to-cover 的具体股数分配。
- **Withholding_Tax**: RSU 确权时按股权激励所得代扣的个人所得税金额，以 CNY 计（依据财税[2016]101号 与公告 [2023]30号）。
- **Capital_Gains_Tax**: RSU 卖出时，按卖出价与 Cost_Basis_Per_Share_USD 差额估算的资本利得税金额，以 CNY 计（依据《个人所得税法》第三条第五项，境外股票适用 20%）。
- **Tax_Bracket_Table_Comprehensive**: 中国综合所得年度 7 档累进税率表，作为 Withholding_Tax 的计算依据。具体内容见 Comprehensive_Income_Tax_Rate_Table。
- **Comprehensive_Income_Tax_Rate_Table**: 2019 年起实施的综合所得年度 7 档累进税率表，作为显式常量供计算引用：

  | 级数 | 全年应纳税所得额（CNY） | Tax_Rate | Quick_Deduction（速算扣除数，CNY） |
  |------|------------------------|----------|------------------------------------|
  | 1    | 不超过 36,000          | 3%       | 0                                  |
  | 2    | 36,000 – 144,000       | 10%      | 2,520                              |
  | 3    | 144,000 – 300,000      | 20%      | 16,920                             |
  | 4    | 300,000 – 420,000      | 25%      | 31,920                             |
  | 5    | 420,000 – 660,000      | 30%      | 52,920                             |
  | 6    | 660,000 – 960,000      | 35%      | 85,920                             |
  | 7    | 超过 960,000           | 45%      | 181,920                            |

- **Gross_Annual_Compensation**: 某一年度的税前总薪酬 = Base_Salary + Sign_On_Bonus + Stock_Value + Total_Allowances。
- **Net_Annual_Compensation**: 某一年度的税后总薪酬 = Gross_Annual_Compensation − Withholding_Tax（本工具默认不在年度薪酬中减去未发生的 Capital_Gains_Tax，仅作独立展示）。
- **Meal_Allowance**: 某一年度的餐饮补贴金额（CNY），作为免税收入处理；默认值由 Meal_Allowance_Default_Formula 导出，允许 User 按年度独立覆盖。
- **Meal_Allowance_Default_Formula**: 餐饮补贴的默认年化公式 10 × 21.75 × 12 = 2,610 元/年，用于 UI 作为默认填充值。
- **Miscellaneous_Allowance**: 某一年度的花费补贴金额（CNY），作为免税收入处理；默认值为 50 × 12 = 600 元/年，允许 User 按年度独立覆盖。
- **Housing_Allowance**: 某一年度的住房补贴金额（CNY），作为免税收入处理；默认 Year 1 与 Year 2 为 6,400 元/年，其他年度默认为 0，允许 User 按年度独立覆盖。
- **Total_Allowances**: 某一年度三项免税补贴之和 = Meal_Allowance + Miscellaneous_Allowance + Housing_Allowance，单位为 CNY。
- **Compensation_Plan**: 用户保存的一套输入数据，包括 Base_Salary 起始值、各年 Raise_Rate、各年 Sign_On_Bonus、RSU_Grant、Vesting_Schedule、各年 Vesting_FMV（USD）、各年 Meal_Allowance（CNY）、各年 Miscellaneous_Allowance（CNY）、各年 Housing_Allowance（CNY）、最近一次有效的 Stock_Price（USD）以及最近一次有效的 FX_Rate。

## Requirements

### Requirement 1: 录入 Base Salary 与年度普调比例

**User Story:** 作为亚马逊员工，我想录入我的起始 Base Salary 并为每个后续年度设定一个普调比例，以便工具按年推算我的基础工资。

#### Acceptance Criteria

1. THE System SHALL 提供输入字段用于录入以 CNY 计的 Base_Salary 起始年值。
2. THE System SHALL 为 Compensation_Plan 覆盖的每个年度提供一个独立的 Raise_Rate 输入字段。
3. WHEN User 为某一年度输入 Raise_Rate，THE System SHALL 将 Raise_Rate 解释为相对于上一年度 Base_Salary 的百分比增长。
4. IF User 输入的 Raise_Rate 小于 0 或大于 100，THEN THE System SHALL 拒绝该输入并显示错误信息。
5. IF User 输入的 Base_Salary 起始年值为负数或非数字，THEN THE System SHALL 拒绝该输入并显示错误信息。
6. WHEN User 未为某一年度输入 Raise_Rate，THE System SHALL 将该年度的 Raise_Rate 取值为 0。

### Requirement 2: 录入分年度 Sign-on Bonus

**User Story:** 作为亚马逊员工，我想为每个年度单独录入 Sign-on Bonus 金额，以便反映 Amazon 通常在 Year 1 与 Year 2 分别发放不同金额的事实。

#### Acceptance Criteria

1. THE System SHALL 为 Compensation_Plan 覆盖的每个年度提供一个独立的 Sign_On_Bonus 输入字段，单位为 CNY。
2. WHEN User 未为某一年度输入 Sign_On_Bonus，THE System SHALL 将该年度的 Sign_On_Bonus 取值为 0。
3. IF User 输入的 Sign_On_Bonus 为负数或非数字，THEN THE System SHALL 拒绝该输入并显示错误信息。

### Requirement 3: 录入 RSU 授予与 Vesting Schedule

**User Story:** 作为亚马逊员工，我想录入我的 RSU 总授予数量和每年的确权比例，以便工具计算每年确权的股票数量。

#### Acceptance Criteria

1. THE System SHALL 提供输入字段用于录入 RSU_Grant 的总股数。
2. THE System SHALL 为 Compensation_Plan 覆盖的每个年度提供一个独立的 Vesting_Schedule 百分比输入字段。
3. WHEN User 为某一年度输入 Vesting_Schedule 百分比 v，THE System SHALL 将该年度的 Vested_Shares 计算为 RSU_Grant × v。
4. IF RSU_Grant 为负数或非整数，THEN THE System SHALL 拒绝该输入并显示错误信息。
5. IF 某一年度的 Vesting_Schedule 百分比小于 0 或大于 100，THEN THE System SHALL 拒绝该输入并显示错误信息。
6. IF 所有年度的 Vesting_Schedule 百分比之和大于 100，THEN THE System SHALL 拒绝该配置并显示错误信息。
7. WHEN User 未为某一年度输入 Vesting_Schedule 百分比，THE System SHALL 将该年度的 Vesting_Schedule 百分比取值为 0。
8. WHEN User 选择"Amazon 默认 vesting 模板"，THE System SHALL 用 [5%, 15%, 40%, 40%] 自动填充 4 年的 Vesting_Schedule。

### Requirement 4: 手动录入 AMZN 股价

**User Story:** 作为亚马逊员工，我想手动输入 AMZN 的当前股价，以便我可以基于自己查到的市场价（如查看 Yahoo Finance、雪球等）估算 Stock_Value。

#### Acceptance Criteria

1. THE System SHALL 提供一个输入字段用于录入 Stock_Price（USD）。
2. THE System SHALL 要求 Stock_Price 在用于 Stock_Value 计算前必须由 User 手动录入且通过校验。
3. IF User 未输入 Stock_Price，THEN THE System SHALL 在总薪酬视图中对包含 Stock_Value 的年度显示"缺少股价"标记，并阻止计算 Stock_Value。
4. IF User 输入的 Stock_Price 为负数、零或非数字，THEN THE System SHALL 拒绝该输入并显示错误信息。
5. WHEN User 更新 Stock_Price，THE System SHALL 立即用新值重新计算所有依赖 Stock_Price 的派生量（Stock_Value / Taxable_RSU_Income / Withholding_Tax / Gross_Annual_Compensation / Net_Annual_Compensation）。
6. THE System SHALL 将最近一次有效的 Stock_Price 作为 Compensation_Plan 的一部分持久化。

### Requirement 5: 手动录入 USD→CNY 汇率

**User Story:** 作为亚马逊员工，我想手动输入 USD→CNY 汇率，以便我可以基于自己信任的汇率来源估算 Stock_Value。

#### Acceptance Criteria

1. THE System SHALL 提供一个输入字段用于录入 FX_Rate（USD→CNY）。
2. THE System SHALL 要求 FX_Rate 在使用前必须由 User 手动录入且通过校验。
3. IF User 未输入 FX_Rate，THEN THE System SHALL 在总薪酬视图中对包含 Stock_Value 的年度显示"缺少汇率"标记，并阻止计算 Stock_Value。
4. IF User 输入的 FX_Rate 为负数、零或非数字，THEN THE System SHALL 拒绝该输入并显示错误信息。
5. WHEN User 更新 FX_Rate，THE System SHALL 立即用新值重新计算所有依赖 FX_Rate 的派生量（Stock_Value / Withholding_Tax / Net_Annual_Compensation）。
6. THE System SHALL 将最近一次有效的 FX_Rate 作为 Compensation_Plan 的一部分持久化。

### Requirement 6: 计算年度 Stock Value

**User Story:** 作为亚马逊员工，我想看到每一年度确权股票的市值，以便评估 RSU 对年度薪酬的贡献。

#### Acceptance Criteria

1. THE System SHALL 按公式 Stock_Value = Vested_Shares × Stock_Price × FX_Rate 计算每一年度的 Stock_Value。
2. THE System SHALL 使用 Requirement 4 中 User 手动输入的 Stock_Price 与 Requirement 5 中 User 手动输入的 FX_Rate 作为所有年度的估值输入。
3. THE System SHALL 以 CNY 显示每一年度的 Stock_Value，保留两位小数。

### Requirement 7: 计算 RSU 确权代扣个人所得税

**User Story:** 作为亚马逊员工，我想工具按中国现行税法（2027-12-31 前境外上市公司股权激励单独计税）计算每年 RSU 确权时的代扣个税，以便准确估算税后 Stock_Value。

#### Acceptance Criteria

1. WHEN 某一年度的 Vested_Shares 大于 0，THE System SHALL 按以下公式计算该年度的应纳税所得额 Taxable_RSU_Income（单位 CNY）：Taxable_RSU_Income = Vested_Shares × Vesting_FMV × FX_Rate（依据财税[2016]101号、公告 [2023]30号）。
2. THE System SHALL 使用 Glossary 中的 Comprehensive_Income_Tax_Rate_Table 查找 Taxable_RSU_Income 所在级距的 Tax_Rate 与 Quick_Deduction。
3. THE System SHALL 按公式 Withholding_Tax = Taxable_RSU_Income × Tax_Rate − Quick_Deduction 计算代扣个税；IF 上述计算结果小于 0，THEN THE System SHALL 将 Withholding_Tax 取值为 0。
4. THE System SHALL 不将 Base_Salary 与 Sign_On_Bonus 并入 Taxable_RSU_Income（因为境外上市公司股权激励在优惠期内单独计税，不并入综合所得，依据公告 [2023]30号）。
5. THE System SHALL 以 CNY 单独展示每一年度的 Withholding_Tax，保留两位小数。
6. WHEN User 设置的 vesting 年份跨越 2027-12-31，THE System SHALL 在该年度的计算结果旁显示"优惠政策到期提醒"并仍按相同公式计算（具体税法变化由 User 评估）。
7. IF User 在设置中选择"不计算代扣税"，THEN THE System SHALL 将 Withholding_Tax 置为 0 并在界面标注。

### Requirement 8: 估算 RSU 卖出后的资本利得税

**User Story:** 作为亚马逊员工，我想工具按"财产转让所得 20%"的中国税法计算 RSU 卖出后的资本利得税，以便评估卖出后的实际净收益。

#### Acceptance Criteria

1. THE System SHALL 为每一年度已确权的 RSU 提供 Sell_Price_USD（美元单价）与 Sell_Quantity（股数）的输入字段。
2. WHEN User 为某一年度输入 Sell_Price_USD 与 Sell_Quantity，THE System SHALL 按以下公式计算单笔 Capital_Gains_Tax（单位 CNY，依据《个人所得税法》第三条第五项 / 财税字[1998]61号境外股票不适用暂免）：
   - Cost_Basis_Per_Share_USD = 该年度的 Vesting_FMV
   - Capital_Gains_USD = max(0, (Sell_Price_USD − Cost_Basis_Per_Share_USD) × Sell_Quantity)
   - Capital_Gains_Tax = Capital_Gains_USD × FX_Rate × 20%
3. THE System SHALL 使用 User 当前手动输入的 FX_Rate 作为卖出汇率。
4. IF User 输入的 Sell_Quantity 大于该年度已确权但未卖出的股数，THEN THE System SHALL 拒绝该输入并显示错误信息。
5. IF User 输入的 Sell_Price_USD 或 Sell_Quantity 为负数或非数字，THEN THE System SHALL 拒绝该输入并显示错误信息。
6. THE System SHALL 以 CNY 展示每一笔 Capital_Gains_Tax，保留两位小数。
7. THE System SHALL 在 Capital_Gains_Tax 旁标注"卖出亏损不得结转抵扣其他所得"提示。

### Requirement 9: 计算并展示年度总薪酬

**User Story:** 作为亚马逊员工，我想看到每个年度的税前与税后年度总薪酬，以及三部分构成的明细，以便评估逐年收入变化。

#### Acceptance Criteria

1. THE System SHALL 按公式 Gross_Annual_Compensation = Base_Salary + Sign_On_Bonus + Stock_Value + Total_Allowances 计算每个年度的税前总薪酬。
2. THE System SHALL 按公式 Net_Annual_Compensation = Gross_Annual_Compensation − Withholding_Tax 计算每个年度的税后总薪酬。
3. THE System SHALL 在同一视图中展示每一年度的 Base_Salary、Sign_On_Bonus、Stock_Value、Total_Allowances、Withholding_Tax、Gross_Annual_Compensation 与 Net_Annual_Compensation。
4. THE System SHALL 以 CNY 展示所有金额，保留两位小数。
5. WHERE User 启用图表视图，THE System SHALL 以柱状图或折线图展示逐年的 Gross_Annual_Compensation 与 Net_Annual_Compensation。

### Requirement 10: 保存与加载 Compensation Plan

**User Story:** 作为亚马逊员工，我想保存我的输入并在下次打开工具时自动加载，以便无需每次重新录入。

#### Acceptance Criteria

1. WHEN User 点击"保存"，THE System SHALL 将当前 Compensation_Plan 持久化到浏览器 localStorage。
2. WHEN User 下次打开工具，THE System SHALL 自动加载最近保存的 Compensation_Plan。
3. IF localStorage 中的 Compensation_Plan 数据损坏或格式不符，THEN THE System SHALL 使用空白 Compensation_Plan 并提示 User 数据已重置。
4. THE Serializer SHALL 将 Compensation_Plan 序列化为 JSON 格式。
5. THE Parser SHALL 将 JSON 格式的 Compensation_Plan 反序列化为内存中的 Compensation_Plan 对象。
6. FOR ALL 有效的 Compensation_Plan 对象，先由 Serializer 序列化再由 Parser 反序列化 SHALL 产出与原始对象等价的 Compensation_Plan（round-trip 属性）。

### Requirement 11: 输入校验与错误反馈

**User Story:** 作为亚马逊员工，我想在输入错误时立刻得到明确提示，以便修正后再计算。

#### Acceptance Criteria

1. WHEN User 提交一项输入，THE System SHALL 在 500 毫秒内完成该项的格式与范围校验。
2. IF 某项输入校验失败，THEN THE System SHALL 在对应字段旁显示具体错误信息并阻止将该项并入 Compensation_Plan 的计算。
3. WHILE 存在任一校验失败的输入，THE System SHALL 在总薪酬视图中对受影响年度的计算结果显示"数据不完整"标记。

### Requirement 12: 录入年度免税补贴

**User Story:** 作为亚马逊员工，我想按年度录入餐饮补贴、花费补贴与住房补贴这三项免税收入，以便它们计入年度 Gross 与 Net，但不参与代扣个税的计算。

#### Acceptance Criteria

1. THE System SHALL 为 Compensation_Plan 覆盖的每个年度提供三个独立的补贴输入字段：Meal_Allowance、Miscellaneous_Allowance、Housing_Allowance，单位均为 CNY。
2. WHEN User 未为某一年度输入 Meal_Allowance，THE System SHALL 将该年度的 Meal_Allowance 取值为 Meal_Allowance_Default_Formula 计算结果（2,610 元/年）。
3. WHEN User 未为某一年度输入 Miscellaneous_Allowance，THE System SHALL 将该年度的 Miscellaneous_Allowance 取值为 600 元/年（50 × 12）。
4. WHEN User 未为某一年度输入 Housing_Allowance 且该年度为 Year 1 或 Year 2，THE System SHALL 将该年度的 Housing_Allowance 取值为 6,400 元/年。
5. WHEN User 未为某一年度输入 Housing_Allowance 且该年度为 Year 3 或更晚年度，THE System SHALL 将该年度的 Housing_Allowance 取值为 0。
6. IF User 输入的 Meal_Allowance、Miscellaneous_Allowance 或 Housing_Allowance 为负数或非数字，THEN THE System SHALL 拒绝该输入并显示错误信息。
7. THE System SHALL 按公式 Total_Allowances = Meal_Allowance + Miscellaneous_Allowance + Housing_Allowance 计算每一年度的免税补贴总额。
8. THE System SHALL 不将 Total_Allowances 并入 Taxable_RSU_Income 的计算（依据 Requirement 7 AC 4，Withholding_Tax 仅取 RSU 应税额）。
9. THE System SHALL 以 CNY 展示每一年度的 Meal_Allowance、Miscellaneous_Allowance、Housing_Allowance 与 Total_Allowances，保留两位小数。
