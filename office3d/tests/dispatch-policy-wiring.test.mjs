// DS-8：两处派发入口的接线测试（从 server.mjs 提取真实 act()，替身 get / send，不连真实上游）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import {
  decideAssign,
  decideCreate,
  dispatchMessage,
  loadDispatchPolicy,
} from '../dispatch-policy.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SERVER = fs.readFileSync(path.resolve(HERE, '..', 'server.mjs'), 'utf8')
const ACT_SOURCE = SERVER.slice(SERVER.indexOf('async function act(a'), SERVER.indexOf('// 任务详情（只读）'))
const AT = '2026-10-23T00:00:00.000Z'
// vm 里创建的对象与本 realm 原型不同，跨 realm 比较前先转成普通 JSON。
const plain = (value) => JSON.parse(JSON.stringify(value))

const OFF = loadDispatchPolicy({ mode: 'off' })
const WARN = loadDispatchPolicy({ mode: 'warn' })
const ENFORCE = loadDispatchPolicy({ mode: 'enforce' })

function harness({ policy, contractView = false, parseContract, validateContract, issues = {}, agents = [] }) {
  const calls = []
  const send = async (method, url, body) => {
    calls.push({ method, url, body: body ?? null })
    return { id: 'result-1' }
  }
  const get = async (url) => {
    if (url === '/api/companies/demo/agents') return agents
    if (url.startsWith('/api/issues/')) {
      const id = url.slice('/api/issues/'.length)
      if (issues[id]) return issues[id]
      throw new Error(`未准备的任务：${id}`)
    }
    throw new Error(`未准备的请求：${url}`)
  }
  const context = {
    dispatchPolicy: policy,
    decideAssign,
    decideCreate,
    dispatchMessage,
    need: (ok, message) => { if (!ok) throw Object.assign(new Error(message), { status: 400 }) },
    UUID: /^[a-z0-9-]+$/,
    str: (value, limit) => String(value ?? '').slice(0, limit),
    send,
    get,
    COMPANY: 'demo',
    projectsCache: [{ id: 'p1' }],
    MONEY_RE: /(?!)/,
    MONEY_OK: new Set(['GoSenior', 'DBEngineer']),
    MONEY_CLAUSE: '',
    parseContract: parseContract || (() => ({ found: true })),
    validateContract: validateContract || (() => ({ ok: true, errors: [] })),
    CONTRACT_VIEW_ENABLED: contractView,
    completionGateFn: async () => ({ allow: true, mode: 'off', reasons: [] }),
    completionMessage: () => '',
    console: { log() {} },
  }
  const act = vm.runInNewContext(`${ACT_SOURCE}\nact`, context)
  return { act, calls }
}

const agent = { id: 'a1', name: 'Backend2', status: 'idle' }
const assignIssue = (blockedBy) => ({ id: 't1', identifier: 'CMP-1', status: 'backlog', description: '', assigneeAgentId: null, blockedBy })
const assignArgs = { type: 'assign', issueId: 't1', assigneeAgentId: 'a1' }
const createArgs = { type: 'create_issue', projectId: 'p1', title: '任务', description: '说明', assigneeAgentId: 'a1' }

test('off：assign 请求与改前逐字段一致（未完成用旧错误文案、force 放行、取消算满足）', async () => {
  const pending = harness({ policy: OFF, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'todo' }]) }, agents: [agent] })
  await assert.rejects(pending.act(assignArgs), /依赖未完成：CMP-9/)
  assert.equal(pending.calls.length, 0, 'off 下未完成依赖不写请求')

  const forced = harness({ policy: OFF, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'todo' }]) }, agents: [agent] })
  await forced.act({ ...assignArgs, force: true })
  assert.deepEqual(plain(forced.calls), [{ method: 'PATCH', url: '/api/issues/t1', body: { assigneeAgentId: 'a1', status: 'todo' } }])

  const cancelled = harness({ policy: OFF, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'cancelled' }]) }, agents: [agent] })
  await cancelled.act(assignArgs)
  assert.deepEqual(plain(cancelled.calls[0].body), { assigneeAgentId: 'a1', status: 'todo' }, 'off 下取消依赖算满足')
})

test('enforce：assign 依赖未满足 0 次写请求，force 不再生效', async () => {
  const pending = harness({ policy: ENFORCE, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'todo' }]) }, agents: [agent] })
  await assert.rejects(pending.act(assignArgs), /DEP_PENDING/)
  assert.equal(pending.calls.length, 0)
  await assert.rejects(pending.act({ ...assignArgs, force: true }), /DEP_PENDING/)
  assert.equal(pending.calls.length, 0, 'enforce 下 force 不能单独放行')

  const cancelled = harness({ policy: ENFORCE, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'cancelled' }]) }, agents: [agent] })
  await assert.rejects(cancelled.act(assignArgs), /DEP_CANCELLED/, '取消依赖默认不算交付')
  assert.equal(cancelled.calls.length, 0)
})

test('enforce：合格特批放行并返回 dispatchAudit；LAN / 过短理由被拒', async () => {
  const reason = '本机董事会核对依赖后特批指派'
  const granted = harness({ policy: ENFORCE, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'todo' }]) }, agents: [agent] })
  const result = await granted.act({ ...assignArgs, overrideReason: reason }, { localFullAccess: true, at: AT })
  assert.equal(granted.calls.length, 1)
  assert.equal(result.dispatchAudit.override, true)
  assert.equal(result.dispatchAudit.overrideReason, reason)

  const lan = harness({ policy: ENFORCE, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'todo' }]) }, agents: [agent] })
  await assert.rejects(lan.act({ ...assignArgs, overrideReason: reason }, { localFullAccess: false }), /OVERRIDE_NOT_ALLOWED/)
  assert.equal(lan.calls.length, 0)

  const short = harness({ policy: ENFORCE, issues: { t1: assignIssue([{ id: 'b1', identifier: 'CMP-9', status: 'todo' }]) }, agents: [agent] })
  await assert.rejects(short.act({ ...assignArgs, overrideReason: '太短' }, { localFullAccess: true }), /OVERRIDE_NOT_ALLOWED/)
  assert.equal(short.calls.length, 0)
})

test('off：create_issue 请求与改前逐字段一致', async () => {
  const withAssignee = harness({ policy: OFF, agents: [agent] })
  const created = await withAssignee.act(createArgs)
  assert.deepEqual(plain(created), { id: 'result-1' }, 'off 且未开契约视图时返回值与改前一致')
  assert.deepEqual(plain(withAssignee.calls), [{
    method: 'POST',
    url: '/api/companies/demo/issues',
    body: { title: '任务', description: '说明', projectId: 'p1', priority: 'medium', status: 'todo', assigneeAgentId: 'a1' },
  }])

  const draft = harness({ policy: OFF, agents: [agent] })
  const createdDraft = await draft.act({ type: 'create_issue', projectId: 'p1', title: '任务', description: '说明' })
  assert.deepEqual(plain(createdDraft), { id: 'result-1' })
  assert.equal(draft.calls[0].body.status, 'backlog')
  assert.equal(Object.hasOwn(draft.calls[0].body, 'assigneeAgentId'), false)
})

test('enforce：create_issue 契约不完整时只能建成草稿（不指定负责人）且只发 1 次 POST', async () => {
  const incomplete = harness({
    policy: ENFORCE,
    contractView: true,
    agents: [agent],
    parseContract: () => ({ found: true, contract: {} }),
    validateContract: () => ({ ok: false, errors: [{ field: '验收标准', code: 'MISSING' }] }),
  })
  const result = await incomplete.act(createArgs)
  assert.equal(incomplete.calls.length, 1, '不新增上游请求次数')
  assert.equal(incomplete.calls[0].body.status, 'backlog', '契约不完整只能草稿')
  assert.equal(Object.hasOwn(incomplete.calls[0].body, 'assigneeAgentId'), false, '草稿不指定负责人')
  assert.equal(result.dispatchCheck.forcedDraft, true)
  assert.ok(result.dispatchCheck.reasons.includes('CONTRACT_INCOMPLETE'))
  assert.equal(result.contractCheck.state, 'incomplete')

  const noContract = harness({
    policy: ENFORCE,
    contractView: true,
    agents: [agent],
    parseContract: () => ({ found: false }),
  })
  const noContractResult = await noContract.act(createArgs)
  assert.equal(noContract.calls[0].body.status, 'backlog')
  assert.ok(noContractResult.dispatchCheck.reasons.includes('NO_CONTRACT'))

  const complete = harness({
    policy: ENFORCE,
    contractView: true,
    agents: [agent],
    validateContract: () => ({ ok: true, errors: [] }),
  })
  const completeResult = await complete.act(createArgs)
  assert.deepEqual(plain(complete.calls[0].body), { title: '任务', description: '说明', projectId: 'p1', priority: 'medium', status: 'todo', assigneeAgentId: 'a1' })
  assert.equal(Object.hasOwn(completeResult, 'dispatchCheck'), false)
  assert.equal(completeResult.contractCheck.state, 'complete')
})

test('warn：create_issue 照常可执行，但结果里带原因', async () => {
  const warn = harness({
    policy: WARN,
    contractView: true,
    agents: [agent],
    validateContract: () => ({ ok: false, errors: [{ field: 'x', code: 'MISSING' }] }),
  })
  const result = await warn.act(createArgs)
  assert.equal(warn.calls[0].body.status, 'todo', 'warn 不改变创建状态')
  assert.equal(result.dispatchCheck.mode, 'warn')
  assert.ok(result.dispatchCheck.reasons.includes('CONTRACT_INCOMPLETE'))
})
