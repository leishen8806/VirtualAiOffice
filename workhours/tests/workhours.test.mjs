import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkhours } from '../workhours.mjs'
import { createLifecycleRepair } from '../lifecycle-repair.mjs'

const cfg = { timezone:'Asia/Phnom_Penh', days:[0,1,2,3,4,5,6], start:'08:30', end:'17:30' }
const now = () => new Date('2026-10-28T02:00:00.000Z')
const agent = (patch = {}) => ({ id:'a1', name:'甲', status:'paused', lifecycleState:'pausing', ...patch })
const scheduler = ({ agents, state, repair = async () => ({ kind:'repaired' }), dryRun = false, logs = [], requests = [], saved = [] } = {}) => ({ app:createWorkhours({ api:'http://fake', company:'company', dryRun, now, loadCfg:() => cfg, loadState:() => state, saveState:value => saved.push(structuredClone(value)), log:line => logs.push(line), repair, fetchFn:async (url, init = {}) => { requests.push({ url, method:init.method }); return new Response(JSON.stringify(init.method === 'GET' ? agents : {}), { status:200 }) } }), logs, requests, saved })

function db({ nonterminal = [], leases = [], finalizations = [], runs = [], host = { id:'a1', name:'甲', lifecycle_version:7, lifecycle_operation:{} }, hostUpdate = 1 } = {}) {
  const calls = []
  return { calls, async query(sql) {
    calls.push(sql)
    if (sql.startsWith('select agent_id')) return { rows:nonterminal }
    if (sql.startsWith('select l.id')) return { rows:leases }
    if (sql.startsWith('select run_id from native')) return { rows:finalizations }
    if (sql.startsWith('select id, finished_at')) return { rows:runs }
    if (sql.startsWith('select id, name')) return { rows:host ? [host] : [] }
    if (sql.startsWith('update heartbeat_runs')) return { rowCount:1 }
    if (sql.startsWith('update agents')) return { rowCount:hostUpdate }
    return { rows:[], rowCount:1 }
  }, async end() {} }
}

test('W-1 normal resume remains tracked until the next tick confirms status changed', async () => {
  const state = { pausedByUs:['a1'] }, first = scheduler({ agents:[agent()], state })
  await first.app.tick({ dutyOverride:true })
  assert.deepEqual(first.saved.at(-1).pausedByUs, ['a1']); assert.equal(first.requests.filter(row => row.method === 'POST').length, 1)
  const second = scheduler({ agents:[agent({ status:'idle', lifecycleState:'ready' })], state:first.saved.at(-1) })
  await second.app.tick({ dutyOverride:true }); assert.deepEqual(second.saved.at(-1).pausedByUs, [])
})

test('W-1 paused pausing with zero prerequisites repairs then waits for a later resume', async () => {
  const state = { pausedByUs:['a1'], resumeRequested:{ a1:{ at:'x' } } }, repair = async () => ({ kind:'repaired' }), value = scheduler({ agents:[agent()], state, repair })
  await value.app.tick({ dutyOverride:true }); assert.equal(value.requests.filter(row => row.method === 'POST').length, 0); assert.equal(value.saved.at(-1).repairAttempts.a1.count, 1)
  const retry = scheduler({ agents:[agent({ lifecycleState:'ready' })], state:value.saved.at(-1) })
  await retry.app.tick({ dutyOverride:true }); assert.equal(retry.requests.filter(row => row.method === 'POST').length, 1)
  const done = scheduler({ agents:[agent({ status:'idle', lifecycleState:'ready' })], state:retry.saved.at(-1) })
  await done.app.tick({ dutyOverride:true }); assert.deepEqual(done.saved.at(-1).pausedByUs, [])
})

test('W-1 copies legacy cancelled acknowledgement before hostComplete', async () => {
  const fake = db({ runs:[{ id:'run1', finished_at:new Date('2026-10-28T00:00:00Z') }] }), backups = []
  const repair = createLifecycleRepair({ dbFactory:async () => fake, backupFile:'ignored', now, appendFile:(_, line) => backups.push(line) })
  const result = await repair(agent(), { log:() => {} })
  assert.equal(result.kind, 'repaired'); assert.equal(result.acknowledgements, 1); assert.equal(backups.length, 1); assert.ok(fake.calls.some(sql => sql.startsWith('update heartbeat_runs')))
})

test('W-1 lifecycle prerequisite queries use deployed table columns', async () => {
  const fake = db(), repair = createLifecycleRepair({ dbFactory:async () => fake, backupFile:'ignored', appendFile:() => {} })
  await repair(agent(), { log:() => {} })
  assert.ok(fake.calls.some(sql => sql.startsWith('select run_id from native_run_finalizations')))
  assert.equal(fake.calls.some(sql => sql.startsWith('select id from native_run_finalizations')), false)
})

test('W-1 nonterminal prerequisite records manual review and writes nothing', async () => {
  const fake = db({ nonterminal:[{ id:'run' }] }), repair = createLifecycleRepair({ dbFactory:async () => fake, backupFile:'ignored', appendFile:() => assert.fail('backup') }), logs = []
  const result = await repair(agent(), { log:line => logs.push(line) })
  assert.equal(result.kind, 'manual'); assert.ok(logs.some(line => line.includes('需人工'))); assert.equal(fake.calls.some(sql => sql === 'begin'), false)
})

test('W-1 changed lifecycle version rolls back and does not retry writes', async () => {
  const fake = db({ hostUpdate:0 }), repair = createLifecycleRepair({ dbFactory:async () => fake, backupFile:'ignored', appendFile:() => assert.fail('backup') })
  const result = await repair(agent(), { log:() => {} })
  assert.equal(result.kind, 'rollback'); assert.equal(fake.calls.filter(sql => sql.startsWith('update agents')).length, 1); assert.ok(fake.calls.includes('rollback'))
})

test('W-1 per-person daily limit two stops a third automatic repair', async () => {
  let repairs = 0
  const state = { pausedByUs:['a1'], resumeRequested:{ a1:{ at:'x' } }, repairAttempts:{ a1:{ day:'2026-10-28', count:2 } } }
  const value = scheduler({ agents:[agent()], state, repair:async () => { repairs++; return { kind:'repaired' } } })
  await value.app.tick({ dutyOverride:true }); assert.equal(repairs, 0); assert.equal(value.saved.at(-1).manualRepairDay.a1, '2026-10-28')
})

test('W-1 manual paused people outside pausedByUs are untouched', async () => {
  const value = scheduler({ agents:[agent({ id:'manual', name:'手动' })], state:{ pausedByUs:[] } })
  await value.app.tick({ dutyOverride:true }); assert.equal(value.requests.filter(row => row.method === 'POST').length, 0)
})

test('W-1 dry run performs zero Paperclip or database writes', async () => {
  let repairs = 0
  const value = scheduler({ agents:[agent()], state:{ pausedByUs:['a1'] }, dryRun:true, repair:async () => { repairs++; return { kind:'repaired' } } })
  await value.app.tick({ dutyOverride:true }); assert.equal(repairs, 0); assert.equal(value.requests.filter(row => row.method === 'POST').length, 0); assert.equal(value.saved.length, 0)
})

test('W-1 missing pg falls back to the ordinary resume request', async () => {
  const value = scheduler({ agents:[agent()], state:{ pausedByUs:['a1'], resumeRequested:{ a1:{ at:'x' } } }, repair:async () => ({ kind:'pg-missing' }) })
  await value.app.tick({ dutyOverride:true }); assert.equal(value.requests.filter(row => row.method === 'POST').length, 1)
})

test('W-1 one repair exception marks only that agent manual and saves the tick', async () => {
  const logs = [], value = scheduler({ agents:[agent(), agent({ id:'a2', name:'乙' })], state:{ pausedByUs:['a1', 'a2'], resumeRequested:{ a1:{ at:'x' }, a2:{ at:'x' } } }, logs, repair:async (item) => { if (item.id === 'a1') throw new Error('db detail') ; return { kind:'manual' } } })
  await value.app.tick({ dutyOverride:true })
  assert.equal(value.saved.length, 1)
  assert.equal(value.saved.at(-1).manualRepairDay.a1, '2026-10-28')
  assert.equal(value.saved.at(-1).manualRepairDay.a2, '2026-10-28')
  assert.ok(logs.some(line => line.includes('修复异常')))
})

test('W-1 logs never expose a supplied database URL', async () => {
  const logs = [], secret = 'postgres://user:password@host/db'
  const fake = db(), repair = createLifecycleRepair({ dbFactory:async () => fake, backupFile:'ignored', appendFile:() => {} })
  await repair(agent(), { log:line => logs.push(line) })
  assert.equal(logs.join('\n').includes(secret), false)
})

test('W-2 restores only off-duty system not-invokable blocks without dependencies', async () => {
  const blockedAt = '2026-10-27T11:00:00.000Z', writes = []
  const issues = ['system', 'dependency', 'agent'].map((id) => ({ id, identifier: `CMP-${id}`, status: 'blocked' }))
  const details = {
    system: { ...issues[0], blockedTransitionAt: blockedAt, blockedBy: [] },
    dependency: { ...issues[1], blockedTransitionAt: blockedAt, blockedBy: [{ id: 'real-work' }] },
    agent: { ...issues[2], blockedTransitionAt: blockedAt, blockedBy: [] },
  }
  const app = createWorkhours({ api:'http://fake', company:'company', now, loadCfg:() => cfg, loadState:() => ({ pausedByUs:[] }), saveState:() => {}, recoverErrors:async () => {}, log:() => {}, fetchFn:async (url, init = {}) => {
    const request = new URL(url), method = init.method || 'GET', parts = request.pathname.split('/'), id = parts.at(-1) === 'comments' ? parts.at(-2) : parts.at(-1)
    if (request.pathname.endsWith('/agents')) return new Response('[]')
    if (request.pathname.endsWith('/issues')) return new Response(JSON.stringify(issues))
    if (request.pathname.endsWith('/comments')) {
      const authorType = id === 'agent' ? 'agent' : 'system'
      return new Response(JSON.stringify([{ authorType, body:'Paperclip cannot safely continue because the original assignee is not invokable', createdAt:blockedAt }]))
    }
    if (method === 'PATCH') { writes.push({ id, body:JSON.parse(init.body) }); return new Response('{}') }
    return new Response(JSON.stringify(details[id]))
  } })
  await app.tick({ dutyOverride:true })
  assert.deepEqual(writes, [{ id:'system', body:{ status:'todo', comment:'Recovered from the off-duty system “not invokable” block; no dependency is recorded.' } }])
})

test('W-2 sends an execution-review block back to in_review and dry-run writes nothing', async () => {
  const blockedAt = '2026-10-27T11:00:00.000Z', writes = [], logs = [], issue = { id:'review', identifier:'CMP-review', status:'blocked', blockedTransitionAt:blockedAt, blockedBy:[], executionPolicy:{ stages:[{ type:'review' }] } }
  const make = (dryRun) => createWorkhours({ api:'http://fake', company:'company', dryRun, now, loadCfg:() => cfg, loadState:() => ({ pausedByUs:[] }), saveState:() => {}, recoverErrors:async () => {}, log:line => logs.push(line), fetchFn:async (url, init = {}) => {
    const request = new URL(url), method = init.method || 'GET'
    if (request.pathname.endsWith('/agents')) return new Response('[]')
    if (request.pathname.endsWith('/issues')) return new Response(JSON.stringify([issue]))
    if (request.pathname.endsWith('/comments')) return new Response(JSON.stringify([{ authorType:'system', body:'pending execution-review participant is not invokable', createdAt:blockedAt }]))
    if (method === 'PATCH') { writes.push(JSON.parse(init.body)); return new Response('{}') }
    return new Response(JSON.stringify(issue))
  } })
  await make(true).tick({ dutyOverride:true }); assert.deepEqual(writes, []); assert.ok(logs.some(line => line.includes('DRY blocked recovery CMP-review -> in_review')))
  await make(false).tick({ dutyOverride:true }); assert.equal(writes[0].status, 'in_review')
})

test('W-2 only restores blocks inside the completed off-duty window', async () => {
  const writes = [], entries = { inside:'2026-10-27T11:00:00.000Z', before:'2026-10-27T10:29:00.000Z', start:'2026-10-28T01:30:00.000Z', after:'2026-10-28T01:45:00.000Z' }
  const issues = Object.keys(entries).map((id) => ({ id, identifier:`CMP-${id}`, status:'blocked' }))
  const app = createWorkhours({ api:'http://fake', company:'company', now, loadCfg:() => cfg, loadState:() => ({ pausedByUs:[] }), saveState:() => {}, recoverErrors:async () => {}, log:() => {}, fetchFn:async (url, init = {}) => {
    const request = new URL(url), method = init.method || 'GET', parts = request.pathname.split('/'), id = parts.at(-1) === 'comments' ? parts.at(-2) : parts.at(-1)
    if (request.pathname.endsWith('/agents')) return new Response('[]')
    if (request.pathname.endsWith('/issues')) return new Response(JSON.stringify(issues))
    if (request.pathname.endsWith('/comments')) return new Response(JSON.stringify([{ authorType:'system', body:'not invokable', createdAt:entries[id] }]))
    if (method === 'PATCH') { writes.push(id); return new Response('{}') }
    return new Response(JSON.stringify({ ...issues.find((item) => item.id === id), blockedTransitionAt:entries[id], blockedBy:[] }))
  } })
  await app.tick({ dutyOverride:true })
  assert.deepEqual(writes, ['inside'])
})

test('W-2 scan failure still persists same-tick agent resume state', async () => {
  const saved = [], requests = [], logs = [], state = { pausedByUs:['a1'] }
  const app = createWorkhours({ api:'http://fake', company:'company', now, loadCfg:() => cfg, loadState:() => state, saveState:value => saved.push(structuredClone(value)), log:line => logs.push(line), fetchFn:async (url, init = {}) => {
    const request = new URL(url), method = init.method || 'GET'; requests.push({ method, path:request.pathname })
    if (request.pathname.endsWith('/agents')) return new Response(JSON.stringify([agent()]))
    if (request.pathname.endsWith('/issues')) return new Response('unavailable', { status:500 })
    return new Response('{}')
  } })
  await assert.doesNotReject(() => app.tick({ dutyOverride:true }))
  assert.equal(requests.filter((row) => row.path === '/api/agents/a1/resume' && row.method === 'POST').length, 1)
  assert.equal(saved.length, 1); assert.equal(saved[0].resumeRequested.a1.at, now().toISOString())
  assert.ok(logs.some((line) => line.includes('blocked recovery scan failed')))
})

test('W-2 more than 30 recovery candidates logs an alert and changes none', async () => {
  const blockedAt = '2026-10-27T11:00:00.000Z', logs = [], writes = [], issues = Array.from({ length:31 }, (_, i) => ({ id:`i${i}`, identifier:`CMP-${i}`, status:'blocked' }))
  const app = createWorkhours({ api:'http://fake', company:'company', now, loadCfg:() => cfg, loadState:() => ({ pausedByUs:[] }), saveState:() => {}, recoverErrors:async () => {}, log:line => logs.push(line), fetchFn:async (url, init = {}) => {
    const request = new URL(url), method = init.method || 'GET', parts = request.pathname.split('/'), id = parts.at(-1) === 'comments' ? parts.at(-2) : parts.at(-1)
    if (request.pathname.endsWith('/agents')) return new Response('[]')
    if (request.pathname.endsWith('/issues')) return new Response(JSON.stringify(issues))
    if (request.pathname.endsWith('/comments')) return new Response(JSON.stringify([{ authorType:'system', body:'not invokable', createdAt:blockedAt }]))
    if (method === 'PATCH') { writes.push(id); return new Response('{}') }
    return new Response(JSON.stringify({ ...issues.find((item) => item.id === id), blockedTransitionAt:blockedAt, blockedBy:[] }))
  } })
  await app.tick({ dutyOverride:true })
  assert.deepEqual(writes, []); assert.ok(logs.some((line) => line.includes('ALERT blocked recovery found 31 candidates')))
})
