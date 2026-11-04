import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUsageReport } from '../usage-report.mjs'

const usageReport = async ({ agents, runs, days = 1, now = new Date('2026-11-02T06:00:00.000Z') }) => buildUsageReport({
  api:'http://fake', company:'c', days, now,
  fetchFn: async url => new Response(JSON.stringify(url.endsWith('/agents') ? agents : { runs })),
})

test('W2 usage report is GET-only and reports the selected window', async () => {
  const calls = [], now = new Date('2026-11-02T01:20:00.000Z')
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method:init.method })
    assert.equal(init.method, 'GET')
    if (url.endsWith('/agents')) return new Response(JSON.stringify([{ id:'a1', name:'Lead', adapterType:'claude' }]))
    return new Response(JSON.stringify({ runs:[{ agentId:'a1', createdAt:'2026-11-02T01:00:00.000Z', status:'completed', usageJson:{ inputTokens:100, outputTokens:50, cachedInputTokens:25, costUsd:0.1, model:'m' } }] }))
  }
  const result = await buildUsageReport({ api:'http://fake', company:'c', days:1, now, fetchFn })
  assert.equal(calls.length, 2)
  assert.equal(result.totals.runs, 1)
  assert.equal(result.totals.windowShort, true)
  assert.match(result.markdown, /Lead/)
  assert.match(result.markdown, /窗口比所选天数短/)
})

test('W2 usage report date follows UTC+7', async () => {
  const now = new Date('2026-11-01T17:30:00.000Z')
  const fetchFn = async (url, init = {}) => {
    assert.equal(init.method, 'GET')
    return new Response(JSON.stringify(url.endsWith('/agents') ? [] : { runs:[] }))
  }
  const result = await buildUsageReport({ api:'http://fake', company:'c', now, fetchFn })
  assert.equal(result.totals.day, '2026-11-02')
})

test('W2 usage report differentiates cumulative usage by agent session before window filtering', async () => {
  const result = await usageReport({
    agents:[{ id:'a', name:'Lead', adapterType:'claude' }, { id:'b', name:'OpsLead', adapterType:'codex' }],
    runs:[
      { agentId:'a', createdAt:'2026-11-01T05:00:00.000Z', sessionIdAfter:'s1', usageJson:{ inputTokens:100, outputTokens:10, cachedInputTokens:50, costUsd:1 } },
      { agentId:'a', createdAt:'2026-11-01T07:00:00.000Z', sessionIdAfter:'s1', usageJson:{ inputTokens:150, outputTokens:15, cachedInputTokens:60, costUsd:1.5 } },
      { agentId:'a', createdAt:'2026-11-01T08:00:00.000Z', sessionIdAfter:'s1', usageJson:{ inputTokens:210, outputTokens:21, cachedInputTokens:80, costUsd:2.1 } },
      { agentId:'a', createdAt:'2026-11-01T09:00:00.000Z', sessionIdAfter:'s1', usageJson:{ inputTokens:30, outputTokens:3, cachedInputTokens:5, costUsd:0.3 } },
      { agentId:'a', createdAt:'2026-11-01T10:00:00.000Z', sessionIdBefore:'s2', usageJson:{ inputTokens:40, outputTokens:4, cachedInputTokens:10, costUsd:0.4 } },
      { agentId:'b', createdAt:'2026-11-01T11:00:00.000Z', sessionIdAfter:'s3', usageJson:{ inputTokens:11, outputTokens:1, cachedInputTokens:2, costUsd:0.1 } },
    ],
  })
  assert.equal(result.totals.runs, 5)
  assert.equal(result.totals.io, 210)
  assert.equal(result.totals.cached, 47)
  assert.ok(Math.abs(result.totals.cost - 1.9) < 1e-9)
  assert.deepEqual({ ...result.groups.Lead, cost:Math.round(result.groups.Lead.cost * 10) / 10 }, { input:180, output:18, cached:45, cost:1.8 })
  assert.deepEqual(result.groups.OpsLead, { input:11, output:1, cached:2, cost:0.1 })
})

test('W2 usage report warns only when one agent exceeds 30 runs in an hour', async () => {
  const agents = [{ id:'a', name:'Lead', adapterType:'claude' }]
  const run = index => ({ agentId:'a', createdAt:`2026-11-02T01:${String(index).padStart(2, '0')}:00.000Z`, sessionIdAfter:`s${index}`, wakeReason:index < 31 ? 'cron' : 'manual', usageJson:{} })
  const warned = await usageReport({ agents, runs:Array.from({ length:31 }, (_, index) => run(index)) })
  const quiet = await usageReport({ agents, runs:Array.from({ length:30 }, (_, index) => run(index)) })
  assert.match(warned.markdown, /失控预警：[\s\S]*Lead.*31.*cron/)
  assert.match(quiet.markdown, /失控预警：无/)
})
