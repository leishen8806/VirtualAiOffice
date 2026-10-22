// 大屏（领导视图）：把办公室的真实数据整理成「不操作也能看懂」的一页，并做脱敏。纯函数：不读文件、不发请求、无副作用。
//
// 数据全部来自 Paperclip 的真实记录（/state 聚合、任务列表、健康报告）和 roadmap.json（里程碑，董事会维护）。
// 不推算、不编造：「计划上线日期」就是里程碑表里最后一个里程碑的计划日；「预计」类字段不输出。
// 风险灯规则写在 RISK_RULES 里，页面可以直接展示，领导看得到判据。

const DAY = 86400000

// ── 脱敏：大屏会被拍照 / 外传，金额、地址、邮箱、疑似令牌一律打码；UUID 不动（页面要靠它对应同事）──
const URL_RE = /https?:\/\/[^\s)）]+/gi
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const SECRET_RE = /(?<![\w-])[A-Za-z0-9_]{32,}(?![\w-])/g
const MONEY_RE = /(?:US\$|\$|USD|KHR|¥|￥|៛)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:美元|美金|美刀|万元|元|riel|USD|KHR)/gi

export function redactText(s) {
  return String(s ?? '')
    .replace(URL_RE, '〔链接〕')
    .replace(EMAIL_RE, '〔邮箱〕')
    .replace(IP_RE, '〔地址〕')
    .replace(MONEY_RE, '〔金额〕')
    .replace(SECRET_RE, '〔密文〕')
}
export function redactDeep(v) {
  if (typeof v === 'string') return redactText(v)
  if (Array.isArray(v)) return v.map(redactDeep)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)]))
  return v
}
// 给「只带大屏令牌的设备」的 /state：去掉花费、Telegram、操作令牌、待审内容标题等，其余字符串逐个脱敏
export function redactState(state) {
  const s = JSON.parse(JSON.stringify(state || {}))
  for (const k of ['telegram', 'costs', 'actToken']) delete s[k]
  if (s.committee) { s.committee.pending = []; s.committee.batches = [] }
  return redactDeep(s)
}

// ── 里程碑 ──
export function milestoneView(roadmap, now = new Date()) {
  const t = now.getTime()
  return ((roadmap && roadmap.products) || []).map((p) => {
    const ms = (p.milestones || []).map((m) => {
      const due = Date.parse(m.due)
      const done = m.status === 'done' || m.status === 'waived'
      return { id: m.id, name: m.name, due: m.due, status: m.status || 'planned', note: m.note || '', evidence: m.evidence || '',
        daysLeft: Number.isFinite(due) ? Math.ceil((due - t) / DAY) : null, overdue: !done && Number.isFinite(due) && t > due }
    })
    const finished = ms.filter((m) => m.status === 'done' || m.status === 'waived').length
    const last = ms.length ? ms[ms.length - 1] : null
    const next = ms.find((m) => m.status !== 'done' && m.status !== 'waived') || null
    return { id: p.id, name: p.name, source: p.source || '', total: ms.length, finished, percent: ms.length ? finished / ms.length : 0, plannedLaunch: last ? last.due : null, next, milestones: ms }
  })
}

// ── 各项目整体进度（全部任务口径，不是「今天」口径）──
export function projectProgress(issues, projects) {
  const names = new Map((projects || []).map((p) => [p.id, p.name]))
  const m = new Map()
  for (const i of issues || []) {
    if (i.status === 'cancelled') continue
    const id = i.projectId || 'none'
    if (!m.has(id)) m.set(id, { projectId: i.projectId || null, name: names.get(i.projectId) || '未归类', done: 0, inProgress: 0, inReview: 0, blocked: 0, todo: 0, backlog: 0, total: 0 })
    const r = m.get(id)
    r.total++
    if (i.status === 'done') r.done++
    else if (i.status === 'in_progress') r.inProgress++
    else if (i.status === 'in_review') r.inReview++
    else if (i.status === 'blocked') r.blocked++
    else if (i.status === 'todo') r.todo++
    else r.backlog++
  }
  return [...m.values()].map((r) => ({ ...r, percent: r.total ? r.done / r.total : 0 })).sort((a, b) => b.total - a.total)
}

export const RISK_RULES = [
  '红：运行健康为「严重」；有里程碑已过计划日且未完成；阻塞任务 ≥ 8；等领导决定的事等了超过 24 小时；出错的同事 ≥ 3。',
  '黄：运行健康为「有问题」；阻塞任务 ≥ 3；等领导决定的事等了超过 4 小时；有同事出错。',
  '绿：以上都没有。阻塞多半是在等上游任务，不一定是出了故障。',
]

export function buildWall({ now = new Date(), state = {}, issues = [], roadmap = null, health = null, boardItems = [] }) {
  const today = state.today || {}
  const open = today.open || {}
  const nowMs = now.getTime()
  const projects = projectProgress(issues, state.projects)
  const agents = state.agents || []
  const erroring = agents.filter((a) => a.status === 'error').length

  // 等领导决定的事：待验收 / 待回答 / 没送达 + 待审批 + 待董事会提供（boardItems：阻塞类型为「待授权或业务决定」的任务，以及 roadmap.json 里登记且任务未结束的事项）
  const decisions = [
    ...(state.waiting || []).map((w) => ({ kind: w.kind, ident: w.id, title: w.title || '', since: w.since, projectId: w.projectId || null })),
    ...(boardItems || []).map((x) => ({ kind: x.kind || 'board', ident: x.ident || '', title: x.title || '', since: x.since || null, projectId: null })),
    ...(Array.isArray(state.approvals) ? state.approvals : []).map((a) => ({ kind: 'approval', ident: a.identifier || a.id || '', title: a.title || (a.payload && a.payload.title) || a.type || '审批', since: a.createdAt || a.at || null, projectId: null })),
  ].map((d) => ({ ...d, projectName: (projects.find((p) => p.projectId === d.projectId) || {}).name || '', ageMinutes: d.since ? Math.max(0, Math.round((nowMs - Date.parse(d.since)) / 60000)) : null }))
    .sort((a, b) => (b.ageMinutes ?? 0) - (a.ageMinutes ?? 0)).slice(0, 8)
  const oldest = decisions.reduce((m, d) => Math.max(m, d.ageMinutes ?? 0), 0)

  const milestones = milestoneView(roadmap, now)
  const overdue = milestones.flatMap((p) => p.milestones.filter((m) => m.overdue).map((m) => ({ product: p.name, ...m })))

  const risks = []
  const add = (level, title, detail) => risks.push({ level, title, detail })
  if (health && health.level === 'bad') add('red', '运行健康严重', health.text || '')
  else if (health && health.level === 'warn') add('yellow', '运行健康有问题', health.text || '')
  for (const m of overdue) add('red', `里程碑已过期：${m.product} · ${m.name}`, `计划 ${String(m.due).slice(0, 10)}${m.note ? '；' + m.note : ''}`)
  const blocked = open.blocked ?? 0
  if (blocked >= 8) add('red', `阻塞任务 ${blocked} 个`, '')
  else if (blocked >= 3) add('yellow', `阻塞任务 ${blocked} 个`, '多半在等上游任务')
  if (oldest > 1440) add('red', '有事等领导决定超过 24 小时', '')
  else if (oldest > 240) add('yellow', '有事等领导决定超过 4 小时', '')
  if (erroring >= 3) add('red', `${erroring} 位同事出错`, '')
  else if (erroring >= 1) add('yellow', `${erroring} 位同事出错`, '')
  const riskLevel = risks.some((r) => r.level === 'red') ? 'red' : risks.length ? 'yellow' : 'green'

  const sd = state.standup
  const cm = (state.committee && state.committee.batches && state.committee.batches[0]) || null
  const ac = state.acceptance
  const recentDone = (state.events || []).filter((e) => e.kind === 'report' && /已完成/.test(e.text || '')).slice(0, 6).map((e) => ({ at: e.at, text: e.text }))

  return redactDeep({
    at: now.toISOString(),
    scope: 'company',
    riskLevel, risks, rules: RISK_RULES,
    headline: {
      date: today.date || null, weekday: today.weekday || '', onDuty: Boolean(today.onDuty),
      doneToday: today.done ?? 0, openToday: open.total ?? 0, totalToday: today.total ?? 0, percentToday: today.percent ?? 0,
      inProgress: open.inProgress ?? 0, inReview: open.inReview ?? 0, blocked, backlog: today.backlog ?? 0,
      runs: today.runs || null, decisionsPending: decisions.length,
    },
    projects, decisions, milestones,
    highlights: {
      standup: sd ? { id: sd.id, state: sd.state, items: (sd.candidates || []).map((c) => ({ ident: c.ident, title: c.title, assignee: c.assignee, outcome: c.outcome })) } : null,
      acceptance: ac ? { id: ac.id, state: ac.state, items: (ac.items || []).map((i) => ({ ident: i.ident, title: i.title, outcome: i.outcome })) } : null,
      committee: cm ? { id: cm.id, state: cm.state, items: (cm.items || []).length } : null,
      recentDone,
    },
    health: health ? { level: health.level, text: health.text || '', incidents: (health.incidents || []).length, nextStandup: health.nextStandup || null } : null,
  })
}
