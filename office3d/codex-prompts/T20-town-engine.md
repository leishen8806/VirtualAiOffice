# T20-town-engine：「小镇生活家」经济引擎底座（纯函数 + 追加式账本 + 命令行试算，不接服务、不接界面）

**派发对象：Trae DeepSeek V4 flash。** 这是一份**边界非常清晰、公式全部写死**的任务：按下面的规格实现、用算例自检、把测试写全。**不要自作主张加功能，不确定就在汇报里写出来问，不要猜。**

先读 `_common.md`，再读知识库规划文档 `E:\VirtualAIOffice\knowledge\项目\前厅与小镇规划.md`（第四节「经济设计原则」、第七—十三节「董事会已定 / 薪资表 / 考核 / 外快 / 廉洁制度」）。**本任务的例外规则：** **只允许在 `E:\VirtualAIOffice\paperclip-ops\office3d\town\` 新建目录下新增文件**：`town-engine.mjs`、`town-config.json`、`town-ledger.mjs`、`town-cli.mjs`、`README.md`，以及测试 `E:\VirtualAIOffice\paperclip-ops\office3d\tests\town-engine.test.mjs`、`tests\town-ledger.test.mjs`。**不得修改任何已有文件**（尤其 `server.mjs`、`ui.js`、`app.js`、`workload.mjs`）；**不得向 Paperclip 或任何网络发请求**（模块里不许出现 `fetch` / `http` / `net`）；**不得读写 `town/` 之外的任何文件**（账本目录由调用方传入，测试用临时目录）；不新增依赖；不读取或输出任何密钥 / 令牌 / 真实账号；**这是纯虚拟的游戏经济，与真实金钱毫无关系**——代码、注释、变量名、文档里**不得出现「提现 / 入账 / 转账 / 钱包地址 / 兑换」这类真实账务词汇**（用「发放 / 余额 / 记账 / 消费」），也**不得出现「挖矿」二字**（娱乐型外快统一叫「矿洞探险」`mine_adventure`，且只是确定性小额记账，不做任何计算型「挖矿」）。验证时不得启动服务。

## 一、数据与单位
- 货币：**DR 币**（`DRC`），内部一律用**整数「分」**（1 DR 币 = 100 分）计算，**每个明细行四舍五入（half up）到分后再求和**，防止累计误差；对外显示两位小数。
- 时区：金边（Asia/Phnom_Penh，UTC+7）；月份用 `YYYY-MM` 字符串；统计窗口 = **自然月**。
- 公司每周 7 天上班，所以一个月的「应出勤天数」= 当月自然日数 `D`（28–31）。**计薪天数封顶 30**。

## 二、`town-config.json`（所有数字放配置，代码里不写死；测试里要断言配置被真正读取）
```json
{
  "currency": "DRC", "baseWage": 280, "payDay": 15, "payHour": 9,
  "tiers": {
    "T1": { "label": "执行岗", "monthly": 336 }, "T2": { "label": "专业岗", "monthly": 468 },
    "T3": { "label": "高级岗", "monthly": 636 }, "T4": { "label": "负责人", "monthly": 840 },
    "GA": { "label": "守门岗A", "monthly": 795, "gatekeeper": true, "integrityAllowance": 80 },
    "GB": { "label": "守门岗B", "monthly": 585, "gatekeeper": true, "integrityAllowance": 59 }
  },
  "roles": {
    "Frontend1":"T1","Backend1":"T1","Go1":"T1","Go2":"T1","React1":"T1","Backend2":"T1","Frontend2":"T1","UIUX":"T1","QAAutomation":"T1","Localizer":"T1",
    "OpsEngineer":"T2","PM":"T2",
    "FrontendSenior":"T3","BackendSenior":"T3","GoSenior":"T3","ReactSenior":"T3","DBEngineer":"T3","Architect":"T3",
    "Lead":"T4","OpsLead":"T4",
    "Reviewer1":"GA","Reviewer2":"GA","SecurityReviewer":"GA","LedgerAuditor":"GB","KnowledgeKeeper":"GB"
  },
  "allowances": { "fullAttendance": 10, "mealPerDay": 0.5, "transportMonthly": 7, "seniorityPerHalfYear": 2, "seniorityCap": 11 },
  "assessment": { "min": 0.8, "mid": 1.0, "max": 1.5, "midScore": 60, "minSamples": { "observedDays": 7, "evaluatedTasks": 3 },
    "weights": { "firstPass": 0.40, "rework": 0.25, "unblocked": 0.20, "success": 0.15 }, "reworkCapRounds": 3 },
  "sideIncome": { "mineAdventureDailyMax": 3, "mineAdventureMonthlyShareOfBase": 0.10,
    "recordBased": { "knowledge_contribution": { "amount": 5, "monthlyMax": 4 }, "proposal_adopted": { "amount": 3, "monthlyMax": 5 }, "defect_found": { "amount": 4, "monthlyMax": 4 } },
    "inflationGuardShareOfPayroll": 0.08 }
}
```
（董事会不在薪资体系内；不在 `roles` 里的名字一律拒绝并报错「未登记岗位」，不得默认发放。）

## 三、`town-engine.mjs` 导出的纯函数（输入输出全是普通对象，无副作用）
1. `workedDaysCap(days)` = `min(30, days)`。
2. **`assessmentCoefficient({ role, observedDays, evaluatedTasks, firstPassRate, avgReworkRounds, blockedShare, successRate }, cfg)`**
   - 守门岗（`gatekeeper: true`）**固定返回 1.0**，原因 `"gatekeeper"`。
   - `observedDays < 7` 或 `evaluatedTasks < 3`，或任一比率缺失（`null`）：返回 1.0，原因 `"insufficient"`（不扣分）。
   - 否则综合分 `S = 100 × (0.40×firstPassRate + 0.25×reworkScore + 0.20×(1−blockedShare) + 0.15×successRate)`，其中 `reworkScore = max(0, 1 − avgReworkRounds / 3)`，各比率先夹到 [0,1]。
   - 系数分段线性：`S≤0 → 0.8`；`0<S<60` → `0.8 + (S/60)×0.2`；`S=60 → 1.0`；`60<S<100` → `1.0 + ((S−60)/40)×0.5`；`S≥100 → 1.5`。结果保留 4 位小数。
3. **`seniorityBonus(monthsOfService, cfg)`** = `min(11, 2 × floor(monthsOfService / 6))`。
4. **`mineAdventure(agent, date)`**：**确定性**，`sha256(agent + "|" + date + "|dr-town-v1")` 取第 1 个字节 `b`，`coins = b % 4`（0–3 的整数 DR 币）。同一人同一天结果恒定。**只在调用方声明 `eligible: true`（当天有上班空闲）时才有效**，否则 0。
5. **`buildPayslip(input, cfg)`** → 工资条对象，`input` 字段：
   `{ agent, month, daysInMonth, workedDays, availableDays, monthsOfService, metrics:{observedDays,evaluatedTasks,firstPassRate,avgReworkRounds,blockedShare,successRate}, projectBonuses:[{reason,amount,basis}], firstPassRewards:[{task,amount}], recordIncome:[{kind,count,basis}], mineAdventureDays:[{date,eligible}], confirmedViolations:[{task,reason}] }`
   计算顺序和规则（**金额单位 DR 币，内部转分**）：
   - `baseMonthly` = 档次月薪；**计薪天数** `paidDays = min(30, workedDays)`；`proratedBase = baseMonthly × coefficient × paidDays / 30`。
   - `fullAttendance` = `availableDays === daysInMonth` 且 `workedDays === daysInMonth` 时发 10，否则 0（**不满月入职的月份不发全勤奖**）。
   - `meal` = `0.5 × paidDays`；`transport` = `7 × paidDays / 30`；`seniority` 见上。
   - **守门岗**：`integrityAllowance` = 配置值，**但只要 `confirmedViolations` 非空就发 0**（并在明细里写出违规任务编号）；**守门岗不得有 `projectBonuses` 和 `firstPassRewards`**——传入则**忽略并在 `warnings` 里写明「守门岗不领取结果挂钩奖励」**；`recordIncome` 中**与职务相关的类别不适用于守门岗**：守门岗只允许 `knowledge_contribution`，且调用方必须保证作者≠审核人（本函数不判断，只在 `warnings` 提醒）。
   - 非守门岗：`projectBonuses` 全额计入（每项四舍五入到分）；`firstPassRewards` 计入；`recordIncome` 按配置 `amount × min(count, monthlyMax)`。
   - **娱乐型外快**：对每个 `mineAdventureDays` 中 `eligible: true` 的日期取 `mineAdventure(agent,date)`，**每日 ≤ 3**；当月总和 `≤ floor(baseMonthly × 0.10)`，超出部分截断并在明细写「已达月度上限」。
   - 返回 `{ agent, month, tier, lines:[{key,label,amountCents,basis}], totalCents, coefficient:{value,reason}, warnings:[] }`，`totalCents` 必须**严格等于** `lines` 各行之和。
6. **`payCalendar`**：`payMonthFor(nowIso)`：给定当前时间返回「现在该发哪个月的工资」——**金边时间每月 15 日 09:00 起，发上一个自然月**；不到 15 日 09:00 返回 `null`。`isPayDay(nowIso)` 同口径。
7. **`inflationReport(payslips, cfg)`** → `{ payrollCents, sideIncomeCents, share, exceeded }`：`sideIncome` = 娱乐型外快行之和；`share = sideIncome / payroll`；`exceeded = share > 0.08`。

## 四、算例（**必须全部写成测试，数字必须一字不差**）
- **A（整月、基准考核）**：Frontend1（T1），2026-11（D=30），workedDays=30，availableDays=30，monthsOfService=1，考核综合分 60（系数 1.0），无其它收入。明细：基本 336.00 + 全勤奖 10.00 + 餐补 15.00 + 交通补 7.00 + 工龄 0.00 = **368.00**。
- **B（不满月，10 月 15–31 日共 17 天）**：Frontend1，2026-10（D=31），workedDays=17，availableDays=17，系数 1.0。基本 `336/30×17` = **190.40**；全勤奖 **0**；餐补 `0.5×17` = **8.50**；交通补 `7×17/30` = 3.9666… → **3.97**；总计 **202.87**。
- **C（守门岗，整月）**：Reviewer1（GA），2026-11，workedDays=30，availableDays=30。基本 795.00 + 廉洁津贴 80.00 + 全勤奖 10.00 + 餐补 15.00 + 交通补 7.00 = **907.00**；系数固定 1.0。**有一条确认违规**时：廉洁津贴 0，总计 **827.00**，明细里有违规任务编号。
- **D（考核封顶）**：Backend1（T1），整月，`firstPassRate=1, avgReworkRounds=0, blockedShare=0, successRate=1`（S=100，系数 1.5），observedDays=30，evaluatedTasks=10：基本 `336×1.5` = **504.00**，加全勤 10 + 餐补 15 + 交通 7 = **536.00**。
- **E（分段线性）**：S=30 → 系数 `0.8+(30/60)×0.2` = **0.9000**；S=80 → `1.0+(20/40)×0.5` = **1.2500**；S=0 → **0.8000**；S=100 → **1.5000**。数据不足（observedDays=6）→ **1.0000**，原因 `insufficient`。
- **F（守门岗忽略奖励）**：给 Reviewer1 传入项目奖金 100 和一次通过奖励 20：这两项都**不计入**，`warnings` 各一条，总计与 C 相同。
- **G（娱乐型外快）**：`mineAdventure('Frontend1','2026-11-03')` 重复调用 100 次结果相同；任意 1000 个（agent, date）组合的结果都在 0–3 之间；每月总和不超过 `floor(336×0.10)=33`；`eligible:false` 的日子恒为 0。
- **H（发薪日）**：`2026-11-14T09:30+07:00` → `null`；`2026-11-15T08:59+07:00` → `null`；`2026-11-15T09:00+07:00` → `"2026-10"`；`2026-12-15T10:00+07:00` → `"2026-11"`；跨 UTC 日界（金边已到 15 日但 UTC 还是 14 日）也要对。
- **I（拒绝）**：`roles` 里没有的名字（如 `"苏晨"`、`"Unknown"`）调用 `buildPayslip` → 抛错，不发放；`workedDays` 为负数、非整数、大于 `daysInMonth` → 抛错。

## 五、`town-ledger.mjs`（追加式账本，调用方传入目录）
- `createLedger({ dir })`：账本文件 `dir/ledger.jsonl`，每行一个 JSON：`{ seq, at, month, agent, kind, amountCents, reason, basis, prev, hash }`；`hash = sha256(prev + JSON(除 hash 外的字段))`，形成哈希链（防篡改，不是区块链，不要加共识 / 挖矿 / 难度）。**原子追加**（先写临时文件再追加，或 `appendFileSync` 单行写入；崩溃不得损坏已有行）。
- `append(entry)`：**幂等键** = `month|agent|kind|reason`（发薪类 `kind: 'payslip'`）——同一个月同一个人的工资条重复入账**拒绝**（返回已存在，不重复记）。
- `verify()`：逐行校验哈希链和 `seq` 连续，返回 `{ ok, lines, firstBadLine }`。
- `balance(agent)`：余额 = 该人所有记账之和（收入为正，消费 `kind:'spend'` 为负）；**余额不得为负**（`spend` 超过余额时拒绝）。
- `settleMonth({ ledger, payslips, month })`：把一批工资条逐条入账（每条一个 `payslip` 行，明细放 `basis`），**整批幂等**；返回入账条数和跳过条数。
- 损坏的行：`verify()` 能定位，`balance()` 遇到损坏链**抛错**，不静默继续；**不自动修复**。
- **账本里不得有任何事件正文 / 评论 / 任务描述**，`basis` 只允许任务编号、条目类别、日期、计数。

## 六、`town-cli.mjs`（试算，只读，不写账本）
`node town/town-cli.mjs --month 2026-10 --input <json文件> [--json]`：读调用方给的输入文件（格式同 `buildPayslip` 的 `input` 数组），输出每人工资条和 `inflationReport`；**不读任何其它文件、不联网、不写账本**。附 2 份示例输入（`town/sample-2026-10.json`：含不满月；`town/sample-2026-11.json`：整月含守门岗违规一例）。

## 七、测试要求与验收（缺一不通过）
- `node --test tests/town-engine.test.mjs tests/town-ledger.test.mjs` 全过；`node --test tests/*.test.mjs` 全过（**不得影响既有测试**）；`node --check` 每个 `.mjs`。
- 测试必须覆盖：第四节 A–I 全部算例（**数字逐字断言**）；配置真的被读取（改配置里的 `baseWage` / 档次月薪后结果随之改变）；每行四舍五入 half up 且 `totalCents` 等于明细之和（用 100 组随机输入验证，随机用固定种子）；账本哈希链（篡改任意一行后 `verify()` 报告第一处坏行）、幂等、余额不得为负、原子追加（模拟中断后已有行完好）。
- 静态自检脚本写进测试：**扫描 `town/` 下所有源文件，断言不含 `fetch(`、`http`、`require('net')`、`child_process`，不含「提现」「入账」「转账」「兑换」「挖矿」字样**。
- 汇报：每条要求做到没有；**没做到或不确定的地方逐条列出**（不要猜）；全部算例的实际输出；**没有修改任何已有文件**这一点要明确写出（写出你的核对方法）。

---
## 八、补充（2026-10-20，董事会要求避免「只发币」的泡沫）：金库与经济循环底座
**本节与第一—七节一起做，同样是纯函数 + 追加式账本，不接服务、不接界面。** 规划依据见知识库 `项目\前厅与小镇规划.md` 第十五节（含循环图和模拟对比）。**不要改变第一—七节已经写死的任何公式和算例**；本节只新增。

### 8.1 账本扩展（`town-ledger.mjs`）
- 新增**账户**概念：`wallet:<岗位名>`、`treasury`（小镇金库）、`public`（公共项目，只进不出，表示永久回收）。每个记账行写明 `from` / `to` 两个账户（发行用 `from: 'mint'`），**任何转移必须借贷平衡**：`mint → treasury/wallet`、`wallet → treasury`（消费、房租水电、税、保管费、商品）、`treasury → wallet`（工资、奖金、利息）、`treasury → public`（公共项目）。
- **守恒不变量（必须有测试）**：任意时刻 `Σ wallet + treasury = 累计 mint − 累计 public`，恒等（整数分，零误差）。`verify()` 同时校验哈希链和守恒。账户余额不得为负（金库不足时工资按比例发放，见 8.3，不得让金库为负）。
- 旧的 `payslip` / `spend` 行为保持兼容：`payslip` 的来源改为 `treasury`（先付）和 `mint`（不足部分），并在 `basis` 里写明各占多少。

### 8.2 `town-config.json` 新增（数字放配置）
```json
"economy": {
  "treasuryEndowmentMonths": 1.0,
  "treasuryCapMonths": 2.0,
  "mint": { "maxShareOfPayroll": 0.25, "pauseWhenSupplyAboveMonths": 6.0, "outputIndexDefault": 1.0 },
  "livingCost": { "rentShareOfBase": 0.32, "utilityShareOfBase": 0.05 },
  "tax": { "threshold": 300, "rate": 0.12 },
  "spendPropensity": { "daily": 0.55, "goods": 0.25 },
  "hoardFee": { "freeMonthsOfIncome": 3.0, "start": 0.03, "step": 0.005, "min": 0.01, "max": 0.10, "lowerBandShare": 0.6 },
  "savings": { "monthlyInterest": 0.002 },
  "price": { "cpiMin": 0.8, "cpiMax": 1.5, "targetPerCapitaMonthsOfIncome": 2.0 }
}
```
### 8.3 新增纯函数（`town-engine.mjs`）
1. `livingCostFor(agentBase, fundingRatio)` = `(rent + utility) × 基数 × fundingRatio`；`taxFor(pay)` = `max(0, pay − 300) × 12%`；`hoardFee(balance, monthlyIncome, rate)` = `max(0, balance − 3×monthlyIncome) × rate`；全部四舍五入到分。
2. **`fundingPlan({ treasuryCents, payrollCents, supplyCents, outputIndex }, cfg)`** → `{ fundingRatio, fromTreasury, minted, paused }`：
   - 允许新发行 `allowMint = supply > pauseThreshold ? 0 : maxShare × payroll × clamp(outputIndex, 0, 1)`；
   - `fundingRatio = min(1, (treasury + allowMint) / payroll)`；先用金库，不足再发行；**`fundingRatio < 1` 时返回 `paused/short: true` 供界面提示，绝不为了凑齐工资而突破 `allowMint`**。
3. **`adjustHoardRate({ supply, rate }, cfg)`**：`supply > 目标上限` → `min(max, rate + step)`；`supply < 下限带（上限 × 0.6）` → `max(min, rate − step)`；否则不变。
4. **`treasuryOverflow(treasuryCents, payrollCents, cfg)`** = `max(0, treasury − cap × payroll)`，返回应转入 `public` 的金额。
5. **`priceIndex({ supply, population, avgMonthlyIncome }, cfg)`** → CPI（夹在 [0.8, 1.5]）；`itemPrice(base, cpi)` 四舍五入到分。
6. **`monetaryReport(ledgerState, cfg)`** → `{ supply, treasury, minted, recycled, publicSpend, fundingRatio, perCapita, gini, cpi, hoardRate, conserved }`（`gini` 用整数运算的标准公式；`conserved` = 守恒不变量是否成立）。
7. **`simulateMonths({ roster, months, cfg, params? })`**：确定性的月度模拟（**不含随机数**）：每月 `fundingPlan → 发放 → 每人按固定比例支出（生活成本、税、日常消费、商品、保管费、储蓄利息）→ 回金库 → 金库溢出转 public → adjustHoardRate`，返回逐月 `monetaryReport` 数组。用来做下面的收敛测试，也给后续界面做预览。

### 8.4 新增测试（`tests/town-engine.test.mjs` / `tests/town-ledger.test.mjs`，容差写成区间，不要求与我的脚本数字完全一致）
用 25 位同事的真实花名册和薪资表（第二节配置，工资总额应约 14,505 DR 币/月，写成断言区间 14,000–15,000）：
- **收敛（场景 D，36 个月）**：每个月 `fundingRatio ≥ 0.99`；流通量**从不超过目标上限 × 1.05**（6 个月工资总额 ≈ 87,000）；**第 36 个月新发行占工资总额 ≤ 15%**；**第 24—36 个月流通量月增幅 ≤ 3%**；`conserved` 始终为 true；金库余额从不为负，且不超过上限 × 1.02。
- **对照（场景 E：无回收、无保管费、日常消费 25%、无商品）**：流通量 24 个月后 **≥ 场景 D 的 2 倍**，且 `fundingRatio` 在稳定期 **< 0.6**（证明没有回收机制就会泡沫化、发不出全额工资）；测试里同时断言这个对照差异，防止以后有人把回收项调弱而没发现。
- **产出锚定**：`outputIndex = 0` 时不发行（金库用完后 `fundingRatio` 下降，且**不会为凑工资而发行**）；`outputIndex = 0.5` 时新发行恰为 `0.5 × 25% × 工资总额` 的上限。
- **自适应保管费**：流通量越过上限 → 费率逐月 +0.5%（到 10% 封顶）且发行暂停；回落到 60% 以下 → 费率下降（到 1% 封底）。
- **金库溢出转公共项目**：金库超过 2 个月工资总额后，超出部分进入 `public`，不再留在金库；`public` 只进不出（试图转出则拒绝）。
- 账本：借贷平衡（构造不平衡的行被拒绝）、守恒被破坏（篡改一行）时 `verify()` 能定位、旧版 `payslip` 仍兼容。
- 静态自检（沿用第七节）：新代码里同样不得出现禁用词和网络 / 进程调用。
