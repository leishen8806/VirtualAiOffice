# DS-4 汇报：`office3d/scheduler-core.mjs` 性质测试

- 状态：**待验收**
- 分支：`ds/DS-4-scheduler-core-property-tests`
- 基线：`office3d/rev-20261022` @ `eab61eb0b8aa6ff80084ac637489d6dd0d9f569b`
- PR：**未开**（本机没有 `gh` / GitHub token；按卡片要求把分支名交给派发人）
- 卡片：`dispatch/deepseek/inbox/DS-4-scheduler-core-property-tests.md`

## 做到

新增 `office3d/tests/scheduler-core-properties.test.mjs`（314 行，8 个 test，31 处 `assert` 调用点；执行时循环内断言 > 4000 个点），只加测试、不改被测代码。

随机输入确定性：

- 测试自带 `mulberry32`，固定种子 **1–40**，不使用 `Math.random` / `Date.now`；
- 每个种子生成 15–19 个任务，混入：干净任务（含同一负责人多任务）、金额类（标题 / `contract.交付物`）、依赖未完成、依赖已取消、依赖已完成、`dependencyKnown:false`、状态不对、无负责人、已锁、等董事会、父任务未进行中；
- `ctx` 覆盖 `agents` 状态（idle / paused / error）、`openCount`、`budgetRemaining`（数值 / 0 / null）、`openLimitPerAgent`、`dailyDispatchLimit`、`dispatchedToday`、`maxDataAgeMs`、`policy`，`limit` 取 2–5。

覆盖卡片要求的性质：

1. **选中项一定合格**：每个 `pickNext` 选中项单独 `evaluateTask` 都 `eligible === true`，且没有 `severity: 'block'` 的原因。
2. **永不选不该选的任务**：金额类、依赖未完成/已取消、状态不对、无负责人、已锁、等董事会的任务都不会被选中（金额判断用 `MONEY_RE` 独立复核）。
3. **数量上限与配额**：`picks.length ≤ limit`；同一负责人选中数 ≤ `openLimitPerAgent - openCount`。
4. **顺序不变性**：同一任务集用另一固定种子打乱后，`picks` 逐字段完全一致；选中项优先级分数非升序（排序方向不变）。
5. **纯度**：深度冻结入参不抛错；同一输入重复调用逐字段相等；结果递归检查无 `undefined` / `NaN`。
6. **`revalidate` 一致性**：刚选出的决策在未变化数据下 `stillEligible === true`、`changed` 为空；依赖改为未完成 / 负责人暂停 / 预算耗尽后 `stillEligible === false`，且 `changed` 含对应原因码。
7. **原因码合法**：`skipped`、`evaluateTask`、`revalidate.changed` 里所有原因码都属于 `REASON_CODES`。

与既有 `tests/scheduler-core.test.mjs` 的分工：那边是 16 个「例子」，本卡是 40 个种子的「不变式」，未重复其断言。

## 验证证据

验收命令（与卡片一致）：

```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/scheduler-core-properties.test.mjs tests/scheduler-core.test.mjs
```

真实输出末尾：

```
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 82.368042
```

单文件运行 < 0.1 s（远低于 10 s 上限）。

## 变异自检（6 种，全部通过环境变量指向临时副本）

做法：把 `office3d` 根目录所有 `.mjs` 复制到系统临时目录，对副本的 `scheduler-core.mjs` 施加变异，`SCHEDULER_CORE_MODULE=<副本>` 运行 `tests/scheduler-core-properties.test.mjs`；完成后删除副本。

| 变异 | 结果 | 变红的性质测试 |
|---|---|---|
| 去掉金额类过滤 | exit=1，7 pass / 1 fail | `性质：永不选金额类…` |
| 排序优先级方向反转 | exit=1，7 pass / 1 fail | `性质：选中顺序按优先级分数不升序` |
| 让 `limit` 失效 | exit=1，7 pass / 1 fail | `性质：选中数不超过 limit…` |
| 去掉每负责人配额 | exit=1，7 pass / 1 fail | `性质：选中数不超过 limit…` |
| 依赖已取消不再拦截 | exit=1，7 pass / 1 fail | `性质：永不选金额类…` |
| `revalidate` 总是通过 | exit=1，7 pass / 1 fail | `性质：刚选出的决策…拦下且原因码合法` |

每种变异的失败摘要：

```
=== money       exit=1  # tests 8 # pass 7 # fail 1
=== sort        exit=1  # tests 8 # pass 7 # fail 1
=== limit       exit=1  # tests 8 # pass 7 # fail 1
=== quota       exit=1  # tests 8 # pass 7 # fail 1
=== cancelled   exit=1  # tests 8 # pass 7 # fail 1
=== revalidate  exit=1  # tests 8 # pass 7 # fail 1
```

副本删除后 `git diff --stat office3d/scheduler-core.mjs office3d/standup.mjs` 为空；再跑验收命令恢复 24/24 通过。

## 没做到

- 未开 PR / 未转 Ready：本机无 `gh` 与 GitHub token，只有 SSH 推送权限。分支已推送：`ds/DS-4-scheduler-core-property-tests`，目标 `office3d/rev-20261022`。
- 未推 `main`、未 force、未合并。

## 未验证

- 董事会本机独立验收（按协议，自报「通过」不算）。
- 没有用真实 Paperclip 任务数据跑性质测试（按卡片使用固定种子合成输入）。
- 随机空间是有限的：40 个种子，不构成全部输入空间的证明。
- 未覆盖 `standup.mjs` 的 `MONEY_RE` 本身是否正确（只把它当作金额判断的外部口径）。
- 未覆盖并发 / 时间推进 / 真实 `openCount` 变化；这些属于调度器外围。

## 范围外发现（只报告，未修复）

1. **`agent.openCount` 不是整数时，任务“可选但永远选不上”**：
   agent 快照 `{ id:'a1', status:'idle', budgetRemaining:1 }`（没有 `openCount`），任务 `{ status:'todo', priority:'high', assigneeAgentId:'a1', blockedBy:[] }`。
   `evaluateTask` 返回 `eligible: true`、无原因；但 `pickNext` 的配额计算对非整数 `openCount` 取 0，于是该任务进入 `skipped`（`AGENT_AT_LIMIT`）且 `picks` 为空。
2. **`revalidate` 的 `changed` 只比较原因码集合，漏掉严重级别变化**：
   决策为 `NO_CONTRACT`（warn，`eligible:true`），把 `policy.requireContract` 改成 `true` 后在新鲜数据上重新校验：`stillEligible:false`，但 `changed: []`（原因码都是 `NO_CONTRACT`，只是从 warn 变 block）。调用方无法从 `changed` 看出策略收紧。
3. **`dailyDispatchLimit: 0` 会把所有任务都标记为 `DAILY_LIMIT`**：语义上等价「今天不允许派发」，若这不是预期，需要在配置侧禁止 0。
4. 卡片里提到的其它规则（父任务、契约 warn、预算 null）在性质测试中只作为随机输入的一部分，未逐条做独立性质断言——已有例子测试覆盖，本卡未重复。

## 改动文件与行数

| 文件 | 变更 |
|---|---|
| `office3d/tests/scheduler-core-properties.test.mjs` | 新增，314 行 |
| `dispatch/deepseek/outbox/DS-4-report.md` | 新增（本报告） |

`office3d/scheduler-core.mjs`、`office3d/standup.mjs`、`server.mjs`、`app.js`、`ui.js`、`index.html` 均未改动。
