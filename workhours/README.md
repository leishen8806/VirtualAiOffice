# 作息调度（金边时间）

让 agent 按作息上下班：**每天（周一到周日）8:30–17:30（金边时间 UTC+7）**。规则在 `workhours.json`，改完不用重启（每分钟重新读取）。

```bash
node E:\VirtualAIOffice\paperclip-ops\workhours\workhours.mjs
```

- 下班时间：把**空闲**的 agent 暂停；**正在运行的不打断**，等它这次运行结束再暂停（Paperclip 的暂停会取消正在进行的运行，所以绝不在运行中暂停）。出错状态的 agent 不动，留给人看。
- 上班时间：只恢复**本程序暂停过**的 agent（记录在 `workhours-state.json`）；你手动暂停的不会被它恢复。
- 上班时间每分钟还会检查 `status=error` 的同事；仅对已结束超过 2 分钟的网络断开或 `claude_transient_upstream` 自动调用 `clear-error`，不唤醒、不发心跳。误报为 `claude_auth_required` 时，必须有另一位 Claude 同事在失败后 30 分钟内成功运行作证；每人每天最多 3 次，额度、环境和未知错误保持原样。
- 清错检查遇到读取或清错接口异常时，记录一行错误并结束本 tick 的清错检查；作息调度继续保存已经发生的恢复请求与修复计数，下一 tick 再检查。没有成功响应的清错不增加次数。
- “需人工”按同事 ID、原因（登录证据不足 / 达到清错上限）、金边日期每天各记一次；标记保存在 `workhours-state.json` 的 `errorRecoveryManualDay`。演练不保存这个标记，不消耗正式运行的日志机会。
- 恢复请求发出后，下一次 tick 必须看到状态不再是 `paused` 才会从记录移除。若仍为 `paused / pausing`，仅在没有未结束运行、未释放租约和原生收尾记录时，最多每天两次补旧运行确认与 `hostComplete`；`pg` 不可用则退回普通恢复请求。修复前值只追加到 `backup-lifecycle-operation.jsonl`，连接串不会写入日志。
- 日志：`workhours.log`。演练（不真的暂停/恢复）：加 `--dry-run`；只跑一次：加 `--once`。
- 关掉这个终端标签页，调度就停了；已经暂停的 agent 保持暂停，直到你手动恢复或重新启动调度（上班时间会自动恢复）。

办公室 3D（`office3d`）读同一份 `workhours.json`：下班时间里被暂停的同事会从正门离开，上班后从正门进来。
