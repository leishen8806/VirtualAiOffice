# S1-2-foyer-data-backend：前厅的两项新数据——匿名访客登记 + 董事会手写公告（服务端，默认关闭）

**建议执行者：Trae DeepSeek V4 flash（边界清晰的数据 / 服务端任务）；排在 T20、T14b 之后。** 先读 `_common.md`，再读 `docs/foyer-plaza-plan.md` 第 4 节「数据契约」里的**「访客登记」和「董事会手写公告」两行**和第 7 节第 3、4 条风险。**本任务的例外规则：** 允许新增 `foyer.mjs`、`tests/foyer.test.mjs`、`foyer.json`（运行状态与开关）；允许修改 `server.mjs`（**只限第 6 节列出的接线**，不要碰局域网访问码、`hostOk`、大屏令牌、`act()` 已有分支、静态文件白名单）、`README.md`。**不要改** `app.js`、`ui.js`、`index.html`、`director.js`、任何场景 / 人物 / Telegram / 密钥相关代码、所有其它 `*.mjs` 业务模块（只允许 `import { scanMemoryText } from './memory.mjs'` 和 `import { redactText } from './wall.mjs'`）。**验证时不得向 Paperclip 发任何写请求**（本功能本来也不需要）。不新增依赖。备份到 `office3d-backup-s1-2`（办公室目录没有 Git）。**改了 `server.mjs`，让人重启服务（汇报里写明，不要自己结束进程）。不要与其他改 `server.mjs` 的任务同时进行。**

## 董事会已定
- **访客标识用「随机访客 cookie」**：页面首次加载时发一个随机 id，服务端**只存它的摘要哈希**，不存 IP、User-Agent、访问码或令牌。
- 前台只显示**两类**（局域网 / 大屏）的总次数和最近一次时间；**逐设备摘要只给本机看**。
- 公告由董事会在本机手写，**≤ 120 字**，保存前先过 `scanMemoryText`（密钥 / 服务器地址 / 账务数据），命中只回类别、**不回显原文**。
- **默认关闭**，首次开启由董事会确认（和对话、巡检类功能一致）。

## 1. 数据文件 `foyer.json`（原子写入，损坏时视为关闭、不崩溃，`/state` 提示）
```json
{ "visitors": { "enabled": false }, "announcement": { "enabled": false },
  "salt": "<首次运行时用 crypto.randomBytes(32).toString('hex') 生成并保存>",
  "devices": { "<sha256 摘要>": { "kind": "lan", "firstSeenAt": "ISO", "lastSeenAt": "ISO", "visits": 3 } },
  "announce": { "current": { "text": "…", "at": "ISO" }, "history": [ { "text": "…", "at": "ISO" } ] } }
```
- **摘要 = `HMAC-SHA256(salt, 随机 id)` 的十六进制**；`foyer.json` **不能被静态文件服务读到**（当前 `STATIC_EXT` 白名单不含 `.json`，写一条测试固定这一点，并确认 `/foyer.json` 返回 404）；`salt` 和摘要**不得出现在任何接口响应里**（本机逐设备接口只给摘要的前 8 位用于区分，**不得给完整摘要**）。
- 总量保护：`devices` 最多 **2000** 条，满了淘汰 `lastSeenAt` 最旧的；`announce.history` 最多保留 **20** 条；单文件体积超过 **512 KB** 时拒绝写入并在 `/state` 里提示（防止被刷爆）。

## 2. 访客登记（`foyer.mjs` 导出纯函数 + 工厂，便于测试）
- **什么时候计一次**：服务端在**提供主页面 HTML**（`GET /` 的 `index.html`）和**大屏页面 HTML**（`GET /wall`）时处理，**不在** `/state`、`/act`、静态资源、`/wall/data` 等轮询接口上计数（访客次数 = 页面首次加载次数，不是请求次数）。
- **只计「已通过鉴权的访客」**：局域网设备要已通过访问码（`lanAuthed`），大屏设备要已通过大屏令牌（`wallAuthed`）；**未通过鉴权的请求（登录页、被拒绝的）一律不计、也不发 cookie**；**本机访问（127.0.0.1 / ::1 / 本机自己的局域网 IP）不计**（那是董事会自己）。
- **cookie**：名字 `office_visitor`，值是 `crypto.randomBytes(16).toString('hex')`；属性 `HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`（和现有访问 cookie 一致的写法，**不要**加 `Secure`，局域网是 http）；收到合法 cookie（32 位十六进制）就沿用，格式不对的当作没有并换发新的。**不要**用 IP、UA、访问码、令牌派生任何标识。
- **去抖**：同一设备 **30 分钟内**重复加载页面只算一次（防止刷新刷次数）；`lastSeenAt` 每次更新。
- 统计口径：`visits` = 去抖后的页面首次加载次数；摘要 `{ lan: { devices, visits, lastAt }, wall: { devices, visits, lastAt } }`，`devices` 是该类的去重设备数——**界面文案由 S1-5 决定，如果董事会后来不接受「设备数」这种说法，接口仍然可用（字段名保持 `devices`，含义写在 README：「持有同一访客 cookie 的浏览器」，不是物理设备）**。
- 开关 `visitors.enabled === false`（默认）时：**不发 cookie、不写文件、摘要返回 `{ enabled:false }`**。

## 3. 公告
- `foyer_announce {text}`（`act()` 新增，**局域网只读设备 403**，沿用现有令牌机制）：`text` 去首尾空白、**去掉控制字符和换行归一为空格**后长度 **1–120 个字符**（按 Unicode 码点算，不是字节）；调用 `scanMemoryText(text)`，**命中任何类别就拒绝**（HTTP 422，错误里**只给类别**，**不回显原文**，也**不写入文件和历史**）；通过则写入 `announce.current` 并把旧的推进 `history`；**每个金边日最多保存 10 次**（超了 429）；`announcement.enabled === false` 时 403「公告功能未开启」。
- `foyer_announce_clear {}`：清空当前公告（历史保留），同样仅本机。
- 展示用文本在返回前再走 `redactText`（金额 / IP / 邮箱 / 链接 / 疑似密钥打码，复用，不要另写）。公告**只含文本**，不含 HTML，前端渲染必须转义（写进 README 的接口说明里）。

## 4. 只读摘要
- **`/state` 里新增 `foyer`**：`{ enabled, visitors: { lan:{devices,visits,lastAt}, wall:{…} } | null, announcement: { text, at } | null }`（**不含**摘要哈希、不含逐设备信息、不含 IP / UA）。大屏令牌设备访问 `/state` 时已经走 `redactState`，确认 `foyer` 经过它之后仍然合理（访客计数对大屏意义不大，但**不得泄露任何标识**）。
- `GET /foyer`：同样的摘要；局域网只读设备可读（计数和公告本来就是前台要展示的），**大屏令牌设备 403**（加进 `API_PATHS`）。
- `GET /foyer/visitors`：**仅本机**，逐设备明细 `[{ kind, id8, firstSeenAt, lastSeenAt, visits }]`（`id8` 是摘要的前 8 位）；局域网和大屏设备 403。

## 5. 隔离与安全自查（写进测试）
- 构造一个带 `User-Agent: Mozilla/5.0 test-ua`、来源 IP `192.168.100.77` 的局域网请求，完整走一遍「发 cookie → 计数 → 摘要」，然后把 **`foyer.json` 的完整内容、`/state`、`/foyer`、`/foyer/visitors`、日志输出**序列化，断言**找不到** `192.168.100.77`、`test-ua`、原始 cookie 值、访问码、令牌、完整摘要、`salt`。
- 伪造 cookie（过长、含非法字符、重复）不会让服务崩溃或写入脏数据。
- 公告里写 `ghp_` / 令牌格式 / IP / 金额的各 3 个命中样例被拒；`CMP-285`、`localhost:3200`、`17:30`、`版本 1.27.2` 不误杀；拒收文案不含原文。

## 6. 接线（`server.mjs`，只允许这些）
1. `import { createFoyer } from './foyer.mjs'`，创建实例；传入 `dir`、`now`、`redactText`、`scanMemoryText`、`log`。
2. 在**提供 `index.html` 和 `/wall` 页面**的分支里，**在已经确认鉴权通过之后**调用 `foyer.touch({ kind, cookieValue })`，并把返回的 `Set-Cookie`（如有）加进该次响应头；**不改任何鉴权判断本身**。先读清楚现有访问控制的顺序再接，**把「谁算已鉴权」的判断复用现有变量，不要重写**。
3. `/state` 里加 `foyer: foyer.summary()`。
4. 只读 `GET /foyer`、仅本机 `GET /foyer/visitors`；`API_PATHS` 加入 `'/foyer'` 和 `'/foyer/visitors'`（让大屏令牌设备 403）。
5. `act()` 里**只新增** `foyer_announce`、`foyer_announce_clear` 两个分支；把 `foyer_` 加进已有的「结果透传」前缀判断。
6. `foyer.json` 不存在按全部关闭处理；首次写入时才创建；损坏时视为关闭并在 `/state.foyer.corrupt: true` 提示。

## 测试（`tests/foyer.test.mjs`，纯函数 + 模拟请求，仿 `tests/workload.test.mjs` / `tests/chat.test.mjs` 的写法）
访客：摘要哈希（相同 id 相同摘要、不同 salt 不同）、去抖 30 分钟、本机和未鉴权不计、关闭时不发 cookie 不写文件、设备上限淘汰、文件体积上限、cookie 格式校验、`lan` / `wall` 分类、重启后状态保留、损坏文件不崩溃。公告：长度边界（0、1、120、121、含换行、含控制字符、全角字符按码点算）、扫描拦截与不误杀、每日 10 次上限、历史上限 20、清空、`enabled:false` 时拒绝、展示前脱敏。接口：`/foyer` 局域网可读、大屏 403、`/foyer/visitors` 仅本机；`act()` 两个分支局域网 403。**server 接线静态断言**（仿 `workload.test.mjs` 末尾那条）：`API_PATHS` 含两个路径、路由在访问控制之后、`foyer_` 在透传前缀里、`/state` 含 `foyer`、`/foyer.json` 不可被静态服务读到。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（不得放宽已有断言）；`node --check foyer.mjs`、`node --check server.mjs`。
- 重启后（由人重启；**总开关保持关闭**）：只读 `GET /state` 贴 `foyer` 段；`GET /foyer`（本机）；确认关闭时**不发 cookie**（`curl -i` 看响应头，写出命令和输出）。**然后把 `visitors.enabled` 临时改为 `true`，用模拟的局域网请求（带正确访问码）访问页面两次（间隔 < 30 分钟），确认次数为 1、`Set-Cookie` 属性正确；再改回关闭**。不要在 Paperclip 里写任何东西。
- 汇报：每条要求做到没有；没做到的原因；**页面层面「是否带 cookie」在真实局域网设备上的表现：未验证**要如实写；隐私自查（第 5 节）的完整输出。
