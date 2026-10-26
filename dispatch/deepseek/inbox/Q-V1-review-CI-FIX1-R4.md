# Q-V1 复审报告 · CI-FIX1 R4（qa/vis3-test-infra @ d9bb716）

- 提交：01b991f（A7/A8）+ d9bb716（回执），基线 c13b10d；只改 scripts/vis3/ 五个文件 + 回执
- 结论：**A8 通过；A7 基本通过，有一处残留风险**

| 项 | 结论 | 说明 |
|---|---|---|
| A7 运行标识 | 基本通过 | selfcheck 生成 randomUUID → VIS3_RUN_ID → report.runId；assessRun 缺 runId / 缺 sha 判不通过，runId 不同判不通过。复现：无 sha 无 runId → false；同 sha 不同 runId → false；正常 → true |
| A7 残留 | **风险** | `expectedRunId` 是可选参数：调用方不传时不核对 runId，带任意 runId 的旧报告会判通过（复现 → true）。现唯一调用方 selfcheck 有传，当前行为正确；但与 R3 的问题同型（"给了才查"） |
| A8 登记表 | 通过 | 未登记的同前缀目录被拒绝且保留；登记目录删除成功，再删拒绝 |
| A9 测试 | 通过 | Q-V1 本机运行 framework.test.mjs：23 / 23 通过（fw-r4.tap）；selfcheck 端到端需 Playwright，未在本机运行（NOT_RUN，按回执） |

建议：把 expectedRunId 改为必填（缺省即判不通过）并补一条测试；一行改动，可随下一张 harness 卡顺带做，或单独夜间小卡。
