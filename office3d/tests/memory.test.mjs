import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scanMemoryText, parseMemory, memoryTerms, selectMemories, memoryComment, memorySkip, createMemory, scanStaged, memoryLife } from '../memory.mjs'

const HOOK_URL = new URL('../../../knowledge/.git/hooks/pre-commit', import.meta.url)
const hookAvailable = fs.existsSync(HOOK_URL)
const hookSkip = hookAvailable ? false : 'knowledge/.git/hooks/pre-commit 本机证据不存在（CI 干净机器），跳过钩子集成测试'

const AT = Date.parse('2026-10-19T02:00:00Z')
const sample = (extra = {}) => ({ title: '浏览器布局验证', type: 'process', author: 'Frontend2', source: 'CMP-285', tags: ['浏览器', '布局'], created: '2026-10-19', status: 'approved', body: '浏览器布局先核对窗口尺寸，再逐项检查边界。', path: '记忆/流程/browser.md', ...extra })
const doc = e => `---\ntitle: ${e.title}\ntype: ${e.type}\nauthor: ${e.author}\nsource: ${e.source}\ntags: [${e.tags.join(', ')}]\ncreated: ${e.created}\nstatus: ${e.status}\n${e.expires ? `expires: ${e.expires}\n` : ''}---\n${e.body}`

for (const [category, values] of [
  ['密钥', ['sk-' + 'fake_test_value', '123456789:' + 'FAKE'.repeat(10), 'password=' + 'FAKE_ONLY', '-----BEGIN PRIVATE KEY-----', 'ghp_' + 'FAKE'.repeat(11)]],
  ['服务器地址', ['连接 192.168.3.4', 'https://api.invalid.test/path', 'ssh person@remote.invalid', 'api.khmerx.org']],
  ['账务数据', ['$' + '123.45', 'USD ' + '42', '账号 ' + '1234567890123', '余额：900', '100元']],
]) for (const [i, text] of values.entries()) test(`扫描 ${category} 样例 ${i + 1}：仅返回类别和行号`, () => {
  const found = scanMemoryText('正常中文\n' + text)
  assert.ok(found.some(f => f.category === category && f.line === 2))
  assert.ok(found.every(f => Object.keys(f).sort().join(',') === 'category,line'))
  assert.ok(!JSON.stringify(found).includes(text))
})
for (const text of ['正常中文句子，先验证再提交。', 'CMP-285', 'd6f2c0e2-f713-43ba-a5fa-788b59d74239', 'localhost:3200', 'http://127.0.0.1:3200/state', 'https://example.com/guide', '版本号 1.27.2', '时间 13:00', 'http://localhost:3200', 'http://docs.example.com/help']) test(`不误杀：${text}`, () => assert.deepEqual(scanMemoryText(text), []))

test('完整格式可解析，不合格前置信息及正文被拒绝', () => {
  assert.deepEqual(parseMemory(doc(sample())).errors, [])
  for (const extra of [{ source: '' }, { source: 'not-a-task' }, { title: '' }, { author: '../Lead' }, { type: 'unknown' }, { status: 'yes' }, { created: '2026-02-30' }, { expires: 'yesterday' }, { body: '' }, { body: '字'.repeat(801) }]) assert.ok(parseMemory(doc(sample(extra))).errors.length)
  assert.ok(parseMemory('no frontmatter').errors.length)
  assert.ok(parseMemory(doc(sample()).replace('tags: [浏览器, 布局]', 'tags: invalid')).errors.length)
  assert.ok(parseMemory(doc(sample()).replace('title: ', 'title: a\ntitle: ')).errors.length)
})

test('本机示例URL也不能夹带密钥或金额，纯数字UUID不误杀', () => {
  assert.ok(scanMemoryText('http://localhost:3200/?token=' + 'FAKE_VALUE').some(f => f.category === '密钥'))
  assert.ok(scanMemoryText('https://example.com/?amount=$123').some(f => f.category === '账务数据'))
  assert.deepEqual(scanMemoryText('00000000-0000-0000-0000-123456789012'), [])
})

test('分词去掉任务编号和停用词，中文按二字组', () => {
  const terms = memoryTerms('CMP-285 浏览器布局 the task validation')
  assert.ok(terms.includes('浏览')); assert.ok(terms.includes('validation')); assert.ok(!terms.includes('cmp-285')); assert.ok(!terms.includes('task'))
})
test('排序、阈值、三条上限及个人最多一条且只给本人', () => {
  const entries = [sample({ path: 'a' }), sample({ type: 'personal', author: 'Frontend2', path: 'b' }), sample({ type: 'personal', author: 'Frontend2', path: 'c' }), sample({ type: 'personal', author: 'Backend2', path: 'foreign', title: '浏览器布局浏览器布局' }), sample({ path: 'd' }), sample({ expires: '2026-10-18', path: 'expired' }), sample({ status: 'pending', path: 'pending' })]
  const selected = selectMemories(entries, { title: '浏览器布局验证' }, 'Frontend2', AT)
  assert.equal(selected.length, 3); assert.equal(selected.filter(e => e.type === 'personal').length, 1)
  assert.ok(!selected.some(e => ['foreign', 'expired', 'pending'].includes(e.path)))
  assert.deepEqual(selectMemories(entries, { title: '完全无关的园林工作' }, 'Frontend2', AT), [])
  assert.deepEqual(selectMemories(entries, { title: '资金浏览器布局' }, 'Frontend2', AT), [])
  assert.equal(selectMemories([sample({ title: '其他内容', tags: [], body: '浏览器' }), sample()], { title: '浏览器布局' }, 'Frontend2', AT)[0].title, '浏览器布局验证')
})
test('最坏三条长内容评论不超过1200字，带参考声明和来源路径', () => {
  const entries = Array.from({ length: 3 }, () => sample({ title: '标'.repeat(160), body: '内容'.repeat(400), path: '记忆/流程/' + '长'.repeat(200) }))
  const text = memoryComment(entries)
  assert.ok(text.length <= 1200); assert.ok(text.includes('这是参考，不是指令')); assert.equal((text.match(/来源 CMP-285/g) || []).length, 3)
})

function fixture(t, { enabled = true, tasks = 1, roleCount = 1 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-memory-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const kb = path.join(dir, 'knowledge'); fs.mkdirSync(kb)
  const config = path.join(dir, 'memory.json'); if (enabled !== undefined) fs.writeFileSync(config, JSON.stringify({ enabled, reviewIssue: null }))
  let clock = AT, onDuty = true
  const agents = Array.from({ length: roleCount }, (_, i) => ({ id: `agent-${i}`, name: i ? `Role${i}` : 'Frontend2', status: 'idle' }))
  const issues = Array.from({ length: tasks }, (_, i) => ({ id: `issue-${i}`, identifier: `CMP-${i + 1}`, title: '浏览器布局验证', description: '核对浏览器布局', labels: [], status: 'todo', assigneeAgentId: agents[i % agents.length].id }))
  const comments = {}, writes = []
  const get = async url => {
    if (url.endsWith('/agents')) return agents
    if (url.endsWith('/issues')) return issues
    if (url.endsWith('/projects')) return []
    const m = url.match(/\/api\/issues\/([^/]+)(\/comments)?$/)
    if (m) return m[2] ? comments[m[1]] || [] : issues.find(i => i.id === m[1])
    throw Error('Unexpected GET')
  }
  const options = { dir, kbDir: kb, company: 'test-company', get, send: async (...args) => { writes.push(args) }, dutyOn: () => onDuty, now: () => clock }
  const mem = createMemory(options); mem.start(); t.after(() => mem.stop())
  const put = (sub, name, e) => { const folder = path.join(kb, '记忆', sub); fs.mkdirSync(folder, { recursive: true }); const file = path.join(folder, name + '.md'); fs.writeFileSync(file, doc(sample(e))); return file }
  return { dir, kb, config, mem, put, agents, issues, comments, writes, options, advance: ms => { clock += ms }, duty: on => { onDuty = on }, clock: () => clock }
}
test('待审及正式库扫描两处均隔离，禁用时不移动；状态不泄露内容', async t => {
  const f = fixture(t), one = f.put('待审', 'bad', { status: 'pending', body: 'password=' + 'FAKE_TEST_ONLY' }), two = f.put('流程', 'bad-approved', { body: 'http://remote.invalid/path' })
  await f.mem.rescan()
  assert.equal(fs.existsSync(one), false); assert.equal(fs.existsSync(two), false)
  assert.equal(f.mem.view().counts.rejected, 2)
  assert.ok(!JSON.stringify(f.mem.view()).includes('FAKE_TEST_ONLY'))
  assert.ok(!JSON.stringify(f.mem.view()).includes('remote.invalid'))
  fs.writeFileSync(f.config, JSON.stringify({ enabled: false }))
  const off = f.put('待审', 'off', { status: 'pending', body: '$999' })
  await f.mem.rescan(); assert.ok(fs.existsSync(off)); assert.equal(f.writes.length, 0)
})
test('格式、目录与个人作者不匹配不会被索引；重复只提示不删除', async t => {
  const f = fixture(t)
  f.put('流程', 'a', {}); f.put('流程', 'b', {}); f.put('个人/Backend2', 'foreign', { type: 'personal', author: 'Frontend2' }); f.put('项目', 'wrong', { type: 'process' })
  await f.mem.rescan()
  assert.ok(f.mem.view().duplicates.length); assert.equal(f.mem.view().invalid.length, 2)
  assert.equal(f.mem.view().counts.process, 2)
})

test('同名拒收不覆盖原件，缺前置信息也留下拒收类别', async t => {
  const f = fixture(t)
  f.put('待审', 'same', { status: 'pending', body: 'sk-' + 'FAKE_PENDING' })
  f.put('流程', 'same', { body: 'sk-' + 'FAKE_APPROVED' })
  const raw = path.join(f.kb, '记忆', '待审', 'raw.md'); fs.writeFileSync(raw, 'sk-' + 'FAKE_RAW')
  await f.mem.rescan()
  const rejected = path.join(f.kb, '记忆', '已驳回'), names = fs.readdirSync(rejected).filter(n => n.endsWith('.md'))
  assert.equal(names.length, 3)
  for (const name of names) assert.ok(fs.readFileSync(path.join(rejected, name), 'utf8').includes('rejection: 密钥'))
})
test('默认关闭与显式关闭，启动无注入，五分钟等待及零命中不评论', async t => {
  const f = fixture(t, { enabled: false })
  fs.unlinkSync(f.config); f.mem.stop()
  const defaultOff = createMemory(f.options); defaultOff.start(); t.after(() => defaultOff.stop())
  assert.equal(defaultOff.view().enabled, false); f.advance(600000); await defaultOff.tick(); assert.equal(f.writes.length, 0)
  const g = fixture(t); g.put('流程', 'a', {}); await g.mem.tick(); assert.equal(g.writes.length, 0)
  g.advance(300001); g.issues[0].title = '园林设计'; g.issues[0].description = ''; await g.mem.tick(); assert.equal(g.writes.length, 0)
})
test('注入只写评论，同任务一次、保存重启状态，不改描述', async t => {
  const f = fixture(t); f.put('流程', 'a', {}); f.advance(300001)
  const before = f.issues[0].description
  await f.mem.tick(); await f.mem.tick(); assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0][0], 'POST'); assert.ok(f.writes[0][1].endsWith('/comments')); assert.equal(f.issues[0].description, before)
  assert.equal(f.mem.view().injections[0].status, 'sent')
  f.mem.stop(); const again = createMemory(f.options); again.start(); t.after(() => again.stop()); f.advance(300001); await again.tick(); assert.equal(f.writes.length, 1)
})
test('已有记忆评论跳过，干跑无写入且不移动扫描命中文件', async t => {
  const f = fixture(t); f.put('流程', 'a', {}); await f.mem.rescan()
  const bad = f.put('待审', 'pending-secret', { status: 'pending', body: 'sk-' + 'FAKE_ONLY' })
  const before = fs.readFileSync(f.config, 'utf8'); const result = await f.mem.preview('CMP-1')
  assert.equal(result.entries.length, 1); assert.equal(fs.readFileSync(f.config, 'utf8'), before); assert.ok(fs.existsSync(bad)); assert.equal(f.writes.length, 0)
  f.comments['issue-0'] = [{ body: '【记忆库】已有参考' }]; assert.equal((await f.mem.preview('CMP-1')).skip, '已有记忆库评论')
})
test('干跑与注入都不泄露别人的个人笔记，过期条目不出现', async t => {
  const f = fixture(t)
  f.put('个人/Backend2', 'foreign', { type: 'personal', author: 'Backend2', body: '浏览器布局仅Backend2可见' })
  f.put('个人/Frontend2', 'mine', { type: 'personal' }); f.put('流程', 'expired', { expires: '2026-10-18' })
  await f.mem.rescan(); const r = await f.mem.preview('CMP-1'); assert.equal(r.entries.length, 1)
  assert.ok(r.entries[0].path.includes('/Frontend2/')); assert.ok(!JSON.stringify(r).includes('Backend2'))
  f.advance(300001); await f.mem.tick(); assert.ok(!JSON.stringify(f.writes).includes('Backend2'))
})
test('资金、真人、paused、下班、投票、验收和程序批次跳过', () => {
  const issue = { status: 'todo', title: '浏览器布局', assigneeAgentId: 'a' }, agent = { name: 'Frontend2', status: 'idle' }
  for (const change of [{ title: '资金' }, { assigneeUserId: 'human' }, { assigneeAgentId: null }, { status: 'in_progress' }, { title: 'VOTE 123' }, { title: '验收浏览器' }]) assert.ok(memorySkip({ ...issue, ...change }, agent))
  assert.ok(memorySkip(issue, { ...agent, status: 'paused' })); assert.ok(memorySkip(issue, agent, { onDuty: false }))
  assert.ok(memorySkip({ ...issue, description: '普通说明'.repeat(200) + '资金' }, agent))
  assert.ok(memorySkip({ ...issue, projectId: 'ops', title: '晨会批次' }, agent, { projects: [{ id: 'ops', name: '运营与知识库' }] }))
  assert.equal(memorySkip({ ...issue, title: '【对话会话】Frontend2 · 2026-10-20' }, agent), '对话会话任务')
  assert.equal(memorySkip({ ...issue, title: undefined }, agent), null)
})
test('每轮最多5个，每岗位一小时最多3次，跨小时恢复', async t => {
  const f = fixture(t, { tasks: 12, roleCount: 2 }); f.put('流程', 'a', {}); f.advance(300001)
  await f.mem.tick(); assert.equal(f.writes.length, 5)
  await f.mem.tick(); assert.equal(f.writes.length, 6)
  const records = JSON.parse(fs.readFileSync(f.config)).injections
  for (const a of f.agents) assert.equal(records.filter(r => r.agentId === a.id).length, 3)
  f.advance(3600001); await f.mem.tick(); assert.equal(f.writes.length, 11)
})
test('发送结果不确定保留尝试不自动重发；运行中关闭开关立即停止', async t => {
  const f = fixture(t, { tasks: 4 }); f.put('流程', 'a', {}); f.advance(300001)
  f.mem.stop()
  let calls = 0
  const mem = createMemory({ ...f.options, send: async () => { calls++; throw Error('must not expose upstream content') } }); mem.start(); t.after(() => mem.stop()); f.advance(300001)
  await mem.tick(); assert.equal(calls, 3); assert.ok(mem.view().injections.every(r => r.status === 'uncertain'))
  await mem.tick(); assert.equal(calls, 3)
  const db = JSON.parse(fs.readFileSync(f.config)); fs.writeFileSync(f.config, JSON.stringify({ ...db, enabled: false })); f.advance(3600001); await mem.tick(); assert.equal(calls, 3)
})

test('配置损坏时关闭，不崩溃也不注入', async t => {
  const f = fixture(t); fs.writeFileSync(f.config, '{broken')
  f.advance(300001); await f.mem.tick(); assert.equal(f.mem.view().enabled, false); assert.equal(f.writes.length, 0)
})
test('积压只提醒固定 KnowledgeKeeper 任务，不创建任务且每小时限一次', async t => {
  const f = fixture(t, { tasks: 0 }); f.agents[0].name = 'KnowledgeKeeper'
  f.issues.push({ id: 'review', identifier: 'CMP-99', status: 'in_progress', title: '审核记忆', assigneeAgentId: f.agents[0].id })
  fs.writeFileSync(f.config, JSON.stringify({ enabled: true, reviewIssue: 'CMP-99' }))
  const pending = f.put('待审', 'waiting', { status: 'pending' }); fs.utimesSync(pending, new Date(AT - 3 * 3600000), new Date(AT - 3 * 3600000))
  f.advance(300001); await f.mem.tick(); await f.mem.tick(); assert.equal(f.writes.length, 1); assert.ok(f.writes[0][1].endsWith('/review/comments'))
})

test('临时克隆：同一扫描器读取暂存内容，拒绝假密钥，保留原缺口守卫', { skip: hookSkip }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-hook-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const seed = path.join(root, 'seed'), clone = path.join(root, 'clone'); fs.mkdirSync(seed)
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  git(seed, ['init']); git(seed, ['config', 'user.name', 'Fixture']); git(seed, ['config', 'user.email', 'fixture@example.com'])
  fs.mkdirSync(path.join(seed, '缺口')); fs.writeFileSync(path.join(seed, '缺口', '待补充问题.md'), '---\nstatus: active\n---\n## 已补\n一\n二\n三\n四\n五\n六\n七\n八\n')
  git(seed, ['add', '.']); git(seed, ['commit', '-m', 'fixture baseline']); git(root, ['clone', '--no-hardlinks', seed, clone])
  const hook = fs.readFileSync(new URL('../../../knowledge/.git/hooks/pre-commit', import.meta.url), 'utf8')
  fs.writeFileSync(path.join(clone, '.git', 'hooks', 'pre-commit'), hook)
  git(clone, ['config', 'user.name', 'Fixture']); git(clone, ['config', 'user.email', 'fixture@example.com'])
  fs.mkdirSync(path.join(clone, '记忆')); const fake = 'sk-' + 'FAKE_FIXTURE_ONLY'; fs.writeFileSync(path.join(clone, '记忆', 'fake.md'), fake); git(clone, ['add', '记忆'])
  const modulePath = fileURLToPath(new URL('../memory.mjs', import.meta.url))
  const hookRejected = spawnSync('git', ['commit', '-m', 'must reject fake memory'], { cwd: clone, encoding: 'utf8' })
  assert.notEqual(hookRejected.status, 0); assert.ok(!hookRejected.stderr.includes(fake))
  const rejected = spawnSync(process.execPath, [modulePath, '--scan-staged', clone], { encoding: 'utf8' })
  assert.equal(rejected.status, 1); assert.ok(!rejected.stderr.includes(fake)); assert.ok(scanStaged(clone).includes('密钥'))
  fs.writeFileSync(path.join(clone, '记忆', 'fake.md'), '浏览器窗口核对 CMP-285'); git(clone, ['add', '记忆']); assert.deepEqual(scanStaged(clone), [])
  fs.writeFileSync(path.join(clone, '缺口', '待补充问题.md'), '误覆盖'); git(clone, ['add', '缺口'])
  const guard = spawnSync('git', ['commit', '-m', 'must reject fixture'], { cwd: clone, encoding: 'utf8' }); assert.notEqual(guard.status, 0)
})
test('Claude 已接好的钩子先扫描后运行原守卫，本任务不修改钩子', { skip: hookSkip }, () => {
  const hook = fs.readFileSync(new URL('../../../knowledge/.git/hooks/pre-commit', import.meta.url), 'utf8')
  assert.ok(hook.indexOf('--scan-staged') >= 0 && hook.indexOf('--scan-staged') < hook.indexOf('then exit 0'))
})

const DAY = 86400000
function pendingFile(f, name, source, at = AT, extra = {}) {
  const file = f.put('待审', name, { status: 'pending', source, ...extra })
  fs.utimesSync(file, new Date(at), new Date(at)); return file
}
const patchConfig = (f, patch) => fs.writeFileSync(f.config, JSON.stringify({ ...JSON.parse(fs.readFileSync(f.config, 'utf8')), ...patch }))

test('提交限额：同任务最多1条，按到达时间先到先得且重扫不再拒收原件', async t => {
  const f = fixture(t, { tasks: 0 })
  const late = pendingFile(f, 'a-late', 'CMP-700', AT + 1000), first = pendingFile(f, 'z-first', 'CMP-700', AT)
  await f.mem.rescan(); assert.ok(fs.existsSync(first)); assert.ok(!fs.existsSync(late))
  assert.deepEqual(f.mem.view().rejected.at(-1).categories, ['超限'])
  await f.mem.rescan(); assert.ok(fs.existsSync(first)); assert.equal(f.mem.view().counts.rejected, 1)
})
test('提交限额：同岗位同一天3条，同时到达按文件名确定顺序', async t => {
  const f = fixture(t, { tasks: 0 }), files = []
  for (let i = 0; i < 4; i++) files.push(pendingFile(f, `entry-${i}`, `CMP-${800 + i}`, AT))
  await f.mem.rescan(); assert.deepEqual(files.map(p => fs.existsSync(p)), [true, true, true, false]); assert.equal(f.mem.view().counts.pending, 3)
})
test('提交限额：跨日提交每岗位同时待审5条，晚到第6条超限', async t => {
  const f = fixture(t, { tasks: 0 }), files = []
  for (let i = 0; i < 6; i++) files.push(pendingFile(f, `entry-${i}`, `CMP-${900 + i}`, AT - (6 - i) * DAY))
  await f.mem.rescan(); assert.deepEqual(files.map(p => fs.existsSync(p)), [true, true, true, true, true, false])
  assert.equal(f.mem.view().counts.pending, 5)
})
test('默认有效期三种与显式有效期，过期不索引，不改原文件', async t => {
  for (const [type, days] of [['project', 180], ['process', 365], ['personal', 90]]) {
    assert.equal(memoryLife(sample({ type }), {}, AT).expires, new Date(Date.parse('2026-10-19T00:00:00+07:00') + days * DAY + 7 * 3600000).toISOString().slice(0, 10))
  }
  assert.equal(memoryLife(sample({ expires: '2026-10-20' }), {}, AT).expires, '2026-10-20')
  const f = fixture(t, { tasks: 0 }), file = f.put('项目', 'old', { type: 'project', created: '2026-01-01' }), before = fs.readFileSync(file, 'utf8')
  await f.mem.rescan(); assert.equal(f.mem.view().metrics.active.project, 0); assert.equal(f.mem.view().metrics.expiredCount, 1); assert.equal(fs.readFileSync(file, 'utf8'), before)
})
test('实际模拟注入才续命和计数，默认到期后仍有效，条目文件不变', async t => {
  const f = fixture(t), created = new Date(AT - 179 * DAY).toISOString().slice(0, 10)
  const file = f.put('项目', 'renew', { type: 'project', created }), before = fs.readFileSync(file, 'utf8')
  f.advance(300001); await f.mem.tick()
  const db = JSON.parse(fs.readFileSync(f.config)), stat = db.entryStats['记忆/项目/renew.md']
  assert.equal(stat.hits, 1); assert.equal(stat.lastUsed, new Date(f.clock()).toISOString()); assert.equal(f.mem.view().metrics.monthly.injections, 1)
  assert.equal(f.mem.view().metrics.everInjectedShare, 1)
  f.advance(3 * DAY); await f.mem.rescan(); assert.equal(f.mem.view().metrics.active.project, 1); assert.equal(f.mem.view().metrics.staleCount, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})
test('60天未用stale永远排在活跃命中后，最近使用可恢复活跃', () => {
  const old = sample({ path: 'old', created: '2026-08-01', title: '浏览器布局验证', tags: ['浏览器', '布局', '验证'] })
  const fresh = sample({ path: 'fresh', title: '浏览器', tags: [], body: '普通说明' })
  const selected = selectMemories([old, fresh], { title: '浏览器布局验证' }, 'Frontend2', AT)
  assert.equal(selected[0].path, 'fresh'); assert.equal(selected[1].stale, true); assert.equal(selected[1].score, 0)
  assert.equal(memoryLife(old, { lastUsed: new Date(AT - DAY).toISOString(), hits: 1 }, AT).stale, false)
})
test('总量超限只提示，个人按岗位分别计数，归档和根目录清单不检索', async t => {
  const f = fixture(t, { tasks: 0 })
  for (let i = 0; i < 201; i++) f.put('项目', `p-${i}`, { type: 'project', source: `CMP-${1000 + i}` })
  for (let i = 0; i < 81; i++) f.put('流程', `f-${i}`, { source: `CMP-${2000 + i}` })
  for (let i = 0; i < 31; i++) f.put('个人/Frontend2', `me-${i}`, { type: 'personal', source: `CMP-${3000 + i}` })
  f.put('个人/Other', 'other', { type: 'personal', author: 'Other', source: 'CMP-4000' })
  const archived = f.put('归档', 'archived', { source: 'CMP-5000', body: '归档内容不可进入检索' }), original = fs.readFileSync(archived, 'utf8')
  fs.writeFileSync(path.join(f.kb, '记忆', '整理清单-2026-10.md'), '浏览器布局清单不是知识')
  await f.mem.rescan(); const view = f.mem.view()
  assert.deepEqual(view.limitWarnings.map(g => g.excess), [1, 1, 1]); assert.equal(view.metrics.active.personalByAuthor.Other, 1); assert.equal(view.metrics.archived, 1)
  assert.equal(fs.readFileSync(archived, 'utf8'), original); assert.equal(view.counts.rejected, 0)
  assert.equal(view.metrics.active.project, 201); assert.equal(view.metrics.active.process, 81); assert.equal(view.metrics.active.personal, 32)
  assert.ok(!JSON.stringify(view).includes('归档内容不可进入检索'))
})
test('月度清单仅标题路径年龄次数类别，不含正文，不覆盖也不移动条目', async t => {
  const f = fixture(t, { tasks: 0 }), body = '正文秘密测试标记，不应进入整理清单。'
  const a = f.put('项目', 'expired', { type: 'project', source: 'CMP-6001', created: '2026-01-01', body })
  f.put('流程', 'stale', { source: 'CMP-6002', created: '2026-08-01', body })
  await f.mem.rescan(); const before = fs.readFileSync(a, 'utf8'), first = await f.mem.monthly(), second = await f.mem.monthly()
  assert.equal(first.path, '记忆/整理清单-2026-10.md'); assert.equal(second.path, '记忆/整理清单-2026-10-2.md')
  const content = fs.readFileSync(path.join(f.kb, first.path), 'utf8')
  assert.ok(content.includes('过期')); assert.ok(content.includes('stale')); assert.ok(!content.includes(body)); assert.equal(fs.readFileSync(a, 'utf8'), before)
  assert.ok(!content.includes('结论')); assert.equal(f.writes.length, 0); assert.equal(first.notice, '未配置审核任务')
})
test('反馈容忍全角括号冒号，逐评论去重并跨重启累计；没用3且有用0入清单', async t => {
  const f = fixture(t), p = '记忆/流程/feedback.md'
  f.put('流程', 'feedback', { source: 'CMP-6100' })
  f.comments['issue-0'] = [1, 2, 3].map(id => ({ id: `c-${id}`, body: `（记忆库反馈）：没用：${p}` }))
  f.advance(300001); await f.mem.tick(); await f.mem.tick()
  assert.equal(JSON.parse(fs.readFileSync(f.config)).entryStats[p].useless, 3)
  const list = await f.mem.monthly(); assert.ok(fs.readFileSync(path.join(f.kb, list.path), 'utf8').includes('反馈没用'))
  f.mem.stop(); const again = createMemory(f.options); again.start(); t.after(() => again.stop()); f.advance(300001); await again.tick()
  assert.equal(JSON.parse(fs.readFileSync(f.config)).entryStats[p].useless, 3)
  f.comments['issue-0'].push({ id: 'useful', body: `【记忆库反馈】有用 ${p}` }); f.advance(300001); await again.tick()
  const last = await again.monthly(); assert.ok(!fs.readFileSync(path.join(f.kb, last.path), 'utf8').includes('反馈没用'))
})
test('月初上班自动生成一次，提醒固定审核任务一次，不自动创建任务', async t => {
  const f = fixture(t, { tasks: 0 }); f.agents[0].name = 'KnowledgeKeeper'
  f.issues.push({ id: 'review', identifier: 'CMP-99', title: '记忆整理', assigneeAgentId: f.agents[0].id, status: 'in_progress' })
  patchConfig(f, { reviewIssue: 'CMP-99' }); f.advance(Date.parse('2026-11-01T02:00:00Z') - AT)
  await f.mem.tick(); await f.mem.tick()
  assert.equal(f.writes.length, 1); assert.ok(f.writes[0][2].body.includes('月度整理清单'))
  assert.equal(f.mem.view().monthlyLists.length, 1)
})
test('月度新增、通过、驳回、归档按首次观察和状态迁移记账', async t => {
  const f = fixture(t, { tasks: 0 }), file = pendingFile(f, 'history', 'CMP-6200')
  await f.mem.rescan(); assert.equal(f.mem.view().metrics.monthly.new, 1)
  const approved = f.put('流程', 'history', { source: 'CMP-6200' }); fs.unlinkSync(file)
  await f.mem.rescan(); assert.equal(f.mem.view().metrics.monthly.approved, 1)
  const archiveDir = path.join(f.kb, '记忆', '归档'); fs.mkdirSync(archiveDir)
  fs.renameSync(approved, path.join(archiveDir, 'history.md')); await f.mem.rescan()
  assert.equal(f.mem.view().metrics.monthly.archived, 1); assert.equal(f.mem.view().metrics.active.process, 0)
  pendingFile(f, 'over-first', 'CMP-6300'); pendingFile(f, 'over-late', 'CMP-6300', AT + 1000)
  await f.mem.rescan(); assert.equal(f.mem.view().metrics.monthly.rejected, 1)
})
test('disabled时包括启动、重扫、月度生成、tick和反馈全都不写', async t => {
  const f = fixture(t, { enabled: false })
  pendingFile(f, 'a', 'CMP-6400'); pendingFile(f, 'b', 'CMP-6400')
  f.put('项目', 'old', { type: 'project', created: '2026-01-01' })
  const before = fs.readFileSync(f.config, 'utf8')
  const snapshot = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? snapshot(path.join(dir, e.name)) : [[path.join(dir, e.name), fs.readFileSync(path.join(dir, e.name), 'utf8')]])
  const tree = snapshot(f.kb)
  f.advance(100 * DAY); await f.mem.rescan(); await f.mem.monthly(); await f.mem.tick()
  assert.deepEqual(snapshot(f.kb), tree); assert.equal(fs.readFileSync(f.config, 'utf8'), before); assert.equal(f.writes.length, 0)
})
test('1030条规模：200项目+80流程+25岗位各30个人，索引和检索实测', async t => {
  const f = fixture(t, { tasks: 0 })
  for (let i = 0; i < 200; i++) f.put('项目', `p-${i}`, { type: 'project', source: `CMP-${10000 + i}` })
  for (let i = 0; i < 80; i++) f.put('流程', `f-${i}`, { source: `CMP-${20000 + i}` })
  for (let role = 0; role < 25; role++) for (let i = 0; i < 30; i++) f.put(`个人/Role${role}`, `note-${i}`, { type: 'personal', author: `Role${role}`, source: `CMP-${30000 + role * 30 + i}` })
  const indexStart = performance.now(); await f.mem.rescan(); const indexMs = performance.now() - indexStart
  const all = []
  const visit = dir => { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, d.name); if (d.isDirectory()) visit(file); else if (d.name.endsWith('.md')) all.push({ ...parseMemory(fs.readFileSync(file, 'utf8')).entry, path: path.relative(f.kb, file).split(path.sep).join('/') }) } }; visit(path.join(f.kb, '记忆'))
  const searchStart = performance.now(); const found = selectMemories(all, { title: '浏览器布局验证' }, 'Role0', f.clock()); const searchMs = performance.now() - searchStart
  assert.equal(all.length, 1030); assert.equal(f.mem.view().metrics.active.personal, 750); assert.equal(f.mem.view().limitWarnings.length, 0)
  assert.ok(found.length <= 3); assert.ok(found.filter(e => e.type === 'personal').length <= 1); assert.ok(found.every(e => e.type !== 'personal' || e.author === 'Role0')); assert.ok(memoryComment(found).length <= 1200)
  t.diagnostic(`规模1030：index=${indexMs.toFixed(2)}ms；search=${searchMs.toFixed(2)}ms。周期索引目标<10秒，单次检索目标<100ms。`)
  assert.ok(indexMs < 10000); assert.ok(searchMs < 100)
})
