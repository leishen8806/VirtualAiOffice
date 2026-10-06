# Stage 1B：Tools / MCP 基础设施抽取计划

- 状态：**修订版 r2，架构决策 D1–D5 已批准（冻结）**；尚未实施任何代码
- 基线：`origin/main` @ `075dbb4`（Stage 0、Stage 0.5 CI、Stage 1A 均已合并）
- 产品：Virtual AI Office / 智序工场；旧版称 Legacy NiuMa Runtime（命名规则见 `docs/architecture/product-identity.md`）
- 目标：把可复用的工具 / MCP 基础设施从 Legacy NiuMa 抽到共享包，**旧版继续完整可用**，且只有一份实现

> 本文按**当前仓库实际情况**编写，不沿用早期文档的文件名。需要纠正的几处：
> - `src/toolbox.js` 不存在。`Toolbox`（文件/shell 工具）是 `packages/executors/runtime/openai-worker.js` 里的类，**不属于**本阶段的“工具 / MCP”范畴（它是 OpenAI 兼容执行器的内置函数工具）。
> - `src/tools.js` 才是**插件目录（`ToolCatalog`）**。
> - `src/mcp/client.js` 现在只有一行：`export * from '../../packages/executors/runtime/index.js'`（Stage 1A 垫片，且重新导出了整个运行时，见 §3 的清理项）。真正的 `McpClient` 在 `packages/executors/runtime/mcp-client.js`。
> - `src/mcp/desktop.js`（505 行）仍是完整实现，是一个独立运行的 MCP 服务器。

---

## 0. 已批准的决策（本版新增，冻结）

| 决策 | 结论 | 主要影响 |
| --- | --- | --- |
| **D1** ToolGrant 解析 fail-closed | Stage 1B 中**所有 ToolGrant 都是强制的**，不引入“可选授权”。执行器进程启动**之前**，每个请求的 ToolGrant 必须依次通过：定义查找 → 授权 → 解析 → 必需环境变量校验 → 执行器能力校验 → 视觉需求 → 只读安全要求。任一失败即阻止启动。**任何显式 ToolGrant 都不得被静默丢弃**。机器可读失败码：`TOOL_NOT_FOUND`、`TOOL_NOT_AUTHORIZED`、`TOOL_NOT_SUPPORTED`、`TOOL_ENV_MISSING`、`TOOL_REQUIRES_VISION`、`TOOL_NOT_READ_ONLY_SAFE`、`TOOL_START_FAILED` | §5、§6、§9.1；旧版可把“启动前解析失败”表示为一个普通的失败任务 + 明确的机器可读工具错误；**不重设计旧 Coordinator 状态模型**；未来持久化核心再决定失败变为 `BLOCKED` 还是 `WAITING_HUMAN` |
| **D2** 只读 MCP 策略 | MCP 服务器**默认不是** read-only-safe。工具 / 服务器必须显式声明 `readOnlySafe: true` 才能授予只读 Execution；**默认 `false`**。内置**浏览器 MCP 不是** read-only-safe（同一服务器可以导航、点击、输入、提交表单、登录等，有外部副作用）；内置**桌面控制 MCP 不是** read-only-safe。**1B 不做命令级的动态安全分析**。执行器沙箱的只读模式与外部 MCP 副作用安全是**两个独立控制** | §9.3、§8；未来的只读网页研究应使用显式只读的工具 / 服务，而不是授予完整浏览器 MCP |
| **D3** MCP 自动发现 | **新核心**：对 Claude Code / Codex 中已安装 MCP 的自动发现**默认关闭**（`autoDiscoverExternalMcp = false`），必须由 Workspace Owner 显式启用 / 导入。原因：为 Claude Code 或 Codex 装的工具不等于被 Virtual AI Office / 智序工场授权。**旧版门面**可保留现有发现行为以保持兼容 | §7；“旧版兼容默认值 ≠ 新核心安全默认值”；1B 不删除旧版发现 |
| **D4** 固定 Playwright MCP 版本 | 共享工具定义中**不再**使用 `@playwright/mcp@latest`；使用**显式固定**的、经实施环境验证的版本。**本文不编造版本号**。规则：Playwright MCP 升级需要显式的版本变更 + CI / 回归验证；共享工具包里**不得**出现浮动的 `latest` 依赖 | §8.1、§11、§12（版本在 1B-1 由实施环境选定并验证） |
| **D5** 新核心的工具 / MCP 命名 | 新架构使用中性的逻辑工具 id：**`browser`**、**`desktop-control`**；新的运行时 MCP 服务器标识：**`vao_browser`**、**`vao_desktop`**。旧版兼容门面可映射到 `niuma_browser` / `niuma_desktop`，二者归类为 **`LEGACY_COMPATIBILITY_IDENTIFIER`**。新架构代码不得新增任何 `niuma_*` 标识符 | §5、§8；旧工具 id `desktop` 由门面别名映射到 `desktop-control` |

派生规则（评审时按此检查）：

1. **ToolGrant 保持 `{ id }`，不扩展；没有“可选”语义。**
2. **依赖方向**：`tools → executor 的契约 / 类型`（仅类型，必要时）；**executors 不得 import tools 包**；不得出现运行时循环依赖。
3. 旧版的兼容行为（发现默认开、旧服务器名、旧工具 id `desktop`、旧版只读验收仍能用浏览器等）**只存在于门面**，不渗入共享包的默认值。

---

## 1. 概念边界（本计划的核心）

旧代码把下面五件事都压在一个 `ToolCatalog` 类里。Stage 1B **必须把它们拆开，并且不得再合并回一个目录抽象**：

| 概念 | 回答的问题 | 现在在哪 | 目标归属 |
| --- | --- | --- | --- |
| **ToolDefinition** | 工具**是什么**（id、启动模板、需求、风险属性） | `builtinTools()`、配置里的 `tools`、发现结果，被塞进 `ToolCatalog.tools` Map | `@vao/tools`：`ToolDefinition` + `ToolRegistry` |
| **ToolDiscovery** | 工具**从哪里被发现** | `claudeServers()`、`codexServers()`、配置、内置 | `@vao/tools`：`ToolSource` 提供者（内置 / 配置 / 发现） |
| **ToolGrant** | 一次 Execution **被允许 / 被要求使用**什么（强制） | Task 的 `tools: [id…]`（由规划 LLM 写出，`normalizeTasks` 过滤） | Stage 0 契约已有 `ToolGrant { id }`；授权由 `ToolPolicy` 判定 |
| **ResolvedToolSpec** | 交给执行器的**可移植的执行细节** | `ToolCatalog.spec(id)` + `Coordinator.toolsFor()` 把目录条目与 spec 合并 | `ResolvedToolSpec`（新，通用契约）；由 `ToolResolver` 产生 |
| **ToolExecution** | **谁真正跑**工具 | 执行器：Claude/Codex 通过 CLI 参数注入；OpenAI 路径用 `McpClient` | **留在执行器运行时**（`packages/executors/runtime`），不进工具包 |

目标流程：

```text
Task / Execution
  ↓ ToolGrant { id }                         （强制；不可静默丢弃）
ToolPolicy（授权：安全模式 / 只读 / 接管类）
  ↓
ToolResolver（解析：注册表 + 环境 + 执行器能力，fail-closed）
  ↓ ResolvedToolSpec
Executor Adapter（只消费规格，不做任何发现）
  ↓
MCP / 浏览器 / 桌面控制 / 自定义工具
```

三条硬规则：

1. **ExecutorAdapter 不拥有产品相关的工具发现。** 发现逻辑在 `@vao/tools`，由宿主（旧版门面或未来的新核心）决定是否启用。
2. **工具定义不依赖具体模型厂商。** 今天 `ToolCatalog` 里有 `types: ['claude-cli','codex-cli','openai-api']`、`native: ['claude-cli']`、`supports()` 里的 `group.type !== 'claude-cli'` 都是厂商耦合，目标是用“执行器能力 + 宿主标识”取代（§5.3）。
3. **依赖方向单向**：`@vao/tools` 只在**类型层面**引用 `@vao/executors` 的契约；`@vao/executors`（含适配器与运行时）**不得 import `@vao/tools`**；不允许运行时循环依赖。

---

## 2. 当前依赖图（实测）

```text
src/tools.js (239 行)
  ├─ import ../util.js: fillEnv, isWin, truncate          （util.js 再导出运行时 text/process）
  ├─ re-export ../packages/executors/runtime: describeMcpCall, splitMcpName
  ├─ builtinTools(): 浏览器(npx @playwright/mcp@latest) + 桌面(node + src/mcp/desktop.js)
  ├─ claudeServers(): ~/.claude.json、<项目>/.mcp.json
  ├─ codexServers(): ~/.codex/config.toml（自写 TOML 子集解析）
  └─ ToolCatalog: 配置合并 + 发现 + list/get/resolve/supports/guess/spec

src/team.js
  └─ new ToolCatalog(config, {workdir})；canUse(empId, toolIds)；toolsOf(group)；roster().tools

src/coordinator.js
  ├─ normalizeTasks / pickEmployee: team.tools.resolve(refs)、team.canUse()      ← 规划阶段的“建议”过滤
  ├─ toolsFor(t,g): catalog.get + supports + {…entry, …catalog.spec()}           ← 运行期过滤，见 §2.1 F1
  ├─ introduceTools(): 用户可见提示（takesOver / 浏览器首次下载）
  ├─ 并发规则：`t.tools.includes('desktop')` 同时只允许一个任务（第 524 行，写死旧 id）
  ├─ toolsMessage(): `/工具` 命令
  └─ 浏览器验收：`team.canUse(who,['browser'])`（第 853 行）；验收 / 审查任务以 readOnly 运行

src/prompts.js
  ├─ toolsText(team)：规划提示词里的工具清单（`team.tools.supports(g,t.id)`）
  └─ toolGuide(tools)：按 id 写死的使用提示（browser / desktop）

public/app.js: TOOL_ZH = { browser:'浏览器', desktop:'电脑操作' }（界面显示名）

执行器（Stage 1A 之后在 packages/executors/runtime）：
  base-worker.js     injected(): `t.command && !(t.native||[]).includes(this.type)`   ← 按厂商 type 判断
  cli-workers.js     Claude：--mcp-config 临时文件 + --allowedTools mcp__<server>；Codex：-c mcp_servers.*
  openai-worker.js   startPlugins(): McpClient 启动 → 把 MCP 工具变成函数；启动失败只发 warn 然后继续
  mcp-client.js      McpClient / mcpResult（stdio JSON-RPC）
  format.js          describeMcpCall、splitMcpName（含 BROWSER_ZH / DESKTOP_ZH 展示表，按服务器名正则匹配 /browser|playwright/、/desktop/）
  adapters/*.ts      resolveTool(grant) → Record<string, any>；未解析则 start() 拒绝（Stage 1A 已 fail-closed）

src/mcp/desktop.js (505 行)  自包含的桌面控制 MCP 服务器（零依赖；Windows PowerShell / macOS JXA / Linux xdotool）
fake/                         不涉及工具（假 Claude/Codex/OpenAI 服务器与排练配置）
desktop/package.json          extraResources 复制 ../src → core/src；../packages/executors/runtime → core/packages/executors/runtime
scripts/verify-packaged-layout.mjs   重建 core、启动假 NiuMa、检查 HTTP 200（不涉及工具）
test/tools.test.js            6 个测试（目录、自动发现、桌面插件 MCP 握手与按键映射、参数注入、选人、API 插件）
```

### 2.1 实测中发现的、与“fail-closed”有关的事实

| # | 位置 | 行为 | 性质 | Stage 1B 的处理 |
| --- | --- | --- | --- | --- |
| F1 | `Coordinator.toolsFor()` | 目录里没有或执行器**不支持**的工具被静默丢弃，任务照常运行（没有该工具） | **旧版 fail-open** | **D1：关闭。** 任务已持有的工具授权解析不了 → 任务以明确的机器可读错误失败（§9.1） |
| F2 | `ToolCatalog.resolve(refs)` / `normalizeTasks` | **规划阶段**对 LLM 写出的工具引用做过滤，无法识别的引用被丢弃 | 规划建议，不是授权 | 保持：这是“建议”被规范化的过程；一旦规范化后写入任务的 `tools`，它们就是 ToolGrant，之后不可再被静默丢弃（§9.1） |
| F3 | `OpenAIWorker.startPlugins()` | 某个插件**启动失败**：发一条 `warn`，继续执行（少一个工具） | **运行时 fail-open** | **D1：关闭。** 启动失败 → `TOOL_START_FAILED`，在第一次模型调用之前终止（§9.1） |
| F4 | `fillEnv()` | `${VAR}` 未设置 → 替换成空字符串 | **静默降级** | 新解析器：`TOOL_ENV_MISSING`；旧版其它用途的宽松 `fillEnv` 不变 |
| F5 | `ClaudeCliWorker` / `CodexCliWorker` | 只读（`readOnly`）任务只禁文件写工具；`mcp__<server>` 照样放行 | 授权缺口 | **D2：关闭。** 只读 Execution 只允许 `readOnlySafe:true` 的工具（§9.3） |
| F6 | `Coordinator`（规划） | 工具授权来自规划 LLM 写出的 `tools` 字段，没有独立的授权环节 | 授权边界薄弱 | 1B 不改变旧版；契约声明新架构的授权来源（§9.4） |
| F7 | `supports()` | 视觉需求用 `group.type !== 'claude-cli' && !group.cfg?.vision` 判断 | 厂商硬编码 | 改为 `ExecutorCapabilities.canUseVision`（§5.3） |

---

## 3. 分类表

**KEEP** 原地不动；**MOVE** 逐字搬到共享包（保留 git 历史，不改逻辑）；**REFACTOR** 搬运的同时做最小的、有测试保护的改造；**LEGACY_ONLY** 是旧版专有，留在旧版。

| # | 组件 | 位置 | 分类 | 去向 / 说明 |
| --- | --- | --- | --- | --- |
| 1 | `ToolCatalog`（目录类） | `src/tools.js` | **REFACTOR → 拆分** | 拆成 `ToolRegistry`（定义）+ `ToolSource`（发现）+ `ToolPolicy` + `ToolResolver`，都进 `@vao/tools`；`src/tools.js` 保留一个**同名门面类**，方法面不变（`list/get/resolve/supports/guess/spec`），内部委托给共享包。门面不含解析、TOML、环境展开等实现 |
| 2 | 内置浏览器定义 `builtinTools().browser` | `src/tools.js` | **MOVE + REFACTOR** | 进 `@vao/tools` 的内置来源。逻辑 id `browser`、服务器名 `vao_browser`；**固定 Playwright MCP 版本**（D4）；`platform`、`env`（`DISPLAY`/`WAYLAND_DISPLAY`）、输出目录**作为参数注入**；`readOnlySafe:false`（D2）。旧门面注入 `niuma_browser` 与旧输出目录 |
| 3 | 内置桌面定义 `builtinTools().desktop` | `src/tools.js` | **MOVE + REFACTOR** | 逻辑 id `desktop-control`、服务器名 `vao_desktop`；脚本路径由包自身解析；`ELECTRON_RUN_AS_NODE` 规则随定义走；`readOnlySafe:false`、`requires:['vision']`、`takesOver:true`。旧门面把旧 id `desktop` 别名到 `desktop-control`，并注入 `niuma_desktop` |
| 3b | 桌面 MCP 服务器本体 | `src/mcp/desktop.js` | **MOVE + REFACTOR（极小）** | 进 `packages/tools/servers/desktop.js`；导出 `startDesktopServer()`，`isMain` 守卫保留；`src/mcp/desktop.js` 变成**入口垫片**。`parseKeys`、`winVk` 等导出保持（测试使用）。逐字搬运的文件里仍含 `NIUMA_*` 环境变量名、`niuma-desktop` 的 `serverInfo.name`、`NiumaInput`——这些是**既有的 `LEGACY_COMPATIBILITY_IDENTIFIER`**，不是新增；结构检查对该文件使用显式白名单（§11） |
| 4 | Claude Code MCP 发现 `claudeServers()` | `src/tools.js` | **MOVE** | 进 `@vao/tools` 的发现来源；入参 `{projectDir, home}` |
| 5 | Codex MCP 发现 `codexServers()` + TOML 子集解析 | `src/tools.js` | **MOVE** | 同上；**解析器逐字搬运、不重写** |
| 6 | 用户配置的 MCP 服务器（配置里的 `tools`） | `ToolCatalog` 构造函数 | **MOVE + REFACTOR** | 配置来源；配置格式不变；旧字段 `types/native` 在门面里转换成新字段（§5.3）；配置里的旧 id `desktop` 键继续有效（别名） |
| 7 | ToolGrant 解析 | `Coordinator.toolsFor()` + `ToolCatalog.spec()` + 适配器 `resolveTool` | **REFACTOR → 新建** | 新 `ToolResolver.resolve(grants, ctx)`，fail-closed（D1） |
| 8 | 能力检查 `supports(group,id)` | `ToolCatalog` | **REFACTOR** | 变成解析器的检查项（`ctx.capabilities` + `ctx.executor.toolHost`），不再看 `group.type`；旧门面把 `group` 映射为 `ctx` |
| 9 | 视觉需求 | `supports()`、`tools.vision` | **REFACTOR** | 定义里写 `requires:['vision']`；解析器对照 `ExecutorCapabilities.canUseVision`（Stage 1A 已声明） |
| 10 | 关键词 / 规划匹配 `guess()`、`keywords` | `ToolCatalog` | **LEGACY_ONLY** | 规划器元数据，中文关键词。留在门面（`LEGACY_TOOL_PRESENTATION`），**不进共享定义** |
| 11 | MCP 进程 / 客户端 `McpClient`、`mcpResult` | `packages/executors/runtime/mcp-client.js` | **KEEP** | 已在 Stage 1A 移到运行时；它是**执行**机制，且运行时规则是“零依赖、不 import 其它包”，所以**不**移入工具包；工具包也不依赖它 |
| 12 | 环境展开 `fillEnv` | `runtime/text.js` | **KEEP（运行时）+ 新增** | 运行时保留宽松版；`@vao/tools` 新增**严格版** `expandEnv`，缺失变量 → `TOOL_ENV_MISSING`（§9.5） |
| 13 | 工具授权边界 | 分散在 `normalizeTasks`、`supports`、`autonomy==='safe'` 删除桌面工具、`introduceTools` 提示 | **REFACTOR** | 集中到 `ToolPolicy`（§9） |
| 14 | 桌面相关路径 | `HERE`/`src/mcp/desktop.js`、`~/.niuma/browser`、`process.execPath` | **REFACTOR** | 包内相对路径解析；旧输出目录由旧门面注入；Electron 规则保留 |
| 15 | Electron 打包行为 | `desktop/package.json#extraResources` | **REFACTOR** | 新增 `../packages/tools` → `core/packages/tools`；沿用 Stage 1A 的“相对路径布局即契约”（§10） |
| 16 | 测试 | `test/tools.test.js` | **KEEP + 扩充** | 旧测试**原样**经门面运行（行为守护）；新测试写成纯 JS 放根 `test/`，无需构建（§11） |
| 17 | Legacy NiuMa 耦合 | `team.js`、`coordinator.js`、`prompts.js`、`public/app.js`、README | **KEEP**（经门面不变） | Coordinator 不重写；只允许对 `toolsFor` 做 D1 批准的最小改动（§9.1） |
| 18 | 展示表 `describeMcpCall`（`BROWSER_ZH`/`DESKTOP_ZH`） | `runtime/format.js` | **KEEP** | 展示层，已在运行时；机器语义不得依赖它。正则 `/browser|playwright/`、`/desktop/` 同样匹配 `vao_browser`、`vao_desktop`，无需改动 |
| 19 | `src/mcp/client.js` 垫片 | `src/mcp/client.js` | **REFACTOR（清理）** | 现在 `export *` 整个运行时；改为只重新导出 `McpClient`、`mcpResult` |
| 20 | `public/app.js` 的 `TOOL_ZH`、`prompts.js` 的 `toolGuide` | 旧界面 / 旧提示词 | **LEGACY_ONLY** | 显示名与提示词文案留在旧版，不进共享包 |

---

## 4. 目标包结构

沿用 Stage 1A 的决定：**可直接执行的 ESM JavaScript，不依赖 TypeScript 构建**，旧版靠相对路径导入；类型用手写 `.d.ts`；通用契约用 TS。

```text
packages/tools/                         # 新包 @vao/tools（private）
├── package.json                        # exports: "." → runtime/index.js（无需构建）
├── runtime/                            # 可直接执行的 ESM JS（单一事实来源）
│   ├── index.js                        # 唯一对外入口（桶文件）
│   ├── index.d.ts                      # 手写类型声明（类型引用 @vao/executors 的契约；仅 import type）
│   ├── definition.js                   # normalizeToolDefinition / 校验（readOnlySafe 默认 false）
│   ├── registry.js                     # ToolRegistry：add / list / get / lookup（id、名称、server 名、宿主提供的别名）
│   ├── sources/
│   │   ├── builtin.js                  # browser、desktop-control 的定义（环境以参数注入；固定版本常量）
│   │   ├── config.js                   # 用户配置的工具
│   │   ├── claude-code.js              # claudeServers()
│   │   └── codex.js                    # codexServers() + TOML 子集解析
│   ├── policy.js                       # ToolPolicy：授权判定（安全模式 / 只读 / 接管类 / 禁用）
│   ├── resolver.js                     # ToolResolver：Grant → ResolvedToolSpec（fail-closed）
│   └── env.js                          # expandEnv（严格）
├── servers/
│   └── desktop.js                      # 桌面控制 MCP 服务器（自 src/mcp/desktop.js 搬来）
└── tsconfig.json                       # 仅用于校验 index.d.ts 能通过编译（纳入 tsc -b）
```

`@vao/executors` 的**加性**变更（TS，**不引入**对 `@vao/tools` 的依赖）：

```text
packages/executors/src/contract.ts      # 新增类型：ResolvedToolSpec、ToolResolver、ToolResolutionContext、
                                        #           ToolResolution、ToolResolutionFailure、ToolFailureCode
packages/executors/src/adapters/*.ts    # 选项 resolveTool → toolResolver；传入执行器上下文
packages/executors/runtime/*            # 可选 strictTools（见 §9.1）；preloaded 的工具不再注入
```

依赖方向（单向、无环）：

```text
@vao/domain
   ▲
@vao/executors （契约 + 适配器 + runtime）     ← 定义 ResolvedToolSpec / ToolResolver 接口；不 import @vao/tools
   ▲  仅类型（import type）
@vao/tools     （注册表 / 发现 / 策略 / 解析器 / 内置工具 / 桌面服务器）
   ▲  相对路径导入
旧 NiuMa：src/tools.js（门面）、src/mcp/desktop.js（入口垫片）、src/team.js、src/coordinator.js
```

约束：
- `@vao/tools/runtime` **零运行时依赖**（只用 `node:*`），**不** import 旧 `src/`、`@vao/executors/runtime`、`@vao/domain`；其 `.d.ts` 对 `@vao/executors` 只用 `import type`；
- `@vao/executors` **任何文件**都不 import `@vao/tools`（结构检查，§11）；
- 工具包**从不启动工具进程**（发现只读配置文件；启动属于执行器）；
- 工具包里**没有本地化文案**（中文显示名、关键词、`toolGuide` 留在旧门面），**没有新增的 `niuma_*` 标识符**（唯一例外是逐字搬运的桌面服务器文件中既有的兼容标识符，白名单管理）。

---

## 5. 公开契约

### 5.1 在 `@vao/executors` 中定义（执行器消费的通用边界）

```ts
// Stage 0 已有，保持不变：ToolGrant 是强制的，没有可选语义
export interface ToolGrant { readonly id: string }

/** 交给执行器的可移植执行细节。env 含展开后的明文值，视为敏感数据（§9.5）。 */
export interface ResolvedToolSpec {
  readonly id: string                        // = ToolGrant.id（逻辑 id，如 'browser'、'desktop-control'）
  readonly server: string                    // MCP 服务器标识（执行器侧命名空间，如 'vao_browser'）
  readonly title: string                     // 展示用，中性英文；界面自行本地化
  readonly description: string
  readonly delivery: 'inject' | 'preloaded'  // inject：执行器自己启动；preloaded：宿主已加载，只需放行
  readonly command?: string                  // delivery = 'inject' 时必有
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly requires: readonly ('vision' | 'mcp')[]   // 能力需求
  readonly readOnlySafe: boolean             // 是否可授予只读 Execution（默认 false）
  readonly takesOver: boolean
  readonly exclusive: boolean
  readonly hostBinding: { readonly hostBound: readonly string[] }   // 已在哪些宿主原生加载（'claude-code' / 'codex'）
}

export interface ToolResolutionContext {
  readonly executor: { readonly id: string; readonly toolHost?: string }   // toolHost：执行器自己读取其 MCP 配置的宿主
  readonly capabilities: ExecutorCapabilities
  readonly access: 'read_only' | 'read_write'
  readonly autonomy?: 'full' | 'safe'
}

/** 机器可读失败码（D1）。人类可读文案由调用方本地化，不得用文案判断状态。 */
export type ToolFailureCode =
  | 'TOOL_NOT_FOUND'          // 定义查找失败
  | 'TOOL_NOT_AUTHORIZED'     // 授权失败（被禁用、安全模式、策略拒绝）
  | 'TOOL_NOT_SUPPORTED'      // 解析 / 能力校验失败（无法启动、执行器不支持 MCP、宿主不匹配）
  | 'TOOL_ENV_MISSING'        // 必需环境变量缺失
  | 'TOOL_REQUIRES_VISION'    // 需要视觉而执行器不具备
  | 'TOOL_NOT_READ_ONLY_SAFE' // 只读 Execution 请求了非 readOnlySafe 的工具
  | 'TOOL_START_FAILED'       // 工具进程 / 服务器启动失败（运行时检测到）

export interface ToolResolutionFailure { readonly grantId: string; readonly code: ToolFailureCode; readonly detail?: string }

export type ToolResolution =
  | { readonly ok: true; readonly tools: readonly ResolvedToolSpec[] }
  | { readonly ok: false; readonly failures: readonly ToolResolutionFailure[] }

export interface ToolResolver {
  resolve(grants: readonly ToolGrant[], context: ToolResolutionContext): ToolResolution
}
```

`ToolResolution` 中 `ok:true` 的 `tools` **必须与请求的 grants 一一对应**（数量与 id 都相同）；这是“显式 ToolGrant 不被静默丢弃”的契约级保证，由解析器合规测试逐项验证。

### 5.2 在 `@vao/tools` 中定义

```ts
interface ToolDefinition {
  id: string                                // 中性稳定逻辑 id：'browser'、'desktop-control'、发现到的服务器名
  title: string
  description: string
  server: string                            // 新核心默认：'vao_browser' / 'vao_desktop'；发现 / 配置的工具 = 其服务器名；旧版门面可覆盖为 niuma_*
  command?: string; args: string[]; env: Record<string, string>   // env 值可含 ${VAR}（必需，缺失即失败）
  requires: ('vision' | 'mcp')[]
  readOnlySafe: boolean                     // 默认 false；必须显式声明 true 才可用于只读 Execution
  takesOver: boolean; exclusive: boolean
  origin: { kind: 'builtin' | 'config' | 'discovered'; host?: 'claude-code' | 'codex' }
  hostBound: string[]                       // 已被这些宿主原生加载（取代 `native`）
  portable: boolean                         // 是否有 stdio 启动命令，可借给任何执行器（取代 `types` 对远程插件的限制）
  enabled: boolean
}

interface ToolSource { id: string; load(env: { projectDir?: string; home?: string; platform?: string; env?: Record<string, string | undefined> }): ToolDefinition[] }
interface ToolRegistryOptions { aliases?: Record<string, string> }   // 宿主提供的别名，如旧版 { desktop: 'desktop-control' }
class ToolRegistry { add(def); list(); get(id); lookup(ref) /* id | 别名 | 名称 | server 名，不区分大小写 */ }
interface ToolPolicy { authorize(def: ToolDefinition, ctx: ToolResolutionContext): { ok: true } | { ok: false; code: ToolFailureCode } }
class ToolResolver implements ToolResolver { constructor(registry, policy, options?: { env?: Record<string, string | undefined> }) }
```

- 发现到的 / 配置声明但未写 `readOnlySafe` 的工具一律为 `false`（D2）。
- 别名属于**宿主提供的兼容数据**，不写进共享定义；共享包里不出现旧 id `desktop` 作为别名。

### 5.3 厂商耦合的替换对照

| 旧（厂商耦合） | 新（中性） |
| --- | --- |
| `types: ['claude-cli','codex-cli','openai-api']` | 删除；可用性由 `portable` + `hostBound` + `requires` 决定 |
| `native: ['claude-cli']` | `hostBound: ['claude-code']`；执行器声明自己的 `toolHost`（Claude 适配器 = `claude-code`，Codex = `codex`，OpenAI 兼容 = 无） |
| `supports()`：`t.vision && type !== 'claude-cli' && !cfg.vision` | `requires:['vision']` 对照 `capabilities.canUseVision`（Claude 适配器 `true`、Codex `false`、OpenAI 兼容取 `cfg.vision`——Stage 1A 已如此声明） |
| `BaseWorker.injected()` 按 `this.type` 过滤 | 由解析器给出 `delivery`（`preloaded` 的不再注入）；旧执行器路径通过门面把 `worker.type` 映射为 `toolHost` |
| 远程（http/sse）插件“只有装它的那个组能用” | `portable:false` + `hostBound:[host]`：仅 `executor.toolHost` 匹配时解析为 `preloaded`，否则 `TOOL_NOT_SUPPORTED` |
| 旧工具 id `desktop`、服务器名 `niuma_browser` / `niuma_desktop` | 新核心：`desktop-control`、`vao_browser` / `vao_desktop`；旧版门面别名 / 覆盖（`LEGACY_COMPATIBILITY_IDENTIFIER`） |

---

## 6. ToolGrant → ResolvedToolSpec 流程（D1）

**所有 ToolGrant 都是强制的。** 解析发生在**任何执行器进程启动之前**。对每个 grant，按以下顺序检查，**第一个失败的检查决定该 grant 的失败码**；所有 grant 都会被检查，所有失败**一次性全部列出**：

| 顺序 | 检查 | 失败码 |
| --- | --- | --- |
| 1 | **定义查找**：`registry.lookup(grant.id)` | `TOOL_NOT_FOUND` |
| 2 | **授权**：定义已启用；`ToolPolicy` 允许（安全模式、接管类、策略） | `TOOL_NOT_AUTHORIZED` |
| 3 | **解析**：可启动（有 `command`）或宿主已加载；`ctx.executor` 支持 MCP | `TOOL_NOT_SUPPORTED` |
| 4 | **必需环境变量校验**：定义里引用的每个 `${VAR}` 都必须存在 | `TOOL_ENV_MISSING` |
| 5 | **执行器能力校验**：`portable` / `hostBound` 与 `ctx.executor.toolHost`、`capabilities.canUseMcp` 匹配 | `TOOL_NOT_SUPPORTED` |
| 6 | **视觉需求**：`requires:['vision']` 对照 `capabilities.canUseVision` | `TOOL_REQUIRES_VISION` |
| 7 | **只读安全**：`ctx.access === 'read_only'` 时要求 `readOnlySafe === true` | `TOOL_NOT_READ_ONLY_SAFE` |

```text
1. 调用方（编排层 / 旧门面）构造 ToolGrant[]（只有 id；强制）。
2. 适配器 start(spec)：
     validateExecutionSpec()                 // Stage 1A：有 tools 必须 canUseMcp
     resolution = toolResolver.resolve(spec.tools, { executor:{id,toolHost}, capabilities, access, autonomy })
3. 任何失败 → ok:false，列出全部 failures；适配器拒绝 start()：
     在拉起任何进程、创建任何临时文件**之前**抛出带 failures 的错误。**绝不**在“少一个工具”的情况下继续。
4. 全部成功 → ok:true，tools.length === grants.length，且 id 一一对应。
5. 适配器把 ResolvedToolSpec[] 交给运行时工作者（Claude：--mcp-config；Codex：-c；OpenAI：McpClient）。
6. 运行时启动阶段：工具 / 服务器启动失败 → TOOL_START_FAILED（strictTools，§9.1）。
```

**发现的时机**：发现结果是调用时输入，不是对象的永久状态。今天 `ToolCatalog` 在构造时用 `workdir` 做一次发现并永久持有（Claude 的 project 作用域取决于 `workdir`）。`ToolSource.load({projectDir, home, …})` 每次由宿主显式调用；旧版门面在 `Team` 构造时调用一次（保持旧行为），新核心可以按项目 / 按执行调用。

**失败如何呈现**：
- **新路径（适配器）**：`start()` 拒绝，错误对象携带 `failures`（机器可读）。
- **旧版（Coordinator）**：任务以普通的 `failed` 状态结束，`t.error` 以稳定的失败码开头（例如 `TOOL_NOT_SUPPORTED: desktop-control`），明确、机器可读；**不新增任务状态、不改任务字段结构**。之后沿用旧版现有的“失败 → 移交他人”逻辑（`handOff` 会重新用 `canUse` 选择能用该工具的人）。
- **未来持久化核心**：由它决定工具解析失败变成 `BLOCKED` 还是 `WAITING_HUMAN`；本阶段**不决定**。

---

## 7. MCP 发现策略（D3）

| 来源 | 内容 | 规则 |
| --- | --- | --- |
| 内置（builtin） | `browser`、`desktop-control` | 始终可注册；`enabled` 可由配置关闭 |
| 配置（config） | 用户在配置 `tools` 里声明的 stdio 插件 | 只接受 `command` 为字符串的 stdio 定义；格式不变；未声明 `readOnlySafe` 则为 `false` |
| Claude Code | `~/.claude.json` 的用户级 + 项目本地 `mcpServers`；`<项目>/.mcp.json`（仅当用户已批准 / `enableAllProjectMcpServers`） | 标记 `origin.host='claude-code'`、`hostBound=['claude-code']`；`readOnlySafe:false` |
| Codex | `~/.codex/config.toml` 的 `[mcp_servers.<name>]`（含 `.env` 子表，仅简单值） | 同上，宿主 `codex` |
| 同名合并 | 内置 / 配置优先；同一服务器被两个宿主都装 → 合并 `hostBound` | 与旧行为一致（有现成测试） |

**默认值——两套，必须区分：**

| | 默认 | 谁决定 |
| --- | --- | --- |
| **新核心（安全默认）** | `autoDiscoverExternalMcp = false`。**必须由 Workspace Owner 显式启用 / 导入** | 新核心的 Workspace 设置 |
| **Legacy NiuMa 门面（兼容默认）** | 保持现状：默认发现；配置 `tools.discover:false` 可关闭 | 旧版配置 |

**Legacy compatibility default ≠ New core security default。** 原因：为 Claude Code 或 Codex 安装的工具，**不等于**被 Virtual AI Office / 智序工场授权。即使在新核心中被显式启用，**发现 / 导入也不等于授权**：被导入的定义仍然需要有 ToolGrant 才能使用，并且默认 `readOnlySafe:false`。1B **不删除**旧版发现。

约束：
- 发现**只读取配置文件**，不启动任何进程，不写入 Claude Code / Codex 自己的设置。
- TOML 解析器**逐字搬运**，只支持简单值；复杂配置（数组嵌套表、多行字符串）仍然忽略该服务器——**已知限制**，不在 1B 修。
- 读取他人应用的配置属于隐私敏感行为：新核心默认关闭；发现到的条目只向规划器暴露 id / 名称，**不暴露 `env` 的值**。

---

## 8. 内置工具

### 8.1 浏览器（`browser`）

- 逻辑 id：`browser`；MCP 服务器标识：`vao_browser`；`readOnlySafe: false`（D2）。
- 启动：`npx -y @playwright/mcp@<固定版本> --output-dir <dir> --allow-unrestricted-file-access [--headless]`；Windows 用 `cmd /c npx …`（Claude Code / Codex 不经 shell 启动 MCP 服务器）。
- **固定版本（D4）**：共享定义中**不得**出现 `@latest`，也不得出现任何浮动标签 / 范围。具体版本号**不在本文中规定**：由 1B-1 的实施环境选定、验证（至少完成 MCP `initialize` + `tools/list` 回归），并作为单一常量写入内置定义。**升级 Playwright MCP 需要显式的版本变更 + CI / 回归验证**；结构测试禁止共享包里出现 `@latest`。
- 参数化：`platform`、`env`（Linux 无显示时 `--headless`）、`outputDir` 作为入参。
- **只读含义（D2）**：浏览器**不是** read-only-safe。同一个 MCP 服务器可以导航、点击、输入、提交表单、登录并产生其它外部副作用；1B **不做**命令级的动态安全分析。未来的只读网页研究应使用显式只读的工具 / 服务，而不是授予完整浏览器 MCP。
- 旧版门面：注入 `niuma_browser` 服务器名与 `~/.niuma/browser` 输出目录（`LEGACY_COMPATIBILITY_IDENTIFIER`）；**因为单一来源，旧版也将使用同一个固定版本**——这是对旧版的一处有意的行为变化（不再自动跟随 `latest`），需要在发布说明里写明；首次使用仍会通过 `npx -y` 下载（固定版本），这一点不变。
- 已知风险：`npx -y` 首次自动下载（供应链）与 `--allow-unrestricted-file-access` 允许 `file://`；1B 不改变这两点，只在风险表中记录。

### 8.2 桌面控制（`desktop-control`）

- 逻辑 id：`desktop-control`；MCP 服务器标识：`vao_desktop`；`requires:['vision']`；`takesOver:true`、`exclusive:true`、`readOnlySafe:false`（D2）。
- 启动：`process.execPath` + 包内 `servers/desktop.js`；Electron 下加 `ELECTRON_RUN_AS_NODE=1`（Electron 的 `process.execPath` 是 Electron 本身）。
- 服务器本体 MOVE：保持零依赖，保持 `NIUMA_DESKTOP_PLATFORM`、`NIUMA_SCREEN_MAX_WIDTH`（`KEEP_TEMPORARILY`；增加 `VAO_*` 别名属于后续的改名任务，不在 1B）。`serverInfo.name` 仍为 `niuma-desktop`（既有兼容标识符，信息性字段）。
- 入口垫片：`src/mcp/desktop.js` 必须**真的启动服务器**（旧测试和旧配置按文件路径启动它），不能只是 `export *`——服务器靠 `isMain` 判断是否监听 stdin；这就是需要导出 `startDesktopServer()` 的原因（唯一的 REFACTOR）。
- **旧 id 别名**：旧配置 / 旧任务 / 规划提示词 / 界面 / Coordinator 并发规则（第 524 行）都使用 `desktop`。旧门面通过别名 `{ desktop: 'desktop-control' }` 保持这些继续工作（包括配置里的 `tools.desktop.enabled:false`）；1B **不改 Coordinator**。
- 独占性：定义里的 `exclusive` 是给将来的调度器用的数据；旧门面继续暴露 `takesOver`。
- 不是 read-only-safe：桌面控制接管鼠标键盘，任何只读 Execution 都不得授予。

---

## 9. 安全边界

不重新设计整体安全模型；把现有行为**写清楚**，并按 D1–D3 关闭 fail-open。

### 9.1 Fail-closed 规则（D1）

- **ToolGrant 都是强制的**；**任何显式 ToolGrant 都不得被静默丢弃**。在执行器进程启动前，每个 grant 通过 §6 的七项检查，任一失败都阻止启动。
- **新路径（适配器 + `ToolResolver`）**：失败 → `start()` 拒绝，`failures` 为机器可读失败码；有测试证明没有进程被拉起、没有临时文件被创建。
- **旧版（门面 + Coordinator）**：
  - `Coordinator.toolsFor()`（F1）改为：任务持有的工具授权，若解析不了（目录没有、执行器不支持、需要视觉但不具备、环境变量缺失…）→ **该任务以普通失败任务结束**，`t.error` 以机器可读失败码开头（如 `TOOL_REQUIRES_VISION: desktop-control`），**不再静默缺工具运行**。这是对 `toolsFor` 的**唯一**一处最小改动；**不重新设计 Coordinator 状态模型**，不新增状态。
  - 规划阶段的过滤（F2，`normalizeTasks` / `resolve`）保持不变：它处理的是 LLM 的“建议”，规范化之后写入任务的 `tools` 才是 ToolGrant。
- **工具启动失败（F3）**：运行时新增 `strictTools`，**默认 `true`**：`OpenAIWorker.startPlugins()` 中任一插件启动失败 → 在第一次模型调用之前以 `TOOL_START_FAILED` 终止（`outcome:'failed'`，错误以失败码开头）。`startPlugins` 发生在模型循环之前，所以这仍属于“执行前失败”。
- **已知限制**：Claude Code / Codex 路径中，MCP 服务器由 CLI 自己启动，启动失败发生在 CLI 内部，**我们观察不到**；CLI 可能在缺少该服务器的情况下继续。1B 无法为这两个宿主保证 `TOOL_START_FAILED`，记入风险表（R16）。解析阶段的 fail-closed 对三类执行器都成立。

### 9.2 授权（Authorization）

- 判定集中在 `ToolPolicy.authorize(def, ctx)`；输入：工具属性、`ctx.access`、`ctx.autonomy`。
- 授权**不是**路由：模型路由 / 选人（`pickEmployee`、`fitScore`、`models.js`）**不进入工具包**。

### 9.3 只读（read-only）策略（D2）

- **MCP 服务器默认不是 read-only-safe**：定义必须显式声明 `readOnlySafe: true`，才能被授予 `access:'read_only'` 的 Execution；默认 `false`。
- **内置浏览器 MCP：`readOnlySafe:false`。** **内置桌面控制 MCP：`readOnlySafe:false`。**
- 1B **不做**命令级 / 动态安全分析（不尝试判断某次 `browser_navigate` 或 `click` 是否“安全”）。
- 只读 Execution 申请了非 `readOnlySafe` 的工具 → `TOOL_NOT_READ_ONLY_SAFE`，不启动。
- **两个独立的控制**（文档必须分别说明）：
  1. **执行器沙箱的只读模式**：约束文件系统写入（Claude 的 `--disallowedTools`、Codex 的 `-s read-only`、OpenAI `Toolbox` 的 `readOnly`）；
  2. **外部 MCP 副作用安全**：由 `readOnlySafe` 表达。沙箱只读**不**意味着 MCP 没有外部副作用（F5）。
- **旧版例外（兼容，需明确标注）**：Legacy NiuMa 的验收 / 审查任务以 `readOnly` 运行，且验收员依赖浏览器测试网页（第 853 行）。旧门面的**兼容模式**保持这一行为，**不**对旧版的只读运行套用 `TOOL_NOT_READ_ONLY_SAFE`；这是“Legacy 兼容默认 ≠ 新核心安全默认”的又一例。新核心若需要只读网页研究，应使用显式只读的工具 / 服务，这属于后续工作（§15）。

### 9.4 授权来源

现状（F6）：任务的 `tools` 来自规划 LLM 的输出，经 `normalizeTasks` 过滤为已知 id；模型输出直接决定工具授权，桌面控制只靠提示词劝阻和一条用户可见提示。1B 不改变旧版这一点，但在契约里把来源说清楚：**新架构中，ToolGrant 必须来自 Role / Execution Policy（经人批准的配置），不是直接来自模型输出**；`ToolPolicy` 是最后一道检查，不是授权来源。

### 9.5 环境变量与密钥

- `ResolvedToolSpec.env` 是展开后的明文，**视为敏感**：不得写入事件、日志、活动流、提示词。提供 `redactToolSpec()`，测试断言脱敏后序列化不含值。
- **严格展开**：定义里引用的 `${VAR}` 缺失 → `TOOL_ENV_MISSING`（第 4 项检查），**不再**像 `fillEnv` 那样静默替换为空字符串。
- 已知残留风险（1B 不处理，记录）：Claude 路径把 env 写入 `os.tmpdir()` 下的临时 `--mcp-config` 文件（运行后删除）；Codex 路径通过 `-c mcp_servers.<x>.env={…}` 命令行参数传递（进程列表可见）。

### 9.6 安全模式（`autonomy: 'safe'`）

- 现状：目录构造时在安全模式下**直接删除**桌面工具（不会被列出、规划或授权）。
- 1B：旧门面保持这一行为（不注册）；`ToolPolicy` 另对 `takesOver` 工具返回 `TOOL_NOT_AUTHORIZED`（纵深防御）。

### 9.7 危险的桌面控制

- 属性：`takesOver`、`exclusive`、`requires:['vision']`、`readOnlySafe:false`。
- 旧版已有的缓解：用户可见提示（`introduceTools`）、`/stop`、安全模式不提供、并发限制。1B 保持这些；不新增人工审批（属于后续阶段的授权设计）。

---

## 10. 打包（桌面 / Electron）

- `desktop/package.json#extraResources` 增加：
  `{ "from": "../packages/tools", "to": "core/packages/tools", "filter": ["**/*.js", "**/*.d.ts"] }`
  （包含 `runtime/` 与 `servers/`；不复制 `spec`、`tsconfig`）。
- 目录布局在源码与 `core/` 里一致，旧门面通过相对路径 `../packages/tools/runtime/index.js` 导入；桌面服务器路径由包内 `new URL('../servers/desktop.js', import.meta.url)` 解析，在 `core/packages/tools/servers/desktop.js` 同样成立。
- 根 `package.json#files`（npm 发布）增加 `packages/tools/runtime`、`packages/tools/servers`。
- `desktop.yml` 里 `npm test`（根）**不带依赖安装**运行（只对 `desktop/` 做 `npm ci`），所以：根测试不得需要 `node_modules`、不得需要 `tsc`。
- **打包布局验证扩展**（`scripts/verify-packaged-layout.mjs`）：除现有的“启动假 NiuMa 并拿到 HTTP 200”，增加：在重建的 `core/` 里用 `process.execPath` 启动桌面服务器入口，发 MCP `initialize` + `tools/list`，断言返回 9 个桌面工具（与现有测试一致）；并断言 `core/` 内只有一份桌面服务器实现。这样“桌面插件路径在打包布局里确实可用”被真实运行验证，而不只是检查文件存在。
- Electron 专有的 `ELECTRON_RUN_AS_NODE` 路径无法在 CI 里直接验证 → 发布前人工项（`electron-builder --dir` 打目录版，运行排练模式，并让一个任务使用桌面工具的 `tools/list`）。

---

## 11. 测试计划

原则（沿用 Stage 1A）：运行时是纯 JS，**根 `npm test` 不需要构建**；只有通用契约与适配器测试进 `packages/executors/spec`（TS）。

| 类别 | 内容 | 位置 |
| --- | --- | --- |
| 行为守护（先写） | **在搬运之前**对旧 `ToolCatalog` 生成黄金快照：`list()`、`supports()` 矩阵（claude/codex/openai × 有无视觉 × 内置/发现/远程）、`resolve()` 引用、`spec()`（含 `${VAR}`）、Windows / Linux / 无显示三种平台下的浏览器 `command/args`（**版本字段除外**：固定版本是有意变化）、安全模式 | `test/tools-package/catalog.golden.test.js`（纯 JS） |
| 旧测试原样通过 | `test/tools.test.js` 6 个测试不改，经门面运行（旧 id `desktop`、`niuma_desktop` 服务器名、`niuma_browser`） | 现有 |
| 注册表 / 来源 | 去重与合并、`enabled:false`、配置格式、`hostBound` 合并、宿主别名（`desktop` → `desktop-control`） | `test/tools-package/registry.test.js` |
| 发现 | Claude JSON（用户级、项目本地、`.mcp.json` 批准规则）、Codex TOML（引号、子表、内联表、注释、复杂值被忽略）、远程插件 `portable:false`；**新核心默认 `autoDiscoverExternalMcp=false` 时不读取任何外部配置文件**（用假 `home` 里放文件并断言未被读取）；旧门面默认仍发现 | `test/tools-package/discovery.test.js` |
| 解析器（fail-closed） | 七个失败码**每个至少一个用例**；**多个失败一次性全部列出**；部分成功 + 部分失败 = 整体失败；`ok:true` 时 `tools` 与 grants 一一对应（**不可静默丢弃**）；检查顺序（例如缺定义先于缺环境变量） | `test/tools-package/resolver.test.js` |
| 只读策略 | 默认 `readOnlySafe=false`；内置 `browser`、`desktop-control` 均为 `false`；只读 + 浏览器 → `TOOL_NOT_READ_ONLY_SAFE`；显式 `readOnlySafe:true` 的自定义工具被接受；沙箱只读与 MCP 副作用互相独立（文档化断言） | 同上 |
| 内置定义 | 平台 / 环境注入（win32 `cmd /c npx`、Linux 无 `DISPLAY` → `--headless`）；桌面的 `ELECTRON_RUN_AS_NODE`；**Playwright 版本固定**：结构测试断言内置定义里没有 `@latest`、没有浮动标签 / 范围，且版本字符串是精确版本；**新核心默认服务器名为 `vao_browser` / `vao_desktop`、逻辑 id 为 `browser` / `desktop-control`** | `test/tools-package/builtin.test.js` |
| 命名 | 共享包（除白名单的桌面服务器文件外）不含新增的 `niuma_*` / `niuma-` 标识符；旧门面把 `vao_*` 映射为 `niuma_*` | `test/tools-package/structure.test.js` |
| 脱敏 | `redactToolSpec()` 之后序列化不含 env 值；活动流 / 日志 / 事件不含 env 值 | `test/tools-package/redaction.test.js` |
| 桌面服务器 | `parseKeys`、`winVk`、MCP 握手（现有测试迁入，路径通过入口垫片仍可用） | 沿用 `test/tools.test.js` + 新增“包内路径”断言 |
| 适配器集成 | 三个适配器配 `toolResolver`：不可解析 → `start()` 在拉起进程**之前**拒绝（有捕获文件断言，且无临时文件）；需要视觉的工具遇到非视觉适配器 → `TOOL_REQUIRES_VISION`；`preloaded` 的工具不被注入；OpenAI 路径插件启动失败 → `TOOL_START_FAILED` 且**没有发起过模型请求**；只读 Execution 请求浏览器 → `TOOL_NOT_READ_ONLY_SAFE` | `packages/executors/spec/tool-resolution.spec.ts` |
| 旧版任务失败呈现 | 旧门面 + Coordinator：持有的工具解析不了 → 任务 `failed`，`t.error` 以失败码开头；没有“少一个工具继续跑”；`handOff` 到能用该工具的人时仍可成功 | `test/tools-package/legacy-toolsfor.test.js`（使用排练配置） |
| 契约类型 | `index.d.ts` 与 `index.js` 导出一致；`tsc -b` 校验 `.d.ts` | 结构测试 |
| 依赖方向 | `packages/executors` 下没有任何文件 import `@vao/tools` 或指向 `packages/tools` 的路径；`@vao/tools/runtime` 只 import `node:*` 与自身；`tools` 对 executors 只有 `import type` | `test/tools-package/structure.test.js` |
| 单一实现 | `src/tools.js` 不含 `readFileSync`、TOML 解析、`fillEnv`（只剩门面）；仓库里只有一处 `claudeServers` / `codexServers` / 桌面服务器实现 | 同上 |
| Playwright 回归 | 固定版本的 MCP `initialize` + `tools/list` 握手（需要网络，作为独立 CI 步骤；版本变更必须同时修改常量与该回归） | CI（具体机制在实施时确定） |
| 打包 | §10 的扩展验证；CI 的 Ubuntu + Windows 都跑 | `npm run verify:packaged-layout`（已在 `test:all` 中） |

数字基线：以**实施分支起点实测**为准（当前 `main` 的 `npm test` / `test:packages` 通过数在 1B-0 的提交说明里记录）；每步结束“通过 / 失败集合”与起点完全相同，**有意的行为变化除外**，且必须逐项在 PR 中列出（固定 Playwright 版本、`toolsFor` 失败呈现、OpenAI 插件启动失败）。

---

## 12. 迁移顺序

每一步一个独立提交；每步后 `npm test`、`npm run test:packages`、`npm run verify:packaged-layout` 与起点结果一致（有意行为变化除外，见 §11）。

| 步骤 | 内容 | 性质 |
| --- | --- | --- |
| **1B-0** | 脚手架：`packages/tools`（空桶文件、`package.json`、`tsconfig` 仅校验 `.d.ts`）；`desktop/package.json` 增加 `extraResources` 项与根 `files`；**先写并提交 `ToolCatalog` 黄金快照**（对旧代码生成） | 脚手架 + 安全网 |
| **1B-1** | 搬 `claudeServers` / `codexServers`（含 TOML 解析器，逐字）与内置浏览器 / 桌面**定义**到 `packages/tools`（环境改为参数注入；新核心默认 id / 服务器名；旧门面注入旧名与别名）；**在实施环境选定并验证固定的 Playwright MCP 版本**，写成单一常量，更新黄金快照中的版本字段；`src/tools.js` 改为门面，委托共享包；`src/mcp/client.js` 收窄为 `McpClient`/`mcpResult` | 搬运 + 解耦（含 D4 的有意变化） |
| **1B-2** | 搬桌面服务器本体；导出 `startDesktopServer()`；`src/mcp/desktop.js` 变入口垫片；扩展打包布局验证（桌面服务器握手） | 搬运 + 极小重构 |
| **1B-3** | 新增 `ToolPolicy`、`ToolResolver`（七项检查、七个失败码）、`expandEnv`（严格）、`redactToolSpec`；在 `@vao/executors` 加契约类型；`autoDiscoverExternalMcp` 选项（新核心默认 `false`）；全部有单元测试。**此时没有任何消费者** | 新增（尚未接线） |
| **1B-4** | 三个适配器改用 `toolResolver`（取代 Stage 1A 的 `resolveTool` 选项；没有外部使用者，直接替换并更新 Stage 1A 的测试）；运行时 `strictTools`（默认 `true`）；`delivery:'preloaded'` 的工具不再注入 | 接线（适配器路径） |
| **1B-5** | 旧门面接入解析器的**兼容模式**（保持旧发现默认、旧服务器名、旧 id 别名、旧版只读验收可用浏览器、保持 `supports()` 行为）；按 D1 修改 `toolsFor` 的失败呈现；清理：确认 `src/` 下没有残留实现 | 接线（旧版路径）+ 清理 |
| **1B-6** | 文档：更新 `docs/architecture/executor-contract.md` 的 `ToolGrant` 一节、README 的目录说明（仅文件清单一行，不做品牌改名）、`packages/README.md`；发布说明列出有意的行为变化 | 文档 |

1B-3 先于 1B-4：先证明解析器自身正确，再让适配器依赖它。1B-1/1B-2 先于 1B-3：先证明“搬运不改变行为”，再引入新语义。

---

## 13. 回退策略

1. 分步提交，粒度即回退粒度；任一步验收失败 `git revert` 该提交。
2. 在独立分支实施，PR 内保留每步提交，**不 squash**。
3. **门面是回退面**：`src/tools.js`、`src/mcp/desktop.js`、`src/mcp/client.js` 始终是旧版入口；最坏情况把门面恢复为原实现，`team.js` / `coordinator.js` 无需改动（`toolsFor` 的改动单独成一个提交，可独立回退）。
4. 没有运行时开关、没有双实现并存；`strictTools` 与 `autoDiscoverExternalMcp` 是**参数**，默认值按本文决定设置（新核心安全默认；旧门面兼容默认）。
5. 不可逆项为零：不改配置格式、不改日志 / 统计格式、不改界面协议、不碰 SQLite；`extraResources` 与验证脚本的改动独立成提交。
6. 固定 Playwright 版本若在 1B-1 之后发现问题：回退该版本常量（单点），而不是改回 `latest`。
7. 基线提交与 1B-0 的黄金快照作为永久对照。

---

## 14. 已知风险

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | 打破“旧版零构建、无需 `npm install`”：新增的 `packages/tools` 若需要构建 | 与 Stage 1A 相同：纯 JS + 相对路径导入；`.d.ts` 手写；根 `npm test` 不依赖 `tsc` |
| R2 | 桌面打包缺 `packages/tools` → 安装包里找不到桌面服务器 / 目录 | §10 的 `extraResources` + 扩展的打包布局验证（握手）；`electron-builder --dir` 人工项 |
| R3 | 桌面服务器靠 `isMain` 判断是否监听 stdin；搬运或垫片处理不当会变成“导入即无事发生” | `startDesktopServer()` 显式导出；垫片测试：通过入口文件路径启动并完成握手 |
| R4 | 旧门面与新解析器行为偏差（`supports()` 的厂商判断、旧 id、旧服务器名） | 先建黄金快照；兼容模式；快照逐字相同（除有意变化）才算通过 |
| R5 | 引入新的厂商耦合 | 只出现在 `origin.host` / `hostBound` / `toolHost` 这类**来源事实**里；结构测试检查共享包不含 `claude-cli` / `codex-cli` / `openai-api` 的 worker 类型字符串 |
| R6 | `ResolvedToolSpec` 含明文密钥被意外序列化 | `redactToolSpec()` + 脱敏测试；契约注释标明敏感 |
| R7 | 适配器 API 变更：`resolveTool` → `toolResolver` | 仅内部使用；一次提交内同步更新 Stage 1A 的测试；PR 中显式说明 |
| R8 | 手写 `.d.ts` 与 JS 导出漂移 | 同 Stage 1A：导出清单双向测试 + `tsc -b` 校验 |
| R9 | 复杂 Codex TOML（嵌套表、多行字符串）被静默忽略 | 已知限制，搬运不改；文档标注 |
| R10 | 固定的 Playwright 版本过时 / 有漏洞 | 升级需显式版本变更 + CI / 回归验证；版本是单点常量；发布前检查单里列出 |
| R11 | 旧版因固定版本而行为变化（不再跟随 `latest`） | 有意变化；发布说明；回退只改常量 |
| R12 | 旧版验收依赖“只读 + 浏览器”，新核心默认拒绝 | 旧门面兼容模式保留；新核心的只读网页研究另用显式只读工具（后续工作）；文档标注两套默认值的区别 |
| R13 | Claude / Codex 路径中的密钥出现在临时文件 / 命令行（§9.5） | 记录为已知残留风险，不在 1B 处理 |
| R14 | 旧版代码经 `src/mcp/client.js` 的 `export *` 依赖了整个运行时 | 1B-1 收窄为两个符号；其它依赖会在测试中暴露 |
| R15 | 拆分后旧门面的方法返回形状（字段名、`native`、`types`、旧 id）与 `prompts.js`、`coordinator.js`、`public/app.js` 的使用不一致 | 门面返回**旧形状**；黄金快照覆盖字段；不允许修改调用方（`toolsFor` 的失败呈现除外） |
| R16 | **Claude Code / Codex 内部启动的 MCP 服务器失败对我们不可见**，`TOOL_START_FAILED` 无法对这两类执行器保证；CLI 可能在缺少该服务器时继续 | 已知限制；解析阶段的 fail-closed 仍对三类执行器成立；如果将来需要，另行设计启动探测（非 1B） |
| R17 | 旧工具 id `desktop` 与新逻辑 id `desktop-control` 并存带来的混淆（配置键、规划提示词、Coordinator 并发规则） | 别名只在门面；别名表有测试；新代码只使用 `desktop-control`；不改 Coordinator |
| R18 | 新核心默认关闭自动发现，可能让“装过插件”的用户觉得工具消失 | 这是安全默认；Owner 可显式启用 / 导入；旧版门面保持原行为 |
| R19 | `toolsFor` 改为失败呈现后，原本“少一个工具也能完成”的旧任务现在会失败 | 有意变化（D1）；失败码明确；沿用旧版 `handOff` 移交给能用该工具的人；发布说明列出 |

---

## 15. 明确不做（Non-goals）

- 不抽取办公室渲染器（Stage 1C）；不抽取提示词 / 角色（Stage 1D）。
- 不引入 SQLite 运行时；不写新的 Coordinator、Scheduler；不做 Worktree 执行。
- 不实现 Telegram Human Gateway；不做 Workspace UI、多项目运行时、Artifact 系统。
- 不重写 Coordinator，**不重新设计旧 Coordinator 状态模型**；**不把模型路由放进工具包**（`pickEmployee`、`fitScore`、`models.js` 不动）。
- 不决定未来持久化核心中工具解析失败是 `BLOCKED` 还是 `WAITING_HUMAN`。
- **不引入可选的 ToolGrant 语义**；不扩展 `ToolGrant`（仍是 `{id}`）。
- **不做命令级 / 动态的 MCP 安全分析**；不为浏览器提供“只读模式”；不构建只读网页研究工具（后续工作）。
- 不重新设计整体安全模型；不新增人工审批流程；不处理 §9.5 的残留风险；不修 TOML 解析器的已知限制；不为 Claude / Codex 内部的 MCP 启动失败提供探测（R16）。
- 不删除旧版的自动发现；不改配置格式、日志格式、界面协议。
- 不改 `niuma` 命令、`~/.niuma/`、`NIUMA_*`、`niuma_browser` / `niuma_desktop` / `niuma-desktop`（`LEGACY_COMPATIBILITY_IDENTIFIER`，保持）；不增加 `VAO_*` 环境变量别名（后续改名任务）；**新架构代码不新增任何 `niuma_*` 标识符**。
- 不迁移 `Toolbox`（OpenAI 内置函数工具）、`McpClient`（留在执行器运行时）、`describeMcpCall`（展示层）。
- 不迁移中文显示名、关键词、`toolGuide` 提示词、`TOOL_ZH`（旧版展示）。
- 不为旧版增加运行时开关或第二份实现。

---

## 16. 验收标准

**D1–D5 与兼容性（逐项必须满足）：**

1. **显式 ToolGrant 不可被静默丢弃**：`ok:true` 时 `tools` 与 grants 一一对应；任何无法满足的 grant 都使执行失败；有测试覆盖。
2. **解析发生在执行器进程启动之前**：失败时没有进程被拉起，也没有临时文件被创建（捕获文件 / 目录断言）。
3. **缺失环境变量 fail-closed**：定义引用的 `${VAR}` 缺失 → `TOOL_ENV_MISSING`，不再展开为空字符串。
4. **未授权工具 fail-closed**：被禁用、安全模式下的接管类、策略拒绝 → `TOOL_NOT_AUTHORIZED`。
5. **不支持的能力 fail-closed**：无法启动、执行器不支持 MCP、宿主不匹配 → `TOOL_NOT_SUPPORTED`。
6. **视觉不匹配 fail-closed**：需要视觉而执行器 `canUseVision` 为 `false` → `TOOL_REQUIRES_VISION`；由 `ExecutorCapabilities` 判断，不看 worker 类型字符串。
7. **只读 Execution 拒绝非 `readOnlySafe` 的 MCP**：→ `TOOL_NOT_READ_ONLY_SAFE`。
8. **浏览器默认不是 `readOnlySafe`**。
9. **桌面控制不是 `readOnlySafe`**。
10. **新核心的外部 MCP 自动发现默认关闭**（`autoDiscoverExternalMcp=false`）；未显式启用时不读取 Claude Code / Codex 配置。
11. **旧版门面保持必要的兼容行为**：旧发现默认、旧服务器名 `niuma_*`、旧 id `desktop` 及配置键、旧版只读验收仍可使用浏览器；`test/tools.test.js` 未修改且通过。
12. **Playwright MCP 版本固定**：共享包中没有 `latest` / 浮动标签；升级有版本常量 + 回归验证的要求。
13. **新核心不产生新的 `niuma_*` 标识符**：共享包（除白名单的桌面服务器文件中既有的兼容标识符外）没有；新核心使用 `browser` / `desktop-control` 与 `vao_browser` / `vao_desktop`。
14. **桌面 MCP 打包保持可用**：`desktop/package.json` 包含 `packages/tools`；`verify:packaged-layout` 在重建的 `core/` 里启动假 NiuMa（HTTP 200）并完成桌面服务器的 MCP 握手；`core/` 内只有一份桌面服务器。
15. **Legacy NiuMa 保持可运行**：`npm test` 的通过 / 失败集合与起点相同（有意变化除外并已列出）；旧版启动（含 `--fake` 排练）无需 `tsc`、无需 `npm install`。

**结构与质量：**

16. **单一事实来源**：发现（Claude / Codex）、TOML 解析、内置定义、解析器、桌面服务器各只有一份实现，位于 `packages/tools`；`src/tools.js` 只剩门面。
17. **概念分离**：ToolDefinition、ToolDiscovery、ToolGrant、ResolvedToolSpec、ToolExecution 分别由 `ToolRegistry`、`ToolSource`、`ToolGrant`（Stage 0 契约）、`ToolResolver` 产物、执行器运行时承担；没有一个类同时做这些事。
18. **依赖方向**：`@vao/executors` 不 import `@vao/tools`；`@vao/tools` 只对 executors 契约做 `import type`；无运行时循环依赖。
19. **无厂商耦合与本地化**：共享定义中没有 `claude-cli` / `codex-cli` / `openai-api` 类型字符串，没有中文文案；机器语义不依赖展示文本。
20. **密钥**：`ResolvedToolSpec.env` 的值不出现在事件 / 日志 / 活动 / 提示词中（脱敏测试）。
21. **导出一致**：`packages/tools/runtime/index.js` 与 `index.d.ts` 双向一致；`tsc -b` 通过。
22. **CI**：Ubuntu 与 Windows 均通过。
23. **范围**：PR 只含 Stage 1B 工作；没有 1C / 1D / SQLite / Telegram / Coordinator 重写（`toolsFor` 的失败呈现是唯一获批的 Coordinator 改动）。

---

## 17. 决策状态

| # | 事项 | 状态 |
| --- | --- | --- |
| D1 | ToolGrant 解析 fail-closed；失败码；旧版表示为普通失败任务 | **已定** |
| D2 | MCP 默认非 read-only-safe；浏览器与桌面控制均非 read-only-safe；不做动态分析 | **已定** |
| D3 | 新核心外部 MCP 自动发现默认关闭；旧门面保持兼容 | **已定** |
| D4 | Playwright MCP 固定版本；版本号由实施环境选定并验证；升级需 CI / 回归 | **已定**（版本号待 1B-1 实施时确定） |
| D5 | 新核心使用 `browser` / `desktop-control`、`vao_browser` / `vao_desktop`；`niuma_*` 为 `LEGACY_COMPATIBILITY_IDENTIFIER` | **已定** |

**实施期需要产出的事项（不是未决的架构问题）：** 1B-1 选定并验证具体的 Playwright MCP 版本；Playwright 回归在 CI 中的具体机制；发布说明里列出的有意行为变化（固定版本、`toolsFor` 失败呈现、OpenAI 插件启动失败）。

---

## 结论

**READY_FOR_STAGE_1B_IMPLEMENTATION**

没有阻塞项。D1–D5 均已冻结；1B-0 起可以开始，第一步固定为脚手架 + 旧 `ToolCatalog` 黄金快照 + 打包配置，在移动任何代码之前先建立安全网。
