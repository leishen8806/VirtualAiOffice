# C2-command-view-projection：`CommandViewData v1` 纯投影与校验器（纯模块 + 测试，无请求，约 1–1.5 小时）

**执行者：Trae（新会话）。主线。** **前置：C1 已验收；董事会 2026-10-21「按建议」已批准：先 `live + demo`、replay 不进 V1；二维入口 = 独立页面 + 治理中心最小入口；未证实阶段（验证中 / 待验收 / 已验收）在证据接线前一律显示「待验证（无证据）」，原生 `in_review` 仍可显示；成本源不返回计价记录时确认金额与总金额都显示未知；共享懒取数协调器与「公司 + 授权范围」缓存键改造获批（C3 前置）；3D 摘要屏位置与预算以后再定。** 先读：`_common.md`、`_lane-main.md`、**`docs\command-view-plan.md`（全文，字段与规则以它为准）**、`docs\command-view-checks.mjs` 与 `docs\command-view-sample.json`、`done-rules.mjs`、`scheduler-core.mjs`、`scheduler-view.mjs`、`contract-view.mjs`、`health.mjs`（H1 之后）、`event-envelope.mjs`。

**允许新增：** `command-view-data.mjs`（投影）、`command-view-validate.mjs`（校验器，规则与 `docs\command-view-checks.mjs` 一致）、`tests\command-view-data.test.mjs`、`tests\command-view-validate.test.mjs`；`README.md` 追加一节。**不要改**任何已有文件（含 `docs\` 下的 C1 产物、`server.mjs`、`ui.js`、`app.js`）。备份：只新增文件，汇报里写明。**纯模块：不请求网络、不读写文件、不调 `Date.now / Math.random`（时间由参数注入）、不引用 `server.mjs`。**

## 要做的事
1. **`command-view-validate.mjs`**：`validateCommandView(data)` → `{ ok, errors:[{path, code}] }`，**实现 C1 检查脚本里的全部规则**（顶层字段与版本、`Measurement` 未知必为 `null + 原因码`、原因码白名单、阶段只在允许集合内、证据完整性、成本未知不得为数值 / 币种不混加、敏感键与值扫描、`demo` 只含 `demo-*` 标识、过期标记 `STALE_LIVE_ILLUSION`、部分集合不得用空数组冒充）；**对 `docs\command-view-sample.json` 返回 `ok:true`，并对 C1 的四个变异（`zerocost / fakeaccepted / leak / stale`）各返回对应错误**（测试里内联同样的变异函数）。
2. **`command-view-data.mjs`**：`projectCommandView({ now, mode, company, scope, sources })` → `CommandViewData v1`。`sources` 是调用方**已经取好**的只读快照（`state` 摘要、任务 / 同事 / 运行列表、`contractView`、`scheduler` 建议、`health`、可选的逐任务 `evidence / activity` 摘要）；**本函数不取数**。必须实现：
   - **阶段映射**（C1 第 4 节）：先检查公司 / 任务归属与证据版本，再给出**已证实的最强阶段**；用 `done-rules.evaluateDone` 的结构化输入判定验收，**legacy / 无 `enforcedSince` 不得显示「已验收」**；缺证据 → `stage:'pending_verification'` + 对应原因码；`rawStatus` 总是原样保留。
   - **队列**：最多 200 项，标明 `complete / reason`（超出或未加载 → `PARTIAL_PAGE` / `NOT_LOADED`，摘要计数用 `null` 而不是用数组长度）；标题 ≤ 80 个 Unicode 字符并先去控制字符与敏感模式；**绝不输出任务正文 / 评论 / 运行输出 / 内部地址**。
   - **督办焦点**：按 C1 第 6 节把阻塞原因（`AWAITING_BOARD / DEP_PENDING / DEP_UNKNOWN / DEP_CANCELLED / BUDGET_EXHAUSTED / MONEY_CLASS_NEEDS_BOARD / 验证失败 / H1 执行器类 / 已交付无验收`）映射为 `blocker` + `nextHandler`（**入口枚举**，不是 URL）；多阻塞可共存；排序规则按 C1（必须人决策的在前 → 确认的等待起点 → 未知时间在后 → `taskId` 稳定）。**不调用模型，不产生通知。**
   - **成本卡**：`confirmedAmount / totalAmount / confirmedRuns / unknownCostRuns / missingUsageRuns / observedRuns / lastUpdatedAt` 全是 `Measurement`；**任何成本未知 → `totalAmount:null`**；无确认记录 → `null + NO_CONFIRMED_COST`；多币种不求和；**不从月额度 `spentMonthlyCents=0`、模型配置、时长估价**。
   - **新鲜度**：`dataAgeMs` = 关键源最老采样龄；> 120 s、断线或未知 → `quality.freshness` 标「更新中断 / 更新时间未知」；**缓存命中保持原 `generatedAt`**。
   - **公司隔离**：输入里任何带别的公司标识的对象一律拒绝（返回 `{ ok:false, code:'COMPANY_MISMATCH' }`），不混入结果。
   - **`mode:'demo'`**：只接受 `demo-*` 标识，拒绝似真实 UUID / 任务编号 / SHA（给 C7 用）。
3. **确定性**：同输入两次输出深度相等；输入对象不被修改（冻结断言）；**1 万项输入 < 500 ms**。

## 测试
- 逐条覆盖 C1 第 10 节「后续测试清单」中**不依赖 UI 与请求**的项（1–6、8 的投影侧）：同任务队列 / 执行 / 摘要一致；`done / succeeded / 投票 PASS / legacy accepted / 缺独立 review / 测试哈希变更 / 版本变化 / 非法验收人` 均不能显示已验收；未知成本 `null + 原因`、确认 0 需有计价证据、多币种 / 部分计数不得求总；过期 / 断线禁动画标记；切公司拒绝；`NO_STATUS_TRANSITION` 不生成返工次数 / 阻塞时长 / 百分比。
- 静态：无 `fetch / fs / Date.now / Math.random / child_process / eval / innerHTML`；输出里无 `title` 以外的长文本、无 `body / description / comment` 键；**「关键词只出现在禁令里」类反例**（吸取 L1a / L3a 教训）：任务描述里写「禁止读取密钥」不得影响资金类判定。
- 全量 `node --test tests/*.test.mjs` 全过，不得放宽。

## 汇报
「做到 / 没做到 / 未验证」，与磁盘一致；贴校验器对样例与四个变异的结果。**不要重启服务。**
