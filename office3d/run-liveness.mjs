import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CACHE_MS = 15_000
let cached = { at: 0, current: null, previous: null }
let pending = null

export function pidAlive(pid) {
  if (!pid) return null
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function descendantsOf(run, processTable) {
  if (!Array.isArray(processTable) || !run?.processPid) return []
  const startedAt = Date.parse(run.processStartedAt || run.startedAt || '')
  if (!Number.isFinite(startedAt)) return []
  const descendants = []
  const parents = [run.processPid]
  while (parents.length) {
    const parentPid = parents.shift()
    for (const processInfo of processTable) {
      if (processInfo.parentPid !== parentPid || Date.parse(processInfo.createdAt || '') < startedAt) continue
      descendants.push(processInfo)
      parents.push(processInfo.pid)
    }
  }
  return descendants
}

export function runAlive(run, processTable, checkPid = pidAlive) {
  if (checkPid(run && run.processPid)) return { alive: true, via: 'pid', descendants: [] }
  if (!Array.isArray(processTable)) return { alive: false, via: null, descendants: [] }
  const descendants = descendantsOf(run, processTable).map(({ pid, name }) => ({ pid, name }))
  return descendants.length ? { alive: true, via: 'descendant', descendants } : { alive: false, via: null, descendants: [] }
}

export function runBusy(run, previousTable, processTable) {
  if (!Array.isArray(previousTable) || !Array.isArray(processTable)) return { busy: false, busyName: null }
  const previousByIdentity = new Map(previousTable.map((p) => [`${p.pid}:${p.createdAt}`, p]))
  let busiest = null
  for (const processInfo of descendantsOf(run, processTable)) {
    if (String(processInfo.name).toLowerCase() === 'conhost.exe') continue
    const previous = previousByIdentity.get(`${processInfo.pid}:${processInfo.createdAt}`)
    const delta = Number(processInfo.cpuSeconds) - Number(previous?.cpuSeconds)
    if (!Number.isFinite(delta) || delta < 1 || (busiest && delta <= busiest.delta)) continue
    busiest = { delta, name: processInfo.name }
  }
  return busiest ? { busy: true, busyName: busiest.name } : { busy: false, busyName: null }
}

export function shouldBlockCancel(liveness) {
  return liveness && liveness.via === 'descendant'
}

export async function readProcessTable({ wait = true } = {}) {
  if (process.platform !== 'win32') return null
  if (Date.now() - cached.at < CACHE_MS) return cached.current
  if (!pending) pending = (async () => {
    try {
      const command = "Get-CimInstance Win32_Process | Select-Object @{Name='pid';Expression={$_.ProcessId}},@{Name='parentPid';Expression={$_.ParentProcessId}},@{Name='name';Expression={$_.Name}},@{Name='createdAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}},@{Name='cpuSeconds';Expression={[math]::Round((([double]$_.UserModeTime + [double]$_.KernelModeTime) / 10000000), 3)}} | ConvertTo-Json -Compress"
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 5000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
      const rows = JSON.parse(stdout || '[]')
      const current = (Array.isArray(rows) ? rows : [rows]).filter((row) => Number.isInteger(row.pid) && Number.isInteger(row.parentPid) && typeof row.name === 'string' && Number.isFinite(Date.parse(row.createdAt || '')) && Number.isFinite(Number(row.cpuSeconds)))
      cached = { at: Date.now(), previous: cached.current, current }
    } catch (error) {
      cached = { at: Date.now(), previous: cached.current, current: null }
      console.log('[run-liveness] process table unavailable: ' + String(error && error.message || error).slice(0, 160))
    } finally {
      pending = null
    }
    return cached.current
  })()
  return wait ? pending : cached.current
}

export async function readProcessTables(options) {
  await readProcessTable(options)
  return { previous: cached.previous, current: cached.current }
}
