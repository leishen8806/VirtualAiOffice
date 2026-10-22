import fs from 'node:fs'
import path from 'node:path'
import { MEMBERS, BACKUP } from './committee.mjs'
import { MONEY_RE } from './standup.mjs'
import { isChatSessionTask } from './chat.mjs'

const ROUND = 3 * 3600000, DAY = 86400000, MARK = '【阻塞巡检】'
const list = (r, key) => Array.isArray(r) ? r : r?.[key] || []
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').slice(0, n)
const ended = (s) => ['done', 'cancelled'].includes(s)
const types = ['依赖未完成', '待授权或业务决定', '额度登录环境异常', '验证失败', '范围冲突或文件占用']

export function blockedReason(comments) {
  const c = comments.filter((c) => /^阻塞[：:]/.test(c.body || '')).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  const m = String(c?.body || '').split(/\r?\n/)[0].match(/^阻塞[：:]\s*(.*?)\s*[|｜]\s*解除条件[：:]\s*(.*?)\s*[|｜]\s*下次检查[：:]\s*(.*?)\s*$/)
  if (!m) return { type: '未说明', condition: '请说明要决定什么', checkAt: null }
  const name = m[1].replace(/[\s/／]/g, '').replace('待业务决定', '业务决定')
  const type = ({ '待授权业务决定': types[1], '范围冲突文件占用': types[4] })[name] || (types.includes(name) ? name : '未说明')
  const local = m[3].match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/)
  const at = local ? Date.parse(`${local[1]}T${local[2]}:${local[3] || '00'}+07:00`) : /(?:Z|[+-]\d{2}:\d{2})$/.test(m[3]) ? Date.parse(m[3]) : NaN
  return { type, condition: m[2], checkAt: Number.isFinite(at) ? at : null }
}

export function parseBlockedVotes(comments) {
  const out = {}
  for (const c of [...comments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    for (const m of String(c.body || '').matchAll(/^\s*VOTE\s*(\d+)\s*[:：]\s*(CONTINUE|REASSIGN\s+([\w-]+)|SPLIT_OR_CANCEL|ESCALATE)\s*[|｜]\s*(.*)$/gim)) {
      out[Number(m[1]) - 1] = { v: m[2].toUpperCase().startsWith('REASSIGN') ? 'REASSIGN' : m[2].toUpperCase(), target: m[3] || null, why: clip(m[4], 200) }
    }
  }
  return out
}

export function blockedPrompt(items) {
  const rules = `阻塞任务重新评估：只投票，不改原任务状态、负责人、依赖，不自行派发。负责人回避，由 ${BACKUP} 顶替。\n投票规则：每项五票；同一动作至少3票且没有ESCALATE才执行；REASSIGN必须至少3票指向同一岗位。任何ESCALATE交董事会；无多数默认CONTINUE；一票都没有则作废。资金类只可给GoSenior/DBEngineer且必须先董事会审批，绝不越过依赖。SPLIT_OR_CANCEL只提建议，不自动拆分取消。\n每项一行：VOTE <序号>: CONTINUE|REASSIGN <岗位名>|SPLIT_OR_CANCEL|ESCALATE | 理由\n请核对前置条件、任务契约和现有证据，给一句可执行建议，随后完成本投票任务。\n`
  const budget = Math.floor((3600 - rules.length) / Math.max(1, items.length)) - 2
  return rules + items.map((x) => clip(`${x.idx + 1}. ${clip(x.ident, 30)} ${clip(x.title, 80)}；负责人 ${clip(x.owner, 40)}；阻塞 ${x.type}；最近评论：${x.report}`, budget)).join('\n')
}

export function createBlockedPatrol({ dir, company, get, send: write, notify: alert, dutyOn, healthReport, now = Date.now, staggerMs = 15000, log = console.log }) {
  const file = path.join(dir, 'blocked.json'), workhours = path.join(dir, '..', 'workhours', 'workhours.json')
  const notBefore = now() + 300000
  let db = { enabled: true, tasks: {}, batches: [], records: [], lastAt: null, nextAt: notBefore }, busy = false, timer
  const load = () => {
    try { db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) } }
    catch (e) { if (e.code !== 'ENOENT') throw e }
  }
  load()
  function writable() {
    let enabled = db.enabled
    try { enabled = JSON.parse(fs.readFileSync(file, 'utf8')).enabled !== false } catch (e) { if (e.code !== 'ENOENT') throw e }
    if (!enabled || !onDuty()) throw new Error('总开关关闭或已经下班，停止写操作')
  }
  const send = async (...args) => { writable(); return write(...args) }
  const notify = async (text) => { writable(); return alert(text) }
  // 每次启动都留五分钟交接窗口，持久化的任务阶梯不变。
  db.nextAt = Math.max(db.nextAt || 0, now() + 300000)
  const save = () => {
    // 运维可能在两张投票任务之间关闭开关，保存进度不能把它覆盖回开启。
    try { db.enabled = JSON.parse(fs.readFileSync(file, 'utf8')).enabled !== false } catch (e) { if (e.code !== 'ENOENT') throw e }
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 1)); fs.renameSync(tmp, file)
  }
  const iso = () => new Date(now()).toISOString()
  const record = (it, action) => { db.records.push({ at: iso(), ident: it.ident, action }); db.records = db.records.slice(-100); save() }
  function onDuty() {
    const w = JSON.parse(fs.readFileSync(workhours, 'utf8'))
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now())).map((p) => [p.type, p.value]))
    const min = Number(p.hour) * 60 + Number(p.minute), minutes = (s) => { const a = s.split(':').map(Number); return a[0] * 60 + a[1] }
    return Boolean(dutyOn()) && w.days.includes(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)) && min >= minutes(w.start) && min < minutes(w.end)
  }
  async function context() {
    const [a, i, r, h] = await Promise.all([get(`/api/companies/${company}/agents`), get(`/api/companies/${company}/issues`), get(`/api/companies/${company}/heartbeat-runs?limit=1000`), healthReport()])
    return { agents: list(a, 'agents'), issues: list(i, 'issues'), runs: list(r, 'runs'), health: h }
  }
  const clearDeps = (i) => Array.isArray(i.blockedBy) && i.blockedBy.every((b) => ended(b.status))
  function stamp(i, cs, runs) {
    const comments = cs.filter((c) => !String(c.body || '').startsWith(MARK)).map((c) => [c.id, c.createdAt, c.updatedAt, c.body]).sort()
    // 运行接口未携带任务关联时，保守地把该负责人新运行也视为动作，避免误升级。
    const rr = runs.filter((r) => (r.issueId || r.contextSnapshot?.issueId || r.context?.issueId) === i.id || (!(r.issueId || r.contextSnapshot?.issueId || r.context?.issueId) && r.agentId === i.assigneeAgentId)).map((r) => [r.id, r.status, r.startedAt, r.finishedAt, r.updatedAt]).sort()
    return JSON.stringify([i.status, i.assigneeAgentId, comments, rr])
  }
  async function candidate(raw, ctx, on) {
    const i = await get(`/api/issues/${raw.id}`), cs = list(await get(`/api/issues/${raw.id}/comments`), 'comments')
    const owner = ctx.agents.find((a) => a.id === i.assigneeAgentId), reason = blockedReason(cs), s = db.tasks[i.id]
    const fingerprint = stamp(i, cs, ctx.runs), changed = s && s.fingerprint !== fingerprint
    let skip = isChatSessionTask(i) ? '对话会话任务' : !db.enabled ? '总开关已关闭' : !on ? '非上班时间' : i.status !== 'blocked' ? '状态已改变' : i.assigneeUserId ? '真人负责人' : !owner ? '没有可用负责人' : ['paused', 'terminated'].includes(owner.status) ? '负责人已暂停或终止' : !clearDeps(i) ? '存在未满足依赖或依赖信息缺失' : reason.checkAt > now() ? '未到下次检查时间' : s?.stage === 'human' ? '已交还人工' : ''
    if (!skip && reason.type === types[2] && (ctx.health.incidents || []).some((h) => ['quota', 'login'].includes(h.category) && (h.agentIds || []).includes(owner.id))) skip = '额度或登录事件尚未恢复'
    const stage = changed ? 'remind' : s?.stage || 'remind', reminders = changed ? 0 : s?.reminders || 0
    let action = reason.type === types[1] ? 'board' : stage === 'committee' ? 'human' : stage === 'awaiting' ? 'approval' : reminders >= 2 ? 'committee' : 'remind'
    if (!skip && action === 'board' && s?.boardAt != null && now() - s.boardAt < DAY) skip = '董事会通知24小时冷却'
    if (!skip && s?.lastAt != null && now() - s.lastAt < (action === 'board' ? DAY : ROUND)) skip = action === 'board' ? '董事会通知24小时冷却' : '3小时冷却'
    if (!skip && action === 'committee' && s?.committeeAt != null && now() - s.committeeAt < DAY) skip = '委员会24小时冷却'
    return { issueId: i.id, ident: i.identifier, title: i.title, owner: owner?.name || '–', ownerId: i.assigneeAgentId, type: reason.type, condition: reason.condition, report: clip([...cs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.body, 1500), since: s?.since || i.updatedAt || i.createdAt || iso(), stage, reminders, fingerprint, changed: Boolean(changed), action, skip, money: MONEY_RE.test(`${i.title}\n${i.description || ''}`) }
  }
  async function preview() {
    // 不能在异步开票期间替换内存账本，否则已发投票任务的编号会丢失。
    if (!busy) load()
    const ctx = await context(), on = onDuty(), items = []
    for (const i of ctx.issues.filter((i) => i.status === 'blocked')) items.push(await candidate(i, ctx, on))
    items.sort((a, b) => Date.parse(a.since) - Date.parse(b.since))
    let n = 0
    const voting = db.batches.some((b) => ['opening', 'voting'].includes(b.state))
    for (const i of items) if (!i.skip) { if (voting && i.action === 'committee') i.skip = '已有批次投票中'; else if (n++ >= 6) i.skip = '本轮最多6项，留到下一轮' }
    return { at: iso(), enabled: db.enabled, dutyOn: on, items: items.map(({ fingerprint, changed, money, ownerId, report, ...i }) => i) }
  }
  async function note(it, text) {
    await send('POST', `/api/issues/${it.issueId}/comments`, { body: `${MARK}\n阻塞：${it.type} | 解除条件：${clip(it.condition, 180)} | 下次检查：${new Date(now() + ROUND).toISOString()}\n${text}` })
  }
  async function board(it, why) { await notify(`${MARK} ${it.ident} ${clip(it.title, 100)}：${why}；要决定什么：${clip(it.condition, 250)}`) }
  function remember(it, stage) {
    return db.tasks[it.issueId] = { ...db.tasks[it.issueId], ...it, report: undefined, changed: undefined, skip: undefined, stage, lastAt: now() }
  }
  async function fresh(it, ctx) {
    const i = await get(`/api/issues/${it.issueId}`), cs = list(await get(`/api/issues/${it.issueId}/comments`), 'comments')
    return i.status === 'blocked' && !i.assigneeUserId && i.assigneeAgentId === it.ownerId && clearDeps(i) && stamp(i, cs, ctx.runs) === it.fingerprint ? i : null
  }
  async function reassign(it, target, ctx, approved = false) {
    const i = await fresh(it, ctx), a = ctx.agents.find((a) => a.name.toLowerCase() === target.toLowerCase())
    if (!i) return '任务状态、依赖或负责人动作已改变'
    if (!a || ['paused', 'error', 'terminated'].includes(a.status) || a.id === i.assigneeAgentId || ctx.issues.filter((x) => x.assigneeAgentId === a.id && !ended(x.status)).length > 2) return '改派岗位不存在、不可用、任务过多或是原负责人'
    const money = MONEY_RE.test(`${i.title}\n${i.description || ''}`)
    if (money && !['GoSenior', 'DBEngineer'].includes(a.name)) return '资金类只能改派给 GoSenior / DBEngineer'
    if (money && !approved) {
      const lead = ctx.agents.find((a) => a.name === 'Lead')
      if (!lead) return '缺少董事会审批申请人 Lead'
      const ap = await send('POST', `/api/companies/${company}/approvals`, { type: 'request_board_approval', requestedByAgentId: lead.id, issueIds: [i.id], payload: { title: `阻塞巡检：改派 ${it.ident} 给 ${a.name}？`, summary: `资金类，委员会 ${it.count}/5 同意改派。原因：${it.why}` } })
      if (!ap?.id) throw new Error('审批未返回编号')
      Object.assign(db.tasks[it.issueId], { stage: 'awaiting', approvalId: ap.id, target: a.name, count: it.count, why: it.why }); save()
      return null
    }
    await send('PATCH', `/api/issues/${i.id}`, { assigneeAgentId: a.id, status: 'todo' })
    const cached = ctx.issues.find((x) => x.id === i.id)
    if (cached) Object.assign(cached, { assigneeAgentId: a.id, status: 'todo' })
    await note(it, `委员会 ${it.count}/5 同意改派给 ${a.name}，原因：${it.why}${approved ? '；董事会已批准' : ''}`)
    return null
  }
  async function open(items, ctx) {
    if (!items.length || db.batches.some((b) => ['opening', 'voting'].includes(b.state))) return
    const projects = list(await get(`/api/companies/${company}/projects`), 'projects'), proj = projects.find((p) => p.name === '运营与知识库')
    if (!proj) throw new Error('找不到项目「运营与知识库」')
    const b = { id: String(now()), state: 'opening', createdAt: iso(), dueAt: new Date(now() + 30 * 60000).toISOString(), items: items.map((it, idx) => ({ ...it, idx, votes: {}, voters: MEMBERS.map((m) => m.name === it.owner ? BACKUP : m.name) })), members: [] }
    db.batches.push(b); save()
    for (const name of new Set(b.items.flatMap((i) => i.voters))) {
      const a = ctx.agents.find((a) => a.name === name)
      if (!a || ['paused', 'terminated'].includes(a.status)) continue
      if (b.members.length) await new Promise((ok) => setTimeout(ok, staggerMs))
      const mine = b.items.filter((i) => i.voters.includes(name))
      const v = await send('POST', `/api/companies/${company}/issues`, { title: `阻塞巡检投票 ${b.id} · ${name}`, description: blockedPrompt(mine), projectId: proj.id, assigneeAgentId: a.id, status: 'todo', priority: 'high' })
      b.members.push({ name, agentId: a.id, issueId: v.id, ident: v.identifier, status: 'todo' }); save()
    }
    b.state = 'voting'
    for (const it of b.items) { remember(it, 'voting').committeeAt = now(); record(it, '委员会重新评估') }
    save()
  }
  async function collect(b) {
    for (const m of b.members) {
      const i = await get(`/api/issues/${m.issueId}`), cs = list(await get(`/api/issues/${m.issueId}/comments`), 'comments')
      m.status = i.status
      const votes = parseBlockedVotes(cs.filter((c) => c.authorAgentId === m.agentId))
      for (const it of b.items) if (it.voters.includes(m.name)) { delete it.votes[m.name]; if (votes[it.idx]) it.votes[m.name] = votes[it.idx] }
    }
    return b.members.length > 0 && b.members.every((m) => ended(m.status))
  }
  async function tally(b, ctx) {
    if (!b.items.some((i) => Object.keys(i.votes).length)) {
      b.state = 'void'
      for (const it of b.items) { const s = db.tasks[it.issueId]; s.stage = 'remind'; s.committeeAt = null; s.lastAt = now(); record(it, '无有效票，批次作废，下轮再评估') }
      save(); return
    }
    for (const it of b.items) {
      const s = db.tasks[it.issueId]
      if (!await fresh(it, ctx)) { s.stage = 'remind'; s.reminders = 0; it.outcome = 'SKIP'; continue }
      const vs = Object.values(it.votes), counts = new Map()
      for (const v of vs) { const k = v.v === 'REASSIGN' ? `REASSIGN ${v.target.toLowerCase()}` : v.v; counts.set(k, (counts.get(k) || 0) + 1) }
      const majority = [...counts].find(([, n]) => n >= 3)
      const action = vs.some((v) => v.v === 'ESCALATE') ? 'ESCALATE' : majority?.[0] || 'CONTINUE'
      it.count = majority?.[1] || counts.get('CONTINUE') || 0; it.why = vs.map((v) => v.why).join('；').slice(0, 1000)
      // 先落盘，写请求异常时交人工核对，不自动重放可能已经成功的写操作。
      s.stage = 'human'; it.outcome = 'uncertain'; save()
      if (action.startsWith('REASSIGN ')) {
        const reason = await reassign(it, action.slice(9), ctx)
        if (reason) { await board(it, reason); it.outcome = 'BOARD' } else it.outcome = db.tasks[it.issueId].stage === 'awaiting' ? 'APPROVAL' : 'REASSIGN'
      } else if (action === 'CONTINUE') { await note(it, `委员会 ${it.count}/5 建议继续（不足多数时按规则默认继续）。${it.why}`); s.stage = 'committee'; it.outcome = action }
      else { await board(it, `${action}：${it.why}`); it.outcome = 'BOARD' }
      s.lastAt = now(); record(it, it.outcome)
    }
    b.state = 'done'; b.tallyAt = iso(); save()
  }
  async function run(manual = false) {
    if (busy) return { ran: false, reason: '巡检正在进行' }
    busy = true
    try {
      load()
      if (!db.enabled || !onDuty()) return { ran: false, reason: !db.enabled ? '总开关已关闭' : '非上班时间' }
      if (!manual && now() < notBefore) return { ran: false, reason: '重启后等待5分钟' }
      const ctx = await context(), b = db.batches.find((b) => b.state === 'voting')
      if (b) { const done = await collect(b); if (done || now() >= Date.parse(b.dueAt)) await tally(b, ctx); else save(); return { ran: true, reason: '投票批次跟进' } }
      if (db.batches.some((b) => b.state === 'opening')) return { ran: false, reason: '开票中断，需人工核对已有投票任务' }
      if (!manual && now() < db.nextAt) return { ran: false, reason: '未到巡检时间' }
      const active = new Set(ctx.issues.filter((i) => i.status === 'blocked').map((i) => i.id))
      for (const id of Object.keys(db.tasks)) if (!active.has(id)) delete db.tasks[id]
      const candidates = []
      for (const i of ctx.issues.filter((i) => i.status === 'blocked')) candidates.push(await candidate(i, ctx, true))
      candidates.sort((a, b) => Date.parse(a.since) - Date.parse(b.since))
      const chosen = candidates.filter((i) => !i.skip).slice(0, 6), voting = []
      for (const it of chosen) {
        if (!await fresh(it, ctx)) continue
        if (it.action === 'committee') { voting.push(it); continue }
        const previous = db.tasks[it.issueId]
        if (it.action === 'approval') {
          const ap = await get(`/api/approvals/${previous.approvalId}`)
          if (ap.status === 'pending') continue
          previous.stage = 'human'; save()
          if (ap.status === 'approved') { const why = await reassign({ ...it, count: previous.count, why: previous.why }, previous.target, ctx, true); if (why) await board(it, why) }
          else await board(it, '董事会未批准改派，停止自动操作')
          record(it, '审批跟进'); continue
        }
        const s = remember(it, 'human'); save()
        if (it.action === 'board' || it.action === 'human') {
          await board(it, it.action === 'human' ? '委员会处理后仍无动作，需要人工' : '等待授权或业务决定')
          s.stage = it.action === 'human' ? 'human' : 'board'
          s.boardAt = now()
        } else {
          const hours = Math.max(0, Math.floor((now() - Date.parse(it.since)) / 3600000))
          await note(it, `已阻塞超过 ${hours} 小时且没有未满足依赖，请重新核对前置条件后继续，或按格式写明阻塞类型、解除条件和下次检查时间。`)
          s.stage = 'remind'; s.reminders = it.reminders + 1
        }
        record(it, it.action)
      }
      await open(voting, ctx)
      db.lastAt = iso(); db.nextAt = now() + ROUND; save()
      return { ran: true, processed: chosen.length }
    } catch (e) { log(`[blocked] ${e.message}`); throw e } finally { busy = false }
  }
  return {
    preview, run: () => run(true), tick: () => run(false),
    start() { if (timer) return; timer = setInterval(() => { run(false).catch(() => {}) }, 60000); timer.unref() },
    view() {
      const b = db.batches.at(-1)
      return { enabled: db.enabled, lastAt: db.lastAt, nextAt: new Date(Math.max(db.nextAt, notBefore)).toISOString(), counts: Object.fromEntries(['remind', 'voting', 'committee', 'awaiting', 'board', 'human'].map((s) => [s, Object.values(db.tasks).filter((t) => t.stage === s).length])), tasks: Object.values(db.tasks).map(({ fingerprint, ...t }) => t), batch: b ? { ...b, items: b.items.map(({ fingerprint, ...it }) => ({ ...it, votes: Object.fromEntries(Object.entries(it.votes).map(([n, v]) => [n, v.v])) })) } : null, records: db.records.slice(-10).reverse() }
    },
  }
}
