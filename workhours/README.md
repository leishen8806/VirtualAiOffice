# 作息调度（金边时间）

让 agent 按作息运行：**每天（周一到周日）24 小时（金边时间 UTC+7）**。规则在 `workhours.json`，改完不用重启（每分钟重新读取）。每日晨会仍由 `workhours.json` 的 `standup.at`（默认 08:35）决定。

```bash
node E:\VirtualAIOffice\paperclip-ops\workhours\workhours.mjs
```

- 24 小时模式下没有下班切换，调度器不会自动暂停或恢复 agent；已有的手动暂停保持不变。
- 若未来恢复有界作息，上班时间只恢复**本程序暂停过**的 agent（记录在 `workhours-state.json`）；你手动暂停的不会被它恢复。
- 上班时间每分钟还会检查 `status=error` 的同事；仅对已结束超过 2 分钟的网络断开或 `claude_transient_upstream` 自动调用 `clear-error`，不唤醒、不发心跳。误报为 `claude_auth_required` 时，必须有另一位 Claude 同事在失败后 30 分钟内成功运行作证；每人每天最多 3 次，额度、环境和未知错误保持原样。
- 清错检查遇到读取或清错接口异常时，记录一行错误并结束本 tick 的清错检查；作息调度继续保存已经发生的恢复请求与修复计数，下一 tick 再检查。没有成功响应的清错不增加次数。
- “需人工”按同事 ID、原因（登录证据不足 / 达到清错上限）、金边日期每天各记一次；标记保存在 `workhours-state.json` 的 `errorRecoveryManualDay`。演练不保存这个标记，不消耗正式运行的日志机会。
- 恢复请求发出后，下一次 tick 必须看到状态不再是 `paused` 才会从记录移除。若仍为 `paused / pausing`，仅在没有未结束运行、未释放租约和原生收尾记录时，最多每天两次补旧运行确认与 `hostComplete`；`pg` 不可用则退回普通恢复请求。修复前值只追加到 `backup-lifecycle-operation.jsonl`，连接串不会写入日志。
- 日志：`workhours.log`。演练（不真的暂停/恢复）：加 `--dry-run`；只跑一次：加 `--once`。
- 每个营业日 08:20（UTC+7，首次 tick 的 ±2 分钟窗口）生成一次只读用量日报；此任务在上下班判断前执行，因此 `start:08:30` 时仍会触发，不影响下班暂停逻辑。日报仅调用 `GET /api/companies/:company/agents` 与 `GET /api/companies/:company/heartbeat-runs?limit=1000`；后者约 5.77 MB、约 4.9 秒的数据库读取，故每天最多一次初始尝试加一次至少相隔 30 分钟的失败重试，不在同一分钟内连打。默认写入 `dispatch/_BACKLOG/用量日报/用量日报-YYYY-MM-DD.md`。可在 `workhours.json` 配置 `dailyUsage.enabled:false` 关闭、`dailyUsage.at` 调整时刻、`dailyUsage.days` 调整窗口天数、`dailyUsage.outDir` 调整输出目录。
- 每个营业日 08:25（UTC+7）按名单调用 `POST /api/agents/:id/runtime-state/reset-session` 清理任务会话，同样在上下班判断前执行。默认名单为 `Lead`、`Lead2`、`PM`、`OpsLead`，可用 `sessionReset.agents` 覆盖；`sessionReset.at` 可调整时刻。只对非运行且没有排队/运行中 heartbeat 的岗位操作，活跃岗位从 08:25 起每 10 分钟补试到 10:00。该接口会清 task sessions，并重置该岗位的 runtime session 字段（含 `lastError` / `stateJson`）；不会恢复或改变 `paused` 岗位状态。把名单设为 `[]` 或删除字段即可关闭。
- `--dry-run --once` 只读取 agents / heartbeat-runs 并记录“将触发日报 / 将清理名单”，不会写日报状态、不会发任何 POST。
- 回滚：关闭 `dailyUsage.enabled` 与 `sessionReset.agents`，恢复上一版 `workhours.mjs`；这两项不改变 `recoverOffDutyBlocks` / `recoverErrors`。
- 关掉这个终端标签页，调度就停了；已经暂停的 agent 保持暂停，直到你手动恢复或重新启动调度（上班时间会自动恢复）。

办公室 3D（`office3d`）读同一份 `workhours.json`：下班时间里被暂停的同事会从正门离开，上班后从正门进来。
