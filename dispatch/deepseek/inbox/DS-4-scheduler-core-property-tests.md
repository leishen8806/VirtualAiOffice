---
id: DS-4
base: office3d/rev-20261022
branch: ds/DS-4-scheduler-core-property-tests
scope:
  - office3d/tests/scheduler-core-properties.test.mjs
budget: 2h
---
# DS-4：为 `office3d/scheduler-core.mjs` 补「性质测试」（固定种子的伪随机输入 + 不变式；只加测试，不改被测代码）

`scheduler-core.mjs` 导出 `evaluateTask`、`pickNext`、`revalidate`、`decisionRecord` 与若干规则常量（`REASON_CODES`、`PRIORITY_ORDER` 等）。已有 `tests/scheduler-core.test.mjs`（16 个用例，偏「例子」），**先完整读它与被测源码**，不要重复；本卡补**不变式**：对大量**固定种子生成**的随机任务集，下列性质必须始终成立。

## 要做的事
1. 新建 `office3d/tests/scheduler-core-properties.test.mjs`（`node:test` + `node:assert/strict`；只用普通值断言）。
2. **随机输入必须确定：** 在测试文件里自带一个小的伪随机数生成器（如 mulberry32，固定种子，例如 1..40 共 40 个种子），**不得使用 `Math.random`、`Date.now`**；任务字段（状态、优先级、依赖、负责人、创建时间、金额类标记等）按被测源码实际读取的字段构造，先读源码确认字段名与上下文参数（`ctx`）形状。
3. 覆盖的性质（每条对全部种子成立；至少 25 个断言点）：
   - **选中项一定合格：** `pickNext` 选出的每个任务，单独调用 `evaluateTask` 都判定为可选（无拦截原因）。
   - **永不选金额类任务**，也不选依赖未完成 / 已取消、状态不对、无负责人的任务（在上面的随机集里混入这些任务）。
   - **数量上限：** 选中数 ≤ `limit`；同一负责人被选中的数量不超过该负责人的配额 / 并行上限（按源码实际规则断言）。
   - **顺序不变性：** 把同一任务集随机打乱后，`pickNext` 的选择与顺序完全相同（确定性排序：优先级、下游数、创建时间、标识符）。
   - **纯度：** 对入参深度冻结后调用不抛错；同一输入重复调用结果逐字段相等；结果里不含 `undefined` / `NaN`。
   - **`revalidate` 一致性：** 对刚选出的决策、在未变化的新鲜数据下重新校验应通过；把依赖改为未完成 / 把负责人设为不可用 / 把预算设为耗尽后应被拦下，且原因码属于 `REASON_CODES`。
   - **原因码合法：** 所有被拒绝任务的原因码都属于 `REASON_CODES`，没有未登记的码。
4. 只新增 `scope` 里的一个文件，**不改 `scheduler-core.mjs`、`standup.mjs` 或任何其它文件**；发现的被测代码问题（例如某个性质在特定输入下不成立）**只写进报告的「范围外发现」，不修**，并把可复现的种子和输入摘要写出来。

## 验收标准（在干净的仓库副本里运行）
```
cd office3d
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 tests/scheduler-core-properties.test.mjs tests/scheduler-core.test.mjs
```
- 全部通过（含原有 `scheduler-core.test.mjs`），单个文件运行时间 < 10 秒。
- 变异自检（在系统临时目录的 `.mjs` 副本上做，让测试通过环境变量 `SCHEDULER_CORE_MODULE` 指向副本——测试里要支持这个变量，默认读 `../scheduler-core.mjs`；注意副本里 `./standup.mjs` 的相对导入要一并处理，例如把它也复制进同一临时目录）：至少 6 种，例如：去掉金额类过滤、把排序里某个比较方向反过来、让 `limit` 失效、去掉每负责人配额、让依赖已取消不再拦截、让 `revalidate` 总是通过。每种都必须让对应性质测试变红；然后删副本，`git diff` 里被测文件无改动。报告里贴每种变异的变红摘要。

## 不做的事
不安装依赖、不联网、不下载素材；不碰 `app.js / ui.js / index.html / server.mjs`；不推 `main`、不 force；不在报告里写任何密钥、IP、本机路径或账号。

## 交付
- 分支 `ds/DS-4-scheduler-core-property-tests`，推送后把分支名告诉派发人（或开 PR，目标 `office3d/rev-20261022`）。
- 同一分支新增 `dispatch/deepseek/outbox/DS-4-report.md`：做到 / 没做到 / 未验证；改动文件与行数；测试命令与输出末尾；每种变异的结果；范围外发现（含复现种子）。
- 完成后停下，等待规划者验收。
