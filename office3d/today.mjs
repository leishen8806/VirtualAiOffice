const TZ = 'Asia/Phnom_Penh'
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function dateParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value || ''
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date)
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday]
  return { date, key: `${get('year')}-${get('month')}-${get('day')}`, weekday: WEEKDAYS[weekdayIndex], weekdayIndex }
}

function inDay(value, day) {
  if (!value) return false
  try { return dateParts(value).key === day } catch { return false }
}

function countStatus(list, status) { return list.filter((item) => item.status === status).length }

export function computeToday({ now = new Date(), doneLedger = [], assigned = [], waiting = [], runsToday = {}, projects = [], duty = {} } = {}) {
  const current = dateParts(now)
  const doneRows = Array.isArray(doneLedger) ? doneLedger : []
  const done = doneRows.filter((row) => row.at ? inDay(row.at, current.key) : true).length
  const rows = Array.isArray(assigned) ? assigned : []
  const openRows = rows.filter((row) => ['todo', 'in_progress', 'in_review', 'blocked'].includes(row.status))
  const open = {
    inProgress: countStatus(openRows, 'in_progress'),
    inReview: countStatus(openRows, 'in_review'),
    blocked: countStatus(openRows, 'blocked'),
    todo: countStatus(openRows, 'todo'),
  }
  const totalOpen = open.inProgress + open.inReview + open.blocked + open.todo
  const total = done + totalOpen
  const byProject = new Map()
  const names = new Map((Array.isArray(projects) ? projects : []).map((project) => [project.id, project.name]))
  const ensure = (projectId) => {
    const id = projectId || null
    const key = id || '__unclassified__'
    if (!byProject.has(key)) byProject.set(key, { projectId: id, name: names.get(id) || (id ? '' : '未归类'), done: 0, total: 0 })
    return byProject.get(key)
  }
  for (const row of doneRows) if (!row.at || inDay(row.at, current.key)) { const project = ensure(row.projectId); project.done++; project.total++ }
  for (const row of openRows) { const project = ensure(row.projectId); project.total++ }
  const backlog = rows.filter((row) => row.status === 'backlog').length
  const byProjectList = [...byProject.values()].map((row) => ({ ...row, name: row.name || names.get(row.projectId) || '未归类' })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh'))
  const runs = runsToday.runs || {}
  const decisions = runsToday.decisions || {}
  return {
    date: current.key,
    weekday: current.weekday,
    onDuty: Boolean(duty && duty.on),
    dayOff: duty && Array.isArray(duty.days) ? !duty.days.includes(current.weekdayIndex) : current.weekday === '周日', // 以作息配置的上班日为准（没有配置才按周日休息）
    done,
    open: { ...open, total: totalOpen },
    total,
    percent: total ? done / total : 0,
    backlog,
    runs: { total: Number(runs.total) || 0, succeeded: Number(runs.succeeded) || 0, failed: Number(runs.failed) || 0 },
    comments: Number(runsToday.comments) || 0,
    decisions: { approved: Number(decisions.approved) || 0, rejected: Number(decisions.rejected) || 0 },
    byProject: byProjectList,
    since: runsToday.since || null,
    waiting: Array.isArray(waiting) ? waiting.length : 0,
  }
}
