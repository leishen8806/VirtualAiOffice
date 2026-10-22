import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBlockedPatrol, blockedPrompt, blockedReason, parseBlockedVotes } from '../blocked.mjs'

const H = 3600000
function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-test-')), dir = path.join(root, 'office3d')
  fs.mkdirSync(dir); fs.mkdirSync(path.join(root, 'workhours'))
  fs.writeFileSync(path.join(root, 'workhours/workhours.json'), JSON.stringify({ days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '17:30' }))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  let time = Date.parse('2026-10-19T08:30:00+07:00'), n = 0
  const agents = ['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2', 'Reviewer2', 'Worker', 'GoSenior', 'DBEngineer', 'Target'].map((name) => ({ id: name, name, status: 'idle' }))
  const issues = [], runs = [], writes = [], notices = [], approvals = {}, incidents = []
  const add = (id, extra = {}) => { const i = { id, identifier: id, title: '普通任务', description: '', assigneeAgentId: 'Worker', status: 'blocked', blockedBy: [], updatedAt: '2026-10-18T08:30:00+07:00', comments: [], ...extra }; issues.push(i); return i }
  const issue = add('CMP-1')
  const get = async (p) => {
    if (p.endsWith('/agents')) return structuredClone(agents)
    if (p.endsWith('/projects')) return [{ id: 'ops', name: '运营与知识库' }]
    if (p.endsWith('/issues')) return structuredClone(issues)
    if (p.includes('/heartbeat-runs?')) return structuredClone(runs)
    const m = p.match(/^\/api\/issues\/([^/]+)(\/comments)?$/)
    if (m) { const i = issues.find((i) => i.id === m[1]); assert.ok(i, p); return structuredClone(m[2] ? i.comments : i) }
    if (p.startsWith('/api/approvals/')) return approvals[p.split('/').at(-1)]
    throw new Error('未模拟 GET ' + p)
  }
  const send = async (method, p, body) => {
    await options.beforeWrite?.({ method, p, body, dir })
    writes.push({ method, p, body: structuredClone(body) })
    if (method === 'POST' && p.endsWith('/issues')) { const i = add('vote-' + ++n, body); return { id: i.id, identifier: i.identifier } }
    if (p.endsWith('/approvals')) { const id = 'approval-' + ++n; approvals[id] = { status: 'pending' }; return { id } }
    const m = p.match(/^\/api\/issues\/([^/]+)(\/comments)?$/), i = issues.find((i) => i.id === m?.[1])
    assert.ok(i, p)
    if (m[2]) i.comments.push({ id: 'c-' + ++n, authorUserId: 'system', body: body.body, createdAt: new Date(time).toISOString() })
    else Object.assign(i, body)
    return {}
  }
  const factory = () => createBlockedPatrol({ dir, company: 'C', get, send, notify: async (s) => notices.push(s), dutyOn: () => options.on !== false, healthReport: async () => ({ incidents }), now: () => time, staggerMs: 0, log: () => {} })
  const patrol = factory()
  const advance = (h) => { time += h * H }
  const setTime = (s) => { time = Date.parse(s) }
  const vote = (rows) => { for (const i of issues.filter((i) => i.id.startsWith('vote-'))) { i.status = 'done'; i.comments = [{ authorAgentId: i.assigneeAgentId, body: rows[i.assigneeAgentId] || 'VOTE 1: CONTINUE | 继续核对', createdAt: new Date(time).toISOString() }] } }
  const toVoting = async () => { await patrol.run(); advance(3); await patrol.run(); advance(3); await patrol.run(); assert.equal(patrol.view().batch?.state, 'voting') }
  return { dir, file: path.join(dir, 'blocked.json'), issue, issues, agents, runs, writes, notices, approvals, incidents, add, patrol, factory, advance, setTime, vote, toVoting }
}
const reason = (type, check = '立即复核') => ({ body: `阻塞：${type} | 解除条件：需要核实 | 下次检查：${check}`, createdAt: '2026-10-19T01:00:00Z' })

test('解析最新阻塞评论、五类与金边时间，坏格式不猜测', () => {
  assert.equal(blockedReason([reason('待授权 / 待业务决定')]).type, '待授权或业务决定')
  assert.equal(blockedReason([reason('范围冲突 / 文件占用')]).type, '范围冲突或文件占用')
  assert.equal(blockedReason([reason('额度 / 登录 / 环境异常')]).type, '额度登录环境异常')
  assert.equal(blockedReason([reason('验证失败', '2026-10-19 13:00')]).checkAt, Date.parse('2026-10-19T06:00:00Z'))
  assert.equal(blockedReason([{ body: '阻塞：格式错误' }]).type, '未说明')
  assert.equal(blockedReason([reason('验证失败'), { ...reason('依赖未完成'), createdAt: '2026-10-20T00:00:00Z' }]).type, '依赖未完成')
})
test('解析全角冒号、大小写和改派岗位', () => {
  assert.deepEqual(parseBlockedVotes([{ body: 'vote 1：reassign Backend1 | 建议\nVOTE 2: SPLIT_OR_CANCEL | 拆分' }])[0], { v: 'REASSIGN', target: 'Backend1', why: '建议' })
})
for (const [label, extra] of [['未满足依赖', { blockedBy: [{ status: 'todo' }] }], ['真人', { assigneeUserId: 'human' }], ['缺少依赖数据', { blockedBy: undefined }]]) test(label + '跳过且预览零写入', async (t) => {
  const w = setup(t); Object.assign(w.issue, extra)
  const before = fs.existsSync(w.file)
  assert.ok((await w.patrol.preview()).items[0].skip)
  assert.equal(fs.existsSync(w.file), before); await w.patrol.run(); assert.equal(w.writes.length, 0)
})
test('负责人 paused 跳过', async (t) => { const w = setup(t); w.agents.find((a) => a.name === 'Worker').status = 'paused'; await w.patrol.run(); assert.equal(w.writes.length, 0) })
test('上班日和时段双重检查，周日照常', async (t) => {
  const w = setup(t); w.setTime('2026-10-19T18:00:00+07:00'); assert.equal((await w.patrol.run()).ran, false)
  w.setTime('2026-10-18T08:30:00+07:00'); await w.patrol.run(); assert.equal(w.writes.length, 1)
  const x = setup(t, { on: false }); await x.patrol.run(); assert.equal(x.writes.length, 0)
})
for (const [when, skip] of [['2026-10-19 13:00', true], ['2026-10-18 13:00', false], ['收到依赖完成唤醒后立即复核', false]]) test('下次检查 ' + when, async (t) => {
  const w = setup(t); w.issue.comments.push(reason('验证失败', when)); await w.patrol.run(); assert.equal(w.writes.length, skip ? 0 : 1)
})
test('已完成或取消的依赖允许提醒，状态不变', async (t) => { const w = setup(t); w.issue.blockedBy = [{ status: 'done' }, { status: 'cancelled' }]; await w.patrol.run(); assert.equal(w.writes.length, 1); assert.equal(w.issue.status, 'blocked') })
test('待授权只通知董事会，24小时内不重复，不进委员会', async (t) => {
  const w = setup(t); w.issue.comments.push(reason('待授权或业务决定'))
  await w.patrol.run(); w.issue.comments.push({ authorAgentId: 'Worker', body: '补充上下文', createdAt: '2026-10-19T02:00:00Z' }); w.advance(3); await w.patrol.run(); w.advance(3); await w.patrol.run()
  assert.equal(w.writes.length, 0); assert.equal(w.notices.length, 1); assert.equal(w.patrol.view().batch, null)
  w.setTime('2026-10-20T08:30:00+07:00'); await w.patrol.run(); assert.equal(w.notices.length, 2)
})
test('额度类未恢复跳过，恢复后提醒', async (t) => {
  const w = setup(t); w.issue.comments.push(reason('额度登录环境异常')); w.incidents.push({ category: 'quota', agentIds: ['Worker'] })
  await w.patrol.run(); assert.equal(w.writes.length, 0); w.incidents.length = 0; w.advance(3); await w.patrol.run(); assert.equal(w.writes.length, 1)
})
test('两轮提醒后委员会，再一轮仍无动作交人工；系统评论不算动作', async (t) => {
  const w = setup(t); await w.toVoting(); assert.equal(w.writes.filter((x) => x.p.endsWith('/comments')).length, 2)
  w.vote({}); await w.patrol.run(); assert.equal(w.patrol.view().tasks[0].stage, 'committee')
  w.setTime('2026-10-20T08:30:00+07:00'); await w.patrol.run(); assert.equal(w.patrol.view().tasks[0].stage, 'human'); assert.match(w.notices.at(-1), /需要人工/)
  const count = w.writes.length; w.advance(3); await w.patrol.run(); assert.equal(w.writes.length, count)
})
for (const action of ['comment', 'run', 'status']) test('负责人有动作会重置阶梯：' + action, async (t) => {
  const w = setup(t); await w.patrol.run(); w.advance(3)
  if (action === 'comment') w.issue.comments.push({ id: 'user', authorAgentId: 'Worker', body: '正在检查', createdAt: '2026-10-19T02:00:00Z' })
  if (action === 'run') w.runs.push({ id: 'r1', agentId: 'Worker', contextSnapshot: { issueId: 'CMP-1' }, status: 'succeeded' })
  if (action === 'status') w.issue.status = 'todo'
  await w.patrol.run()
  assert.equal(w.patrol.view().batch, null); assert.equal(w.patrol.view().tasks[0]?.reminders || 0, action === 'status' ? 0 : 1)
})
test('每轮6项，按最老等待优先，三小时内不重复提醒', async (t) => {
  const w = setup(t); for (let k = 2; k <= 8; k++) w.add('CMP-' + k, { updatedAt: `2026-10-${String(k + 1).padStart(2, '0')}T00:00:00Z` })
  await w.patrol.run(); assert.equal(w.writes.length, 6); assert.equal(w.writes.some((x) => x.p.includes('CMP-1/')), false)
  await w.patrol.run(); assert.equal(w.writes.length, 8); await w.patrol.run(); assert.equal(w.writes.length, 8)
})
test('总开关热关闭，所有写入和通知停止；重启保留状态并等五分钟', async (t) => {
  const w = setup(t); await w.patrol.run(); const stored = JSON.parse(fs.readFileSync(w.file)); stored.enabled = false; fs.writeFileSync(w.file, JSON.stringify(stored))
  w.advance(3); await w.patrol.run(); assert.equal(w.writes.length, 1); assert.equal(w.patrol.view().enabled, false)
  stored.enabled = true; fs.writeFileSync(w.file, JSON.stringify(stored)); const next = w.factory()
  assert.equal(next.view().tasks[0].reminders, 1); assert.equal((await next.tick()).ran, false); w.advance(5 / 60); await next.tick(); assert.equal(w.writes.length, 2)
})
test('最坏六项长文本规则完整且3600字以内，序号不因回避改变', () => {
  const rows = Array.from({ length: 6 }, (_, idx) => ({ idx, ident: 'CMP-' + idx, title: '长标题'.repeat(500), owner: '名字'.repeat(500), type: '未说明', report: '长回报'.repeat(5000) }))
  const p = blockedPrompt(rows); assert.ok(p.length <= 3600); for (const s of ['投票规则', 'VOTE <序号>', 'SPLIT_OR_CANCEL', '一票都没有则作废', 'CMP-5']) assert.ok(p.includes(s), s)
  assert.match(blockedPrompt([rows[5]]), /6\. CMP-5/)
})
test('负责人委员逐项回避，由后备顶替，仍是每项五票', async (t) => {
  const w = setup(t); w.issue.assigneeAgentId = 'Lead'; w.add('CMP-2', { assigneeAgentId: 'PM' }); await w.toVoting()
  for (const i of w.patrol.view().batch.items) { assert.equal(i.voters.length, 5); assert.ok(!i.voters.includes(i.owner)); assert.ok(i.voters.includes('Reviewer2')) }
})
for (const kind of ['CONTINUE', 'REASSIGN', 'SPLIT_OR_CANCEL', 'ESCALATE', 'no-majority', 'zero']) test('委员会结果 ' + kind, async (t) => {
  const w = setup(t); await w.toVoting()
  const rows = Object.fromEntries(['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'].map((n, k) => [n, kind === 'zero' ? '无票' : `VOTE 1: ${kind === 'REASSIGN' ? 'REASSIGN Target' : kind === 'no-majority' ? (k < 2 ? 'REASSIGN Target' : k < 4 ? 'SPLIT_OR_CANCEL' : 'CONTINUE') : kind} | 理由`]))
  w.vote(rows); await w.patrol.run()
  assert.equal(w.issue.status, kind === 'REASSIGN' ? 'todo' : 'blocked')
  if (kind === 'REASSIGN') assert.equal(w.issue.assigneeAgentId, 'Target')
  if (['SPLIT_OR_CANCEL', 'ESCALATE'].includes(kind)) assert.equal(w.notices.length, 1)
  if (kind === 'zero') { assert.equal(w.patrol.view().batch.state, 'void'); assert.equal(w.writes.length, 7) }
})
for (const invalid of ['missing', 'paused', 'error', 'same', 'busy', 'dependency']) test('改派校验失败 ' + invalid, async (t) => {
  const w = setup(t); await w.toVoting()
  const target = w.agents.find((a) => a.name === 'Target')
  if (invalid === 'missing') w.agents.splice(w.agents.indexOf(target), 1)
  if (['paused', 'error'].includes(invalid)) target.status = invalid
  if (invalid === 'busy') for (let k = 0; k < 3; k++) w.add('busy-' + k, { assigneeAgentId: 'Target', status: 'todo' })
  if (invalid === 'dependency') w.issue.blockedBy = [{ status: 'todo' }]
  w.vote(Object.fromEntries(['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'].map((n) => [n, `VOTE 1: REASSIGN ${invalid === 'same' ? 'Worker' : 'Target'} | 建议`]))); await w.patrol.run()
  assert.equal(w.issue.status, 'blocked'); assert.equal(w.issue.assigneeAgentId, 'Worker')
})
test('一票升级覆盖四票改派；不同岗位的改派票不合并', async (t) => {
  for (const veto of [true, false]) { const w = setup(t); await w.toVoting(); w.vote({ Lead: 'VOTE 1: REASSIGN Target | a', PM: 'VOTE 1: REASSIGN Target | a', Architect: 'VOTE 1: REASSIGN GoSenior | b', Backend2: 'VOTE 1: REASSIGN GoSenior | b', Frontend2: `VOTE 1: ${veto ? 'ESCALATE' : 'CONTINUE'} | c` }); await w.patrol.run(); assert.equal(w.issue.status, 'blocked'); assert.equal(w.notices.length, veto ? 1 : 0) }
})
test('资金类先审批，批准前不改派；批准后再次检查依赖与岗位', async (t) => {
  const w = setup(t); w.issue.description = 'IAM 鉴权'; await w.toVoting()
  w.vote(Object.fromEntries(['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'].map((n) => [n, 'VOTE 1: REASSIGN GoSenior | 安全负责人']))); await w.patrol.run()
  assert.equal(w.issue.status, 'blocked'); assert.equal(w.patrol.view().tasks[0].stage, 'awaiting'); assert.equal(Object.keys(w.approvals).length, 1)
  Object.values(w.approvals)[0].status = 'approved'; w.setTime('2026-10-20T08:30:00+07:00'); await w.patrol.run()
  assert.equal(w.issue.status, 'todo'); assert.equal(w.issue.assigneeAgentId, 'GoSenior')
})
test('资金类不允许改派到普通岗位', async (t) => { const w = setup(t); w.issue.description = '提现'; await w.toVoting(); w.vote(Object.fromEntries(['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'].map((n) => [n, 'VOTE 1: REASSIGN Target | 建议']))); await w.patrol.run(); assert.equal(w.issue.status, 'blocked'); assert.equal(Object.keys(w.approvals).length, 0); assert.match(w.notices[0], /资金类/) })
test('投票30分钟截止；其他人代投不算有效票', async (t) => {
  const w = setup(t); await w.toVoting()
  for (const i of w.issues.filter((i) => i.id.startsWith('vote-'))) i.comments.push({ authorAgentId: 'imposter', body: 'VOTE 1: REASSIGN Target | 假票' })
  w.advance(.5); await w.patrol.run(); assert.equal(w.patrol.view().batch.state, 'void'); assert.equal(w.issue.status, 'blocked')
})
test('资金审批被拒或批准后条件变了，都不得改派', async (t) => {
  for (const mode of ['rejected', 'dependency', 'paused']) {
    const w = setup(t); w.issue.description = '资金'; await w.toVoting()
    w.vote(Object.fromEntries(['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'].map((n) => [n, 'VOTE 1: REASSIGN GoSenior | 建议']))); await w.patrol.run()
    Object.values(w.approvals)[0].status = mode === 'rejected' ? 'rejected' : 'approved'
    if (mode === 'dependency') w.issue.blockedBy = [{ status: 'todo' }]
    if (mode === 'paused') w.agents.find((a) => a.name === 'GoSenior').status = 'paused'
    w.setTime('2026-10-20T08:30:00+07:00'); await w.patrol.run(); assert.equal(w.issue.status, 'blocked')
  }
})
test('预览现有阶梯不修改账本，关闭总开关也不跟进投票', async (t) => {
  const w = setup(t); await w.toVoting(); w.vote({})
  const db = JSON.parse(fs.readFileSync(w.file)); db.enabled = false; fs.writeFileSync(w.file, JSON.stringify(db))
  const before = fs.readFileSync(w.file, 'utf8'), writes = w.writes.length
  const p = await w.patrol.preview(); assert.equal(p.enabled, false)
  await w.patrol.run(); assert.equal(w.writes.length, writes); assert.equal(fs.readFileSync(w.file, 'utf8'), before)
})
test('错误账本不回退成默认开启', (t) => {
  const w = setup(t); fs.writeFileSync(w.file, '{坏json'); assert.throws(() => w.factory())
})
test('负责人有新评论也不能绕过三小时提醒冷却', async (t) => {
  const w = setup(t); await w.patrol.run(); w.advance(1)
  w.issue.comments.push({ id: 'new', authorAgentId: 'Worker', body: '检查中', createdAt: '2026-10-19T02:30:00Z' })
  await w.patrol.run(); assert.equal(w.writes.length, 1)
})
test('开票过程中关闭总开关，后续写请求停止并保留中断状态供人工核对', async (t) => {
  const w = setup(t, { beforeWrite: ({ p, dir }) => {
    if (p.endsWith('/issues')) { const f = path.join(dir, 'blocked.json'); const d = JSON.parse(fs.readFileSync(f)); d.enabled = false; fs.writeFileSync(f, JSON.stringify(d)) }
  } })
  await w.patrol.run(); w.advance(3); await w.patrol.run(); w.advance(3)
  await assert.rejects(w.patrol.run(), /总开关关闭/)
  assert.equal(w.issues.filter((i) => i.id.startsWith('vote-')).length, 1)
  assert.equal(w.patrol.view().batch.state, 'opening')
  const count = w.writes.length; await w.patrol.run(); assert.equal(w.writes.length, count)
})
test('开票同时只读预览不能丢失投票任务编号', async (t) => {
  let w
  w = setup(t, { beforeWrite: async ({ p }) => { if (p.endsWith('/issues')) await w.patrol.preview() } })
  await w.toVoting()
  assert.equal(w.patrol.view().batch.members.length, 5)
  assert.equal(w.factory().view().batch.members.length, 5)
})
