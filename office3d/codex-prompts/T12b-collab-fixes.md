# T12b-collab-fixes：协作关系图的两处修订（窗口包含今天 + 一对一依赖加最低次数门槛）

先读 `_common.md`。T12 已验收，本任务只做下面两处修订，**不要借机改其它东西**。

**本任务的例外规则：** 只允许修改 `collab.mjs`、`collab-graph.js`（仅当界面文案或默认窗口逻辑需要）、`server.mjs`（**仅限** `/collab` 处理分支里选择窗口日期的那几行，不要碰局域网访问码、`hostOk`、大屏令牌、`act()`、静态文件白名单）、`tests/collab.test.mjs`、`tests/collab-graph.test.mjs`、`README.md`。**不要改** 其它模块。不新增依赖。**不得向 Paperclip 发任何写请求。** 备份到 `office3d-backup-collab-fixes`（办公室目录没有 Git）。**不要与其他 Codex 任务同时进行**（共用 `server.mjs`）。改了 `server.mjs`，让人重启服务（汇报里写明，**不要自己结束进程**）。

## 修订 1：「最近 7 / 14 个上班日」窗口必须包含今天

【现象（我已实测）】账本里今天有 40 条事件、5 条协作边。`GET /collab?window=all` 返回 5 条边，但 `window=7` 和 `window=14` 都返回 `workdays: []`、`edges: []`、`empty: true`，界面默认的 14 天窗口显示「账本里还没有足够的协作记录」，所有人都被标成孤立岗位。原因：`collab.mjs` 的 `workdayKeys(nowMs, n, dutyDays)` 从「昨天」开始往前数，永远不含今天（`tests/collab.test.mjs` 第 81–87 行把这一点写成了断言）。

【要求】
- 「最近 N 个上班日」= **今天（如果今天是上班日）加上之前的上班日，共 N 个**；今天不是上班日时，从最近一个上班日算起。今天按**金边时间**判断，今天的数据是**未完成的一天**。
- 今天的数据是「截至现在」，所以：① 接口返回里加 `partialToday: true|false`（窗口里是否含未完成的今天）；② 界面窗口说明里写「含今天（截至 hh:mm）」；③ `workdays` 里仍然列出今天的日期。
- **「数据不足」的判断口径不变**：少于 3 个上班日显示「数据不足，仅供参考」。**今天这个未完成的日子是否计入「上班日数」**：按「有至少一条账本事件」计入；今天没有任何账本事件时不计入（不要把空的今天算成一个上班日，否则会冲淡数据）。把这个口径写进 `README.md` 和 `collab.mjs` 顶部注释。
- `window=all` 的行为不变（本来就含今天）。`GET /collab` 缺省窗口不变（沿用现有缺省）。
- 更新 `tests/collab.test.mjs` 里依赖旧行为的断言：**只允许改与「窗口是否含今天」直接相关的断言，不得放宽其它断言**；在汇报里逐条列出你改了哪几条断言、为什么。新增测试覆盖：今天是上班日（窗口含今天，`partialToday: true`）；今天不是上班日（不含，`partialToday: false`）；今天还没有任何账本事件（窗口含今天的日期，但不计入「上班日数」，仍判「数据不足」）；N=7 与 N=14 的边界；周日也是上班日的配置（`days: [0..6]`）；跨金边日界（UTC 17:00 之后属于金边的次日）。
- 保证**不改变**：边的计数口径、休息区闲聊不算、`to` 为空不成边、`/collab` 的输出里不含事件正文、大屏令牌设备 403。

## 修订 2：「一对一依赖」加最低次数门槛

【现象（我已实测）】`GET /collab?window=all` 的 `metrics.oneToOne` 把只有 1 次派单的 `Backend1 → Reviewer2` 标成「100% 依赖」，`OpsEngineer → OpsLead` 也是 1 次。数据这么少时这是噪声，不该标。

【要求】
- 「一对一依赖」的判定改为同时满足：① 该岗位窗口内**出边总次数 ≥ `minOutForOneToOne`**（默认 **5**）；② 出边次数里 **≥ 80%** 指向同一位同事。任一条件不满足就不标。
- 阈值放进 `collab.mjs` 导出的常量 `COLLAB_THRESHOLDS = { oneToOneShare: 0.8, minOutForOneToOne: 5 }`，界面和测试都从这里取，**不要写死两处**；界面上这一栏的说明改成「出边 ≥5 次且 ≥80% 指向同一对象」，并在 `GET /collab` 返回里附上 `thresholds`，让页面显示用了哪些阈值。
- 当前数据下（出边最多的岗位只有 2 次）这一栏应为空，写「无」。
- 边界测试：出边恰好 5 次且恰好 80%（命中）；出边 4 次且 100%（不命中）；出边 5 次且 79%（不命中）；出边 10 次分散在多人（不命中）；全是同一对象但只有 1 次（不命中，即现状的回归）。
- 「孤立岗位」「汇聚点」的口径不变。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --check collab.mjs`、`node --check server.mjs`；`collab-graph.js` 如有改动，用 `node --input-type=module --check < collab-graph.js`。
- **重启后实测（由人重启）**：`GET /collab?window=7`、`window=14`、`window=all` 三个请求，贴关键字段（`workdays`、`partialToday`、边数、`empty`、`metrics.oneToOne`、`thresholds`）。要求：`window=7` 和 `14` 都**不再为空**，边数与 `all` 一致（目前账本只有今天）；`oneToOne` 为空。
- 浏览器 `http://office.localhost:3200/` Ctrl+F5：打开「🕸 协作关系」，**默认窗口就能看到边**；窗口说明里有「含今天（截至 hh:mm）」；仍显示「数据不足，仅供参考」；「一对一依赖」一栏为「无」；控制台 0 错误；1280×720 截图一张。
- **用账本手工核对一次**：从 `events/*.jsonl` 里任选两条边，自己算一遍次数，和接口对上，写出算式。
- 汇报：每条要求做到没有；改了 `tests/collab.test.mjs` 里哪几条断言及原因；没验证的如实写。
