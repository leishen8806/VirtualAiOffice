# Stage 1A：执行器抽取计划（Executor Extraction Plan）

- 状态：**修订版 r2，架构决策 D1–D3 已批准**；尚未实施任何代码
- 调研基线：NiuMa `f770df4`；Stage 0 已合并（`origin/main` @ `30ea2b2`，PR #1）
- 目标：把旧 NiuMa 的执行器实现抽到 `packages/executors`，旧 NiuMa 改为使用同一份实现，不保留第二份
- 依据：ADR-001 第 2 条、`docs/architecture/executor-contract.md`（“旧执行器到新契约的对应”）

> 说明：任务书里的 `src/toolbox.js` 在仓库中**不存在**。`Toolbox`（文件/shell 工具，限制在工作目录内）是 `src/workers/openai.js` 里的一个类；`src/tools.js` 是 **MCP 插件目录（ToolCatalog）**，两者不是同一个东西。下文按实际文件分析。

## 0. 已批准的决策（本版新增）

| 决策 | 结论 | 对计划的影响 |
| --- | --- | --- |
| **D1** 运行时打包 | 运行时保持为**可直接执行的 ESM JavaScript 源码**，位于 `packages/executors/runtime/`；**不依赖编译后的 `dist`**。旧 NiuMa 无需 TypeScript 编译即可 import | `runtime/` 在包根目录（不是 `src/runtime`）；不使用 `allowJs`；类型靠手写 `runtime/index.d.ts` |
| **D2** 旧版测试/构建 | **不**给根 `npm test` 加 `pretest` 构建；旧版启动不依赖 `tsc -b` | `npm test` 仍是 `node --test`、无 TS 前置；包测试继续 `npm run test:packages`；CI 显式跑两套 |
| **D3** 适配器范围 | **包含** Stage 0 `ExecutorAdapter` 的实现；抽出的 Claude / Codex / OpenAI 兼容运行时必须通过新契约被证明可用 | `adapters/` 是 1A 的交付物与验收项，不是可选 |
| **桌面打包** | 打包后的 Electron 应用必须能解析移到 `packages/` 下的共享运行时，**1A 验收项**；不得把运行时复制回 `desktop/` 或 `src/` | 单一事实来源；见 §4.2 |

派生规则（由上面推出，评审时按此检查）：

1. **旧版靠相对路径导入运行时，不靠包名解析**。原因：旧版今天在没有 `npm install` 的干净克隆上就能跑（零依赖）；包名解析需要 workspace 符号链接，会引入新的前置条件。相对路径同样在打包目录里成立（§4.2）。
2. **只有一个入口文件被外部使用**：`packages/executors/runtime/index.js`（桶文件）。旧版垫片与适配层都只从它导入；其余文件视为内部实现。
3. **`runtime/` 零外部依赖**：只能 import `node:*` 与 `runtime/` 内部文件；**不得** import 旧 `src/`、`@vao/domain`、`@vao/events`、`@vao/store`、任何 npm 包。
4. **根 `npm test` 不需要构建**，所以运行时的行为测试（参数黄金、解析器黄金、进程层、Toolbox）写成普通 JS，放在根 `test/` 下，由 `node --test` 直接运行。需要编译的只有适配层测试（`packages/executors/spec`，由 `test:packages` 运行）。

---

## 1. 现状盘点

### 1.1 文件规模与角色

| 文件 | 行数 | 角色 |
| --- | ---: | --- |
| `src/workers/base.js` | 81 | `BaseWorker`：构造状态、模型选择、环境变量、日志、进程追踪、`stopAll` |
| `src/workers/cli.js` | 330 | Claude / Codex CLI 工作者 + 两个流式解析器 + 工具描述 |
| `src/workers/openai.js` | 475 | OpenAI 兼容工作者 + `Toolbox` + 工具函数定义 + 系统提示 + MCP 路由 |
| `src/util.js`（部分） | 271 | `spawnCmd` / `killTree` / `runShell` / `fillEnv` / `truncate` / `firstLine` / `SKIP_DIRS` |
| `src/config.js`（部分） | 129 | `CLAUDE_DENY`、`SAFE_COMMANDS` 常量（其余是配置合并） |
| `src/models.js` | 56 | 模型能力画像（路由用） |
| `src/tools.js`（部分） | 292 | `ToolCatalog`（插件目录）+ `describeMcpCall` / `splitMcpName`（气泡文案） |
| `src/mcp/client.js` | ~150 | 最小 MCP stdio 客户端（OpenAI 工作者用） |
| `src/mcp/desktop.js` | — | 内置“电脑操作”MCP 服务器（插件本体） |
| `src/team.js` | 165 | `Team`：按配置实例化工作者；类型表 `TYPES` |
| `src/coordinator.js` | 1061 | 调度；只通过 `g.run / g.ask / g.check / g.stopAll / g.modelFor / g.profileFor` 使用工作者 |
| `fake/*.mjs` | ~350 | 排练用替身：假 `claude`、假 `codex`、假 OpenAI 服务器、排练配置 |

### 1.2 十一个关注点逐项定位

| # | 关注点 | 位置 | 说明 |
| --- | --- | --- | --- |
| 1 | Claude CLI | `cli.js`：`ClaudeCliWorker`（`permissionArgs` / `modelArgs` / `runArgs` / `ask`）、`createClaudeParser`、`describeClaudeTool` | 参数：`-p --output-format stream-json --verbose`，`--allowedTools` / `--disallowedTools`，`--mcp-config <临时文件>`，`--model` + `--fallback-model` |
| 2 | Codex CLI | `cli.js`：`CodexCliWorker`（`sandboxArgs` / `runArgs` / `ask`）、`createCodexParser` | 参数：`exec --json --skip-git-repo-check -C <workdir> -o <outFile> -s <sandbox>`，MCP 以 `-c mcp_servers.*` 覆盖注入 |
| 3 | OpenAI 兼容 | `openai.js`：`OpenAIWorker`（`chat` 含 429/5xx 退避重试、`run` 工具循环、`trim` 上下文裁剪、`ask`） | 自带 `Toolbox` + 函数定义 `TOOLS`，不依赖外部 CLI |
| 4 | DeepSeek 路径 | **没有专属代码**：就是 `type: 'openai-api'` + `baseUrl` + `models` 的一份配置（`src/setup.js` 预设；`team.js` 品牌色；`models.js` 画像） | 不为 DeepSeek 建单独适配器；它是 `OpenAICompatAdapter` 的一份配置 |
| 5 | 排练 / 假工作者 | `fake/claude.mjs`、`fake/codex.mjs`、`fake/openai-server.mjs`、`fake/common.mjs`、`fake/rehearsal.mjs` | `claude.mjs` / `codex.mjs` 依赖 `common.mjs` 的 `classify()`，后者**按中文提示词内容**判断场景，与 NiuMa 提示词强耦合 |
| 6 | 解析逻辑 | `createClaudeParser` / `createCodexParser` / `describeClaudeTool` / `cleanCmd` / `shortPath` / `describeMcpCall` | 产出 `{kind: tool\|say\|think\|warn, text: 中文}`；`finish()` 产出 `{ok,text,error,cost\|usage,sessionId}` |
| 7 | 进程拉起 | `util.js`：`spawnCmd`（Windows 走 shell + `winQuote`，Unix 用 `detached`）、`killTree`、`runShell`；`mcp/client.js` 另有一份 `winQuote` 副本 | `spawnCmd` 删除 `CLAUDECODE` 环境变量，防止嵌套拒绝启动 |
| 8 | 会话处理 | 解析器**只捕获** `sessionId`（Claude `system.init.session_id`；Codex `thread.started.thread_id`）并返回；**没有任何地方用它 resume** | OpenAI 路径无会话概念 |
| 9 | 成本 / token | Claude：`total_cost_usd` → `cost`；Codex：`turn.completed.usage` 原样（`input_tokens`/`output_tokens`）；OpenAI：`usage {in,out}` + `cost()` 用 `cfg.price` 计算 | **三家形状不一致**。界面 `public/app.js:441` 读 `t.usage.in/out`，所以 Codex 的 token 在界面上实际不显示（既有行为，1A 不修） |
| 10 | workdir 耦合 | 见 §1.3 | |
| 11 | MCP / 工具耦合 | 见 §1.4 | |

### 1.3 workdir 耦合点（全部）

| 位置 | 用法 | 抽取后 |
| --- | --- | --- |
| `BaseWorker` 构造 `{workdir,…}` → `this.workdir` | 永久状态 | 变为**默认值**；`run/ask` 接受调用时的 `workdir`，优先于默认值 |
| `CliWorker.check()` | `--version` 的 `cwd` | 不需要工作目录：用 `process.cwd()` |
| `CliWorker.run()` | `spawnCmd(..., {cwd: this.workdir})` | 取调用参数 |
| `CodexCliWorker.runArgs` | `-C this.workdir` | 取调用参数 |
| `createClaudeParser(workdir)` / `createCodexParser(workdir)` | 仅用于 `shortPath` 相对化 | 已是“每次运行创建”，传调用参数即可 |
| `BaseWorker.openLog` | 日志头写工作目录 | 取调用参数 |
| `OpenAIWorker.run` | `new Toolbox(this.workdir)`、`systemPrompt({workdir})` | 取调用参数 |
| `OpenAIWorker.startPlugins` | `McpClient(... cwd: this.workdir)` | 取调用参数 |
| `Team` 构造 `{workdir}` → `ctx`、`ToolCatalog({workdir})` | 工作者上下文 | 旧版继续在构造时给**默认**工作目录；Coordinator 调用 `run` 时不传则用默认（旧行为） |
| `Coordinator` 的 `this.workdir`（git 存档、会议纪要等） | 编排层使用 | **不动** |

### 1.4 MCP / 工具耦合

- **插件目录（ToolCatalog）**：决定“有哪些插件、谁能用、怎么启动”，是路由/配置知识 → 留旧版（LEGACY-ONLY）。
- **工具授权载荷**：Coordinator 的 `toolsFor()` 把目录条目变成 `{id,name,server,command,args,env,native,vision,…}` 传给 `run({tools})`。执行器只消费这个载荷（`injected()` 过滤掉“CLI 自己已加载”的插件）。契约的 `ToolGrant` 只有 `{id}`，**缺 command/args/env**。→ 适配器构造时注入 `resolveTool(id)`（由编排层/旧版目录提供）；**1A 不扩展 `ToolGrant`**。
- **MCP 客户端** `mcp/client.js`：只被 `OpenAIWorker` 使用 → MOVE（连同重复的 `winQuote`，去重）。
- **MCP 展示文案** `describeMcpCall`（`BROWSER_ZH` / `DESKTOP_ZH`）：展示层，被两个解析器使用 → §3.4。
- **桌面插件本体** `mcp/desktop.js`：工具服务器，不是执行器 → LEGACY-ONLY。

---

## 2. 分类表

**KEEP** 原地不动；**MOVE** 逐字搬到包里（保留 git 历史，不改逻辑）；**REFACTOR** 搬运的同时做最小的、有测试保护的改造；**LEGACY-ONLY** 是 NiuMa 专有，留旧版。

| 模块 / 符号 | 分类 | 去向（均在 `packages/executors/runtime/`） | 备注 |
| --- | --- | --- | --- |
| `util.js`：`spawnCmd`, `killTree`, `runShell`, `winQuote`, `isWin` | **MOVE** | `process.js` | `util.js` 改 re-export，其它旧模块（`git.js`、`setup.js`…）无需改 |
| `util.js`：`truncate`, `firstLine`, `fillEnv`, `sleep` | **MOVE** | `text.js` | 同上 |
| `util.js`：`SKIP_DIRS` | **MOVE** | `policy.js` | `Toolbox` 与 `projectContext` 共用 |
| `util.js`：`extractJson`, `expandHome`, `projectContext`, `gitChanges` | **KEEP** | — | 规划/上下文用，与执行器无关 |
| `config.js`：`CLAUDE_DENY`, `SAFE_COMMANDS` | **MOVE** | `policy.js` | `config.js` re-export；其余配置合并留旧版 |
| `workers/base.js`：`BaseWorker` | **REFACTOR** | `base-worker.js` | 去掉 `profileFor`（依赖 `models.js`，移回旧版）；`workdir` 变默认值；`openLog` 接收 workdir；`modelFor` 保留 |
| `workers/base.js`：`shortPath` | **MOVE** | `format.js` | 解析器用 |
| `workers/cli.js`：`createClaudeParser`, `createCodexParser`, `cleanCmd`, `parseArgs` | **MOVE**（1A-2）→ **REFACTOR**（1A-3，仅增量） | `parsers/claude.js`, `parsers/codex.js`, `parsers/shared.js` | **不重写**。1A-3 只**追加**可选字段 `activity`；`{kind,text}` 逐字节不变 |
| `workers/cli.js`：`describeClaudeTool` | **MOVE** | `format.js` | 保持导出名 |
| `workers/cli.js`：`CliWorker`, `ClaudeCliWorker`, `CodexCliWorker` | **REFACTOR** | `cli-workers.js` | workdir 调用时传入；新增可选 `signal`；其余参数/行为不变 |
| `workers/openai.js`：`OpenAIWorker` | **REFACTOR** | `openai-worker.js` | 同上；去掉对 `../tools.js`、`../config.js`、`../util.js` 的相对 import |
| `workers/openai.js`：`Toolbox`, `TOOLS`, `WRITE_TOOLS`, `describeTool`, `clip`, `systemPrompt`, `fnName`, `plainSchema`, `normalizeBase` | **MOVE** | `openai-worker.js` | 先同文件搬；拆文件留到 1A 之后，避免无谓改动 |
| `mcp/client.js`：`McpClient`, `mcpResult` | **MOVE** | `mcp-client.js` | 合并重复的 `winQuote` |
| `mcp/desktop.js` | **LEGACY-ONLY** | 原位 | 插件服务器本体 |
| `tools.js`：`ToolCatalog`, `builtinTools`, `claudeServers`, `codexServers` | **LEGACY-ONLY** | 原位 | 路由/配置知识 |
| `tools.js`：`describeMcpCall`, `splitMcpName`, `BROWSER_ZH`, `DESKTOP_ZH` | **MOVE** | `format.js` | `tools.js` re-export；`tools.test.js` 断言原样通过 |
| `models.js` | **KEEP** | 原位 | 画像是路由知识；随 Execution Policy 再下沉，**1A 不动** |
| `team.js`：`TYPES`、`new Cls(g, ctx)` | **REFACTOR**（极小） | 原位 | 只改 import 来源；类型名与构造签名不变 |
| `coordinator.js` | **KEEP** | 原位 | **不重写**；靠垫片保持 `g.run({...})` 调用形状不变 |
| `fake/claude.mjs`, `fake/codex.mjs`, `fake/common.mjs` | **LEGACY-ONLY** | 原位 | 依赖 NiuMa 提示词分类 |
| `fake/openai-server.mjs` | **LEGACY-ONLY**（1A） | 原位 | 被 `agent.test.js`、`tools.test.js`、排练共用；包内测试通过相对路径复用，**不复制** |
| `fake/rehearsal.mjs` | **LEGACY-ONLY** | 原位 | 构造 NiuMa 的 groups/employees/brain |
| 契约适配层 | **新建** | `packages/executors/adapters/`（TS） | §3.3；只做映射与能力声明，**不含第二份执行逻辑** |

---

## 3. 目标结构（`packages/executors/`）

### 3.1 目录

```text
packages/executors/
├── package.json            # exports 增加 "./runtime"；"files" 含 runtime
├── tsconfig.json           # rootDir "."，include ["src","adapters"]（见 §3.6）
├── tsconfig.spec.json
├── runtime/                # 可直接执行的 ESM JS（单一事实来源，D1）
│   ├── index.js            # 唯一对外入口（桶文件）
│   ├── index.d.ts          # 手写类型声明（不重写旧代码、不加类型）
│   ├── process.js          # spawnCmd, killTree, runShell, winQuote, isWin
│   ├── text.js             # truncate, firstLine, fillEnv, sleep
│   ├── policy.js           # CLAUDE_DENY, SAFE_COMMANDS, SKIP_DIRS
│   ├── format.js           # shortPath, describeClaudeTool, describeMcpCall, splitMcpName
│   ├── parsers/{claude,codex,shared}.js
│   ├── base-worker.js      # BaseWorker（去 profileFor）
│   ├── cli-workers.js      # CliWorker, ClaudeCliWorker, CodexCliWorker
│   ├── openai-worker.js    # OpenAIWorker, Toolbox, TOOLS …
│   └── mcp-client.js       # McpClient, mcpResult
├── adapters/               # TypeScript ExecutorAdapter 实现（D3）
│   ├── index.ts
│   ├── legacy-backed.ts    # 用运行时工作者实现 ExecutorAdapter 的公共部分
│   ├── activity-map.ts     # {kind,text,activity?} → ExecutorEvent
│   ├── result-map.ts       # 旧结果 → ExecutionResult
│   ├── claude-cli.ts
│   ├── codex-cli.ts
│   └── openai-compat.ts
├── src/                    # 现有通用契约（contract.ts / activity.ts / index.ts），导出适配层
├── spec/                   # TS 测试（适配器合规等），由 test:packages 运行
└── fixtures/               # 解析器黄金夹具（.jsonl，由 fake/ 一次性录制，只读）
```

### 3.2 依赖图

```text
@vao/domain ◄── @vao/executors  src/(contract|activity)  +  adapters/   [TS，严格模式，编译到 dist]
                                      │ import '@vao/executors/runtime'（包自引用）
                                      ▼
                       packages/executors/runtime/   [可执行 ESM JS；仅依赖 node:*]
                                      ▲
                                      │ 相对路径 import（../../packages/executors/runtime/index.js）
  旧 NiuMa：src/workers/{base,cli,openai}.js（垫片）、src/util.js、src/config.js、src/tools.js（re-export）
            src/team.js ──► 垫片        src/coordinator.js ──► Team
```

规则：
- 方向单向：`runtime` ← `adapters`、`runtime` ← 旧 `src/`；**`runtime` 不反向依赖任何一方**。
- `src/contract.ts`、`src/activity.ts` **不得** import `runtime/`。
- 旧版只从 `runtime/index.js` 导入（相对路径）；适配层只从 `@vao/executors/runtime` 导入。有一个测试（§6.2-6）扫描 `src/`、`adapters/`，禁止出现指向 `runtime/` 内部文件的导入。
- 适配层用包名自引用而不是 `../runtime`，因为编译后 `dist/adapters/*.js` 相对 `../runtime` 会指向不存在的 `dist/runtime`；自引用在源码与产物里都解析到同一份 `runtime/`，且不需要 `node_modules` 符号链接。

### 3.3 与契约的映射（对应 `executor-contract.md`）

| 旧 | 新 | 1A 处理 |
| --- | --- | --- |
| `run({prompt,model,readOnly,onActivity,timeoutMs,label,tools})` | `start(spec)`：`instructions` / `modelHint` / `access` / `budget.maxDurationMs` / `events` / `tools` | 适配器做参数映射；`workdir` 来自 `spec.workdir` |
| `{ok,text,error,cost,usage,sessionId,durationMs}` | `ExecutionResult`（`outcome`,`summary`,`costUsd`,`tokensIn/Out`,`sessionRef`,`durationMs`） | `result-map.ts`：用运行时结果里**追加**的机器可读 `outcome`（R4），不靠中文文案 |
| Codex `usage {input_tokens,output_tokens}`、OpenAI `usage {in,out}` | `tokensIn/tokensOut` | 只在适配层统一；旧结果对象的 `usage` 保持原样 |
| `stopAll()` | `cancel(executionId)` | 运行时新增可选 `signal`（`AbortSignal`），使按次取消成为可能；旧调用不传，行为不变；`stopAll()` 保留给旧版 |
| `check()` | 适配器内部能力探测 | 保留；不进入契约 |
| `ask()` | 不属于契约 | 保留给旧版（规划、汇报、会议）；**1A 不迁，也不删** |
| `autonomy: full\|safe` | 策略层转换为 `access` 与沙箱级别 | 适配器以构造参数暂存；Execution Policy 不在 1A |
| `workdir`（构造时） | `spec.workdir`（每次） | 见 §1.3 |

`capabilities()` 初值（以现有行为为准，不新增能力）：

| 适配器 | interactive | read/write/shell | canUseMcp | vision | billing |
| --- | --- | --- | --- | --- | --- |
| `claude-cli` | false | true/true/true | true | true | `unknown` |
| `codex-cli` | false | true/true/true | true | false | `unknown` |
| `openai-compat` | false | true/true/true | true | 取 `cfg.vision` | `usage` |

### 3.4 结构化活动（`ExecutorEvent`）的做法

旧解析器直接产出中文展示文本 `{kind:'tool', text:'改 src/a.js'}`，信息被压扁。契约要的是 `ExecutionActivity`。

**原则：不重写解析器，只做增量。**

1. 搬运（1A-2）：解析器逐字不变，导出 `{kind,text}`。
2. 增量（1A-3）：在每个 `out.push({kind,text})` 处**追加**可选字段 `activity`（契约的 `ExecutionActivity`，路径相对工作目录）。`kind`、`text` **不改**，Coordinator 不会察觉。
   - Claude：`Read`→`file.read`；`Edit/MultiEdit/NotebookEdit/Write`→`file.write`；`Bash`→`command.run` / `test.run`（运行时内置同样的测试命令识别，与 `commandActivity()` 的规则保持一致，由适配层测试保证两者一致）；`Grep/Glob`→`search`；其余/MCP→`tool.call`；文本→`message`；`thinking`→`thinking`。
   - Codex：`command_execution`→命令；`file_change`→每个路径一个 `file.write`；`mcp_tool_call`/`web_search`→`tool.call`；`agent_message`→`message`；`reasoning`→`thinking`；非零退出码与 `error`（`warn`）没有对应类型 → 不产生 `activity`，由 `result.error` 承载（R6）。
   - OpenAI：`TOOLS` 六个函数一一对应；MCP 调用→`tool.call`。
3. `activity-map.ts` 把 `{kind,text,activity?,ts}` 变成 `ExecutorEvent`（加 `at`）。没有 `activity` 的条目不进入事件流。
4. 用量事件：Claude `result.total_cost_usd`、Codex `turn.completed.usage`、OpenAI 每轮 `usage`，在结束时（OpenAI 可每轮）发 `{kind:'usage'}`。
5. `heartbeat`：1A 不发（避免引入定时器行为变化）。

中文文案仍由 `format.js` 生成并留在旧版界面使用；新界面将来用 `activity` 渲染。

### 3.5 公开导出

`runtime/index.js`（桶文件，旧版与适配层的唯一入口）：
- 工作者：`BaseWorker`, `ClaudeCliWorker`, `CodexCliWorker`, `OpenAIWorker`, `WORKER_TYPES`（`{'claude-cli','codex-cli','openai-api'}`）
- 解析与展示：`createClaudeParser`, `createCodexParser`, `describeClaudeTool`, `describeMcpCall`, `splitMcpName`, `shortPath`
- 工具：`Toolbox`, `TOOLS`, `McpClient`, `mcpResult`
- 进程与文本：`spawnCmd`, `killTree`, `runShell`, `isWin`, `truncate`, `firstLine`, `fillEnv`, `sleep`
- 常量：`CLAUDE_DENY`, `SAFE_COMMANDS`, `SKIP_DIRS`

`package.json`：
```text
"exports": {
  ".":         { types: "./dist/src/index.d.ts", default: "./dist/src/index.js" },   // 契约 + 适配器（需构建）
  "./runtime": { types: "./runtime/index.d.ts",  default: "./runtime/index.js" }     // 可直接执行（无需构建）
}
```
`@vao/executors`（根）新增导出：`createClaudeCliAdapter`, `createCodexCliAdapter`, `createOpenAICompatAdapter`, `mapLegacyResult`, `mapLegacyActivity`；既有契约与活动类型不变。

### 3.6 TypeScript 工程调整（仅适配层）

- `tsconfig.json`：`rootDir` 从 `src` 改为 `.`，`include: ["src","adapters"]`；不开 `allowJs`；`runtime/` 只通过 `index.d.ts` 参与类型检查，不被编译、不被复制到 `dist`。
- 产物路径变为 `dist/src/*`、`dist/adapters/*`（根导出路径随之更新）。现有 `spec/contract.spec.ts` 的导入路径、`tsconfig.spec.json` 的 `references` 同步调整。1A-0 开始前先确认没有其他包依赖 `@vao/executors` 的旧产物路径（目前除自身外没有）。
- `runtime/index.d.ts` 与 `runtime/index.js` 的导出必须一致：适配层编译会检查被使用的符号；另有一个测试断言 `Object.keys(await import(runtime))` 等于声明里的导出清单（R13）。

---

## 4. 旧 NiuMa 的兼容策略

目标：Coordinator **一行不改**；旧版执行路径**物理上只有一份实现**；**旧版运行不需要 `npm install`、不需要 `tsc`**。

1. **薄垫片**：`src/workers/cli.js`、`openai.js`、`base.js` 变成只含 re-export 的文件，例如
   `export { ClaudeCliWorker, CodexCliWorker, createClaudeParser, createCodexParser, describeClaudeTool } from '../../packages/executors/runtime/index.js'`。
   保留这些路径，因为 `team.js`、`core.test.js`、`tools.test.js`、`agent.test.js` 现在都从这里导入。**垫片内不允许有任何逻辑**（评审检查项 + §6.2-6 的自动检查）。
2. **`util.js` / `config.js` / `tools.js` 的 re-export**：被搬走的符号从 `runtime/index.js` re-export，其余旧模块的 import 不受影响。
3. **`Team`**：`TYPES` 表引用 `WORKER_TYPES`；构造签名 `new Cls(g, {workdir, logDir, autonomy})` 不变。
4. **workdir 兼容**：构造时给默认值（旧行为）；`run/ask` 接受可选 `workdir` 覆盖。Coordinator 不传 → 旧行为；适配层总是传 `spec.workdir`。**1A 不要求 Coordinator 显式传 workdir**（那是后续 Worktree 阶段的事）。
5. **返回值形状不变**：旧 `run()` 仍返回 `{ok,text,error,cost,usage,sessionId,durationMs}`；新增字段（如 `outcome`）只追加。
6. **没有运行时开关、没有双实现**：搬运在一个提交内完成引用替换，旧文件只留垫片。回退靠 git（§7）。
7. **适配层不接入 Coordinator**：旧版继续走垫片；适配层的使用者是包测试与未来的 Virtual AI Office 核心。

### 4.1 为什么相对路径、而不是 `@vao/executors/runtime`

包名解析需要 `npm install` 建立 workspace 符号链接。旧版现在在没有 `node_modules` 的克隆上就能运行；改成包名解析会让 `npm start`/`npm test` 多出前置条件，违反 D2。相对路径（`../../packages/executors/runtime/index.js`）不需要任何前置条件，并且在打包目录里同样成立（§4.2）。代价：旧版与包的相对目录布局成为一个契约（见 R1），由测试守住。

### 4.2 桌面打包（1A 验收项）

现状：`desktop/main.cjs` 打包后 `CORE = process.resourcesPath/core`；`desktop/package.json` 的 `extraResources` 把 `../bin`、`../src`、`../public`、`../skills`、`../fake`、`../package.json` 复制到 `core/` 下，**不含 `packages/`**。垫片变成相对导入后，不处理就会在打包版里报“找不到模块”。

方案（保持同一目录布局，不复制进 `src/` 或 `desktop/`）：

1. 在 `desktop/package.json` 的 `extraResources` 增加一项：
   `{ "from": "../packages/executors/runtime", "to": "core/packages/executors/runtime", "filter": ["**/*.js"] }`
   （只复制 `.js`；不复制 `index.d.ts`、`dist`、`spec`、`fixtures`。）
2. 目录布局在源码与打包产物里一致：`src/workers/cli.js` → `../../packages/executors/runtime/index.js`，解析为 `core/packages/executors/runtime/index.js`。
3. 模块类型：`core/package.json` 即根 `package.json`，`"type": "module"`，对 `core/packages/**` 同样生效，ESM 可以直接加载。
4. 根 `package.json` 的 `files`（npm 发布）增加 `packages/executors/runtime`。
5. **验收脚本**（无需 electron-builder）：`scripts/verify-packaged-layout.mjs` 把 `extraResources` 声明的目录按同样的映射复制到临时目录，然后在那里运行 `node bin/niuma.js --fake` 的启动检查（等价于现有 `rehearsal` 的冒烟），并断言：（a）能启动；（b）`src/workers/*.js` 与 `packages/` 在临时目录里都不依赖 `node_modules`；（c）临时目录里**没有**第二份 `runtime` 实现（只有 `core/packages/executors/runtime/` 一份）。脚本读取 `desktop/package.json` 的 `extraResources`，而不是硬编码路径，这样配置漂移会被发现。
6. 有 Electron 环境时的人工项：用 `electron-builder --dir` 打一个目录版，运行排练模式（列入发布前检查单，不进 1A 自动化）。

---

## 5. 迁移顺序

每一步一个独立提交；每步结束后 `npm test` 与 `npm run test:packages` 必须与步骤开始时**结果相同**（基线以实施分支起点实测为准，见 §6.3）。

| 步骤 | 内容 | 性质 | 验收 |
| --- | --- | --- | --- |
| **1A-0** | 脚手架：`runtime/` 目录与空桶文件 + `index.d.ts`；`package.json` 的 `exports["./runtime"]`；`tsconfig` 调整（§3.6）；`desktop/package.json` 的 `extraResources` 项；`scripts/verify-packaged-layout.mjs` 及其对**现状**的通过；**先写并提交参数黄金测试**（对旧代码生成快照，放 `test/`，纯 JS） | 只加脚手架与安全网 | 构建通过；旧测试不变；打包布局验证通过 |
| **1A-1** | 搬 `process.js`/`text.js`/`policy.js`（`spawnCmd`、`killTree`、`runShell`、`truncate`、`firstLine`、`fillEnv`、`sleep`、常量）；`util.js`、`config.js` 改 re-export；合并 `winQuote` 副本 | 纯搬运 | 旧测试同结果；排练模式能起；打包布局验证通过 |
| **1A-2** | 搬 `format.js`、解析器、`McpClient`、`BaseWorker`、`CliWorker` 系、`OpenAIWorker`/`Toolbox`；`src/workers/*.js` 改垫片；`team.js` 改 import；`profileFor` 移回旧版。**不改任何逻辑** | 搬运 + 解耦 | 旧测试同结果；**参数黄金测试逐字相同**；打包布局验证通过；`no-logic-in-shims` 检查通过 |
| **1A-3** | `workdir` 调用时传入（默认兼容）、可选 `signal`、结果追加 `outcome`、解析器追加 `activity` | 最小增量改造 | 解析器黄金测试：`{kind,text}` **逐字节相同**；新增 `activity` 断言；`workdir` 回归测试通过 |
| **1A-4** | `adapters/`：三个适配器 + `activity-map` + `result-map`，在 `test:packages` 中通过适配器合规套件（§6.2-4） | 新增映射层（D3） | 三种执行器均通过合规套件；Coordinator 不使用适配器 |
| **1A-5** | 清理与文档：确认 `src/` 下没有残留实现；更新 `docs/architecture/executor-contract.md` 的迁移表；更新 `packages/README.md`；CI 同时跑两套（若 PR #2 的 CI 已在 `main`，则只确认其覆盖；否则补） | 文档/检查 | 无重复实现；Stage 1A 报告 |

1A-3 晚于 1A-2：先证明“搬运不改变行为”，再做增量，否则出问题无法定位。

---

## 6. 测试迁移计划

### 6.1 现有测试

| 现有测试 | 去向 | 说明 |
| --- | --- | --- |
| `core.test.js`：`claude and codex output parsers` | **原位保留**（经垫片运行），不删除；另在 `test/executors-runtime/` 下加解析器黄金测试 | 保持“既有结果不变”可验证 |
| `agent.test.js`：`toolbox …`、`the built-in API agent loops…` | **原位保留**（经垫片运行） | 不复制，避免重复覆盖 |
| `agent.test.js`：`git save points…` | **不动**（属于 `git.js`） | |
| `tools.test.js`：`Claude and Codex runs get the plugins…`、`API models … can call plugins too`、`desktop plugin speaks MCP` | **原位保留**（经垫片运行） | 最重要的行为守护 |
| `core.test.js` 的编排类测试（计划、验收、移交、`/stop`…） | **不动** | 端到端回归，走“Team → 垫片 → 运行时”整条路径 |

原则：运行时是纯 JS，**它的测试留在根 `test/` 里，由 `node --test` 直接运行（无构建）**；只有适配层（TS）的测试进 `packages/executors/spec`。这样 D2 的“`npm test` 无 TS 前置”不被破坏，且运行时的测试不依赖构建。

### 6.2 新增测试

1. **参数黄金测试（1A-0，搬运之前）**：对 `ClaudeCliWorker.runArgs / permissionArgs / modelArgs`、`CodexCliWorker.runArgs / sandboxArgs` 在 `autonomy` × `readOnly` × `tools` 组合下的完整 `args` 数组做快照，对**旧代码**生成并提交；搬运后必须逐字相同。位置：`test/executors-runtime/args.golden.test.js`。
2. **解析器黄金测试**：`packages/executors/fixtures/*.jsonl` 由 `fake/claude.mjs`、`fake/codex.mjs` 一次性录制；对每行断言 `feed()` 输出与 `finish()` 结果。1A-3 之后增加 `activity` 断言并断言 `{kind,text}` 未变。位置：`test/executors-runtime/parsers.golden.test.js`。
3. **进程层**：`spawnCmd` 的超时、`kill`、`onLine` 分行（含 `\r\n`）、Windows 引号、`CLAUDECODE` 被删除。位置：`test/executors-runtime/process.test.js`。
4. **适配器合规套件**（1A-4，`packages/executors/spec/adapter-compliance.spec.ts`）：对三个适配器都跑——`validateExecutionSpec` 通过后可 `start`；`events` 以结束收尾；`result` 从不 reject；`cancel` 幂等且使 `result.outcome === 'cancelled'`；超时得到 `timed_out`；`read_only` 时不暴露写能力（OpenAI 路径不提供写工具，Claude/Codex 路径传入禁写参数）；`workdir` 取自 `spec`；`activity` → `ExecutorEvent` 的映射与 `commandActivity()` 一致；Claude/Codex 用与 `fake/` 无关的最小内联脚本或夹具驱动，OpenAI 用 `fake/openai-server.mjs`。
5. **workdir 回归**：同一个工作者实例连续对两个不同目录执行，断言各自的 `cwd` / `-C` / `Toolbox` 根目录互不串。位置：`test/executors-runtime/workdir.test.js`。
6. **结构性检查**（纯 JS，随 `npm test` 运行，`test/executors-runtime/structure.test.js`）：
   - `src/workers/*.js` 只含 `export … from`（不含 `class `、`function `、`=>`、`spawn(`）；
   - `src/` 与 `adapters/` 里没有指向 `runtime/` 内部文件的导入（只允许桶文件）；
   - `runtime/` 里没有 import 旧 `src/` 或 npm 包（只允许 `node:*` 与相对的 `runtime/` 内部路径）；
   - `Object.keys(runtime)` 等于 `index.d.ts` 声明的导出清单（R13）；
   - 仓库内只有一处 `spawnCmd` 的定义（防止运行时被复制回 `src/` 或 `desktop/`）。
7. **打包布局验证**：`scripts/verify-packaged-layout.mjs`（§4.2-5），每个涉及导入路径的步骤都运行；CI 中单独一个 job。

### 6.3 数字基线

基线**在实施分支创建时实测并写入 1A-0 的提交说明**，不预设：

- `main`（@ `30ea2b2`）上旧版为 47/50（3 个 Windows 既有失败）；开放中的 PR #2（`chore/ci-cross-platform`）改了 `agent.test.js` / `core.test.js` 并增加 CI，合并后该基线可能变为 50/50。**以实施分支起点的实测为准**。
- 包测试起点 46/46。
- 验收口径：每一步后“旧版通过/失败集合”与起点**完全相同**；若搬运让某个既有失败消失或新增失败，必须在报告里解释，不能默默接受。

---

## 7. 回退策略

1. **分步提交，粒度即回退粒度**：§5 每步一个提交；任何一步验收失败，`git revert` 该提交即回到上一步的绿色状态。
2. **在独立分支实施，PR 内保留每步提交，不 squash**，便于局部回退。
3. **垫片是回退面**：旧版入口始终是 `src/workers/*.js`；最坏情况把某个垫片恢复为原实现（`git revert` 对应步骤），`team.js` 无需改动。
4. **没有运行时开关**（避免双实现长期并存）。基线提交与参数黄金快照作为永久对照。
5. **不可逆项为零**：不改数据格式（日志、`stats.json`、配置文件）、不改界面协议（`emitTask` 的字段）、不碰 SQLite。
6. 桌面打包配置（`extraResources`）与验证脚本在 1A-0 单独提交，可独立回退；因为 1A-0 时旧版尚未依赖 `packages/`，加入该项是无害的。

---

## 8. 已知风险

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | **相对目录布局成为契约**：`src/workers/*.js` → `../../packages/executors/runtime/`；任何一方挪动目录都会让旧版或打包版启动失败 | 启动失败 | `verify-packaged-layout` 与启动冒烟在 CI 中必跑；结构检查测试；文档标注该布局是契约 |
| R2 | **桌面打包**不含 `packages/` | 安装包运行即报模块找不到 | §4.2：`extraResources` 增项 + 打包布局验证 + 发布前 `electron-builder --dir` 人工项 |
| R3 | 搬运改变 Windows 行为（`spawnCmd` 走 shell + `winQuote`；`killTree` 用 `taskkill`） | Windows 回归（用户在 Windows 上） | 1A-1 单独成步；进程层测试在 Windows 上跑；CI 含 Windows |
| R4 | `ExecutionResult.outcome` 需要机器可读结果，而旧结果只有 `ok` + 中文 `error` | 靠文案判断会随本地化失效 | 1A-3 追加 `outcome`（`timed_out`/`cancelled`/`failed`/`succeeded`），由 `r.timedOut`、`r.killed`、`signal` 等原始信号得出 |
| R5 | `BaseWorker.profileFor` 依赖 `models.js`（路由知识） | 运行时反向依赖旧版 | 1A-2 把 `profileFor` 移回旧版（`team.js` 或垫片侧包装）；`models.js` 本身不动 |
| R6 | 活动类型覆盖不全：`warn`（命令失败、错误）与“准备插件”无对应契约类型 | 新事件流少部分信息 | 1A 不扩展契约；错误走 `result.error`；如需要，另提案（`ExecutionActivity` 增加 `warning`） |
| R7 | `ToolGrant` 只有 `id`，旧载荷还需 `command/args/env/native/vision` | 适配器无法启动插件 | 适配器注入 `resolveTool(id)`；不改契约 |
| R8 | 真实 CLI 输出漂移（只有假 CLI 夹具） | 黄金测试只能保证“与现状等价” | 夹具来自现有 `fake/`；真实 CLI 联调列为人工验证项 |
| R9 | `ask()` 不在契约内，但 Coordinator 的规划/会议/汇报都用它 | 误以为抽取后可删 | 明确保留（§3.3） |
| R10 | `fake/common.mjs` 依赖 NiuMa 提示词，包内测试若复用假 CLI 会耦合旧提示词 | 包测试脆弱 | 包内用协议级 `fixtures/*.jsonl` 与最小内联脚本；仅 OpenAI 假服务器（与提示词无关）被复用 |
| R11 | Codex `usage` 键名与界面读的 `usage.in` 不一致（既有行为） | “统一 usage”时顺手改变界面显示 | 只在适配层映射；旧结果保持原样 |
| R12 | 工作者内部集合（`procs`/`aborts`/`children`/`plugins`）按实例共享，`stopAll()` 停掉**所有**运行 | 并发时取消会误伤 | `signal` 提供按次取消；`stopAll()` 保持原语义供旧版使用 |
| R13 | **手写 `index.d.ts` 与 `index.js` 漂移**（D1 的代价：运行时不由 TS 编译，没有自动类型） | 类型与实现不一致，编译通过但运行失败 | 结构检查测试比对导出清单；适配层编译会检查实际使用到的符号 |
| R14 | `runtime/` 在 D1 下**不受 TS 严格检查**（旧 JS 原样搬运） | 缺陷类型无法在编译期发现 | 这是有意的取舍（“不重写已工作的代码”）；以黄金测试和合规套件补偿；是否给运行时加 `// @ts-check` 作为 1A 之后的独立提议 |
| R15 | 适配层使用包名自引用 `@vao/executors/runtime`；某些工具链（旧版打包器、测试加载器）不支持自引用 | 编译或运行时解析失败 | 仅适配层使用（运行于 Node ≥18 的 ESM，支持自引用）；合规套件覆盖；若遇到问题，退路是在适配层使用相对路径加一个构建后重写步骤——**不**退回到复制运行时 |

---

## 9. 明确不做（Non-goals）

- 不重写任何解析器；不改变解析输出中已有的 `kind`/`text`。
- 不重新设计 Coordinator，也不让 Coordinator 使用新适配器（旧版走垫片）。
- 不实现 Scheduler、Execution Policy、重试/修复策略。
- 不引入 SQLite 运行时（`@vao/store` 不被执行器包依赖）。
- 不做 Worktree 执行；`workdir` 仍指向现有项目目录，只是成为调用时输入。
- 不改变执行器行为：命令行参数、沙箱、权限、超时、重试退避、日志格式、成本计算均保持不变。
- 不给根 `npm test` 加构建前置；不让旧版启动依赖 `tsc -b`；不让旧版依赖 `node_modules` 中的工作区链接（D2）。
- 不把运行时复制回 `src/` 或 `desktop/`；不为运行时再维护第二份（单一事实来源）。
- 不迁移 `ask()`；不删除 `check()`；不统一界面里的 token 显示（R11）。
- 不扩展 `ExecutorAdapter` / `ExecutionSpec` / `ToolGrant` / `ExecutionActivity` 契约（如需要，另提案）。
- 不修复 Windows 既有测试失败（与抽取无关；如 PR #2 已处理则以其为准）。
- 不迁移 `fake/` 里的排练配置与 NiuMa 提示词替身；不迁移 `ToolCatalog`、`models.js`、`mcp/desktop.js`。
- 不改 `public/`、`desktop/` 的功能代码（只允许 `desktop/package.json` 的 `extraResources`）。
- 不开始 Stage 1B（办公室渲染器抽取）。

---

## 10. 剩余待确认项

| # | 事项 | 建议 |
| --- | --- | --- |
| B1 | **实施分支与基线**：Stage 0（PR #1）已合并到 `origin/main`；PR #2（`chore/ci-cross-platform`，CI + 修 Windows 测试）仍开放 | 从 `origin/main` 开 `stage-1a/executor-extraction`；**建议先合 PR #2**，这样 1A 的测试基线与 CI 一次到位。若不等 #2，则从 `main` 开分支，之后 rebase |
| B2 | 本计划文档的提交位置 | 单独一个只含本文档的提交，放在 `stage-1a/executor-extraction` 的第一个提交（或在 `main` 上开 docs 小 PR）。**不要**放进 PR #2 |

---

## 结论

**READY_FOR_STAGE_1A_IMPLEMENTATION**（D1–D3 与桌面打包要求均已纳入）

仅剩 B1/B2 两个流程性确认，不阻塞设计。实施的第一步固定为 1A-0：脚手架 + 参数黄金测试 + 打包布局验证，在**未移动任何代码之前**先把安全网建好。
