# M5-2-accounts-sessions：账号、口令哈希、会话、CSRF、登录限速（别家老板登录的认证原语；默认关闭）

**建议执行者：Trae（新会话）。完成后由董事会侧（Claude）独立评审；建议再请一位不同的执行者做一次越权复核。前置条件：M5-0（设计）、M5-1（地基）已验收，服务已重启并包含 M5-1。** 先读 `_common.md`，再**完整读** `E:\VirtualAIOffice\paperclip-ops\multitenant-design\m5-0-design.md` 的**第 4 节（身份与访问设计，本任务的规格）、第 6 节、第 10.2 节红队用例 RT-01…RT-09 及与登录 / 会话 / CSRF / 限速相关的条目**和 `threat-model.md`；知识库 `E:\VirtualAIOffice\knowledge\项目\前厅与小镇规划.md` 第十九节及三个补充（**董事会决定：暂不要求 HTTPS / VPN，已接受局域网明文 HTTP 的残余风险；隔离由办公室网关强制；Paperclip 永远只监听 127.0.0.1**）；M5-1 的实现 `tenancy\*.mjs`（`tenant-ids / tenant-registry / tenant-paths / tenant-context / paperclip-gateway / index`）与 `tests\tenancy-*.test.mjs`；`server.mjs` 的访问控制部分（`hostOk`、`isLoop`、`lanUser`、`lanAuthed`、`/lan-login` 限速、`ACT_TOKEN`、`API_PATHS`）。

## 董事会已定（本任务采用的方案）
- **账号来源 = 方案 A：账号只能由平台管理员（= 运行服务的这台电脑的本机）创建 / 重置 / 禁用**，用**本机命令行工具**，**不提供任何网页或接口来创建账号**，也**不接受别家老板自助申请**（方案 B「申请 + 审批」留作以后，设计要给它留出位置但本任务不做）。别家老板拿到的是**一次性初始口令**（由董事会线下转交），**首次登录必须改口令**。
- **范围只做认证原语**：账号存储、口令哈希、会话、CSRF、登录限速、最小审计事件、`/auth/login|logout|session` 与一个最小的受保护探针 `GET /c/:slug/whoami`。**不做**：RBAC 与动作注册表（M5-3）、任何租户业务数据读取（任务 / 同事 / 知识库…）、状态迁移（M5-4）、完整审计链与平台代入（M5-5）、算力钱包与充值（M6b）、跨公司信箱。**这些一个字都不要提前实现。**
- **默认关闭**：总开关沿用 M5-1 的 `multitenant.json`，并新增子开关 `auth.enabled`（默认 `false`）。**两者都为 `true` 才生效**；任一缺失 / 损坏 / 非布尔 `true` 都视为关闭。**关闭时所有新路由的响应必须与今天完全相同**（`GET /auth/session` 与 `/c/…` 走现在的静态 404 `not found`；`POST /auth/login` 走现在的 405 `不支持`；**逐字节一致**，用 M5-1 的 `tools\tenancy-snapshot.mjs` 扩充几条路由对比）。

## 本任务的例外规则
- **允许新增**（`office3d\` 内）：`tenancy\auth\password.mjs`、`tenancy\auth\accounts.mjs`、`tenancy\auth\sessions.mjs`、`tenancy\auth\rate-limit.mjs`、`tenancy\auth\csrf.mjs`、`tenancy\auth\auth-events.mjs`、`tenancy\auth\routes.mjs`、`tenancy\auth\index.mjs`、`tools\tenancy-admin.mjs`（本机命令行：创建 / 重置 / 禁用 / 列出账号）、`tests\auth-*.test.mjs`；允许修改 `tenancy\index.mjs`（接线）、`server.mjs`（**只限第 6 节列出的接线**，不得碰局域网访问码逻辑本身、`hostOk` 的判定、大屏令牌、`act()` 的任何现有分支、静态文件白名单 `STATIC_EXT / staticOk`）、`README.md`、`multitenant.json`（只增加 `auth.enabled:false` 一个字段）。
- **不要改**：`app.js`、`ui.js`、`index.html`、`director.js`、`town*`、`foyer*`、所有业务模块、`tenancy\paperclip-gateway.mjs`（M5-3 才扩白名单）、Telegram / 密钥文件。**不得向 Paperclip 发任何写请求**；不创建公司 / 同事；**不得读取、打印、写出**真实的 `lan.json`、`wall.json`、`telegram*`、`*.dpapi`、`config.json` 里的密钥字段；**不新增依赖**（只用 `node:crypto` 的 `scrypt / randomBytes / timingSafeEqual / createHash / createHmac`）。
- 备份 `server.mjs`、`README.md`、`multitenant.json`、`tenancy\index.mjs` 到 `office3d-backup-m5-2`。**改了 `server.mjs`，让人重启服务（汇报里写明，不要自己结束进程）。不要与任何其他改 `server.mjs` 的任务同时进行。**
- **开工第一步（改任何文件之前）**：用 `tools\tenancy-snapshot.mjs` 对**当前运行中的旧服务**拍一份路由快照存到 `office3d-backup-m5-2\snapshot-before.json`（并把脚本的路由列表扩充 `/auth/session`、`/c/zhixu/whoami`、`POST /auth/login` 的**状态码与响应体哈希**，**这个扩充本身是新增、不改已有输出**），重启后逐路由对比。

## 要做的事
### 1. 口令（`password.mjs`）
- **`crypto.scrypt`**：`N=32768, r=8, p=1, keyLen=32, maxmem=64 MiB`（见 M5-0 §4.1）；盐 16 字节 `randomBytes`；存储格式 `{algorithm:'scrypt',N,r,p,keyLen,salt,hash}`（base64）；**验证先解码并校验长度**，再 `timingSafeEqual`；**口令长度 12–128 字符**（按码点），拒绝更长输入（防 DoS）；不得与用户名相同；拒绝明显弱口令（至少：全相同字符、`password`/`12345678` 一类常见串的小型内置黑名单，列表写成常量，可测试）；**不得有任何明文或可逆存储**，不得写入日志 / 审计 / 错误信息。
- **统一时间**：账号不存在时也要对一个固定的**假哈希**做一次同样的 scrypt 验证，使「账号不存在」与「口令错」的耗时和响应一致（RT-01 / RT-02）。
- 参数升级：提供 `needsRehash(record)`，成功登录后在参数落后时**重哈希**（本任务只实现函数与测试，参数现在只有一版）。

### 2. 账号存储（`accounts.mjs`）与本机管理工具（`tools\tenancy-admin.mjs`）
- 账号存于 `multitenant\tenants\<townCompanyId>\auth\accounts.json`（**路径只能经 M5-1 的 `tenantPath` 得到**）；字段：`id`（随机，不含个人信息）、`username`（`^[a-z0-9][a-z0-9._-]{2,31}$`，同一公司内唯一，大小写规范化为小写）、`role`（`company_owner | company_member | company_viewer`；**本任务只有存储与校验，不赋予任何数据权限**）、`passwordRecord`、`mustChangePassword`、`status`（`active | disabled`）、`createdAt`、`updatedAt`、`version`（乐观锁）、`failedCount` 等**不放进账号文件**（限速状态另存，见 4）。**原子写入**（临时文件 + rename），损坏文件**只读且不覆盖**，视为该公司**所有账号不可登录**并写审计事件。
- **平台管理员 = 本机**：不设平台管理员账号文件，不提供平台管理员的网页登录（沿用「本机即平台管理员」）。
- **`tools\tenancy-admin.mjs`（只能在本机命令行运行）**：`create-account --company <slug> --username <u> --role <r>`（生成**一次性随机初始口令**，只在这一次命令输出里打印，**不写入任何文件 / 日志 / 审计**；设置 `mustChangePassword:true`）；`reset-password`（同样产生新的一次性口令并**撤销该账号的全部会话**）；`disable` / `enable`（禁用即撤销全部会话）；`list`（只列用户名 / 角色 / 状态 / 创建时间，**不列任何哈希**）。**要求 `multitenant.json` 里 `enabled:true` 且该公司在注册表里是 `active`**，否则拒绝；**每个命令都写入一条审计事件**。**不得有任何网络监听**。口令生成用 `randomBytes`（≥ 16 字节，base64url）。
- **最后一个 owner 不可被禁用 / 降级**（存储层强制 + 测试）。

### 3. 会话（`sessions.mjs`）
- `sid = randomBytes(32)`（base64url）；**服务端只存 `SHA-256(sid)`**，记录 `{userId,companyId,role,createdAt,lastSeen,csrfHash}`；**空闲 12 小时、绝对 7 天**（用可注入的时钟测试）；成功请求刷新 `lastSeen`；登出 / 口令重置 / 角色改变 / 账号禁用 / **公司被暂停或退出**立即撤销。
- **每次登录签发新 sid（防会话固定）**：请求带来的旧 sid 一律作废、不得沿用（RT-06）；同一账号并发会话数上限 5，超限淘汰最旧。
- 持久化：会话存 `multitenant\tenants\<id>\auth\sessions.json`（原子写入，**只含哈希**，重启后保留；文件损坏 → 全部会话失效，不崩溃）。
- **Cookie**：名 `vao_sid_<slug>`，`Path=/c/<slug>/`，`HttpOnly; SameSite=Strict; Max-Age=604800`，**Host-only（不设 Domain）**；局域网是 HTTP，**不加 `Secure`**（董事会已接受残余风险，**文档里写明并列出已采用的缓解**：短会话、慢哈希、限速锁定、每公司独立 cookie、审计异常登录）。**slug 只用于选择 cookie 名，公司上下文必须由服务端会话取出**；cookie 指向的会话属于别的公司 → 统一 404（RT-27 类）。

### 4. 登录限速与锁定（`rate-limit.mjs`）
- **每账号摘要 5 次 / 15 分钟、每来源摘要 20 次 / 15 分钟**（来源摘要 = `HMAC(进程内随机密钥, 远端地址)`，**不落盘原始 IP**）；失败后**指数退避**（最高 15 分钟）；成功后清理该账号的短期失败计数；**统一错误文案 + 统一状态**（401 `凭据无效或暂不可登录`；达上限统一 429，**不表明账号是否存在**）；限速状态**内存 + 定期落盘（只含摘要）**，重启后不能被用来绕过（至少保留 15 分钟内的计数）。
- 与现有局域网共享访问码的限速（`/lan-login`）**互不影响**，各用各的计数。

### 5. CSRF 与请求校验（`csrf.mjs`）
- 登录成功时返回 **CSRF token**（`randomBytes(32)`，服务端存哈希）；**所有写请求**（本任务只有 `POST /auth/logout`、`POST /auth/change-password`）必须同时满足：同源 `Host` / `Origin`（**复用现有 `hostOk` 与 Origin 判定，不另写一套**）、`Content-Type: application/json`、`X-CSRF-Token` 与会话保存的摘要常量时间匹配、`Sec-Fetch-Site` 不是 `cross-site`、JSON 体 ≤ 8 KB；任一不满足统一 403（不泄露具体哪一项）。**现有 `ACT_TOKEN` 不得被当成多用户授权，也不得出现在新路由里。**

### 6. 路由与 `server.mjs` 接线（只允许这些）
1. `POST /auth/login`（体：`{company, username, password}`；`company` 是**公开的 slug**，不是内部 id；**不接受 `companyId` 字段**）→ 成功：`200 {ok:true, role, displayName, mustChangePassword, csrf}` 并 `Set-Cookie`；失败统一 401 / 429。
2. `POST /auth/logout`（CSRF）→ 撤销当前会话、清 cookie。
3. `GET /auth/session` → 当前会话的最小信息 `{role, username, company:slug, mustChangePassword, csrf?}`（`csrf` 只在需要时给）；无会话 401。
4. `POST /auth/change-password`（CSRF；旧口令 + 新口令）→ 成功后**撤销该账号其它全部会话**、清 `mustChangePassword`。**`mustChangePassword:true` 的会话只能调用 `change-password` / `logout` / `session`**，访问 `whoami` 返回 403 `需先修改口令`。
5. `GET /c/:slug/whoami`（受保护探针，**不返回任何公司业务数据**）→ `{role, username, company:slug}`；会话 / slug 不匹配统一 404。
6. **这些路由绕过局域网共享访问码的 401 登录页**（老板用自己的账号，不需要共享访问码），**但只限这 5 个精确路径**；**其它一切路由对这类会话仍然是 401 / 404，不得因为有了会话就能访问 company #1 的任何现有页面或接口**（用测试固定：带有效老板会话访问 `/state`、`/kb`、`/issue`、`/foyer`、`/act`、`/` 全部仍按「未通过局域网访问码」处理）。**先读清楚现有访问控制的顺序再接，复用现有变量，不改任何现有判断。**
7. `API_PATHS` 加入新路径使大屏令牌设备一律 403；新路由放在**访问控制判定之后的专属分支**，**关闭状态下完全不存在**（见开头「零变化」）。
8. `/platform/tenancy`（M5-1）的返回里增加 `auth: { enabled, accounts: <数量，不含明细> }`（**只给计数**，仍仅本机）。

### 7. 最小审计事件（`auth-events.mjs`；完整审计链是 M5-5）
- 追加式 JSONL：`multitenant\tenants\<id>\audit\auth-YYYY-MM.jsonl`（路径经 `tenantPath`），每行 `{at, event, companyId, userId|null, sourceDigest, result, reason?}`；事件至少：`login_ok / login_fail / login_locked / logout / session_expired / password_changed / account_created / account_reset / account_disabled / csrf_denied / cross_company_denied`；**绝不含口令 / sid / csrf / 完整 IP / UA 原文 / 请求正文**；单条 ≤ 1 KB；文件超大（> 5 MB）时按月滚动并拒绝继续写入同一文件后另起 `-2`；**写失败不得让登录路径崩溃**（降级为内存计数并在 `/platform/tenancy` 报警）。

## 测试（`tests/auth-*.test.mjs`，**用可注入的时钟与存储**；把 M5-0 §10.2 的 RT-01…RT-09 及登录 / 会话 / CSRF 相关用例逐条对应，并在汇报里给出「编号 → 测试名」对照表）
- **口令**：scrypt 参数与格式、盐唯一、验证成功 / 失败、长度上下界（11 / 12 / 128 / 129）、与用户名相同被拒、黑名单、**假哈希使不存在账号耗时落在同一量级**（用多次采样比较中位数，容差写明）、不泄露任何明文（对日志 / 审计 / 错误序列化后 grep）。
- **账号**：创建 / 重置 / 禁用 / 最后 owner 保护 / 用户名规范化与唯一 / 乐观锁 / 损坏文件不崩溃且不覆盖 / 路径只能经 `tenantPath`（对 `..`、`slug` 非法、未注册公司各一例）。
- **登录**：RT-01（错口令 401 统一）、RT-02（无账号与 RT-01 同状态 / 形状 / 耗时量级）、RT-03（第 6 次 429）、RT-04（同来源多账号超阈值 429）、RT-05（锁定期后恢复）、RT-06（预置 sid 登录后换新 sid、旧值无效）、RT-07（重复登录并发会话上限）、RT-08（登出后原 sid 401）、RT-09（绝对 / 空闲过期 401）；`mustChangePassword` 流程；客户端传 `companyId` / `X-Company` / `?company=` 一律忽略。
- **会话 / Cookie**：只存哈希（文件里搜不到 sid）、cookie 属性逐项断言（名、`Path`、`HttpOnly`、`SameSite=Strict`、无 `Domain`、无 `Secure`）、公司 A 的 cookie 发到 `/c/<B>/whoami` 得 404、公司被暂停后立即失效、口令重置 / 禁用后立即失效。
- **CSRF / 请求校验**：缺 / 错 token、跨站 `Sec-Fetch-Site`、错误 `Content-Type`、超大 JSON、`Origin` 不同源，均 403 且响应一致。
- **绕过访问码的范围**：有效老板会话访问 5 个路径之外的任何路由**不会**获得放行（逐个路由断言）；**大屏令牌设备访问新路由 403**；本机访问行为与今天一致。
- **零变化**：开关关闭 / 缺失 / 损坏三态下新路由响应与旧版逐字节相同；不创建 `multitenant\` 子目录；无新定时器 / 监听端口。
- **静态检查**：`tenancy\auth\*.mjs` 与 `tools\tenancy-admin.mjs` 不含 `eval / new Function / child_process / Math.random / innerHTML / fetch(`；不引用 `lan.json / wall.json / telegram / ACT_TOKEN`；不含 `topup|recharge|wallet|balance|price`；口令相关变量不进入任何 `console.log`（grep 断言）。
- 既有全部测试不得放宽，全过（当前基线 **518 项起**）。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --check` 所有新增 `.mjs` 与 `server.mjs`。
- **重启后（由人重启，开关保持关闭）**：`tenancy-snapshot` 重跑，**所有既有路由与新增三条探针路由与改动前逐字节一致**；`GET /platform/tenancy`（本机）贴输出；用模拟局域网请求确认新路径仍是旧的 401 / 404 行为。写出命令与输出。
- **开启后的联调**（**只在测试用的临时目录 / 临时副本上做，不要在运行中的服务上开启**；方法：用测试里的内存服务器或 `node` 起一个监听在随机回环端口的**测试专用**实例，数据目录指向 `os.tmpdir()`；**不得启动第二个办公室服务的真实实例**，那会重复 Telegram 轮询）：创建账号 → 登录 → `whoami` → 改口令 → 登出 → 限速 → 禁用，各一遍；贴输出（**一次性口令用占位符，不要贴真实值**）。
- 汇报（按 `_common.md` §5）：每条要求做到没有；没做到的原因；**RT 编号 → 测试名对照表**；`server.mjs` 的逐行差异；零变化证据；**「绕过访问码的 5 个路径」的访问控制顺序说明**（贴你对现有流程的理解与改动位置）；**未验证项如实写**（真实局域网设备上的 cookie 表现、第二家公司下的隔离：留给 M5-3）；发现的可疑内容只报告。
- **不要自己结束或重启进程；不创建真实账号 / 会话；不接任何资金概念。**
