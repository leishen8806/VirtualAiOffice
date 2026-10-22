# L3a-scheduler-core：程序化调度器核心——「Helix 提议，程序校验」（纯函数，约 1 小时）

**执行者：Trae（新会话）。主线。** 先读：`_common.md`、`_lane-main.md`、知识库 `项目\现状盘点与融合策略.md` **第八、九节**（尤其 8.2「主动处理」、8.3「三层权限」、9.4 的 L3 追加：**先校验、再调用原生领取，领取时仍校验最新状态**）、`rework.mjs` 与 `handoff.mjs` 里 `MONEY_RE` / 状态判断的写法、`E:\VirtualAIOffice\repo-3d\docs\architecture\state-machines.md`（只读，借鉴「重试 / 返工 / 升级不是状态」）。

**允许新增：** `scheduler-core.mjs`、`tests\scheduler-core.test.mjs`；`README.md` 追加一节「程序化调度核心（L3a）」。**不改其它已有文件；不接路由；不对 Paperclip 发请求；不读写文件（纯函数，时钟与数据由调用方注入）。**

## 目标
给定「任务列表 + 同事状态 + 预算 + 审批状态 + 当前时间」，**用确定性规则**回答两件事：① 哪些任务**现在可以被执行**、哪些不行、**为什么**（机器可读的原因码）；② **建议先做哪几项**（有序、可复核）。**不做任何写操作，也不领取任务**——只产出「决定记录」，由后续接线（L3b）展示、由 Paperclip 原生机制真正领取。

## 要做的事
1. **输入形状（文档化并校验）**：`task = { id, identifier, status, priority, assigneeAgentId, projectId, createdAt, updatedAt, blockedBy:[{id,status}], hasContract?, riskClass?, awaitingBoard?, leasedByRunId?, parentId? }`；`agent = { id, status ('idle'|'running'|'paused'|'error'), openCount, budgetRemaining? (null=未知), permissions:[...] }`；`ctx = { now, agents:[...], openLimitPerAgent (默认 2), dailyDispatchLimit (默认 5), dispatchedToday, dataAt (快照时间), maxDataAgeMs (默认 120000), policy:{ requireContract:false, moneyNeedsBoard:true } }`。**输入不合法返回 `{ ok:false, error }`，不抛异常。**
2. **`evaluateTask(task, ctx)`** → `{ taskId, eligible, reasons: [{ code, severity: 'block'|'warn', detail }] }`。**原因码至少**：`DEP_PENDING`（任一 `blockedBy` 非完成 / 非取消）、`AWAITING_BOARD`、`MONEY_CLASS_NEEDS_BOARD`（命中 `MONEY_RE` 且 `moneyNeedsBoard`）、`AGENT_UNAVAILABLE`（负责人 `paused / error`）、`AGENT_AT_LIMIT`（`openCount ≥ openLimitPerAgent`）、`DAILY_LIMIT`、`ALREADY_LEASED`（`leasedByRunId` 非空——**不得与原生执行锁冲突，只报告**）、`BUDGET_EXHAUSTED`（`budgetRemaining === 0`）、`BUDGET_UNKNOWN`（`null`：**未知不得当作 0，也不得当作充足**，给 `warn` 并说明）、`STALE_DATA`（`now - dataAt > maxDataAgeMs` → **block**，因为「十分钟前检查通过」不能当作现在可执行）、`NO_CONTRACT`（`requireContract` 为真时 block，否则 warn）、`WRONG_STATUS`（只有 `todo`/`backlog` 且已分配的才可能 eligible；`done / cancelled / in_review / blocked` 一律不是）、`PARENT_NOT_READY`（父任务非进行中时 warn）。`eligible` = 没有任何 `block` 级原因。
3. **`pickNext(tasks, ctx, { limit = 3 })`** → `{ picks: [{ taskId, rank, score, reasonsForPick }], skipped: [{ taskId, reasons }] }`：只从 eligible 里选；**确定性排序**：优先级（`critical > high > medium > low`）→ 解除下游依赖数多者优先 → 创建时间早者优先 → `identifier` 字典序（**同样输入永远同样输出**）；**同一负责人一次最多推荐 `openLimitPerAgent - openCount` 个**；**不为保持忙碌而创造工作**：没有 eligible 就返回空 `picks` 并给出 `idleReason`（例如 `ALL_BLOCKED_BY_DEPENDENCY` / `AWAITING_BOARD` / `NO_TASKS`）。
4. **`revalidate(decision, freshTask, freshCtx)`** → 领取前**再次校验**：用最新数据重新 `evaluateTask`，**若原先 eligible 现在不 eligible，或原因码集合变化**，返回 `{ stillEligible:false, changed:[...] }`；这个函数就是「先校验、再领取、领取时仍校验」的程序化依据。
5. **`decisionRecord(decision, meta)`** → 一条**不含任务正文**的审计记录 `{ at, taskId, eligible, reasonCodes, picked, ruleVersion }`（`ruleVersion` 常量，规则变更要递增并有测试固定）；**不得包含标题 / 描述 / 评论**。
6. 常量与表（`PRIORITY_ORDER`、原因码清单、默认限额）全部导出并冻结。

## 测试（`tests/scheduler-core.test.mjs`）
- 每个原因码至少 2 个用例（命中 / 刚好不命中）；`BUDGET_UNKNOWN` 与 `BUDGET_EXHAUSTED` 的区别；`STALE_DATA` 边界（恰好 `maxDataAgeMs`）。
- `pickNext`：优先级 / 解除依赖数 / 创建时间 / identifier 四级排序；`limit`；同一负责人配额；**确定性**（打乱输入顺序结果不变）；**全部被阻塞时返回空 picks + `idleReason`**；有资金类任务时 **永远不被推荐**（需要董事会）。
- `revalidate`：依赖在两次校验之间被重新打开、负责人在两次校验之间被暂停、预算变 0、数据变陈旧，各一例。
- `decisionRecord`：**断言不含 `title / description / body / comment` 字段**；`ruleVersion` 固定。
- 容错：缺字段、`null`、未知状态、1 万个任务（性能：< 500 ms）。
- **静态检查**：不含 `fetch / Date.now / Math.random / child_process / eval / innerHTML`；不 import 业务模块（**只允许** `import { MONEY_RE } from './standup.mjs'`）。
- 全量 `node --test tests/*.test.mjs` 全过。

## 验收与汇报
`node --check scheduler-core.mjs`；全量测试全过；汇报「做到 / 没做到 / 未验证」且与磁盘一致；**说明你对「依赖已取消算不算满足」「`in_review` 是否可领取」的取舍与理由**（写进 README 一节）。
