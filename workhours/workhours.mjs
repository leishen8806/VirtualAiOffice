// 作息调度：上班时间之外把 agent 暂停，上班时仅恢复本程序暂停的 agent。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { onDuty, nextChange, localParts } from './schedule.mjs'
import { createLifecycleRepair } from './lifecycle-repair.mjs'
import { createAgentRecovery } from './agent-recovery.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100'
// 公司 ID：环境变量优先，其次部署目录上一级的 company-id.txt；导入时不因缺文件报错（测试与 CI 会注入 company）。
const COMPANY = process.env.PAPERCLIP_COMPANY_ID || (() => { try { return fs.readFileSync(path.join(HERE, '..', 'company-id.txt'), 'utf8').trim() } catch { return '' } })()
const CFG_FILE = path.join(HERE, 'workhours.json')
const STATE_FILE = path.join(HERE, 'workhours-state.json')
const LOG_FILE = path.join(HERE, 'workhours.log')

const dayKey = (date, cfg) => { const t = localParts(date, cfg.timezone); return `${t.y}-${String(t.mo).padStart(2, '0')}-${String(t.d).padStart(2, '0')}` }
const normalState = (state) => ({ pausedByUs: Array.isArray(state?.pausedByUs) ? [...new Set(state.pausedByUs)] : [], resumeRequested: state?.resumeRequested || {}, repairAttempts: state?.repairAttempts || {}, manualRepairDay: state?.manualRepairDay || {}, errorRecoveryAttempts: state?.errorRecoveryAttempts || {}, errorRecoveryManualDay: state?.errorRecoveryManualDay || {} })
const rows = (value) => Array.isArray(value) ? value : Array.isArray(value?.issues) ? value.issues : Array.isArray(value?.comments) ? value.comments : []
const minutesEarlier = (date, minutes) => new Date(date.getTime() - minutes * 60_000)

// Return the completed off-duty window immediately before the current on-duty period.
const previousOffDutyWindow = (cfg, now) => {
  let cursor = new Date(Math.floor(now.getTime() / 60_000) * 60_000)
  let i = 0
  for (; i < 8 * 24 * 60 && onDuty(cfg, cursor); i++) cursor = minutesEarlier(cursor, 1)
  if (onDuty(cfg, cursor)) return null
  const end = new Date(cursor.getTime() + 60_000)
  for (; i < 8 * 24 * 60 && !onDuty(cfg, cursor); i++) cursor = minutesEarlier(cursor, 1)
  if (!onDuty(cfg, cursor)) return null
  return { start: new Date(cursor.getTime() + 60_000), end }
}

const isSystemRecoveryBlock = (issue, comments, window) => {
  const blockedAt = Date.parse(issue?.blockedTransitionAt || '')
  if (!window || !Number.isFinite(blockedAt) || blockedAt < window.start.getTime() || blockedAt >= window.end.getTime()) return false
  return comments.some((comment) => {
    const commentAt = Date.parse(comment?.createdAt || '')
    return String(comment?.authorType || '').toLowerCase() === 'system'
      && /not invokable/i.test(String(comment?.body || ''))
      && Number.isFinite(commentAt)
      && Math.abs(commentAt - blockedAt) <= 5 * 60_000
  })
}

export function createWorkhours({ api = API, company = COMPANY, dryRun = process.argv.includes('--dry-run'), now = () => new Date(), fetchFn = fetch, loadCfg = () => JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')), loadState = () => { try { return normalState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))) } catch { return normalState() } }, saveState = (state) => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)), log = (msg) => { const line = `${now().toISOString()} ${msg}`; console.log(line); fs.appendFileSync(LOG_FILE, line + '\n') }, repair = createLifecycleRepair({ backupFile: path.join(HERE, 'backup-lifecycle-operation.jsonl'), now }), recoverErrors } = {}) {
  let lastMode = null
  recoverErrors ||= createAgentRecovery({ api, company, now, fetchFn, log })
  const call = async (method, target, body) => {
    const response = await fetchFn(api + target, { method, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${target} -> ${response.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }
  const remove = (state, id) => { state.pausedByUs = state.pausedByUs.filter((item) => item !== id); delete state.resumeRequested[id]; delete state.repairAttempts[id]; delete state.manualRepairDay[id] }
  const requestResume = async (agent, state, suffix = '') => {
    if (dryRun) { log(`演练：将会恢复 ${agent.name}${suffix}`); return }
    await call('POST', `/api/agents/${agent.id}/resume`)
    state.resumeRequested[agent.id] = { at: now().toISOString() }
    log(`上班：恢复 ${agent.name}${suffix}`)
  }
  const recoverOffDutyBlocks = async (cfg) => {
    const window = previousOffDutyWindow(cfg, now())
    if (!window) return
    const issues = rows(await call('GET', `/api/companies/${company}/issues?status=blocked&limit=100`)), candidates = []
    for (const issue of issues) {
      const detail = await call('GET', `/api/issues/${issue.id}`)
      // Missing dependency data is not evidence that there are no dependencies.
      if (!Array.isArray(detail?.blockedBy) || detail.blockedBy.length) continue
      const comments = rows(await call('GET', `/api/issues/${issue.id}/comments?order=desc&limit=20`))
      if (isSystemRecoveryBlock(detail, comments, window)) candidates.push(detail)
    }
    if (candidates.length > 30) { log(`ALERT blocked recovery found ${candidates.length} candidates; no cards changed`); return }
    for (const issue of candidates) {
      const status = Array.isArray(issue.executionPolicy?.stages) && issue.executionPolicy.stages.length ? 'in_review' : 'todo'
      if (dryRun) { log(`DRY blocked recovery ${issue.identifier || issue.id} -> ${status}`); continue }
      await call('PATCH', `/api/issues/${issue.id}`, { status, comment: 'Recovered from the off-duty system “not invokable” block; no dependency is recorded.' })
      log(`blocked recovery ${issue.identifier || issue.id} -> ${status}`)
    }
  }
  const tick = async ({ dutyOverride } = {}) => {
    const cfg = loadCfg(), duty = dutyOverride ?? onDuty(cfg, now()), state = normalState(loadState()), st = state, DRY = dryRun
    const agents = (await call('GET', `/api/companies/${company}/agents`)).filter((agent) => agent.status !== 'terminated')
    if (duty !== lastMode) { const t = localParts(now(), cfg.timezone), nc = nextChange(cfg, now()); log(`金边 ${String(t.h).padStart(2, '0')}:${String(t.mi).padStart(2, '0')} → ${duty ? '上班时间' : '下班时间'}；下一次切换 ${nc ? nc.at : '无'}`); lastMode = duty }
    if (duty) {
      for (const id of [...state.pausedByUs]) {
        const agent = agents.find((item) => item.id === id)
        if (!agent || agent.status !== 'paused') { remove(state, id); continue }
        if (!state.resumeRequested[id]) { await requestResume(agent, state); continue }
        if (agent.lifecycleState !== 'pausing') { await requestResume(agent, state, '（再次确认）'); continue }
        const today = dayKey(now(), cfg), attempt = state.repairAttempts[id]
        if (state.manualRepairDay[id] === today) continue
        if (attempt?.day === today && attempt.count >= 2) { state.manualRepairDay[id] = today; log(`需人工：${agent.name} 当天自动修复已达 2 次上限`); continue }
        let result
        try { result = await repair(agent, { dryRun, log }) } catch (error) {
          state.manualRepairDay[id] = today
          log(`需人工：${agent.name} 修复异常（${error?.code || 'unknown'}）`)
          continue
        }
        if (result.kind === 'repaired') { state.repairAttempts[id] = { day: today, count: (attempt?.day === today ? attempt.count : 0) + 1 }; continue }
        if (result.kind === 'pg-missing') { await requestResume(agent, state, '（pg 不可用，退回普通恢复）'); continue }
        if (result.kind === 'manual' || result.kind === 'rollback' || result.kind === 'changed') state.manualRepairDay[id] = today
      }
      await recoverErrors({ agents, state, dryRun, day: dayKey(now(), cfg) })
      try { await recoverOffDutyBlocks(cfg) } catch { log('blocked recovery scan failed; state will be saved and retried next tick') }
    } else {
      // 下班：空闲的 agent 暂停；正在跑的等它跑完；出错的不动（保留错误状态给人看）
      for (const a of agents) {
        if (a.status === 'paused' || a.status === 'error' || a.status === 'pending_approval') continue
        if (a.status === 'running') continue
        if (!DRY) await call('POST', `/api/agents/${a.id}/pause`)
        if (!st.pausedByUs.includes(a.id)) st.pausedByUs.push(a.id)
        log(`下班：暂停 ${a.name}${DRY ? '（演练，未执行）' : ''}`)
      }
    }
    if (!dryRun) saveState(state)
    return state
  }
  const loop = async () => { try { await tick() } catch (error) { log('出错：' + (error.message || error)) }; if (!process.argv.includes('--once')) setTimeout(loop, 60_000) }
  return { tick, loop, log }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!COMPANY) { console.error('作息调度无法启动：缺少 PAPERCLIP_COMPANY_ID 或上一级目录的 company-id.txt'); process.exit(1) }
  const app = createWorkhours()
  app.log(`作息调度启动${process.argv.includes('--dry-run') ? '（演练模式，不会暂停/恢复任何 agent）' : ''}`)
  app.loop()
}
