# DR 全景总览只读数据契约

## 消费接口

Codex UI 只能消费 `DrOverviewData v2`，不得直接把 `/state`、演示快照或任意
供应商载荷渲染到界面。

```js
import { createDrOverviewAdapter, createDemoDrOverview } from './dr-overview-data.mjs'

const demo = createDemoDrOverview({ companyId: 'demo-company', seed: 2808, timeSlice: 0 })

// 只能由已完成认证、授权与公司绑定校验的集成层注入此函数。
// source 中的任何布尔声明均不能自行授予 live 权限。
const adaptAuthorizedLive = createDrOverviewAdapter({
  verifyLive: ({ companyId, source, payload }) => {
    const context = resolveAuthorizedReadOnlyContext() // 由既有受信边界提供
    return context.companyId === companyId &&
      context.companyId === source.companyId &&
      context.companyId === payload.companyId
      ? { ok: true, companyId, sourceName: context.sourceName }
      : { ok: false }
  },
})

const overview = adaptAuthorizedLive({
  companyId,
  payload: authorizedReadOnlyPayload,
  source: {
    kind: 'live',
    name: 'approved-read-only-source',
    companyId,
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

- 顶层 `provenance.source` 是受信验证器确认的来源名；`provenance.assertedSource`
  仅记录输入中声称的来源名，不能作为授权证明；`provenance.verification` 记录其是否由
  注入的受信上下文确认。
- `state` 只能是 `live`、`demo` 或 `unavailable`。
- `live` 只有在注入的受信验证器确认请求公司、来源公司、payload 公司与既有授权上下文
  精确一致，且 `now`、`observedAt` 均有效时产生。调用者写在 payload/source 中的
  `authenticated`、`authorized`、`verified` 布尔值不构成证据。
- 缺失、非法、跨公司或未经验证的 live 载荷返回 `unavailable`，不会回退成 demo。
- `demo` 仅来自调用方显式选择的确定性演示快照；它的 `provenance.verified` 永远是
  `false`。
- live `now` 必须由受信集成上下文显式传入；缺失/非法为 `NOW_REQUIRED`。默认容许未来
  30 秒，超出为 `FUTURE_OBSERVATION`；超过 `maxAgeMs` 为 `STALE`。两者都整体降级为
  `unavailable`，绝不把负 age 截断成新鲜。
- demo 时间是由 `timeSlice` 推导的合成 ISO 时间，不是当前业务时间；demo 公司 ID 必须
  匹配 `demo-*`，不能把演示快照标记到真实公司。

现有 `dr-console-data.js` 兼容为 demo 输入。其数字和参考图
`DR智慧仓配中心全景仪表盘6.0.png` 都是设计演示，不是业务记录。

## 结构

顶层固定字段：

```text
schemaVersion, companyId, generatedAt, mode, provenance, freshness,
facilities, inventory, activity, transport, work, equipment, alerts, utilization, map
```

- `facilities` 固定包含且必须完整覆盖 `W1`、`W2`、`W3`；重复、未知、缺失 ID 或容量
  不可能值会使全景总览整体为 `unavailable`。
- `inventory`、入库/出库活动、车辆/运单、工单、设备、告警与利用率都保留字段级来源。
- live 事件 `at` 与运单 ETA 必须为 ISO 时间；演示事件与 ETA 生成合成时间。未知事件、
  任务、运单状态不会以零计入 live 聚合。
- `map` 始终是 `demo` 状态的静态示意，明确不代表实时车辆位置；周边数据 live 不会使其
  变成 live。

只读样例载荷在 `tests/fixtures/dr-overview-live.json`。它仅用于测试公司边界与
标准化，不是生产记录。

## 集成要求

1. UI 必须显示或可访问 `state` 与 `observedAt`；`unavailable` 显示未知原因，不显示
   demo 数字。
2. 只有已授权的数据提供方可传入 `kind: 'live'`。本模块不新增 API 路由，也不处理
   token、认证或权限升级。
3. 载荷必须在调用前已按 `companyId` 隔离；验证器必须拒绝授权上下文、请求、source、
   payload 任一不匹配的情况。适配器不会尝试合并多公司数据。
4. 使用新来源前需独立确认字段口径、来源授权、时间戳、分页完整性与敏感字段脱敏。
5. `createDrOverviewAdapter` 是信任边界的依赖注入点，不是认证系统。若不存在权威验证器，
   必须使用默认适配器并得到 `TRUST_CONTEXT_REQUIRED`，不能伪造 live。
6. 本模块不改变 W1/W2/W3、模拟标签、场景行为或任何库存/设备操作。
