# M5-2b-auth-fixes：M5-2 认证原语的修订——cookie 路径与接口路径不一致、改口令缺限速、来源摘要密钥可推、CSRF 轮换

**建议执行者：Trae（新会话；也可以直接回到做 M5-2 的会话继续，因为你最了解那批代码）。** 这是董事会侧对 M5-2 独立复核（2026-10-21）后的**修订任务**。M5-2 的主体通过：scrypt 参数与假哈希、统一 401、会话只存哈希、跨公司 404、并发爆破被限速（40 个并行错口令只放行 5 个）、关闭状态零变化（11 条路由快照 0 差异）。下面是**必须修**的缺陷。先读 `M5-2-accounts-sessions.md`、`tenancy\auth\*.mjs`、`tenancy\index.mjs`、`server.mjs` 里 `authRoute` 的三处接线、`tests\auth-*.test.mjs`、`multitenant-design\m5-0-design.md` 第 4.2 / 4.5 节。

**例外规则：** 只允许修改 `tenancy\auth\*.mjs`、`tenancy\index.mjs`（如需）、`tools\tenancy-admin.mjs`（如需）、`server.mjs`（**只限 `authRoute` 的匹配与放行那几处**，不得碰其它访问控制）、`tests\auth-*.test.mjs`、`README.md`、`multitenant.json`（**不得改开关值，必须保持 `auth.enabled:false`**）。**不要改**：`app.js`、`ui.js`、`index.html`、`paperclip-gateway.mjs`、所有业务模块。备份将改的文件到 `office3d-backup-m5-2b`。**对 Paperclip 不发任何请求；不创建真实账号 / 会话；不开启 `auth.enabled`；联调只在测试临时目录里做，不得启动第二个办公室服务实例。** 改了 `server.mjs` 需要重启（汇报里写明；**服务现在由 pm2 托管（`pm2 restart office3d`），由我重启，你不要自己重启**）。

## 缺陷 1（阻断，必须修）：cookie 的 `Path` 与 `/auth/*` 接口路径不一致，浏览器根本不会把会话 cookie 发给它们
**我的实测（独立探针，浏览器 cookie 路径匹配规则）：** 登录成功后下发 `Set-Cookie: vao_sid_<slug>=…; Path=/c/<slug>/`。按 RFC 6265，这个 cookie **只会发给 `/c/<slug>/` 之下的请求**。结果：
- `GET /auth/session` → cookie **不会发** ✗
- `POST /auth/logout` → **不会发** ✗
- `POST /auth/change-password` → **不会发** ✗
- `GET /c/<slug>/whoami` → 会发 ✓
**后果：** 真实浏览器里，老板**无法退出**、**无法查看会话**，更严重的是**无法修改初始口令**——而 `mustChangePassword:true` 的账号在改口令之前访问 `whoami` 会得到 403 `需先修改口令`，等于**首次登录的老板永远卡死**。现有测试通过是因为测试把 `Cookie` 请求头手工塞进了请求，没有模拟浏览器的 cookie 路径匹配。这个矛盾来自 M5-0 设计（§4.2 的 cookie `Path` 与 §4.5 的路由合同相互矛盾），不是你抄错；但必须修。
**要求（二选一，推荐 A）：**
- **A（推荐）：把需要 cookie 的接口挪到 `/c/:slug/auth/…` 之下**：`GET /c/:slug/auth/session`、`POST /c/:slug/auth/logout`、`POST /c/:slug/auth/change-password`；`POST /auth/login` 保持原路径（它不需要 cookie，只设置 cookie），`GET /c/:slug/whoami` 不变。cookie `Path` 保持 `/c/<slug>/`（最小作用域，也保持「公司 A 的 cookie 不会发给公司 B」）。更新 `matchRoute`、`server.mjs` 里 `authRoute` 的放行（**仍然只放行这精确的 5 个模式**，不得变宽：`/c/:slug/auth/(session|logout|change-password)` 与 `/c/:slug/whoami` 与 `/auth/login`，其余 `/c/…` 路径一律不放行）、`API_PATHS` / 大屏 403 的判断、文档。
- B：把 cookie `Path` 改成 `/`。**不推荐**（所有公司的 cookie 会发给所有路径，扩大泄露面；若选 B，必须说明理由并补充对应威胁评估）。
**必须新增的测试（防止这一类 bug 再出现）：** 写一个**浏览器 cookie 罐模拟**（纯函数 `cookieSentTo(setCookieHeader, requestPath)`，实现 RFC 6265 的 `Path` 匹配与 `Max-Age`、`HttpOnly`、`SameSite=Strict` 同站判断），然后**用它端到端驱动整条流程**：`login` → 取 `Set-Cookie` → 用 cookie 罐决定后续每个请求带不带 cookie → `session` → `change-password`（含 `mustChangePassword` 流程）→ `whoami` → `logout`。**断言：所有「需要会话」的接口，cookie 罐都会把 cookie 发给它们。** 再加一条反向断言：公司 A 的 cookie **不会**发给 `/c/<B>/…`。

## 缺陷 2：改口令接口没有限速（持有会话者可无限猜旧口令）
我的实测：持有有效会话，对 `change-password` 连续提交 12 次错误旧口令，**全部返回 401，没有任何 429**。一个被劫持的会话就能无限爆破账号的真实口令。
**要求：** `change-password` 的**旧口令校验失败**要计入与登录同一个**按账号**的限速器（失败计数、指数退避、达上限后统一 429，且不泄露账号状态）；成功改口令后清理该账号的短期失败计数；写审计事件 `password_change_fail` / `login_locked`（不含口令）。测试：连续 6 次错旧口令第 6 次起 429；锁定期内**正确旧口令也 429**（与登录一致）；**不影响其它账号**；改口令成功会撤销其它会话（已有行为保持）。

## 缺陷 3：来源摘要的 HMAC 密钥可由路径 + 月份推出，来源 IP 可被还原
`rate-limit.mjs` 的 `stableSourceDigest` 用 `${rootDir}:${monthKey}:source` 作为 HMAC 密钥——密钥是**公开可推的**。我实测：能用「数据目录 + 月份」直接算出限速文件里的来源摘要并命中，意味着任何能读到该文件的人可以对 IPv4 全空间枚举还原来源 IP。M5-2 提示词要求的是「HMAC（**进程内随机密钥**，远端地址）」。
**要求：** 改为**每个安装一份随机密钥**：首次需要时用 `crypto.randomBytes(32)` 生成，保存到 `multitenant\auth-secret.key`（**原子写入；Windows 下尽量收紧权限（`icacls` 只给当前用户），失败时仍可运行但在 `/platform/tenancy` 报警；文件不得被静态服务读到（确认扩展名 `.key` 不在 `STATIC_EXT` 白名单内并加测试）；不得出现在日志 / 审计 / 任何接口输出里**）；摘要只在同一个安装内稳定，**不跨月轮换**也可以（旧摘要保持有效，避免重启后限速状态丢失）；密钥文件缺失 / 损坏时重新生成并记审计事件。测试：同地址同密钥摘要相同、不同地址不同、**不同安装（不同密钥）同地址摘要不同**、从「路径 + 月份」推不出（用旧公式断言**不再命中**）、日志与审计里搜不到密钥内容。

## 缺陷 4（建议修）：`GET session` 每次调用都轮换 CSRF，多标签页会互相作废
`handleSession` 每次都 `rotateCsrf`，同一账号开两个标签页时，后一个标签页拿到新 token 会让前一个标签页的写请求全部 403。**要求：** CSRF token 只在**登录成功**与**改口令成功**时签发 / 轮换；`session` 接口返回**当前有效** token 的方式要避免明文存储（服务端只存摘要，不能找回明文）——可选做法：`session` 接口不返回 token，仅在 `login` 与 `change-password` 的响应里下发，并在 cookie 之外提供一个**与会话绑定、可由服务端重新计算的 token**（例如 `HMAC(服务端会话密钥, sidHash)` 派生，而不是随机存哈希），这样 `session` 可以重复返回同一个值。写明你的选择与理由；测试：两个「标签页」（同一会话两次 `session`）拿到的 token 都能通过写请求校验；退出 / 改口令后旧 token 失效。

## 缺陷 5（小，顺手修）
- **登录接口应校验 `Content-Type: application/json`** 与同源 `Host` / `Origin`（沿用 `hostOk` / `originOk`；M5-2 提示词只要求写请求，但登录也是 `POST`，缺这层会让跨站表单能触发「登录 CSRF」并消耗限速额度）；失败统一 403，且**不得计入账号失败次数**（避免被跨站请求锁死别人的账号）。
- **账号锁定会让合法用户登不进去**（我实测：对 `boss1` 并发错 40 次后，**正确口令**从别的来源登录也是 429）——这是「每账号 5 次 / 15 分钟」的设计取舍，**不要求你改**，但请在 `README.md` 里写明这个已知风险与建议缓解（例如董事会本机可 `tenancy-admin unlock --company … --username …` 立即解锁：**请顺手加这个命令**，它清除该账号的限速状态并写审计事件）。

## 不要动的东西（已验证没问题）
scrypt 参数与假哈希（耗时与响应形状已测：存在 / 不存在账号 / 不存在公司 / 非法用户名格式全部同为 401、同一响应体、耗时同量级）；会话只存 SHA-256；公司 A 的会话访问 B → 404；并发爆破限速（40 并行只放行 5 个）；关闭状态零变化（`tools\tenancy-snapshot.mjs` 11 条路由对比 0 差异，**改完要重跑**）。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（当前基线 **560 项起**，不得放宽已有断言；**若因为路由路径改动需要调整 `tests\auth-routes.test.mjs` / `auth-server.test.mjs` 里的路径，逐条列出并说明，不得删除断言**）；`node --check` 所有改动的 `.mjs`。
- **cookie 罐端到端测试通过**（缺陷 1 的核心证据），并**贴出该测试对每个接口「是否会带 cookie」的输出表**。
- 重跑 `tools\tenancy-snapshot.mjs`：**关闭状态下**所有既有路由与新增三条探针路由（`/auth/session` 与 `/c/zhixu/whoami` 的**新路径**也要加进快照，**关闭状态必须仍是旧的静态 404 `not found`；`POST /auth/login` 仍是 405 `{"error":"不支持"}`**）与改动前逐字节一致。
- 在测试临时目录里复现并贴出：并发爆破仍只放行 5 个；改口令爆破第 6 次 429；`mustChangePassword` 账号能通过 cookie 罐模拟完成「登录 → 改口令 → `whoami` 200」。
- 汇报：每条缺陷做到没有；没做到的原因；选了缺陷 1 的 A 还是 B 及理由；`server.mjs` 的逐行差异；**未验证项如实写**（真实浏览器里的 cookie 行为：你只做了模拟，由董事会侧用真实浏览器再验证）。
- **不要自己结束或重启进程；不开启 `auth.enabled`；不创建真实账号。**
