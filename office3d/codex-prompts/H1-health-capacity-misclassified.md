# H1：运行健康把「模型繁忙」误判成「额度」并给出错误建议（只改 `health.mjs` 与对应测试，约 20–30 分钟）

**执行者：Trae（新会话或接在当前会话之后）。主线。** 先读：`_common.md`、`_lane-main.md`、`health.mjs`（`classifyFailure / buildHealth / CATEGORY`）、`tests\health*.test.mjs`、`ui.js` 里「额度与运行健康」面板（约第 585–610 行，**只读参考**）。开工先备份 `health.mjs` 到 `E:\VirtualAIOffice\paperclip-ops\office3d-backup-h1`（上一级目录）。**只允许改 `health.mjs` 与它的测试**（面板文案若要随之调整，另列出，≤ 5 行，且改 `ui.js` 后必须在浏览器里验证加载遮罩消失、无错误条、控制台 0 错误）。

## 事实（董事会侧查证，真实数据）
董事会看到治理中心提示「**额度 · 影响 OpsLead · 恢复：未知 · 检查 Claude 会话额度或等待恢复时间**」，认为 OpsLead 状态正常、是统计出错。核对 Paperclip：
- OpsLead 的模型是 **`gpt-5.6-terra`（不是 Claude）**，状态 `running`；
- 最近一次失败是一条 **`errorCode = provider_quota`、消息为「Selected model is at capacity. Please try a different model.」**（**模型当前繁忙 / 容量不足，是瞬时的上游容量问题，不是会话额度耗尽**），**3 分钟后同一个同事就有成功的运行，当前又在执行新运行**；
- `classifyFailure` 一见 `errorCode === 'provider_quota'` 就归为 `quota`，于是：① 把**瞬时的模型繁忙**当成**额度告警**；② 建议文案固定写「**检查 Claude 会话额度**」，对 GPT / DeepSeek 同事也这么写，**误导**；③ 告警要等到「之后出现一次 `succeeded`」才消失，而 `running`（长任务）不算成功，所以**可能一直挂满 2 小时**。

## 要求
1. **分类细化（不要只看 `errorCode`）**：`provider_quota` 且文本匹配 `at capacity | overloaded | capacity | try a different model | server is busy | rate limited temporarily` 这类**容量 / 繁忙**信号 → 归为 **`upstream`（上游抖动）**，不进「额度」；只有文本匹配 `session limit | usage limit | hit your .* limit | quota exceeded | insufficient quota | billing` 之类**额度耗尽**信号才归 `quota`；无法判断时保持 `quota` 但在 `failure` 里标 `ambiguous:true`。**测试要覆盖上述每一类，且包含这条真实消息。**
2. **建议文案按模型家族区分**：`quota` 的 `advice` 不再固定写 Claude：Claude 同事 →「检查 Claude 会话额度或等待恢复时间。」；GPT / Codex 同事 →「检查 OpenAI / Codex 额度或等待恢复；若提示模型繁忙，稍后会自动重试。」；DeepSeek 同事 → 相应写法；`upstream` →「上游模型繁忙或网络抖动，通常稍后自动恢复；持续出现再检查。」（建议由 `buildHealth` 根据受影响同事的 `family` 生成，同一事件涉及多个家族时合并成一句）。
3. **恢复判定**：失败之后，只要**同一同事**出现**任何更晚的 `running` 或 `succeeded` 运行**（`running` 表示已重新开始执行），就视为已恢复、告警消失；不要求等到 `succeeded`。把这条规则写进注释并有测试（失败 → 之后 `running` → 无告警；失败 → 之后 `cancelled` → 仍有告警（取消不代表恢复））。
4. **不改变**：24 小时窗口、`login / worktree_lock` 的判定、`NOT_FAILURE_*` 集合、失败率统计口径。
5. `node --test tests/*.test.mjs` 全过，**不得放宽既有断言**（若某条既有断言写死了「额度 + Claude 文案」，列出并说明理由）；汇报「做到 / 没做到 / 未验证」，与磁盘一致；**用上面这条真实运行记录构造测试夹具**（只保留状态、`errorCode`、消息、时间、同事模型，不含其他内容）。**不要重启服务。**
