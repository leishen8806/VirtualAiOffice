# DS-8（R2）汇报：派发准入统一——依赖口径一致 + 契约先于「可执行」检查（默认关闭）

- 状态：**待验收**
- 分支：`ds/DS-8-r2-dispatch-admission`
- 基线：`office3d/rev-20261023-2` @ `cbddb9f`
- 卡片：`dispatch/deepseek/inbox/DS-8-R2-dispatch-admission.md`

## 做到

1. **新增纯模块 `dispatch-policy.mjs`**（无网络、无文件 I/O；只依赖 `scheduler-core.mjs` 导出的状态常量与 `REASON_CODES`）：
   - `loadDispatchPolicy(raw)`：缺失 / 损坏 / 未知字段 / 未知 mode / 非布尔 `cancelledDependencySatisfies` → `{ mode: 'off' }`；合法 `warn` / `enforce` 返回冻结对象。
   - `decideAssign({ policy, issue, blockers, override, force, localFullAccess, at })`：
     - 依赖口径与调度核心一致：`done/completed` 满足；`cancelled/canceled` 默认不满足（`DEP_CANCELLED`），除非策略显式 `"cancelledDependencySatisfies": true`；依赖字段不可靠 → `DEP_UNKNOWN`；
     - `off` **完全保留旧行为**：取消算满足、`force:true` 直接放行、未完成用旧错误文案；
     - `warn`：一律放行，照常给 `DEP_PENDING` / `DEP_CANCELLED` / `DEP_UNKNOWN`；
     - `enforce`：未满足即拒绝，`force` 不再单独生效；唯一例外是 `override.reason` 去空白 ≥10 字 + `localFullAccess === true`（LAN / 大屏恒 false），放行时写 `audit`（override / 理由 / 时间）；尝试但不合格 → `OVERRIDE_NOT_ALLOWED`。
   - `decideCreate({ policy, contractCheck, wantsExecutable, at })`：`off` / `warn` 与现状一致（warn 附 `NO_CONTRACT` / `CONTRACT_INCOMPLETE`）；`enforce` 下契约不完整时 **只能建成草稿**（`forceDraft:true`，调用方置 `backlog` 且不指定负责人），契约完整才 `todo` + 负责人。
   - 原因码 = `scheduler-core.mjs` 的 `REASON_CODES` ∪ 本模块新增并导出的 `CONTRACT_INCOMPLETE`、`OVERRIDE_NOT_ALLOWED`；测试断言输出里没有未登记码。
2. **接线 `server.mjs` 两处入口**（`assign`、`create_issue`）：
   - 启动时读一次 `dispatch-policy.json`（运行数据、不入库；仓库提供 `dispatch-policy.json.example` = `{ "mode": "off" }`）；
   - `assign`：原有状态 / 资金类检查保留，依赖判定交给 `decideAssign`；`enforce` 拒绝返回中文错误 + 原因码（`status: 409`）且**0 次写请求**；合格特批放行时 PATCH 结果附带 `dispatchAudit`；
   - `create_issue`：**先把契约解析 / 校验提前到发请求之前**，再 `decideCreate` 决定 `body.status` / `assigneeAgentId`，最后只发 1 次 `POST`（不新增上游请求次数）；`CONTRACT_VIEW_ENABLED` 时返回结构保持 `contractCheck`，策略打开时额外带 `dispatchCheck`；
   - 局域网访问码、只读、Host 校验、`act()` 鉴权段未改动；「本机完整权限」沿用 DS-7 接好的 `options.localFullAccess`。
3. **README** 新增「派发准入」一节：三种模式、开关文件、依赖口径、例外规则、覆盖 / 未覆盖入口（Paperclip 原生指派、Agent 直接调上游不在范围内）。
4. **测试**：`tests/dispatch-policy.test.mjs`（8 个 test，纯模块矩阵）+ `tests/dispatch-policy-wiring.test.mjs`（6 个 test，从 `server.mjs` 提取真实 `act()` 到 `vm`，替身 `get` / `send`，不连真实上游）。

## 两处入口改前 / 改后行为对照

| 入口 | 改前 | `off`（默认） | `warn` | `enforce`（依赖未满足 / 契约不完整） | `enforce` + 本机特批 |
|---|---|---|---|---|---|
| `assign` | `done`/`cancelled` 都算满足；`force:true` 无理由放行；未完成 → 旧文案 400 | 请求与错误文案逐字段一致（含 force、取消算满足） | 照常 PATCH，结果无变化但判定 `reasons` 可查（当前不附加返回；见「未做到」） | 抛 409 + `DEP_*` 原因码，**0 次写请求**；force 不生效 | PATCH 一次，返回 `dispatchAudit`（override / 理由 / 时间）；LAN / 大屏 / 过短理由 → 409 + `OVERRIDE_NOT_ALLOWED` |
| `create_issue` | 先 POST 建 `todo`/`backlog`，再校验契约，只在返回值提示 `complete/incomplete` | 请求 body 与返回值逐字段一致（未开契约视图时只返回 created） | 请求与现状一致，返回值多 `dispatchCheck.reasons` | 契约不完整：**先判定、只发 1 次 POST**，body 改为 `backlog` 且删掉 `assigneeAgentId`，返回 `dispatchCheck.forcedDraft` + `CONTRACT_INCOMPLETE`/`NO_CONTRACT`；契约完整才 `todo` + 负责人 | 不适用（创建入口不提供例外） |

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/dispatch-policy.mjs` | 新增，231 行 |
| `office3d/dispatch-policy.json.example` | 新增，1 行 |
| `office3d/tests/dispatch-policy.test.mjs` | 新增，161 行 |
| `office3d/tests/dispatch-policy-wiring.test.mjs` | 新增，181 行 |
| `office3d/server.mjs` | +32 / −11 |
| `office3d/README.md` | +13 |
| `dispatch/deepseek/outbox/DS-8-report.md` | 新增（本报告） |

### `server.mjs` 逐行改动（相对 `cbddb9f`）

```diff
@@ -33,4 +33,5 @@
 import { loadCompletionPolicy, createCompletionGate, completionMessage } from './completion-policy.mjs'
+import { loadDispatchPolicy, decideAssign, decideCreate, dispatchMessage } from './dispatch-policy.mjs'
 import { createHandoff } from './handoff.mjs'
@@ -338,4 +339,8 @@
 })()
+// 派发准入（DS-8 R2）：同样默认关闭，dispatch-policy.json 是运行数据（不入库），启动时只读一次。
+const dispatchPolicy = (() => {
+  try { return loadDispatchPolicy(fs.readFileSync(path.join(HERE, 'dispatch-policy.json'), 'utf8')) } catch { return loadDispatchPolicy(null) }
+})()
 let completionGateFn = async () => ({ allow: true, mode: 'off', reasons: [], audit: null, skipped: true })
@@ -416,15 +421,22 @@
-    const created = await send('POST', `/api/companies/${COMPANY}/issues`, body)
-    if (!CONTRACT_VIEW_ENABLED) return created
+    // DS-8：契约先检查、再决定以什么状态创建（不新增上游请求次数）。
     const parsed = parseContract(description)
     const checked = parsed.found ? validateContract(parsed.contract, { assignee: body.assigneeAgentId || '' }) : null
-    return {
-      ...created,
-      contractCheck: {
-        state: !parsed.found ? 'none' : checked.ok ? 'complete' : 'incomplete',
-        errors: checked ? checked.errors.map((item) => ({ field: item.field, code: item.code })) : [],
-      },
+    const contractCheck = {
+      state: !parsed.found ? 'none' : checked.ok ? 'complete' : 'incomplete',
+      errors: checked ? checked.errors.map((item) => ({ field: item.field, code: item.code })) : [],
     }
+    const dispatchDecision = decideCreate({ policy: dispatchPolicy, contractCheck, wantsExecutable: Boolean(body.assigneeAgentId) })
+    if (dispatchDecision.forceDraft) {
+      body.status = 'backlog'
+      delete body.assigneeAgentId
+    }
+    const created = await send('POST', `/api/companies/${COMPANY}/issues`, body)
+    const dispatchCheck = dispatchPolicy.mode === 'off' || (!dispatchDecision.reasons.length && !dispatchDecision.forceDraft)
+      ? null
+      : { mode: dispatchDecision.mode, reasons: dispatchDecision.reasons, forcedDraft: dispatchDecision.forceDraft }
+    if (!CONTRACT_VIEW_ENABLED) return dispatchCheck ? { ...created, dispatchCheck } : created
+    return { ...created, contractCheck, ...(dispatchCheck ? { dispatchCheck } : {}) }
   }
   if (a.type === 'assign') {
@@ -433,7 +445,16 @@
     need(!MONEY_RE.test(i.description || '') || MONEY_OK.has(ag.name), '资金类任务只能交给 GoSenior 或 DBEngineer')
-    const open = (i.blockedBy || []).filter((b) => b.status !== 'done' && b.status !== 'cancelled')
-    need(!open.length || a.force === true, `依赖未完成：${open.map((b) => b.identifier).join('、')}`)
-    return send('PATCH', `/api/issues/${a.issueId}`, { assigneeAgentId: ag.id, status: 'todo' })
+    const blockers = Array.isArray(i.blockedBy) ? i.blockedBy : i.blockedBy ? [i.blockedBy] : []
+    const override = a.override === true || a.overrideReason ? { reason: str(a.overrideReason, 500) } : null
+    const dispatchDecision = decideAssign({ policy: dispatchPolicy, issue: i, blockers, force: a.force === true, override, localFullAccess: options.localFullAccess === true })
+    if (!dispatchDecision.allow) {
+      if (dispatchDecision.mode === 'off') {
+        const open = blockers.filter((b) => b && b.status !== 'done' && b.status !== 'cancelled')
+        need(false, `依赖未完成：${open.map((b) => b.identifier).join('、')}`)
+      }
+      throw Object.assign(new Error(dispatchMessage(dispatchDecision)), { status: 409 })
+    }
+    const result = await send('PATCH', `/api/issues/${a.issueId}`, { assigneeAgentId: ag.id, status: 'todo' })
+    return dispatchDecision.audit && dispatchDecision.audit.override ? { ...result, dispatchAudit: dispatchDecision.audit } : result
   }
```

## 第 4 条：需要放宽的既有守卫（未修改 `tests/state-last-good.test.mjs`）

`tests/state-last-good.test.mjs` 的「act auth and body are unchanged」用例通过 `actBody()` 归一化掉 DS-7 的签名与 review 分支；本卡改了 `assign` 与 `create_issue` 两个分支，**需要再放宽这两处**（其余仍逐字比较）。建议在 `actBody()` 的替换链末尾追加两条（本卡未改该测试文件）：

```js
const createRe = /  if \(a\.type === 'create_issue'\) \{[\s\S]*?\n  \}\n/
const assignRe = /  if \(a\.type === 'assign'\) \{[\s\S]*?\n  \}\n/
const actBody = (text) => text
  .replace(sigRe, 'async function act(a)')
  .replace(/\r\n/g, '\n')
  .replace(reviewRe, '  /* review */\n')
  .replace(createRe, '  /* create_issue */\n')
  .replace(assignRe, '  /* assign */\n')
```

已核对：两条正则在本分支的 `act()` 文本里**各恰好匹配 1 次**，匹配范围是完整分支块（含结尾 `  }\n`），替换后 `act()` 从 162 行降到 112 行，不再含原块。该测试文件在本快照里因缺 `office3d-backup-h2/server.mjs` 本来就无法加载（见下），请规划者在有备份的机器上按上面范围放宽后核对。

## 测试命令与输出

新增测试：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/dispatch-policy.test.mjs tests/dispatch-policy-wiring.test.mjs
```

```
# tests 14
# pass 14
# fail 0
# cancelled 0
# skipped 0
```

全量（`tests/*.test.mjs`）：

```
# tests 1180
# pass 1122
# fail 41
# cancelled 16
# skipped 1
```

同一快照 clean base（`cbddb9f`）全量对照：

```
# tests 1166
# pass 1108
# fail 41
# cancelled 16
# skipped 1
```

`1180 − 1166 = 14` 正好是本卡新增测试且全过；两次运行的 **not ok 名称集合逐项相同**（57 条 = 41 fail + 16 cancelled），没有新增失败。

### 干净副本里既有失败用例（缺本机运行数据，未修改）

| 文件 | 条数 | 现象 |
|---|---|---|
| `tests/command-view-live.test.mjs` | 16 | `Promise resolution is still pending but the event loop has already resolved`（实时数据用例被取消） |
| `tests/auth-routes.test.mjs` / `auth-accounts.test.mjs` / `tenancy-paths.test.mjs` / `tenancy-server.test.mjs` | 11 + 3 + 2 + 2 | `path resolves outside tenant root`（租户数据根在本机，快照里不存在） |
| `tests/evidence-version.test.mjs` / `memory.test.mjs` / `town-nav.test.mjs` | 2 + 2 + 2 | 依赖本机运行数据 / 路径 |
| `tests/state-last-good.test.mjs` / `town-map.test.mjs` / `warehouse-env.test.mjs` / `office-layout-v2.test.mjs` | 各 1（文件级失败） | `ENOENT`：快照缺 `office3d-backup-h2/`、地图 / 仓库运行数据 |
| `tests/dr-control-room.test.mjs` | 1 | 既有快照与断言不一致（正则不匹配） |
| 其余单条（`foyer-*`、`office-*`、`warehouse-*`、`pedestrian-stress`、`display-staff`、`town-map-api`、`command-view-routes`、`dr-campus-shell`） | 各 1 | 与本卡无关的既有失败；与 base 完全一致 |

## 没做到

- **`warn` 下 `assign` 的原因没有回传给调用方**：`assign` 的 PATCH 返回值当前保持与原接口一致（避免前端多一个字段），原因码只存在于 `decideAssign` 的返回里、由 server 内部消费；如果要在 warn 阶段让董事会看到原因，需要再决定展示位置（本卡未擅自改前端 / 返回结构）。
- 未开 PR（本机无 `gh` / GitHub token）；分支已推送，目标 `office3d/rev-20261023-2`。
- 未推 `main`、未 force；未把 `mode` 从 `off` 切到 `warn` / `enforce`（由项目负责人决定）。
- 未修改 `tests/state-last-good.test.mjs`（不在 scope，按卡片要求只列出放宽范围）。

## 未验证

- 规划者本机独立验收（按协议，自报「通过」不算）。
- 未连真实 Paperclip 做端到端：接线测试用替身 `get` / `send`（通过 `vm` 跑真实 `act()` 代码）。
- `evidence-version` / `dispatch-policy` 与 DS-7 完成策略同时打开时的组合效果未做长时间灰度。
- 未在真实 Windows 上跑接线测试（DS-6/6b 的 `autocrlf` 修复不在本卡范围内，本卡测试不依赖换行转换）。

## 范围外发现（只报告，未修复）

1. **旧 `assign` 对非数组 `blockedBy` 会直接崩溃**（`(i.blockedBy || []).filter` 要求数组）：本卡改为「数组照旧，单个对象包成数组，其它按空处理」，属顺带硬化，off 下对正常数组行为逐字段一致。
2. **`force:true` 旧行为无理由、无审计**：本卡只在 `off` 保留；`warn` / `enforce` 下 `force` 不再单独生效，enforce 必须换成本机 override（只对 assign）。
3. **创建入口没有 override**：按卡片实现；契约不完整在 enforce 下只能草稿，没有「特批成可执行」通道。
4. **两个默认关闭开关彼此独立**：`completion-policy.json` 与 `dispatch-policy.json` 需要分别开启；文档已分别说明，未做联动。
5. `scheduler-core.mjs` 的 `REASON_CODES` 已有 `NO_CONTRACT`，本模块只新增 `CONTRACT_INCOMPLETE` / `OVERRIDE_NOT_ALLOWED` 两个码。

## 交付

- 分支：`ds/DS-8-r2-dispatch-admission`（已推送，基于 `office3d/rev-20261023-2` @ `cbddb9f`）
- 只看不改：`scheduler-core.mjs`、`done-rules.mjs`、`completion-policy.mjs`、`app.js`、`ui.js`、`index.html`、局域网 / 大屏鉴权均未改动；`dispatch-policy.json` 未创建（默认 `off`）。
- 完成后停下，等待规划者验收。
