# M2-A-commute-adapter：真实上下班记录 → 通勤状态适配器（纯模块，零 token，不接服务端）

**建议执行者：Trae（新会话）。** 先读 `_common.md`、知识库 `E:\VirtualAIOffice\knowledge\项目\前厅与小镇规划.md` 的**第十八节「零 token 约束」**（硬规则）、`town-map-data\m0\m0-plan.md` 第 9 节末段（「通勤动画只来自真实上下班记录」）和第 10 节（M2-A / M2-B），以及 `E:\VirtualAIOffice\paperclip-ops\workhours\` 里的 `workhours.mjs`、`schedule.mjs`、`workhours.json`、`workhours.log`、`README.md`。

**例外规则：** 只允许新增 `office3d\town-commute.mjs`、`office3d\tests\town-commute.test.mjs`、`office3d\tests\fixtures\workhours-sample.log`（**脱敏的样例**，格式与真实日志一致）、`office3d\tools\town-commute-report.mjs`（只读报告脚本）、`README.md`（新增「通勤适配器（M2-A）」一节）。**不要改**：`server.mjs`、`app.js`、`workhours\` 下任何文件（**只读**，不得写、不得移动、不得重启调度）、`workload.mjs`、`town\`（T20 经济引擎）、`tenancy\`、所有业务模块。**不接任何路由**（`/town/state` 接口留给后续 M2-B，避免与别的任务抢 `server.mjs`）。**不得向 Paperclip 发任何请求**（本任务甚至不需要 GET），不联网、不装依赖。纯模块与脚本，**不需要重启服务**。

## 背景与硬约束（董事会已定）
- 小镇里「下班逛街 / 通勤」**只演真实的下班**：必须来自**真实上下班记录**，**没有记录就不造数据**，显示「暂无通勤记录」。不得随机制造出行。
- **零 token**：本模块不得引用发评论 / 建任务 / 唤醒 / 任何模型调用；不得出现 `fetch(`、`send(`、`chat_to_task`、`ollama`、`anthropic`、`openai`、`/api/companies/`、`POST`（静态测试固定）。
- 同事**不知情**：不写进同事的上下文、不改 AGENTS.md、不改记忆库。
- 金边时间（`Asia/Phnom_Penh`，UTC+7，无夏令时）；作息配置来自 `workhours.json`（当前每天 08:30–17:30、周日也上班）。

## 真实数据长什么样（我已核对）
`workhours\workhours.log` 每行 `ISO8601Z 文本`，例如：
```
2026-10-20T01:30:57.307Z 上班：恢复 GoSenior
2026-10-19T10:37:42.919Z 下班：暂停 OpsLead
2026-10-17T02:00:51.719Z 金边 09:00 → 上班时间；下一次切换 2026-10-17T10:30:00.000Z
2026-10-16T10:30:36.454Z 金边 17:30 → 下班时间；下一次切换 2026-10-17T02:00:00.000Z
2026-10-17T03:04:10.561Z 出错：fetch failed
```
- **每位同事的上班 / 下班事实**是 `上班：恢复 <岗位名>` 与 `下班：暂停 <岗位名>` 两类行（岗位名是 Paperclip 里的 `name`，如 `OpsLead`）；
- `金边 HH:MM → 上班时间|下班时间` 是调度器的**整体切换**记录；`出错：…`、`作息调度启动…` 是噪声，要识别并忽略（但**出错行要计数**，供报告）；
- 日志约 200+ 行，会增长；**读取时限制大小**（只读末尾 ≤ 2 MB，按行解析，丢弃不完整的首行）。**日志里的岗位名当作不可信输入**：去控制字符、限长 ≤ 40、只接受 `^[A-Za-z0-9_-]{1,40}$`，不匹配的行计入 `rejected`。

## 要做的事
1. **解析**：`parseWorkhoursLog(text, { nowMs, maxLines })` → `{ records, rejected, errorsSeen }`：
   - 每条 `record = { id, at (ISO Z), atMs, kind:'clock_in'|'clock_out', agentName, source:'workhours.log', line }`；**`id` 稳定可复现**：例如 `wh:` + `at` 的 ISO + `:` + `kind` + `:` + `agentName`（同一行重复读取 id 恒定；**同一人同一时刻同类事件重复行只保留一条**）；
   - 按时间升序、同时刻按 `agentName` 稳定排序；乱序输入也能得到同样输出；
   - 不识别的行忽略并计入 `ignored`（**不报错、不抛异常**）；超长行（> 400 字符）丢弃。
2. **通勤状态**：`commuteStateFor({ agentName, records, nowMs, schedule, travelMs })` → `{ state, since, recordId, until|null, note }`，`state` 只取：
   - `'at_office'`：最近一条该人事件是 `clock_in`，且 `nowMs` 在其之后（正在上班）；
   - `'leaving'`：`clock_out` 之后的前 `travelMs` 毫秒（下班通勤中；`travelMs` 由调用方传入，**本任务不依赖地图数据**，默认 15 分钟，上限 2 小时）；
   - `'in_town'`：`clock_out` 之后超过 `travelMs`，且还没有下一次 `clock_in`（在小镇上，**不指定去哪里**，那是 M2-B / M3 的事）；
   - `'arriving'`：下一次 `clock_in` 之前的 `travelMs` 内——**只有当调度配置里下一个上班时刻已知**时才使用（用 `schedule` 计算下一个上班时刻，上班前 `travelMs` 开始返程）；否则不输出该状态；
   - `'unknown'`：该人没有任何记录、或最近记录早于 7 天、或记录自相矛盾（如连续两条 `clock_in`）无法判断；`note` 固定为 **「暂无通勤记录」**，**绝不推断**；
   - 每个非 `unknown` 状态都带 `recordId`（来自**真实记录**）；`since` 取该记录时间。
3. **批量**：`buildCommuteStates({ records, agents, nowMs, schedule, travelMs })` → 对给定的同事名单（`agents` 是 `{name}` 数组）输出每人状态；**名单里没有的人不输出**；日志里出现但不在名单里的岗位名记入 `unknownAgents` 计数（只给数量和前 5 个名字，名字已净化）。
4. **金边日界与周末**：日期归属一律用金边日（UTC+7）；跨日界（UTC 17:00 之后属于金边次日）有测试；周日也是上班日（`days:[0..6]`），配置改成工作日子集时「下班后到下一个上班日」的 `arriving` 计算要正确。
5. **只读报告脚本** `tools\town-commute-report.mjs`：读真实 `workhours.log`（**只读**）与真实 `workhours.json`，对 Paperclip 同事名单（**不发请求**：名单取自 `workload.json` 的 `agents`，只读文件）打印：记录总数、`rejected / ignored / errorsSeen`、每位同事当前状态 + `recordId` + `since`、`unknown` 数量。输出里**不含密钥、地址、正文**。
6. **文档**：`README.md` 新增一节：数据来源、状态机图（文字版）、「没有记录就显示『暂无通勤记录』」的规则、与零 token 约束的关系、**M2-B 如何使用**（接口合同 `GET /town/state` 的 `residents[].commute` 字段：`{ state, since, recordId|null }`，**留给 M2-B 实现**）。

## 测试（`tests/town-commute.test.mjs`，用 `tests/fixtures/workhours-sample.log`）
- 解析：真实格式的四类行；重复行去重；乱序输入输出相同；噪声行；畸形行（空行、无时间戳、时间戳非法、岗位名含控制字符 / 超长 / 含空格 / 含 HTML）；超大输入（>2 MB）只读末尾；`id` 稳定性。
- 状态机：`at_office` / `leaving`（边界：恰好 `travelMs`）/ `in_town` / `arriving`（下一个上班时刻已知 / 未知）/ `unknown`（无记录、记录太旧、自相矛盾）；**没有记录绝不返回非 `unknown`**；`recordId` 必须能在 `records` 里找到。
- 金边日界：UTC 16:59 与 17:00 两侧；周日上班；`days` 为工作日子集时的周末跨度。
- 批量：名单外的岗位名计入 `unknownAgents`；名单内但无记录的人是 `unknown`。
- **零 token 静态检查**：`town-commute.mjs` 与 `town-commute-report.mjs` 不含 `fetch(`、`send(`、`chat_to_task`、`ollama`、`anthropic`、`openai`、`/api/companies/`、`POST`、`child_process`、`eval`、`new Function`、`Math.random`；不 import 任何业务模块（只允许 `node:` 内置）。
- **真实数据冒烟**（不进 CI，只在汇报里贴）：用报告脚本对真实日志跑一遍。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（基线 **518 项起**，不得放宽已有断言）；`node --check` 所有新增 `.mjs`。
- 汇报：每条做到没有；没做到的原因；**报告脚本在真实日志上的输出**（记录数、各同事当前状态、`unknown` 数量）；你对「下班后去哪里」「`arriving` 何时用」这些边界的取舍与理由；未验证项如实写。
- 确认：**没有改任何已有文件**（除 `README.md` 新增一节）；没有接任何路由；`workhours\` 下文件哈希不变（给出前后对比方法与结果）。
- **不要自己结束或重启进程。**
