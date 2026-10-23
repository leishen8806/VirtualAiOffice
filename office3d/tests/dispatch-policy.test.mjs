// DS-8：dispatch-policy.mjs 的纯模块矩阵测试。
// 三模式 × 依赖形态 × 例外 × force；创建三模式 × 契约状态 × 是否指定负责人。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_REASON_CODES,
  MODES,
  NEW_REASON_CODES,
  OFF_POLICY,
  decideAssign,
  decideCreate,
  dispatchMessage,
  loadDispatchPolicy,
} from '../dispatch-policy.mjs'
import { REASON_CODES } from '../scheduler-core.mjs'

const AT = '2026-10-23T00:00:00.000Z'
const policy = (mode, extra = {}) => loadDispatchPolicy({ mode, ...extra })
const blocker = (status, identifier = 'CMP-9') => ({ id: `b-${status}`, identifier, status })

const ASSIGN_CASES = {
  none: [],
  pending: [blocker('todo')],
  done: [blocker('done')],
  cancelled: [blocker('cancelled')],
  malformed: [{ identifier: 'CMP-?', status: '' }],
}

test('loadDispatchPolicy：缺失 / 损坏 / 未知字段 / 非法值一律回退 off', () => {
  for (const raw of [undefined, null, '', '{bad', { mode: 'bogus' }, { mode: 'enforce', extra: 1 }, { mode: 'enforce', cancelledDependencySatisfies: 'yes' }]) {
    assert.equal(loadDispatchPolicy(raw).mode, 'off')
  }
  assert.equal(OFF_POLICY.mode, 'off')
  assert.deepEqual([...MODES], ['off', 'warn', 'enforce'])
  for (const mode of ['warn', 'enforce']) {
    const loaded = loadDispatchPolicy({ mode, cancelledDependencySatisfies: true })
    assert.equal(loaded.mode, mode)
    assert.equal(loaded.cancelledDependencySatisfies, true)
    assert.equal(Object.isFrozen(loaded), true)
  }
})

test('off：与旧行为一致（取消算满足、force 放行、未完成拒绝）', () => {
  const p = policy('off')
  const allow = (blockers, force = false) => decideAssign({ policy: p, issue: { id: 't1' }, blockers, force, at: AT })
  assert.equal(allow([]).allow, true)
  assert.equal(allow(ASSIGN_CASES.done).allow, true)
  assert.equal(allow(ASSIGN_CASES.cancelled).allow, true, 'off 下取消依赖算满足（旧口径）')
  assert.equal(allow(ASSIGN_CASES.pending).allow, false)
  assert.equal(allow(ASSIGN_CASES.pending, true).allow, true, 'off 下 force 仍可直接放行')
  assert.equal(allow(ASSIGN_CASES.malformed).allow, false)
  assert.deepEqual(allow(ASSIGN_CASES.pending).reasons, ['DEP_PENDING'])
  assert.deepEqual(allow(ASSIGN_CASES.pending).legacyOpen, ['CMP-9'])
})

test('warn：一律放行，但按依赖形态给原因码', () => {
  const p = policy('warn')
  for (const [name, blockers] of Object.entries(ASSIGN_CASES)) {
    const result = decideAssign({ policy: p, issue: { id: 't1' }, blockers, at: AT })
    assert.equal(result.allow, true, name)
    const expected = name === 'pending' ? 'DEP_PENDING' : name === 'cancelled' ? 'DEP_CANCELLED' : name === 'malformed' ? 'DEP_UNKNOWN' : null
    if (expected) assert.ok(result.reasons.includes(expected), `${name} 应报告 ${expected}`)
    else assert.deepEqual(result.reasons, [], name)
    assert.equal(result.audit.warnOnly, true)
  }
})

test('enforce：依赖未满足拒绝，force 不再生效，取消依赖默认不满足', () => {
  const p = policy('enforce')
  const allow = (blockers, force = false) => decideAssign({ policy: p, issue: { id: 't1' }, blockers, force, at: AT })
  assert.equal(allow([]).allow, true)
  assert.equal(allow(ASSIGN_CASES.done).allow, true)
  for (const name of ['pending', 'cancelled', 'malformed']) {
    assert.equal(allow(ASSIGN_CASES[name]).allow, false, name)
  }
  assert.equal(allow(ASSIGN_CASES.pending, true).allow, false, 'enforce 下 force 不生效')
  assert.ok(allow(ASSIGN_CASES.cancelled).reasons.includes('DEP_CANCELLED'))
  const lenient = decideAssign({
    policy: policy('enforce', { cancelledDependencySatisfies: true }),
    issue: { id: 't1' },
    blockers: ASSIGN_CASES.cancelled,
    at: AT,
  })
  assert.equal(lenient.allow, true, '显式允许时取消依赖算满足')
})

test('enforce 例外：本机 + 理由 ≥10 字才放行并写审计；LAN / 过短被拒', () => {
  const p = policy('enforce')
  const reason = '本机董事会核对依赖后特批指派'
  const granted = decideAssign({ policy: p, issue: { id: 't1' }, blockers: ASSIGN_CASES.pending, override: { reason }, localFullAccess: true, at: AT })
  assert.equal(granted.allow, true)
  assert.equal(granted.audit.override, true)
  assert.equal(granted.audit.overrideReason, reason)
  assert.equal(granted.audit.overrideAt, AT)
  assert.ok(granted.reasons.includes('DEP_PENDING'), '特批不掩盖原问题')

  const short = decideAssign({ policy: p, issue: { id: 't1' }, blockers: ASSIGN_CASES.pending, override: { reason: '太短' }, localFullAccess: true, at: AT })
  assert.equal(short.allow, false)
  assert.ok(short.reasons.includes('OVERRIDE_NOT_ALLOWED'))

  const lan = decideAssign({ policy: p, issue: { id: 't1' }, blockers: ASSIGN_CASES.pending, override: { reason }, localFullAccess: false, at: AT })
  assert.equal(lan.allow, false, 'LAN / 大屏不能特批')
  assert.ok(lan.reasons.includes('OVERRIDE_NOT_ALLOWED'))

  const bodyOverride = decideAssign({ policy: p, issue: { id: 't1' }, blockers: ASSIGN_CASES.pending, override: { reason }, at: AT })
  assert.equal(bodyOverride.allow, false, '未声明本机完整权限不能特批')
})

test('创建矩阵：off/warn 与现状一致，enforce 契约不完整只能草稿', () => {
  const wants = true
  for (const mode of ['off', 'warn']) {
    for (const state of ['none', 'incomplete', 'complete']) {
      const result = decideCreate({ policy: policy(mode), contractCheck: { state }, wantsExecutable: wants, at: AT })
      assert.equal(result.allowExecutable, true, `${mode}/${state} 指定负责人就应可执行`)
      assert.equal(result.forceDraft, false)
      const expected = state === 'none' ? 'NO_CONTRACT' : state === 'incomplete' ? 'CONTRACT_INCOMPLETE' : null
      if (mode === 'off') assert.deepEqual(result.reasons, [])
      else if (expected) assert.ok(result.reasons.includes(expected), `${mode}/${state} 应带原因`)
    }
  }
  for (const state of ['complete', 'incomplete', 'none']) {
    const result = decideCreate({ policy: policy('enforce'), contractCheck: { state }, wantsExecutable: wants, at: AT })
    assert.equal(result.allowExecutable, state === 'complete', `enforce/${state}`)
    assert.equal(result.forceDraft, state !== 'complete', `enforce/${state}`)
    if (state !== 'complete') assert.ok(result.reasons.some((code) => ['NO_CONTRACT', 'CONTRACT_INCOMPLETE'].includes(code)))
  }
  const draftOnly = decideCreate({ policy: policy('enforce'), contractCheck: { state: 'incomplete' }, wantsExecutable: false, at: AT })
  assert.equal(draftOnly.allowExecutable, false)
  assert.equal(draftOnly.forceDraft, false, '本来就不指定负责人，不需要强转草稿')
  assert.deepEqual(draftOnly.reasons, [])
})

test('所有 reasons 都在 REASON_CODES ∪ NEW_REASON_CODES 内，没有未登记码', () => {
  const registered = new Set(ALL_REASON_CODES)
  for (const code of REASON_CODES) assert.ok(registered.has(code))
  for (const code of NEW_REASON_CODES) assert.ok(registered.has(code))
  const results = []
  for (const mode of MODES) {
    for (const blockers of Object.values(ASSIGN_CASES)) {
      results.push(decideAssign({ policy: policy(mode), issue: { id: 't1' }, blockers, at: AT }))
      results.push(decideAssign({ policy: policy(mode), issue: { id: 't1' }, blockers, force: true, override: { reason: '不合格' }, at: AT }))
    }
    for (const state of ['none', 'incomplete', 'complete']) results.push(decideCreate({ policy: policy(mode), contractCheck: { state }, wantsExecutable: true, at: AT }))
  }
  for (const result of results) for (const code of result.reasons) assert.ok(registered.has(code), `未登记原因码：${code}`)
})

test('纯度：不修改入参、重复调用结果相等、消息可读', () => {
  const input = {
    policy: policy('enforce'),
    issue: { id: 't1', blockedBy: [blocker('todo')] },
    blockers: [blocker('todo')],
    override: null,
  }
  const snapshot = JSON.stringify(input)
  const first = decideAssign(input)
  const second = decideAssign(input)
  assert.deepEqual(second, first)
  assert.equal(JSON.stringify(input), snapshot)
  assert.match(dispatchMessage(first), /派发准入/)
})
