# M5-1-tenant-foundation：多租户地基——功能开关 + 公司注册表 + 租户上下文 + 安全目录解析 + Paperclip 网关骨架（**默认关闭，关闭时对现有系统零变化**）

**建议执行者：Trae DeepSeek V4 flash（服务端、边界清晰；与 S1-2 / M1-B 同类）。完成后由董事会侧（我）独立评审，并建议再请一位不同的执行者做一次越权复核。** 先读 `_common.md`，再**完整读** `E:\VirtualAIOffice\paperclip-ops\multitenant-design\m5-0-design.md`（**第 0、1、4、5、6、9、10、11 节是规格**）和 `threat-model.md`，以及知识库 `E:\VirtualAIOffice\knowledge\项目\前厅与小镇规划.md` 的**第十九节及其三个补充**（董事会决定）。再读现有实现：`office3d\server.mjs` 的访问控制部分、`foyer.mjs`（S1-2 的「默认关闭 + 原子写 + 损坏视为关闭」范式）、`town-map.mjs`（M1-B 的薄接线范式）、`workload.mjs` 的工厂写法。

**本任务的例外规则：**
- **允许新增**（`office3d\` 内）：`tenancy\tenant-ids.mjs`、`tenancy\tenant-registry.mjs`、`tenancy\tenant-paths.mjs`、`tenancy\tenant-context.mjs`、`tenancy\paperclip-gateway.mjs`、`tenancy\index.mjs`（薄入口）、`multitenant.json`（开关与状态，**默认 `{"enabled":false}`**）、`tests\tenancy-*.test.mjs`、`tools\tenancy-snapshot.mjs`（零变化快照脚本，只读）；允许修改 `server.mjs`（**只限第 6 节列出的接线**，不得碰局域网访问码、`hostOk`、大屏令牌、`act()` 任何现有分支、静态文件白名单、`lan-login`）、`README.md`。
- **不要改**：`app.js`、`ui.js`、`index.html`、`director.js`、`town*.js`、`foyer.mjs`、所有现有业务模块（`committee/standup/acceptance/rework/handoff/chat/memory/workload/stats…`）、`town\`、`wall.mjs`、Telegram / 密钥相关文件。**本任务不迁移任何现有状态文件、不创建任何租户目录里的业务数据、不改任何现有模块去「接受 tenantRoot」**（那是 M5-4）。
- **不做**：登录 / 账号 / 会话 / CSRF / 限速（M5-2）、RBAC 与动作注册表（M5-3）、状态迁移（M5-4）、审计链（M5-5）、算力计量与钱包（M6b）、跨公司信箱。**这些一个字都不要提前实现**。
- **对 Paperclip 只允许 GET**（`http://127.0.0.1:3100`）；**不创建公司 / 账号 / 同事、不改任何预算或暂停字段**。不得读取、打印、写出任何密钥 / 令牌 / 访问码 / 口令（`lan.json`、`wall.json`、`telegram*`、`*.dpapi`、`config.json` 里的密钥字段一概不碰）。不联网、不装依赖（口令哈希之类不在本任务）。
- 备份 `server.mjs`、`README.md` 到 `office3d-backup-m5-1`（办公室目录没有 Git）。**改了 `server.mjs`，让人重启服务（汇报里写明，不要自己结束进程）。不要与任何其他改 `server.mjs` 的任务同时进行。**

## 董事会已定的前提（必须遵守，不要重新讨论）
1. **所有公司共存于同一个小镇（同一办公室服务 + 同一 Paperclip）**；**不接受**「每公司一个进程 / 系统账号」的兜底。**隔离由办公室这一层网关强制**：公司 id **只来自会话**（此阶段尚无会话，见下），**绝不信任客户端传来的公司 id / 路径**；按资源 id 取回后**先校验归属再返回**；只允许白名单内的 Paperclip 路径；跨公司统一 403 / 404 且**不泄露存在性**。
2. **老板与成员永远不直接访问 Paperclip**：Paperclip 只监听 `127.0.0.1:3100`（我已核实）；**任何使 Paperclip 对局域网可达的配置都视为严重回归**。
3. **先不要求 HTTPS / VPN**（残余风险已被董事会接受，M5-2 再处理缓解）。
4. 公司注册表里「模拟公司」`kind:'simulated'` 的 `paperclipCompanyId` 必须为 `null`，**不能拥有账号 / 算力钱包 / 可提取价值**（本任务只在注册表校验里强制这一条）。
5. 这是 **无资金地基**：不含任何充值、钱包、价目、扣费概念；命名里**不得出现** `topup / recharge / wallet / balance / price`（静态测试固定；`ledger` 只在注释里作为「后续阶段」出现时允许，但不得有任何实现）。

## 要做的事
### 1. 功能开关 `multitenant.json`（默认关闭）
- 文件缺失、损坏、`enabled !== true` → **一律视为关闭**，服务正常运行，`/platform/tenancy`（见 5）返回 `{enabled:false, reason:'off'|'missing'|'corrupt'}`，**不崩溃**。原子写入（仿 `foyer.mjs`）；**首次开启由董事会确认**（沿用现有新功能的做法：我们不会在本任务里开启它）。
- 开关**每次请求读取或带短缓存（≤ 5 秒）**，改文件无需重启即可生效；**关闭状态下不得创建任何新目录 / 文件 / 定时器 / 监听端口**。

### 2. ID 与注册表（`tenant-ids.mjs`、`tenant-registry.mjs`）
- `townCompanyId` 只允许 `^cmp_[a-z0-9]{16,32}$`；`slug` 只允许 `^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$`；`displayName` ≤ 40 字、去控制字符（展示时**一律转义**）；`paperclipCompanyId` 只允许 UUID 格式或 `null`。**所有校验函数是纯函数**，拒绝一切不匹配的输入（包括 `..`、`/`、`\`、空字节、Unicode 同形字、超长、前后空白）。
- 生成 id 用 `crypto.randomBytes`（**不要** `Math.random`）。
- 注册表文件 `multitenant\config\companies.json`（路径相对 `office3d\`，**仅在开关开启且首次写入时才创建**；缺失按「只有 company #1 虚拟项」处理，**不写盘**）。字段与状态机按 M5-0 第 5.1 节：`id, slug, displayName, kind('real'|'simulated'), status('applied'|'approved'|'active'|'paused'|'exited'), paperclipCompanyId, createdAt, approvedAt, version`；**状态转换只允许 `applied→approved→active↔paused→exited`，`exited` 不可恢复**；`slug` 与 `paperclipCompanyId` **全表唯一**；`kind:'simulated'` 且 `paperclipCompanyId≠null` 被拒；`kind:'real'` 的 `active` 必须有 `paperclipCompanyId`。写入**原子、带 `version` 乐观锁**，损坏文件 → 注册表只读且 `/platform/tenancy` 报 `corrupt`，**不覆盖损坏文件**。
- **company #1（智序工场）作为虚拟项内置**：`id` 固定为一个符合规则的常量（例如 `cmp_` + 16 位固定字符，**写成常量并在测试里固定**），`slug:'zhixu'`，`kind:'real'`，`status:'active'`，`paperclipCompanyId` 取自 `company-id.txt` 的**现有值**（只读；读失败则 `null` 并报告，不崩溃）。它**不写入** `companies.json`（保持「功能关闭 / 无注册文件」时零变化）。
- **本任务不提供「创建 / 审批公司」的 HTTP 接口**（那需要账号与审计），只提供注册表模块的纯函数 + 工厂 API（`list / get / create / transition`）给测试和后续阶段使用；`create` 在没有后续阶段的鉴权前**不接到任何路由**。

### 3. 安全目录解析（`tenant-paths.mjs`）
- `tenantRoot(townCompanyId)` → `multitenant\tenants\<id>\`；`tenantPath(id, ...segments)`：校验 id 合法且**在注册表里存在**；每个 segment 只允许 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` 且**不得为 `.` / `..`**，也不得包含路径分隔符、冒号（盘符 / ADS）、空字节；`path.resolve` 之后用 `path.relative` 验证**仍在 `tenantRoot` 之内**，并**拒绝符号链接 / 联接点（junction）跳出**（用 `fs.realpathSync` 对已存在的最深层级做校验；不存在的路径校验其已存在的父级）。
- Windows 特有风险必须覆盖：保留设备名（`CON / NUL / COM1…`）、末尾点 / 空格、`\\?\` 前缀、8.3 短名、大小写不敏感比较、NTFS 备用数据流（`file.txt:stream`）。
- **只读函数，不创建目录**（创建由后续阶段的迁移脚本负责）。

### 4. 租户上下文（`tenant-context.mjs`）
- `resolveTenantContext(req, { flag, registry })` → `{ tenantId, slug, paperclipCompanyId, source }`。**本任务没有账号 / 会话**，所以上下文来源**只有**：
  - 功能关闭 → **永远是 company #1 的 legacy 上下文**（`source:'legacy'`），行为与今天完全一致；
  - 功能开启 → 本机回环请求与现有局域网只读设备仍解析为 company #1（`source:'legacy-lan'`），**没有任何方式选择其他公司**（客户端传 `company / x-company / ?c=` 之类**一律被忽略并记入计数**，测试固定）。
- 返回的上下文对象**冻结**（`Object.freeze`），不含任何密钥 / 令牌 / cookie。
- **不得**从请求头、查询参数、请求体、cookie 读取公司 id。

### 5. 只读状态接口 `GET /platform/tenancy`（**仅本机**）
- 返回 `{ enabled, reason, companies: [{ id, slug, displayName, kind, status }] (仅 company #1 + 注册表项，不含 paperclipCompanyId 完整值，只给前 8 位), gateway: { paperclipLoopbackOnly: boolean } }`；**局域网与大屏令牌设备 403**（把 `'/platform/tenancy'` 加进 `API_PATHS`；本机判断复用现有 `lanUser` 变量，**不要重写**）。关闭时也返回，但 `companies` 只含 company #1。
- 不放进 `/state`（零变化原则）。

### 6. Paperclip 网关骨架（`paperclip-gateway.mjs`，**本任务只提供模块与测试，不接到任何现有调用**）
- `createGateway({ baseUrl, fetchImpl, ownerCompanyId })`：**只允许 `GET`**；**只允许白名单路径模板**（初始仅 `/api/companies/{cid}/issues`、`/api/companies/{cid}/agents`、`/api/companies/{cid}/heartbeat-runs`、`/api/companies/{cid}/projects`，`{cid}` **必须等于 `ownerCompanyId`**，其它任意字符串一律拒绝）；**拒绝**任何非白名单路径、`..`、`//`、编码后的变体（`%2e%2e`、`%2f`、双重编码）、查询里出现 `companyId=` 参数的改写。
- **资源归属校验**：对返回的列表 / 单个资源逐项检查 `companyId === ownerCompanyId`，**任何一项不符就丢弃整个响应并报警计数**（不是只丢那一项后继续放行）；返回给调用方的永远是「已过滤、已校验」的数据，**错误信息统一**（`not found`），**不区分「不存在」和「属于别家」**。
- `baseUrl` 必须是**回环地址**（`127.0.0.1` / `localhost` / `[::1]`）；否则工厂直接抛错（对应「Paperclip 不得对局域网开放」）。
- 响应体大小上限（例如 8 MB）、超时（8 秒）、不跟随重定向（`redirect:'error'`）；不记录响应正文到日志。
- **启动自检**（`server.mjs` 里一行接线）：若 `PAPERCLIP` 配置不是回环地址，**控制台打印明确警告**，且 `/platform/tenancy` 的 `gateway.paperclipLoopbackOnly` 为 `false`；开关开启时**拒绝启用**（返回 `enabled:false, reason:'paperclip_not_loopback'`）。（**只检查配置字符串与解析出的主机名**，不做端口扫描。）

### 7. `server.mjs` 接线（只允许这些）
1. 引入 `tenancy/index.mjs` 并创建实例（传入 `dir: HERE`、`now`、`log`）；
2. `API_PATHS` 加入 `'/platform/tenancy'`；
3. 在**访问控制之后**加 `GET /platform/tenancy`（仅本机；复用 `lanUser`）；
4. 启动自检一行（见上）；
5. **不改**任何现有路由、任何现有响应、`/state`、`act()`、静态白名单；**关闭状态下该实例不产生任何磁盘写入、定时器或网络请求**。

## 零变化验证（本任务的硬门）
- **`tools\tenancy-snapshot.mjs`**（只读）：对一组**确定性**的现有 GET 路由（静态文件 `/index.html`、`/app.js`、`/town.html`、`/town/map`、`/wall`（带本机）、`/foyer`、`/health`、`/state` 的**稳定字段子集**——时间戳 / 计数这类易变字段先剔除，**写明剔除哪些**）输出「状态码 + 响应体 SHA-256 + 关键响应头」；**改动前先在旧代码下跑一次存成快照**（这一步在你开工**第一步**就做，**在改任何文件之前**，快照文件放 `office3d-backup-m5-1\snapshot-before.json`），重启后再跑一次，**逐路由对比，必须逐字节一致**（除 `server.mjs` 新增路由 `/platform/tenancy` 本身）。**如果服务尚未重启，则对比「旧进程」与「新代码离线模拟」的差异并如实写「在线对比：未验证」**。
- 源目录 SHA-256：用 `paperclip-ops\multitenant-design\scripts\source-integrity.mjs`（**只读复用，不要修改它**）证明：除本任务**明确允许**的文件外，`office3d\`、`knowledge\`、`town\`、`town-map-data\` 没有任何变化；列出变化文件清单并逐个解释。
- 无新监听端口 / 定时器 / 写文件（关闭状态）：写测试或脚本证明（例如启动实例后检查 `process._getActiveHandles()` 数量不变、检查目录里没有出现 `multitenant\`）。

## 测试（`tests/tenancy-*.test.mjs`，仿 `tests/foyer.test.mjs`；**只要 M5-0 第 10.2 节红队清单里与「注册表 / 路径 / 上下文 / 网关」相关的用例，逐条对应并在汇报里列出编号对照表；与账号 / 会话 / 资金相关的用例留给后续阶段，不要实现**）
- **ID 与注册表**：合法 / 非法 id 与 slug（`..`、`/`、`\`、`%2e`、空字节、超长、同形字、大小写、前后空白各至少一例）；状态机每条合法转换与每条非法转换；`slug` / `paperclipCompanyId` 唯一性；`simulated` 有 Paperclip id 被拒；乐观锁冲突；损坏文件不崩溃且不被覆盖；`create` 的 id 来自 `crypto`（静态检查不含 `Math.random`）；company #1 虚拟项存在且**不写盘**。
- **目录解析**：`..`、绝对路径、盘符、`\\?\`、保留设备名、ADS、8.3 短名、符号链接 / junction 跳出（在 `os.tmpdir()` 里实建 junction 做真实测试，**测试结束清理**）、大小写比较、超长 segment、空 segment 各至少一例；合法路径通过且仍在租户根内；**未注册的 id 一律拒绝**。
- **租户上下文**：关闭 → 始终 company #1 legacy；开启 → 仍然只能是 company #1；**客户端传 `X-Company` / `?company=` / `?c=` / 请求体 `companyId` / cookie 里的公司 id，上下文不变**且被计数；对象冻结。
- **网关**：非 GET 拒绝；白名单外路径拒绝；`{cid}` ≠ `ownerCompanyId` 拒绝；编码变体 / 双重编码 / 路径穿越拒绝；响应里混入别家资源 → **整个响应被丢弃**且计数；回环校验（`http://192.168.1.5:3100`、`http://0.0.0.0`、`http://example.com`、`http://[::]` 工厂抛错）；超大响应 / 超时 / 重定向被拒；错误信息统一且**不含对方公司 id / 名称**；日志不含响应正文。
- **接口**：`GET /platform/tenancy` 本机 200 / 局域网 403 / 大屏令牌 403 / 开关缺失·损坏·关闭三态都 200 且不崩溃；`API_PATHS` 含新路径；路由在访问控制**之后**；**`STATIC_EXT` 与 `staticOk` 与备份逐字相同**；`/multitenant.json` 与 `/tenancy/…` 不能被静态服务读到（404）。
- **静态检查**：`tenancy\*.mjs` 不含 `eval / new Function / child_process / innerHTML`、不含对 `lan.json / wall.json / telegram` 的引用、不含 `topup|recharge|wallet|balance|price`、不含 `Math.random`、不含非 GET 的 Paperclip 调用；**不读取请求里的公司 id**（grep 断言 `x-company` / `companyId` 只出现在「被忽略」的测试与注释里）。
- 既有全部测试不得放宽，全过。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（**当前基线 478 项起**，新增合理）；`node --check` 所有新增 `.mjs` 与 `server.mjs`。
- **重启后（由人重启，开关保持关闭）**：`GET /platform/tenancy`（本机）贴输出；用**模拟局域网请求**得 403，**模拟大屏令牌**得 403；`tenancy-snapshot` 重跑与改动前**逐路由一致**；`/state`、`/foyer`、`/town/map` 与改动前一致。写出命令与输出。
- 汇报（按 `_common.md` §5）：每条要求做到没有；没做到的原因；**红队用例编号对照表**；`server.mjs` 的逐行差异清单；**零变化证据**（快照对比 + 源目录哈希对比）；**未验证项如实写**（例如第二家公司下的真实隔离：本任务不涉及，必须写明留给 M5-3）；发现的任何可疑内容（例如 `tmp-review-idle-25h.mjs` 写死公司 id：**只报告，不要删除**）。
- **不要自己结束或重启进程；不创建任何公司 / 账号 / 会话；不接任何支付或资金概念。**
