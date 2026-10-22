# C3-command-view-route：指挥视图的只读路由（第一版：演示数据 + live 空状态；改 `server.mjs`，约 1 小时）

**执行者：Trae（新会话）。主线。改 `server.mjs`（互斥：此时不得有别的 `server.mjs` 任务）。** **前置：C2、C7 已验收。** **本卡刻意不接 Paperclip 真实数据**：董事会尚未指定「第一版 live 项目 / 任务 / 验收人」，所以先交付**可看见的演示闭环**；live 在没有授权范围时返回**空状态**。先读：`_common.md`、`_lane-main.md`、`docs\command-view-plan.md` 第 7、10 节、`command-view-demo.mjs`、`command-view-data.mjs`、`command-view-validate.mjs`、`server.mjs` 里 `API_PATHS / authRoute`、`/contract-view`、`/scheduler/suggest` 与 `town-home` 路由的写法、`tools\tenancy-snapshot.mjs`。开工先备份 `server.mjs` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-c3`（**上一级目录，必须备份**）。

**允许修改：** `server.mjs`（**最小接线，逐行列出；不得改动既有访问控制、既有路由与写路径；不得对 Paperclip 发任何请求**）、新增 `command-view.json`（`{"enabled":false}`，**默认关闭**）、新增 `command-view-routes.mjs`（纯处理函数工厂，便于测试）、`tests\command-view-routes.test.mjs`；`README.md` 一节。

## 要做的事
1. **开关** `command-view.json`：缺失 / 损坏 / 非布尔 `true` 一律关闭；**启动时读一次，改动需重启**。**关闭时：`/command-view` 返回 404，既有所有路由、响应头与页面与改动前逐字节一致**（`tools\tenancy-snapshot.mjs` 前后对比，贴 diff）。
2. **路由（只读 GET，加入 `API_PATHS`；墙面令牌不可读；局域网只读用户可读演示数据）**：
   - `GET /command-view/scenarios` → `listDemoScenarios()`；
   - `GET /command-view?mode=demo&scenario=<id>&timeSlice=<n>` → `buildDemoCommandView`（**参数严格校验**：`scenario` 只接受 `listDemoScenarios` 里的 id，`timeSlice` 为 `0..timeSlices-1` 的整数；非法 → 400；**不拼接路径、不回显原始输入**）；
   - `GET /command-view`（或 `mode=live`）→ `defaultCommandView()` 的**空状态**（`{ kind:'empty', reason:'NO_AUTHORIZED_LIVE_SCOPE' }`），**HTTP 200**，**绝不拿演示数据冒充 live**。
   - 所有响应：`Cache-Control: no-store`、统一 JSON；错误信息不含路径 / 堆栈；响应体经 `validateCommandView` 校验（校验失败 → 500 + 通用错误，**不输出未通过校验的数据**）。
3. **隔离**：路由不读写任何文件、不请求 Paperclip、不调用 `state()`；响应不增加 `/state` 的任何字段；**`/state` 耗时与请求数不受影响**（开关开启 / 关闭对比三次，贴数字）。
4. **速率**：每进程每分钟 ≤ 120 次，超限 429。

## 测试与验收
- `command-view-routes` 纯函数测试：开关三态；非法 `scenario` / `timeSlice` / 多余参数；live 空状态；校验失败降级为 500；墙面令牌 403；速率 429；响应不含堆栈 / 路径 / 真实标识模式。
- 静态：新增代码不含 `child_process / eval / innerHTML`、不对 Paperclip 发请求。`node --test tests/*.test.mjs` 全过。
- **我来重启并临时开启后做在线验收**（用真实服务请求三个场景全部时间片、空状态、非法参数、关闭状态 404 与路由快照；验收后恢复开关为关闭）。汇报「做到 / 没做到 / 未验证」，与磁盘一致，列出 `server.mjs` 接线行。**不要自己重启服务。**
