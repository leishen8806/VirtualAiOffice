# M1-B-town-map-api：`/town` 路由与只读地图接口 `GET /town/map`（服务端接线，不改页面逻辑）

**建议执行者：Trae DeepSeek V4 flash（边界清晰的服务端接线；与 S1-2 同类）。** **前置条件：S1-2 已验收（`server.mjs` 同一时间只能有一个任务在改）、M1-A 已验收（已是）。** 先读 `_common.md`、`town-map-data\m0\m0-plan.md` 第 9、10、11 节（尤其 9.2「访问与接口」）、`S1-2-foyer-data-backend.md`（接线写法与访问控制顺序的范例）、M1-A 的汇报与 `README.md` 里「金边小镇地图」一节。

**例外规则：** 允许新增 `town-map.mjs`、`tests/town-map-api.test.mjs`、`town-map.json`（**`town-map-data\m0\derived\town-map-v0.json` 的原样拷贝**，放在 `office3d\` 下，供服务端读取）；允许修改 `server.mjs`（**只限第 3 节列出的接线**，不要碰局域网访问码、`hostOk`、大屏令牌、`act()` 任何分支、静态文件白名单 `STATIC_EXT` / `staticOk`）、`README.md`。**不要改**：`town.html / town.js / town.css / town-map-core.js / town-map-data.js`（页面切换数据源属于 M1-C）、`app.js`、`ui.js`、`index.html`、所有其它业务模块、Telegram / 密钥、`town\`（T20 经济引擎）。备份 `server.mjs` 与 `README.md` 到 `office3d-backup-m1b`（办公室目录没有 Git）。**验证时不得向 Paperclip 发任何写请求**；不联网、不装依赖。**改了 `server.mjs`，让人重启服务（汇报里写明，不要自己结束进程）。不要与其他改 `server.mjs` 的任务同时进行。**

## 本任务要什么
1. **`/town` 路由**：`GET /town` 返回与 `/town.html` 相同的页面（沿用现有 `/wall` → `/wall.html` 的做法：在静态映射处加一行 `if (rel === '/town') rel = '/town.html'`）；**静态白名单不动**；该路由必须在**现有访问控制之后**（局域网设备要过访问码；大屏令牌设备的访问边界见第 2 节）。
2. **`GET /town/map`（只读）**：返回地图数据，结构 **与 `town-map-v0.json` 完全一致**（`attribution / source / uiAttributionRequired / formatVersion / coordinateSystem / tolerancesMeters / layers…`），**不要改变数据结构**（M1-C 的前端要直接用）。
   - **数据来源**：`office3d\town-map.json`（拷贝），启动时读取一次并校验：JSON 可解析、`layers.khans/roads/water/landmarks` 都是数组、`attribution` 含 `OpenStreetMap contributors` 与 `ODbL`、体积 ≤ 400 KB；**校验失败时接口返回 503 且 `/state` 不受影响（服务不崩溃）**，错误里不含文件路径。
   - **净化**：所有来自数据的文本（名称、标签）**在加载时统一净化一次**：去控制字符（含 `\u0000–\u001f`、`\u007f`、` /2029`）、限制 ≤ 80 字、非字符串变成空串；**不得因净化改变数字坐标、id 和数组长度**；净化后重新计算 ETag。
   - **缓存**：响应带 `ETag`（内容哈希，强 ETag）和 `Cache-Control: private, max-age=300`；`If-None-Match` 命中返回 `304` 且无 body；**不要用 `no-store`**（地图 200 KB，没必要每次重发），**但也不要 `public`**（经过访问控制，不能被共享缓存）。
   - **权限**：沿用现有访问控制——本机和已通过访问码的局域网设备可读（只读）；**大屏令牌设备 403**（把 `'/town/map'` 加进 `API_PATHS`，与 `/foyer` 一致；大屏不需要地图）；未通过鉴权按现有逻辑拒绝（不是 200）；**只接受 GET / HEAD**，其它方法按现有逻辑拒绝。
   - 响应头 `Content-Type: application/json; charset=utf-8`；`X-Content-Type-Options: nosniff`（只给本接口加，**不要**去改全站头）。
3. **接线范围（`server.mjs`，只允许这些）**：
   1. `import { loadTownMap } from './town-map.mjs'`（或同等），启动时加载，失败只打一条日志；
   2. 静态映射里加 `/town` → `/town.html` 一行；
   3. `API_PATHS` 加入 `'/town/map'`；
   4. 在**访问控制之后**加 `GET /town/map` 的路由（`ETag` / `304` / `503` 逻辑放在 `town-map.mjs` 里，`server.mjs` 只做薄接线）；
   5. `/state` **不加字段**（地图不是实时状态）。
   **先读清楚现有访问控制的顺序再接，复用现有变量（`lanAuthed` / `wallAuthed` / 本机判断），不要重写鉴权。**
4. **不做**：`/town/state`、`/town/routes`（M2 之后）、任何写接口、任何居民 / 经济 / 通勤数据；页面 `loadMap()` 改成请求接口（M1-C）。

## 测试（`tests/town-map-api.test.mjs`；仿 `tests/foyer.test.mjs` / `tests/workload.test.mjs` 的写法）
- **加载与校验**：合法文件通过；缺层、`attribution` 缺失、体积超限、非 JSON 各一例 → 503 / 加载失败且不崩溃；错误信息不含路径。
- **净化**：含控制字符、超长（200 字）、非字符串的名称被正确处理；**坐标、id、数组长度完全不变**（对比净化前后）；净化后的 ETag 与内容一致。
- **缓存**：`ETag` 稳定（同内容同值）、`If-None-Match` 命中 304 无 body、改内容后 ETag 变化；`Cache-Control` 为 `private, max-age=300`；`HEAD` 请求无 body。
- **权限（模拟请求）**：本机 200；带正确访问码的局域网设备 200；**大屏令牌设备 403**；未带访问码的局域网请求按现有逻辑拒绝；`POST /town/map` 被拒；`/town` 路由对上述四类的表现与 `/` 一致。
- **与原文件一致**：`town-map.json` 与 `town-map-data\m0\derived\town-map-v0.json`（若该文件存在）逐字节一致（哈希比较）；不存在时跳过并说明。
- **server 接线静态断言**（仿 `workload.test.mjs` 末尾那条）：`API_PATHS` 含 `/town/map`；路由在访问控制**之后**；`/town` 映射存在；`STATIC_EXT` 没有被改动（**与备份比较不变**）；`/town-map.json` 不能被静态服务读到（404）。
- 静态检查：`town-map.mjs` 无 `eval / new Function / child_process / 联网`；不读取 `osm-raw` 或 `m0` 之外的无关路径。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（不得放宽已有断言）；`node --check town-map.mjs`、`node --check server.mjs`。
- 重启后（**由人重启**）：`curl -i http://127.0.0.1:3200/town/map` 贴响应头（含 `ETag`、`Cache-Control`、体积）；用 `If-None-Match` 再请求一次得 `304`；`curl -i http://127.0.0.1:3200/town` 返回页面；用**模拟的局域网请求（带正确访问码）**得 200，**模拟大屏令牌**得 403，**不带访问码的局域网请求**被拒；写出命令和输出。确认 `/state` 的响应没有变化；`GET /town.html` 仍可访问。
- 汇报：每条要求做到没有；没做到的原因；**地图页真实在局域网设备上的表现：未验证**要如实写；`server.mjs` 的逐行差异清单；**对 M1-C 的提示**（`loadMap()` 改接口时要保留的降级行为、ETag 缓存与页面 reload 的交互）。
- **不要自己结束或重启进程。**
