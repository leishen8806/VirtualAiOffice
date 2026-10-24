---
id: DS-7
base: office3d/rev-20261023
branch: ds/DS-7-r1-completion-policy
scope:
  - office3d/completion-policy.mjs
  - office3d/completion-policy.json.example
  - office3d/tests/completion-policy.test.mjs
  - office3d/tests/completion-policy-wiring.test.mjs
  - office3d/server.mjs
  - office3d/acceptance.mjs
  - office3d/README.md
budget: 4h
---
# DS-7（R1）：完成策略统一——「接受」之前必须核对证据与版本（默认关闭的开关）

**问题（已在当前代码核实）：** office3d 把任务写成 `done` 的入口有三处，**都不核对证据**：
1. `server.mjs` 的 `act()` → `type === 'review'`，`decision === 'accept'` 时直接 `PATCH { status: 'done' }`（约第 373–378 行）；
2. `server.mjs` 约第 759 行另一处 `PATCH { status: 'done' }`（先读上下文确认它是什么入口）；
3. `acceptance.mjs` 约第 138 行自动验收批次里的 `PATCH { status: 'done' }`。
仓库里已经有现成的判定引擎：`done-rules.mjs`（`evaluateDone`、`sameVersion`、`REASON_CODES`）与 `command-view-validate.mjs` 的 `evaluateCommandEvidence`（同版本、受保护测试哈希、执行者不得自评、验收者必须是授权身份）。**不要再造一套规则，复用它们。**

## 要做的事
1. **新增纯模块 `completion-policy.mjs`**（无网络、无文件 I/O，Node 可测）：
   - `loadCompletionPolicy(raw)`：解析开关对象；**缺失、损坏、未知字段一律视为 `{ mode: 'off' }`**。合法形状：`{ "mode": "off" | "warn" | "enforce", "enforcedSince": "<ISO 时间>", "boardActors": [...] }`。
   - `decideCompletion({ policy, task, evidence, override })` → `{ allow: boolean, mode, reasons: string[], audit: {...} }`：
     - `off`：一律 `allow: true`，`reasons: []`（**与现状完全一致**）；
     - `warn`：一律 `allow: true`，但用 `evaluateCommandEvidence`（或直接 `evaluateDone`）算出的问题写进 `reasons`；
     - `enforce`：证据无效（缺证据、版本不一致、受保护测试不符、自评、验收者非授权身份、任务创建早于 `enforcedSince` 以外的情形按 `LEGACY_BASELINE` 处理并**允许**）→ `allow: false`；
     - **人工特批**：`override = { reason }`，仅当 `reason` 去空白后 ≥ 10 字且调用方声明为本机完整权限（不是 LAN、不是大屏）时 `allow: true`，并在 `audit` 里记下 `override: true`、理由、时间；LAN / 大屏永远不能特批。
   - `reasons` 只能取自 `done-rules.mjs` 的 `REASON_CODES` 或本模块新增并导出的少量码（如 `NO_EVIDENCE`、`OVERRIDE_NOT_ALLOWED`），**测试里断言没有未登记的码**。
2. **接线（三处入口统一走 `decideCompletion`）：**
   - 证据来源复用现有 `evidence-version.mjs` / 任务评论里的【验收证据】解析（先读它们，选现成的读取方式；**不新增 Paperclip 写请求，不新增轮询**）；
   - `allow: false` 时：`review` 返回中文错误（列出原因码与一句说明），**不发 PATCH**；自动验收批次跳过该项并在批次结果里记原因，不影响其它项；
   - `warn` 时照常完成，但在评论或返回值里附上原因（沿用现有评论写法，不额外制造通知）；
   - 开关文件 `completion-policy.json`（运行数据，**不入库**；提供 `completion-policy.json.example`，内容 `{ "mode": "off" }`）在启动时读取一次，与其它默认关闭开关一致。
   - **局域网访问码、只读、Host 校验、`act()` 鉴权段保持原样**；特批的「本机完整权限」判断复用现有判定，不新增身份机制。
3. **测试：**
   - 纯模块矩阵：三种模式 × {有效证据、缺证据、版本不符、受保护测试不符、自评、非授权验收者、旧任务} × {无特批、合格特批、过短理由、LAN 特批}；
   - 开关解析：缺失 / 空文件 / 非法 JSON / 未知 mode / 额外字段 → `off`；
   - 接线测试（用替身 `send` / `get`，**不连真实 Paperclip**）：`off` 下三处入口的 PATCH 调用与改前**逐字段一致**；`enforce` 下缺证据时 **0 次** `status: 'done'` 的 PATCH；合格特批时 PATCH 发生且审计记录存在；
   - 全量 `node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/*.test.mjs` 全过（干净副本里因缺本机运行数据而无法运行的既有用例，逐个列出，不要去改它们）。
4. **README：** 新增「完成策略」一节：三种模式、开关文件、特批规则、覆盖与未覆盖的入口（照抄 `done-rules.mjs` 的 `enforcementBoundary` 口径：Agent 直接改 Paperclip 状态、Paperclip 原生入口不在本规则覆盖范围内）。

## 不做的事
不改 `done-rules.mjs` 的判定逻辑（发现问题只报告）；不改局域网 / 大屏鉴权；不默认开启（`mode` 默认 `off`）；不碰 `app.js / ui.js / index.html`；不联网、不装依赖；不推 `main`、不 force；报告里不得出现任何密钥、IP、本机路径或账号。

## 交付
- 分支 `ds/DS-7-r1-completion-policy`，推送后把分支名告诉派发人；
- `dispatch/deepseek/outbox/DS-7-report.md`：做到 / 没做到 / 未验证；改动文件与行数（`server.mjs`、`acceptance.mjs` 的改动**逐行列出**）；测试命令与输出末尾；三处入口改前 / 改后的行为对照表；范围外发现；
- 完成后停下，等待规划者验收。规划者会用 `tools/verify-branch.mjs`（若 DS-6 已合入）与真实服务的只读核对再验收，**开关由项目负责人决定何时从 off 切到 warn / enforce**。
