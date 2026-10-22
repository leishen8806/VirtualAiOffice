# L2a-done-rules-engine：完成规则引擎——Evidence-based Done（纯函数，约 1 小时）

**执行者：Trae（新会话）。主线。** 先读：`_common.md`、`_lane-main.md`、知识库 `项目\现状盘点与融合策略.md` **第八、九节**（尤其 9.4 的 L2 追加：**先对新任务灰度强制；历史任务标明旧验收基线；必须承认强制边界**）、**`E:\VirtualAIOffice\repo-3d\docs\architecture\state-machines.md`（完整读，尤其「完成规则（Evidence-based Done）」与「重试、返工与升级不是状态」——这是本任务的规格来源）**、`evidence-version.mjs` 与 `tests\evidence-version.test.mjs`（现有「验收绑定版本」的口径，**对齐而不是重写**）、知识库 `流程\模板\验收证据.md`（`git:<repo>@<sha>` / `sha256:<path>=<hash>` 的机器可读版本格式）。

**允许新增：** `done-rules.mjs`、`tests\done-rules.test.mjs`；`README.md` 追加一节「完成规则引擎（L2a）」。**不改其它已有文件（含 `evidence-version.mjs`）；不接路由；不对 Paperclip 发请求；不读写文件（纯函数）。**

## 目标
把「**执行结束 ≠ 验证通过 ≠ 验收完成 ≠ 已合并 ≠ 已上线**」变成**可检查的规则**：给定一条任务的证据列表和当前产出版本，**程序判断它到底做到哪一级、能不能算完成、缺什么、哪些证据已经过期**。**只判断，不改变任何状态。**

## 要做的事
1. **证据条目形状**：`{ kind: 'execution'|'test'|'review'|'acceptance'|'merge'|'release', subjectVersion, at, ref, ok, actor?, protectedTestsHash? }`；`subjectVersion` 使用现有的机器可读格式（`git:<repo>@<sha>` / `sha256:<path>=<hash>`），**写一个 `parseVersion` / `sameVersion`**（规范化后比较；无法解析 → `unparseable`，**不得当作相等**）。
2. **`completionLevel(evidence, currentVersion)`** → `{ level, levels: {executed, verified, reviewed, accepted, merged, released}, stale: [...], missing: [...] }`：每一级都要求**证据的 `subjectVersion` 与 `currentVersion` 相同**才有效；**版本不同的证据标为 `stale`（过期），不计入**；`ok:false` 的证据不计入且单独列出；`level` 取**连续满足的最高一级**（执行 → 验证（有 `test` 证据且 ok）→ 评审（有 `review` 证据且 ok 且 **`actor` 与执行者不同**）→ 验收（有 `acceptance` 证据）→ 已合并 → 已上线）。**测试证据里的 `protectedTestsHash` 必须与 `policy.protectedTestsHash`（若提供）一致，否则该测试证据无效**（防止「删除失败测试让结果变绿」）。
3. **`evaluateDone(task, evidence, currentVersion, policy)`** → `{ done, level, requiredLevel, missing, stale, reasons, enforced }`：
   - **`policy.requiredLevel`**：默认 `accepted`（验收完成才算完成）；代码类任务可配置为 `merged`；资金 / 服务器类任务为 `accepted` 且要求 `acceptance.actor` 是董事会（`policy.boardActors`）；
   - **灰度**：`policy.enforcedSince`（ISO 时间）——**任务 `createdAt` 早于它 → `enforced:false`**：返回 `done` 按**旧基线**（`policy.legacyDone(task)` 由调用方注入，返回布尔）并在 `reasons` 里标注 `LEGACY_BASELINE`；**晚于它 → `enforced:true`** 严格按证据；`policy.enforcedSince` 缺失 → 视为**未开启强制**（`enforced:false`，全部走旧基线），**关闭时对现有行为零影响**；
   - **验收后产出又变了**：`acceptance` 的版本与 `currentVersion` 不同 → `done:false` 且 `reasons` 含 `ACCEPTANCE_STALE`（**旧验收不能继续无条件有效**）；
   - **重试 / 返工 / 升级不是状态**：本模块**不得出现** `retry / rework / escalated` 作为 `level` 取值（测试固定）；它们只可作为 `reasons` 里的信息。
4. **`enforcementBoundary(options)`** → 返回一份**诚实的边界声明**对象 `{ coveredPaths: [...], uncoveredPaths: [...], note }`：列出本规则**只在办公室 3D 的验收流程内生效**，**Agent 若绕过办公室 3D 直接改 Paperclip 的完成状态则不受约束**；**`uncoveredPaths` 不得为空**，且文案不得出现「全局已强制」（测试固定）。用它提醒后续接线（L2b）不要夸大。
5. 常量 `DONE_RULE_VERSION` 与等级表导出并冻结。

## 测试（`tests/done-rules.test.mjs`）
- 版本：`git:` / `sha256:` 的相等 / 不等 / 大小写 / 缩写 sha / 无法解析（**不得当作相等**）。
- 等级：只执行 → `executed`；加测试 → `verified`；评审者与执行者相同 → 不算 `reviewed`；验收 → `accepted`；产出版本变化后全部 `stale`；`ok:false` 证据不计；**`protectedTestsHash` 不一致 → 测试证据无效**。
- `evaluateDone`：默认 `accepted`；`requiredLevel:'merged'`；资金类要求董事会 `actor`；**灰度三态**（早于 / 晚于 / 缺失 `enforcedSince`）；`ACCEPTANCE_STALE`；`legacyDone` 的注入。
- `enforcementBoundary`：`uncoveredPaths` 非空、不含「全局已强制」。
- 容错：空证据、`null`、未知 `kind`、10 万条证据（< 500 ms）；**确定性**；**静态检查**：不含 `fetch / Date.now / Math.random / child_process / eval / innerHTML`，不 import 业务模块。
- 全量 `node --test tests/*.test.mjs` 全过。

## 验收与汇报
`node --check done-rules.mjs`；全量测试全过；汇报「做到 / 没做到 / 未验证」且与磁盘一致；**列出你与 `repo-3d` 状态机规则的逐条对应表**（规则 → 本模块的实现 / 测试名）。

## 补充（2026-10-21，董事会侧，吸取 L1a / L3a 的教训）
- **资金类判定只看标题，以及（若有解析好的契约 `task.contract`）契约的「项目、目标、交付物、允许修改」四个字段；不看整段 `description`，不看「禁止」「工具权限」「验收标准」。** 契约里的安全禁令（如「禁止读取密钥」）**不得**把任务判成资金类。没有解析好的契约时只看标题。需要在测试里覆盖：`禁止: 读取密钥` 不触发、`目标: 修改提现逻辑` 触发。
- **「依赖已取消」不等于「已满足」**：若规则涉及上下游任务状态，取消的上游默认不视为满足（与 `L3a-fix` 的 `DEP_CANCELLED` 一致）。
- 对任何「命中关键词即升级为严格处理」的规则，**必须写一个「关键词只出现在禁令里」的反例测试**。
