import assert from 'node:assert/strict'
import test from 'node:test'
import { costCards, duration, measurement, playbackAllowed, reasonLabel, relationRows, REASON_LABELS, responseKind, SEMANTICS, stageLabel, taskRows } from '../command-view-render.js'
import { buildDemoCommandView, listDemoScenarios } from '../command-view-demo.mjs'
import { REASONS } from '../command-view-validate.mjs'

test('all C2 reason codes have Chinese labels; unknown codes do not disappear', () => {
  for (const reason of REASONS) assert.ok(REASON_LABELS[reason], reason)
  assert.equal(reasonLabel('NEW_REASON'), '原因未归类')
})
test('unknown is not zero; confirmed zero stays zero', () => {
  assert.equal(measurement({ value: null, reason: 'USAGE_NOT_RETURNED' }), '未知 · 未返回用量')
  assert.equal(measurement({ value: 0, reason: null }), '0')
  assert.match(measurement(undefined), /未知/)
})
test('stage and color semantics distinguish acceptance, waiting, execution and uncertainty', () => {
  assert.deepEqual(stageLabel('pending_verification'), { label: '待验证（无证据）', tone: 'unknown', icon: '?' })
  assert.equal(stageLabel('accepted').tone, 'success')
  assert.equal(stageLabel('awaiting_acceptance').tone, 'waiting')
  assert.equal(stageLabel('executing').tone, 'execution')
  assert.equal(stageLabel('invalid').tone, 'unknown')
  assert.deepEqual(Object.keys(SEMANTICS), ['success', 'waiting', 'failure', 'unknown', 'execution'])
  for (const value of Object.values(SEMANTICS)) assert.ok(value.icon && value.label)
})
test('duration uses only supplied waiting milliseconds', () => {
  assert.equal(duration({ value: 59000, reason: null }), '59 秒')
  assert.equal(duration({ value: 61000, reason: null }), '1 分钟')
  assert.equal(duration({ value: 3660000, reason: null }), '1 小时 1 分钟')
  assert.equal(duration({ value: null, reason: 'NO_STATUS_TRANSITION' }), '未知 · 缺少状态转换证据')
})
test('cost cards retain unknown amounts and confirmed subtotal, not invented total', () => {
  const cards = costCards(buildDemoCommandView().summary.cost)
  assert.deepEqual(cards.map((row) => row.label), ['已确认成本', '未返回用量的执行数', '最后更新时间'])
  assert.match(cards[0].value, /未知/)
  assert.doesNotMatch(cards[0].value, /0\.00/)
  assert.match(costCards({ currency: 'USD', confirmedAmount: { value: 0, reason: null } })[0].value, /USD 0\.00 · 小计/)
})
test('all real demo slices render deterministically without mutating the response', () => {
  for (const scenario of listDemoScenarios()) for (let timeSlice = 0; timeSlice < scenario.timeSlices; timeSlice++) {
    const data = buildDemoCommandView({ scenario: scenario.id, timeSlice })
    const before = structuredClone(data)
    const rendered = taskRows(data)
    assert.deepEqual(rendered, taskRows(data))
    costCards(data.summary.cost)
    assert.deepEqual(data, before)
    assert.equal(responseKind(data, 'demo'), 'data')
    assert.equal(responseKind(data, 'live'), 'invalid')
  }
})
test('queue pages never show more than twenty and filters do not infer stages', () => {
  const row = buildDemoCommandView().queue[0]
  const data = { queue: Array.from({ length: 45 }, (_, index) => ({ ...row, taskId: `demo-row-${index}` })) }
  assert.equal(taskRows(data).items.length, 20)
  assert.equal(taskRows(data, { page: 2 }).items.length, 5)
  assert.equal(taskRows(data).pages, 3)
  assert.equal(taskRows(data, { filter: 'accepted' }).items.length, 0)
})
test('unreliable or missing call relations produce no edges and honest gap', () => {
  const edge = { from: 'demo-a', to: 'demo-b', source: 'activity' }
  assert.deepEqual(relationRows({ items: [edge], complete: false, reason: 'NO_CALL_EVIDENCE' }, 'calls').items, [])
  assert.equal(relationRows({ items: [], complete: true }, 'calls').notice, '暂无可靠调用链')
  assert.equal(relationRows({ items: [edge], complete: true }, 'calls').items.length, 0)
  assert.equal(relationRows({ items: [{ ...edge, source: 'runs' }], complete: true }, 'calls').items.length, 1)
})
test('live accepts only authorized-scope empty envelope; never demo fallback', () => {
  const empty = { kind: 'empty', data: null, reason: 'NO_AUTHORIZED_LIVE_SCOPE' }
  assert.equal(responseKind(empty, 'live'), 'empty')
  assert.equal(responseKind(empty, 'demo'), 'invalid')
  assert.equal(responseKind({ ...empty, data: buildDemoCommandView() }, 'live'), 'invalid')
  assert.equal(responseKind({ mode: 'demo' }, 'demo'), 'invalid')
})
test('playback is denied when hidden, reduced, stale, busy, live or at final slice', () => {
  const input = { mode: 'demo', hidden: false, reduced: false, stale: false, animationAllowed: true, busy: false, slice: 0, slices: 6 }
  assert.equal(playbackAllowed(input), true)
  for (const change of [{ hidden: true }, { reduced: true }, { stale: true }, { busy: true }, { animationAllowed: false }, { mode: 'live' }, { slice: 5 }]) {
    assert.equal(playbackAllowed({ ...input, ...change }), false)
  }
})
