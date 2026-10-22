# E1-event-envelope：事件信封对齐——与 `repo-3d` 事件契约一致的纯模块 + 现有事件转换器（约 1 小时）

**执行者：Trae（新会话）。主线。** 先读：`_common.md`、`_lane-main.md`、**`E:\VirtualAIOffice\repo-3d\docs\architecture\event-contract.md`（完整读——信封版本 1、序列化格式、命名规范、与旧系统事件的对应；这是规格，**与本任务描述冲突时以它为准**）**、`events-ledger.mjs`（办公室现有事件账本的记录形状：`events\YYYY-MM-DD.jsonl` 里每行有 `id, at, kind, from, to, ref, text`；`kind ∈ speak / dispatch / report / celebrate / board_decision / submit_to_board`）、`tests\events-ledger.test.mjs`（若存在）。

**允许新增：** `event-envelope.mjs`、`tools\events-to-envelopes.mjs`（只读转换报告脚本）、`tests\event-envelope.test.mjs`；`README.md` 追加一节「事件信封（E1）」。**不改 `events-ledger.mjs` 与其它已有文件；不接路由；不对 Paperclip 发请求；纯模块不读写文件（只有 `tools\` 脚本可以只读读取 `events\*.jsonl`）。**

## 目标
为将来「跨系统事件」（小镇、治理、以及以后可能对接的其它系统）准备**同一种事件格式**：**对齐 `repo-3d` 的版本化信封，不另造一套**；并把办公室**现有**事件无损转换成信封，**只做转换与校验，不改变现有账本的写入**。**本阶段不开发任何 IM / OA / DAEN 对接。**

## 要做的事
1. **`makeEnvelope(input)` / `validateEnvelope(envelope)`**：字段、必填、类型、长度、`schema_version`、命名规范**严格按 `event-contract.md`**（你读后在 README 里用一张表列出「契约条款 → 本模块实现 / 测试名」）。常见字段应包含（以契约为准）：`event_id`（UUID，用于去重）、`event_type`（`领域.动作` 命名）、`schema_version`、`tenant_id`、`source_system`、`entity_type`、`entity_id`、`correlation_id`、`occurred_at`（ISO8601 Z）、`actor_type`、`classification`、`payload`（仅放必要的引用 ID，**不放正文**）。`validateEnvelope` 返回 `{ ok, errors:[{field, code}] }`，**不抛异常**；`payload` 限制大小（默认 4 KB）且**禁止出现疑似密钥 / 令牌 / 口令**（简单模式扫描，命中即错误，不回显原文）。
2. **序列化**：`serializeEnvelope / parseEnvelope`（按契约的序列化格式；`parseEnvelope` 对不可信输入容错，未知字段丢弃并计数，未知 `schema_version` 返回明确错误）。
3. **`fromLedgerEvent(record, { tenantId = 'zhixu' })`**：把办公室现有事件转换成信封：`event_type` 映射（`speak→collab.message_posted`、`dispatch→task.dispatched`、`report→task.reported`、`celebrate→team.celebrated`、`board_decision→board.decision_recorded`、`submit_to_board→board.review_requested`，**以契约的命名规范为准，必要时调整并在 README 说明**）；`source_system:'office3d'`；`entity_id` 用 `ref`（任务编号 / 评论 id）；`correlation_id` 用 `ref`（无则用 `id`）；`actor_type`：`from === 'board'` → `human`，其它 → `agent`；**`text`（正文）不进入 `payload`**，只保留长度与是否含提问；**`event_id` 由旧 `id` 确定性派生**（同一旧事件永远得到同一个 `event_id`，便于去重；用 UUIDv5 风格 / SHA-256 截断，**不用随机数**）。
4. **`eventKey(envelope)` / `dedupe(list)`**：按 `event_id` 去重；**同一 `event_id` 但内容不同 → 报冲突而不是静默覆盖**。
5. **`tools\events-to-envelopes.mjs`（只读）**：读 `events\*.jsonl`（**最多最近 3 个文件**，大小上限 5 MB），输出转换统计：总数 / 成功 / 失败（按原因分类）/ 去重后数量 / 各 `event_type` 计数，**不输出正文**；用 `--sample N` 可打印前 N 条信封（正文已去除）。**不写任何文件。**

## 测试（`tests/event-envelope.test.mjs`）
- 信封：合法样例通过；逐字段缺失 / 类型错 / 超长 / 非法时间 / 非法 `event_type` 命名 / 未知 `schema_version`；`payload` 过大与含疑似密钥被拒且不回显。
- 序列化往返；`parseEnvelope` 对垃圾输入（`null`、数组、超大、嵌套）容错。
- `fromLedgerEvent`：6 种 `kind` 各一例；**`event_id` 确定性**（同输入两次相同、不同输入不同）；`text` 不进入 `payload`；缺 `ref` / 缺 `to` 的退化；未知 `kind` 返回明确错误。
- `dedupe`：重复去除；同 `event_id` 不同内容 → 冲突。
- 对**真实** `events\*.jsonl`（只读，在测试里读取最近一个文件的前 200 行）转换成功率 ≥ 99%，失败项必须有分类原因（若真实文件不存在则跳过并说明）。
- **静态检查**：纯模块不含 `fs / fetch / Date.now / Math.random / child_process / eval / innerHTML`；脚本只含读操作。
- 全量 `node --test tests/*.test.mjs` 全过。

## 验收与汇报
`node --check` 两个源文件；全量测试全过；汇报「做到 / 没做到 / 未验证」且与磁盘一致；**贴 `events-to-envelopes.mjs` 在真实数据上的统计输出（不含正文）**；列出你认为契约里**与办公室现实不匹配**的地方（例如缺少 `tenant_id` 概念、`classification` 取值），供董事会决定是否调整契约或适配。

## 补充（2026-10-21，董事会侧，吸取 L1a / L3a 的教训）
- **「疑似密钥」扫描只检查 `payload` 的值（字符串值与键名对应的值），不扫描键名本身、不扫描字段说明性文字；** 命中规则要写成**格式特征**（如 `Bearer ` 前缀、`sk-` 加长串、长度 ≥ 32 的十六进制 / base64 串、`-----BEGIN` 块），**不要用「密钥 / password / token」这类普通词**当关键词（否则「payload.reason: 禁止读取密钥」这种正常说明会被误拒）。
- 测试必须包含两个对照：① `payload` 值为真实形状的假令牌（如 `Bearer abcdefghijklmnopqrstuvwxyz012345`）→ 被拒且不回显；② `payload.note: '禁止读取密钥'` → **通过**。
