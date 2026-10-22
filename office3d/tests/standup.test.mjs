// 晨会流程自检：模拟的 Paperclip（不会真的派任何任务）。运行：node --test tests/standup.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStandup, parseProposals, parseVotes } from '../standup.mjs'

const NAMES = ['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2', 'BackendSenior', 'GoSenior', 'Frontend1']
function world({ busy = [] } = {}) {
  const agents = NAMES.map((n) => ({ id: 'ag-' + n, name: n, status: 'idle' }))
  const issues = {}
  let n = 100
  const add = (identifier, title, extra = {}) => { const id = 'is-' + identifier; issues[id] = { id, identifier, title, status: 'backlog', projectId: 'p1', description: '', comments: [], ...extra }; return id }
  add('CMP-10', '补全客服 FAQ 的高棉语', {}); add('CMP-11', '提现流水账务对账', {}); add('CMP-13', '已经在做的事', { status: 'in_progress' })
  add('CMP-14', '整理仓库文档', {}); add('CMP-15', '前端按钮样式', {})
  busy.forEach((b, i) => add('CMP-9' + i, '手上的活', { status: 'in_progress', assigneeAgentId: 'ag-BackendSenior' }))
  const approvals = {}, patches = [], notes = [], created = []
  const get = async (p) => {
    if (p.endsWith('/agents')) return agents
    if (p.endsWith('/projects')) return [{ id: 'p1', name: '运营与知识库' }]
    if (p.endsWith('/issues')) return Object.values(issues)
    let m
    if ((m = p.match(/^\/api\/issues\/([\w-]+)\/comments$/))) return (issues[m[1]]?.comments || []).map((c) => (typeof c === 'string' ? { authorAgentId: 'x', body: c } : c))
    if ((m = p.match(/^\/api\/issues\/([\w-]+)$/))) return issues[m[1]]
    if ((m = p.match(/^\/api\/agents\/([\w-]+)$/))) return agents.find((a) => a.id === m[1])
    if ((m = p.match(/^\/api\/approvals\/([\w-]+)$/))) return { status: approvals[m[1]]?.status || 'pending' }
    throw new Error('unmocked ' + p)
  }
  const send = async (method, p, body) => {
    let m
    if (method === 'POST' && p.endsWith('/issues')) { const id = 'is-new' + ++n; issues[id] = { id, identifier: 'CMP-' + n, comments: [], ...body }; created.push(issues[id]); return issues[id] }
    if (method === 'POST' && p.endsWith('/approvals')) { const id = 'ap-' + ++n; approvals[id] = { ...body, status: 'pending' }; return { id } }
    if (method === 'POST' && (m = p.match(/^\/api\/issues\/([\w-]+)\/comments$/))) { issues[m[1]].comments.push(body.body); return {} }
    if (method === 'PATCH' && (m = p.match(/^\/api\/issues\/([\w-]+)$/))) { patches.push([m[1], body]); Object.assign(issues[m[1]], body); return {} }
    throw new Error('unmocked ' + method + ' ' + p)
  }
  return { agents, issues, approvals, patches, notes, created, get, send }
}
const mk = (w) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdtest-'))
  const wh = path.join(dir, 'wh.json'); fs.writeFileSync(wh, JSON.stringify({ days: [0, 1, 2, 3, 4, 5, 6] }))
  return createStandup({ dir, workhoursFile: wh, company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0 })
}
const vote = (w, name, rows) => { const vi = w.created.find((i) => i.title.startsWith('晨会投票') && i.title.includes(name)); vi.comments.push(rows.map((r, k) => `VOTE ${k + 1}: ${r} | 理由`).join('\n')); vi.status = 'done' }

test('解析：PROPOSE 与 VOTE 行', () => {
  assert.equal(parseProposals([{ body: 'PROPOSE 1 | cmp-10 | Frontend1 | 理由 a\n废话\nPROPOSE 2 | CMP-11 | GoSenior | 资金类 b' }]).length, 2)
  assert.deepEqual(parseVotes([{ body: 'VOTE 2: ESCALATE | 要花钱' }]), { 1: { v: 'ESCALATE', why: '要花钱' } })
})

test('完整流程：提议 → 5 票 → 通过的派发，资金类 / 升级走董事会，票不够不做', async () => {
  const w = world()
  const s = mk(w)
  const r = await s.open()
  assert.equal(r.opened, true)
  const lead = w.created.find((i) => i.title.includes('提议'))
  assert.equal(lead.assigneeAgentId, 'ag-Lead')
  lead.comments.push('PROPOSE 1 | CMP-10 | Frontend1 | 双语缺口\nPROPOSE 2 | CMP-11 | GoSenior | 资金类 对账\nPROPOSE 3 | CMP-13 | Frontend1 | 在做的\nPROPOSE 4 | CMP-14 | Frontend1 | 整理\nPROPOSE 5 | CMP-15 | GoSenior | 样式\nPROPOSE 6 | CMP-99 | Frontend1 | 不存在')
  lead.status = 'done'
  await s.tick()
  const v = s.view()
  assert.equal(v.state, 'voting')
  assert.deepEqual(v.candidates.map((c) => c.ident), ['CMP-10', 'CMP-11', 'CMP-14', 'CMP-15']) // 13 已在做、99 不存在，被剔除
  assert.equal(v.dropped.length, 2)
  assert.equal(w.created.filter((i) => i.title.startsWith('晨会投票')).length, 5)
  // 5 位委员各投一次：CMP-10 全票通过；CMP-11 资金类全票通过（仍要董事会）；CMP-14 只有 2 票；CMP-15 有人升级
  vote(w, 'PM', ['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE'])
  vote(w, 'Architect', ['APPROVE', 'APPROVE', 'APPROVE', 'APPROVE'])
  vote(w, 'Backend2', ['APPROVE', 'APPROVE', 'CHANGES', 'APPROVE'])
  vote(w, 'Frontend2', ['APPROVE', 'APPROVE', 'CHANGES', 'ESCALATE'])
  vote(w, 'Lead', ['APPROVE', 'APPROVE', 'CHANGES', 'APPROVE'])
  await s.tick()
  const d = s.view()
  const by = Object.fromEntries(d.candidates.map((c) => [c.ident, c.outcome]))
  assert.deepEqual(by, { 'CMP-10': 'DISPATCHED', 'CMP-11': 'BOARD', 'CMP-14': 'NOT_TODAY', 'CMP-15': 'BOARD' })
  assert.equal(d.state, 'awaiting')
  assert.equal(w.issues['is-CMP-10'].status, 'todo'); assert.equal(w.issues['is-CMP-10'].assigneeAgentId, 'ag-Frontend1')
  assert.equal(w.issues['is-CMP-11'].status, 'backlog', '资金类没批准前不得开工')
  assert.equal(w.issues['is-CMP-14'].status, 'backlog')
  assert.equal(Object.keys(w.approvals).length, 2)
  // 董事会批准第一个（CMP-11）、拒绝第二个（CMP-15）
  const [apA, apB] = Object.keys(w.approvals)
  w.approvals[apA].status = 'approved'; w.approvals[apB].status = 'rejected'
  await s.tick()
  const fin = s.view()
  assert.equal(fin.state, 'done')
  assert.equal(fin.candidates.find((c) => c.ident === 'CMP-11').outcome, 'DISPATCHED')
  assert.equal(w.issues['is-CMP-11'].status, 'todo'); assert.equal(w.issues['is-CMP-11'].assigneeAgentId, 'ag-GoSenior')
  assert.equal(fin.candidates.find((c) => c.ident === 'CMP-15').outcome, 'REJECTED')
  assert.equal(w.issues['is-CMP-15'].status, 'backlog')
})

test('每人最多 2 个未完成：手上已满的不派', async () => {
  const w = world({ busy: [1, 2] })
  const s = mk(w)
  await s.open()
  const lead = w.created.find((i) => i.title.includes('提议'))
  lead.comments.push('PROPOSE 1 | CMP-10 | BackendSenior | 后端的活'); lead.status = 'done'
  await s.tick()
  for (const n of ['PM', 'Architect', 'Backend2', 'Frontend2', 'Lead']) vote(w, n, ['APPROVE'])
  await s.tick()
  assert.equal(s.view().candidates[0].outcome, 'SKIPPED')
  assert.equal(w.issues['is-CMP-10'].status, 'backlog')
})

test('一票都没收到：先延期，再作废，不会当成「全部不做」，也不派任何任务', async () => {
  const w = world()
  const s = mk(w)
  await s.open()
  const lead = w.created.find((i) => i.title.includes('提议'))
  lead.comments.push('PROPOSE 1 | CMP-10 | Frontend1 | 理由'); lead.status = 'done'
  await s.tick()
  for (const vi of w.created.filter((i) => i.title.startsWith('晨会投票'))) vi.status = 'done' // 交了任务但没按格式投票
  await s.tick()
  assert.equal(s.view().state, 'void') // 5 张都交了却没有有效票：等也没用，直接作废
  assert.match(w.notes.at(-1), /作废/)
  assert.equal(w.patches.filter(([, b]) => b.status === 'todo').length, 0, '不得派发任何任务')
  assert.equal(w.issues['is-CMP-10'].status, 'backlog')
})

const later = (body, ms = 1000) => ({ authorAgentId: 'x', body, createdAt: new Date(Date.now() + ms).toISOString() })
test('提议一项都不可用：把原因交回 Lead 重提一次，重提有效就继续投票', async () => {
  const w = world(), s = mk(w)
  await s.open()
  const lead = w.created.find((i) => i.title.includes('提议'))
  lead.comments.push('PROPOSE 1 | CMP-13 | Frontend1 | 已经在做的'); lead.status = 'done' // CMP-13 是在途任务，不可用
  await s.tick()
  assert.equal(lead.status, 'todo', '已交回 Lead')
  assert.match(String(lead.comments.at(-1)), /一项都不能用/)
  assert.match(String(lead.comments.at(-1)), /CMP-13/)
  assert.equal(s.view().state, 'proposing')
  lead.comments.push(later('PROPOSE 1 | CMP-10 | Frontend1 | 双语缺口')); lead.status = 'done'
  await s.tick()
  assert.equal(s.view().state, 'voting')
  assert.deepEqual(s.view().candidates.map((c) => c.ident), ['CMP-10']) // 旧的不可用提议不再算
})
test('重提后仍然全部不可用：才作废；回 NONE：说明原因后作废', async () => {
  const a = world(), sa = mk(a)
  await sa.open()
  const l1 = a.created.find((i) => i.title.includes('提议'))
  l1.comments.push('PROPOSE 1 | CMP-13 | Frontend1 | x'); l1.status = 'done'
  await sa.tick()
  l1.comments.push(later('PROPOSE 1 | CMP-13 | Frontend1 | 还是它')); l1.status = 'done'
  await sa.tick()
  assert.equal(sa.view().state, 'void')
  const b = world(), sb = mk(b)
  await sb.open()
  const l2 = b.created.find((i) => i.title.includes('提议'))
  l2.comments.push('PROPOSE 1 | CMP-13 | Frontend1 | x'); l2.status = 'done'
  await sb.tick()
  l2.comments.push(later('NONE | 待排期里没有依赖已满足的任务')); l2.status = 'done'
  await sb.tick()
  assert.equal(sb.view().state, 'void')
  assert.match(sb.view().note, /没有合适的待排期任务/)
})

test('最坏情况：8 个候选理由都很长，晨会投票提示语仍不超过 3600 字且规则与格式完整保留', async () => {
  const w = world(), s = mk(w)
  for (let k = 30; k < 38; k++) { const id = 'is-CMP-' + k; w.issues[id] = { id, identifier: 'CMP-' + k, title: '一个比较长的任务标题 ' + 'y'.repeat(50), status: 'backlog', projectId: 'p1', description: '', comments: [] } }
  await s.open()
  const lead = w.created.find((i) => i.title.includes('提议'))
  lead.comments.push(Array.from({ length: 8 }, (_, k) => `PROPOSE ${k + 1} | CMP-${30 + k} | Frontend1 | ${'很长的理由'.repeat(60)}`).join('\n')); lead.status = 'done'
  await s.tick()
  const votes = w.created.filter((i) => i.title.startsWith('晨会投票'))
  assert.equal(votes.length, 5)
  for (const v of votes) {
    assert.ok(v.description.length <= 3600, `描述 ${v.description.length} 字`)
    assert.ok(v.description.includes('VOTE <序号>: APPROVE|CHANGES|ESCALATE'), '投票格式没丢')
    assert.ok(v.description.includes('投票规则'), '规则没丢')
    assert.ok(v.description.includes('CMP-37'), '最后一个候选没丢')
  }
})

test('返工超限：候选被剔除不投票不派发；rework 抛错按未超限继续', async () => {
  const mkR = (w, rework) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdtest-')); const wh = path.join(dir, 'wh.json'); fs.writeFileSync(wh, JSON.stringify({ days: [0, 1, 2, 3, 4, 5, 6] })); return createStandup({ dir, workhoursFile: wh, company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0, rework }) }
  const w = world(), s = mkR(w, (id) => id === 'is-CMP-10')
  await s.open()
  const lead = w.created.find((i) => i.title.includes('提议'))
  lead.comments.push('PROPOSE 1 | CMP-10 | Frontend1 | 双语缺口\nPROPOSE 2 | CMP-14 | Frontend1 | 整理'); lead.status = 'done'
  await s.tick()
  const v = s.view()
  assert.equal(v.state, 'voting')
  assert.deepEqual(v.candidates.map((c) => c.ident), ['CMP-14'], 'CMP-10 返工超限不得作为候选')
  assert.match(v.dropped.join('\n'), /返工超限/)
  assert.equal(w.created.filter((i) => i.title.startsWith('晨会投票')).length, 5)
  // rework 抛错（读不到返工状态）：按未超限，正常进候选
  const w2 = world(), s2 = mkR(w2, () => { throw new Error('读不到返工状态') })
  await s2.open()
  const lead2 = w2.created.find((i) => i.title.includes('提议'))
  lead2.comments.push('PROPOSE 1 | CMP-10 | Frontend1 | 双语缺口'); lead2.status = 'done'
  await s2.tick()
  assert.deepEqual(s2.view().candidates.map((c) => c.ident), ['CMP-10'])
})
