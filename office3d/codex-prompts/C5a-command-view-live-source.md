# C5a-command-view-live-source：KhmerX 项目的 live 数据适配器（纯模块，注入取数函数，约 1–1.5 小时）

**执行者：Trae（新会话）。主线。** **前置：C4 已验收。** **董事会 2026-10-21 裁决：第一版 live 范围 = KhmerX 项目；验收人 / 预算授权人 / 样例审核人暂设董事会本人（苏晨，本机完全访问用户）。** 示范任务建议（沿用 L0 的三个真实案例，董事会可改）：**CMP-337（成功路径，已完成）、CMP-344（返工候选）、CMP-274（阻塞）**；另有 **CMP-285**（OpsLead 等董事会回答新部署日期）可作为「督办焦点」的真实案例。先读：`_common.md`、`_lane-main.md`、`docs\command-view-plan.md`（尤其第 3、4、6、7、8 节）、`command-view-data.mjs` / `command-view-validate.mjs`（C2）、`command-view-routes.mjs`（C3）、`scheduler-view.mjs` 与 `server.mjs` 里 L3c 的懒取数（`schedulerEnrichRows / schedulerCompletedRows / 60 秒缓存`，**照其上限与做法**）、`mainline\l0\l0-report.md` 第 24 节（`activity` 键名）。

**允许新增：** `command-view-live.mjs`（适配器：`createLiveSource({ get, projectName, rangeDays, now, owners })`）、`tests\command-view-live.test.mjs`、`tests\fixtures\command-view-live\`（**脱敏的真实形状夹具**：只保留状态 / 键名 / 时间 / 类型，标题改 `demo-*`，不含正文、不含真实 IP / 任务编号 / 评论）；README 一节。**不改任何已有文件**（含 `server.mjs`、`ui.js`、C2 / C3 / C4 产物）。**纯模块：不自己发请求（`get` 由调用方注入）、不读写文件、不调 `Date.now / Math.random`。**

## 要做的事
1. **范围与主体**：`projectName`（默认 `KhmerX`）经注入的项目列表解析成项目 ID（找不到 → `SOURCE_FAILED` 空状态，**不回退到全公司**）；`rangeDays`（默认 14，**上限 14**）；`owners = { acceptor, budgetAuthorizer, sampleReviewer }` 均为「董事会」显示名（**只用于 `nextHandler` 文案，不是身份凭据**）。**只服务「本机完全访问」主体**——适配器接受调用方传入的 `principal`（`local_full | lan | wall`），非 `local_full` 一律返回空状态 `NO_AUTHORIZED_LIVE_SCOPE`。
2. **取数计划（只读，沿用 L3c 上限）**：
   - 列表层：**复用调用方传入的已有快照**（`state` 的 `assigned / agents` 等，**适配器不调用 `state()`**）＋ 一次受限的「项目内最近 14 天已完成任务」列表查询（`get` 注入，最多 200 项，标 `PARTIAL_PAGE`）。
   - 详情层（**仅在选中任务时**）：`GET` 任务详情（`blockedBy / parentId` 等）、该任务的运行摘要、`activity` 的**事件类型 / 时间 / 操作者类型**（**不取任何正文**）；**并发 ≤ 4、单请求超时 5 s、总请求数 ≤ 20 / 次选中、60 s 缓存（键含公司 + 项目 + 任务 + 范围 + 主体范围 + 证据版本）、单飞去重；失败负缓存 ≤ 15 s；404 / 403 / 超时分别标 `SOURCE_DISABLED / SOURCE_FAILED`，缺 `blockedBy` 标 `DEP_UNKNOWN`（不当无依赖）。**
3. **映射到 C2 的 `projectCommandView({ sources })`**：任务 / 运行 / 同事 / 契约摘要 / 调度建议 / H1 健康；**evidence 源：未接线 → `null`（`EVIDENCE_NOT_CONNECTED`）**，所以所有任务阶段**最多显示 Paperclip 原生状态 + 「待验证（无证据）」**，不得推断「已验收」；`in_review` 仍可显示为原生审查态；已完成任务显示 `rawStatus: done` + `pending_verification / NO_ACCEPTANCE_EVIDENCE`。成本：**真实用量缺失，`totalAmount:null`、`unknownCostRuns` 如实计数**。督办焦点里「授权 / 预算 / 已交付待验收」的 `nextHandler` 写 `owners` 里的董事会显示名（**CMP-285 的「等待日期」应归为授权类阻塞，处理人为董事会**）。
4. **安全**：输出只含白名单字段（C2 的投影已保证）；**标题经 C2 的 `safe()`（≤ 80 字、去敏感模式）；不输出内部地址 / 服务器 IP**（CMP-285 标题里有 IP，必须被清理成 `[已隐藏]`）；不输出评论 / 描述 / 运行输出。

## 测试与验收
- 用夹具与注入的假 `get`：范围解析（项目找不到 → 空状态、不回退）；非 `local_full` 主体 → 空状态；列表 > 200 → `PARTIAL_PAGE`；选中任务时请求数 ≤ 20、并发 ≤ 4（用计数断言）、60 s 内重复选中只请求一次、失败负缓存、`DEP_UNKNOWN`；**标题里的 IP 被隐藏**；**done 任务无证据 → `pending_verification`**；成本缺失 → `null`；公司不一致 → 拒绝；输出通过 `validateCommandView`；确定性与不改输入。
- 静态：无 `fetch / fs / Date.now / Math.random / child_process / eval`；全量测试全过。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；**不要重启服务**。
