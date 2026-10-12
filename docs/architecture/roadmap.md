# 架构路线图（Roadmap）

- 状态：随阶段推进更新；本文件**不改写 ADR-001**，只汇总阶段顺序与依赖。状态核对基线为 main@216bb70。
- 产品：Virtual AI Office / 智序工场（命名规则见 `product-identity.md`）
- 依据：ADR-001 的迁移策略；各阶段细节以对应文档为准

## 阶段总览

| 阶段 | 主题 | 状态 | 说明 |
| --- | --- | --- | --- |
| Stage 0 | 基础：ADR、TypeScript 基础、领域实体、状态机、事件信封、执行器契约、最小 SQLite schema | 已完成并合并 | `domain-model.md`、`state-machines.md`、`event-contract.md`、`executor-contract.md`、`persistence.md` |
| Stage 1A | 把旧 NiuMa 的执行器抽到 `packages/executors`，旧版改用同一份实现 | 已完成并合并（PR #3） | `docs/stage-1/executor-extraction-plan.md` |
| Stage 1B | Tools / MCP 基础设施抽取（共享 `@vao/tools` 运行时） | 1B-A（抽取）已合并（PR #5）；1B-B（fail-closed 工具授权策略）未实施，范围见 `docs/stage-1/tools-mcp-extraction.md` | `docs/stage-1/tools-mcp-extraction-plan.md`、`docs/stage-1/tools-mcp-extraction.md` |
| 待排期 | 办公室渲染器抽成独立包（ADR-001 迁移策略第 2 步的剩余部分） | 未排期，阶段编号待定 | 办公室渲染（Visual V2）目前作为旧版前端壳的一部分已合并（PR #11），尚未抽成独立包 |
| Stage 1C | 把 Legacy 视觉皮肤作为**可选主题**提供给新壳 | 未开始 | 皮肤是 Legacy 可复用视觉资产，不定义新品牌；见 `product-identity.md` §6.1 |
| **Stage 2A** | **持久化核心**：SQLite 运行时、Workspace / Project 运行时、Member、Role、RoleBinding、Approval、Event 持久化；领域命令层与授权服务；**范围化审批权限**（`approve.requirement` / `approve.delivery` / `approve.task_acceptance` / `approve.merge` / `approve.deployment` / `approve.financial`）；`HumanActionRequest`（生命周期 OPEN / DELIVERED / RESPONDED / EXPIRED / CANCELLED）、`MemberChannel` 存储 | 未开始 | 见 `human-channels.md` §22 |
| **Stage 2B** | **Human Channel Gateway**：首个实现为 Telegram Bot；通道中立的概念为 `MemberChannel`。Telegram 的审批类动作要等 Stage 2A 的范围化审批权限落地后才启用 | 未开始（依赖 Stage 2A） | `human-channels.md` |
| 后续 | 首个纵切（项目 → 需求 → 人工批准 → 任务 → 执行器 → 真实事件 → 测试证据 → 审查 → 返工 → 完成）及其后的上传与解析（Artifact）、Worktree 执行、新桌面壳等 | 未排期 | 阶段编号与顺序在各自的计划文档中确定；本文件不预先编号 |

## 已合并的并行工作线

下列工作独立于上述阶段编号线并行推进，按合并 PR 列出：

- 跨平台 CI（PR #2）
- 品牌迁移 V1（PR #6、#7）
- 视觉身份 V2 文档（PR #8）
- 交互办公室 V2 实现（PR #11）
- 待合并：审计修复（PR #12，分支 fix/post-merge-audit-v2）——未合并

## Stage 2B — Human Channel Gateway

- **首个实现**：Telegram Bot（私聊；绑定、`/whoami`、任务与审批通知、答复、主动查询、审计）。
- **通道中立概念**：`MemberChannel`（以及 `HumanActionRequest`、`ChannelDelivery`）；不含 Telegram 专有字段，为将来的其它渠道留出空间，但 V1 不规范其它渠道。
- **依赖**：Stage 2A 的持久化已可运行——绑定码、MemberChannel、HumanActionRequest、通知发件箱与审计都需要事务；授权链需要持久的 RoleBinding 与**范围化审批权限**；答复必须经过真实的状态机与事件日志。
- **第一项工作**：在事件类型目录中追加命名空间 `human_action_request`、`notification`（向后兼容；**事件信封不变**，不升级信封版本；渠道来源写在事件载荷里）。
- **不在此阶段**：Stage 1A / 1B / 1C 的任何工作；对 Stage 0 状态机的改动。（“退回返工”使用现有的 `HUMAN_RESUMED → READY`；“无法承接指派”不改变任务状态；因此两者都不需要新增任务状态。）
- 规范：`docs/architecture/human-channels.md`。

## 依赖关系

```text
Stage 0 ──► Stage 1A ──► Stage 1B ──► Stage 1C
   │
   └────────────────────► Stage 2A ──► Stage 2B
```

Stage 2A 依赖 Stage 0 的契约与 schema，不依赖 Stage 1B（Tools / MCP 抽取）、Stage 1C（主题抽取）以及办公室渲染器抽取；Stage 2B 依赖 Stage 2A（持久化与范围化审批权限）。Stage 1 保持“稳定地抽取旧 NiuMa 资产”的范围，**不放入 Telegram 实现**。

## 品牌与命名迁移

产品名称与旧标识符的迁移独立于上述技术阶段，规则见 `product-identity.md`：新内容一律使用 “Virtual AI Office / 智序工场”；旧标识符按 CHANGE_NOW / KEEP_TEMPORARILY / RETIRE_LATER 管理，在新核心达到功能对等后退役。
