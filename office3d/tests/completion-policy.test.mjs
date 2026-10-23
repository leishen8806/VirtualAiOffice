// DS-7：completion-policy.mjs 的纯模块矩阵测试。
// 覆盖三种模式 × 证据场景 × 特批；开关解析；原因码登记；纯度。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_REASON_CODES,
  MODES,
  NEW_REASON_CODES,
  OFF_POLICY,
  buildCompletionEvidence,
  completionMessage,
  decideCompletion,
  loadCompletionPolicy,
} from '../completion-policy.mjs'
import { REASON_CODES } from '../done-rules.mjs'

const AT = '2026-10-23T00:00:00.000Z'
const ENFORCED = '2026-01-01T00:00:00.000Z'
const CURRENT = 'git:repo/oa@abcdef1234567890'
const TASK = { id: 'task-1', createdAt: '2026-06-01T00:00:00.000Z' }
const RECORD = (kind, overrides = {}) => ({
  kind,
  subjectVersion: CURRENT,
  ok: true,
  actor: kind === 'execution' ? 'agent-1' : 'reviewer-1',
  ref: `${kind}-ref`,
  ...overrides,
})
const validRecords = () => [
  RECORD('execution'),
  RECORD('test', { protectedTestsHash: 'hash-1' }),
  RECORD('review'),
  RECORD('acceptance', { actor: 'board-1' }),
  RECORD('merge'),
  RECORD('release'),
]
const structured = (overrides = {}) => ({
  records: validRecords(),
  subjectVersion: CURRENT,
  protectedTestsHash: 'hash-1',
  executorActor: 'agent-1',
  taskCreatedAt: TASK.createdAt,
  ...overrides,
})
const policy = (mode = 'enforce') => loadCompletionPolicy({ mode, enforcedSince: ENFORCED, boardActors: ['board-1'] })

const SCENARIOS = {
  valid: (p) => ({ evidence: structured(), task: TASK, policy: p }),
  missing: (p) => ({ evidence: structured({ records: [] }), task: TASK, policy: p }),
  versionMismatch: (p) => ({ evidence: structured({ records: validRecords().map((row) => ({ ...row, subjectVersion: 'git:repo/oa@1111111' })) }), task: TASK, policy: p }),
  protectedMismatch: (p) => ({ evidence: structured({ records: validRecords().map((row) => (row.kind === 'test' ? { ...row, protectedTestsHash: 'other' } : row)) }), task: TASK, policy: p }),
  selfReview: (p) => ({ evidence: structured({ records: validRecords().map((row) => (row.kind === 'review' ? { ...row, actor: 'agent-1' } : row)) }), task: TASK, policy: p }),
  unauthorizedAcceptance: (p) => ({ evidence: structured({ records: validRecords().map((row) => (row.kind === 'acceptance' ? { ...row, actor: 'agent-2' } : row)) }), task: TASK, policy: p }),
  legacyTask: (p) => ({ evidence: structured(), task: { id: 'old', createdAt: '2025-01-01T00:00:00.000Z' }, policy: p }),
}

test('loadCompletionPolicy：缺失 / 损坏 / 未知字段 / 非法值一律回退 off', () => {
  assert.equal(loadCompletionPolicy(undefined).mode, 'off')
  assert.equal(loadCompletionPolicy(null).mode, 'off')
  assert.equal(loadCompletionPolicy('{ not json').mode, 'off')
  assert.equal(loadCompletionPolicy('').mode, 'off')
  assert.equal(loadCompletionPolicy({}).mode, 'off')
  assert.equal(loadCompletionPolicy({ mode: 'off' }).mode, 'off')
  assert.equal(loadCompletionPolicy({ mode: 'bogus' }).mode, 'off')
  assert.equal(loadCompletionPolicy({ mode: 'enforce' }).mode, 'off')
  assert.equal(loadCompletionPolicy({ mode: 'enforce', enforcedSince: 'not-a-time', boardActors: [] }).mode, 'off')
  assert.equal(loadCompletionPolicy({ mode: 'enforce', enforcedSince: ENFORCED, boardActors: [''] }).mode, 'off')
  assert.equal(loadCompletionPolicy({ mode: 'enforce', enforcedSince: ENFORCED, boardActors: [], extra: true }).mode, 'off')
  assert.equal(OFF_POLICY.mode, 'off')
  assert.deepEqual([...MODES], ['off', 'warn', 'enforce'])
})

test('loadCompletionPolicy：合法 warn / enforce 被冻结并规范化 boardActors', () => {
  for (const mode of ['warn', 'enforce']) {
    const loaded = loadCompletionPolicy({ mode, enforcedSince: ENFORCED, boardActors: [' board-1 '] })
    assert.equal(loaded.mode, mode)
    assert.equal(loaded.enforcedSince, ENFORCED)
    assert.deepEqual([...loaded.boardActors], ['board-1'])
    assert.equal(Object.isFrozen(loaded), true)
  }
})

test('off：所有场景都放行且 reasons 为空（与现状完全一致）', () => {
  const off = policy('off')
  for (const [name, build] of Object.entries(SCENARIOS)) {
    const result = decideCompletion({ ...build(off), at: AT })
    assert.equal(result.allow, true, name)
    assert.deepEqual(result.reasons, [], name)
    assert.equal(result.mode, 'off')
    assert.equal(result.audit.override, false)
  }
})

test('warn：一律放行，但把证据问题写进 reasons；合格证据无告警', () => {
  const warn = policy('warn')
  const valid = decideCompletion({ ...SCENARIOS.valid(warn), at: AT })
  assert.equal(valid.allow, true)
  assert.deepEqual(valid.reasons, [])
  const cases = {
    missing: 'NO_EVIDENCE',
    versionMismatch: 'VERSION_MISMATCH',
    protectedMismatch: 'PROTECTED_TEST_MISMATCH',
    selfReview: 'REVIEW_NOT_INDEPENDENT',
    unauthorizedAcceptance: 'BOARD_ACCEPTANCE_REQUIRED',
  }
  for (const [name, code] of Object.entries(cases)) {
    const result = decideCompletion({ ...SCENARIOS[name](warn), at: AT })
    assert.equal(result.allow, true, `${name} 在 warn 下必须放行`)
    assert.ok(result.reasons.includes(code), `${name} 应报告 ${code}，实际 ${JSON.stringify(result.reasons)}`)
    assert.equal(result.audit.warnOnly, true)
  }
  const legacy = decideCompletion({ ...SCENARIOS.legacyTask(warn), at: AT })
  assert.equal(legacy.allow, true)
  assert.ok(legacy.reasons.includes('LEGACY_BASELINE'))
})

test('enforce：合格证据放行，各类无效证据拒绝且原因码正确', () => {
  const enforce = policy('enforce')
  const valid = decideCompletion({ ...SCENARIOS.valid(enforce), at: AT })
  assert.equal(valid.allow, true)
  assert.deepEqual(valid.reasons, [])
  const cases = {
    missing: 'NO_EVIDENCE',
    versionMismatch: 'VERSION_MISMATCH',
    protectedMismatch: 'PROTECTED_TEST_MISMATCH',
    selfReview: 'REVIEW_NOT_INDEPENDENT',
    unauthorizedAcceptance: 'BOARD_ACCEPTANCE_REQUIRED',
  }
  for (const [name, code] of Object.entries(cases)) {
    const result = decideCompletion({ ...SCENARIOS[name](enforce), at: AT })
    assert.equal(result.allow, false, `${name} 在 enforce 下必须拒绝`)
    assert.ok(result.reasons.includes(code), `${name} 应报告 ${code}，实际 ${JSON.stringify(result.reasons)}`)
    assert.equal(result.audit.decision, 'deny')
  }
})

test('旧任务（早于 enforcedSince）按 LEGACY_BASELINE 允许', () => {
  for (const mode of ['warn', 'enforce']) {
    const result = decideCompletion({ ...SCENARIOS.legacyTask(policy(mode)), at: AT })
    assert.equal(result.allow, true, mode)
    assert.ok(result.reasons.includes('LEGACY_BASELINE'))
    assert.equal(result.audit.legacy, true)
  }
})

test('enforce 特批：本机 + 理由 ≥10 字才放行，并写审计', () => {
  const enforce = policy('enforce')
  const reason = '本机董事会看过完整证据后特批放行'
  const granted = decideCompletion({ ...SCENARIOS.missing(enforce), override: { reason }, localFullAccess: true, at: AT })
  assert.equal(granted.allow, true)
  assert.equal(granted.audit.override, true)
  assert.equal(granted.audit.overrideReason, reason)
  assert.equal(granted.audit.overrideAt, AT)
  assert.ok(granted.reasons.includes('NO_EVIDENCE'), '特批不掩盖原问题')

  const short = decideCompletion({ ...SCENARIOS.missing(enforce), override: { reason: '太短' }, localFullAccess: true, at: AT })
  assert.equal(short.allow, false)
  assert.ok(short.reasons.includes('OVERRIDE_NOT_ALLOWED'))

  const lan = decideCompletion({ ...SCENARIOS.missing(enforce), override: { reason }, localFullAccess: false, at: AT })
  assert.equal(lan.allow, false, 'LAN / 大屏不能特批')
  assert.ok(lan.reasons.includes('OVERRIDE_NOT_ALLOWED'))
  assert.equal(lan.audit.override, false)

  const noLocalFlag = decideCompletion({ ...SCENARIOS.missing(enforce), override: { reason }, at: AT })
  assert.equal(noLocalFlag.allow, false, '未声明本机完整权限不能特批')
})

test('warn / off 下特批不生效（本来就放行，audit.override 为 false）', () => {
  for (const mode of ['off', 'warn']) {
    const result = decideCompletion({ ...SCENARIOS.missing(policy(mode)), override: { reason: '本机董事会特批放行的完整理由' }, localFullAccess: true, at: AT })
    assert.equal(result.allow, true)
    assert.equal(result.audit.override, false)
  }
})

test('所有 reasons 都来自 REASON_CODES ∪ NEW_REASON_CODES，没有未登记码', () => {
  const registered = new Set(ALL_REASON_CODES)
  for (const code of REASON_CODES) assert.ok(registered.has(code))
  for (const code of NEW_REASON_CODES) assert.ok(registered.has(code))
  const scenarios = []
  for (const mode of MODES) {
    for (const build of Object.values(SCENARIOS)) scenarios.push(build(policy(mode)))
    scenarios.push({ evidence: { present: false }, task: TASK, policy: policy(mode) })
    scenarios.push({ evidence: { present: true, versionStatus: 'mismatch' }, task: TASK, policy: policy(mode) })
    scenarios.push({ evidence: { present: true, versionStatus: 'unverifiable' }, task: TASK, policy: policy(mode) })
  }
  for (const scenario of scenarios) {
    const result = decideCompletion({ ...scenario, at: AT })
    for (const code of result.reasons) assert.ok(registered.has(code), `未登记原因码：${code}`)
  }
})

test('纯度：不修改入参，重复调用结果逐字段相等', () => {
  const scenario = SCENARIOS.selfReview(policy('enforce'))
  const snapshot = JSON.stringify(scenario)
  const first = decideCompletion({ ...scenario, at: AT })
  const second = decideCompletion({ ...scenario, at: AT })
  assert.deepEqual(second, first)
  assert.equal(JSON.stringify(scenario), snapshot, '入参不得被修改')
  assert.equal(completionMessage(first).includes('完成策略'), true)
})

test('简化证据：present / versionStatus / 自评 / 验收者 的形状也能判定', () => {
  const enforce = policy('enforce')
  const base = { task: TASK, policy: enforce }
  assert.equal(decideCompletion({ ...base, evidence: { present: false } }).reasons[0], 'NO_EVIDENCE')
  assert.ok(decideCompletion({ ...base, evidence: { present: true, versionStatus: 'mismatch' } }).reasons.includes('VERSION_MISMATCH'))
  assert.ok(decideCompletion({ ...base, evidence: { present: true, versionStatus: 'unverifiable' } }).reasons.includes('NO_EVIDENCE'))
  const selfie = decideCompletion({ ...base, evidence: { present: true, versionStatus: 'ok', author: 'agent-1', assignee: 'agent-1' } })
  assert.ok(selfie.reasons.includes('REVIEW_NOT_INDEPENDENT'))
  const board = decideCompletion({ ...base, evidence: { present: true, versionStatus: 'ok', acceptanceActor: 'someone-else' } })
  assert.ok(board.reasons.includes('BOARD_ACCEPTANCE_REQUIRED'))
  const good = decideCompletion({ ...base, evidence: { present: true, versionStatus: 'ok' } })
  assert.equal(good.allow, true)
})

test('buildCompletionEvidence：评论里的【验收证据】与版本核对结果映射', () => {
  const issue = { id: 'i1', identifier: 'CMP-1', assigneeAgentId: 'agent-1' }
  assert.deepEqual(buildCompletionEvidence({ issue, comments: [] }).present, false)
  const withEvidence = buildCompletionEvidence({
    issue,
    comments: [{ authorAgentId: 'agent-9', body: '【验收证据】对象版本：abc' }],
    versionCheck: { result: '版本一致' },
  })
  assert.equal(withEvidence.present, true)
  assert.equal(withEvidence.author, 'agent-9')
  assert.equal(withEvidence.assignee, 'agent-1')
  assert.equal(withEvidence.versionStatus, 'ok')
  assert.equal(buildCompletionEvidence({ issue, comments: [{ body: '【验收证据】x' }], versionCheck: { result: '版本已变' } }).versionStatus, 'mismatch')
  assert.equal(buildCompletionEvidence({ issue, comments: [{ body: '【验收证据】x' }] }).versionStatus, 'unverifiable')
})
