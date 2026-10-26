# CI-FIX1 · 修订 R5：assessRun 的运行标识改为必填（夜间批次）

```text
卡号：CI-FIX1          修订：R5（R4 复审：A8 通过，A7 留一处同型风险）
派单号：CI-FIX1-R5-01
需求文件：dispatch/deepseek/inbox/ 下 CI-FIX1 全部文件 + 本文件 + Q-V1-review-CI-FIX1-R4.md
代码基线：qa/vis3-test-infra @ d9bb7165b44ec16448c602340f1b3432cecc585f（在同一分支继续）
执行方：harness
批次：夜间批次（17:30 金边之后开工）
范围：只改 scripts/vis3/assess.mjs 和 scripts/vis3/tests/framework.test.mjs；如有其他调用 assessRun 的地方，同步传入运行标识
状态：ACTIVE
```

## 问题

R4 的 `assessRun({ exit, report, expectedRunId, expectedSha })` 里，`expectedRunId` 和 `expectedSha` 都是可选的：

- 调用方不传 `expectedRunId` 时，报告只要带了任意 runId，就会被判通过。
- 复现：`assessRun({ exit: 0, report: { sha: 'h', runId: 'whatever', mandatory: { total: 9 } }, expectedSha: 'h' })` 返回 `ok: true`。

现在唯一的调用方 selfcheck 传了这个参数，所以眼下结果正确。但这和 R3 的问题是同一类："给了才查，不给就放过"。

## 验收

- **A1：** `expectedRunId` 缺省（null / undefined / 空字符串）时，`assessRun` 直接返回 `ok: false`，原因写"调用方未提供本次运行标识"。
- **A2：** `expectedSha` 同样处理：缺省时返回 `ok: false`。
- **A3：** 补负向测试两条：
  - 调用方不传 `expectedRunId` → 不通过；
  - 调用方不传 `expectedSha` → 不通过。
- **A4：** 搜一遍仓库里所有调用 `assessRun` 的地方，确保都传了这两个参数；回执列出调用点清单。
- **A5：** `scripts/vis3/tests/framework.test.mjs` 全部通过；selfcheck 基线 verdict 仍为 true。如果本机没有 Playwright，selfcheck 写 NOT_RUN 并说明原因，不得写"通过"。

## 交付

推送 qa/vis3-test-infra，回执写到 `dispatch/deepseek/outbox/CI-FIX1-交付-R5.md`（模板 2，写实际命令和结果）。推送后停下等 Q-V1 复核，不合并。
