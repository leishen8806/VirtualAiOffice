# CI-FIX1 · 修订 R4：A7 / A8 返修（夜间批次）

```text
卡号：CI-FIX1          修订：R4（R3 复审：主体通过，A7/A8 返修）
派单号：CI-FIX1-R4-01
需求文件：dispatch/deepseek/inbox/ 下 CI-FIX1 全部文件 + 本文件 + Q-V1-review-CI-FIX1-R3.md
代码基线：qa/vis3-test-infra @ c13b10d3550c574ae9b386385503e6b8d9996f35（在同一分支继续）
执行方：harness
批次：夜间批次。17:30（金边）之后开工，白天不要开工（董事会 2026-10-26：DeepSeek 白天成本过高）
范围：
  允许改：scripts/vis3/assess.mjs、fixture.mjs、selfcheck.mjs、run.mjs（只限写入运行标识）、scripts/vis3/tests/framework.test.mjs
  禁止改：fix/ci-portable-tests（R3 已通过，不要再推）；产品代码；main
验收：
  A7-1 运行标识：
    - selfcheck 每次运行生成一个随机标识，传给 run.mjs，run.mjs 写进 report.runId；
    - assessRun 必须核对 report.runId 与本次标识一致；报告里没有 runId 也算不通过；
    - sha 核对保留。
  A7-2 负向测试补两条：
    - 报告没有 runId / sha 字段，判为不通过；
    - 同一提交上残留的上一次报告（sha 相同、runId 不同），判为不通过。
  A8-1 登记：
    - bootIsolated 在 mkdtemp 后，把返回的绝对路径登记到本进程内的登记表；
    - removeRegisteredDir 只删登记表里完全相同的路径（解析成绝对路径后比较），删后从表中移除；
    - 不在表里的一律拒绝，不看名字里有没有 vis3-iso-。
  A8-2 负向测试改成真测：
    - 新建一个名字也带 vis3-iso- 但没有登记的目录，直接对它调用 removeRegisteredDir，断言拒绝且目录仍在；
    - 已登记的目录删除后再删一次，也要拒绝。
  A9 自检 selfcheck 基线照常 verdict=true；framework 测试全部通过。回执写实际命令和结果。
交付：推送 qa/vis3-test-infra + 回执 dispatch/deepseek/outbox/CI-FIX1-交付-R4.md（模板 2），停下等 Q-V1 复核；不合并
状态：ACTIVE
```

复审细节和复现脚本见 `Q-V1-review-CI-FIX1-R3.md`。

两处问题的本质一样：现在的写法都是"凭特征猜"，要改成"凭本次运行时记下的身份核对"。

1. **A7：** 只在报告带了 sha 字段时才核对；同一提交上留下的旧报告也能过。
2. **A8：** 只看路径里有没有 `vis3-iso-`。负向测试没有对"别的目录"调用删除，所以测不出问题。
