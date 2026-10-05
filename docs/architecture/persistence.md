# 持久化（Stage 0）

代码：`packages/store/src/`。测试：`packages/store/spec/schema.spec.ts`（使用 Node 内置 `node:sqlite` 真实执行迁移）。

## 原则

- **SQLite，本地优先。** 每个 Workspace 一个数据库文件，与 Electron 桌面部署模型一致。不引入 PostgreSQL、Redis、Kafka、RabbitMQ 或任何外部数据库服务。
- **领域代码不接触 SQL。** 业务逻辑只依赖 `repositories.ts` 中的仓储接口，存储层将来可以整体替换。
- **schema 与驱动无关。** 迁移是纯 SQL 字符串，不导入任何驱动；`node:sqlite` 或第三方 SQLite 驱动都能执行。
- **状态取值来自领域常量。** `CHECK (status IN (...))` 由 `TASK_STATES`、`REQUIREMENT_STATES`、`EXECUTION_STATES`、`EVIDENCE_*` 生成，schema 不会与状态机脱节。

## 事务规则

```text
BEGIN TRANSACTION
  读取实体
  用状态机计算新状态（唯一计算位置）
  按旧状态做 compare-and-set 写入新状态    ← 冲突则回滚并重新决定
  追加事件（<entity>.transitioned 等）
COMMIT                                      ← 任何异常 → ROLLBACK
```

- 状态与事件**要么一起提交，要么都不提交**。测试模拟了“写完状态、追加事件前崩溃”，结果是两者都被回滚。
- 状态写入是 **compare-and-set**（`UPDATE … WHERE id = ? AND status = ?`）。使用过期状态的第二个写入者会失败，测试已覆盖。
- `Store.transaction()` 的回调是**同步的**：SQLite 事务不能跨越 `await`（调用执行器、网络请求）。先做耗时操作，再开一个短事务记录结果。

## Stage 0 表结构（13 张，另有 `schema_migrations`）

| 表 | 用途 | 数据库层约束 |
| --- | --- | --- |
| `workspaces` | 工作区；执行器配置、配额、执行策略、办公室配置存于 `settings_json` | — |
| `projects` | 项目；质量配置存于 `quality_json` | `status ∈ {active, archived}` |
| `repositories` | 源码位置与集成分支前缀 | 外键 → `projects` |
| `members` | 人与 Agent | `kind ∈ {human, agent}` |
| `roles` | 角色目录 | 无模型字段 |
| `role_bindings` | 成员 × 项目 × 角色 | 唯一约束 |
| `requirements` | 需求与结构化分析 | `status` 来自领域常量 |
| `tasks` | 任务 | `status`、`risk` 来自领域常量 |
| `task_deps` | 任务依赖 | 禁止自依赖 |
| `executions` | 每次尝试 | `(task_id, attempt)` 唯一；`attempt ≥ 1` |
| `evidence` | 证据 | `kind`、`source`、`status` 来自领域常量 |
| `approvals` | 人工审批 | **只有人能做决定**：已决定的审批必须有 `decided_by`，且 `decided_by_kind = 'human'`；待定审批不能有决定人 |
| `events` | 只追加事件日志；`seq` 为自增主键 | **只追加**：触发器拒绝 `UPDATE` 和 `DELETE`；`id` 唯一 |

### 为什么比 15 张表少

`decisions` 和 `artifacts` 两张表推迟到实际写入它们的阶段（Decision 随需求分析与会议引擎，Artifact 随 Stage 3 的上传与解析）。Stage 0 没有任何代码写入它们；提前建表只会增加迁移变更。领域类型已经定义，`evidence.log_artifact_id` 暂时作为不透明引用，等 `artifacts` 表出现后再补外键。

## 连接设置

每个驱动在打开数据库后必须执行 `CONNECTION_PRAGMAS`：

```sql
PRAGMA foreign_keys = ON;      -- SQLite 默认关闭外键
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;     -- 一个写入者 + 多个 SSE 读取者
```

## 迁移

- `MIGRATIONS` 是有序列表；`pendingMigrations(appliedIds)` 返回尚未执行的迁移。
- 每条迁移与它在 `schema_migrations` 中的记录写在同一事务里。
- 迁移只增不改：已发布的迁移不再修改，变更通过新增迁移完成。

## 仓储接口（Stage 2 实现）

`Store` → `transaction(tx => …)`，其中 `tx` 提供 `requirements`、`tasks`、`executions`、`evidence`、`approvals` 仓储和 `events` 追加器。状态写入均为 `writeStatus({ id, from, to, at })`，返回 `false` 表示发生冲突。`ExecutionRepository.listRunning()` 用于重启恢复：启动时把崩溃前处于 `RUNNING` 的尝试标记为中断，并把对应任务送回 `READY`。

## Stage 2 待决

- **生产驱动选择**：`node:sqlite`（内置，零依赖，但在 Node 22 中仍为实验特性，且要求 Node ≥ 22.5）还是第三方驱动（成熟，但需要随 Electron 编译原生模块）。Stage 0 的测试用 `node:sqlite` 验证 schema；在更早的 Node 版本上，这些测试会自动跳过。
- **桌面打包**：所选驱动在 Windows、macOS、Linux 三平台安装包中的表现。
- **数据库文件位置**：建议放在 `~/.niuma/workspaces/<id>.db`，以便与旧配置目录共存。
