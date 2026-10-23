# DR 全景总览只读数据契约

## 消费接口

Codex UI 只能消费 `DrOverviewData v1`，不得直接把 `/state`、演示快照或任意
供应商载荷渲染到界面。

```js
import { adaptDrOverview, createDemoDrOverview } from './dr-overview-data.mjs'

const demo = createDemoDrOverview({ companyId: 'demo-company', seed: 2808, timeSlice: 0 })

const overview = adaptDrOverview({
  companyId,
  payload: authorizedReadOnlyPayload,
  source: {
    kind: 'live',
    name: 'approved-read-only-source',
    companyId,
    authenticated: true,
    authorized: true,
    verified: true,
    observedAt: '2026-10-23T10:00:00.000Z',
  },
  now: new Date().toISOString(),
})
```

这是纯函数接口：不会 fetch、轮询、写入、创建计时器或调用 Paperclip。调用方负责
获得已鉴权的只读载荷，但不得绕过现有公司隔离边界。

## 状态与溯源

每个数值指标都是：

```text
{ value, state, source, observedAt, freshness, reason }
```

- `state` 只能是 `live`、`demo` 或 `unavailable`。
- `live` 只有在来源同时声明并通过 `authenticated: true`、`authorized: true`、
  `verified: true`、精确 `companyId` 匹配、有效 `observedAt` 时产生。
- 缺失、非法、跨公司或未经验证的 live 载荷返回 `unavailable`，不会回退成 demo。
- `demo` 仅来自调用方显式选择的确定性演示快照；它的 `provenance.verified` 永远是
  `false`。
- `freshness.stale` 仅描述时间新鲜度，不把旧数据伪装为当前数据。

现有 `dr-console-data.js` 兼容为 demo 输入。其数字和参考图
`DR智慧仓配中心全景仪表盘6.0.png` 都是设计演示，不是业务记录。

## 结构

顶层固定字段：

```text
schemaVersion, companyId, generatedAt, mode, provenance, freshness,
facilities, inventory, activity, transport, work, equipment, alerts, utilization, map
```

- `facilities` 固定包含 `W1`、`W2`、`W3`。
- `inventory`、入库/出库活动、车辆/运单、工单、设备、告警与利用率都保留字段级来源。
- `map` 仅提供柬埔寨演示地点参考，明确不代表实时车辆位置。

只读样例载荷在 `tests/fixtures/dr-overview-live.json`。它仅用于测试公司边界与
标准化，不是生产记录。

## 集成要求

1. UI 必须显示或可访问 `state` 与 `observedAt`；`unavailable` 显示未知原因，不显示
   demo 数字。
2. 只有已授权的数据提供方可传入 `kind: 'live'`。本模块不新增 API 路由，也不处理
   token、认证或权限升级。
3. 载荷必须在调用前已按 `companyId` 隔离；适配器拒绝源公司不匹配，但不会尝试合并
   多公司数据。
4. 使用新来源前需独立确认字段口径、来源授权、时间戳、分页完整性与敏感字段脱敏。
5. 本模块不改变 W1/W2/W3、模拟标签、场景行为或任何库存/设备操作。
