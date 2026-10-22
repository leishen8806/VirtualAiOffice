# L3c-scheduler-real-data：让调度建议用上真实字段（依赖、优先级、负责人建议），只读（约 1–1.5 小时）

**执行者：Trae（新会话）。主线。改 `server.mjs`（互斥：排在 A3 之后，或经董事会侧确认顺序）。** **前置：L3b 已验收。** 先读：`_common.md`、`_lane-main.md`、`scheduler-core.mjs`、`scheduler-view.mjs`、`server.mjs` 里 `backlogRows()` 与 `state()` 取数、`mainline\l0\l0-report.md` 第 24 节（`activity` 键名与事件类型）、知识库 `现状盘点与融合策略.md` 第八节 8.2–8.3。

## 背景（董事会侧用真实数据验收 L3b 的发现）
`GET /scheduler/suggest` 开启后对真实 80 个任务返回 **0 条建议**：`WRONG_STATUS ×80`、`NO_ASSIGNEE ×75`、`NO_CONTRACT ×80`、`AGENT_UNAVAILABLE ×75`。原因是数据没接全，**不是**调度逻辑错：
1. **依赖字段对不上**：`scheduler-core` 读 `task.blockedBy:[{id,status}]`，但 Paperclip 的 issue 里**没有 `blockedBy` 字段**（实测键名含 `unblockDescriptor / blockedTransitionAt / blockerAttention / parentId`；活动里有 `issue.blockers_updated` 事件）。结果 **`DEP_PENDING` 永远不会命中**——调度器会推荐依赖未解除的任务，这是**安全缺口**。
2. **待排期任务字段缺失**：`backlogRows()` 只带 `id / issueId / projectId / title / status`，缺 `priority / createdAt / assigneeAgentId / 依赖`；
3. **只能处理已分配的任务**：75 / 80 是没有负责人的待排期任务，`pickNext` 无法给出「该分给谁」。

## 要做的事
1. **查清依赖的真实来源**（只读）：对若干有阻塞记录的任务，读 `GET /api/issues/{id}`（完整对象）的键名与 `unblockDescriptor / blockerAttention` 的**结构形状**（只记键名与类型，不记正文），再看 `activity` 里 `issue.blockers_updated` 的字段，确定「任务被谁阻塞、阻塞者当前状态」的**可靠读取方式**，写进 README 一节；**读不到可靠依赖时，必须保守：把任务标为 `DEP_UNKNOWN`（新增原因码，`block`），不得默认为无依赖**。`scheduler-core` 同步新增 `DEP_UNKNOWN` 并递增 `RULE_VERSION` 到 `L3a-3`，测试固定。
2. **补齐输入字段**：`backlogRows()` 与 `state()` 的任务对象补 `priority / createdAt`（**只在 `scheduler-view` 开启时多取，关闭时 `/state` 与 `/backlog` 的响应逐字节不变**；不得把 `description` 放进任何对外响应）。
3. **负责人建议（只建议，不分配）**：对未分配的待排期任务，在 `scheduler-view.mjs` 里按**确定性规则**给出「建议负责人」：同项目最近完成过任务的同事优先 → 当前并行任务少者优先 → 排除暂停 / 报错 / 预算耗尽者；资金类任务不给建议。输出 `{ identifier, suggestedAgentIds:[…最多 3 个], reasonCodes }`，**不含标题与正文**；UI 只读展示，文案「仅供董事会参考，系统不会自动分配」。
4. **UI**：「调度建议（只读）」里区分「可立即执行（已分配）」与「待分配（带建议负责人）」；原因码计数保持。

## 测试与验收
- 纯函数：`DEP_UNKNOWN` 在缺依赖信息时命中、有可靠依赖且已完成时通过；`RULE_VERSION=L3a-3`；负责人建议的确定性与排除规则（暂停 / 预算耗尽 / 资金类）；输出不含标题与描述。
- `server.mjs`：开关关闭时路由快照零变化（`tools\tenancy-snapshot.mjs`）；开启时 `/state` 其它字段不变。
- **真实数据**：开启 `scheduler-view.json` 后（我来重启与验收）对真实 `/state` 跑一次，期望结果不再是「全部 `NO_ASSIGNEE`」——若仍为 0 条建议，必须能**逐项解释每类原因码的来源**。
- 全量测试全过；汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` / `ui.js` 接线行；**开工先备份到 `office3d-backup-l3c`（L3b 漏做了备份目录，本卡必须做）**。**不要自己重启服务。**
