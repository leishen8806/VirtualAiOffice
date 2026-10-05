# ADR-001：Virtual AI Office 采用方案 C —— 换芯保壳（Replace Core, Preserve Shell）

- 状态：**已接受（Accepted）**，冻结；除非实施中发现关键矛盾，否则不再变更
- 日期：2026-10-05
- 决策范围：Virtual AI Office 的长期编排运行时、持久化、事件与执行器边界
- 依据：《NiuMa → Virtual AI Office 技术评估报告》（基于 commit `f770df4` 的只读评估）

## Context（背景）

NiuMa（牛马工作室）当前的架构事实：

| 方面 | 现状 | 证据 |
| --- | --- | --- |
| 进程模型 | 单个 Node.js 进程，启动时绑定一个 `workdir` | `src/studio.js` 的 `startStudio({ workdir })` |
| 切换项目 | 桌面端先 `studio.close()` 再 `startStudio()`，丢弃全部内存状态 | `desktop/main.cjs` 的 `openFolder()` |
| 编排核心 | 内存中的 `Coordinator`（约 1,040 行），一个类承担规划、会议、调度、重试、审查返工、验收、Git、招人、汇报、事件 | `src/coordinator.js` |
| 工作流表示 | 工作流状态只存在于 `handle()` 的 `async` 调用栈中，无法暂停等待人工、无法重启续跑 | `Coordinator.handle()` |
| 界面 | 原生 JS；办公室由 SSE 事件驱动，两套渲染器共享一套接口 | `src/server.js` 的 `/events`；`public/app.js` 的 `handle(ev)`；`public/office.js`、`public/anime.js` |
| 执行器 | `BaseWorker` 及 `ClaudeCliWorker` / `CodexCliWorker` / `OpenAIWorker`，统一 `run()` / `ask()` | `src/workers/*` |
| 持久化 | 无数据库；任务、消息、会议、历史只在内存；战绩写 `~/.niuma/stats.json`（跨项目） | `Coordinator` 字段；`config.js` 的 `statsFile` |
| Git | 每轮前后在用户工作区 `commit --no-verify`；无分支、无 worktree；并行 Agent 共用一个工作树 | `src/git.js`；`gitStart()` / `gitFinish()` |
| 完成判定 | 完全由 LLM 验收给出；解析失败时默认放行（本 ADR 同期在 Stage 0 修复） | `extractVerdict()`、`verify()` |

评估结论是：NiuMa 质量最好的部分是**办公室表现层**和**执行器层**，二者已经通过事件和适配器接口与编排逻辑解耦；最需要重做的恰恰是“引擎”——`Coordinator` 的每个缺陷（不持久、单项目、无等待状态、失败即放行）都源于“用调用栈表示工作流”这一个设计决定。

## Decision（决策）

```text
Virtual AI Office will not retain Coordinator
as the long-term orchestration runtime.

The system will preserve:
- executor layer
- office visualization layer
- reusable algorithms

The system will introduce:
- persistent domain model
- state machines
- SQLite
- event log
- orchestration services
- Workspace / Project model
```

具体划分：

| 处理 | 范围 |
| --- | --- |
| **Keep**（原样保留） | 办公室渲染器（`office.js`、`anime.js`、`chibi.js`）、执行器输出解析器（`createClaudeParser`、`createCodexParser`、`describeClaudeTool`）、执行器集成、MCP 工具柜、彩排替身（`fake/*`）、皮肤系统、可复用的任务图算法（`normalizeTasks`、`unsortable`、`skipBlocked`） |
| **Refactor**（保留核心、改接口或归属） | workers（`workdir` 改为每次执行的参数、结构化 activity）、Git（去掉 `--no-verify` 与自动提交用户改动，扩展 worktree）、prompts（人设与指令分离；规划改为产出待确认问题）、skills → Role、事件（信封、序号、持久化）、返工逻辑 → Repair Policy、模型路由 → Execution Policy |
| **Replace**（只保留概念或重写） | `Coordinator` 运行时、一进程一目录架构、内存状态、当前工作流表示、`server.js` 路由外壳、`app.js` 工作台外壳、仅靠 LLM 的验收 |

技术约束（同样冻结）：

- 新架构包使用 **TypeScript（strict）**；旧代码保持 JavaScript，不做整体转换。
- 持久化使用 **SQLite**（每个 Workspace 一个文件），通过仓储接口访问；不引入 PostgreSQL、Redis、消息队列。
- 事件推送保持 **SSE**；所有状态变更与一条事件在**同一事务**中写入。
- 领域层（`packages/domain`）**不依赖** UI、模型厂商、CLI 工具或数据库实现。
- **Role ≠ Model**：角色经由 Execution Policy 选择执行器，角色定义中不出现任何厂商名。
- **Evidence-based Done**：任务完成由证据判定；未知、格式错误、失败或无法解析的验收结果一律不得自动视为完成（fail closed）。

## Consequences（后果）

正面：

- **重启恢复**：工作流状态持久化，进程崩溃或重启后可续跑。
- **多项目能力**：项目是数据而非进程，一个内核管理多个项目。
- **人工审批**：持久化的等待状态（`WAITING_APPROVAL`、`WAITING_HUMAN`）让 Gate 1 / Gate 2 成为可能。
- **可审计**：只追加的事件日志回答“谁、何时、对哪个对象、用哪个模型、花了多少、为何失败”。
- **执行器可替换**：新增执行器（包括 Trae）只是新增一个适配器与一条策略数据。
- **证据式完成**：机器证据、AI 判断、人工批准分层记录，完成规则可测试。

负面：

- **初期迁移量更大**：前 4–6 周可见进展少于原地重构。
- **引入 TypeScript**：新增构建步骤与开发依赖（仅开发期，`typescript`、`@types/node`）。
- **引入 SQLite 依赖**：生产驱动的选择（`node:sqlite` 或第三方驱动）及其在 Electron 中的打包需在 Stage 2 决定。
- **新旧运行时并存**：在新内核达到功能对等前，两套运行时同时存在，需要纪律防止重复开发。

## Migration Strategy（迁移策略）

采用**绞杀式迁移 / 增量替换（strangler migration）**，在同一仓库内进行：

1. **Stage 0（本阶段）**：冻结本 ADR；建立 `packages/{domain,events,executors,store}` 与 TypeScript 基础；定义领域实体、三个状态机、事件信封、执行器契约、最小 SQLite schema；修复旧系统验收“失败即放行”。旧 NiuMa 其余行为不变。
2. **Stage 1**：把执行器与办公室渲染器抽成独立包，**旧 NiuMa 同步改为依赖这些包**，避免代码复制。
3. **后续 Stage**：新内核按“先纵切、后铺开”推进；第一个纵切跑通“项目 → 需求 → 人工批准 → 任务 → 执行器 → 真实事件 → 测试证据 → 审查 → 返工 → 完成”。
4. **对等后切换**：桌面壳切换到新内核，旧的 `src/coordinator.js`、`src/server.js`、`public/app.js` 退役。

在此之前，**现有 NiuMa 运行时始终保持可用、可发布**；根目录 `npm test` 仍然只运行旧测试且零依赖，以免破坏桌面打包流水线（`.github/workflows/desktop.yml` 在未安装根依赖的情况下运行 `npm test`）。

## Stage 0 中对评估报告的细化

实施 Stage 0 时对状态机做了两处补充，原因见 `docs/architecture/state-machines.md`：

- Requirement 增加 `ANALYZING → DRAFT`（分析失败），否则分析失败会让需求永久卡在 `ANALYZING`，与“重启恢复”目标矛盾。
- Task 允许 `PENDING → CANCELLED`，否则需求在任务开始前被取消时，未开始的任务无法终结。

这两处属于补全而非方向调整，不影响本 ADR 的决策。
