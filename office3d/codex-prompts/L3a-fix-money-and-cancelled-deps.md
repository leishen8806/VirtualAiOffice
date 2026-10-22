# L3a-fix：调度核心的资金误判与「依赖已取消」默认值（只改 `scheduler-core.mjs` 与其测试，约 30 分钟）

**执行者：Trae（接在 L3a 之后，同一会话即可；做完停下等我验收，再做 L2a）。主线。** 先读：`_lane-main.md`、你自己的 `scheduler-core.mjs` 与 `tests\scheduler-core.test.mjs`、`task-contract.mjs`（L1a-fix 之后的 `moneyFields` 取法，**对齐它**）。**只允许改 `scheduler-core.mjs`、`tests\scheduler-core.test.mjs`**（README 的 L3a 一节可同步改一两句）。不接路由，不读写文件，不改 `standup.mjs`。开工前备份到 `office3d-backup-l3a-fix`。

董事会侧用独立探测脚本复核 L3a，其余（原因码、排序、`revalidate`、`decisionRecord` 不含正文、容错）都正确，**不要动**。发现两处缺陷：

## 缺陷 1：资金类误判（`moneyText`）
- 现状：`moneyText(task)` 拼接 `projectId / identifier / title / description`。契约区块写在 `description` 里，「**禁止: 读取密钥**」这种安全禁令命中 `MONEY_RE`（含「密钥」），任务被判 `MONEY_CLASS_NEEDS_BOARD`，**永远不会被推荐**。几乎每张任务卡都有这类禁令。
- **要求**：资金判定只看 **`title`**，以及（若 `task.contract` 已被解析）契约的**项目、目标、交付物、允许修改**四个字段；**没有解析好的契约时，只看 `title`**，不要退回扫整段 `description`。`task` 输入形状新增可选字段 `contract`（对象，字段名同 `task-contract.mjs`），在文档与校验里写明；调用方（L3b）负责用 `parseContract` 填充。
- 测试：`description` 含「禁止: 读取密钥, 不得提现」且无 `contract` → **eligible**；`title: 修改提现逻辑` → `MONEY_CLASS_NEEDS_BOARD`；`contract.交付物: 迁移脚本` → `MONEY_CLASS_NEEDS_BOARD`；`contract.禁止` 含密钥 → **不**命中。

## 缺陷 2：「依赖已取消」默认视为满足
- 现状：`blockedBy` 里状态为 `cancelled` 的依赖被当作已满足，下游任务可被调度。**取消不等于交付**，下游可能缺少它需要的产出。
- **要求**：新增原因码 **`DEP_CANCELLED`**（`block`），**默认**命中；策略开关 `policy.cancelledDependencySatisfies === true` 时才放行（默认 `false`，需董事会明确开启）。加入 `REASON_CODES`，`RULE_VERSION` 递增到 `'L3a-2'`，并有测试固定新版本号与原因码清单。`pickNext` 的「解除下游依赖数」计算同步：已取消的依赖**不计为将被解除**。
- 测试：依赖 `cancelled` → 默认 `DEP_CANCELLED` 阻塞；开关为 `true` → eligible；依赖 `done` 仍 eligible；混合（一个 done + 一个 cancelled）→ 默认阻塞；`revalidate` 在依赖由 `todo` 变 `cancelled` 时 `changed` 含 `DEP_CANCELLED`。

## 验收
- `node --check scheduler-core.mjs`；`node --test tests/*.test.mjs` 全过（当前 628 项起，**不得放宽已有断言**；与新语义直接冲突的旧断言可以改，**逐条列出并说明理由**）。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；贴两个缺陷的**修复前后输出对比**。**不要重启任何进程。**
