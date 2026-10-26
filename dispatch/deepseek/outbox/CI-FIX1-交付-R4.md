# CI-FIX1 交付回执 · R4（harness → 派发人，待 Q-V1 复核）

- 派单号：CI-FIX1-R4-01
- 代码分支：`qa/vis3-test-infra`，从 `c13b10d` 继续，追加 1 个提交，未改写历史、未 force push
- 范围：仅 `scripts/vis3/` 下的 assess.mjs、fixture.mjs、selfcheck.mjs、run.mjs（只写运行标识）、tests/framework.test.mjs；未改产品代码、未动 fix/ci-portable-tests、未动 main

## 结论

A7/A8 返修完成，selfcheck 基线 verdict=true，framework 测试全部通过。

## 逐条结果

| 项 | 要求 | 结果 |
|---|---|---|
| A7-1 运行标识 | selfcheck 每次生成随机标识传 run.mjs，run.mjs 写 report.runId；assessRun 核对 runId 与本次一致；缺 runId 判不通过；sha 保留 | 做到：`selfcheck.mjs` 每次 `crypto.randomUUID()` 生成 `RUN_ID`，经 `VIS3_RUN_ID` 传给 run.mjs；`run.mjs` 写 `report.runId`；`assess.mjs` 的 `assessRun` 必核 runId（缺 runId、runId 不一致都判残留旧报告），sha 核对保留且缺 sha 也判不通过 |
| A7-2 负向测试两条 | ①报告没有 runId/sha → 不通过；②同一提交 sha 相同 runId 不同 → 不通过 | 做到：framework.test.mjs 新增「A7 报告没有 runId / sha 字段」「A7 残留旧报告：同一提交上 sha 相同、runId 不同」，均断言 ok=false |
| A8-1 登记表 | bootIsolated mkdtemp 后登记绝对路径；removeRegisteredDir 只删表里完全相同路径（解析成绝对路径后比较），删后移出表；不在表里一律拒绝，不看名字 | 做到：`fixture.mjs` 新增进程内登记表 `REGISTERED_DIRS` + `registerDir`；`bootIsolated` 用 `registerDir(mkdtempSync(...))`；`removeRegisteredDir` 用 `path.resolve` 解析后查表，命中才删并 `delete`，否则 `refused-unregistered-dir`，去掉了 `vis3-iso-` 名字判断 |
| A8-2 负向测试改真测 | ①名字带 vis3-iso- 但未登记的目录 → 直接调用删除，断言拒绝且目录还在；②已登记的目录删后再删 → 拒绝 | 做到：framework.test.mjs 重写 A8 测试——「名字带 vis3-iso- 但未登记的目录：拒绝且目录仍在」「已删过的目录再删一次：拒绝」 |
| A9 | selfcheck 基线 verdict=true；framework 全部通过 | 做到：见下「实际命令与结果」 |

## 实际命令与结果

```bash
# framework 单元测试（全部通过）
cd <qa/vis3-test-infra 工作树>
node --max-old-space-size=1024 --test --test-timeout=120000 --test-concurrency=1 scripts/vis3/tests/framework.test.mjs
# → # tests 23 / # pass 23 / # fail 0 / # skipped 0

# selfcheck 基线（verdict=true）
VIS3_PLAYWRIGHT=<playwright 路径> node scripts/vis3/selfcheck.mjs
# → {"verdict": true, "baseline": {"exit": 0, "mandatoryTotal": 9, "ok": true, "reason": ""}, ...}
```

复现脚本（`Q-V1-CI-FIX1-R3-a7a8-probe.mjs`）在本轮交付上跑：

```
A7 旧报告没有 runId/sha 字段: { ok: false, reason: '报告缺少 runId（不是本次运行生成）' }
A7 同一提交 sha 相同 runId 不同: { ok: false, reason: '报告 runId 与本次运行不一致（残留旧报告）' }
A8 删除"别的运行"的同前缀目录: { ok: false, reason: 'refused-unregistered-dir', path: '.../vis3-iso-other-run-XXX' } 目录还在? true
```

## 改动文件

| 文件 | 变更 |
|---|---|
| `scripts/vis3/assess.mjs` | `assessRun` 必核 runId（缺/不一致判残留旧报告）、sha（缺/不一致判残留旧报告）；`expectedRunId` 入参 |
| `scripts/vis3/fixture.mjs` | 进程内登记表 `REGISTERED_DIRS` + `registerDir`；`removeRegisteredDir` 只删表内绝对路径，删后移出表，不看名字 |
| `scripts/vis3/selfcheck.mjs` | 每次生成随机 `RUN_ID`，经 `VIS3_RUN_ID` 传子进程；`assessRun` 传 `expectedRunId` |
| `scripts/vis3/run.mjs` | `report.runId = process.env.VIS3_RUN_ID || null`（仅运行标识） |
| `scripts/vis3/tests/framework.test.mjs` | A7/A8 负向测试改真测，共 23 项 |

## 位置与 SHA

- 分支：`qa/vis3-test-infra` @ **`01b991f2a77e5221290ddcb4d54c65d665fea216`**
- 本回执：`dispatch/deepseek/outbox/CI-FIX1-交付-R4.md`

未合并、未部署，停下等 Q-V1 复核。
