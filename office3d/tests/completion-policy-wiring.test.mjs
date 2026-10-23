// DS-7：三处「写成 done」入口的接线测试（替身 get / send，不连真实 Paperclip）。
// 三处入口：server.mjs 的 act() review accept、tgActions.review（Telegram）、acceptance.mjs 自动验收批次。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCompletionEvidence,
  createCompletionGate,
  decideCompletion,
  loadCompletionPolicy,
} from '../completion-policy.mjs'
import { createAcceptance } from '../acceptance.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OFFICE = path.resolve(HERE, '..')
const SERVED = fs.readFileSync(path.join(OFFICE, 'server.mjs'), 'utf8')
const ACCEPTANCE_SRC = fs.readFileSync(path.join(OFFICE, 'acceptance.mjs'), 'utf8')

const ENFORCED = '2026-01-01T00:00:00.000Z'
const ENFORCE = loadCompletionPolicy({ mode: 'enforce', enforcedSince: ENFORCED, boardActors: ['board-1'] })
const WARN = loadCompletionPolicy({ mode: 'warn', enforcedSince: ENFORCED, boardActors: ['board-1'] })
const OFF = loadCompletionPolicy({ mode: 'off' })

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ds7-wiring-'))
}

// ---- createCompletionGate：证据读取与判定 -----------------------------------------

test('createCompletionGate：off 模式不读任何数据（零 GET）', async () => {
  let calls = 0
  const gate = createCompletionGate({ policy: OFF, get: async () => { calls++; throw new Error('should not read') } })
  const decision = await gate('issue-1')
  assert.equal(decision.allow, true)
  assert.equal(decision.skipped, true)
  assert.equal(calls, 0)
})

test('createCompletionGate：enforce 缺证据拒绝，合格证据通过', async () => {
  const issue = { id: 'issue-1', identifier: 'CMP-1', assigneeAgentId: 'agent-1', createdAt: '2026-06-01T00:00:00.000Z' }
  const read = (comments) => async (url) => {
    if (url.endsWith('/comments')) return comments
    if (url.startsWith('/api/issues/')) return issue
    throw new Error(`unexpected ${url}`)
  }
  const noEvidence = createCompletionGate({ policy: ENFORCE, get: read([]), versionCheck: async () => null })
  const denied = await noEvidence('issue-1')
  assert.equal(denied.allow, false)
  assert.ok(denied.reasons.includes('NO_EVIDENCE'))

  const withEvidence = createCompletionGate({
    policy: ENFORCE,
    get: read([{ authorAgentId: 'agent-9', body: '【验收证据】对象版本：abc' }]),
    versionCheck: async () => ({ result: '版本一致' }),
  })
  const allowed = await withEvidence('issue-1')
  assert.equal(allowed.allow, true)
  assert.deepEqual(allowed.reasons, [])
})

test('createCompletionGate：版本不一致拒绝；本机特批放行并写审计', async () => {
  const issue = { id: 'issue-1', identifier: 'CMP-1', assigneeAgentId: 'agent-1', createdAt: '2026-06-01T00:00:00.000Z' }
  const get = async (url) => url.endsWith('/comments') ? [{ authorAgentId: 'agent-9', body: '【验收证据】对象版本：abc' }] : issue
  const gate = createCompletionGate({ policy: ENFORCE, get, versionCheck: async () => ({ result: '版本已变' }) })
  const denied = await gate('issue-1')
  assert.equal(denied.allow, false)
  assert.ok(denied.reasons.includes('VERSION_MISMATCH'))
  const granted = await gate('issue-1', { override: { reason: '本机董事会核对后特批放行' }, localFullAccess: true, at: '2026-10-23T00:00:00.000Z' })
  assert.equal(granted.allow, true)
  assert.equal(granted.audit.override, true)
})

// ---- 自动验收批次接线 -------------------------------------------------------------

const ITEM_ID = 'item-0000'
const VOTE_IDS = ['vote-0001', 'vote-0002', 'vote-0003']

function writeAcceptanceFixture(dir) {
  const since = '2025-01-01T00:00:00.000Z'
  const dueAt = '2999-01-01T00:00:00.000Z'
  fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify({
    batches: [{
      id: 'B-DS7',
      createdAt: since,
      dueAt,
      state: 'voting',
      items: [{ idx: 0, issueId: ITEM_ID, ident: 'CMP-1', title: '示例任务', since, owner: '某员工', report: '回报', votes: {}, voters: ['A', 'B', 'C'] }],
      voteIssues: VOTE_IDS.map((id, index) => ({ name: ['A', 'B', 'C'][index], issueId: id, ident: `CMP-V${index + 1}`, items: [0] })),
    }],
    decided: {},
  }))
}

function fakeTransport({ dir, completionGate = null }) {
  const calls = []
  const get = async (url) => {
    if (VOTE_IDS.includes(url.replace('/api/issues/', '').replace('/comments', ''))) {
      if (url.endsWith('/comments')) return [{ authorAgentId: 'agent-1', body: 'VOTE 1: APPROVE | 看过证据，通过' }]
      return { id: url.split('/').pop(), status: 'done' }
    }
    if (url === `/api/issues/${ITEM_ID}`) return { id: ITEM_ID, identifier: 'CMP-1', status: 'in_review' }
    if (url.endsWith('/comments')) return []
    throw new Error(`unexpected get ${url}`)
  }
  const send = async (method, url, body) => { calls.push({ method, url, body: body ?? null }); return { id: 'x' } }
  const acceptance = createAcceptance({ dir, company: 'c1', get, send, notify: null, completionGate, log: () => {} })
  return { acceptance, calls }
}

const donePatches = (calls) => calls.filter((call) => call.method === 'PATCH' && call.body && call.body.status === 'done')

test('off 接线与基线逐字段一致（同样 1 次 done PATCH、评论相同）', async () => {
  const dirA = tempDir(); writeAcceptanceFixture(dirA)
  const baseline = fakeTransport({ dir: dirA })
  await baseline.acceptance.tick()

  const dirB = tempDir(); writeAcceptanceFixture(dirB)
  const offGate = async () => ({ allow: true, mode: 'off', reasons: [], audit: null, skipped: true })
  const withOff = fakeTransport({ dir: dirB, completionGate: offGate })
  await withOff.acceptance.tick()

  assert.equal(donePatches(baseline.calls).length, 1)
  assert.deepEqual(donePatches(withOff.calls), donePatches(baseline.calls))
  assert.deepEqual(
    baseline.calls.filter((call) => call.method === 'POST'),
    withOff.calls.filter((call) => call.method === 'POST'),
  )
})

test('enforce 拦下时自动验收批次 0 次 done PATCH，并记录 POLICY_BLOCKED', async () => {
  const dir = tempDir(); writeAcceptanceFixture(dir)
  const gate = async () => ({ allow: false, mode: 'enforce', reasons: ['NO_EVIDENCE'], audit: null })
  const { acceptance, calls } = fakeTransport({ dir, completionGate: gate })
  await acceptance.tick()
  assert.equal(donePatches(calls).length, 0, 'enforce 拦下时不能 PATCH done')
  const view = acceptance.view()
  assert.equal(view.state, 'done')
  assert.equal(view.items[0].outcome, 'POLICY_BLOCKED')
  assert.match(view.items[0].note, /NO_EVIDENCE/)
})

test('warn 接线照常完成，但评论里附上原因', async () => {
  const dir = tempDir(); writeAcceptanceFixture(dir)
  const gate = async () => ({ allow: true, mode: 'warn', reasons: ['VERSION_MISMATCH'], audit: null })
  const { acceptance, calls } = fakeTransport({ dir, completionGate: gate })
  await acceptance.tick()
  assert.equal(donePatches(calls).length, 1)
  const comment = calls.find((call) => call.method === 'POST' && String(call.body?.body || '').includes('完成策略（warn）'))
  assert.ok(comment, 'warn 原因应写进评论')
})

test('合格特批在自动验收里放行并继续 PATCH（特批由本机入口负责，批次不特批）', async () => {
  const dir = tempDir(); writeAcceptanceFixture(dir)
  const gate = async () => ({ allow: true, mode: 'enforce', reasons: ['NO_EVIDENCE'], audit: { override: true } })
  const { acceptance, calls } = fakeTransport({ dir, completionGate: gate })
  await acceptance.tick()
  assert.equal(donePatches(calls).length, 1)
})

// ---- 三处入口的静态接线断言 -------------------------------------------------------

test('server.mjs：act() review 接 completionGateFn 且传入本机完整权限', () => {
  assert.match(SERVED, /completionGateFn\(a\.issueId, \{ override, localFullAccess: options\.localFullAccess === true \}\)/)
  assert.match(SERVED, /localFullAccess: !lanUser && !wallScope/)
  assert.match(SERVED, /status: 409/)
})

test('server.mjs：Telegram 验收入口也走 completionGateFn（不可特批）', () => {
  assert.match(SERVED, /async review\(issueId, who\) \{\r?\n    const decision = await completionGateFn\(issueId, \{ localFullAccess: false \}\)/)
})

test('server.mjs + acceptance.mjs：自动验收批次接 completionGate', () => {
  assert.match(SERVED, /completionGate: \(id\) => completionGateFn\(id, \{ localFullAccess: false \}\)/)
  assert.match(ACCEPTANCE_SRC, /POLICY_BLOCKED/)
  assert.match(ACCEPTANCE_SRC, /completionGate/)
})

test('开关文件示例存在且默认 off；运行数据文件不随包提交', () => {
  const example = JSON.parse(fs.readFileSync(path.join(OFFICE, 'completion-policy.json.example'), 'utf8'))
  assert.deepEqual(example, { mode: 'off' })
  assert.equal(fs.existsSync(path.join(OFFICE, 'completion-policy.json')), false, '运行数据 completion-policy.json 不应入库')
})

test('decideCompletion 在接线场景下保持纯函数（不改 issue / 评论对象）', () => {
  const issue = { id: 'i1', createdAt: '2026-06-01T00:00:00.000Z' }
  const comments = [{ authorAgentId: 'a', body: '【验收证据】x' }]
  const snapshot = JSON.stringify({ issue, comments })
  const decision = decideCompletion({ policy: ENFORCE, task: issue, evidence: buildCompletionEvidence({ issue, comments, versionCheck: { result: '版本一致' } }) })
  assert.equal(typeof decision.allow, 'boolean')
  assert.equal(JSON.stringify({ issue, comments }), snapshot)
})
