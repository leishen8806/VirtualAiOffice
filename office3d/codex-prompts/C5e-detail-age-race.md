# C5e-detail-age-race：指挥视图「真实数据 · 详情」数据年龄始终未知（小卡，约 20 分钟）

**执行者：Trae（同一会话，主线）。** **只修这一个问题，不加功能；先于 O6b 做（很小）。** 先读：`command-view-live.mjs`（`request()` 与 `load()`）、`tests\command-view-live.test.mjs`。

## 问题（我用真实数据在线复现）
`GET /command-view?mode=live&taskId=<有效任务>` 返回的 `dataAgeMs = {value:null, reason:'UNKNOWN_TIME'}`、`freshness = {stale:true, reason:'UNKNOWN_TIME', animationAllowed:false}`。分来源看：`queue` 与 `agents` 年龄已知（约 14 秒），**`execution`、`timeline`、`activity` 三个来源的年龄都是 `UNKNOWN_TIME`**，尽管这三个来源都成功加载（运行 25 条、时间线 183 条）。列表视图（C5d）已正常（年龄 5.7 秒、`stale:false`），不要动它。

## 根因（已读代码核对，请你确认）
`load()` 开头用 `const ms = clock()` 取「当前时间」，之后把 `now: new Date(ms).toISOString()` 传给 `projectCommandView`。而 `request()` 每个请求**在开始时**又取一次 `clock()` 作为该来源的 `at`（`new Date(at).toISOString()`）。详情请求发生在 `ms` 之后，所以这些来源的 `at` **晚于** `now`。`command-view-data.mjs` 里 `value.at && timestamp(value.at) <= timestamp(now)` 不成立，于是年龄被判未知。

## 要做的事
1. **只在 `command-view-live.mjs` 里修**，不要改 `command-view-data.mjs`：在所有来源加载完成后、调用 `projectCommandView` 之前**重新取一次时钟** `projectNow = clock()`，用它作为 `now`（以及没有 `captured.at` 时的 `generatedAt` 回退）；`range.to` 与 `from` 的计算保持用开头的 `ms`（范围边界不能随请求耗时漂移）。**同时保证 `to ≤ projectNow`。** 用注入的固定时钟时（测试）行为不变。
2. 目标行为：详情成功时各来源年龄已知、总年龄取最大值，`≤120 秒` 时 `stale:false`；详情失败的显式 `UNKNOWN_TIME`、`state.at` 缺失时的未知、列表视图行为**全部保持不变**。
3. 测试（不放宽已有断言）：用**会推进的注入时钟**（每次调用 `now()` 加 50 ms）复现「请求时间晚于开头时间」——改前该测试失败、改后通过；详情成功时 `execution / timeline / activity` 来源年龄为数字且 `stale:false`；固定时钟下输出与改前逐字段一致；详情失败仍 `UNKNOWN_TIME`；全部输出过 `validateCommandView`。全量 `node --max-old-space-size=2048 --test --test-timeout=60000` 全过。
4. 备份 `command-view-live.mjs` 与其测试到上一级目录 `office3d-backup-c5e`；不改开关、不重启服务、不读取或打印密钥、不新增请求。「做到 / 没做到 / 未验证」，**停下等我验收**（我会在线打开两层开关用真实任务核对，再恢复开关）。
