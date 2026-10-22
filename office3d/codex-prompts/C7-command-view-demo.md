# C7-command-view-demo：指挥视图的合成演示数据与只读加载器（纯模块 + 测试，约 1 小时）

**执行者：Trae（新会话）。主线。** **前置：C2 已验收（`command-view-validate.mjs`、`command-view-data.mjs`）。** 先读：`_common.md`、`_lane-main.md`、`docs\command-view-plan.md` 第 9、11 节、`docs\command-view-sample.json`、C2 的两个模块。

**允许新增：** `command-view-demo.mjs`（`buildDemoCommandView({ scenario, timeSlice })` 与场景表）、`tests\command-view-demo.test.mjs`；README 一节。**不改任何已有文件；不请求网络；不读写文件；无凭据。**

## 要做的事
1. **确定性演示场景（`mode:'demo'`，全部标识 `demo-*`，不得出现似真实 UUID / 任务编号 / SHA / 客户名 / 内部地址）**：至少 3 个场景：① **一项任务的完整经历**（创建 → 领取 → 执行 → 验证 → 一次返工 → 验收）按 `timeSlice` 逐步推进，**每一步的阶段由 C2 的阶段映射规则判定**（演示里的「证据」是合成并明确标 `synthetic:true`，**不得让演示证据被当成真实验收**）；② **阻塞与督办焦点**（授权 / 依赖 / 预算 / 执行器 / 已交付待验收各一例）；③ **数据质量**（成本未知、用量缺失、数据过期「更新中断」、部分集合 `PARTIAL_PAGE`）。
2. **输出必须通过 C2 的 `validateCommandView`**，且顶层 `quality.synthetic:true`；页面（后续 C4）可据此显示「合成演示」标识。
3. 提供 `listDemoScenarios()` 与 `describeScenario(id)`（给界面做场景切换，纯数据）。
4. **默认入口返回 demo 或空状态：** 导出 `defaultCommandView()` 在没有授权的 live 范围时返回**空状态**（不是演示数据冒充真实）。

## 测试与验收
- 每个场景、每个 `timeSlice` 均通过校验器；确定性（同输入同输出）；`demo` 中**不含**任何似真实标识（用正则断言）；阶段推进单调且符合 C2 规则（**没有证据的步骤显示 `pending_verification`，不得被演示「美化」成已验收**）；成本未知场景 `totalAmount:null`；静态检查同 C2。
- 全量测试全过；汇报「做到 / 没做到 / 未验证」，与磁盘一致。**不要重启服务。**
