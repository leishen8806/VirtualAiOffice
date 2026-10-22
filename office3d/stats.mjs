// 真实统计：每日战报、本周之星。数据全部来自 Paperclip（运行记录、活动流、已完成任务），
// 本地记一本账（stats.json），因为 Paperclip 接口只返回最近一段（运行约 120 条、活动 500 条）。
// 统计从账本里最早的一条开始算，页面会写明「统计自 …」。
import fs from 'node:fs'
import path from 'node:path'

const TZ = 'Asia/Phnom_Penh'
const localDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

export function createStats({ dir, get, company }) {
  const FILE = path.join(dir, 'stats.json')
  let L = { runs: {}, done: {}, comments: {}, decisions: {}, since: null }
  try { L = { ...L, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch {}
  let dirty = false
  const note = (iso) => { if (iso && (!L.since || iso < L.since)) L.since = iso }

  function ingest({ runs = [], activity = [] }) {
    for (const r of runs) {
      if (!['succeeded', 'failed', 'timed_out', 'cancelled'].includes(r.status)) continue
      const extra = { startedAt: r.startedAt || null, finishedAt: r.finishedAt || null, issueId: r.issueId || r.contextSnapshot?.issueId || r.context?.issueId || null, errorCode: r.errorCode || null }
      if (L.runs[r.id] && L.runs[r.id].s === r.status && Object.entries(extra).every(([k, v]) => L.runs[r.id][k] === v)) continue
      if (L.runs[r.id]?.s === r.status) Object.assign(L.runs[r.id], extra)
      else L.runs[r.id] = { a: r.agentId, s: r.status, at: r.finishedAt || r.updatedAt || r.createdAt, ...extra }
      note(r.createdAt); dirty = true
    }
    for (const e of activity) {
      if (e.entityType === 'issue' && e.details?.status === 'todo' && e.entityId && e.createdAt) {
        L.todoEvents ||= {}
        if (!L.todoEvents[e.id]) { L.todoEvents[e.id] = { issueId: e.entityId, at: e.createdAt }; dirty = true }
      }
      if (e.action === 'issue.comment_added' && e.actorType === 'agent' && !L.comments[e.id]) { L.comments[e.id] = { a: e.agentId, at: e.createdAt }; note(e.createdAt); dirty = true }
      if ((e.action === 'approval.approved' || e.action === 'approval.rejected') && e.actorType === 'user' && !L.decisions[e.id]) { L.decisions[e.id] = { d: e.action.split('.')[1], at: e.createdAt }; note(e.createdAt); dirty = true }
    }
  }
  async function refreshDone() {
    try {
      const r = await get(`/api/companies/${company}/issues?status=done`)
      for (const i of Array.isArray(r) ? r : r.issues || []) {
        if (L.done[i.id]) continue
        L.done[i.id] = { a: i.assigneeAgentId || null, at: i.completedAt || i.updatedAt, ident: i.identifier, title: i.title, projectId: i.projectId || null }
        note(i.completedAt || i.updatedAt); dirty = true
      }
    } catch {}
  }
  async function seed() {
    try { ingest({ runs: await get(`/api/companies/${company}/heartbeat-runs?limit=1000`) }) } catch {}
    await refreshDone()
  }
  seed()
  setInterval(refreshDone, 10 * 60 * 1000)
  setInterval(() => { if (dirty) { dirty = false; try { fs.writeFileSync(FILE, JSON.stringify(L)) } catch {} } }, 60 * 1000)

  const within = (iso, from, to) => iso && iso >= from && iso < to
  function daily(dateStr = localDate(new Date().toISOString()), names = {}) {
    const onDay = (iso) => iso && localDate(iso) === dateStr
    const runs = Object.values(L.runs).filter((r) => onDay(r.at))
    const done = Object.values(L.done).filter((d) => onDay(d.at))
    const comments = Object.values(L.comments).filter((c) => onDay(c.at))
    const decisions = Object.values(L.decisions).filter((d) => onDay(d.at))
    const count = (list) => { const m = {}; for (const x of list) if (x.a) m[x.a] = (m[x.a] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]) }
    const busiest = count(runs)[0], talker = count(comments)[0], doer = count(done)[0]
    return {
      date: dateStr, since: L.since,
      runs: { total: runs.length, succeeded: runs.filter((r) => r.s === 'succeeded').length, failed: runs.filter((r) => r.s === 'failed' || r.s === 'timed_out').length },
      done: done.map((d) => ({ ident: d.ident, title: d.title, agentId: d.a, projectId: d.projectId || null })),
      comments: comments.length,
      decisions: { approved: decisions.filter((d) => d.d === 'approved').length, rejected: decisions.filter((d) => d.d === 'rejected').length },
      busiest: busiest ? { agentId: busiest[0], n: busiest[1] } : null,
      talker: talker ? { agentId: talker[0], n: talker[1] } : null,
      doer: doer ? { agentId: doer[0], n: doer[1] } : null,
    }
  }
  // 本周之星：最近 7 天滚动统计
  function awards() {
    const to = new Date().toISOString(), from = new Date(Date.now() - 7 * 86400000).toISOString()
    const tally = (list, f = () => true) => { const m = {}; for (const x of list) if (x.a && within(x.at, from, to) && f(x)) m[x.a] = (m[x.a] || 0) + 1; return m }
    const best = (m, min) => { const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e && e[1] >= min ? { agentId: e[0], n: e[1] } : null }
    const out = []
    const d = best(tally(Object.values(L.done)), 1)
    if (d) out.push({ key: 'done', label: '完成之星', detail: `7 天完成 ${d.n} 个任务`, ...d })
    const ok = tally(Object.values(L.runs), (r) => r.s === 'succeeded'), bad = tally(Object.values(L.runs), (r) => r.s === 'failed' || r.s === 'timed_out')
    const steady = best(Object.fromEntries(Object.entries(ok).filter(([a]) => !bad[a])), 3)
    if (steady) out.push({ key: 'steady', label: '稳定之星', detail: `7 天 ${steady.n} 次运行全部成功`, ...steady })
    const t = best(tally(Object.values(L.comments)), 3)
    if (t) out.push({ key: 'talk', label: '沟通之星', detail: `7 天发了 ${t.n} 条任务评论`, ...t })
    return { since: L.since, list: out }
  }
  return { ingest, daily, awards, snapshot: () => structuredClone(L) }
}
