# T-today-work-panel：办公室 3D 左上角「今日工作情况」卡片

【任务】在办公室 3D 看板左上角品牌块（logo +「智序工场 · 办公室」）的正下方，加一块「今日工作情况」卡片：今天的日期、今天完成多少、全部任务是多少、进度，以及各项目的完成情况。数据全部来自 Paperclip 的真实记录，不编造。

## 1. 项目与目录
- 代码目录：`E:\VirtualAIOffice\paperclip-ops\office3d\`（Node 原生 ES 模块 + 浏览器原生 ES 模块 + Three.js；**没有 Git、没有构建步骤、没有 npm 依赖**）。
- 服务：`node server.mjs`（端口 3200，已经在运行，**不要自己再启动第二个实例**——它会重复启动 Telegram 轮询和委员会定时开票，造成重复消息和重复批次）。页面每 3 秒请求一次 `/state`，`/daily` 是今日战报接口。
- 先读：`README.md`、`index.html`（`#top`、`.brand`、`.chip`、`.glass`、`.ptag` 的样式）、`ui.js`（`createUI`、`render(s)`、`projTag`、`projHue`、`openDaily`）、`stats.mjs`、`server.mjs` 里的 `state()`。
- 开工前：把你要改的文件各复制一份到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-today-panel\`（没有 Git，这是唯一的回退办法）。

## 2. 允许修改
- 新增：`today.mjs`（纯函数，见 §3）、`tests/today.test.mjs`（用 `node:test`，不新增依赖）。
- 修改：`stats.mjs`（只加 projectId）、`server.mjs`（只在 `state()` 返回值里加 `today`）、`index.html`（卡片的样式和容器）、`ui.js`（渲染）、`README.md`（加一节说明）。
- **禁止**：改其他文件；新增依赖；联网；发任何 Telegram 消息；读取、打印、修改 `telegram*.json`、`telegram-*.dpapi`、任何密钥；向 Paperclip 发 POST / PATCH / PUT / DELETE（只允许对 `http://127.0.0.1:3200` 的 GET 来看真实数据形状）；改 `committee.mjs`、`telegram.mjs`、`app.js`、`env.js` 等无关文件；启动或停止任何服务。

## 3. 数据与口径（必须按这个算，口径写进 README 和卡片的悬停提示）
时间一律用**金边时间**（Asia/Phnom_Penh，UTC+7）。新建 `today.mjs`：`export function computeToday({ now, doneLedger, assigned, waiting, runsToday, projects, duty })` 返回：
- `date`（`2026-10-17`）、`weekday`（周六）、`onDuty`（来自 `world.duty.on`）、`dayOff`（周日 true）。
- `done`：今天完成的任务数 = 账本里 `at` 落在今天（金边）的已完成任务（`stats.mjs` 的 `L.done`）。
- `open`：当前未结束且已派发的任务 = `/state.assigned`（状态 todo / in_progress / in_review / blocked），并分别给出 `inProgress`、`inReview`、`blocked`、`todo`。
- `total` = `done` + `open`（**今日全部任务**）；`percent` = `done / total`，total 为 0 时 percent 为 0、不能出现 NaN。
- `backlog`：待排期（还没派发的）数量，**单独显示，不计入 total**。如果 `/state` 里没有，就在 server 里用已有的 issues 接口取（`status=backlog` 的数量即可，缓存 60 秒，别每 3 秒请求一次）。
- `runs`：今日运行次数、成功数、失败数；`comments`；`decisions`（批准 / 拒绝）——直接用 `stats.daily()` 已有的字段。
- `byProject`：按项目分组的 `{projectId, name, done, total}`。**`stats.mjs` 现在的 `L.done` 没存 projectId**：在 `refreshDone()` 里补存（旧账本条目没有 projectId 的归入「未归类」，不要报错、不要丢）。
- 在 `server.mjs` 的 `state()` 返回值里加 `today: computeToday(...)`；`today.mjs` 不得有副作用、不读文件、不发请求。

## 4. 页面（`index.html` + `ui.js`）
- 位置：品牌块（`.brand`）正下方，左对齐（`left:14px`，大约 `top:70px`），宽度 300–340px；**不能盖住**右上角的状态芯片行（`#top` 里的 chip）、右侧「等你处理」面板（`#quest`）、人物详情卡（`#detail`）；`body.clean`（隐藏面板模式）时跟着隐藏。窗口宽度 ≤ 900px 时默认折叠成一行。
- 内容（从上到下）：
  1. 标题行：「今日工作情况」+ 日期（`10月17日 周六`）+ 状态小标签（上班中 / 已下班 / 今日休息）。
  2. 大字进度：`完成 34 / 全部 50`，右侧百分比，下面一条进度条（`--gold` 色，沿用现有 CSS 变量）。
  3. 一行小字拆分：进行中 · 待验收 · 阻塞 · 待开始；另起一行灰字：待排期（未派发）N 个。
  4. 一行：运行 131 次（成功 92 · 失败 26）· 评论 166 · 审批 批准 8 / 拒绝 0。
  5. 各项目：每个项目一行——项目标签（复用 `projTag` 的颜色）+ `完成/全部` + 细进度条；项目多时最多显示 6 个，其余折叠成「另有 N 个项目」。
  6. 底部灰字：「数据来自 Paperclip 实时记录；账本统计自 MM-DD」。
- 点击标题行可折叠 / 展开，状态存 `localStorage`（读写都包在 try/catch 里，读不到就按默认展开）。悬停任意数字显示口径说明（§3）。
- 所有文字用 `esc()` 转义；数据缺失时显示「–」，不能出现 `undefined`、`NaN`、`Infinity`。
- 不新增依赖、不引入框架；不改 `ui.js` 里其他卡片的行为。深色 / 浅色都要看得清（沿用现有变量和 `.glass`）。

## 5. 验收（缺一不通过）
- `node --test tests/today.test.mjs` 全部通过，至少覆盖：total 为 0；只有完成没有进行中；跨午夜（金边 23:59 与次日 00:01 的任务归属）；周日 `dayOff`；账本旧条目没有 projectId；项目超过 6 个；`backlog` 不计入 total。
- `node --check` 通过：`server.mjs`、`stats.mjs`、`today.mjs`、`ui.js`。
- 对运行中的服务做**只读**核对：`GET http://127.0.0.1:3200/state`（重启前没有 `today` 字段是正常的，重启后才有）；用 `today.mjs` 对当前 `/state` 与 `/daily` 的真实数据算一遍，打印结果，并说明与 `/daily` 的数字一致（`done`、`runs`）。
- 不写假数据、不做假通过；做不到的验证如实写「未验证」。

## 6. 汇报格式
1. 改动文件清单（新增 / 修改，各多少行）和备份目录位置。
2. 口径（§3）有没有任何一处你没照做、为什么。
3. 测试的完整命令和真实输出末尾。
4. 用真实数据算出的 `today` 结果（完整 JSON）。
5. 需要人工做的事：重启服务（`node server.mjs`，在现有终端里 Ctrl+C 后重新运行）、浏览器 Ctrl+F5，并列出 3 个肉眼检查点。
6. 你发现但没处理的范围外问题。
