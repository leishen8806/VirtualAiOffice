import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentRecovery } from '../agent-recovery.mjs'
import { createWorkhours } from '../workhours.mjs'

const NOW = new Date('2026-10-28T10:00:00.000Z')
const day = '2026-10-28'
const securityReviewer = { id: 'security', name: 'SecurityReviewer', status: 'error', adapterType: 'claude_local', adapterConfig: { model: 'claude-opus-5' } }
const reviewer = { id: 'reviewer', name: 'Reviewer1', status: 'idle', adapterType: 'claude_local', adapterConfig: { model: 'claude-opus-5' } }
const failed = (patch = {}) => ({ id: 'run-failed', agentId: 'security', status: 'failed', errorCode: 'claude_auth_required', error: 'API Error: The socket connection was closed unexpectedly', finishedAt: '2026-10-28T09:50:00.000Z', ...patch })
const succeeded = (patch = {}) => ({ id: 'run-success', agentId: 'reviewer', status: 'succeeded', finishedAt: '2026-10-28T09:55:00.000Z', ...patch })

function fixture(runsByAgent, { dryRun = false, state = {}, agents = [securityReviewer, reviewer] } = {}) {
  const requests = [], logs = []
  const fetchFn = async (url, init = {}) => {
    const parsed = new URL(url), method = init.method || 'GET'
    requests.push({ method, path: parsed.pathname, search: parsed.search })
    const body = method === 'GET' ? (runsByAgent[parsed.searchParams.get('agentId')] || []) : {}
    return new Response(JSON.stringify(body), { status: 200 })
  }
  const recover = createAgentRecovery({ api: 'http://fake', company: 'company', now: () => NOW, fetchFn, log: (line) => logs.push(line) })
  return { requests, logs, state, run: (overrides = {}) => recover({ agents, state, dryRun, day, ...overrides }) }
}

test('S-3.1 SecurityReviewer network text plus later Claude success clears the error', async () => {
  const value = fixture({ security: [failed()], reviewer: [succeeded()] })
  await value.run()
  assert.equal(value.requests.filter((row) => row.method === 'POST' && row.path === '/api/agents/security/clear-error').length, 1)
  assert.deepEqual(value.state.errorRecoveryAttempts.security, { day, count: 1 })
})

test('S-3.2 misleading auth code without later peer success needs manual review', async () => {
  const gpt = { id: 'gpt', name: 'Reviewer2', status: 'idle', adapterConfig: { model: 'gpt-5.6-terra' } }
  const value = fixture({
    security: [failed(), succeeded({ id: 'same-agent-success', agentId: 'security' })],
    reviewer: [succeeded({ finishedAt: '2026-10-28T10:21:00.000Z' })],
    gpt: [succeeded({ agentId: 'gpt' })],
  }, { agents: [securityReviewer, reviewer, gpt] })
  await value.run()
  assert.equal(value.requests.some((row) => row.method === 'POST'), false)
  assert.ok(value.logs.some((line) => line.includes('需人工') && line.includes('可能真的登录失效')))
})

test('S-3.3 claude_transient_upstream clears without peer evidence', async () => {
  const value = fixture({ security: [failed({ errorCode: 'claude_transient_upstream', error: 'temporary upstream failure' })] }, { agents: [securityReviewer] })
  await value.run()
  assert.equal(value.requests.filter((row) => row.method === 'POST' && row.path.endsWith('/clear-error')).length, 1)
})

test('S-3.4 quota errors are untouched even if their text also mentions a network error', async () => {
  const value = fixture({ security: [failed({ errorCode: 'provider_quota', error: 'usage limit after network error' })] }, { agents: [securityReviewer] })
  await value.run()
  assert.equal(value.requests.some((row) => row.method === 'POST'), false)
})

test('S-3.5 setup_failed is untouched even if its text mentions a reset connection', async () => {
  const value = fixture({ security: [failed({ errorCode: 'setup_failed', error: 'connection reset while preparing worktree' })] }, { agents: [securityReviewer] })
  await value.run()
  assert.equal(value.requests.some((row) => row.method === 'POST'), false)
})

test('S-3.6 a failure younger than two minutes waits for a later tick', async () => {
  const value = fixture({ security: [failed({ errorCode: 'claude_transient_upstream', finishedAt: '2026-10-28T09:58:30.000Z' })] }, { agents: [securityReviewer] })
  await value.run()
  assert.equal(value.requests.some((row) => row.method === 'POST'), false)
})

test('S-3.7 the third completed recovery is the daily limit', async () => {
  const state = { errorRecoveryAttempts: { security: { day, count: 3 } } }
  const value = fixture({ security: [failed({ errorCode: 'claude_transient_upstream' })] }, { agents: [securityReviewer], state })
  await value.run()
  assert.equal(value.requests.some((row) => row.method === 'POST'), false)
  assert.ok(value.logs.some((line) => line.includes('当天已自动清错 3 次')))
})

test('S-3.8 off-duty workhours never invokes error recovery', async () => {
  let recoveryCalls = 0
  const app = createWorkhours({ api: 'http://fake', company: 'company', dryRun: true, now: () => NOW, loadCfg: () => ({ timezone: 'Asia/Phnom_Penh', days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '17:30' }), loadState: () => ({ pausedByUs: [] }), log: () => {}, recoverErrors: async () => { recoveryCalls++ }, fetchFn: async () => new Response(JSON.stringify([securityReviewer]), { status: 200 }) })
  await app.tick({ dutyOverride: false })
  assert.equal(recoveryCalls, 0)
})

test('S-3.9 dry-run reports the action but performs zero writes', async () => {
  const state = {}, value = fixture({ security: [failed()], reviewer: [succeeded()] }, { dryRun: true, state })
  await value.run()
  assert.equal(value.requests.some((row) => row.method !== 'GET'), false)
  assert.deepEqual(state.errorRecoveryAttempts, {})
  assert.ok(value.logs.some((line) => line.includes('演练：将会清除 SecurityReviewer')))
})

test('S-3.10 recovery never calls wake, resume or heartbeat endpoints', async () => {
  const value = fixture({ security: [failed()], reviewer: [succeeded()] })
  await value.run()
  assert.deepEqual(value.requests.filter((row) => row.method === 'POST').map((row) => row.path), ['/api/agents/security/clear-error'])
  assert.equal(value.requests.some((row) => /wake|resume|heartbeat(?!-runs)/i.test(row.path)), false)
})

test('R2 D1 heartbeat-runs 500 still saves same-tick resume, repair count and manual state', async () => {
  let persisted = { pausedByUs: ['resume', 'repair', 'manual'], resumeRequested: { repair: { at: 'earlier' }, manual: { at: 'earlier' } }, repairAttempts: { repair: { day, count: 1 } } }
  const logs = [], saves = [], repairs = []
  const agents = ['resume', 'repair', 'manual'].map(id => ({ id, name: id, status: 'paused', lifecycleState: 'pausing' })).concat(securityReviewer)
  const app = createWorkhours({ api: 'http://fake', company: 'company', dryRun: false, now: () => NOW,
    loadCfg: () => ({ timezone: 'Asia/Phnom_Penh', days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '17:30' }),
    loadState: () => structuredClone(persisted), saveState: state => { persisted = structuredClone(state); saves.push(persisted) }, log: line => logs.push(line),
    repair: async agent => { repairs.push(agent.id); return { kind: agent.id === 'repair' ? 'repaired' : 'manual' } },
    fetchFn: async (url, init) => {
      if (url.includes('heartbeat-runs')) return new Response('unavailable', { status: 500 })
      if (init.method === 'POST') { assert.equal(new URL(url).pathname, '/api/agents/resume/resume'); return new Response('{}') }
      return new Response(JSON.stringify(agents))
    },
  })
  await assert.doesNotReject(() => app.tick({ dutyOverride: true }))
  assert.equal(saves.length, 1)
  assert.equal(persisted.resumeRequested.resume.at, NOW.toISOString())
  assert.deepEqual(persisted.repairAttempts.repair, { day, count: 2 })
  assert.equal(persisted.manualRepairDay.manual, day)
  assert.equal(logs.filter(line => line.includes('自动清错出错')).length, 1)
  await app.tick({ dutyOverride: true })
  assert.equal(saves.length, 2)
  assert.equal(repairs.filter(id => id === 'repair').length, 1)
  assert.equal(persisted.repairAttempts.repair.count, 2)
  assert.equal(persisted.manualRepairDay.repair, day)
})

test('R2 D1 failed clear-error is contained and earlier successful counters survive', async () => {
  const state = {}, logs = [], requests = []
  const recover = createAgentRecovery({ api: 'http://fake', company: 'company', now: () => NOW, log: line => logs.push(line), fetchFn: async (url, init) => {
    requests.push({ url, method: init.method })
    if (init.method === 'GET') return new Response(JSON.stringify([failed({ errorCode: 'claude_transient_upstream' })]))
    return new Response('{}', { status: url.includes('/second/') ? 500 : 200 })
  } })
  await assert.doesNotReject(() => recover({ agents: [securityReviewer, { ...securityReviewer, id: 'second' }], state, day }))
  assert.deepEqual(state.errorRecoveryAttempts, { security: { day, count: 1 } })
  assert.equal(logs.filter(line => line.includes('自动清错出错')).length, 1)
  assert.equal(requests.filter(row => row.method === 'POST').length, 2)
})

test('R2 D2 manual notices are once per agent, reason and day across serialized state', async () => {
  const other = { ...securityReviewer, id: 'other', name: 'Other' }, agents = [securityReviewer, other]
  const runs = { security: [failed()], other: [failed()] }, value = fixture(runs, { agents })
  await value.run(); await value.run()
  assert.equal(value.logs.filter(line => line.includes('需人工')).length, 2)
  value.state.errorRecoveryAttempts.security = { day, count: 3 }
  await value.run(); await value.run()
  assert.equal(value.logs.filter(line => line.includes('需人工')).length, 3)
  const next = fixture(runs, { agents, state: JSON.parse(JSON.stringify(value.state)) })
  await next.run()
  assert.equal(next.logs.length, 0)
  await next.run({ day: '2026-10-29' }); await next.run({ day: '2026-10-29' })
  assert.equal(next.logs.filter(line => line.includes('需人工')).length, 2)
})

test('R2 D2 workhours retains manual-notice markers when loading the next tick', async () => {
  let persisted = { pausedByUs: [] }, saves = 0
  const logs = [], options = { api: 'http://fake', company: 'company', dryRun: false, now: () => NOW,
    loadCfg: () => ({ timezone: 'Asia/Phnom_Penh', days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '17:30' }),
    loadState: () => JSON.parse(JSON.stringify(persisted)), saveState: state => { persisted = structuredClone(state); saves++ }, log: line => logs.push(line),
    fetchFn: async (url, init) => { assert.equal(init.method, 'GET'); return new Response(JSON.stringify(url.includes('heartbeat-runs') ? [failed()] : [securityReviewer])) },
  }
  await createWorkhours(options).tick({ dutyOverride: true })
  await createWorkhours(options).tick({ dutyOverride: true })
  assert.equal(saves, 2)
  assert.equal(logs.filter(line => line.includes('需人工')).length, 1)
  assert.deepEqual(persisted.errorRecoveryManualDay.security, { auth: day })
})

test('R2 D2 dry-run does not persist manual-notice markers or consume the real notice', async () => {
  const state = { errorRecoveryAttempts: {} }, before = structuredClone(state)
  const dry = fixture({ security: [failed()] }, { agents: [securityReviewer], dryRun: true, state })
  await dry.run()
  assert.deepEqual(state, before)
  assert.ok(dry.requests.every(row => row.method === 'GET'))
  const real = fixture({ security: [failed()] }, { agents: [securityReviewer], state })
  await real.run(); await real.run()
  assert.equal(real.logs.filter(line => line.includes('需人工')).length, 1)
})
