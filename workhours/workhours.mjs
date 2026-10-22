// 作息调度：上班时间之外把 agent 暂停，上班时恢复（只恢复本程序暂停的那些）。
// 规则见 workhours.json（金边时间，每天 8:30–17:30）。
// 下班时正在运行的 agent 不打断：等它这一次运行结束再暂停（暂停会取消正在进行的运行，所以绝不在运行中暂停）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { onDuty, nextChange, localParts } from './schedule.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100'
const COMPANY = fs.readFileSync(path.join(HERE, '..', 'company-id.txt'), 'utf8').trim()
const CFG_FILE = path.join(HERE, 'workhours.json')
const STATE_FILE = path.join(HERE, 'workhours-state.json')
const LOG_FILE = path.join(HERE, 'workhours.log')
const DRY = process.argv.includes('--dry-run')

const loadCfg = () => JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'))
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { pausedByUs: [] } } }
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}
async function call(method, p, body) {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

let lastMode = null
async function tick() {
  const cfg = loadCfg()
  const duty = onDuty(cfg)
  const st = loadState()
  const agents = (await call('GET', `/api/companies/${COMPANY}/agents`)).filter((a) => a.status !== 'terminated')
  if (duty !== lastMode) {
    const t = localParts(new Date(), cfg.timezone)
    const nc = nextChange(cfg)
    log(`金边 ${String(t.h).padStart(2, '0')}:${String(t.mi).padStart(2, '0')} → ${duty ? '上班时间' : '下班时间'}；下一次切换 ${nc ? nc.at : '无'}`)
    lastMode = duty
  }
  if (duty) {
    // 上班：恢复本程序暂停过的 agent
    for (const id of [...st.pausedByUs]) {
      const a = agents.find((x) => x.id === id)
      if (!a) { st.pausedByUs = st.pausedByUs.filter((x) => x !== id); continue }
      if (a.status !== 'paused') { st.pausedByUs = st.pausedByUs.filter((x) => x !== id); continue } // 已被人手动恢复
      if (!DRY) await call('POST', `/api/agents/${id}/resume`)
      st.pausedByUs = st.pausedByUs.filter((x) => x !== id)
      log(`上班：恢复 ${a.name}`)
    }
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
  if (!DRY) saveState(st)
}

async function loop() {
  try { await tick() } catch (e) { log('出错：' + (e.message || e)) }
  if (process.argv.includes('--once')) return
  setTimeout(loop, 60_000)
}
log(`作息调度启动${DRY ? '（演练模式，不会暂停/恢复任何 agent）' : ''}`)
loop()
