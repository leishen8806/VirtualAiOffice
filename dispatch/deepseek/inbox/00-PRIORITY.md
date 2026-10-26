# harness 当前执行顺序（董事会 2026-10-26 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。

**批次规则（董事会 2026-10-26）：** DeepSeek 白天成本过高，harness 只在 17:30（金边）之后开工，白天不开工。

| 顺序 | 卡片 | 分支 | 状态 |
|---|---|---|---|
| **1** | **`CI-FIX1-R5-expectedRunId-required.md`**（assessRun 的 expectedRunId / expectedSha 改为必填；复审见 `Q-V1-review-CI-FIX1-R4.md`） | `qa/vis3-test-infra`，从 `d9bb716` 继续 | **夜间批次，立即开始** |

说明：

- CI-FIX1 R4 的 A8 已复审通过；A7 只差本卡这一处。
- `fix/ci-portable-tests` 已合并进 main（PR #48），不要再往这个分支推送。
- 不许删测试、放宽断言或改产品代码；必须改产品代码时先停下报告。
- 交付回执写到 `dispatch/deepseek/outbox/CI-FIX1-交付-R5.md`（模板 `dispatch/_TEMPLATES/2-交付回执.md`），推送后停下，等 Q-V1 复核，不合并。
- `DS-1`～`DS-8` 由其他派发人跟进，不在本文件范围内。
- 所有测试与浏览器运行带资源上限；空闲内存不足时记为 NOT_RUN 并说明，不要硬跑。
