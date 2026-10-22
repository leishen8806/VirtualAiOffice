# L1b-contract-governance-view：把任务契约校验接到治理中心（只读展示 + 灰度提示，约 1–1.5 小时）

**执行者：Trae（新会话）。主线。改 `server.mjs`（同一时间只有一个任务改它——**L3b 必须等本卡验收后再开**）。** **前置：L1a 与 L1a-fix 已验收（`task-contract.mjs`）。** 先读：`_common.md`、`_lane-main.md`、`task-contract.mjs`、`server.mjs` 里现有只读路由与 `API_PATHS / authRoute` 的写法、`ui.js` 治理中心任务面板的渲染方式（**只读参考**）、知识库 `现状盘点与融合策略.md` 第八、九节。

**允许修改：** 新增 `contract-view.mjs`（纯函数：把任务列表 + `parseContract / validateContract` 汇总成「契约健康度」视图）、`tests\contract-view.test.mjs`；`server.mjs`（**只加一条只读路由 + 一个默认关闭的开关读取，逐行列出，不碰任何既有访问控制与写路径**）；`ui.js` / `index.html`（**最小钩子 ≤ 15 行，逐行列出**：治理中心任务卡上显示「契约：完整 / 缺项 / 无」小标签与缺项列表）；`README.md` 追加一节「契约视图（L1b）」。备份相关文件到 `office3d-backup-l1b`。**不得向 Paperclip 发任何写请求；不得改变任务、评论、审批的任何内容；不阻止任何派发（本卡只展示，不强制）。**

## 要做的事
1. **开关** `contract-view.json`：`{"enabled":false}`；缺失 / 损坏 / 非布尔 `true` 一律关闭；**读取一次（启动时），改动需重启**（与 `foyer.json` 一致）。关闭时：新路由返回 404，UI 不出现任何新元素，**既有路由与页面逐字节一致**（用 `tools\tenancy-snapshot.mjs` 验证）。
2. **`contract-view.mjs`**：`summarizeContracts(tasks, { now })` → `{ total, withContract, complete, incomplete, none, byProject, items:[{ identifier, status, state:'complete'|'incomplete'|'none', errors:[{field, code}] }] }`；**不含任务标题与描述正文**（只含编号、状态、错误字段名与码）；资金类判定沿用 L1a-fix 的口径。上限：最多处理 500 个任务，超出标记 `truncated`。
3. **路由** `GET /contract-view`（只读；沿用现有 `/state` 的取数函数与缓存，**不增加对 Paperclip 的请求频率**，不新增轮询）：返回上面的汇总；加入 `API_PATHS` 与权限（局域网只读可读，墙面令牌**不可**读）。
4. **UI**：治理中心任务面板里，每张任务卡显示一个小标签（完整 / 缺 N 项 / 无契约）与 hover 缺项列表；**文案不出现「强制 / 拒绝」**（本卡不强制）；顶部一行汇总（如「契约完整 12 / 缺项 8 / 无 40」）。**页面轮询不增加；`document.hidden` 时不刷新。**

## 测试与验收
- 纯函数：complete / incomplete / none 三态；资金误判反例（`禁止: 读取密钥` 不算资金）；500 条上限；**断言输出不含标题与描述**；坏输入容错。
- `server.mjs`：开关关闭 → 路由 404 且既有路由快照零变化；开启 → 200；墙面令牌 403；静态检查无写 Paperclip 调用。
- `node --test tests/*.test.mjs` 全过；`node --check`。**不要自己重启服务**（我来重启后做在线验收：开关保持关闭，临时开启验证后恢复）。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；列出 `server.mjs` 与 `ui.js` 的接线行。
