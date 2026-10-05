# 执行器契约（Stage 0）

代码：`packages/executors/src/`。测试：`packages/executors/spec/contract.spec.ts`。

## 分层

```text
Role（职责，例如 Primary Engineer）
  ↓
Execution Policy（角色 × 风险等级 → 有序执行器候选、升级阈值、预算）
  ↓
Executor Adapter（本契约）
  ↓
Model / CLI / Tool
```

编排层通过角色的 `ExecutionPolicy` 选出一个 `ExecutorConfig`，再调用该配置所指的适配器。通用接口中不出现任何厂商名；测试会扫描编译后的声明文件来强制这一点。

## 接口

```ts
interface ExecutorAdapter {
  id(): string                                   // 与 ExecutorConfig.adapter 对应
  capabilities(): ExecutorCapabilities
  start(spec: ExecutionSpec): Promise<ExecutionHandle>
  cancel(executionId: string): Promise<void>     // 幂等
}

interface ExecutorCapabilities {
  interactive: boolean          // 需要人在回路（例如在 IDE 中完成后交回）
  canReadFiles: boolean
  canWriteFiles: boolean
  canRunShell: boolean
  canUseMcp: boolean
  canUseVision: boolean
  billing: 'subscription' | 'usage' | 'unknown'
  maxConcurrency?: number
}
```

### ExecutionSpec：一次尝试所需的全部输入

| 字段 | 说明 |
| --- | --- |
| `workspaceId`、`projectId`、`taskId`、`executionId` | 作用域与关联 |
| `workdir` | 绝对路径，**按每次尝试传入**（Stage 6 起为任务 worktree）。旧 `BaseWorker` 把它固定在构造函数中，这是 Stage 1 要改的地方 |
| `instructions` | 自包含的指令，执行器看不到对话上下文 |
| `role` | `{ id, name, instructions }`，提供职责上下文，不是模型选择 |
| `risk` | `L1`–`L4` |
| `access` | `read_only`（审查、调研）或 `read_write` |
| `tools` | 按工具柜 id 授予的工具 |
| `budget` | `maxDurationMs`（必填）、`maxCostUsd`（可选） |
| `modelHint` | 来自执行策略的可选模型偏好，适配器可以忽略 |
| `metadata` | 字符串键值，供追踪使用 |

`validateExecutionSpec(spec, caps?)` 返回问题列表，例如工作目录不是绝对路径、指令为空、执行器不能写文件却被授予 `read_write`。

### ExecutionHandle 与结果

```ts
interface ExecutionHandle {
  executionId: string
  events: AsyncIterable<ExecutorEvent>   // 尝试结束时结束
  result: Promise<ExecutionResult>       // 永远 resolve，失败以 outcome 表示
}

interface ExecutionResult {
  outcome: 'succeeded' | 'failed' | 'timed_out' | 'cancelled'
  summary: string            // 执行器自己的汇报：是主张，不是证据
  error?: string
  changedFiles?: string[]
  actualModel?: string       // 实际使用的模型（可能与请求的不同）
  tokensIn?: number; tokensOut?: number; costUsd?: number
  sessionRef?: string
  durationMs: number
}
```

`toExecutionEvent(result)` 把结果映射为领域 Execution 状态机的事件（`SUCCEED` / `FAIL` / `TIME_OUT` / `CANCEL`）。注意：执行成功只会让任务进入 `VERIFYING`；任务是否完成由证据决定。

## 结构化执行事件

```ts
type ExecutorEvent =
  | { kind: 'activity'; at: string; activity: ExecutionActivity }
  | { kind: 'heartbeat'; at: string }
  | { kind: 'usage'; at: string; tokensIn: number; tokensOut: number; costUsd?: number }

type ExecutionActivity =
  | { type: 'file.read'; path: string }
  | { type: 'file.write'; path: string }
  | { type: 'search'; query: string; path?: string }
  | { type: 'command.run'; command: string }
  | { type: 'test.run'; command: string }
  | { type: 'tool.call'; tool: string; target?: string }
  | { type: 'message'; text: string }
  | { type: 'thinking' }
```

规范格式是数据，不是展示文本。办公室界面再把它们翻译成气泡文字（如“改 src/a.ts”），语言由界面决定。`commandActivity()` 把测试命令识别为 `test.run`，使 QA Lab 可以显示测试正在运行。

## 旧执行器到新契约的对应（Stage 1 迁移指引）

| 旧代码 | 新契约 |
| --- | --- |
| `BaseWorker` 构造参数 `{ workdir, logDir, autonomy }` | `workdir` 移入 `ExecutionSpec`；`autonomy` 由策略层转换为 `access` 与沙箱级别 |
| `run({ prompt, model, readOnly, onActivity, timeoutMs, tools })` | `start(spec)`：`prompt` → `instructions`，`model` → `modelHint`，`readOnly` → `access`，`timeoutMs` → `budget.maxDurationMs`，`onActivity` → `events` |
| 返回值 `{ ok, text, error, cost, usage, sessionId, durationMs }` | `ExecutionResult`：`ok` → `outcome`，`text` → `summary`，`cost` → `costUsd`，`sessionId` → `sessionRef` |
| `describeClaudeTool()` 生成中文文本，如 `改 src/a.js` | 解析器改为输出 `{ type: 'file.write', path }`；现有的分类逻辑可以直接复用 |
| `stopAll()` | 按 `executionId` 的 `cancel()` |
| `check()`（检查 CLI 是否可用） | 留在适配器内部，用于“接入员工”面板；不属于执行契约 |
| `ask()`（一次性问答：规划、汇报） | 不属于执行契约；在新架构中，规划和分析也是带只读权限的 Execution |
| `models.js` 的能力画像 | 下沉为适配器或执行器配置的元数据，供 Execution Policy 使用 |

## Trae 如何接入

见 `docs/research/trae-feasibility.md`。人在回路的 Trae 适配器声明 `interactive: true`、`billing: 'subscription'`，用 `heartbeat` 和由 worktree 文件变化生成的 `file.write` 报告进度。升级到其他执行器由 Execution Policy 决定，不写在适配器中。
