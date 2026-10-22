// 超时验收自检：模拟的 Paperclip。运行：node --test tests/acceptance.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAcceptance } from '../acceptance.mjs'

const NAMES = ['PM', 'Lead', 'Architect', 'Backend2', 'Frontend2', 'Reviewer2', 'GoSenior', 'Frontend1', 'BackendSenior']
const OLD = new Date(Date.now() - 2 * 3600000).toISOString(), FRESH = new Date(Date.now() - 10 * 60000).toISOString()
function world() {
  const agents = NAMES.map((n) => ({ id: 'ag-' + n, name: n, status: 'idle' }))
  const issues = {}, patches = [], notes = []
  let n = 100
  const add = (identifier, title, extra = {}) => { const id = 'is-' + identifier; issues[id] = { id, identifier, title, status: 'in_review', description: '', comments: [{ authorAgentId: 'x', body: '已完成，见提交 abc123' }], ...extra }; return id }
  add('CMP-1', '前端按钮样式', { assigneeAgentId: 'ag-Frontend1' })
  add('CMP-2', '提现流水账务对账', { assigneeAgentId: 'ag-GoSenior' })
  add('CMP-3', '文档整理', { assigneeAgentId: 'ag-BackendSenior' })
  add('CMP-4', 'PM 自己写的说明', { assigneeAgentId: 'ag-PM' })
  add('CMP-5', '刚交的活', { assigneeAgentId: 'ag-Frontend1' })
  const get = async (p) => {
    if (p.endsWith('/agents')) return agents
    if (p.endsWith('/projects')) return [{ id: 'p1', name: '运营与知识库' }]
    let m
    if ((m = p.match(/^\/api\/issues\/([\w-]+)\/comments$/))) return issues[m[1]].comments.map((b) => (typeof b === 'string' ? { authorAgentId: 'x', body: b } : b))
    if ((m = p.match(/^\/api\/issues\/([\w-]+)$/))) return issues[m[1]]
    throw new Error('unmocked ' + p)
  }
  const send = async (method, p, body) => {
    let m
    if (method === 'POST' && p.endsWith('/issues')) { const id = 'is-v' + ++n; issues[id] = { id, identifier: 'CMP-' + n, status: 'todo', comments: [], ...body }; return issues[id] }
    if (method === 'POST' && (m = p.match(/^\/api\/issues\/([\w-]+)\/comments$/))) { issues[m[1]].comments.push(body.body); return {} }
    if (method === 'PATCH' && (m = p.match(/^\/api\/issues\/([\w-]+)$/))) { patches.push([m[1], body]); Object.assign(issues[m[1]], body); return {} }
    throw new Error('unmocked ' + method + ' ' + p)
  }
  const waiting = [['CMP-1', OLD], ['CMP-2', OLD], ['CMP-3', OLD], ['CMP-4', OLD], ['CMP-5', FRESH]].map(([id, since]) => ({ kind: 'review', id, issueId: 'is-' + id, since }))
  return { agents, issues, patches, notes, get, send, waiting }
}
const mk = (w) => createAcceptance({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'acctest-')), company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0 })
const vote = (w, name, rows) => { const vi = Object.values(w.issues).find((i) => (i.title || '').startsWith('验收投票') && i.title.includes('：' + name + '（')); vi.comments.push(rows.map((r, k) => `VOTE ${k + 1}: ${r} | 理由`).join('\n')); vi.status = 'done' }

test('超过 1 小时才投；资金类只能董事会；作者回避；通过 / 退回 / 留给董事会', async () => {
  const w = world(), a = mk(w)
  a.onState(w.waiting, true)
  await a.tick() // 自动路径：只有超过 1 小时的才会被开
  const v = a.view()
  assert.equal(v.state, 'voting')
  assert.deepEqual(v.items.map((i) => i.ident), ['CMP-1', 'CMP-3', 'CMP-4']) // CMP-2 资金类剔除，CMP-5 才 10 分钟
  assert.equal(Object.values(w.issues).filter((i) => (i.title || '').startsWith('验收投票')).length, 6) // 5 位委员 + 后备（顶替 PM 回避的 CMP-4）
  const pmVote = Object.values(w.issues).find((i) => (i.title || '').includes('：PM（')); assert.equal(pmVote.title.includes('2 项'), true) // PM 不投自己写的
  const arch = Object.values(w.issues).find((i) => (i.title || '').includes('：Reviewer2（')); assert.equal(arch.title.includes('1 项'), true)
  // CMP-1 全票通过；CMP-3 4 票要修改；CMP-4 有人升级
  vote(w, 'PM', ['APPROVE', 'CHANGES']); vote(w, 'Architect', ['APPROVE', 'CHANGES', 'APPROVE']); vote(w, 'Backend2', ['APPROVE', 'CHANGES', 'APPROVE'])
  vote(w, 'Frontend2', ['APPROVE', 'CHANGES', 'ESCALATE']); vote(w, 'Lead', ['APPROVE', 'APPROVE', 'APPROVE']); vote(w, 'Reviewer2', ['APPROVE'])
  await a.tick()
  const by = Object.fromEntries(a.view().items.map((i) => [i.ident, i.outcome]))
  assert.deepEqual(by, { 'CMP-1': 'ACCEPTED', 'CMP-3': 'CHANGES', 'CMP-4': 'BOARD' })
  assert.equal(w.issues['is-CMP-1'].status, 'done')
  assert.equal(w.issues['is-CMP-3'].status, 'in_progress')
  assert.equal(w.issues['is-CMP-4'].status, 'in_review', '有人升级：留给董事会')
  assert.equal(w.issues['is-CMP-2'].status, 'in_review', '资金类不动')
  assert.equal(a.view().state, 'done')
  // 同一次等待不会再投
  const id = a.view().id
  await a.tick()
  assert.equal(a.view().id, id)
})

test('投票期间董事会已经自己验收：跳过这一项', async () => {
  const w = world(), a = mk(w)
  a.onState(w.waiting.filter((x) => x.id === 'CMP-1'), true)
  await a.open()
  w.issues['is-CMP-1'].status = 'done'
  for (const n of ['PM', 'Architect', 'Backend2', 'Frontend2', 'Lead']) vote(w, n, ['APPROVE'])
  await a.tick()
  assert.equal(a.view().items[0].outcome, 'SKIP')
  assert.equal(w.patches.length, 0)
})

test('一票都没有：作废，不验收也不退回', async () => {
  const w = world(), a = mk(w)
  a.onState(w.waiting.filter((x) => x.id === 'CMP-1'), true)
  await a.open()
  for (const vi of Object.values(w.issues).filter((i) => (i.title || '').startsWith('验收投票'))) vi.status = 'done'
  await a.tick()
  assert.equal(a.view().state, 'void')
  assert.equal(w.issues['is-CMP-1'].status, 'in_review')
  assert.equal(w.patches.length, 0)
})

test('下班时间不自动开', async () => {
  const w = world(), a = mk(w)
  a.onState(w.waiting, false)
  await a.tick()
  assert.equal(a.view(), null)
})

test('最坏情况：6 项都是很长的回报，且有版本未核对的项，投票提示语仍不超过 3600 字且规则（含版本核对警告）与格式完整保留', async () => {
  const w = world()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acctest-'))
  const a = createAcceptance({ dir, company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0, versionCheck: async (id) => (id.startsWith('is-CMP-2') ? { result: '证据缺版本（无法核对）' } : null) })
  const long = '很长的回报。'.repeat(300)
  for (let k = 20; k < 26; k++) { const id = 'is-CMP-' + k; w.issues[id] = { id, identifier: 'CMP-' + k, title: '一个标题比较长的待验收任务 ' + 'x'.repeat(60), status: 'in_review', description: '', assigneeAgentId: 'ag-Frontend1', comments: [{ authorAgentId: 'x', body: long }] }; w.waiting.push({ kind: 'review', id: 'CMP-' + k, issueId: id, since: OLD }) }
  a.onState(w.waiting.filter((x) => Number(x.id.split('-')[1]) >= 20), true)
  await a.tick()
  const votes = Object.values(w.issues).filter((i) => (i.title || '').startsWith('验收投票'))
  assert.ok(votes.length >= 5)
  for (const v of votes) {
    assert.ok(v.description.length <= 3600, `描述 ${v.description.length} 字`)
    assert.ok(v.description.includes('VOTE <序号>: APPROVE|CHANGES|ESCALATE'), '投票格式没丢')
    assert.ok(v.description.includes('先核对证据'), '证据要求没丢')
    assert.ok(v.description.includes('版本核对（必做）'), 'T15 版本核对警告没丢（证据缺版本 → 规则最前面加警告）')
    assert.ok(v.description.includes('截止'), '截止时间没丢')
    assert.ok(v.description.includes('【6】') || v.description.includes('【5】'), '任务条目没丢')
  }
})

test('T15 版本已变：不进入委员会批次（等同交董事会），decided 记 note=版本已变，任务状态不动', async () => {
  const w = world()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acctest-'))
  const a = createAcceptance({ dir, company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0, versionCheck: async (id) => (id === 'is-CMP-1' ? { result: '版本已变' } : null) })
  a.onState(w.waiting, true)
  await a.tick()
  assert.deepEqual(a.view().items.map((i) => i.ident), ['CMP-3', 'CMP-4'], 'CMP-1 版本已变不进入委员会批次')
  const since1 = w.waiting.find((x) => x.id === 'CMP-1').since
  const db = JSON.parse(fs.readFileSync(path.join(dir, 'acceptance.json'), 'utf8'))
  assert.equal(db.decided['is-CMP-1@' + since1].outcome, 'BOARD_ONLY')
  assert.equal(db.decided['is-CMP-1@' + since1].note, '版本已变')
  assert.equal(w.issues['is-CMP-1'].status, 'in_review', '版本已变任务原地等董事会验证，不动状态')
})

test('T15 证据缺版本 / 核对接口抛错：仍正常进批次投票（version:false 标记 + 提示语含版本核对警告），版本一致标 version:true，不卡流程', async () => {
  const w = world()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acctest-'))
  const a = createAcceptance({ dir, company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0, versionCheck: async (id) => {
    if (id === 'is-CMP-1') return { result: '证据缺版本（无法核对）' }
    if (id === 'is-CMP-3') throw new Error('核对接口超时')
    return { result: '版本一致' }
  } })
  a.onState(w.waiting, true)
  await a.tick()
  assert.deepEqual(a.view().items.map((i) => i.ident), ['CMP-1', 'CMP-3', 'CMP-4'], '版本问题不阻止进批次')
  const by = Object.fromEntries(a.view().items.map((i) => [i.ident, i.version]))
  assert.equal(by['CMP-1'], false, '证据缺版本 → version:false')
  assert.equal(by['CMP-3'], false, '核对接口抛错 → 按无法核对，version:false')
  assert.equal(by['CMP-4'], true, '版本一致 → version:true')
  const tasks = Object.values(w.issues).filter((i) => (i.title || '').startsWith('验收投票'))
  assert.ok(tasks.length >= 5)
  const whoHasCmp1 = Object.values(w.issues).filter((i) => (i.title || '').includes('（') && (i.title || '').startsWith('验收投票'))
  for (const t of whoHasCmp1) {
    assert.ok(t.description.length <= 3600, `描述 ${t.description.length} 字`)
    assert.ok(t.description.includes('版本核对（必做）'), '本委员的项里有版本未核对的，规则最前面应有警告')
  }
})

test('返工超限：不进委员会批次（等同交董事会）；rework 抛错按未超限继续', async () => {
  const w = world()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acctest-'))
  const a = createAcceptance({ dir, company: 'C', get: w.get, send: w.send, notify: (t) => w.notes.push(t), log: () => {}, staggerMs: 0, rework: (id) => id === 'is-CMP-1' })
  a.onState(w.waiting, true)
  await a.tick()
  assert.deepEqual(a.view().items.map((i) => i.ident), ['CMP-3', 'CMP-4'], 'CMP-1 返工超限不进入委员会批次')
  const since1 = w.waiting.find((x) => x.id === 'CMP-1').since
  const db = JSON.parse(fs.readFileSync(path.join(dir, 'acceptance.json'), 'utf8'))
  assert.equal(db.decided['is-CMP-1@' + since1].outcome, 'BOARD_ONLY')
  assert.equal(db.decided['is-CMP-1@' + since1].note, '返工超限')
  assert.equal(w.issues['is-CMP-1'].status, 'in_review', '超限任务原地等董事会处理，不动状态')
  // rework 抛错（读不到返工状态）：按未超限继续进批次，不卡流程
  const w2 = world(), a2 = createAcceptance({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'acctest-')), company: 'C', get: w2.get, send: w2.send, notify: (t) => w2.notes.push(t), log: () => {}, staggerMs: 0, rework: () => { throw new Error('读不到返工状态') } })
  a2.onState(w2.waiting, true)
  await a2.tick()
  assert.deepEqual(a2.view().items.map((i) => i.ident), ['CMP-1', 'CMP-3', 'CMP-4'])
})
