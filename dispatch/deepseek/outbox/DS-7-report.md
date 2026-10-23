# DS-7（R1）汇报：完成策略统一——「接受」前核对证据与版本（默认关闭）

- 状态：**待验收**
- 分支：`ds/DS-7-r1-completion-policy`
- 基线：`office3d/rev-20261023` @ `15fac34`
- PR：**未开**（本机没有 `gh` / GitHub token；按卡片把分支名交给派发人）
- 卡片：`dispatch/deepseek/inbox/DS-7-R1-completion-policy.md`

## 做到

1. **新增纯模块 `completion-policy.mjs`**（无网络 / 无文件 I/O，只 import `done-rules.mjs` 与 `command-view-validate.mjs`）：
   - `loadCompletionPolicy(raw)`：缺失 / 空 / 非法 JSON / 未知 mode / 未知字段 / 非法 `enforcedSince` / 非法 `boardActors` 一律回退 `{ mode: 'off' }`（失败关闭）；合法 `warn` / `enforce` 返回冻结对象。
   - `decideCompletion({ policy, task, evidence, override, localFullAccess, at })`：
     - `off`：`allow:true`、`reasons:[]`，不读证据（与改前一致）；
     - `warn`：`allow:true`，问题写进 `reasons` 与 `audit.warnOnly`；
     - `enforce`：证据无效 → `allow:false`；旧任务（`createdAt < enforcedSince`）→ `LEGACY_BASELINE` 放行；
     - 人工特批：仅 `enforce` + `localFullAccess === true` + 理由去空白后 ≥10 字 → 放行，`audit` 记 `override:true`、理由、时间；LAN / 大屏（`localFullAccess:false`）永远拿 `OVERRIDE_NOT_ALLOWED`；
     - `reasons` 只来自 `REASON_CODES` ∪ 本模块新增并导出的 `NO_EVIDENCE` / `OVERRIDE_NOT_ALLOWED`（测试断言无未登记码）。
   - `buildCompletionEvidence`：从任务评论的【验收证据】+ `evidence-version` 结果构造简化证据；`createCompletionGate`：默认 `off` 时**零 GET**，`warn`/`enforce` 时才读任务 / 评论 / 版本核对。
2. **三处入口接线统一走 `completionGateFn`**：`act()` 的 `review accept`、`tgActions.review`（Telegram）、`acceptance.mjs` 自动验收批次。
   - `allow:false`：`act()` 返回中文错误（列原因码）并 **不发 `PATCH done`**；Telegram 抛错同样不发；自动验收批次跳过该项、记 `POLICY_BLOCKED`、继续其它项。
   - `warn`：照常完成，在既有验收评论里追加一行「完成策略（warn）提示」，不新增通知。
   - **本机完整权限**：`/act` 调用处传 `!lanUser && !wallScope`；Telegram 与自动验收均传 `false`（不能特批）。LAN 访问码、只读、Host 校验、`act()` 鉴权段**未改动**。
   - 开关文件 `completion-policy.json` 启动时读一次（运行数据，不入库）；仓库只提供 `completion-policy.json.example`（`{ "mode": "off" }`）。
3. **README** 新增「完成策略」一节：三种模式、判定口径、特批规则、开关文件、覆盖 / 未覆盖入口（照抄 `done-rules.mjs` 的 `enforcementBoundary` 口径）。
4. **测试**：`tests/completion-policy.test.mjs`（14 个 test，纯模块矩阵）+ `tests/completion-policy-wiring.test.mjs`（10 个 test，替身 get/send，不连 Paperclip）。

## 三处入口改前 / 改后行为对照

| 入口 | 改前 | `off`（默认） | `warn` | `enforce`（证据无效） | `enforce` + 本机特批 |
|---|---|---|---|---|---|
| `act()` review accept | 直接 `PATCH done` | 同一 `PATCH`，无额外 GET | `PATCH done` + 评论追加原因 | 抛 409 中文错误，**0 次 done PATCH** | `PATCH done`，`audit.override=true`；LAN / 大屏仍拒绝 |
| `tgActions.review`（Telegram） | 评论 + `PATCH done` | 同一评论 + `PATCH` | 同左 + 评论追加原因 | 抛错，**0 次 done PATCH** | 不适用（非本机，永远不能特批） |
| `acceptance.mjs` 自动验收批次 | 委员会通过 → 评论 + `PATCH done` | 同一路径（无 gate 或 gate 直接放行） | 同左 + 评论追加原因 | 跳过该项：`outcome=POLICY_BLOCKED`、**0 次 done PATCH**、留董事会，其它项照常 | 不适用（批次不特批） |

证据 → 原因码：无证据 `NO_EVIDENCE`；版本已变 `VERSION_MISMATCH`；受保护测试不符 `PROTECTED_TEST_MISMATCH`；执行者自评 `REVIEW_NOT_INDEPENDENT`；验收者非授权 `BOARD_ACCEPTANCE_REQUIRED`；旧任务 `LEGACY_BASELINE`（放行）。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/completion-policy.mjs` | 新增，257 行 |
| `office3d/completion-policy.json.example` | 新增，1 行 |
| `office3d/server.mjs` | +24 / −5 |
| `office3d/acceptance.mjs` | +16 / −2 |
| `office3d/README.md` | +14 |
| `office3d/tests/completion-policy.test.mjs` | 新增，232 行 |
| `office3d/tests/completion-policy-wiring.test.mjs` | 新增，194 行 |
| `dispatch/deepseek/outbox/DS-7-report.md` | 新增（本报告） |

### `server.mjs` 逐行改动（相对 `15fac34`）

```diff
@@ -32,4 +32,5 @@ import { createBlockedPatrol, blockedReason } from './blocked.mjs'
 import { createRework } from './rework.mjs'
 import { createEvidenceVersion } from './evidence-version.mjs'
+import { loadCompletionPolicy, createCompletionGate, completionMessage } from './completion-policy.mjs'
 import { createHandoff } from './handoff.mjs'
@@ -333,5 +334,11 @@
 const ledger = createEventsLedger({ redactText, dir: HERE, now: Date.now, tz: PNH.tz, names: readNames })
 
-async function act(a) {
+// 完成策略（DS-7 R1）：默认关闭。completion-policy.json 是运行数据（不入库），启动时只读一次。
+const completionPolicy = (() => {
+  try { return loadCompletionPolicy(fs.readFileSync(path.join(HERE, 'completion-policy.json'), 'utf8')) } catch { return loadCompletionPolicy(null) }
+})()
+let completionGateFn = async () => ({ allow: true, mode: 'off', reasons: [], audit: null, skipped: true })
+
+async function act(a, options = {}) {
   const need = (cond, msg) => { if (!cond) throw Object.assign(new Error(msg), { status: 400 }) }
@@ -373,6 +380,14 @@
   if (a.type === 'review') {
     need(UUID.test(a.issueId || '') && ['accept', 'changes'].includes(a.decision), '参数不对')
-    const note = str(a.note, 8000)
+    let note = str(a.note, 8000)
     need(a.decision === 'accept' || note, '要求修改时请写明要改什么')
+    if (a.decision === 'accept') {
+      const override = a.override === true || a.overrideReason ? { reason: str(a.overrideReason, 500) } : null
+      const decision = await completionGateFn(a.issueId, { override, localFullAccess: options.localFullAccess === true })
+      if (!decision.allow) throw Object.assign(new Error(completionMessage(decision)), { status: 409 })
+      if (decision.mode === 'warn' && decision.reasons.length > 0) {
+        note = `${note ? `${note}\n\n` : ''}**完成策略（warn）提示：** ${decision.reasons.join('、')}`
+      }
+    }
     if (note) await send('POST', `/api/issues/${a.issueId}/comments`, { body: (a.decision === 'accept' ? '**董事会验收通过。**\n\n' : '**董事会要求修改：**\n\n') + note })
@@ -756,5 +771,8 @@
   async review(issueId, who) {
-    await send('POST', `/api/issues/${issueId}/comments`, { body: `**董事会验收通过（${who}，经 Telegram）。**` })
+    const decision = await completionGateFn(issueId, { localFullAccess: false })
+    if (!decision.allow) throw new Error(completionMessage(decision))
+    const hint = decision.mode === 'warn' && decision.reasons.length ? `\n\n**完成策略（warn）提示：** ${decision.reasons.join('、')}` : ''
+    await send('POST', `/api/issues/${issueId}/comments`, { body: `**董事会验收通过（${who}，经 Telegram）。**${hint}` })
     return send('PATCH', `/api/issues/${issueId}`, { status: 'done' })
@@ -780,5 +798,6 @@
 const versionCheck = async (id) => { const r = await evidenceVersion.checkByIdent(id); return r && !r.disabled ? r : null }
-const acceptance = createAcceptance({ dir: HERE, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t).catch(() => {}), rework: (id) => rework.isCapped(id), versionCheck })
+completionGateFn = createCompletionGate({ policy: completionPolicy, get, versionCheck })
+const acceptance = createAcceptance({ dir: HERE, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t).catch(() => {}), rework: (id) => rework.isCapped(id), versionCheck, completionGate: (id) => completionGateFn(id, { localFullAccess: false }) })
 acceptance.start()
@@ -1143,5 +1162,5 @@
         try {
-          const result = await act(body)
+          const result = await act(body, { localFullAccess: !lanUser && !wallScope })
```

### `acceptance.mjs` 逐行改动（相对 `15fac34`）

```diff
@@ -25,5 +25,5 @@
-export function createAcceptance({ dir, company, get, send, notify, rework = () => false, versionCheck = async () => null, log = console.log, staggerMs = 15000 }) {
+export function createAcceptance({ dir, company, get, send, notify, rework = () => false, versionCheck = async () => null, completionGate = null, log = console.log, staggerMs = 15000 }) {
@@ -135,5 +135,19 @@
       if (it.tally.escalate === 0 && it.tally.approve >= 3) {
-        await send('POST', `/api/issues/${it.issueId}/comments`, { body: `**委员会验收通过**（${line}）。原因：待验收超过 1 小时没人处理，按董事会规则由委员会投票。\n${why(['APPROVE'])}` })
+        // DS-7：自动验收也必须过完成策略；enforce 拦下时跳过该项、记原因，不影响其它项。
+        let warnHint = ''
+        if (completionGate) {
+          let gate
+          try { gate = await completionGate(it.issueId) } catch (e) { gate = { allow: false, mode: 'enforce', reasons: ['NO_EVIDENCE'], note: String(e && e.message ? e.message : e).slice(0, 160) } }
+          if (!gate || gate.allow !== true) {
+            it.outcome = 'POLICY_BLOCKED'
+            it.note = `完成策略拦下：${(gate && gate.reasons && gate.reasons.length ? gate.reasons.join('、') : (gate && gate.note) || '证据不足')}`
+            out.board.push(it)
+            db.decided[`${it.issueId}@${it.since}`].outcome = 'POLICY_BLOCKED'
+            continue
+          }
+          if (gate.mode === 'warn' && Array.isArray(gate.reasons) && gate.reasons.length) warnHint = `\n\n**完成策略（warn）提示：** ${gate.reasons.join('、')}`
+        }
+        await send('POST', `/api/issues/${it.issueId}/comments`, { body: `**委员会验收通过**（${line}）。原因：待验收超过 1 小时没人处理，按董事会规则由委员会投票。\n${why(['APPROVE'])}${warnHint}` })
         await send('PATCH', `/api/issues/${it.issueId}`, { status: 'done' })
         it.outcome = 'ACCEPTED'; out.done.push(it)
```

## 测试命令与输出

新增测试（卡片要求的两个文件）：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/completion-policy.test.mjs tests/completion-policy-wiring.test.mjs
```

```
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 62.791458
```

全量（`tests/*.test.mjs`）：

```
# tests 1141
# pass 1083
# fail 41
# cancelled 16
# skipped 1
```

同一快照的 **clean base**（`15fac34`）全量对照：

```
# tests 1117
# pass 1059
# fail 41
# cancelled 16
# skipped 1
```

`1141 − 1117 = 24` 正好是本卡新增测试且全过；两次运行的 **not ok 名称集合逐项相同**（57 条 = 41 fail + 16 cancelled），没有任何新增失败。

### 干净副本里既有失败用例（缺本机运行数据，未修改）

| 文件 | 条数 | 现象 |
|---|---|---|
| `tests/command-view-live.test.mjs` | 16 | `Promise resolution is still pending but the event loop has already resolved`（依赖实时数据/时钟的用例被取消） |
| `tests/auth-routes.test.mjs` / `auth-accounts.test.mjs` / `tenancy-paths.test.mjs` / `tenancy-server.test.mjs` | 11 + 3 + 2 + 2 | `path resolves outside tenant root`（租户数据根在本机，快照里不存在） |
| `tests/evidence-version.test.mjs` / `memory.test.mjs` / `town-nav.test.mjs` | 2 + 2 + 2 | 依赖本机运行数据文件 / 路径 |
| `tests/state-last-good.test.mjs` / `town-map.test.mjs` / `warehouse-env.test.mjs` / `office-layout-v2.test.mjs` | 各 1（文件级失败） | `ENOENT`：快照排除了 `office3d-backup-h2/`、地图 / 仓库运行数据 |
| `tests/dr-console-static.test.mjs` | 1 | `The input did not match the regular expression /\.videoGrid \.sceneThumb…/`（既有快照与断言不一致） |
| 其余单条（`foyer-*`、`office-*`、`warehouse-*`、`pedestrian-stress`、`display-staff`、`town-map-api` 等） | 各 1 | 与本卡无关的既有失败；与 base 完全一致 |

## 没做到

- 未开 PR / 未转 Ready：本机无 `gh` 与 GitHub token。分支已推送：`ds/DS-7-r1-completion-policy`，目标 `office3d/rev-20261023`。
- 未推 `main`、未 force、未合并。
- 未把 `mode` 从 `off` 切到 `warn` / `enforce`（按卡片由项目负责人决定）。
- 未新增任何 Paperclip 写请求或轮询：自动验收 / review 只在原路径上做一次性的只读 GET（仅 `warn`/`enforce` 时）。

## 未验证

- 董事会本机独立验收（按协议，自报「通过」不算）；规划者会用 `tools/verify-branch.mjs` 与真实服务只读核对。
- 未连真实 Paperclip 做端到端：接线测试全部用替身 `get` / `send`。
- 未在真实 `warn` / `enforce` 下跑长时间灰度；未验证 Telegram 实际交互（抛错后 Telegram 侧如何显示未实测）。
- `evidence-version` 默认关闭时，`warn`/`enforce` 下简化证据的版本一律按「无法核对」处理（映射为 `VERSION_MISMATCH` / `NO_EVIDENCE`）；该组合的真实数据效果未验证。

## 范围外发现（只报告，未修复）

1. **`done-rules.mjs` 的 6 个原因码不可达**（`NO_TEST` / `NO_REVIEW` / `REVIEW_NOT_INDEPENDENT` / `NO_ACCEPTANCE` / `NO_MERGE` / `NO_RELEASE` 只在枚举里，`evaluateDone` 不产出）：本卡用 `REVIEW_NOT_INDEPENDENT` 做自评原因码，但它是本模块自己判定的，不是 `evaluateDone` 的产出。与 DS-3 报告一致。
2. **`sameVersion` 对非字符串入参误判相等**（DS-5 已报告）：本模块全部走结构化证据，未受影响，但若将来简化证据直接传非字符串版本号需要先修。
3. **`evidence-version.mjs` 默认关闭时无法给出「版本一致」**：`warn`/`enforce` 想真正核对版本，必须同时打开 `evidence-version.json`；否则一律按无法核对处理。建议运行文档里把两个开关一起说明。
4. **Telegram 验收入口没有「本机特批」通道**：这是设计如此（远端不能特批），但被拦时 Telegram 侧只显示通用失败，董事会需要回办公室页面看原因。
5. **自动验收批次被 `POLICY_BLOCKED` 的项会计入「留给你」**，与 `BOARD` 收件箱语义一致；但 `decided[issue@since]` 已写入结果，同一次等待不会重试（符合现状逻辑）。

## 交付

- 分支：`ds/DS-7-r1-completion-policy`（已推送，基于 `office3d/rev-20261023` @ `15fac34`）
- 只看不改：`completion-policy.json` 未创建（默认 `off` 生效）；`done-rules.mjs`、`app.js`、`ui.js`、`index.html`、局域网 / 大屏鉴权均未改动。
- 完成后停下，等待规划者验收。
