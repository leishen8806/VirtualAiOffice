# L3c-fix：调度建议的逐任务取数不得放进 `/state`（只改 `server.mjs` 与 `ui.js` 的取数位置，约 30–45 分钟）

**执行者：Trae（接在 L3c 之后，同一会话即可；做完停下等验收）。** 先读：`_lane-main.md`、你自己的 `server.mjs`（`state()` 里 `_schedulerSource` 的构造、`schedulerEnrichRows`、`schedulerCompletedRows`、`/scheduler/suggest` 路由）、`scheduler-view.mjs`、`ui.js` 里「调度建议（只读）」的取数。开工先备份 `server.mjs`、`ui.js` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-l3c-fix`（**上一级目录，必须备份**）。**只允许改这两个文件、`scheduler-view.mjs` 与对应测试。**

董事会侧用真实服务复核 L3c：**逻辑是对的**（真实数据现在有 2 条建议；`DEP_PENDING ×37`、`DEP_CANCELLED ×4`、`DEP_UNKNOWN` 路径存在；Paperclip 的单个任务详情里**有** `blockedBy`，列表里没有，你的发现正确；66 个未分配任务得到建议负责人；输出不含标题与描述；规则版本 `L3a-3`）。**但有一处违反 L3b 卡片的硬规则（「不得增加对 Paperclip 的请求频率，不新增轮询」）：**

## 缺陷：逐任务取数被放进了 `state()`
`state()` 在 `SCHEDULER_VIEW_ENABLED` 为真时，**每次**构造 `/state` 都对约 80 个任务各发一次 `GET /api/issues/{id}`，外加一次 `issues?status=done`。实测（真实服务、同一机器）：**`/state` 耗时 开关关闭 0.4–1.0 s → 开启 2.1–2.9 s**；页面每 3 秒轮询 `/state`，等于每 3 秒向 Paperclip 发 ~80 次请求，**会拖慢整个办公室与治理中心**，而这块功能只是「只读建议」。

## 要求
1. **把 `schedulerEnrichRows` 与 `schedulerCompletedRows` 移出 `state()`**：`state()` 里的 `_schedulerSource` 只保留**不需要额外请求**的字段（现有 `issueList.concat(backlog)` 与 `agents`）。**开关关闭或开启时，`/state` 的耗时与对 Paperclip 的请求数应一致**（用测试 / 日志计数证明：开启 / 关闭状态下一次 `/state` 的 Paperclip GET 次数相同）。
2. **只在 `/scheduler/suggest` 内懒取数**：路由被请求时才做逐任务详情与已完成任务查询；**服务端缓存 60 秒**（同一进程内多次请求共用，缓存键含开关状态）；**并发上限 4、单次最多处理 200 个任务、单请求超时 5 s**，失败的任务按 `DEP_UNKNOWN` 保守处理（不得默认无依赖）；缓存命中时响应头或字段里标明 `cached:true` 与 `dataAgeMs`。
3. **UI 取数频率**：「调度建议（只读）」折叠面板**只在展开时**请求 `/scheduler/suggest`，**且最短 60 秒一次**，`document.hidden` 时不请求；折叠状态下不请求（当前若是随 `/state` 一起触发，改掉）。
4. **建议负责人的区分度**：真实数据里不同任务得到的 `suggestedAgentIds` 几乎相同（前几项都是同样三个 id）。请核对规则是否在**排除暂停 / 预算耗尽 / 并行已满**之后，仍按「同项目最近完成过的同事优先 → 并行任务少者优先」排序；若是因为这些任务本来就在同一项目、同一批同事，**在汇报里说明**；并让 UI 显示**同事名字而不是 UUID**（用 `/state` 已有的 `names` / agents 映射，只在前端映射，不把名字写进 `/scheduler/suggest` 响应）。
5. **回归**：`/state` 的响应形状与开关关闭时逐字节一致；全量测试全过；`node --check`；汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` / `ui.js` 的改动行；**贴开启状态下 `/state` 三次耗时（不含 `/scheduler/suggest`）**，应与关闭状态接近。**不要重启服务**（我来重启并复测）。
