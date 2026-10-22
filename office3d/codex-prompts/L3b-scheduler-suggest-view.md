# L3b-scheduler-suggest-view：调度建议只读视图——「程序校验后建议先做哪几项」（不领取、不派发，约 1–1.5 小时）

**执行者：Trae（新会话）。主线。改 `server.mjs`（**必须等 L1b 验收后再开**，两张卡不能同时改它）。** **前置：L3a 与 L3a-fix 已验收（`scheduler-core.mjs`，规则版本 `L3a-2`）、L1a-fix 已验收、L1b 已验收。** 先读：`_common.md`、`_lane-main.md`、`scheduler-core.mjs`、`task-contract.mjs`、`server.mjs` 里 `/state` 取数与只读路由写法、知识库 `现状盘点与融合策略.md` 第八节 8.2–8.3 与第九节 9.4。

**允许修改：** 新增 `scheduler-view.mjs`（纯函数：把 `/state` 的任务 / 同事 / 审批数据整理成 `scheduler-core` 的输入并输出建议）、`tests\scheduler-view.test.mjs`；`server.mjs`（**只加一条只读路由 + 默认关闭的开关读取，逐行列出**）；`ui.js` / `index.html`（**最小钩子 ≤ 15 行，逐行列出**：治理中心里一块「调度建议（只读）」）；`README.md` 追加一节「调度建议视图（L3b）」。备份到 `office3d-backup-l3b`。**本卡只给建议：不领取、不派发、不改任何任务状态、不发评论、不写 Paperclip。**

## 要做的事
1. **开关** `scheduler-view.json`：`{"enabled":false}`；缺失 / 损坏 / 非布尔 `true` 一律关闭，启动时读一次。关闭时新路由 404、UI 无新元素、既有路由与页面逐字节一致（`tools\tenancy-snapshot.mjs`）。
2. **`scheduler-view.mjs`**：`buildSchedulerInput(state, { now, dataAt })` → `scheduler-core` 的 `tasks / agents / ctx`（**用 `parseContract` 把任务描述里的契约解析成 `task.contract`**，资金判定口径沿用 L1a-fix / L3a-fix；`hasContract` 来自 `validateContract`；预算未知保持 `null`，不得当成充足）；`suggest(state, opts)` → `{ ruleVersion, picks:[{identifier, rank, reasonsForPick}], skipped:[{identifier, reasonCodes}], idleReason, dataAgeMs }`。**输出不含标题与描述正文**（只含编号、原因码、排名）。
3. **路由** `GET /scheduler/suggest`（只读，复用 `/state` 的取数与缓存，**不增加对 Paperclip 的请求频率**；墙面令牌不可读，局域网只读可读）。数据陈旧（`STALE_DATA`）时返回原因而不是建议。
4. **UI**：治理中心一块折叠的「调度建议（只读）」：列出建议的前 3 项（编号 + 原因标签）与被跳过项的原因码计数；**明确文案「仅供董事会参考，系统不会自动领取或派发」**；**页面轮询不增加；`document.hidden` 时不刷新。**
5. **审计**：每次计算写一条 `decisionRecord`（**不含正文**）到内存环形缓冲（最多 100 条，不落盘），UI 可见「规则版本 L3a-2」。

## 测试与验收
- 纯函数：从样例 `/state` 生成输入；资金类任务（标题含「提现」）不被推荐；`禁止: 读取密钥` 的任务**会被推荐**；已取消依赖默认阻塞（`DEP_CANCELLED`）；缺契约时按策略（默认只警告）；预算 `null` 产生 `BUDGET_UNKNOWN`；输出不含标题 / 描述（断言）。
- `server.mjs`：开关关闭零变化（路由快照）；开启 200；墙面令牌 403；**静态检查：无对 Paperclip 的写调用，且不新增任何定时器**。
- 全量测试全过；`node --check`。**不要自己重启服务**（我来重启后做在线验收）。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` 与 `ui.js` 的接线行；**用真实 `/state` 数据跑一次建议（只贴编号与原因码）**。
