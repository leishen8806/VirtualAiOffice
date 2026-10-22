# C5b-command-view-live-wiring：把 live 适配器接进 `/command-view` 与页面（改 `server.mjs` + 页面，约 1–1.5 小时）

**执行者：Trae（新会话）。主线。改 `server.mjs`（互斥）与 `command-view.js`（页面）。** **前置：C5a 已验收。** 先读：`_common.md`、`_lane-main.md`、`command-view-routes.mjs`（C3）、`command-view-live.mjs`（C5a）、`server.mjs` 里 `/state` 的缓存与 `schedulerEnrichRows` 的 `get` 封装、`command-view.js`（C4）。开工先备份 `server.mjs`、`command-view.js`、`command-view.json` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-c5b`（**上一级目录，必须备份**）。

## 要做的事
1. **配置**：`command-view.json` 扩展为 `{ "enabled": false, "live": { "enabled": false, "projectName": "KhmerX", "rangeDays": 14, "owners": { "acceptor": "董事会", "budgetAuthorizer": "董事会", "sampleReviewer": "董事会" } } }`；**两层开关都必须为 `true` 才进入 live**；缺失 / 损坏 / 非布尔一律关闭；启动时读一次。
2. **路由**：`GET /command-view?mode=live[&taskId=<id>]`：仅**本机完全访问**（非局域网、非墙面令牌）；否则返回空状态。数据来自 C5a 适配器：列表层**复用 `state()` 的现有缓存（不新增轮询；若无缓存则最多触发 1 次 `state()` 并 60 s 单飞缓存）**，详情层仅在带 `taskId` 时懒取；**`taskId` 严格校验**（只接受当前范围内任务列表里存在的 id，非法 → 400，不回显输入）；响应经 `validateCommandView`；`mode=demo` 行为不变。
3. **页面**：`live · 授权数据` 选项在 live 开启且本机访问时显示真实 KhmerX 数据；点击队列里某个任务 → 以 `taskId` 重新取详情（页面上显示「正在读取详情…」，失败显示原因而不是空白）；**live 失败 / 过期 / 无权 → 明确的空状态或「更新中断」，不得回退到演示数据**；页面顶部显示「live · KhmerX · 近 14 天 · 本机」与数据年龄；**仍不出现任何写按钮**。
4. **隔离与性能**：`/state` 耗时与 Paperclip 请求数在 live 开 / 关下一致（开启时三次耗时对比贴出）；选中任务时**总请求 ≤ 20、并发 ≤ 4**（日志计数验证）；两层开关任一关闭 → live 返回空状态，其余路由逐字节不变（路由快照）。

## 测试与验收
- 纯函数 / 路由测试（注入假适配器）：两层开关组合；非本机 → 空状态；`taskId` 校验；响应校验失败 → 500 且不输出数据；静态检查（无写 Paperclip 调用）。`node --test tests/*.test.mjs` 全过。
- **我来重启并临时开启两层开关后在线验收**（真实 KhmerX 数据：列表、选中 CMP-337 / CMP-344 / CMP-274 / CMP-285 的详情、成本未知、`pending_verification`、标题里 IP 被隐藏、请求计数、`/state` 耗时；验收后恢复两层开关为关闭）。汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` 与 `command-view.js` 的接线行；**页面改动必须在真实浏览器里验证并写出结果**。**不要自己重启服务。**
