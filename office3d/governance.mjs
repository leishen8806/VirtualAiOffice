const DAY = 86400000
const KINDS = ['standup', 'content', 'acceptance']

const list = (value, key) => Array.isArray(value) ? value : (value && Array.isArray(value[key]) ? value[key] : [])
const firstDate = (...values) => values.map((x) => Date.parse(x || '')).find(Number.isFinite) || 0
const text = (value, fallback = '') => String(value ?? fallback)
function votesOf(item) {
  const raw = item && item.votes && typeof item.votes === 'object' ? item.votes : {}
  return Object.entries(raw).map(([name, value]) => ({ name, v: typeof value === 'string' ? value.toUpperCase() : text(value?.v || value?.vote).toUpperCase(), why: typeof value === 'object' ? text(value.why) : '' }))
}
function expectedVoters(item, votes) {
  const declared = Array.isArray(item?.voters) ? item.voters : []
  const names = declared.length ? declared : votes.map((x) => x.name)
  return [...new Set([...names, ...votes.map((x) => x.name)])]
}
function tallyFor(item, votes, voters) {
  const tally = item?.tally && typeof item.tally === 'object' ? item.tally : {}
  const count = (kind) => Number.isFinite(Number(tally[kind])) ? Number(tally[kind]) : votes.filter((x) => x.v === kind.toUpperCase()).length
  const missing = Number.isFinite(Number(tally.missing)) ? Number(tally.missing) : voters.filter((name) => !votes.some((x) => x.name === name && x.v)).length
  return { approve: count('approve'), changes: count('changes'), escalate: count('escalate'), missing }
}
function normalizedItems(batch, kind) {
  const source = Array.isArray(batch?.items) ? batch.items : Array.isArray(batch?.candidates) ? batch.candidates : []
  return source.map((item, index) => {
    const votes = votesOf(item)
    const voters = expectedVoters(item, votes)
    const tally = tallyFor(item, votes, voters)
    const result = text(item.outcome || item.final || (kind === 'acceptance' ? item.result : null), kind === 'standup' ? 'SKIPPED' : kind === 'content' ? 'CHANGES' : 'SKIP').toUpperCase()
    return { id: item.issueId || item.path || item.ident || `${batch.id || 'batch'}-${index}`, title: text(item.title || item.ident || item.path, '未命名事项'), result, tally, votes: voters.map((name) => votes.find((x) => x.name === name) || { name, v: 'MISSING', why: '' }) }
  })
}
function event(kind, batch) {
  const at = firstDate(batch.tallyAt, batch.createdAt, batch.openedAt, batch.date)
  const items = normalizedItems(batch, kind)
  const outcome = batch.state === 'void' ? 'VOID' : (items[0]?.result || text(batch.state, '—').toUpperCase())
  return { kind, id: text(batch.id || batch.date || `${kind}-${at}`), at: at ? new Date(at).toISOString() : null, title: text(batch.title || (kind === 'standup' ? `晨会 ${batch.date || batch.id || ''}` : kind === 'content' ? `内容审批 ${batch.id || ''}` : `超时验收 ${batch.id || ''}`)), outcome, tally: items.reduce((out, item) => { for (const key of Object.keys(out)) out[key] += item.tally[key] || 0; return out }, { approve: 0, changes: 0, escalate: 0, missing: 0 }), items, state: text(batch.state), startedAt: firstDate(batch.openedAt, batch.createdAt, batch.date), tallyAt: firstDate(batch.tallyAt) }
}
// 「返工」分区（T13）：只从 createRework.view() 拿只读摘要，不改既有输出。超限 / 预警 / 其余（格式不全、同项重复）分组。
function reworkSection(view = {}) {
  const tasks = Array.isArray(view.tasks) ? view.tasks : []
  const pick = ({ issueId, ident, title, rounds, openItems, repeatedItems, kindLine, formatIssues, capped, warned, money, sentAt, notifiedAt, since, parsedAt }) => ({ issueId, ident, title, rounds, openItems, repeatedItems: repeatedItems || [], kindLine, formatIssues: formatIssues || [], capped: Boolean(capped), warned: Boolean(warned), money: Boolean(money), sentAt, notifiedAt, since, parsedAt })
  const capped = tasks.filter((t) => t.capped).map(pick)
  const warned = tasks.filter((t) => !t.capped && t.warned).map(pick)
  const info = tasks.filter((t) => !t.capped && !t.warned).map(pick) // 有返工记录但未到预警 / 超限；格式不全、同项重复也在这里
  return { enabled: Boolean(view.enabled), corrupt: Boolean(view.corrupt), thresholds: view.thresholds || {}, lastAt: view.lastAt || null, nextAt: view.nextAt || null, cappedCount: capped.length, warnCount: warned.length, capped, warned, info, records: (view.records || []).slice(0, 10) }
}
// 「版本核对」分区（T15）：只从 createEvidenceVersion.view() 拿只读摘要（enabled / corrupt / 近期待验收的核对结果），不改既有输出
function versionSection(view = {}) {
  const recent = Array.isArray(view.recent) ? view.recent : []
  const pick = ({ issueId, ident, title, result, note, evAt }) => ({ issueId: issueId || ident || null, ident: ident || issueId || null, title, result, note: note || '', evAt: evAt || null })
  return { enabled: Boolean(view.enabled), corrupt: Boolean(view.corrupt), recent: recent.map(pick) }
}
// 「交接」分区（T14）：只从 createHandoff.view() 拿只读摘要（enabled / corrupt / 缺交接包置顶 / 已转交 / 最近处理记录），不改既有输出
function handoffSection(view = {}) {
  const items = Array.isArray(view.items) ? view.items : []
  const pick = ({ issueId, ident, title, status, owner, ownerId, money, triggers, handoff, stale, remindedAt, notifiedAt, forwardedAt, handedFrom, parsedAt }) => ({
    issueId: issueId || null, ident: ident || null, title: title || '', status: status || null,
    owner: owner || null, ownerId: ownerId ?? null, money: Boolean(money),
    triggers: Array.isArray(triggers) ? triggers.map(({ type, label, at, detail }) => ({ type: type || null, label: label || null, at: at || null, detail: detail || '' })) : [],
    handoff: handoff && typeof handoff === 'object' ? { has: Boolean(handoff.has), complete: Boolean(handoff.complete), missing: Array.isArray(handoff.missing) ? handoff.missing : [], version: handoff.version || null, at: handoff.at || null } : null,
    stale: Boolean(stale), remindedAt: remindedAt || null, notifiedAt: notifiedAt || null, forwardedAt: forwardedAt || null, handedFrom: handedFrom ?? null, parsedAt: parsedAt || null,
  })
  const sorted = items.map(pick).sort((a, b) => Date.parse(a.parsedAt || a.handoff?.at || 0) - Date.parse(b.parsedAt || b.handoff?.at || 0)) // 缺交接包按触发后经过的时间排序（确认越早越靠前）
  const missing = sorted.filter((t) => !(t.handoff && t.handoff.complete))
  const forwarded = sorted.filter((t) => t.forwardedAt)
  return { enabled: Boolean(view.enabled), corrupt: Boolean(view.corrupt), lastAt: view.lastAt || null, nextAt: view.nextAt || null, missingCount: Number(view.missingCount ?? missing.length), forwardedCount: Number(view.forwardedCount ?? forwarded.length), missing, forwarded, records: (view.records || []).slice(0, 10) }
}
export function buildGovernance({ standup = {}, committee = {}, acceptance = {}, rework = {}, version = {}, handoff = {}, currentMembers = [], now = new Date(), days = 30 } = {}) {
  const current = new Date(now).getTime()
  const windowDays = Math.max(1, Math.min(90, Number(days) || 30))
  const events = [
    ...list(standup, 'days').map((x) => event('standup', x)),
    ...list(committee, 'batches').map((x) => event('content', x)),
    ...list(acceptance, 'batches').map((x) => event('acceptance', x)),
  ].filter((x) => !x.at || current - Date.parse(x.at) <= windowDays * DAY).sort((a, b) => (Date.parse(b.at || '') || 0) - (Date.parse(a.at || '') || 0))
  const activeNames = currentMembers.map((x) => typeof x === 'string' ? x : x?.name).filter(Boolean)
  const members = new Map(activeNames.map((name) => [name, { name, votes: 0, approve: 0, changes: 0, escalate: 0, missing: 0, active: true }]))
  const ensure = (name) => { if (!members.has(name)) members.set(name, { name, votes: 0, approve: 0, changes: 0, escalate: 0, missing: 0 }); return members.get(name) }
  for (const e of events) for (const item of e.items) for (const vote of item.votes) {
    const row = ensure(vote.name); row.votes++
    if (vote.v === 'APPROVE') row.approve++
    else if (vote.v === 'CHANGES') row.changes++
    else if (vote.v === 'ESCALATE') row.escalate++
    else row.missing++
  }
  const memberRows = [...members.values()].map((x) => ({ ...x, active: Boolean(x.active), status: x.active ? '现任' : '已卸任', escalateRate: x.votes ? x.escalate / x.votes : 0, missingRate: x.votes ? x.missing / x.votes : 0 }))
  const durations = events.map((x) => x.tallyAt && x.startedAt ? x.tallyAt - x.startedAt : 0).filter((x) => x >= 0)
  const count = (kind) => events.filter((x) => x.kind === kind).length
  const summary = { days: windowDays, standup: count('standup'), content: count('content'), acceptance: count('acceptance'), total: events.length, void: events.filter((x) => x.state === 'void').length, noVotes: events.filter((x) => x.tally.approve + x.tally.changes + x.tally.escalate === 0).length, averageMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000) : 0 }
  return { timeline: events.map(({ state, startedAt, tallyAt, ...x }) => x), members: memberRows, summary, rework: reworkSection(rework), version: versionSection(version), handoff: handoffSection(handoff) }
}
