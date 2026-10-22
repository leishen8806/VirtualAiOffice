# C5d-command-view-live-age：指挥视图「真实数据」列表视图的数据年龄修复（小卡，约 30 分钟）

**执行者：Trae（同一会话，主线）。** **只修一个问题，不加功能。** 先读：`_common.md`、`_lane-main.md`（若有）、`command-view-live.mjs`、`command-view-wiring.mjs`、`command-view-data.mjs` 第 236–270 行（只读）、`tests\command-view-live.test.mjs`。

## 问题（我在线验收时复现）
`GET /command-view?mode=live`（列表视图，不带 `taskId`）返回的 `dataAgeMs` 是 `{value:null, reason:"UNKNOWN_TIME"}`，`quality.freshness = {stale:true, reason:"UNKNOWN_TIME", animationAllowed:false}`，页面顶部因此显示「? 更新中断 · 时间未知」。但 `/state` 的 `at` 是有效的 ISO 时间，队列 / 执行 / 智能体三个来源的 `ageMs` 都是已知的（约 19 秒）。

**根因（已核对 `command-view-data.mjs`）：** `command-view-data.mjs` 在计算总年龄时，把「调用方提供的来源」全部当作关键来源：任何一个来源没有 `at` 就整体判为年龄未知。列表视图里 `command-view-live.mjs` 把一个**根本没有加载**的来源（`activity: snap([], null, false, 'NOT_LOADED')`）也交了进去，它的 `at` 是 `null`，于是整体年龄被判未知。「没加载的来源」不应该拖垮「已加载来源」的年龄。

## 要做的事
1. **只在 `command-view-live.mjs`（及必要的 `command-view-wiring.mjs`）里修**：列表视图里**未加载的来源不要作为「调用方提供的来源」交给 `projectCommandView`**（例如不传 `sources.activity`），让 `command-view-data.mjs` 内部默认的 `timeline` 来源行仍然以 `NOT_LOADED` 显示缺口；**不要修改 `command-view-data.mjs`**（它同时服务演示数据与已通过的验收，语义不能变）。若你判断必须改它，**停下汇报原因，不要自行修改**。
2. **目标行为：**
   - 列表视图：总年龄 = 已加载来源（队列 / 执行 / 智能体 / `state.at`）的最大年龄，已知；若小于等于 120 秒，`freshness.stale=false`；超过 120 秒则 `stale=true, reason=STALE_DATA`。
   - 列表视图仍然保留缺口提示：`NOT_LOADED`（时间线 / 活动）、`EVIDENCE_NOT_CONNECTED`、`PARTIAL_PAGE`、`NO_ACCEPTANCE_EVIDENCE` 不得消失；汇总数字（任务数 / 执行数 / 成本）仍保持「未知 + 原因」，不得因为年龄已知就显示成确切数字。
   - **详情视图（带 `taskId`）行为不变**：详情加载失败时仍是 `UNKNOWN_TIME` + `stale=true`（你已有的显式设置保留），详情成功时时间线 / 活动来源有 `at`，年龄已知。
   - `state.at` 缺失或不是合法 ISO 时：年龄仍为未知（不得用当前时间代替）。
3. **测试**（`tests\command-view-live.test.mjs`，不放宽已有断言，不改 `command-view-data` 的测试）：
   - 列表视图在 `state.at` 有效、`now` 与它相差 19 秒时：`dataAgeMs.value` 为数字且 ≤ 120000、`freshness.stale=false`、`animationAllowed` 与页面语义一致；缺口里仍含 `NOT_LOADED`、`EVIDENCE_NOT_CONNECTED`。
   - `now` 比 `state.at` 晚 130 秒：`stale=true, reason=STALE_DATA`。
   - `state.at` 缺失：`dataAgeMs` 未知、`stale=true, reason=UNKNOWN_TIME`。
   - 详情失败：仍为 `UNKNOWN_TIME`。
   - 汇总数字在列表视图仍是 `value:null` 加原因（集合不完整）。
   - 所有输出仍通过 `validateCommandView`。
4. **浏览器验证**：我只改了数据，不改 `command-view.js` / `command-view.html`；因此你需要用**临时抓取**的真实形态做一次页面 smoke：在测试里用注入的假 `get` 与真实形态 fixture（`tests\fixtures\command-view-live\shapes.json`）跑一遍，不要自己打开线上开关。

## 约束
- 备份要改的文件到上一级目录 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-c5d`（不要放进 office3d）。
- 不改开关、不重启服务、不读取或打印任何密钥、不加新路由、不增加请求。
- 全量 `node --test` 全过。

## 汇报
「做到 / 没做到 / 未验证」，与磁盘一致，列出改动的文件与行数；说明你是否碰了 `command-view-data.mjs`（应为否）。**停下等我验收**（我会在线打开两层开关，核对页面顶部不再显示「更新中断」且汇总数字仍是未知，再恢复开关）。
