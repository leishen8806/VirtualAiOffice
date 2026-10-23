# VIS3-DATA-001-FIX2 最终处置记录

## 基线

- 审查 SHA：`917dc842d10730757231f4072535d5cd236a1200`
- 修复分支：`feature/vis3-dr-data-001`
- 修复策略：只追加 DATA 专属提交；不改写审查提交、VIS2 祖先或未提交的 Helix 文档。

## G-01 至 G-09

| 编号 | 处置 | 验证 |
| --- | --- | --- |
| G-01 | `events`、`tasks`、`waybills`、`vehicles`、`alerts`、`devices` 在 live 中均为必填数组；空数组有效，非数组整体 `unavailable`。 | 缺失、`null`、对象、字符串和空数组逐项回归。 |
| G-02 | 构建适配器时校验 `maxAgeMs`、`maxFutureMs` 都是有限非负数。 | 覆盖负数、`NaN`、`Infinity`、字符串和非默认边界。 |
| G-03 | 运行时间、事件时间与 ETA 使用带时区的严格 ISO 8601 校验。 | 拒绝 `1`、`May 5`、无时区、非法日期与非法偏移；接受 `+07:00`。 |
| G-04 | 车辆必须有 W1/W2/W3 区域和布尔 `inYard`；非法记录不允许保留 live 总计。 | 区域和布尔变异回归。 |
| G-05 | demo 固定从内置确定性 `buildSnapshot(seed,timeSlice)` 生成，忽略调用方 payload。 | 跨公司任意 payload 无法改变 demo 输出。 |
| G-06 | 覆盖验证器返回公司、运单词表、设备/告警、重复设施、车辆数、待处理任务与告警总数相关不变量。 | 聚焦测试和关键突变回归。 |
| G-07 | 验证器同步抛错返回 `VERIFIER_ERROR`。 | 同步抛错测试。 |
| G-08 | Promise/thenable 验证器明确不支持，返回 `ASYNC_VERIFIER_UNSUPPORTED`。 | 异步返回测试。 |
| G-09 | slot/业务计数必须是非负整数；类别 `(name, unit)` 唯一；阈值仅创建时配置。 | 小数设备数、重复类别、阈值边界回归。 |

## 变异与限制

本次没有伪造 mutation score。核心突变测试确认缺 W 覆盖、零容量、负库存、非法 live
事件时间、非法 ETA、非法车辆、非法设备/告警、重复类别等均不能保留 `live`。仍未使用
外部 mutation runner，原因是仓库未提供其可复现配置；这些语义突变由 Node 测试直接执行。

## 干净集成

未来仅在获批基线上依次转移以下 DATA 提交：

```text
27fe1687d676afca53677875778131c34ece9cf7  VIS3-DATA-001
917dc842d10730757231f4072535d5cd236a1200  FIX1
<FIX2_SHA>                                  FIX2
```

当前 feature 分支携带不属于 DATA 交付的 VIS2 祖先，禁止整体合并到 `main`。逐个
`cherry-pick` 后应运行 `office3d/tests/dr-overview-data.test.mjs` 与完整回归。

## 剩余风险

- 当前没有已授权真实只读 WMS/TMS 来源。无受信同步验证器时 live 会按设计保持
  `TRUST_CONTEXT_REQUIRED`。
- 静态柬埔寨地图永远是 demo 参考，不是实时车队数据。
- 完整回归里的历史夹具/配置失败不由本 DATA 模块修复，必须和本次新增失败分开判断。

## 验证

- 聚焦：`node --max-old-space-size=2048 --test --test-timeout=60000
  tests/dr-overview-data.test.mjs tests/dr-console-data.test.mjs`，结果 `17 pass / 0 fail`。
- 完整：`node --max-old-space-size=2048 --test --test-timeout=60000 tests/*.test.mjs`，
  结果 `1037 pass / 17 fail / 1 skipped`。相对审查 SHA 的 `1032 pass / 17 fail /
  1 skipped`，新增通过项来自 FIX2 回归；17 项失败集合未扩大。
- 失败仍是隔离快照缺少历史备份/配置，以及既有仓配隐藏态生命周期断言。没有跳过、
  删除或削弱这些测试。
