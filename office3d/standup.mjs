// 晨会（董事会 2026-10-17 决定）：每个工作日 8:35（金边时间）开会决定今天的主要工作，具体做什么由委员会投票决定。
//
// 流程（固定逻辑由这里的程序完成，不靠 agent 记性）：
//   8:35  程序建「晨会」汇总任务 + 一张「提议」任务给 Lead。Lead 只提议（从已有的待排期任务里挑，最多 8 项），**不自己派发**。
//   提议交付后  程序给 5 位委员（同内容审批委员会的成员）各开一张投票任务；每项三选一：APPROVE（今天做）/ CHANGES（今天不做或先改）/ ESCALATE（要董事会定）。
//   投完（或 30 分钟到点）  统计：≥3 票 APPROVE 且没有 ESCALATE → 通过，由程序派发；有人 ESCALATE、资金类 → 提董事会审批，批准后才派。
//   派发硬规则（沿用 Lead 的排期规则）：每天最多 5 个；每人同时最多 2 个未完成；暂停 / 出错 / 下班的人不派；资金类只能给 GoSenior / DBEngineer，并且必须董事会批准。
// 一票都没收到不会当成「全部不做」：作废并报警。
import fs from 'node:fs'
import path from 'node:path'
import { isChatSessionTask } from './chat.mjs'
import { MEMBERS } from './committee.mjs'

const PROJECT_NAME = '运营与知识库'
const LEAD = 'Lead'
const MAX_CANDIDATES = 8, DAILY_CAP = 5, PERSON_CAP = 2
const AT_MIN = 8 * 60 + 35 // 8:35
const MONEY_ROLES = ['GoSenior', 'DBEngineer']
export const MONEY_RE = /资金|账务|入账|提现|鉴权|IAM|迁移|密钥|ledger|withdraw|payout|migration|secret/i
const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const phnom = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), dow: p.weekday }
}
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function parseProposals(comments) { // PROPOSE 序号 | CMP-123 | 建议负责人 | 理由
  const out = new Map()
  for (const c of comments) for (const m of String(c.body || '').matchAll(/^\s*PROPOSE\s*(\d+)\s*[|｜]\s*(CMP-\d+)\s*[|｜]\s*([^|｜\n]*?)\s*[|｜]\s*(.*)$/gim)) out.set(m[2].toUpperCase(), { ident: m[2].toUpperCase(), who: m[3].trim(), why: clip(m[4], 160) })
  return [...out.values()].slice(0, MAX_CANDIDATES)
}
export function parseVotes(comments) {
  const votes = {}
  for (const c of comments) for (const m of String(c.body || '').matchAll(/^\s*VOTE\s*(\d+)\s*[:：]\s*(APPROVE|CHANGES|ESCALATE)\b\s*[|｜]?\s*(.*)$/gim)) votes[Number(m[1]) - 1] = { v: m[2].toUpperCase(), why: clip(m[3], 200) }
  return votes
}

export function createStandup({ dir, workhoursFile, company, get, send, notify, rework = () => false, log = console.log, staggerMs = 15000 }) {
  const FILE = path.join(dir, 'standup.json')
  let db = { days: [] }
  try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch {}
  const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1))
  let busy = false

  const workday = (dow) => { try { return (JSON.parse(fs.readFileSync(workhoursFile, 'utf8')).days || [1, 2, 3, 4, 5, 6]).includes(DOW[dow]) } catch { return dow !== 'Sun' } }
  const asList = (r) => (Array.isArray(r) ? r : r.issues || r.comments || [])
  const comments = async (id) => asList(await get(`/api/issues/${id}/comments`)).filter((c) => c.authorAgentId)

  async function ctx() {
    const agents = (await get(`/api/companies/${company}/agents`)).filter((a) => a.status !== 'terminated')
    const projects = asList(await get(`/api/companies/${company}/projects`))
    const proj = projects.find((p) => p.name === PROJECT_NAME)
    if (!proj) throw new Error(`找不到项目「${PROJECT_NAME}」`)
    return { agents, byName: new Map(agents.map((a) => [a.name, a])), byId: new Map(agents.map((a) => [a.id, a])), proj }
  }

  // ───── 1. 开会：建汇总任务 + 给 Lead 的提议任务 ─────
  async function open(manual = false) {
    const { date } = phnom()
    const exist = db.days.find((d) => d.date === date && !['void'].includes(d.state))
    if (exist && !manual) return { opened: false, reason: '今天已经开过晨会' }
    if (exist && manual && ['proposing', 'voting'].includes(exist.state)) return { opened: false, reason: '今天的晨会正在进行中' }
    const { byName, proj } = await ctx()
    const lead = byName.get(LEAD)
    if (!lead || lead.status === 'paused') { /* 出错状态的岗位有新任务照样能跑（额度恢复后自己好），只有暂停才不开 */ notify && notify(`⚠️ 晨会 ${date} 没开成：Lead ${lead ? '状态是 ' + lead.status : '不存在'}。`); log(`[standup] Lead 不可用，晨会没开`); return { opened: false, reason: `Lead 不可用（${lead ? lead.status : '不存在'}）` } }
    const id = exist ? `${date}-${db.days.filter((d) => d.date === date).length + 1}` : date
    const parent = await send('POST', `/api/companies/${company}/issues`, { title: `晨会 ${id}：今天的主要工作`, description: `8:35 晨会汇总记录（程序自动维护）：Lead 提议 → 5 位委员投票 → 通过的由程序派发。`, projectId: proj.id, status: 'backlog', priority: 'medium' })
    const desc = `现在是 ${date} 晨会。请你**只提议**今天的主要工作，不要自己派发、不要改任何任务的状态或负责人。\n\n【怎么选】\n1. 读 E:/VirtualAIOffice/knowledge/公司/目标与优先级.md（status 是 draft 时只能从**已有的待排期任务**里选，不新建方向）。\n2. 看看板：先考虑在途任务的下一步；再从「待排期（backlog）」里按优先级挑。依赖没完成、「开工前必须满足」的条件没满足的不要提。\n3. **每一项提议之前，先确认该任务的描述里已经有「任务契约」（目标、范围、验收项 AC-x 及证明方式、交付物、责任、停止条件；模板见知识库 流程/模板/任务契约.md）。没有就先在任务描述最前面补上，补不全就不要提。**\n4. 最多提 ${MAX_CANDIDATES} 项（最终每天最多派 ${DAILY_CAP} 个，每人同时最多 ${PERSON_CAP} 个）。暂停 / 出错的同事不要提给他们。\n5. 资金类（账务 / 提现 / 鉴权 / IAM / 迁移 / 密钥 / 入账队列）、花钱、动服务器、对外发布、新依赖也可以提，但在理由开头写「资金类」或「需董事会」，建议负责人写 GoSenior / DBEngineer（资金类只能是他们）。\n6. 不得提 KhmerX 的服务器操作（159.223.77.134 / 165.22.108.5）类任务给任何同事。\n\n【交付格式（程序按这个格式读取，格式不对按没提议算）】在本任务里发**一条评论**，每项一行，行首严格写：\nPROPOSE <序号> | <任务编号，如 CMP-123> | <建议负责人> | <一句话理由>\n例如：PROPOSE 1 | CMP-185 | BackendSenior | 压测报告已出，调优是下一步\n序号从 1 开始。如果确实没有合适的待排期任务，发一条「NONE | 原因」。然后把本任务标为已完成。\n看板上没有的事不要编。评论保持简短。`
    const leadIssue = await send('POST', `/api/companies/${company}/issues`, { title: `晨会 ${id} 提议：今天的主要工作`, description: desc, projectId: proj.id, assigneeAgentId: lead.id, status: 'todo', priority: 'high', parentId: parent.id })
    db.days.push({ id, date, manual, state: 'proposing', openedAt: new Date().toISOString(), parentId: parent.id, parentIdent: parent.identifier, leadIssueId: leadIssue.id, leadIdent: leadIssue.identifier, candidates: [], voteIssues: [] })
    save()
    log(`[standup] 晨会 ${id} 开始：提议任务 ${leadIssue.identifier} 已交给 Lead`)
    notify && notify(`☀️ 晨会 ${id} 开始：Lead 正在提议今天的主要工作，随后 5 位委员投票。`)
    return { opened: true, id }
  }

  // ───── 2. Lead 交了提议 → 校验候选 → 开投票 ─────
  async function startVoting(day) {
    const { byName, byId, proj } = await ctx()
    let cs = await comments(day.leadIssueId)
    if (day.retryAt) cs = cs.filter((c) => Date.parse(c.createdAt) > Date.parse(day.retryAt)) // 重提之后只看新评论，旧的不可用提议不再算
    const props = parseProposals(cs)
    if (!props.length) {
      const none = cs.map((c) => String(c.body || '').match(/^\s*NONE\s*[|｜]?\s*(.*)$/im)).find(Boolean)
      if (none) { day.state = 'void'; day.note = `Lead 说今天没有合适的待排期任务：${clip(none[1], 120)}`; save(); notify && notify(`ℹ️ 晨会 ${day.id}：Lead 认为今天没有合适的待排期任务（${clip(none[1], 80) || '未说明原因'}），没有派发。`); return true }
      return false
    }
    const all = asList(await get(`/api/companies/${company}/issues`))
    const byIdent = new Map(all.map((i) => [i.identifier, i]))
    const projNames = new Map(asList(await get(`/api/companies/${company}/projects`)).map((p) => [p.id, p.name]))
    const cands = [], dropped = []
    for (const p of props) {
      const iss = byIdent.get(p.ident)
      if (!iss) { dropped.push(`${p.ident}：看板上没有这个任务`); continue }
      if (isChatSessionTask(iss)) { dropped.push(`${p.ident}：对话会话任务`); continue }
      if (!['backlog', 'todo'].includes(iss.status)) { dropped.push(`${p.ident}：状态是 ${iss.status}，不能当作今天新开工的任务`); continue }
      try { if (rework(iss.id)) { dropped.push(`${p.ident}：返工超限，先等董事会处理`); continue } } catch (e) { log(`[standup] 读返工状态失败，按未超限处理：${e.message}`) }
      const cur = iss.assigneeAgentId ? byId.get(iss.assigneeAgentId) : null
      const who = byName.get(p.who) || cur // 委员会投票的就是 Lead 的提议，负责人以提议为准；提议的人不存在才沿用原负责人
      const money = MONEY_RE.test(`${iss.title}\n${iss.description || ''}\n${p.why}`) || /^(资金类|需董事会)/.test(p.why)
      if (!who) { dropped.push(`${p.ident}：建议负责人「${p.who}」不存在`); continue }
      if (['paused', 'error'].includes(who.status)) { dropped.push(`${p.ident}：负责人 ${who.name} 现在是 ${who.status}`); continue }
      if (money && !MONEY_ROLES.includes(who.name)) { dropped.push(`${p.ident}：资金类只能给 ${MONEY_ROLES.join(' / ')}`); continue }
      cands.push({ idx: cands.length, ident: p.ident, issueId: iss.id, title: clip(iss.title, 80), project: projNames.get(iss.projectId) || '—', assignee: who.name, assigneeId: who.id, why: p.why, money, votes: {} })
    }
    day.dropped = dropped
    if (!cands.length && !day.retried) { // 把真实原因交回 Lead 重提一次（不是直接放弃）
      day.retried = true; day.retryAt = new Date().toISOString(); day.openedAt = day.retryAt
      const why = dropped.map((x) => '- ' + x).join('\n')
      await send('POST', `/api/issues/${day.leadIssueId}/comments`, { body: `程序核对后，你的提议一项都不能用：\n${why}\n\n请重新提议：只能从「待排期（backlog）」或「todo」状态、依赖已满足的任务里选；已经阻塞 / 待验收 / 进行中的任务不能当作今天新开工的任务（它们在等上游或在评审中，不需要派发）。仍按 PROPOSE 格式发一条新评论，然后把任务标为已完成。如果确实没有合适的待排期任务，发一条「NONE | 原因」并标为已完成。` })
      await send('PATCH', `/api/issues/${day.leadIssueId}`, { status: 'todo' })
      save(); log(`[standup] 晨会 ${day.id}：提议一项都不可用，已把原因交回 Lead 重提一次`)
      notify && notify(`↩️ 晨会 ${day.id}：Lead 的提议一项都不能用，已把原因交回它重提一次。`)
      return true
    }
    if (!cands.length) { day.state = 'void'; day.note = `提议里没有一项有效：${dropped.join('；')}`; save(); notify && notify(`⚠️ 晨会 ${day.id} 作废：Lead 的提议没有一项有效（${dropped.slice(0, 3).join('；') || '空'}）。`); return true }
    day.candidates = cands
    day.dueAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const deadline = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(day.dueAt))
    for (const m of MEMBERS) {
      const a = byName.get(m.name)
      if (!a) { log(`[standup] 找不到委员 ${m.name}，这一票按缺票算`); continue }
      const rules = `你是委员会的委员（${m.name}）。Lead 提议了今天的主要工作，请对下面每一项独立投票，**不要去看其他委员的投票任务**，也不要改任何任务。你的角度——${m.standup}\n\n\n\n【投票规则】每项三选一：APPROVE（今天做）/ CHANGES（今天不做，或要先改；写出原因）/ ESCALATE（要董事会决定：钱、安全、对外发布、不可逆、新依赖；不要用来逃避判断）。\n【交付格式（程序按这个格式统计，格式不对按缺票算）】在本任务里发**一条评论**，每项一行，行首严格写：\nVOTE <序号>: APPROVE|CHANGES|ESCALATE | 一句话理由\n然后把本任务标为已完成。截止 ${deadline}（金边时间），没投的按缺票算。需要看任务内容时，可以读那个任务的描述（只读）。只读；不得 push、不得读取任何密钥；不确定就如实写不确定。`
      // 规则和投票格式放最前面；候选的「Lead 的理由」按预算压缩，保证整段不超过 3600 字、不会把规则砍掉
      const budget = Math.max(300, 3400 - rules.length)
      const per = Math.max(120, Math.floor(budget / cands.length))
      const candText = cands.map((c, k) => { const lead = `${k + 1}. ${c.ident} ${c.title}｜项目：${c.project}｜建议负责人：${c.assignee}${c.money ? '｜资金类 / 需董事会' : ''}｜Lead 的理由：`; return lead + clip(c.why, Math.max(30, per - lead.length)) }).join('\n')
      const d = `${rules}\n\n【今天的候选】\n${candText}`
      const r = await send('POST', `/api/companies/${company}/issues`, { title: `晨会投票 ${day.id}：${m.name}（${cands.length} 项）`, description: d.slice(0, 3600), projectId: proj.id, assigneeAgentId: a.id, status: 'todo', priority: 'high', parentId: day.parentId })
      day.voteIssues.push({ name: m.name, issueId: r.id, ident: r.identifier })
      await new Promise((ok) => setTimeout(ok, staggerMs)) // 错开分派：同时建 git 工作树会抢锁
    }
    day.state = 'voting'; save()
    log(`[standup] 晨会 ${day.id}：${cands.length} 个候选，${day.voteIssues.length} 张投票任务`)
    notify && notify(`🗳️ 晨会 ${day.id}：Lead 提议了 ${cands.length} 项，委员正在投票（${deadline} 前）。`)
    return true
  }

  // ───── 3. 统计与派发 ─────
  async function collect(day) {
    let allDone = true
    for (const vi of day.voteIssues) {
      const iss = await get(`/api/issues/${vi.issueId}`)
      vi.status = iss.status
      if (!['done', 'cancelled'].includes(iss.status)) allDone = false
      const votes = parseVotes(await comments(vi.issueId))
      for (const [k, v] of Object.entries(votes)) if (day.candidates[k]) day.candidates[k].votes[vi.name] = v
    }
    return allDone && day.voteIssues.length === MEMBERS.length
  }
  async function dispatch(day, c, how) {
    const iss = await get(`/api/issues/${c.issueId}`)
    if (!['backlog', 'todo'].includes(iss.status)) return `状态已变成 ${iss.status}，没有派`
    const agent = await get(`/api/agents/${c.assigneeId}`)
    if (['paused', 'error', 'terminated'].includes(agent.status)) return `${c.assignee} 现在是 ${agent.status}，没有派`
    const open = asList(await get(`/api/companies/${company}/issues`)).filter((i) => i.assigneeAgentId === c.assigneeId && ['todo', 'in_progress', 'in_review', 'blocked'].includes(i.status) && i.id !== c.issueId)
    if (open.length >= PERSON_CAP) return `${c.assignee} 手上已有 ${open.length} 个未完成任务（上限 ${PERSON_CAP}），没有派`
    await send('POST', `/api/issues/${c.issueId}/comments`, { body: `晨会 ${day.id} 决定：今天做。${how}\nLead 的理由：${c.why}\n负责人：${c.assignee}。` })
    await send('PATCH', `/api/issues/${c.issueId}`, { assigneeAgentId: c.assigneeId, status: 'todo' })
    return ''
  }
  async function tally(day, reason, allFinished = false) {
    const { byName } = await ctx()
    if (!day.candidates.some((c) => Object.keys(c.votes).length)) {
      if (!day.extended && !allFinished) { day.extended = true; day.dueAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); save(); notify && notify(`⚠️ 晨会 ${day.id} 到了统计时间，但一张有效票都没收到，已延期 30 分钟。请看看委员是不是报错或没额度。`); return }
      day.state = 'void'; day.note = allFinished ? '5 张投票任务都交了，但没有一张按格式的有效票' : '延期后仍无票，作废'; save(); notify && notify(`⚠️ 晨会 ${day.id} ${allFinished ? '5 张投票任务都交了，但没有一张按格式的有效票' : '延期后仍没有任何投票'}，已作废；没有派发任何任务。可以在委员会页面点「现在开晨会」重开。`); return
    }
    const lines = []; let sent = 0
    for (const c of day.candidates) {
      const vs = MEMBERS.map((m) => ({ n: m.name, ...(c.votes[m.name] || { v: 'MISSING', why: '没有按格式投票（缺票）' }) }))
      const n = (k) => vs.filter((x) => x.v === k).length
      c.tally = { approve: n('APPROVE'), changes: n('CHANGES'), escalate: n('ESCALATE'), missing: n('MISSING') }
      const line = `${c.tally.approve} 通过 / ${c.tally.changes} 不做 / ${c.tally.escalate} 升级 / ${c.tally.missing} 缺票`
      const reasonsOf = (kinds) => vs.filter((x) => kinds.includes(x.v)).map((x) => `${x.n}：${x.why}`).join('；')
      if (c.tally.escalate > 0 || (c.tally.approve >= 3 && c.money)) {
        c.outcome = 'BOARD'
        const sec = byName.get(LEAD)
        const ap = await send('POST', `/api/companies/${company}/approvals`, { type: 'request_board_approval', requestedByAgentId: sec.id, issueIds: [c.issueId], payload: { title: `晨会：今天要不要做 ${c.ident}？`, summary: `${c.title}（${c.assignee}）\n委员会：${line}。${c.tally.escalate ? '升级理由：' + reasonsOf(['ESCALATE']) : '资金类，需要你批准才能开工。'}\n批准 = 今天派给 ${c.assignee} 开工；拒绝 = 今天不做。` } })
        c.approvalId = ap.id; c.awaiting = 'board'
      } else if (c.tally.approve >= 3) {
        if (sent >= DAILY_CAP) { c.outcome = 'FULL'; c.note = `今天已派满 ${DAILY_CAP} 个` }
        else { const why = await dispatch(day, c, `委员会 ${c.tally.approve}/5 通过。`); if (why) { c.outcome = 'SKIPPED'; c.note = why } else { c.outcome = 'DISPATCHED'; sent++; await new Promise((ok) => setTimeout(ok, staggerMs)) } } // 错开派发：同时建 git 工作树会抢 .git/config 锁
      } else { c.outcome = 'NOT_TODAY'; c.note = reasonsOf(['CHANGES', 'MISSING']) }
      lines.push(`${c.ident} ${c.outcome}（${line}${c.note ? '；' + clip(c.note, 60) : ''}）`)
    }
    day.tallyAt = new Date().toISOString(); day.tallyReason = reason
    day.state = day.candidates.some((c) => c.awaiting === 'board') ? 'awaiting' : 'done'
    save()
    if (day.state === 'done') await send('PATCH', `/api/issues/${day.parentId}`, { status: 'done' }).catch(() => {})
    const cnt = (o) => day.candidates.filter((c) => c.outcome === o).length
    notify && notify(`☀️ 晨会 ${day.id} 结果（${reason}）：今天派发 ${cnt('DISPATCHED')} 项${cnt('BOARD') ? `，${cnt('BOARD')} 项等你批准（在「等你处理」里）` : ''}${cnt('NOT_TODAY') ? `，${cnt('NOT_TODAY')} 项今天不做` : ''}${cnt('SKIPPED') + cnt('FULL') ? `，${cnt('SKIPPED') + cnt('FULL')} 项因名额 / 人手没派` : ''}。`)
    log(`[standup] 晨会 ${day.id} 统计：${lines.join(' | ')}`)
  }
  async function followBoard(day) { // 董事会批准 → 派；拒绝 → 记下
    for (const c of day.candidates) {
      if (c.awaiting !== 'board' || !c.approvalId) continue
      const ap = await get(`/api/approvals/${c.approvalId}`).catch(() => null)
      if (!ap || ap.status === 'pending') continue
      if (ap.status === 'approved') { const why = await dispatch(day, c, '董事会已批准。'); c.outcome = why ? 'SKIPPED' : 'DISPATCHED'; c.note = why; if (!why) await new Promise((ok) => setTimeout(ok, staggerMs)) } else { c.outcome = 'REJECTED'; c.note = '董事会没批准' }
      c.awaiting = null; save()
    }
    if (day.candidates.every((c) => !c.awaiting)) { day.state = 'done'; save(); await send('PATCH', `/api/issues/${day.parentId}`, { status: 'done' }).catch(() => {}) }
  }

  // ───── 每分钟一次的巡检 ─────
  async function tick() {
    if (busy) return
    busy = true
    try {
      const n = phnom()
      const today = db.days.filter((d) => d.date === n.date)
      if (workday(n.dow) && n.min >= AT_MIN && n.min < 12 * 60 && !today.length) await open(false)
      for (const day of db.days.filter((d) => ['proposing', 'voting', 'awaiting'].includes(d.state))) {
        if (day.state === 'proposing') {
          const iss = await get(`/api/issues/${day.leadIssueId}`)
          const late = Date.now() - Date.parse(day.openedAt) > 45 * 60 * 1000
          if (iss.status === 'done' || (iss.status === 'in_review')) { if (!(await startVoting(day)) && late) { day.state = 'void'; day.note = 'Lead 交了任务但没有按格式提议'; save(); notify && notify(`⚠️ 晨会 ${day.id} 作废：Lead 没有按 PROPOSE 格式交提议。`) } }
          else if (late) { day.state = 'void'; day.note = 'Lead 45 分钟没有交提议'; save(); notify && notify(`⚠️ 晨会 ${day.id} 作废：Lead 45 分钟内没有交提议（任务状态 ${iss.status}）。`) }
        } else if (day.state === 'voting') {
          const allDone = await collect(day).catch(() => false)
          if (allDone) await tally(day, '5 票到齐', true)
          else if (Date.now() >= Date.parse(day.dueAt)) await tally(day, '到了统计时间')
          else save()
        } else await followBoard(day)
      }
    } catch (e) { log(`[standup] 巡检出错：${e.message}`) } finally { busy = false }
  }

  const todayView = () => {
    const d = [...db.days].reverse().find((x) => x.date === phnom().date) || db.days[db.days.length - 1]
    if (!d) return null
    return { id: d.id, date: d.date, state: d.state, note: d.note || '', leadIdent: d.leadIdent, parentIdent: d.parentIdent, dueAt: d.dueAt || null, dropped: d.dropped || [], members: (d.voteIssues || []).map((v) => ({ name: v.name, ident: v.ident, status: v.status || 'todo' })), candidates: (d.candidates || []).map((c) => ({ votes: Object.fromEntries(Object.entries(c.votes || {}).map(([n, x]) => [n, x.v])), ident: c.ident, title: c.title, project: c.project, assignee: c.assignee, money: c.money, why: c.why, outcome: c.outcome || null, tally: c.tally || null, note: c.note || '' })) }
  }
  return {
    start() { setInterval(tick, 60 * 1000); setTimeout(tick, 20000) },
    tick,
    open: () => open(true),
    view: todayView,
    at: '08:35',
  }
}
