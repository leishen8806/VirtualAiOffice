# 作息调度（金边时间）

让 agent 按作息上下班：**每天（周一到周日）8:30–17:30（金边时间 UTC+7）**。规则在 `workhours.json`，改完不用重启（每分钟重新读取）。

```bash
node E:\VirtualAIOffice\paperclip-ops\workhours\workhours.mjs
```

- 下班时间：把**空闲**的 agent 暂停；**正在运行的不打断**，等它这次运行结束再暂停（Paperclip 的暂停会取消正在进行的运行，所以绝不在运行中暂停）。出错状态的 agent 不动，留给人看。
- 上班时间：只恢复**本程序暂停过**的 agent（记录在 `workhours-state.json`）；你手动暂停的不会被它恢复。
- 日志：`workhours.log`。演练（不真的暂停/恢复）：加 `--dry-run`；只跑一次：加 `--once`。
- 关掉这个终端标签页，调度就停了；已经暂停的 agent 保持暂停，直到你手动恢复或重新启动调度（上班时间会自动恢复）。

办公室 3D（`office3d`）读同一份 `workhours.json`：下班时间里被暂停的同事会从正门离开，上班后从正门进来。
