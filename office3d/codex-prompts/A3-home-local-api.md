# A3-home-local-api：个人空间布置的「仅本机、带令牌、默认关闭」读写接口（改 server.mjs，约 1–1.5 小时）

**执行者：Trae（新会话）。小镇线 · 服务端。改 `server.mjs`（同一时间只有一个任务改它——**必须等 L1b、L3b 都验收后再开**）。** **董事会 2026-10-21 已批准：** 个人空间布置的写入走本机、带令牌、默认关闭的接口，**不进入 Paperclip 写路径**。**前置：A1、A2 已验收（`town\home-space.mjs`、`town\home-store.mjs`）；L1b、L3b 已验收。** 先读：`_common.md`、`_lane-town.md`、`docs\home-space-spec.md` 第 5–6 节、`town\home-store.mjs`、`server.mjs` 里**现有的访问控制**（本机完全访问 / 局域网只读 / 墙面令牌最小权限）、`API_PATHS` 与 `authRoute`、`foyer.json` 的启动时读取写法、`tools\tenancy-snapshot.mjs`。

**允许修改：** 新增 `town\home-routes.mjs`（纯路由处理函数工厂，便于测试）、`tests\home-routes.test.mjs`；`server.mjs`（**最小接线，逐行列出；不得改动任何既有访问控制、既有路由与写路径**）；`README.md` 追加一节「个人空间接口（A3）」。备份 `server.mjs` 到 `office3d-backup-a3`。**不得向 Paperclip 发任何请求；零 token；不涉及 DR 币与账本。**

## 要做的事
1. **开关** `town-home.json`：`{"enabled":false}`；缺失 / 损坏 / 非布尔 `true` 一律关闭；**启动时读一次，改动需重启**。**关闭时：下面全部路由返回 404，既有所有路由与响应头逐字节不变**（`tools\tenancy-snapshot.mjs` 前后对比）。
2. **仅本机**：只接受**环回地址**（`127.0.0.1` / `::1`）的连接，**且不是经局域网访问码进入的会话**；局域网 / 墙面令牌一律 403（即使带了令牌）。要求 `Host` 为本机允许的主机名、`Origin`（若存在）同源；跨站请求拒绝。
3. **令牌**：进程启动时用 `crypto.randomBytes(32)` 生成**每进程令牌**，**只存内存，不落盘、不写日志**；`GET /town/home/session` 仅限本机 + 同源，返回 `{ token, ownerId }`（`ownerId` v1 固定取本机董事会账号标识 `board`，通过 `^[a-z0-9_-]{1,40}$` 校验）；所有写接口要求请求头 `X-Home-Token`，用 `crypto.timingSafeEqual` 比较；缺失 / 错误 → 403 且**不回显令牌**。
4. **路由**（均挂在 `/town/home/` 下，加入 `API_PATHS` 与权限表，**墙面令牌不可用**）：
   - `GET /town/home/layout` → `store.load(ownerId)` 的 `{ layout, inventory, status }`（读，仅本机 + 同源，不需要令牌）；
   - `POST /town/home/save` `{ placements, expectedRevision }` → `store.save`；冲突返回 409 并附当前布置；非法布置返回 422 与违反项；
   - `POST /town/home/reset` `{ expectedRevision }` → `store.reset`。
   - 写接口：请求体上限 **64 KB**（超限 413）、`Content-Type: application/json`、速率限制（每进程每分钟 ≤ 60 次写，超限 429）；响应统一 JSON，**错误信息不含路径与堆栈**。
5. **数据隔离**：布置数据只经 `store` 写入 `town\data\home\`；**不得出现在 `/state`、治理中心、对话、知识库或任何同事上下文**；日志不记录布置内容（只记结果码与耗时）。

## 测试与验收
- `home-routes` 纯函数测试：开关三态；非本机 403；缺令牌 403；错令牌 403 且响应不含令牌；跨站 `Origin` 403；`Content-Type` 错误 415；体积 413；冲突 409；非法布置 422；速率限制 429；`ownerId` 恶意值被拒；响应不含堆栈 / 路径。
- 静态检查：新增代码不含 `child_process / eval / innerHTML`，不对 Paperclip 发请求，不含 `buy / purchase / price / balance / wallet`；令牌不写入日志与文件。
- `server.mjs`：**开关关闭时路由快照零变化**（贴前后快照 diff）；开启时 `/state` 的响应形状与轮询不变。
- `node --test tests/*.test.mjs` 全过；`node --check server.mjs`。**不要自己重启服务**（我重启后做在线验收：关闭状态快照；临时开启后用本机请求与局域网请求各验证一遍，再恢复关闭）。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` 的接线行。
