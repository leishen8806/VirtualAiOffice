// T9：金边上班日统计。窗口只含已结束的上班日，今天未结束的数据不参与增减判断。
// 出勤=上班时间实际观察到idle/running；paused/error/terminated单记不可用，未观察不是缺勤。
// 有产出=成功运行或完成；运行/完成/评论沿用stats，取消不算失败（复用T4）。
// 忙碌=真实起止区间与作息交集的并集，避免并发重复；缺时间戳为未知，利用率=忙碌/当日作息。
// 队列仅在08:30/17:00所在分钟实采，不补历史；等待只认明确todo事件与任务关联的首次运行。
// 返工按带【第N轮退回】的评论去重计数；阻塞比例=快照blocked/全部已派发任务。
import fs from 'node:fs'
import path from 'node:path'
import { isFailure } from './health.mjs'
import { redactText } from './wall.mjs'
import { localParts, onDuty } from '../workhours/schedule.mjs'

const DAY = 86400000, HOUR = 3600000
export const DEFAULT_THRESHOLDS = Object.freeze({ busyUtilization: .7, busyDayShare: .6, queueTodo: 3, queueDayShare: .5, waitMs: 4 * HOUR, successRate: .7, productiveDayShare: .2, lowUtilization: .05, failureRate: .3, blockedShare: .5, reworks: 3, unavailableDayShare: .5 })
const array = (v, key) => Array.isArray(v) ? v : v?.[key] || []
const dateKey = (ms) => new Date(Number(ms) + 7 * HOUR).toISOString().slice(0, 10)
const at = (day, time) => Date.parse(`${day}T${time}:00+07:00`)
const stamp = (v) => v ? Date.parse(v) : NaN
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2 : null }
const ratio = (a, b) => b ? a / b : null
export const confidence = (days) => days >= 14 ? '可用' : days >= 7 ? '参考' : '不足以判断'
const monetary = (a) => /GoSenior|DBEngineer|LedgerAuditor|SecurityReviewer|账务|账本|资金|支付|提现|ledger/i.test(`${a.name} ${a.title}`)
const dutyDay = (d, schedule) => schedule.days.includes(new Date(`${d}T12:00:00+07:00`).getUTCDay())
export function workdays(now, n, schedule) {
  const days = []
  for (let ms = at(dateKey(now), '00:00') - DAY, i = 0; days.length < n && i < 370; ms -= DAY, i++) { const d = dateKey(ms); if (dutyDay(d, schedule)) days.unshift(d) }
  return days
}
export function busyTime(runs, day, schedule) {
  const lo = at(day, schedule.start), hi = at(day, schedule.end), intervals = []
  let unknown = false
  for (const r of runs) {
    const start = stamp(r.startedAt), end = stamp(r.finishedAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) { if (validDate(r.at) && dateKey(stamp(r.at)) === day) unknown = true; continue }
    if (start < hi && end > lo) intervals.push([Math.max(lo, start), Math.min(hi, end)])
  }
  if (unknown) return null
  let total = 0, right = lo
  for (const [a, b] of intervals.sort((a, b) => a[0] - b[0])) { total += Math.max(0, b - Math.max(right, a)); right = Math.max(right, b) }
  return total
}
function validDate(v) { return Number.isFinite(stamp(v)) }
function thresholds(raw = {}) {
  const result = { ...DEFAULT_THRESHOLDS }
  for (const [k, v] of Object.entries(raw)) if (k in result && typeof v === 'number' && Number.isFinite(v) && v >= 0 && (k.endsWith('Ms') || ['queueTodo', 'reworks'].includes(k) || v <= 1)) result[k] = v
  return result
}
export function buildWorkload({ now = Date.now(), days = 14, ledger = {}, db = {}, schedule }) {
  const window = workdays(now, days === 7 ? 7 : 14, schedule), selected = new Set(window), t = thresholds(db.thresholds)
  const runs = Object.values(ledger.runs || {}).filter(r => validDate(r.at)), done = Object.values(ledger.done || {}).filter(r => validDate(r.at)), comments = Object.values(ledger.comments || {}).filter(r => validDate(r.at))
  const agents = Object.values(db.agents || {}), daily = {}
  const roles = agents.map(agent => {
    const mine = runs.filter(r => r.a === agent.id), myDone = done.filter(r => r.a === agent.id), myComments = comments.filter(r => r.a === agent.id)
    const rows = window.map(day => {
      const obs = db.observations?.[day]?.[agent.id], onDay = r => dateKey(stamp(r.at)) === day
      const rr = mine.filter(onDay), dd = myDone.filter(onDay), cc = myComments.filter(onDay)
      const observed = !!obs || rr.length > 0 || dd.length > 0 || cc.length > 0
      const available = !!obs?.available, unavailable = !!obs?.unavailable
      const busyMs = observed ? busyTime(mine, day, schedule) : null
      // 未观察出勤的无运行日不能叫空闲；暂停日也不能当作低利用率日。
      const utilization = busyMs === null || !available ? null : busyMs / (at(day, schedule.end) - at(day, schedule.start))
      const reworks = Object.values(db.reworks || {}).filter(r => r.agentId === agent.id && dateKey(stamp(r.at)) === day).length
      const row = { day, observed, available, unavailable, productive: rr.some(r => r.s === 'succeeded') || dd.length > 0, runs: rr.length, succeeded: rr.filter(r => r.s === 'succeeded').length, failed: rr.filter(r => r.s !== 'timed_out' && isFailure({ status: r.s, errorCode: r.errorCode })).length, timedOut: rr.filter(r => r.s === 'timed_out').length, cancelled: rr.filter(r => ['cancelled', 'canceled', 'interrupted'].includes(r.s)).length, done: dd.length, comments: cc.length, reworks, busyMs, utilization, queue: obs?.queue || {} }
      row.successRate = ratio(row.succeeded, row.succeeded + row.failed + row.timedOut)
      const queues = Object.values(row.queue)
      row.blockedShare = ratio(queues.reduce((s, q) => s + q.blocked, 0), queues.reduce((s, q) => s + q.total, 0))
      row.waitMs = median(Object.values(db.tasks || {}).filter(i => i.agentId === agent.id && validDate(i.todoAt) && validDate(i.firstRunAt) && dateKey(stamp(i.firstRunAt)) === day && stamp(i.firstRunAt) >= stamp(i.todoAt)).map(i => stamp(i.firstRunAt) - stamp(i.todoAt)))
      ;(daily[day] ||= {})[agent.id] = row
      return row
    })
    const observedDays = rows.filter(r => r.observed).length, availableDays = rows.filter(r => r.available).length
    const sum = key => rows.reduce((s, r) => s + r[key], 0)
    const endQueues = rows.map(r => r.queue.pm).filter(Boolean), allQueues = rows.flatMap(r => Object.values(r.queue))
    const snapshotDays = rows.filter(r => r.queue.am && r.queue.pm).length
    const waits = Object.values(db.tasks || {}).filter(i => i.agentId === agent.id && validDate(i.todoAt) && validDate(i.firstRunAt) && selected.has(dateKey(stamp(i.firstRunAt))) && stamp(i.firstRunAt) >= stamp(i.todoAt)).map(i => stamp(i.firstRunAt) - stamp(i.todoAt))
    const success = sum('succeeded'), failures = sum('failed') + sum('timedOut')
    const gaps = []
    if (observedDays < 14) gaps.push(`有效观察${observedDays}天，未观察不算缺勤`)
    if (rows.some(r => r.observed && r.busyMs === null)) gaps.push('运行起止时间缺失')
    if (rows.some(r => r.observed && !r.available && !r.unavailable)) gaps.push('历史出勤状态未知')
    if (snapshotDays < 7) gaps.push(`快照积累中（第 ${snapshotDays} 天）`)
    if (!waits.length) gaps.push('无完整todo→首次运行时间')
    if (!db.commentsComplete) gaps.push('返工评论扫描尚未完整')
    return { id: agent.id, name: agent.name, title: agent.title, function: agent.function, projects: agent.projects || [], money: monetary(agent), rows, observedDays, confidence: confidence(observedDays), attendanceObservedDays: rows.filter(r => db.observations?.[r.day]?.[agent.id]).length, availableDays, unavailableDays: rows.filter(r => r.unavailable).length, productiveDays: rows.filter(r => r.productive).length, runs: sum('runs'), succeeded: success, failed: sum('failed'), timedOut: sum('timedOut'), cancelled: sum('cancelled'), successRate: ratio(success, success + failures), failureRate: ratio(failures, success + failures), busyMs: !observedDays || rows.some(r => r.observed && r.busyMs === null) ? null : rows.reduce((s, r) => s + (r.busyMs || 0), 0), utilization: median(rows.map(r => r.utilization)), busyDayShare: ratio(rows.filter(r => r.utilization !== null && r.utilization >= t.busyUtilization).length, availableDays), utilizationDays: rows.filter(r => r.utilization !== null).length, done: sum('done'), comments: sum('comments'), reworks: sum('reworks'), snapshotDays, queue: endQueues.length ? endQueues[endQueues.length - 1].total : null, queueDayShare: ratio(endQueues.filter(q => q.todo >= t.queueTodo).length, endQueues.length), allQueuesZero: snapshotDays === window.length && allQueues.every(q => q.total === 0), waitMs: median(waits), blockedShare: ratio(allQueues.reduce((s, q) => s + q.blocked, 0), allQueues.reduce((s, q) => s + q.total, 0)), gaps }
  })
  const suggestions = []
  for (const r of roles) {
    const facts = { observedDays: r.observedDays, busyDayShare: r.busyDayShare, queueDayShare: r.queueDayShare, waitMs: r.waitMs, successRate: r.successRate, failureRate: r.failureRate, productiveDayShare: ratio(r.productiveDays, r.observedDays), utilization: r.utilization, blockedShare: r.blockedShare, reworks: r.reworks, unavailableDayShare: ratio(r.unavailableDays, r.observedDays), snapshotDays: r.snapshotDays }
    const add = (type, conditions, candidates = []) => suggestions.push({ id: r.id, name: r.name, type, confidence: r.confidence, window, conditions, facts, thresholds: t, gaps: r.gaps, candidates, boardApproval: r.money && type === '扩编' })
    const problem = (r.failureRate !== null && r.failureRate >= t.failureRate) || (r.blockedShare !== null && r.blockedShare >= t.blockedShare) || r.reworks >= t.reworks || (r.observedDays >= 7 && facts.unavailableDayShare >= t.unavailableDayShare)
    if (problem) { add('排查', ['失败率 / 阻塞占比 / 返工 / 不可用天比例命中至少一项；详见实测与阈值']); continue }
    if (r.observedDays < 7 || r.snapshotDays < 7) continue
    if (r.utilizationDays === r.availableDays && r.busyDayShare >= t.busyDayShare && (r.queueDayShare >= t.queueDayShare || (r.waitMs !== null && r.waitMs > t.waitMs)) && r.successRate !== null && r.successRate >= t.successRate) add('扩编', ['忙碌日占比达标', '队列或等待时长达标', '成功率达标'])
    const peers = roles.filter(p => p.id !== r.id && r.function && p.function === r.function && r.projects.some(id => p.projects.includes(id)))
    const candidates = peers.filter(p => p.availableDays > 0 && ['idle', 'running'].includes(db.agents[p.id]?.status))
    if (!r.money && r.observedDays >= 14 && facts.productiveDayShare <= t.productiveDayShare && r.utilizationDays === window.length && r.utilization !== null && r.utilization <= t.lowUtilization && r.allQueuesZero && peers.length && peers.every(p => p.allQueuesZero) && candidates.length) add('缩编 / 合并', ['有产出日占比低', '利用率中位数低', '本人及同职能同项目岗位全窗口队列均为0', '有可用承接岗位'], candidates.map(p => p.name))
  }
  return { enabled: db.enabled === true, window, thresholds: t, roles, daily, suggestions, notice: '建议仅供董事会决策，招聘 / 缩编需董事会批准', gaps: ['不回推历史出勤或队列；接口历史有截断风险', '当前进行中运行未结算；今天不参与窗口', '等待仅统计可确认todo事件与任务关联的首次运行，缺失不估算'], lastReport: db.lastReport || null }
}

export function createWorkload({ dir, company, get, stats, dutyOn, notify, now = Date.now, workhoursFile = path.join(dir, '..', 'workhours', 'workhours.json') }) {
  const file = path.join(dir, 'workload.json'), boot = now()
  let db, error = null, running = false, timer = null, delay = null, viewCache = null
  const empty = () => ({ enabled: false, thresholds: { ...DEFAULT_THRESHOLDS }, agents: {}, observations: {}, tasks: {}, reworks: {}, daily: {}, reports: {} })
  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid')
      for (const k of ['agents', 'observations', 'tasks', 'reworks', 'daily', 'reports']) if (raw[k] !== undefined && (!raw[k] || typeof raw[k] !== 'object' || Array.isArray(raw[k]))) throw new Error('invalid')
      db = { ...empty(), ...raw, enabled: raw.enabled === true }; error = null
    } catch (e) { db = empty(); error = e.code === 'ENOENT' ? null : 'workload.json 损坏，已按关闭的空账本处理；请人工检查备份' }
  }
  load()
  function schedule() {
    const s = JSON.parse(fs.readFileSync(workhoursFile, 'utf8'))
    if (!Array.isArray(s.days) || !s.days.length || s.timezone !== 'Asia/Phnom_Penh' || !/^\d\d:\d\d$/.test(s.start) || !/^\d\d:\d\d$/.test(s.end) || s.end <= s.start) throw new Error('作息配置不可用')
    return s
  }
  function save() {
    requireEnabled()
    const temp = `${file}.${process.pid}.tmp`
    try { fs.writeFileSync(temp, JSON.stringify(db), { flag: 'w' }); fs.renameSync(temp, file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }
  function requireEnabled() {
    let enabled = false
    try { enabled = JSON.parse(fs.readFileSync(file, 'utf8')).enabled === true } catch {}
    if (!enabled) throw new Error('总开关关闭，停止写入')
  }
  function reportView(days = 14) {
    if (!db.enabled) return { enabled: false, window: workdays(now(), days === 7 ? 7 : 14, schedule()), roles: [], suggestions: [], thresholds: thresholds(db.thresholds), notice: '建议仅供董事会决策，招聘 / 缩编需董事会批准', gaps: ['功能关闭，不聚合数据'], lastReport: db.lastReport || null, error }
    const l = stats()
    return { ...buildWorkload({ now: now(), days, ledger: { ...l, runs: { ...l.runs, ...db.timedRuns } }, db, schedule: schedule() }), error }
  }
  function view() {
    if (viewCache && now() - viewCache.at < 60000) return { ...viewCache.value }
    try {
      const r = reportView()
      const value = { enabled: db.enabled === true, effectiveDays: Math.max(0, ...r.roles.map(a => a.observedDays)), snapshotDays: Math.max(0, ...r.roles.map(a => a.snapshotDays)), suggestionCount: r.suggestions.length, lastReport: db.lastReport?.path || null, error }
      viewCache = { at: now(), value }
      return { ...value }
    } catch (e) { return { enabled: db.enabled === true, effectiveDays: 0, snapshotDays: 0, suggestionCount: 0, lastReport: null, error: e.message } }
  }
  async function collect() {
    const s = schedule(), current = now(), day = dateKey(current), time = localParts(new Date(current), s.timezone)
    const [aa, ii, rr] = await Promise.all([get(`/api/companies/${company}/agents`), get(`/api/companies/${company}/issues`), get(`/api/companies/${company}/heartbeat-runs?limit=1000`)])
    const agents = array(aa, 'agents'), issues = array(ii, 'issues'), runs = array(rr, 'runs')
    const ledger = stats()
    // 没人打开办公室时stats.ingest也可能没运行；直接保留GET得到的真实终态，不依赖页面轮询。
    db.timedRuns ||= {}
    for (const [id, run] of Object.entries(ledger.runs || {})) {
      const previous = db.timedRuns[id] || {}
      db.timedRuns[id] = { ...run, ...previous, startedAt: run.startedAt || previous.startedAt || null, finishedAt: run.finishedAt || previous.finishedAt || null }
    }
    for (const run of runs) if (['succeeded', 'failed', 'timed_out', 'cancelled'].includes(run.status)) db.timedRuns[run.id] = { a: run.agentId, s: run.status, at: run.finishedAt || run.updatedAt || run.createdAt, startedAt: run.startedAt || null, finishedAt: run.finishedAt || null, issueId: run.issueId || run.contextSnapshot?.issueId || run.context?.issueId || null, errorCode: run.errorCode || null }
    for (const agent of agents) {
      const assigned = issues.filter(i => i.assigneeAgentId === agent.id)
      db.agents[agent.id] = { id: agent.id, name: agent.name, title: agent.title || '', status: agent.status, function: String(agent.title || '').replace(/#?\d+|高级|初级/g, '').trim(), projects: [...new Set(assigned.map(i => i.projectId).filter(Boolean))] }
      if (!dutyDay(day, s)) continue
      if (dutyOn() && onDuty(s, new Date(current))) {
        const obs = ((db.observations[day] ||= {})[agent.id] ||= { available: false, unavailable: false, queue: {} })
        if (['idle', 'running'].includes(agent.status)) obs.available = true
        if (['paused', 'error', 'terminated'].includes(agent.status)) obs.unavailable = true
      }
      const slot = time.minutes === 510 ? 'am' : time.minutes === 1020 ? 'pm' : null
      if (slot) {
        const obs = ((db.observations[day] ||= {})[agent.id] ||= { available: false, unavailable: false, queue: {} })
        if (!obs.queue[slot]) {
          const active = assigned.filter(i => ['todo', 'in_progress', 'in_review', 'blocked'].includes(i.status))
          obs.queue[slot] = { at: new Date(current).toISOString(), total: active.length, todo: active.filter(i => i.status === 'todo').length, inProgress: active.filter(i => i.status === 'in_progress').length, inReview: active.filter(i => i.status === 'in_review').length, blocked: active.filter(i => i.status === 'blocked').length }
        }
      }
    }
    const todoEvents = Object.values(ledger.todoEvents || {})
    for (const issue of issues) {
      const previous = db.tasks[issue.id] || {}, associated = Object.values(ledger.runs || {}).filter(r => r.issueId === issue.id && validDate(r.startedAt))
      const times = [...associated.map(r => r.startedAt), ...runs.filter(r => (r.issueId || r.contextSnapshot?.issueId || r.context?.issueId) === issue.id && validDate(r.startedAt)).map(r => r.startedAt), previous.firstRunAt].filter(Boolean).sort()
      const events = todoEvents.filter(e => e.issueId === issue.id).map(e => e.at).filter(validDate).sort()
      db.tasks[issue.id] = { ...previous, agentId: issue.assigneeAgentId, todoAt: issue.todoAt || previous.todoAt || events[0] || null, firstRunAt: times[0] || null, updatedAt: issue.updatedAt }
    }
    const pending = issues.filter(i => db.tasks[i.id]?.commentsAt !== i.updatedAt)
    for (const issue of pending.slice(0, 20)) {
      const comments = array(await get(`/api/issues/${issue.id}/comments`), 'comments')
      for (const c of comments) if (/【第\s*\d+\s*轮退回】/.test(c.body || '') && validDate(c.createdAt)) db.reworks[`${issue.id}:${c.id}`] = { agentId: issue.assigneeAgentId, at: c.createdAt }
      db.tasks[issue.id].commentsAt = issue.updatedAt
    }
    db.commentsComplete = pending.length <= 20
    db.lastCollect = new Date(current).toISOString()
    const enriched = { ...ledger, runs: { ...ledger.runs, ...db.timedRuns } }
    const daily = buildWorkload({ now: current, ledger: enriched, db, schedule: s }).daily
    for (const [day, values] of Object.entries(daily)) db.daily[day] = values
    save()
  }
  function isoWeek(ms) {
    const d = new Date(dateKey(ms) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / DAY) + 1) / 7)).padStart(2, '0')}`
  }
  async function writeReport() {
    requireEnabled()
    const r = reportView(), week = isoWeek(now()), reportDir = path.join(dir, 'reports')
    fs.mkdirSync(reportDir, { recursive: true })
    const num = v => v === null || v === undefined ? '未知' : String(v)
    const pct = v => v === null || v === undefined ? '未知' : `${Math.round(v * 100)}%`
    const cell = v => redactText(String(v ?? '未知')).replace(/[|\r\n]/g, ' ')
    const lines = [`# 编制与工作量 ${week}`, r.notice, `窗口 ${r.window[0]} — ${r.window.at(-1)}；金边时间；仅已结束上班日`, '', '|岗位|出勤天|不可用天|有产出日|运行|成功率|利用率中位数|完成|评论|返工|队列|等待分钟|阻塞占比|可信度|', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...r.roles.map(a => `|${[a.name, a.attendanceObservedDays ? a.availableDays : '未知', a.attendanceObservedDays ? a.unavailableDays : '未知', a.productiveDays, `${a.runs}（成功${a.succeeded}/失败${a.failed}/超时${a.timedOut}/取消${a.cancelled}）`, pct(a.successRate), pct(a.utilization), a.done, a.comments, a.reworks, num(a.queue), a.waitMs === null ? '未知' : Math.round(a.waitMs / 60000), pct(a.blockedShare), a.confidence].map(cell).join('|')}|`), '', '## 建议与实测', ...r.suggestions.map(a => `${cell(a.name)}：${cell(a.type)} ${cell(a.confidence)} ${cell(JSON.stringify(a.facts))}；${cell(a.conditions.join('；'))}；承接${cell(a.candidates.join('、'))}${a.boardApproval ? '；需董事会审批' : ''}；缺口${cell(a.gaps.join('；'))}`), '', '## 阈值', JSON.stringify(r.thresholds), '', '## 数据缺口', ...r.gaps, ...r.roles.map(a => `${cell(a.name)}：${cell(a.gaps.join('；'))}`)]
    const body = lines.join('\n') + '\n'
    let target, suffix = 1
    for (;;) { target = path.join(reportDir, `workload-${week}${suffix === 1 ? '' : '-' + suffix}.md`); try { fs.writeFileSync(target, body, { flag: 'wx' }); break } catch (e) { if (e.code !== 'EEXIST') throw e; suffix++ } }
    const record = { path: target, at: new Date(now()).toISOString(), count: r.suggestions.length, notificationAttempted: true }
    db.reports[week] = record; db.lastReport = record
    // 先持久化提醒尝试，发送结果不确定也不重发，避免董事会收到重复通知。
    save()
    requireEnabled()
    try { await notify(`本周编制报告已生成\n${target}\n建议 ${record.count} 条`); record.notified = true } catch { record.notified = false }
    save()
    return record
  }
  async function tick({ manual = false } = {}) {
    if (running) return { skip: '统计正在处理' }
    load()
    if (!db.enabled) return { skip: '功能关闭', error }
    if (now() - boot < 120000) return { skip: '启动后延迟2分钟' }
    running = true
    try {
      if (manual) return await writeReport()
      const s = schedule(), p = localParts(new Date(now()), s.timezone)
      if (p.dow === 1 && p.minutes === 500 && !db.reports[isoWeek(now())]) await writeReport()
      if (dutyOn()) await collect()
      error = null
      return { ok: true }
    } catch (e) { error = '工作量统计未完成：' + redactText(e.message); return { error } }
    finally { running = false; viewCache = null }
  }
  function start() { if (delay || timer) return; delay = setTimeout(() => { delay = null; tick(); timer = setInterval(() => tick(), 60000); timer.unref() }, 120000); delay.unref() }
  function stop() { clearTimeout(delay); clearInterval(timer); delay = timer = null }
  return { start, stop, tick, report: () => tick({ manual: true }), view, reportView: days => { if (!running) load(); return reportView(days) } }
}
