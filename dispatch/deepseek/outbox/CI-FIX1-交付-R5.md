# CI-FIX1 交付回执 · R5（harness → 派发人，待 Q-V1 复核）

- 派单号：CI-FIX1-R5-01
- 代码分支：`qa/vis3-test-infra`，从 `d9bb716` 继续，追加 1 个提交，未改写历史、未 force push
- 范围：仅 `scripts/vis3/assess.mjs`、`scripts/vis3/tests/framework.test.mjs`；未改产品代码、未动 fix/ci-portable-tests、未动 main

## 结论

`assessRun` 的 `expectedRunId` / `expectedSha` 已改为必填；framework 24/24 通过；selfcheck 基线 verdict=true。

## 逐条结果

| 项 | 要求 | 结果 |
|---|---|---|
| A1 | `expectedRunId` 缺省（null/undefined/空字符串）→ `ok:false`，原因「调用方未提供本次运行标识」 | 做到 |
| A2 | `expectedSha` 同样 → `ok:false` | 做到 |
| A3 | 补两条负向测试：不传 expectedRunId → 不通过；不传 expectedSha → 不通过 | 做到（另补空字符串也算缺省） |
| A4 | 搜遍 assessRun 调用点，确保都传两个参数；回执列清单 | 做到，清单见下 |
| A5 | framework 全部通过；selfcheck 基线 verdict=true（无 Playwright 则 NOT_RUN） | 做到 |

## assessRun 调用点清单（A4）

| 调用点 | 参数 | 说明 |
|---|---|---|
| `scripts/vis3/selfcheck.mjs:38` | `expectedRunId: RUN_ID, expectedSha: HEAD` | 唯一生产调用点，已传全 |
| `scripts/vis3/tests/framework.test.mjs` 正向/既有负向测试（10 处） | 均传 `expectedRunId` + `expectedSha` | 已传全 |
| `scripts/vis3/tests/framework.test.mjs` 新增 3 处负向测试 | 故意省略 `expectedRunId` / `expectedSha` / 空字符串 | 用于验证「缺省必判不通过」 |

## 实际命令与结果

```bash
# framework 单元测试（全部通过）
cd <qa/vis3-test-infra 工作树>
node --max-old-space-size=1024 --test --test-timeout=120000 --test-concurrency=1 scripts/vis3/tests/framework.test.mjs
# → # tests 24 / # pass 24 / # fail 0 / # skipped 0

# selfcheck 基线（verdict=true，本机有 Playwright）
VIS3_PLAYWRIGHT=<playwright 路径> node scripts/vis3/selfcheck.mjs
# → {"verdict": true, "baseline": {"exit": 0, "mandatoryTotal": 9, "ok": true, "reason": ""}, ...}
```

复现 R4 复审指出的同型风险，本轮已消除：

```
assessRun({ exit: 0, report: { sha: 'h', runId: 'whatever', mandatory: { total: 9 } }, expectedSha: 'h' })
# → { ok: false, reason: '调用方未提供本次运行标识' }
```

## 改动文件

| 文件 | 变更 |
|---|---|
| `scripts/vis3/assess.mjs` | `expectedRunId`/`expectedSha` 缺省直接判不通过（放在最前，先于 exit/report 判断） |
| `scripts/vis3/tests/framework.test.mjs` | 现有调用补参数；新增「不传 expectedRunId / expectedSha / 空字符串」负向测试 |

## 位置与 SHA

- 分支：`qa/vis3-test-infra` @ **`2c0afa3`**（回执另加提交，见推送后完整 SHA）
- 本回执：`dispatch/deepseek/outbox/CI-FIX1-交付-R5.md`

未合并、未部署，停下等 Q-V1 复核。
