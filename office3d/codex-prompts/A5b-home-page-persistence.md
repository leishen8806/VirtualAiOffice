# A5b-home-page-persistence：个人空间页面接入本机保存 / 读取（A3 接口），约 1–1.5 小时

**执行者：Trae（新会话）。小镇线。** **前置：A5a 已验收；A3 已验收（`/town/home/session | layout | save | reset`，仅本机、带令牌、默认关闭）。** 先读：`_common.md`、`_lane-main.md`、`_lane-town.md`、`docs\home-space-spec.md` 第 5–6 节、`town\home-routes.mjs`（**接口契约：状态码 200 / 403 / 404 / 409 / 413 / 415 / 422 / 429**）、`home-page.js`、`home-editor.js`（`persistAdapter` 接口）、`tests\home-routes.test.mjs`。

**允许修改：** `home-page.js`、`home-editor.js`（只接适配器）；新增 `home-persist.js`（**适配器：封装 session / layout / save / reset 的请求，纯 `fetch` 到同源 `/town/home/*`**）、`home-persist-logic.mjs`（**纯逻辑：状态码 → 界面状态的映射、重试与冲突策略，Node 可测**）、`tests\home-persist-logic.test.mjs`；README 一节。**不要改** `app.js / ui.js / index.html / server.mjs / town\`。备份 `home-page.js`、`home-editor.js` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-a5b`（上一级目录）。**不得向 Paperclip 发请求；零 token；不涉及 DR 币。**

## 要做的事
1. **启动流程**：页面加载 → `GET /town/home/session`。**404（开关关闭）** → 进入「离线演示」模式（沿用 A5a 的内存态，并明确提示「个人空间保存未开启（本机管理员可在服务端开启）」）；**403（非本机 / 局域网 / 大屏）** → 同样离线演示，并提示「仅本机可保存」；**200** → 读 `GET /town/home/layout`，把返回的 `layout / inventory` 载入房间与托盘；`status:'corrupt'` 时提示「上次的布置文件损坏，已用默认布置（原文件已保留副本）」。**令牌只存在页面内存变量里，不写入 `localStorage / sessionStorage / cookie / URL / 控制台日志`。**
2. **保存**：点「完成」→ `POST /town/home/save { placements, expectedRevision }`（带 `X-Home-Token` 与 `Content-Type: application/json`）；成功用返回的 `revision` 更新本地；**409 版本冲突** → 弹窗提供「用服务器版本（放弃本地改动）/ 保留本地并覆盖（用最新 revision 重发）」；**422 非法布置** → 在界面显示违反项的中文原因（映射 `rule` 编号到文案），**保留当前编辑不丢**；**413 / 415 / 429 / 500 / 网络失败** → 友好提示与「重试」按钮，**当前布局始终保留**；保存按钮在请求中禁用，防止重复提交。
3. **恢复默认**：二次确认后 `POST /town/home/reset { expectedRevision }`；冲突同上。
4. **安全与隐私**：请求只发同源 `/town/home/*`；**不要把布置内容放进 URL 查询串**；页面不显示令牌；错误提示不回显服务端的原始错误体（只用状态码映射的文案）；关闭页面时若有未保存修改，用 `beforeunload` 提示一次。
5. **不阻断**：任何接口失败都只降级到离线演示，**不影响房间浏览与编辑**。

## 测试
- `home-persist-logic.mjs`：状态码 → 界面状态映射表（200 / 403 / 404 / 409 / 413 / 415 / 422 / 429 / 500 / 网络错误）逐项断言；冲突策略的两个分支；`rule` 编号 → 中文文案（覆盖规格 7 条规则）；令牌不会出现在任何返回的文案或日志对象里（断言）。
- 适配器（用注入的假 `fetch`）：请求方法、路径、请求头、请求体；**令牌未写入任何存储**（对假 `localStorage` 做断言）；失败后布局保留。
- 静态检查：新增代码不含 `innerHTML 拼外部数据 / eval`、不请求同源 `/town/home/*` 以外的任何地址、无 `buy / price / balance / wallet`。
- 全量测试全过，不得放宽。

## 验收（缺一不通过）
- **我来重启并临时开启 `town-home.json` 后做在线验收**：本机打开 `home.html` → 载入 → 放置 → 完成 → 刷新页面，布置保留；制造 409（两个标签页）、422（构造非法布置）；局域网地址打开 `home.html` 显示「仅本机可保存」且不泄露令牌；验收后我会删除测试数据并恢复开关为关闭。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；写出**浏览器实测结果**（加载遮罩 / 错误条 / 控制台）。**不要自己重启服务。**
