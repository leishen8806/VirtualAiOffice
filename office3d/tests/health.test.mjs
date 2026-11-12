import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildHealth, classifyFailure, parseResetAt } from '../health.mjs'

const now = new Date('2026-10-18T02:00:00.000Z')
const agent = (id, model = 'claude-opus-5') => ({ id, name: id, title: id, status: 'idle', adapterConfig: { model } })
const run = (agentId, status, at, errorCode, error) => ({ id: `${agentId}-${at}`, agentId, status, finishedAt: at, errorCode, error })

test('parses 12-hour reset times in Phnom Penh and rolls past times to tomorrow', () => {
  assert.equal(parseResetAt("You've hit your session limit · resets 7:10pm (Asia/Bangkok)", now), '2026-10-18T19:10:00+07:00')
  assert.equal(parseResetAt('resets 7:10 pm', now), '2026-10-18T19:10:00+07:00')
  assert.equal(parseResetAt('resets 12:05am', new Date('2026-10-17T17:00:00Z')), '2026-10-18T00:05:00+07:00')
  assert.equal(parseResetAt('resets 7:10pm', new Date('2026-10-18T14:00:00Z')), '2026-10-19T19:10:00+07:00')
})

test('classifies quota, auth, upstream and worktree lock errors', () => {
  assert.equal(classifyFailure({ errorCode: 'provider_quota' }), 'quota')
  assert.equal(classifyFailure({ errorCode: 'claude_auth_required' }), 'login')
  assert.equal(classifyFailure({ error: 'login required' }), 'login')
  assert.equal(classifyFailure({ errorCode: 'claude_transient_upstream' }), 'upstream')
  assert.equal(classifyFailure({ errorCode: 'setup_failed', error: 'git worktree add failed: .git/config.lock' }), 'worktree_lock')
})

test('network disconnect text takes precedence over a misleading auth code', () => {
  const securityReviewer = run('SecurityReviewer', 'failed', '2026-10-18T01:00:00Z', 'claude_auth_required', 'API Error: The socket connection was closed unexpectedly')
  assert.equal(classifyFailure(securityReviewer), 'upstream')
  assert.equal(classifyFailure({ errorCode: 'claude_auth_required', error: 'socket hang up' }), 'upstream')
  const out = buildHealth({ now, agents: [agent('SecurityReviewer')], runs: [securityReviewer] })
  assert.equal(out.agents[0].lastFailure.category, 'upstream')
  assert.equal(out.incidents.some((item) => item.agentIds.includes('SecurityReviewer')), false)
})

for (const signal of ['socket connection was closed', 'socket hang up', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'fetch failed', 'network error', 'connection to upstream was reset']) {
  test(`network disconnect signal is upstream: ${signal}`, () => {
    assert.equal(classifyFailure({ errorCode: 'claude_auth_required', error: signal }), 'upstream')
  })
}

test('merges same quota incident and calculates family failure rate', () => {
  const out = buildHealth({ now, agents: [agent('Lead'), agent('Reviewer')], runs: [run('Lead', 'failed', '2026-10-18T01:00:00Z', 'provider_quota', 'resets 7:10pm'), run('Reviewer', 'failed', '2026-10-18T01:30:00Z', 'provider_quota', 'resets 7:10pm'), run('Lead', 'succeeded', '2026-10-17T12:00:00Z')] })
  assert.equal(out.incidents.length, 1)
  assert.deepEqual(out.incidents[0].agents.sort(), ['Lead', 'Reviewer'])
  assert.equal(out.families.find((x) => x.family === 'claude').failureRate, 2 / 3)
})

test('a later success clears an incident', () => {
  const out = buildHealth({ now, agents: [agent('Lead')], runs: [run('Lead', 'failed', '2026-10-18T01:00:00Z', 'claude_auth_required'), run('Lead', 'succeeded', '2026-10-18T01:30:00Z')] })
  assert.equal(out.incidents.length, 0)
})

test('warns when quota recovery is after the next standup', () => {
  const warningNow = new Date('2026-10-18T00:00:00.000Z')
  const out = buildHealth({ now: warningNow, agents: [agent('Lead')], runs: [run('Lead', 'failed', '2026-10-17T23:30:00Z', 'provider_quota', 'resets 7:10pm')], schedule: { days: [0, 1, 2, 3, 4, 5, 6] } })
  assert.equal(out.nextStandup.date, '2026-10-18')
  assert.equal(out.nextStandup.warning, true)
})

test('skips Sunday when Sunday is not a workday', () => {
  const out = buildHealth({ now, agents: [], runs: [], schedule: { days: [1, 2, 3, 4, 5, 6] } })
  assert.notEqual(out.nextStandup.date, '2026-10-18')
})

test('includes worktree lock as a bad incident but not a meeting warning', () => {
  const out = buildHealth({ now, agents: [agent('Builder', 'deepseek-v4')], runs: [run('Builder', 'failed', '2026-10-18T01:00:00Z', 'setup_failed', 'cannot lock .git/config')], schedule: { days: [0, 1, 2, 3, 4, 5, 6] } })
  assert.equal(out.incidents[0].category, 'worktree_lock')
  assert.equal(out.level, 'bad')
  assert.equal(out.nextStandup.warning, false)
})

test('cancelled / reassigned / interrupted runs are not failures', () => {
  const out = buildHealth({ now, agents: [agent('Lead')], runs: [
    run('Lead', 'cancelled', '2026-10-18T01:00:00Z', 'cancelled', 'Cancelled by control plane'),
    run('Lead', 'cancelled', '2026-10-18T01:01:00Z', 'issue_reassigned', 'Cancelled before issue reassignment'),
    run('Lead', 'interrupted', '2026-10-18T01:02:00Z', undefined, undefined),
    run('Lead', 'succeeded', '2026-10-18T01:03:00Z'),
    run('Lead', 'failed', '2026-10-18T01:04:00Z', 'adapter_failed', 'boom'),
  ] })
  const claude = out.families.find((f) => f.family === 'claude')
  assert.equal(claude.failed, 1)
  assert.equal(claude.runs, 5)
  assert.equal(out.agents.find((a) => a.name === 'Lead').failed, 1)
})

// 卡片查证记录的最小夹具；时间仅用于固定复现“3 分钟后成功”，不是原始绝对时间。
const opsCapacity = {
  agent: { id: 'OpsLead', model: 'gpt-5.6-terra', status: 'running' },
  runs: [
    { agentId: 'OpsLead', status: 'failed', errorCode: 'provider_quota', message: 'Selected model is at capacity. Please try a different model.', finishedAt: '2026-10-18T01:00:00Z' },
    { agentId: 'OpsLead', status: 'succeeded', finishedAt: '2026-10-18T01:03:00Z' },
    { agentId: 'OpsLead', status: 'running', startedAt: '2026-10-18T01:04:00Z' },
  ],
}

test('real OpsLead capacity message is upstream, not quota; later success preserves failure statistics', () => {
  assert.equal(classifyFailure(opsCapacity.runs[0]), 'upstream')
  const out = buildHealth({ now, agents: [opsCapacity.agent], runs: opsCapacity.runs })
  assert.equal(out.incidents.length, 0)
  assert.equal(out.agents[0].lastFailure.category, 'upstream')
  assert.equal(out.agents[0].family, 'gpt')
  assert.equal(out.agents[0].failed, 1)
  assert.equal(out.agents[0].succeeded, 1)
  assert.equal(out.families.find((row) => row.family === 'gpt').failureRate, 1 / 3)
  const beforeRecovery = buildHealth({ now, agents: [opsCapacity.agent], runs: [opsCapacity.runs[0]] })
  assert.equal(beforeRecovery.incidents.some((item) => item.category === 'quota'), false)
})

for (const message of ['at capacity', 'overloaded', 'capacity unavailable', 'try a different model', 'server is busy', 'rate limited temporarily']) {
  test(`provider_quota capacity signal: ${message}`, () => {
    assert.equal(classifyFailure({ errorCode: 'provider_quota', errorMessage: message }), 'upstream')
  })
}

for (const message of ['session limit', 'usage limit', 'hit your daily limit', 'quota exceeded', 'insufficient quota', 'billing']) {
  test(`provider_quota exhausted signal: ${message}`, () => {
    const out = buildHealth({ now, agents: [agent('Lead')], runs: [run('Lead', 'failed', '2026-10-18T01:00:00Z', 'provider_quota', message)] })
    assert.equal(out.agents[0].lastFailure.category, 'quota')
    assert.equal(out.agents[0].lastFailure.ambiguous, undefined)
  })
}

test('provider_quota without diagnostic text stays quota but is explicitly ambiguous', () => {
  for (const message of [undefined, 'provider rejected the request']) {
    const out = buildHealth({ now, agents: [agent('Lead')], runs: [run('Lead', 'failed', '2026-10-18T01:00:00Z', 'PROVIDER_QUOTA', message)] })
    assert.equal(out.agents[0].lastFailure.category, 'quota')
    assert.equal(out.agents[0].lastFailure.ambiguous, true)
    assert.equal(out.incidents.length, 1)
  }
})

test('capacity signal takes precedence over misleading quota code and combined text', () => {
  assert.equal(classifyFailure({ errorCode: 'provider_quota', details: { message: 'Selected model is at capacity; quota exceeded upstream.' } }), 'upstream')
})

test('quota advice uses affected model family rather than hard-coded Claude', () => {
  const cases = [
    ['claude-opus-5', '检查 Claude 会话额度或等待恢复时间。'],
    ['gpt-5.6-terra', '检查 OpenAI / Codex 额度或等待恢复；若提示模型繁忙，稍后会自动重试。'],
    ['codex-mini', '检查 OpenAI / Codex 额度或等待恢复；若提示模型繁忙，稍后会自动重试。'],
    ['deepseek-v4', '检查 DeepSeek 额度或等待恢复；若提示模型繁忙，稍后会自动重试。'],
  ]
  for (const [model, advice] of cases) {
    const out = buildHealth({ now, agents: [agent('Lead', model)], runs: [run('Lead', 'failed', '2026-10-18T01:00:00Z', 'provider_quota', 'usage limit')] })
    assert.equal(out.incidents[0].advice, advice)
  }
})

test('merged quota incident advice includes only affected families in stable order', () => {
  const agents = [agent('D', 'deepseek-v4'), agent('G', 'gpt-5.6-terra'), agent('C', 'claude-opus-5')]
  const runs = agents.map((entry) => run(entry.id, 'failed', '2026-10-18T01:00:00Z', 'provider_quota', 'usage limit'))
  const out = buildHealth({ now, agents, runs })
  assert.equal(out.incidents.length, 1)
  assert.equal(out.incidents[0].advice, '检查 Claude 会话、OpenAI / Codex、DeepSeek 额度或等待恢复；若提示模型繁忙，稍后会自动重试。')
  assert.equal(buildHealth({ now, agents, runs: runs.slice().reverse() }).incidents[0].advice, out.incidents[0].advice)
})

test('later running clears same-agent alerts, but cancelled, earlier and other-agent runs do not', () => {
  for (const code of ['provider_quota', 'claude_auth_required', 'setup_failed']) {
    const failure = run('Lead', 'failed', '2026-10-18T01:00:00Z', code, code === 'setup_failed' ? '.git/config.lock' : 'usage limit')
    // Auth fixture must not include quota text, preserving its original classification.
    if (code === 'claude_auth_required') failure.error = 'login required'
    for (const [status, agentId, at, expected] of [
      ['running', 'Lead', '2026-10-18T01:03:00Z', 0],
      ['cancelled', 'Lead', '2026-10-18T01:03:00Z', 1],
      ['queued', 'Lead', '2026-10-18T01:03:00Z', 1],
      ['running', 'Other', '2026-10-18T01:03:00Z', 1],
      ['running', 'Lead', '2026-10-18T00:59:00Z', 1],
      ['running', 'Lead', '2026-10-18T01:00:00Z', 1],
    ]) {
      const out = buildHealth({ now, agents: [agent('Lead')], runs: [failure, { agentId, status, startedAt: at }] })
      assert.equal(out.incidents.length, expected)
      assert.equal(out.agents.find((row) => row.agentId === 'Lead').failed, 1)
    }
  }
})

test('a later failure after running creates a fresh incident without hiding history', () => {
  const out = buildHealth({ now, agents: [agent('Lead')], runs: [
    run('Lead', 'failed', '2026-10-18T01:00:00Z', 'provider_quota', 'usage limit'),
    { agentId: 'Lead', status: 'running', startedAt: '2026-10-18T01:03:00Z' },
    run('Lead', 'failed', '2026-10-18T01:04:00Z', 'provider_quota', 'usage limit'),
  ] })
  assert.equal(out.incidents.length, 1)
  assert.equal(out.agents[0].failed, 2)
})

test('24 hour window and two hour incident window remain unchanged', () => {
  const out = buildHealth({ now, agents: [agent('Lead')], runs: [
    run('Lead', 'failed', '2026-10-17T01:59:59Z', 'provider_quota'),
    run('Lead', 'failed', '2026-10-17T02:00:00Z', 'provider_quota'),
    run('Lead', 'failed', '2026-10-17T23:59:59Z', 'provider_quota'),
    run('Lead', 'failed', '2026-10-18T00:00:00Z', 'provider_quota'),
    run('Lead', 'running', '2026-10-18T02:00:01Z'),
  ] })
  assert.equal(out.agents[0].runs24h, 3)
  assert.equal(out.agents[0].failed, 3)
  assert.equal(out.incidents.length, 1)
})
