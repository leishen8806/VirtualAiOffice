# VIS3-TEST-FIX6 交付回执（harness → 派发人，待独立复审）

- 工作分支：`qa/vis3-test-infra`（在 `95dab74` 上追加 1 个提交，未改写历史、未 force push）
- 运行平台：macOS arm64，Node v22.22.1（非 Windows，审查员会在 Windows 复跑）

## 改动文件

| 文件 | 变更 |
|---|---|
| `scripts/vis3/tree-check.mjs` | 新增：`compareRepoClean(repo, before)` |
| `scripts/vis3/run.mjs` | 改用 `compareRepoClean`（行为不变） |
| `scripts/vis3/block-network.mjs` | `__vis3_allowPort` 仅在 `VIS3_TEST_HOOKS === '1'` 时定义 |
| `scripts/vis3/fixture.mjs` | 抽出 `buildServerEnv(...)` 并导出；显式 `delete env.VIS3_TEST_HOOKS` |
| `scripts/vis3/tests/framework.test.mjs` | F2-05 子进程设 `VIS3_TEST_HOOKS=1`；新增 compareRepoClean、__vis3_allowPort 门控、buildServerEnv 三组自测 |

## 逐项处置

| 项 | 状态 |
|---|---|
| 1 第三种工作树自测 | **做到**：抽出 `compareRepoClean`；自测覆盖「运行前后干净 → unchanged true」与「office3d 外写文件 → unchanged false 且 repoCleanAfter 列出该文件」 |
| 2 `__vis3_allowPort` 只在自测可用 | **做到**：仅 `VIS3_TEST_HOOKS=1` 时定义；F2-05 子进程设置该变量；`buildServerEnv` 显式删除 `VIS3_TEST_HOOKS`；自测覆盖「未设置时 undefined / 设置后 function / 被测服务环境不含该变量」 |

## 自测真实输出

`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 scripts/vis3/tests/framework.test.mjs`：
```
# tests 12 / pass 12 / fail 0 / cancelled 0
```

## 未验证

- 真实 Windows 运行（本机 macOS）。
- 端到端（selfcheck / office 场景）本轮未重跑；本次改动为纯逻辑抽取与门控，未改端到端行为。

## 位置

本回执在工作分支 `qa/vis3-test-infra` 的 `dispatch/deepseek/outbox/VIS3-TEST-FIX6-report.md`。
