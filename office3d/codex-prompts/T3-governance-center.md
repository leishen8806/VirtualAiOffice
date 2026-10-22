# T3-governance-center：治理中心（晨会 / 内容审批 / 超时验收的历史与统计）

先读 `_common.md`。

【背景】现在有三套「委员会投票」机制：晨会（`standup.mjs`）、内容审批（`committee.mjs`）、超时验收（`acceptance.mjs`）。它们的状态分别存在 `standup.json`、`committee.json`、`acceptance.json`，页面只在「委员会」弹窗里看得到最近一批，看不到历史，也看不出委员们的投票倾向（谁总是升级、谁总是缺票）。想要一个统一的「治理中心」。

【任务】新增只读的「治理中心」弹窗 + 一个只读的 GET 接口。

## 允许修改
- 新增：`governance.mjs`（纯函数：把三个 JSON 的内容整理成历史列表和统计，不读文件、不发请求、无副作用）、`tests/governance.test.mjs`。
- 修改：`server.mjs`（**只新增** `GET /governance` 一个入口和读取三个 json 的几行代码，放在现有访问控制之后；不要碰其他逻辑）、`index.html`、`ui.js`（新弹窗 + 工具栏按钮「🏛 治理中心」）、`README.md`。
- 三个 `.json` 和三个 `.mjs` 只读，**不得修改**。

## 要求
1. `GET /governance?days=30`（默认 30，最大 90）返回：
   - `timeline`：按时间倒序的事件，每条 `{kind: 'standup'|'content'|'acceptance', id, at, title, outcome, tally, items}`；`items` 里每项有结果（晨会：DISPATCHED / BOARD / NOT_TODAY / SKIPPED / REJECTED；内容：PASS / CHANGES / ESCALATE / CONFIRM；验收：ACCEPTED / CHANGES / BOARD / SKIP）和每位委员的票。
   - `members`：每位委员的统计 `{name, votes, approve, changes, escalate, missing, escalateRate, missingRate}`。
   - `summary`：近 N 天各类批次数、作废数（state 为 void）、一票都没有的批次数、平均「开会到统计」耗时。
   字段缺失（旧批次没有 `dueAt`、`tallyAt` 等）一律容错，不得抛异常。
2. 「治理中心」弹窗：顶部 3 个汇总数字卡；中间一张表「委员 × 票型」（通过 / 要修改 / 升级 / 缺票，带迷你条形图，缺票率 >20% 标黄、>40% 标红，悬停说明：缺票多半是没额度或没按格式投）；下面是时间线，可按类别、结果筛选，点开一条看每项每位委员的票和理由（理由来自 json 里已有的 `why`，没有就不显示）。
3. 与现有「委员会」弹窗的关系：保留它不动；在它里面加一个「查看历史 →」链接打开治理中心。
4. 窄屏可用；大数据量（几百条）不卡：时间线分页（每页 20），不要一次渲染全部。
5. 所有文字 `esc()` 转义（标题和理由来自 agent 的评论，当作不可信输入）。

## 验收
- `tests/governance.test.mjs` 覆盖：空数据、旧格式批次缺字段、缺票率计算、void 批次计入、天数过滤、超长标题 / HTML 注入字符。
- `node --check` 全部改过的文件；对运行中的服务 `GET /governance?days=30`，贴 `summary` 和 `members` 的完整 JSON，并说明和 `standup.json` / `committee.json` / `acceptance.json` 里的真实条数能对上（写出你是怎么数的）。
- 局域网设备打开同样能用（只读）。如何验证写在汇报里；验证不了就写「未验证」。
