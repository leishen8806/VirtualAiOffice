export const REASON_LABELS = Object.freeze({
  NOT_LOADED: '尚未加载', SOURCE_DISABLED: '数据源未开启', SOURCE_FAILED: '数据源读取失败',
  PARTIAL_PAGE: '集合不完整', UNKNOWN_TIME: '时间未知', DISCONNECTED: '连接中断',
  STALE_DATA: '数据已过期', EVIDENCE_NOT_CONNECTED: '证据未接入', LEGACY_BASELINE: '旧基线，未建立有效验收',
  NO_TEST_EVIDENCE: '缺少测试证据', NO_ACCEPTANCE_EVIDENCE: '缺少验收证据',
  NO_AUTHORIZATION_EVIDENCE: '缺少授权证据', NO_EXECUTION_EVIDENCE: '缺少执行证据',
  NO_CHECKOUT_EVIDENCE: '缺少领取证据', NO_STATUS_TRANSITION: '缺少状态转换证据',
  NO_CALL_EVIDENCE: '缺少可靠调用来源', DEP_NOT_LOADED: '依赖尚未加载', DEP_UNKNOWN: '依赖未知',
  OWNER_UNKNOWN: '处理人未知', USAGE_NOT_RETURNED: '未返回用量', RUN_MODEL_NOT_RETURNED: '未返回实际模型',
  NO_CONFIRMED_COST: '没有已确认成本', COST_NOT_RETURNED: '成本未返回', NOT_APPLICABLE: '不适用',
  SYNTHETIC_DEMO: '合成演示，不是真实证据', MIXED_CURRENCY: '多币种，不能合计',
  VERSION_MISMATCH: '版本不一致', PROTECTED_TEST_MISMATCH: '保护测试不一致',
})
export const SEMANTICS = Object.freeze({
  success: Object.freeze({ icon: '✓', label: '有效验收 / 恢复' }),
  waiting: Object.freeze({ icon: '◇', label: '等待决策' }),
  failure: Object.freeze({ icon: '!', label: '明确失败' }),
  unknown: Object.freeze({ icon: '?', label: '未知 / 失效' }),
  execution: Object.freeze({ icon: '→', label: '执行' }),
})
const STAGES = Object.freeze({
  requirement_confirmed: ['需求确认', 'waiting'], claimed: ['已领取', 'execution'],
  executing: ['执行中', 'execution'], verifying: ['验证中', 'execution'],
  awaiting_acceptance: ['待验收', 'waiting'], accepted: ['已验收', 'success'],
  pending_verification: ['待验证（无证据）', 'unknown'],
})
const BLOCKERS = Object.freeze({
  authorization: '等待授权', dependency: '等待依赖', budget: '等待预算决策',
  verification_failed: '验证失败', executor: '执行器待处理', delivered_unaccepted: '已交付，未验收',
  none: '无已知阻塞', unknown: '阻塞未知',
})
export const reasonLabel = (code) => REASON_LABELS[code] || '原因未归类'
export function stageLabel(stage) {
  const [label, tone] = STAGES[stage] || ['阶段未知', 'unknown']
  return { label, tone, icon: SEMANTICS[tone].icon }
}
export function measurement(value, format = String) {
  if (!value || value.value === null || value.value === undefined) return `未知 · ${reasonLabel(value?.reason)}`
  return format(value.value)
}
export function duration(value) {
  return measurement(value, (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return '未知 · 时间未知'
    if (ms < 60000) return `${Math.floor(ms / 1000)} 秒`
    if (ms < 3600000) return `${Math.floor(ms / 60000)} 分钟`
    return `${Math.floor(ms / 3600000)} 小时 ${Math.floor(ms % 3600000 / 60000)} 分钟`
  })
}
export function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value.replace('T', ' ').replace('.000Z', ' UTC').replace(/Z$/, ' UTC') : '未知 · 时间未知'
}
export function costCards(cost = {}) {
  return [
    { label: '已确认成本', value: measurement(cost.confirmedAmount, (amount) => `${cost.currency} ${Number(amount).toFixed(2)} · 小计`), note: `总成本：${measurement(cost.totalAmount)}` },
    { label: '未返回用量的执行数', value: measurement(cost.missingUsageRuns), note: `未知成本运行：${measurement(cost.unknownCostRuns)} / 观察运行：${measurement(cost.observedRuns)}` },
    { label: '最后更新时间', value: measurement(cost.lastUpdatedAt, timestamp), note: '时间来自数据源，不以页面加载时间代替' },
  ]
}
export function taskRows(data, { filter = '', page = 0 } = {}) {
  const rows = data.queue.filter((row) => !filter || row.stage === filter)
  return {
    items: rows.slice(page * 20, page * 20 + 20).map((row) => ({
      ...row, displayStage: stageLabel(row.stage),
      handlerText: measurement(row.nextHandler), waitingText: duration(row.waitingMs),
      blockerText: BLOCKERS[row.blocker] || '阻塞未知',
      reasonText: row.stageReason ? reasonLabel(row.stageReason) : '',
    })),
    pages: Math.max(1, Math.ceil(rows.length / 20)),
  }
}
export function relationRows(collection, kind) {
  const reliableCalls = kind !== 'calls' || (collection?.complete === true &&
    collection.items?.every((row) => ['runs', 'envelope', 'call_event'].includes(row.source)))
  const items = reliableCalls && Array.isArray(collection?.items) ? collection.items : []
  return {
    items,
    notice: kind === 'calls' && (!reliableCalls || !items.length) ? '暂无可靠调用链'
      : !items.length ? '暂无关系数据' : '',
    gap: collection?.complete === false ? `未知 · ${reasonLabel(collection.reason)}` : '',
  }
}
// 两种模式不能混用；live 空状态必须附带已知原因。
export function responseKind(body, mode) {
  if (mode === 'live') {
    if (body?.kind === 'empty' && body.data === null && ['NO_AUTHORIZED_LIVE_SCOPE', 'SOURCE_DISABLED', 'SOURCE_FAILED'].includes(body.reason)) return 'empty'
    return body?.schemaVersion === 1 && body.mode === 'live' && body.quality?.synthetic === false &&
      body.quality.writesAllowed === false && typeof body.company?.id === 'string' &&
      Array.isArray(body.queue) && Array.isArray(body.execution?.items) && Array.isArray(body.timeline?.items) &&
      body.summary?.cost && body.relations && body.quality.freshness && body.scope?.range ? 'data' : 'invalid'
  }
  return body?.schemaVersion === 1 && body.mode === 'demo' && body.quality?.synthetic === true &&
    body.quality.writesAllowed === false && body.company?.id?.startsWith('demo-') &&
    Array.isArray(body.queue) && Array.isArray(body.execution?.items) && Array.isArray(body.timeline?.items) &&
    body.summary?.cost && body.relations && body.quality?.freshness ? 'data' : 'invalid'
}
export function playbackAllowed({ mode, hidden, reduced, stale, animationAllowed, busy, slice, slices }) {
  return mode === 'demo' && !hidden && !reduced && !stale && animationAllowed === true && !busy && slice < slices - 1
}
