import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkhours } from '../workhours.mjs'

const cfg = {
  timezone:'Asia/Phnom_Penh', days:[1,2,3,4,5], start:'08:30', end:'17:30',
  dailyUsage:{ enabled:true, at:'08:20', days:[1,2,3,4,5] },
  sessionReset:{ at:'08:25', agents:['Lead','Lead2','PM','OpsLead'] },
}
const clock = value => () => new Date(value)
const make = ({ when, agents, state = {}, reportBuilder, dryRun = false, cfgOverride = cfg } = {}) => {
  const requests = [], logs = [], saved = [], reports = []
  const fetchFn = async (url, init = {}) => {
    const method = init.method || 'GET'; requests.push({ url, method, body:init.body })
    if (url.includes('/agents/') && method === 'POST') return new Response(JSON.stringify({ clearedTaskSessions:2 }), { status:200 })
    if (url.includes('/heartbeat-runs')) return new Response(JSON.stringify([]), { status:200 })
    return new Response(JSON.stringify(agents), { status:200 })
  }
  const app = createWorkhours({ api:'http://fake', company:'c', dryRun, now:clock(when), loadCfg:() => cfgOverride, loadState:() => state, saveState:value => saved.push(structuredClone(value)), log:line => logs.push(line), fetchFn, reportBuilder, writeReport: value => reports.push(value) })
  return { app, requests, logs, saved, reports }
}

test('W2 daily usage report triggers once per business day', async () => {
  const reports = [], value = make({ when:'2026-11-02T01:20:00.000Z', agents:[], reportBuilder:async () => ({ markdown:'# report', totals:{ runs:1 } }), cfgOverride:cfg })
  value.app.tick = value.app.tick
  await value.app.tick({ dutyOverride:true })
  assert.equal(value.logs.filter(line => line.includes('日报')).length, 1)
  assert.equal(value.saved.at(-1).dailyUsage['2026-11-02'].status, 'done')
  const second = make({ when:'2026-11-02T01:21:00.000Z', agents:[], state:value.saved.at(-1), reportBuilder:async () => ({ markdown:'# report', totals:{ runs:1 } }) })
  await second.app.tick({ dutyOverride:true })
  assert.equal(second.logs.filter(line => line.includes('日报')).length, 0)
})

test('W2 non-business day does not trigger report or session reset', async () => {
  const value = make({ when:'2026-11-01T01:25:00.000Z', agents:[{ id:'lead', name:'Lead', status:'idle' }], reportBuilder:async () => ({ markdown:'# report', totals:{} }) })
  await value.app.tick({ dutyOverride:true })
  assert.equal(value.requests.filter(row => row.method === 'POST').length, 0)
  assert.deepEqual(value.saved.at(-1).dailyUsage, {})
})

test('W2 session reset skips running agents and retries them at the next ten-minute slot', async () => {
  const agents = [{ id:'lead', name:'Lead', status:'running' }, { id:'pm', name:'PM', status:'idle' }]
  const first = make({ when:'2026-11-02T01:25:00.000Z', agents, reportBuilder:async () => ({ markdown:'# report', totals:{} }) })
  await first.app.tick({ dutyOverride:true })
  assert.deepEqual(first.requests.filter(row => row.method === 'POST').map(row => row.url), ['http://fake/api/agents/pm/runtime-state/reset-session'])
  const second = make({ when:'2026-11-02T01:35:00.000Z', agents:agents.map(agent => agent.name === 'Lead' ? { ...agent, status:'idle' } : agent), state:first.saved.at(-1), reportBuilder:async () => ({ markdown:'# report', totals:{} }) })
  await second.app.tick({ dutyOverride:true })
  assert.equal(second.requests.filter(row => row.method === 'POST').length, 1)
  assert.equal(second.requests.find(row => row.method === 'POST').url, 'http://fake/api/agents/lead/runtime-state/reset-session')
})

test('W2 sessionReset.agents overrides the default list', async () => {
  const custom = { ...cfg, sessionReset:{ at:'08:25', agents:['Architect'] } }
  const value = make({ when:'2026-11-02T01:25:00.000Z', agents:[{ id:'lead', name:'Lead', status:'idle' }, { id:'arch', name:'Architect', status:'idle' }], cfgOverride:custom, reportBuilder:async () => ({ markdown:'# report', totals:{} }) })
  await value.app.tick({ dutyOverride:true })
  assert.deepEqual(value.requests.filter(row => row.method === 'POST').map(row => row.url), ['http://fake/api/agents/arch/runtime-state/reset-session'])
})

test('W2 dry run logs actions but never sends reset POST', async () => {
  const value = make({ when:'2026-11-02T01:25:00.000Z', agents:[{ id:'lead', name:'Lead', status:'idle' }], dryRun:true, reportBuilder:async () => ({ markdown:'# report', totals:{} }) })
  await value.app.tick({ dutyOverride:true })
  assert.equal(value.requests.filter(row => row.method === 'POST').length, 0)
  assert.ok(value.logs.some(line => line.includes('将清理名单')))
})

test('W2 report and reset failures are logged and do not reject tick', async () => {
  const value = make({ when:'2026-11-02T01:20:00.000Z', agents:[{ id:'lead', name:'Lead', status:'idle' }], reportBuilder:async () => { throw new Error('report down') } })
  await assert.doesNotReject(() => value.app.tick({ dutyOverride:true }))
  assert.ok(value.logs.some(line => line.includes('日报失败')))
})

test('W2 reset failure is contained and counted for the day', async () => {
  const value = make({ when:'2026-11-02T01:25:00.000Z', agents:[{ id:'lead', name:'Lead', status:'idle' }], reportBuilder:async () => ({ markdown:'# report', totals:{} }) })
  const original = value.app
  const failing = createWorkhours({ api:'http://fake', company:'c', now:clock('2026-11-02T01:25:00.000Z'), loadCfg:() => cfg, loadState:() => ({}), saveState:snapshot => value.saved.push(structuredClone(snapshot)), log:line => value.logs.push(line), recoverErrors:async () => {}, fetchFn:async (url, init = {}) => {
    value.requests.push({ url, method:init.method || 'GET' })
    if ((init.method || 'GET') === 'POST') return new Response('down', { status:500 })
    if (url.includes('/heartbeat-runs')) return new Response('[]')
    return new Response(JSON.stringify([{ id:'lead', name:'Lead', status:'idle' }]))
  } })
  await assert.doesNotReject(() => failing.tick({ dutyOverride:true }))
  assert.equal(value.saved.at(-1).sessionReset['2026-11-02'].attempts.lead, 1)
  assert.ok(value.logs.some(line => line.includes('会话清理失败')))
  assert.ok(original)
})
