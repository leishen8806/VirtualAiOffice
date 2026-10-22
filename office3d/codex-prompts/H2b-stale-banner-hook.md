# H2b-stale-banner-hook：页面顶部显示「数据来自 N 分钟前（Paperclip 暂不可用）」（小卡，≤10 行钩子，约 30 分钟）

**执行者：Codex（会话一；`app.js` / `ui.js` 的持有者）。** **前置：H2 已验收（已通过）；O6O7 验收后做。** H2 让 `/state` 在 Paperclip 暂时不可用时返回 200 的「最近快照」并带 `stale: { active, since, ageMs, reason }`（`reason` 为 `UPSTREAM_UNAVAILABLE` 或超过 30 分钟的 `STALE_DATA`），降级时 `actToken` 为空。**但页面还没有任何提示**——用户看到的是正常画面，会误以为数据是实时的。本卡只补这一层提示。

先读：`_common.md`、`server.mjs` 里 `/state` 降级返回的形状（`state-last-good.mjs` 的 `fallback()`）、`app.js` 里 `/state` 轮询（约第 2033 行）、`ui.js` 顶栏与现有 toast / `.chip` 的写法、`index.html` 的样式变量。

## 要做的事
1. 页面拿到 `state.stale?.active === true` 时，在顶栏显示一枚不抢眼的提示条（沿用现有 `.chip` / `.glass` 样式，深浅主题都清楚）：`数据来自 N 分钟前 · Paperclip 暂不可用`（`reason === 'STALE_DATA'` 时改为 `数据已过期 N 分钟`）；`N` 来自 `ageMs`，不用页面本地时钟推算；`ageMs` 缺失显示「时间未知」。**恢复（`stale` 消失）后提示自动消失。**
2. 降级期间，页面上所有**写操作入口**（审批、派发、验收、回答问题）显示为不可用并写明原因「Paperclip 暂不可用」；不要让用户点了才失败。（只读功能照常。）
3. **改动量：`app.js` + `ui.js` + `index.html` 合计新增 ≤ 10 行**，逐行列出。不得改 `server.mjs`，不得新增请求，不得每帧做 DOM 操作（仅在 `stale` 状态变化时更新）。
4. 测试：假 `state`（正常 / `stale.active` / `STALE_DATA` / `ageMs` 缺失）下提示文案与写入口禁用状态；静态检查；全量 `node --max-old-space-size=2048 --test --test-timeout=60000` 全过。
5. **浏览器验证（必做）**：加载遮罩消失、无错误条、控制台 0 错误；用 Playwright 拦截 `/state` 响应注入 `stale`（只改浏览器里的响应，不动真实服务）截图：提示条（浅 / 深）、写入口禁用；恢复后提示消失。

备份 `app.js`、`ui.js`、`index.html` 到上一级目录 `office3d-backup-h2b`。不要自己重启服务。「做到 / 没做到 / 未验证」，停下等我验收。
