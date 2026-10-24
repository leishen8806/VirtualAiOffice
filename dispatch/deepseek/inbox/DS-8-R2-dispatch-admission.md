---
id: DS-8
base: office3d/rev-20261023-2
branch: ds/DS-8-r2-dispatch-admission
scope:
  - office3d/dispatch-policy.mjs
  - office3d/dispatch-policy.json.example
  - office3d/tests/dispatch-policy.test.mjs
  - office3d/tests/dispatch-policy-wiring.test.mjs
  - office3d/server.mjs
  - office3d/README.md
budget: 4h
---
# DS-8（R2）：派发准入统一——依赖规则一致 + 任务契约在「可执行」之前检查（默认关闭的开关）

**沿用 DS-7（R1 完成策略）的模式**：新纯模块 + 默认关闭的 JSON 开关（`off` / `warn` / `enforce`）+ 人工例外必须写理由、只限本机完整权限、留审计。先完整读 `completion-policy.mjs` 与它在 `server.mjs` 里的接线，**照同一结构做，不另起风格。**

## 已在当前代码核实的两个问题
1. **依赖口径不一致：** `server.mjs` 的 `act()` → `type === 'assign'`（约 430 行起）把 `done` 与 `cancelled` 都当「依赖已满足」，并且 `a.force === true` 可直接放行、**不需理由、不留审计**；而调度核心 `scheduler-core.mjs` 默认把已取消依赖判为 `DEP_CANCELLED`（「取消不等于交付」）。结果：调度建议说不能推进，手动指派却能推进。
2. **契约是「创建后检查」：** `type === 'create_issue'`（约 405–425 行）先按是否指定负责人把任务建成 `todo`（可执行）并 `POST` 给上游，**然后**才解析 / 校验任务契约（`validateContract`），只在返回值里提示 `complete / incomplete`。契约不完整的任务可能已经可执行。

## 要做的事
1. **新纯模块 `dispatch-policy.mjs`**（无网络、无文件 I/O）：
   - `loadDispatchPolicy(raw)`：缺失 / 损坏 / 未知字段 → `{ mode: 'off' }`。
   - `decideAssign({ policy, issue, blockers, override })`：依赖判定**复用 `scheduler-core.mjs` 的口径**（取消依赖默认不满足，除非策略里显式 `cancelledDependencySatisfies: true`）；`off` = 与现状完全一致（含旧的 `force` 行为）；`warn` = 放行但给出原因码；`enforce` = 依赖未满足即拒绝，**唯一例外**是 `override = { reason }`（去空白 ≥ 10 字）且本机完整权限，结果带 `audit`；`force: true` 在 `enforce` 下**不再单独生效**，必须换成带理由的 `override`。
   - `decideCreate({ policy, contractCheck, wantsExecutable })`：`enforce` 下**契约不完整时只能建成草稿**（`backlog`、不指定负责人或不置 `todo`），并返回原因；契约完整才允许 `todo` + 负责人；`off` / `warn` 与现状一致（`warn` 附原因）。
   - 原因码复用 `scheduler-core.mjs` 的 `REASON_CODES` 或本模块显式导出的少量新码，测试断言无未登记的码。
2. **接线：** `assign` 与 `create_issue` 两处走新模块；`create_issue` 在 `enforce` 下要**先**校验契约、再决定以什么状态创建（不新增上游请求次数）；`enforce` 拒绝时返回中文错误与原因码、**不发写请求**。开关文件 `dispatch-policy.json`（运行数据、不入库；提供 `.example`，内容 `{ "mode": "off" }`），启动时读一次。**局域网访问码、只读、Host 校验、`act()` 鉴权段保持原样**；「本机完整权限」沿用 DS-7 已接好的 `options.localFullAccess`。
3. **测试：** 纯模块矩阵（三模式 × 依赖{无 / 未完成 / 已完成 / 已取消 / 形状异常} × 例外{无 / 合格 / 理由过短 / LAN} × `force`）；创建矩阵（三模式 × 契约{完整 / 不完整 / 无契约} × 是否指定负责人）；接线测试用替身 `send / get`（**不连真实上游**）：`off` 下两处入口的请求与改前**逐字段一致**，`enforce` 下被拒时 0 次写请求、例外放行时审计存在；开关解析的缺失 / 损坏 / 未知值 → `off`。
4. **既有守卫：** `tests/state-last-good.test.mjs` 里「act() 与 H2 备份逐字一致」的守卫目前只允许签名、`review` 分支与一处调用点变化——本卡会改 `assign` 与 `create_issue` 分支，**请在报告里列出需要放宽的确切范围，但不要自己改这个测试文件**（不在 scope 内，由规划者核对后调整）；干净副本里因缺本机运行数据而失败的既有用例，逐个列出即可。
5. **README：** 「派发准入」一节：三种模式、开关文件、例外规则、覆盖与未覆盖的入口（Paperclip 原生指派、Agent 直接调用上游不在本规则范围内）。

## 不做的事
不改 `scheduler-core.mjs`、`done-rules.mjs`、`completion-policy.mjs` 的判定逻辑（发现问题只报告）；不默认开启；不碰 `app.js / ui.js / index.html`；不联网、不装依赖；不推 `main`、不 force；报告不含任何密钥、IP、本机路径或账号。

## 交付
分支 `ds/DS-8-r2-dispatch-admission`，推送后告诉派发人；`dispatch/deepseek/outbox/DS-8-report.md`：做到 / 没做到 / 未验证；改动文件与行数（`server.mjs` 改动**逐行列出**）；测试输出末尾；两处入口改前 / 改后行为对照表；第 4 条要放宽的守卫范围；范围外发现。完成后停下，等待规划者验收。
