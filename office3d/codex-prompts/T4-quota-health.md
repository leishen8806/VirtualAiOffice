# T4-quota-health：额度与运行健康面板

先读 `_common.md`。

【背景】昨天 Claude 的会话额度（`provider_quota`，「You've hit your session limit · resets 7:10pm」）和登录失效（`claude_auth_required`）把 Lead、Reviewer1、SecurityReviewer 一起拦住，直到有人去翻日志才发现；Lead 变成出错状态还差点让周一晨会开不成。需要一个一眼能看出「谁因为额度 / 登录 / 环境问题跑不起来、什么时候恢复」的面板，并且在**晨会前**提前预警。

【任务】新增只读的「额度与健康」面板 + 只读 GET 接口 + 页面预警。

## 允许修改
- 新增：`health.mjs`（纯函数：把 Paperclip 的运行记录整理成健康报告，无副作用、不读文件、不发请求）、`tests/health.test.mjs`。
- 修改：`server.mjs`（**只新增** `GET /health` 一个入口；数据用现有的 `get()` 取 `GET /api/companies/{company}/heartbeat-runs?limit=…` 和 agents，缓存 30 秒；放在现有访问控制之后）、`index.html`、`ui.js`（弹窗 + 顶部小图标）、`README.md`。
- **不要**修改 `telegram.mjs`；预警只做页面上的提示，不发 Telegram。

## 要求
1. 数据口径（`health.mjs` 的 `buildHealth({ now, agents, runs })`）：
   - 对每个同事：最近 24 小时运行次数、成功 / 失败次数、最近一次失败的 `errorCode` 和时间、当前状态。
   - **失败分类**（按 `errorCode` 和错误文本）：额度（`provider_quota`，文本含 session limit / usage limit）、登录（`claude_auth_required`）、上游抖动（`claude_transient_upstream`，网络中断类）、环境（`setup_failed`，含 `git worktree add` / `.git/config` 锁竞争的要单独标「工作树抢锁」）、其他。
   - **预计恢复时间**：从额度错误文本里解析 `resets 7:10pm (Asia/Bangkok)` 这类时间，换算成金边时间的具体时刻；解析失败显示「未知」，不要猜。同一时间窗内多个同事撞同一个额度，合并成一条「Claude 额度」。
   - 按**模型家族**（claude / gpt / deepseek，用 `adapterConfig.model`，可参考 `app.js` 的 `modelFamily`）汇总失败率。
2. `GET /health` 返回 `{at, families, agents, incidents, nextStandup}`；`incidents` 是正在发生的问题（额度 / 登录 / 抢锁，最近 2 小时内还有失败、且之后没有成功运行的）。`nextStandup` 用 `../workhours/workhours.json` 的上班日和 8:35 算出下一次晨会的时刻（只读该文件，别改它）。
3. 页面：顶部状态栏加一个健康小图标（正常绿 / 有问题橙 / 严重红），点开弹窗：上方是 incidents 卡片（一句话说明影响了谁、预计什么时候恢复、建议怎么办），下方是按模型家族的失败率和每个同事一行的表格。
4. **预警**：当存在额度 / 登录类 incident，且下一次晨会在 12 小时内、预计恢复时间晚于晨会时刻（或未知）时，在弹窗和顶部图标上显示「⚠ 可能影响 8:35 晨会」。逻辑写进 `health.mjs` 并有测试。
5. 不新增高频请求：弹窗打开时才请求 `/health`，页面状态图标跟随现有 `/state` 轮询即可（可以由服务端把一个很小的 `healthLevel` 字段放进 `/state`——这是允许的唯一一处 `/state` 改动，字段只有 `level`: `ok|warn|bad` 和 `text`）。

## 验收
- `tests/health.test.mjs`：覆盖额度时间解析（`7:10pm`、`7:10 pm`、`12:05am`、跨午夜）、多人合并、已恢复的不算 incident、`.git/config` 抢锁分类、晨会预警的几种边界（恢复时间早于 / 晚于晨会、周日是上班日、非上班日跳到下一个上班日）。
- 用运行中的服务 `GET /health`，贴 `incidents` 和 `families`，并和 Paperclip 里最近的失败运行手工对一遍（写出核对了哪几条）。
- `node --check` 全部改过的文件。
