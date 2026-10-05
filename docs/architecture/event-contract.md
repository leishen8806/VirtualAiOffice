# 事件契约（Stage 0）

代码：`packages/events/src/`。测试：`packages/events/spec/envelope.spec.ts`。

## 信封（版本 1）

```ts
interface DomainEvent<TPayload = unknown> {
  id: string            // 全局唯一，由生产者分配（如 UUID）
  seq?: number          // 工作区事件日志中的位置，追加时由事件存储分配；严格递增
  ts: string            // ISO-8601，事件发生时间
  workspaceId: string
  projectId?: string    // 项目级命名空间必填（见下）
  type: `${EventNamespace}.${string}`
  subject: { kind: string; id: string }
  actor?: { memberId?: string }   // 人或 Agent；系统事件可省略
  payload: TPayload
  v: number             // 信封版本，当前为 1
}
```

| 字段 | 规则 |
| --- | --- |
| `v` | 信封版本号。读取时大于当前版本或小于 1 一律拒绝。只有破坏性的信封变更才升级版本；载荷的演进通过新增事件类型完成 |
| `seq` | 排序字段。生产者不填写，`createEvent()` 产生的事件没有 `seq`。事件存储在追加时分配，读回的 `StoredEvent` 一定有 `seq`。每个工作区一个 SQLite 文件，因此全局自增序列就是工作区序列 |
| `id` | 唯一键。重复追加同一 `id` 会被数据库唯一约束拒绝，可借此实现幂等 |
| `projectId` | `project`、`requirement`、`task`、`execution`、`evidence`、`approval`、`meeting`、`artifact` 命名空间的事件必填。`workspace`、`member` 命名空间为工作区级 |
| `subject` | 必须同时有 `kind` 和 `id` |

`createEvent()` 通过注入的 `newId()` 和 `now()` 生成 id 与时间，使契约保持纯净、测试可重复。`validateEvent()` 在创建、序列化、反序列化和追加时都会执行。

## 序列化格式

- 每个事件序列化为**一个 JSON 对象、一行**，键顺序固定：`v, id, seq?, ts, workspaceId, projectId?, type, subject, actor?, payload`。
- 同一字符串既是导出文件中的一行 NDJSON，也是 SSE 消息的 `data:` 字段。
- SSE 消息的 `id:` 字段使用 `seq`。客户端断线重连时带上 `Last-Event-ID`，服务端用 `readSince(seq)` 补发遗漏的事件。
- `deserializeEvent()` 对非法 JSON、缺失或不支持的版本、不合规的类型、缺失的作用域都会抛出 `EventContractError`。

## 命名规范

`<namespace>.<过去式_snake_case>`，命名空间固定为：

```text
workspace.*  project.*  requirement.*  task.*  execution.*
evidence.*   approval.*  meeting.*     member.*  artifact.*
```

首个纵切需要的代表性事件（`EVENT_TYPES` 常量）：

| 事件 | 含义 |
| --- | --- |
| `requirement.created` / `requirement.analysis_completed` / `requirement.approval_requested` / `requirement.approved` | 需求生命周期 |
| `task.created` / `task.ready` / `task.started` / `task.verifying` / `task.completed` / `task.failed` | 任务里程碑 |
| `task.transitioned` | 每次任务状态变化都写一条，载荷为 `{ from, to, event }` |
| `execution.started` / `execution.activity` / `execution.finished` | 一次尝试的开始、结构化活动、结束 |
| `evidence.recorded` | 一条证据（测试结果、审查结论等）。原先设想的 TestEvent、ReviewEvent 都归入这里 |
| `approval.requested` / `approval.decided` | 人工审批 |

规则：只有某个服务确实发出某个事件时，才把它加入目录；**规范才是契约，列表不是**。UI 动画状态（如旧系统的 `walking`）不是领域事件，`office.walking` 这类类型会被拒绝。

## 事件日志接口

```ts
interface EventLog {
  append(events): Promise<StoredEvent[]>           // 全部成功或全部失败，分配 seq
  readSince(afterSeq, filter?, limit?): Promise<StoredEvent[]>   // 按 seq 顺序重放
  lastSeq(): Promise<number>
}
```

`InMemoryEventLog` 是参考实现，供测试和彩排模式使用。SQLite 实现在 Stage 2 交付；在事务内追加使用同步的 `TransactionalEventAppender`（见 `persistence.md`）。

## 与旧系统事件的对应

旧 `Coordinator.emitEvent()` 发出的 14 种事件没有 id、序号、项目作用域，也不持久化。迁移期间由一个投影层把新事件翻译给现有办公室渲染器：

| 旧事件 | 新来源 |
| --- | --- |
| `agent`（`idle / working / meeting …`） | 由 `task.transitioned` 与 `execution.*` 派生的成员状态投影 |
| `activity`（中文展示文本） | `execution.activity`（结构化，见 `executor-contract.md`），文字在前端生成 |
| `task` | `task.*` |
| `meeting` | `meeting.*` |
| `commit` | `evidence.recorded`（`kind: diff`）及后续的 Git 事件 |
| `dispatch` | `task.started` |
| `snapshot` | 从状态表生成的快照，加上当前 `lastSeq()` |
