# Trae 接入可行性研究

- 日期：2026-10-05
- 状态：案头研究已完成；一周实测计划待执行（见第 5 节）
- 结论：**`TRAE_HUMAN_IN_LOOP`**（实测后复核）
- 约束：本研究不实现生产级 Trae Adapter，不通过浏览器或 Electron 调试端口自动化 TRAE 图形界面。

## 1. 结论先行

商业版 TRAE（IDE / SOLO）目前**没有可查证的官方无界面接口**。开源的 `trae-agent`（`trae-cli`）可以无界面运行，但它用的是**用户自己的模型 API Key**，不走 TRAE 订阅。

所以，“用 Trae 包月额度做全自动主力工程师”这条路，在合法、受支持的前提下走不通。V1 应把 Trae 作为**人在回路的辅助执行通道**：系统准备好 worktree 和任务说明，人在 TRAE IDE 中完成，交回后由系统自动做机器检查、AI 审查和返工判断。全自动的低成本主力工程师，改由按量计费的执行器承担（DeepSeek 等 OpenAI 兼容 API，或使用自有 Key 的 `trae-cli`）。

## 2. 十个问题

| # | 问题 | 回答 | 依据 | 证据等级 |
| --- | --- | --- | --- | --- |
| 1 | 商业版 TRAE 有官方支持的无界面接口吗？ | 没有找到。官方文档只描述 IDE 与 SOLO 工作流；第三方调研明确指出商业版没有公开的 CLI 或无界面模式 | [TRAE 文档](https://docs.trae.ai/ide/what-is-trae?_lang=en)；[Ry Walker 调研（2026-09-23）](https://rywalker.com/research/trae) | 推断（无法证明“不存在”，但官方与第三方均无记载） |
| 2 | 能否合法地自动化使用 TRAE 订阅额度？ | 没有受支持的途径。唯一见到的自动化方式是通过 Electron 调试端口驱动界面的第三方项目，属于不受支持的做法，且可能违反服务条款 | [OpenCLI TRAE SOLO 适配器文档](https://github.com/jackwener/OpenCLI/blob/main/docs/adapters/desktop/trae-solo.md) | 推断；服务条款原文未能读取（见问题 9） |
| 3 | `trae-agent` / `trae-cli` 用什么做推理？ | 用户配置的模型服务：OpenAI、Anthropic、Google Gemini、OpenRouter、Doubao、Ollama、Azure；通过 `trae_config.yaml`、环境变量（如 `OPENAI_API_KEY`、`DOUBAO_API_KEY`）或命令行参数配置 | [bytedance/trae-agent](https://github.com/bytedance/trae-agent) | 事实 |
| 4 | 走 TRAE 订阅还是单独的 API 计费？ | 单独的 API 计费。仓库文档没有任何关于 TRAE 订阅的说明；第三方调研提醒不要把开源 `trae-agent` 与商业版 IDE 的许可、运行时和定价混为一谈 | 同上；[Ry Walker 调研](https://rywalker.com/research/trae) | 事实（文档层面） |
| 5 | 能否在指定 worktree 中可靠运行？ | 接口上支持：`trae-cli run "<任务>" --working-dir <目录>`，另有 `--must-patch` 和 Docker 隔离选项（`--docker-image` 等）。“可靠”需实测 | [bytedance/trae-agent](https://github.com/bytedance/trae-agent) | 接口为事实；可靠性未知 |
| 6 | 能否输出结构化进度？ | 部分。`--trajectory-file` 输出包含 LLM 交互、步骤、工具调用的 JSON 轨迹；但“流式轨迹记录”（Streamed Trajectory Recording）仍在路线图上，说明目前可能只能事后读取或轮询 | [trae-agent 路线图](https://github.com/bytedance/trae-agent/blob/main/docs/roadmap.md) | 推断，需实测 |
| 7 | 能否判断任务完成？ | 能。Agent 通过 `task_done` 工具声明完成，进程随后退出；`--max-steps` 限制步数。注意：这只是 Agent 的自我声明，按 ADR-001 仍须经过证据判定 | [bytedance/trae-agent](https://github.com/bytedance/trae-agent) | 事实 + 架构规则 |
| 8 | 能否安全取消？ | 未知。没有文档化的取消机制（路线图也未提及）。可行办法是结束进程树，或在 Docker 模式下停止容器；需要实测是否会留下半写的文件 | 同上 | 未知 |
| 9 | 相关服务条款 / 自动化限制是什么？ | 未能核实。TRAE 服务条款页面为前端渲染，抓取不到正文。在核实之前，任何对 TRAE IDE 的自动化都应视为不允许 | [TRAE Terms of Service](https://www.trae.ai/terms-of-service)（正文未读取） | 未知 |
| 10 | V1 最安全的接入方式是什么？ | 人在回路（路径 C），并可选地提供使用自有 Key 的 `trae-cli` 作为按量执行器（路径 B） | 见第 3 节 | 结论 |

## 3. 三条路径对比

| 维度 | A. 官方无界面接口 | B. 开源 `trae-agent` / `trae-cli` | C. 人在回路使用 TRAE IDE |
| --- | --- | --- | --- |
| 是否存在 | 目前未发现 | 存在（MIT 许可） | 存在（就是正常使用 IDE） |
| 自动化程度 | — | 全自动 | 半自动：编码由人完成，其余自动 |
| 计费 | — | 按量 API（用户自有 Key） | TRAE 订阅 |
| 边际成本 | — | 与直接调用同一模型相当 | 订阅内为零，但消耗人的时间 |
| 结构化进度 | — | 轨迹 JSON（是否流式待实测） | 只能由系统观察 worktree（文件变化、`git diff --stat`）和心跳 |
| 完成判定 | — | `task_done` 加进程退出 | 人点“交活”，或检测到任务分支上的提交 |
| 取消 | — | 结束进程树或停止容器（待实测） | 人放弃任务；系统回收 worktree |
| 合规风险 | — | 低（开源 + 自有 Key） | 低（正常使用产品） |
| 额外运行时依赖 | — | Python 3.12+，Docker 可选 | 用户本机安装 TRAE |
| 适配器 `capabilities()` | — | `interactive: false`、`billing: 'usage'` | `interactive: true`、`billing: 'subscription'` |

**明确排除：** 通过浏览器或 Electron 调试端口自动化 TRAE 图形界面。这是不受支持的做法，只能作为标注为“不受支持”的实验性研究，不进入生产方案。

## 4. 推荐的 V1 接入方式

1. **路径 C 作为 Trae 的主通道。** Trae Adapter 实现标准 `ExecutorAdapter` 契约（`packages/executors`）。流程如下：
   - `start()`：在任务 worktree 中写入任务说明文件，提示用户用 TRAE 打开该目录。
   - 运行中：持续发出 `heartbeat`，并把文件变化转成结构化的 `file.write` 活动。
   - 结束：用户确认交活，或检测到任务分支上的提交时，返回 `succeeded`；用户放弃时返回 `cancelled`。
   - 交回之后的机器检查、AI 审查、返工判断全部自动进行，与其他执行器一致。
2. **路径 B 作为可选的按量执行器。** 如果团队希望用 Doubao 等模型，可以接入使用自有 Key 的 `trae-cli`。它在经济上等同于“又一个按量执行器”，不提供包月优势。
3. **升级到 Codex 由策略决定，不写在适配器里。** 例如 Primary Engineer 的 L2 规则写成“同一任务证据失败 2 次后，下一次尝试改用 Codex”。

## 5. 一周实测计划（验证剩余未知项）

| 天 | 目标 | 做法 | 通过标准 |
| --- | --- | --- | --- |
| 第 1 天 | 确认商业版是否有官方接口与条款限制 | 通读 TRAE 服务条款与官方文档（必要时用浏览器打开前端渲染页面）；向 TRAE 官方渠道书面询问自动化使用订阅是否允许 | 拿到条款原文中关于自动化、逆向、额度使用的条款，或官方书面答复 |
| 第 2 天 | `trae-cli` 在 worktree 中的可靠性 | 在一个有测试的样例仓库中，为 5 个小任务各建一个 worktree，用 `--working-dir` 运行 | 5 次中至少 4 次只修改目标 worktree，无越界写入 |
| 第 3 天 | 进度与完成信号 | 运行中轮询 `--trajectory-file`，检查能否在进行中读到步骤；记录 `task_done` 与退出码的对应关系 | 能在运行中每 10 秒内拿到新步骤，或明确确认“只能事后读取” |
| 第 4 天 | 取消与残留 | 在写文件过程中结束进程树；Docker 模式下停止容器 | 取消后 10 秒内进程全部退出；`git status` 能准确反映残留，并可一键清理 |
| 第 5 天 | 人在回路的体验与成本 | 用路径 C 完成 3 个真实小任务：系统准备 worktree，人在 TRAE 中完成，系统自动验证 | 每个任务的人工操作步骤不超过 3 步；记录人均耗时，作为成本模型输入 |

实测结束后更新本文档的结论。可能的变化：

- 第 1 天拿到官方支持的接口或书面许可 → 改为 `TRAE_AUTOMATION_SUPPORTED`。
- 路径 C 的人工耗时过高，且团队不需要 `trae-cli` → 改为 `TRAE_NOT_RECOMMENDED`，主力工程师完全由按量执行器承担。

## 6. 经济影响

- **原假设不成立：** 产品方案 V1 中“Trae（包月优先）做主力工程师”的前提，是把订阅额度用于全自动执行。目前没有受支持的方式能这样做。
- **全自动主力工程师改为按量计费：** 默认执行器应是低价 OpenAI 兼容 API（如 DeepSeek，已有 `OpenAIWorker`），失败按策略升级到 Codex。成本按 token 计量，须由 Execution 记录 `costUsd` 并受 `budgetUsd` 约束。
- **Trae 订阅的价值转为“人的杠杆”：** 适合人愿意亲自上手的任务（界面细调、复杂交互）。系统省掉的是验证、审查、返工的工作量，而不是编码的人力。
- **成本模型需要两列：** 自动通道按 token 计费；辅助通道按订阅费加人的时间计。办公室界面里，Trae 角色应显示为“主力工程师（协作中）”，避免让用户误以为是全自动。

## 来源

- [bytedance/trae-agent（README）](https://github.com/bytedance/trae-agent)
- [trae-agent 路线图](https://github.com/bytedance/trae-agent/blob/main/docs/roadmap.md)
- [TRAE and Trae Agent（Ry Walker，2026-09-23）](https://rywalker.com/research/trae)
- [OpenCLI：TRAE SOLO 适配器文档](https://github.com/jackwener/OpenCLI/blob/main/docs/adapters/desktop/trae-solo.md)（仅作为“不受支持做法”的例证）
- [What is TRAE IDE?（官方文档）](https://docs.trae.ai/ide/what-is-trae?_lang=en)
- [TRAE Terms of Service](https://www.trae.ai/terms-of-service)（页面为前端渲染，正文未能读取）
