import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { scanMemoryText } from './memory.mjs'
import { MONEY_RE } from './standup.mjs'

export const CHAT_SESSION_PREFIX = '【对话会话】'
const PROJECT = '运营与知识库'
const HOUR_LIMIT = 6, DAY_LIMIT = 60, TASK_LIMIT = 5, REPLY_MS = 10 * 60 * 1000, QUEUE_MS = 15000, KEEP_MS = 30 * 86400000
const LOOSE_REPLY_MS = 90000, REPLY_SILENCE_MS = 15000
const list = (v, key) => Array.isArray(v) ? v : v?.[key] || []
const clip = (v, n) => String(v || '').trim().slice(0, n)
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const safeName = (s) => String(s || 'agent').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80)
const ph = (ms) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
export function chatKeys(ms = Date.now()) { const p = ph(ms); return { day: `${p.year}-${p.month}-${p.day}`, hour: `${p.year}-${p.month}-${p.day}T${p.hour}` } }
export const isChatSessionTask = i => typeof i?.title === 'string' && i.title.startsWith(CHAT_SESSION_PREFIX)
export function parseChatSuggestion(text) {
  const m = String(text || '').match(/(?:^|\n)建议任务\s*[：:]\s*([^|｜\n]{1,80})(?:\s*[|｜]\s*([^\n]{1,300}))?/)
  return m ? { title: m[1].trim(), note: (m[2] || '').trim() } : null
}

export function createChat({ dir, company, get, send, dutyOn, agents, redactText, now = Date.now, log = console.log, bootDelayMs = 60000 }) {
  const file = path.join(dir, 'chat.json'), chatDir = path.join(dir, 'chats')
  const fresh = () => ({ enabled: false, corrupt: false, usage: { hours: {}, days: {}, tasks: {} }, sessions: {}, queue: [], pending: {}, unread: {}, converted: {}, tasks: [], lastQueueAt: 0 })
  let db = fresh(), timer = null, cleanupDay = '', readyAt = now() + bootDelayMs
  function load() {
    try {
      if (!fs.existsSync(file)) return
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid')
      db = { ...fresh(), ...raw, enabled: raw.enabled === true, corrupt: false, usage: { ...fresh().usage, ...(raw.usage || {}) }, sessions: raw.sessions || {}, queue: raw.queue || [], pending: raw.pending || {}, unread: raw.unread || {}, converted: raw.converted || {}, tasks: raw.tasks || [] }
    } catch (e) { db = { ...fresh(), corrupt: true }; log('[chat] 配置损坏，按关闭处理') }
  }
  load()
  function save() {
    if (db.corrupt) return
    const current = (() => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } })()
    if (current && current.enabled === false) db.enabled = false
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, file)
  }
  const agentList = async () => list(await (typeof agents === 'function' ? agents() : agents), 'agents')
  const logFile = name => path.join(chatDir, safeName(name) + '.jsonl')
  function append(name, row) {
    fs.mkdirSync(chatDir, { recursive: true })
    fs.appendFileSync(logFile(name), JSON.stringify(row) + '\n')
  }
  function readRows(name) {
    try {
      const rows = [], bad = { count: 0 }
      for (const line of fs.readFileSync(logFile(name), 'utf8').split(/\r?\n/)) if (line) { try { rows.push(JSON.parse(line)) } catch { bad.count++ } }
      const by = new Map(); for (const r of rows) by.set(r.id, { ...(by.get(r.id) || {}), ...r })
      return { rows: [...by.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), corrupt: bad.count }
    } catch { return { rows: [], corrupt: 0 } }
  }
  function cleanup() {
    const { day } = chatKeys(now()); if (day === cleanupDay) return; cleanupDay = day
    if (!fs.existsSync(chatDir)) return
    const cutoff = now() - KEEP_MS
    for (const name of fs.readdirSync(chatDir).filter(x => x.endsWith('.jsonl'))) {
      const p = path.join(chatDir, name), kept = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).filter(line => { try { return Date.parse(JSON.parse(line).at) >= cutoff } catch { return false } })
      const tmp = p + '.tmp'; fs.writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : ''); fs.renameSync(tmp, p)
    }
  }
  const usage = (agentId) => { const k = chatKeys(now()); return { hourCount: db.usage.hours[`${agentId}@${k.hour}`] || 0, dayCount: db.usage.days[k.day] || 0, taskCount: db.usage.tasks[k.day] || 0, dayKey: k.day, hourKey: k.hour } }
  function reserve(agentId) {
    const u = usage(agentId)
    if (u.hourCount >= HOUR_LIMIT) fail(429, '额度用完，下一个小时再聊')
    if (u.dayCount >= DAY_LIMIT) fail(429, '额度用完，明天再聊')
    db.usage.hours[`${agentId}@${u.hourKey}`] = u.hourCount + 1; db.usage.days[u.dayKey] = u.dayCount + 1
  }
  async function projectAndAgent(agentId) {
    const [aa, pp] = await Promise.all([agentList(), get(`/api/companies/${company}/projects`)])
    const agent = aa.find(a => a.id === agentId)
    if (!agent || agent.status === 'terminated') fail(400, '同事不存在或已离职')
    const project = list(pp, 'projects').find(p => p.name === PROJECT)
    if (!project) fail(500, `找不到项目「${PROJECT}」`)
    return { agent, project }
  }
  async function session(agent, project, day) {
    const key = `${agent.id}@${day}`, known = db.sessions[key]
    if (known?.id) return known
    const description = `这是董事会与你的对话。\n\n规则：\n1. 每次只发一条回复评论，第一行以【对话】开头；不要再发“已处理 / 已标记完成”之类的运行摘要评论。回复不超过 300 字，口语化。\n2. 不要创建任务、不要修改任何任务状态、不要执行操作。\n3. 若对话里有可做的事，可在回复最后单独一行写：建议任务：一句话标题 | 一句话说明（最多一条）。\n4. 不得写密钥、令牌、服务器地址或账务数据。\n5. 不确定或超出岗位范围时直接说明，并建议找谁。`
    const r = await send('POST', `/api/companies/${company}/issues`, { title: `${CHAT_SESSION_PREFIX}${agent.name} · ${day}`, description, projectId: project.id, assigneeAgentId: agent.id, status: 'todo', priority: 'low' })
    db.sessions[key] = { id: r.id, identifier: r.identifier, agentId: agent.id, name: agent.name, day, status: 'todo' }; save(); return db.sessions[key]
  }
  async function dispatch(entry, agent, project) {
    const s = await session(agent, project, entry.day)
    await send('POST', `/api/issues/${s.id}/comments`, { body: `【对话】\n${entry.text}` })
    const sentAt = new Date(now()).toISOString()
    db.pending[agent.id] = { messageId: entry.id, issueId: s.id, sentAt, agentId: agent.id, name: agent.name }
    append(agent.name, { ...entry, at: sentAt, status: 'sent', issueId: s.id }); save()
    return { ...entry, status: 'sent', issueId: s.id }
  }
  async function sendMessage(agentId, raw) {
    load(); if (!db.enabled || db.corrupt) fail(403, db.corrupt ? '对话配置损坏，功能已关闭' : '对话功能未开启')
    if (now() < readyAt) fail(503, '服务刚重启，请 1 分钟后再试')
    const text = String(raw || '').trim(); if (!text || text.length > 600) fail(400, '消息必须为 1–600 字')
    if (db.pending[agentId]) fail(409, '等 TA 回复后再说')
    const findings = scanMemoryText(text); if (findings.length) fail(400, `内容包含敏感类别：${[...new Set(findings.map(x => x.category))].join('、')}`)
    const { agent, project } = await projectAndAgent(agentId); reserve(agentId)
    const { day } = chatKeys(now()), entry = { id: crypto.randomUUID(), at: new Date(now()).toISOString(), role: 'user', text, status: 'queued', agentId, day }
    append(agent.name, entry)
    if (agent.status === 'paused' || !dutyOn()) { db.queue.push(entry); db.pending[agentId] = { messageId: entry.id, agentId, name: agent.name, queued: true }; save(); return entry }
    save(); return dispatch(entry, agent, project)
  }
  async function pollReplies() {
    for (const p of Object.values(db.pending)) {
      if (p.queued || !p.issueId) continue
      let comments = []
      try { comments = list(await get(`/api/issues/${p.issueId}/comments`), 'comments') } catch { continue }
      const after = comments.filter(c => Date.parse(c.createdAt) > Date.parse(p.sentAt)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      const nextUser = after.find(c => !c.authorAgentId && String(c.body || '').split(/\r?\n/, 1)[0].startsWith('【对话】'))
      const inTurn = after.filter(c => !nextUser || Date.parse(c.createdAt) < Date.parse(nextUser.createdAt))
      const agentComments = inTurn.filter(c => c.authorAgentId === p.agentId)
      const replies = agentComments.filter(c => String(c.body || '').split(/\r?\n/, 1)[0].startsWith('【对话】'))
      if (replies.length) {
        const text = clip(redactText(replies.map(c => c.body || '').join('\n')), 1500)
        const at = replies.at(-1).createdAt || new Date(now()).toISOString(), id = p.replyId ||= crypto.randomUUID()
        let agent
        try { agent = (await agentList()).find(a => a.id === p.agentId) } catch {}
        const complete = agent ? agent.status !== 'running' : now() - Date.parse(at) >= REPLY_SILENCE_MS
        append(p.name, { id, at, role: 'agent', text, status: complete ? 'replied' : 'replying', replyTo: p.messageId, suggestion: complete ? parseChatSuggestion(text) : null })
        if (!complete) { save(); continue }
        db.unread[p.agentId] = true
        append(p.name, { id: p.messageId, at, status: 'replied' }); delete db.pending[p.agentId]; save(); continue
      }
      if (agentComments.length && now() - Date.parse(p.sentAt) >= LOOSE_REPLY_MS) {
        const reply = agentComments.at(-1), text = clip(redactText(reply.body || ''), 1500), at = reply.createdAt || new Date(now()).toISOString()
        append(p.name, { id: p.replyId || crypto.randomUUID(), at, role: 'agent', text, status: 'replied', format: 'loose', replyTo: p.messageId, suggestion: parseChatSuggestion(text) })
        db.unread[p.agentId] = true
        append(p.name, { id: p.messageId, at, status: 'replied' }); delete db.pending[p.agentId]; save(); continue
      }
      if (!agentComments.length && now() - Date.parse(p.sentAt) >= REPLY_MS) { append(p.name, { id: p.messageId, at: new Date(now()).toISOString(), status: 'timeout' }); delete db.pending[p.agentId]; save() }
    }
  }
  async function flushQueue() {
    if (!db.queue.length || !dutyOn() || now() - db.lastQueueAt < QUEUE_MS) return
    const all = await agentList(), entry = db.queue[0], agent = all.find(a => a.id === entry.agentId)
    if (!agent || ['paused', 'terminated'].includes(agent.status)) return
    const pp = list(await get(`/api/companies/${company}/projects`), 'projects'), project = pp.find(p => p.name === PROJECT); if (!project) return
    db.queue.shift(); db.lastQueueAt = now(); await dispatch(entry, agent, project)
  }
  async function closeOldSessions() {
    if (dutyOn() || db.queue.length || Object.keys(db.pending).length) return
    for (const s of Object.values(db.sessions)) if (s.status !== 'done') { try { await send('PATCH', `/api/issues/${s.id}`, { status: 'done' }); s.status = 'done'; save() } catch {} }
  }
  async function tick() { load(); if (!db.enabled || db.corrupt) return; cleanup(); await flushQueue(); await pollReplies(); await closeOldSessions() }
  async function toTask({ chatAgentId, title: rawTitle, note: rawNote, messageIds }) {
    load(); if (!db.enabled || db.corrupt) fail(403, '对话功能未开启')
    const title = clip(rawTitle, 80), note = clip(rawNote, 300), ids = [...new Set(Array.isArray(messageIds) ? messageIds : [])]
    if (!title) fail(400, '请填写任务标题'); if (!ids.length) fail(400, '请选择对话消息'); if (ids.some(id => db.converted[id])) fail(409, '这段对话已经转过任务')
    const { agent, project } = await projectAndAgent(chatAgentId), lead = (await agentList()).find(a => a.name === 'Lead' && a.status !== 'terminated')
    if (!lead) fail(500, '找不到 Lead')
    const u = usage(chatAgentId); if (u.taskCount >= TASK_LIMIT) fail(429, '今天由对话产生的任务已达 5 个')
    const rows = readRows(agent.name).rows.filter(r => ids.includes(r.id) && r.text)
    if (!rows.length) fail(400, '没有找到所选消息')
    const original = clip(rows.map(r => `${r.role === 'user' ? '董事会' : agent.name}：${r.text}`).join('\n'), 800)
    const findings = scanMemoryText(`${title}\n${note}\n${original}`); if (findings.length) fail(400, `内容包含敏感类别：${[...new Set(findings.map(x => x.category))].join('、')}`)
    const money = MONEY_RE.test(`${title}\n${original}`), s = Object.values(db.sessions).find(x => x.agentId === agent.id && x.day === u.dayKey)
    const head = money ? '类别：资金类（账务 / 提现 / 鉴权 / IAM / 迁移 / 密钥 / 入账队列）→ 只允许 GoSenior / DBEngineer 实现，必须先由董事会审批\n\n' : ''
    const description = `${head}来源：与 ${agent.name} 的对话，金边时间 ${new Date(now()).toISOString()}，会话任务 ${s?.identifier || '–'}\n建议负责人：${agent.name}（仅供参考，由 Lead 决定）\n\n原话（已扫描 / 脱敏）：\n${redactText(original)}${note ? `\n\n补充说明：${redactText(note)}` : ''}\n\n## 任务契约（待 Lead 补全）\n### 目标\n待 Lead 补全\n### 范围（允许改 / 禁止碰）\n待 Lead 补全\n### 前置条件\n待 Lead 补全\n### 验收项 AC-x 与证明方式\n待 Lead 补全\n### 交付物\n待 Lead 补全\n### 责任\n待 Lead 补全\n### 停止条件\n待 Lead 补全`
    const r = await send('POST', `/api/companies/${company}/issues`, { title: `【对话任务】${title}`, description: clip(description, 3500), projectId: project.id, assigneeAgentId: lead.id, status: 'todo', priority: 'medium' })
    for (const id of ids) db.converted[id] = r.id; db.usage.tasks[u.dayKey] = u.taskCount + 1; db.tasks.push({ id: r.id, identifier: r.identifier, at: new Date(now()).toISOString(), session: s?.id || null, agentId: agent.id })
    append(agent.name, { id: crypto.randomUUID(), at: new Date(now()).toISOString(), role: 'system', text: `已建任务 ${r.identifier}，交给 Lead`, status: 'created', issueId: r.id }); save()
    return { id: r.id, identifier: r.identifier }
  }
  function summary() {
    const k = chatKeys(now()), day = db.usage.days[k.day] || 0
    const ids = new Set([...Object.keys(db.pending), ...Object.keys(db.unread)])
    return { enabled: db.enabled && !db.corrupt, corrupt: db.corrupt, day, dayLimit: DAY_LIMIT, agents: Object.fromEntries([...ids].map(id => [id, { pending: Boolean(db.pending[id]), queued: Boolean(db.pending[id]?.queued), unread: Boolean(db.unread[id]) }])) }
  }
  async function view(agentId) {
    const all = await agentList(), agent = all.find(a => a.id === agentId || a.name === agentId); if (!agent) fail(404, '同事不存在')
    agentId = agent.id
    const u = usage(agentId), data = readRows(agent.name)
    const unread = Boolean(db.unread[agentId]); if (unread) { delete db.unread[agentId]; save() }
    return { enabled: db.enabled && !db.corrupt, corrupt: db.corrupt, agent: { id: agent.id, name: agent.name, status: agent.status }, messages: data.rows, pending: Boolean(db.pending[agentId]), queued: Boolean(db.pending[agentId]?.queued), unread, quota: { hour: u.hourCount, hourLimit: HOUR_LIMIT, day: u.dayCount, dayLimit: DAY_LIMIT }, corruptLines: data.corrupt }
  }
  function start() { if (timer) return; timer = setInterval(() => tick().catch(e => log('[chat] ' + e.message)), 5000); timer.unref?.() }
  function stop() { if (timer) clearInterval(timer); timer = null }
  return { send: sendMessage, toTask, tick, view, summary, start, stop, parseSuggestion: parseChatSuggestion }
}
