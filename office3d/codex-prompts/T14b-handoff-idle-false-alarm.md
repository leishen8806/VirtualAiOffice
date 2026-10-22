# T14b-handoff-idle-false-alarm：「长停留」会对「正在按计划等待」的任务误报，修掉

先读 `_common.md`、`T14-handoff-package.md`。T14 已验收（369 项测试全过；默认关闭；大屏令牌 403；在真实任务上没有误报触发）。**本任务只修 `handoff.mjs` 的 T4「长停留」判断（及其测试、README 说明）。**

**例外规则：** 只允许修改 `handoff.mjs`、`tests/handoff.test.mjs`、`README.md`。**不要改** `server.mjs` 和其它所有模块。**验证时不得向 Paperclip 发任何写请求。** 备份到 `office3d-backup-handoff-idle`（办公室目录没有 Git）。改了服务端模块，**让人重启服务**（汇报里写明，不要自己结束进程）。

## 问题（真实数据上看出来的）
`detectTriggers` 的 T4：任务 `in_progress` 且 24 小时内没有新评论和新运行 → 触发「长停留」，打开总开关后会**给负责人发一条【交接巡检】评论并唤醒他**。但我们现在有一类任务**本来就在按计划等待**，并不是「卡住」：
- 例如 **CMP-285 / CMP-310 / CMP-311**：状态 `in_progress`，Paperclip 的任务监控已安排好下次检查（任务字段 `monitorNextCheckAt`、`executionState.monitor` 里 `status: scheduled`，`nextCheckAt` 在未来，并带 `maxAttempts` / `timeoutAt`），负责人评论里写明「明天 13:00 开工，此前不探测机器」；
- 任务在**等董事会回答**（有 `pending` 的 `ask_user_questions` / 确认卡）；
- 任务在**等依赖**（`blockedBy` 里有未完成的任务，`blockerAttention.unresolvedBlockerCount > 0`）。
这些任务过 24 小时没动作是**预期**的，提醒他「补写交接包」既多余又会唤醒他、产生多余运行。

## 要求
1. **T4 不触发的情形**（任一成立就不触发「长停留」，并在 `preview` 里给出被跳过的原因 `skip: 'monitor_scheduled' | 'waiting_board' | 'waiting_dependency'`，便于治理中心显示）：
   - 任务有**已安排且未过期**的监控：`monitorNextCheckAt` 在未来，或 `executionState.monitor.status === 'scheduled'` 且 `nextCheckAt` 在未来、`timeoutAt` 尚未到；
   - 任务有**待回答的交互卡**（用已有的只读接口 / 任务字段判断；取不到就**不要猜**，按「不跳过」处理但在 `gaps` 里写明「无法判断是否在等董事会」）；
   - 任务有**未完成的依赖**：`blockedBy` 里存在状态不是 `done` / `cancelled` 的任务，或 `blockerAttention.unresolvedBlockerCount > 0`。
2. **监控已过期仍无动作**（`nextCheckAt` 已过去 ≥ 2 小时，而且没有新评论 / 新运行）**应当触发**——那说明计划好的唤醒没有生效，正是需要提醒的情况；`detail` 里写明「监控应在 hh:mm 检查，至今无动作」。
3. 不改变：T1（运行中断）、T2（转阻塞）、T3（换人）、资金类只显示不发评论、限流、冷却、总开关默认关闭、脱敏。**不要放宽 T1–T3**。
4. 读取这些字段用 `issue` 对象上已有的字段（列表接口已带 `monitorNextCheckAt`、`executionState`、`blockedBy`、`blockerAttention`）；**不要新增 Paperclip 请求**（如果某字段在列表接口里没有，写明哪个字段缺，并按「不跳过 + `gaps` 说明」处理）。

## 测试（`tests/handoff.test.mjs`，保持原有断言，不得放宽）
- **用真实字段形状做用例**（可参考：`monitorNextCheckAt: '2026-10-20T06:00:00Z'`；`executionState: { status: 'idle', monitor: { kind: 'external_service', status: 'scheduled', nextCheckAt: '…', timeoutAt: '…', maxAttempts: 4 } }`；`blockerAttention: { state: 'none', unresolvedBlockerCount: 0 }`）：
  - `in_progress` + 24 小时无动作 + 监控 6 小时后检查 → **不触发**，`skip: 'monitor_scheduled'`；
  - 同上但监控 `nextCheckAt` 已过去 3 小时仍无动作 → **触发**；
  - `in_progress` + 有未完成依赖 → 不触发，`skip: 'waiting_dependency'`；依赖已全部完成后再无动作 24 小时 → 触发；
  - 有待回答的交互卡 → 不触发；取不到交互信息 → 触发但 `gaps` 里有说明；
  - 没有监控、没有依赖、没有交互卡、24 小时无动作 → 触发（原行为不变）。
- 端到端（模拟 Paperclip）：上面三类等待状态的任务，开启总开关后 `run()` **不发评论、不通知**；真正卡住的任务仍然提醒一次。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --check handoff.mjs`。
- **在真实数据上重跑**（只读脚本放 `tests/` 之外的临时位置，只发 GET）：把 `now` 设成「当前时间 + 25 小时」重跑 `detectTriggers` 对所有活动任务（模拟明天这个时候），列出每个任务是否触发、被跳过的原因；**CMP-285 / 310 / 311 必须被判为「监控等待」而不触发**（如果它们的监控已经过期则按要求 2 触发，写明）。
- 汇报：每条要求做到没有；没做到的原因；**没有任何写路径被触发**要明确写出。
