import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createChat, CHAT_SESSION_PREFIX, chatKeys, isChatSessionTask, parseChatSuggestion } from '../chat.mjs'

function fixture(t, { enabled = true, paused = false, duty = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-chat-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'chat.json'), JSON.stringify({ enabled }))
  let time = Date.parse('2026-10-20T09:00:00+07:00'), onDuty = duty, n = 0
  const agents = [{ id: 'a1', name: 'Frontend2', status: paused ? 'paused' : 'idle' }, { id: 'lead', name: 'Lead', status: 'idle' }, ...Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, name: 'Role' + i, status: 'idle' }))]
  const projects = [{ id: 'ops', name: '运营与知识库' }], issues = [], comments = {}, writes = []
  const get = async p => {
    if (p.endsWith('/agents')) return structuredClone(agents)
    if (p.endsWith('/projects')) return projects
    const m = p.match(/^\/api\/issues\/([^/]+)\/comments$/); if (m) return structuredClone(comments[m[1]] || [])
    throw Error('unmocked GET ' + p)
  }
  const send = async (method, p, body) => {
    writes.push({ method, p, body: structuredClone(body) })
    if (method === 'POST' && p.endsWith('/issues')) { const i = { id: 'i' + ++n, identifier: 'CMP-' + n, ...body }; issues.push(i); comments[i.id] = []; return i }
    const m = p.match(/^\/api\/issues\/([^/]+)(\/comments)?$/); assert.ok(m, p)
    if (m[2]) { comments[m[1]].push({ id: 'c' + ++n, authorUserId: 'system', body: body.body, createdAt: new Date(time).toISOString() }); return {} }
    Object.assign(issues.find(i => i.id === m[1]), body); return {}
  }
  const chat = createChat({ dir, company: 'C', get, send, dutyOn: () => onDuty, agents: () => agents, redactText: s => String(s).replace(/\$\d+/g, '〔金额〕').replace(/https?:\/\/\S+/g, '〔链接〕'), now: () => time, log: () => {}, bootDelayMs: 0 })
  return { dir, chat, agents, issues, comments, writes, get, send, advance: ms => { time += ms }, setTime: ms => { time = ms }, duty: v => { onDuty = v }, time: () => time }
}

test('前缀、金边额度键与建议任务解析', () => {
  assert.equal(CHAT_SESSION_PREFIX, '【对话会话】')
  assert.equal(isChatSessionTask({ title: '【对话会话】Frontend2 · 2026-10-20' }), true)
  assert.equal(isChatSessionTask({ title: '【对话任务】普通任务' }), false)
  assert.equal(chatKeys(Date.parse('2026-10-19T17:01:00Z')).day, '2026-10-20')
  assert.deepEqual(parseChatSuggestion('回复\n建议任务：修复按钮 | 检查手机端'), { title: '修复按钮', note: '检查手机端' })
})

test('默认关闭、损坏配置、校验与三类扫描均不写入', async t => {
  const off = fixture(t, { enabled: false }); await assert.rejects(off.chat.send('a1', '你好'), /未开启/); assert.equal(off.writes.length, 0)
  const bad = fixture(t); fs.writeFileSync(path.join(bad.dir, 'chat.json'), '{坏'); const broken = createChat({ dir: bad.dir, company: 'C', get: async () => [], send: async () => assert.fail(), dutyOn: () => true, agents: () => bad.agents, redactText: String, log: () => {}, bootDelayMs: 0 }); await assert.rejects(broken.send('a1', '你好'), /损坏/)
  const w = fixture(t)
  for (const text of ['', '字'.repeat(601), 'password=FAKE_ONLY', '连接 192.168.3.4', '余额：900']) await assert.rejects(w.chat.send('a1', text))
  for (const text of ['CMP-285', 'localhost:3200', '版本号 1.27.2']) { const x = fixture(t, { paused: true }); await x.chat.send('a1', text); assert.equal(x.writes.length, 0) }
  assert.equal(fs.existsSync(path.join(w.dir, 'chats')), false, '拒收内容不落盘')
  w.agents[0].status = 'terminated'; await assert.rejects(w.chat.send('a1', '正常消息'), /离职/)
})

test('第一条消息才创建每日会话，同事暂停时排队并在恢复后发送；同人只准一条待回复', async t => {
  const w = fixture(t, { paused: true })
  const q = await w.chat.send('a1', '明天看一下按钮'); assert.equal(q.status, 'queued'); assert.equal(w.writes.length, 0)
  await assert.rejects(w.chat.send('a1', '第二条'), /等 TA 回复/)
  w.agents[0].status = 'idle'; w.advance(15001); await w.chat.tick()
  assert.equal(w.issues.filter(i => i.title.startsWith(CHAT_SESSION_PREFIX)).length, 1)
  assert.match(w.issues[0].description, /每次只发一条回复评论，第一行以【对话】开头/)
  assert.match(w.issues[0].description, /不要再发“已处理 \/ 已标记完成”之类的运行摘要评论/)
  assert.match(w.writes.find(x => x.p.endsWith('/comments')).body.body, /^【对话】/)
  const stored = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json'))); assert.equal(stored.queue.length, 0); assert.ok(stored.pending.a1)
})

test('队列跨重启保留并按15秒逐条发送；日终只关闭登记过的会话，次日新建', async t => {
  const w = fixture(t, { paused: true })
  w.agents.find(a => a.id === 'x0').status = 'paused'
  await w.chat.send('a1', '第一条'); await w.chat.send('x0', '第二条')
  w.agents[0].status = 'idle'; w.agents.find(a => a.id === 'x0').status = 'idle'; w.advance(15001)
  const restarted = createChat({ dir: w.dir, company: 'C', get: w.get, send: w.send, dutyOn: () => true, agents: () => w.agents, redactText: String, now: w.time, log: () => {}, bootDelayMs: 0 })
  await restarted.tick(); assert.equal(w.writes.filter(x => x.p.endsWith('/comments')).length, 1)
  await restarted.tick(); assert.equal(w.writes.filter(x => x.p.endsWith('/comments')).length, 1)
  w.advance(15001); await restarted.tick(); assert.equal(w.writes.filter(x => x.p.endsWith('/comments')).length, 2)
  const db = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json'))); db.pending = {}; fs.writeFileSync(path.join(w.dir, 'chat.json'), JSON.stringify(db))
  w.duty(false); const closer = createChat({ dir: w.dir, company: 'C', get: w.get, send: w.send, dutyOn: () => false, agents: () => w.agents, redactText: String, now: w.time, log: () => {}, bootDelayMs: 0 })
  await closer.tick(); assert.equal(w.writes.filter(x => x.method === 'PATCH' && x.body.status === 'done').length, 2)
  w.advance(24 * 3600000); w.duty(true); await w.chat.send('a1', '次日消息')
  assert.equal(w.issues.filter(i => i.title.startsWith(CHAT_SESSION_PREFIX)).length, 3)
})

test('回复只取发送后的第一条 agent 评论，程序评论不算；脱敏、建议任务与10分钟超时', async t => {
  const w = fixture(t), sent = await w.chat.send('a1', '给我一个建议'), issue = w.issues[0]
  w.advance(1000); w.comments[issue.id].push({ authorUserId: 'system', body: '程序评论', createdAt: new Date(w.time()).toISOString() })
  w.comments[issue.id].push({ authorAgentId: 'a1', body: '【对话】可以处理 $123，见 https://example.test\n建议任务：修按钮：兼容手机', createdAt: new Date(w.time()).toISOString() })
  await w.chat.tick(); const view = await w.chat.view('a1'), reply = view.messages.find(m => m.role === 'agent')
  assert.match(reply.text, /〔金额〕/); assert.match(reply.text, /〔链接〕/); assert.ok(!reply.text.includes('程序评论')); assert.ok(reply.suggestion); assert.equal(view.pending, false)
  const late = fixture(t); await late.chat.send('a1', '会超时'); late.advance(10 * 60000 + 1); await late.chat.tick(); const lv = await late.chat.view('a1'); assert.equal(lv.messages.find(m => m.role === 'user').status, 'timeout'); assert.equal(late.writes.filter(x => x.p.endsWith('/comments')).length, 1)
})

test('每人每小时6轮、全公司每天60轮，跨小时与跨日恢复，排队时即计数', async t => {
  const w = fixture(t, { paused: true })
  for (let i = 0; i < 6; i++) { await w.chat.send('a1', '消息' + i); const db = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json'))); delete db.pending.a1; fs.writeFileSync(path.join(w.dir, 'chat.json'), JSON.stringify(db)) }
  await assert.rejects(w.chat.send('a1', '第七条'), e => e.status === 429 && /下一个小时/.test(e.message))
  w.advance(3600000); const db = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json'))); delete db.pending.a1; fs.writeFileSync(path.join(w.dir, 'chat.json'), JSON.stringify(db)); await w.chat.send('a1', '跨小时')
  const d = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json'))), key = chatKeys(w.time()).day; d.usage.days[key] = 60; delete d.pending.a1; fs.writeFileSync(path.join(w.dir, 'chat.json'), JSON.stringify(d)); await assert.rejects(w.chat.send('a1', '日上限'), /明天/)
  w.advance(24 * 3600000); await w.chat.send('a1', '跨日恢复')
})

test('确认后转任务固定交Lead，含契约骨架、资金标记、每日上限与同消息防重复', async t => {
  const w = fixture(t), msg = await w.chat.send('a1', '请规划提现鉴权流程'), issue = w.issues[0]
  w.advance(1000); w.comments[issue.id].push({ authorAgentId: 'a1', body: '【对话】可以整理\n建议任务：整理提现流程 | 先核对规则', createdAt: new Date(w.time()).toISOString() }); await w.chat.tick()
  const r = await w.chat.toTask({ chatAgentId: 'a1', title: '整理提现流程', note: '先核对', messageIds: [msg.id] })
  const task = w.issues.find(i => i.id === r.id); assert.equal(task.assigneeAgentId, 'lead'); assert.equal(task.status, 'todo'); assert.equal(task.priority, 'medium'); assert.match(task.description, /类别：资金类/); assert.match(task.description, /任务契约（待 Lead 补全）/); assert.match(task.description, /建议负责人：Frontend2（仅供参考，由 Lead 决定）/)
  await assert.rejects(w.chat.toTask({ chatAgentId: 'a1', title: '重复', messageIds: [msg.id] }), /已经转过/)
  const view = await w.chat.view('a1'); assert.ok(view.messages.some(m => /已建任务 CMP-/.test(m.text)))
})

test('四个治理模块过滤会话任务且只影响前缀任务；server接线不把正文放入state', () => {
  const root = path.resolve(import.meta.dirname, '..')
  for (const name of ['blocked.mjs', 'acceptance.mjs', 'standup.mjs']) assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /isChatSessionTask\(/, name)
  assert.match(fs.readFileSync(path.join(root, 'memory.mjs'), 'utf8'), /startsWith\('【对话会话】'\)/)
  const server = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8')
  assert.match(server, /chat: chat\.summary\(\)/); assert.match(server, /\/chat\/summary/); assert.match(server, /body\.type\.startsWith\('chat_'\)/)
})

test('摘要和服务接线不泄露对话正文，启动后一分钟内拒绝发送', async t => {
  const w = fixture(t, { paused: true }); await w.chat.send('a1', '只应保存在聊天文件的原话')
  assert.ok(!JSON.stringify(w.chat.summary()).includes('只应保存在'))
  const delayed = createChat({ dir: w.dir, company: 'C', get: w.get, send: w.send, dutyOn: () => true, agents: () => w.agents, redactText: String, now: w.time, log: () => {} })
  const db = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json'))); delete db.pending.a1; fs.writeFileSync(path.join(w.dir, 'chat.json'), JSON.stringify(db))
  await assert.rejects(delayed.send('a1', '重启后太早'), e => e.status === 503 && /1 分钟/.test(e.message))
})

test('真实 CMP-333 时间线忽略运行摘要，保留真正回复和建议任务', async t => {
  const w = fixture(t)
  w.setTime(Date.parse('2026-10-20T03:54:43Z'))
  await w.chat.send('a1', '谢谢。你觉得知识库里现在最缺哪一类内容？请按约定在最后一行写「建议任务」。')
  const issue = w.issues[0]
  w.comments[issue.id].push(
    { authorAgentId: 'a1', body: '已修复任务处置记录并标记完成；对话回复已留在评论中。', createdAt: '2026-10-20T03:54:55Z' },
    { authorAgentId: 'a1', body: '【对话】我目前不能在这次对话里检查仓库……\n建议任务：知识库内容缺口盘点 | 核对产品文档、项目页与待补充问题，输出按优先级排序的补充清单。', createdAt: '2026-10-20T03:55:06Z' }
  )
  w.setTime(Date.parse('2026-10-20T03:55:07Z')); await w.chat.tick()
  const view = await w.chat.view('a1'), replies = view.messages.filter(m => m.role === 'agent')
  assert.equal(replies.length, 1)
  assert.match(replies[0].text, /我目前不能/)
  assert.ok(!replies[0].text.includes('已修复任务处置记录'))
  assert.deepEqual(replies[0].suggestion, { title: '知识库内容缺口盘点', note: '核对产品文档、项目页与待补充问题，输出按优先级排序的补充清单。' })
})

test('合并同一轮候选并以下一条用户消息为边界', async t => {
  const w = fixture(t), sent = await w.chat.send('a1', '第一轮'), issue = w.issues[0]
  w.advance(1000)
  const at = () => new Date(w.time()).toISOString()
  w.comments[issue.id].push({ authorAgentId: 'a1', body: '【对话】第一段', createdAt: at() })
  w.advance(1000); w.comments[issue.id].push({ authorAgentId: 'a1', body: '运行摘要', createdAt: at() })
  w.advance(1000); w.comments[issue.id].push({ authorAgentId: 'a1', body: '【对话】第二段', createdAt: at() })
  w.advance(1000); w.comments[issue.id].push({ authorUserId: 'system', body: '【对话】下一轮用户消息', createdAt: at() })
  w.advance(1000); w.comments[issue.id].push({ authorAgentId: 'a1', body: '【对话】不属于前一轮', createdAt: at() })
  await w.chat.tick()
  const reply = (await w.chat.view('a1')).messages.find(m => m.replyTo === sent.id)
  assert.match(reply.text, /第一段\n【对话】第二段/)
  assert.ok(!reply.text.includes('运行摘要'))
  assert.ok(!reply.text.includes('不属于前一轮'))
})

test('候选在运行结束前保持回复中；状态不可用时静默15秒再完成', async t => {
  const running = fixture(t), sent = await running.chat.send('a1', '运行状态'), issue = running.issues[0]
  running.agents[0].status = 'running'; running.advance(1000)
  running.comments[issue.id].push({ authorAgentId: 'a1', body: '【对话】第一部分', createdAt: new Date(running.time()).toISOString() })
  await running.chat.tick(); let view = await running.chat.view('a1')
  assert.equal(view.pending, true); assert.equal(view.messages.find(m => m.replyTo === sent.id).status, 'replying')
  running.agents[0].status = 'idle'; await running.chat.tick(); view = await running.chat.view('a1')
  assert.equal(view.pending, false); assert.equal(view.messages.find(m => m.replyTo === sent.id).status, 'replied')

  const unknown = fixture(t), unknownSent = await unknown.chat.send('a1', '状态未知'), unknownIssue = unknown.issues[0]
  unknown.advance(1000); unknown.comments[unknownIssue.id].push({ authorAgentId: 'a1', body: '【对话】等待静默', createdAt: new Date(unknown.time()).toISOString() })
  const missing = unknown.agents.shift(); await unknown.chat.tick(); unknown.agents.unshift(missing); view = await unknown.chat.view('Frontend2')
  assert.equal(view.pending, true); assert.equal(view.messages.find(m => m.replyTo === unknownSent.id).status, 'replying')
  unknown.agents.shift(); unknown.advance(15001); await unknown.chat.tick(); unknown.agents.unshift(missing); view = await unknown.chat.view('Frontend2')
  assert.equal(view.pending, false); assert.equal(view.messages.find(m => m.replyTo === unknownSent.id).status, 'replied')
})

test('无格式回复90秒后取最后一条并标记 loose，程序评论不算', async t => {
  const w = fixture(t), sent = await w.chat.send('a1', '请回复'), issue = w.issues[0]
  assert.match(w.comments[issue.id][0].body, /^【对话】/); assert.equal(w.comments[issue.id][0].authorAgentId, undefined)
  w.advance(1000); w.comments[issue.id].push({ authorAgentId: 'a1', body: '第一条运行摘要', createdAt: new Date(w.time()).toISOString() })
  w.advance(1000); w.comments[issue.id].push({ authorAgentId: 'a1', body: '最后一条可读回复', createdAt: new Date(w.time()).toISOString() })
  w.advance(87000); await w.chat.tick(); let view = await w.chat.view('a1')
  assert.equal(view.pending, true); assert.equal(view.messages.some(m => m.role === 'agent'), false)
  w.advance(2001); await w.chat.tick(); view = await w.chat.view('a1')
  const reply = view.messages.find(m => m.replyTo === sent.id)
  assert.equal(reply.text, '最后一条可读回复'); assert.equal(reply.format, 'loose'); assert.equal(view.pending, false)
})

test('摘要列出待回复、未读和排队且只有布尔值', async t => {
  const w = fixture(t, { paused: true }); await w.chat.send('a1', '隐私原文-排队')
  let summary = w.chat.summary(); assert.deepEqual(summary.agents.a1, { pending: true, queued: true, unread: false })
  const db = JSON.parse(fs.readFileSync(path.join(w.dir, 'chat.json')))
  db.pending.x0 = { messageId: 'm2', agentId: 'x0', name: 'Role0' }; db.unread.x1 = true
  fs.writeFileSync(path.join(w.dir, 'chat.json'), JSON.stringify(db)); await w.chat.tick(); summary = w.chat.summary()
  assert.deepEqual(summary.agents.x0, { pending: true, queued: false, unread: false })
  assert.deepEqual(summary.agents.x1, { pending: false, queued: false, unread: true })
  assert.ok(!JSON.stringify(summary).includes('隐私原文'))
  assert.ok(Object.values(summary.agents).every(v => Object.values(v).every(x => typeof x === 'boolean')))
})
