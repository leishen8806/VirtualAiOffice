# VIS3-DATA-001-FIX1 处置与集成记录

## 基线与审计

- 被审查提交：`27fe1687d676afca53677875778131c34ece9cf7`
- 修复分支：`feature/vis3-dr-data-001`
- 修复方式：仅追加提交；不改写审查提交或任何历史。
- 审计作者事实：`27fe168` 的 Author 是 `QAAutomation
  <qa-automation@paperclip.local>`，Committer 是 `trae-solo-agent
  <solo-agent@trae.ai>`。相同作者还出现在当前 VIS2 集成链中；本次只读核对，
  不以改写提交来改变审计信息。

## F-01 至 F-12 处置

| 编号 | 结论 | FIX1 处置 |
| --- | --- | --- |
| F-01 | 已修复 | live 必须有显式有效 `now`；无效为 `NOW_REQUIRED`。默认未来容差 30 秒，超出为 `FUTURE_OBSERVATION`；超过 `maxAgeMs` 为 `STALE`，不再截断负 age。 |
| F-02 | 已修复 | live 同时校验请求公司、source 公司、payload 公司和受信验证器返回的公司；任一不一致为 `COMPANY_SCOPE_MISMATCH` 或验证失败。 |
| F-03 | 已修复 | W1/W2/W3 必须完整、唯一且容量可行；库存总数与类别和必须一致。缺项/非法不会被零填充。 |
| F-04 | 已修复 | 缺少仓库状态输出字段级 `unavailable/STATUS_UNKNOWN`，不再替换为 `known`。 |
| F-05 | 已修复 | 柬埔寨地图始终标记 `demo/static-demonstration-map`，live 周边指标不会提升其状态。 |
| F-06 | 已修复 | 事件、任务和运单状态使用冻结词表；未知值、live 事件非 ISO 时间、live ETA 非 ISO 时间均整体失败关闭。 |
| F-07 | 已修复 | 导出并强制使用 `DR_FACILITY_IDS = W1/W2/W3`；未知、重复、缺失 ID 均拒绝。 |
| F-08 | 已修复 | `authenticated/authorized/verified` 等调用方布尔断言不再参与 live 判定；只有注入的受信 `verifyLive` 才能授予 live。 |
| F-09 | 已修复 | 扩充回归用例，覆盖时钟、越界公司、缺失覆盖、非法容量/库存、未知词表、缺失状态与地图语义。 |
| F-10 | 已修复 | demo 使用基于 `timeSlice` 的确定性合成 ISO 时间，且公司 ID 必须匹配 `demo-*`。 |
| F-11 | 已修复 | 事件时间与 live ETA 的格式契约明确为 ISO；demo 转换为合成 ISO 度量，不把展示文本当业务时间。 |
| F-12 | 已记录 | 适配器无法自行证明认证事实；这是刻意的架构边界。没有权威验证器时默认适配器返回 `TRUST_CONTEXT_REQUIRED`，而非产生 unverifiable live。 |

## 信任边界

`createDrOverviewAdapter({ verifyLive })` 只能由已有认证/授权网关或同等受信集成层创建。
验证器必须从服务端已认证主体、公司授权范围与上游来源绑定中推导结果，而不是读取浏览器
或 payload 的布尔字段。本模块不新增认证、路由或 API；无验证器就 fail closed。

## 分支与部署风险

远端默认分支 `main` 的公开 HEAD 为 `2f022fe`。当前 feature 分支从 Office3D 独立快照
链派生，分叉点为 `47efb7e`，并携带 VIS2 公共场景候选提交。因此不能将整个
`feature/vis3-dr-data-001` 合并到 `main`：会把未经本任务批准的 VIS2 历史一并带入。

已只读确认 `main` 可达 PR #35（B1）和 PR #36（A-FIX1）的合并提交。`main` 中的
`office-visual.json` 与 `campus-visual.json` 均不存在；因此主线不能被描述为拥有本候选
分支的 JSON 开关保护。当前 feature 分支的视觉接线仍采用 JSON 缺失/损坏即关闭的
fail-closed 设计，但这不证明 `main` 的 PR #35/#36 视觉路径已完成全场景验收或部署审查。
该历史风险不在本数据修复范围内。

## 干净的后续集成策略

未来只转移 DATA 专属提交：

```text
27fe168  feat(office3d): add DR overview read-only data contract
<FIX1_SHA> fix(office3d): harden DR overview data integrity
```

在获批的、最新 `main` 或单独批准的集成基线上逐个 `cherry-pick`，每个提交后运行
`tests/dr-overview-data.test.mjs` 与相关完整回归。不得把本 feature 的 VIS2 祖先提交
作为 DATA 交付的一部分，也不得用该文档宣布任何视觉模块已经上线。

## 验证基线

- 聚焦：`node --max-old-space-size=2048 --test --test-timeout=60000
  tests/dr-overview-data.test.mjs tests/dr-console-data.test.mjs`，结果 `12 pass / 0 fail`。
- 完整：`node --max-old-space-size=2048 --test --test-timeout=60000 tests/*.test.mjs`，
  结果 `1032 pass / 17 fail / 1 skipped`。相对于审查提交的 `1029 pass / 17 fail /
  1 skipped`，新增的三项为 FIX1 数据完整性回归；失败集合未扩大。
- 17 项既有失败来自隔离快照未附带的历史备份/配置文件，以及既有仓配隐藏态生命周期断言。
  未删除、跳过或弱化任何失败测试。

变异测试不追求表面分数：固定覆盖 W 覆盖缺失、容量为零、负库存、非 ISO 事件时间和非
ISO live ETA 五类关键突变，任一突变均不得保留 `live` 聚合。
