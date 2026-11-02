import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUsageReport } from '../usage-report.mjs'

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
