import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CACHE_MS = 15_000
let cached = { at: 0, table: null }
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

export function runAlive(run, processTable, checkPid = pidAlive) {
  if (checkPid(run && run.processPid)) return { alive: true, via: 'pid', descendants: [] }
  if (!Array.isArray(processTable)) return { alive: false, via: null, descendants: [] }

  const startedAt = Date.parse((run && (run.processStartedAt || run.startedAt)) || '')
  if (!Number.isFinite(startedAt)) return { alive: false, via: null, descendants: [] }
  const descendants = []
  const parents = [run.processPid]
  while (parents.length) {
    const parentPid = parents.shift()
    for (const processInfo of processTable) {
      if (processInfo.parentPid !== parentPid || Date.parse(processInfo.createdAt || '') < startedAt) continue
      descendants.push({ pid: processInfo.pid, name: processInfo.name })
      parents.push(processInfo.pid)
    }
  }
  return descendants.length ? { alive: true, via: 'descendant', descendants } : { alive: false, via: null, descendants: [] }
}

export function shouldBlockCancel(liveness) {
  return liveness && liveness.via === 'descendant'
}

export async function readProcessTable({ wait = true } = {}) {
  if (process.platform !== 'win32') return null
  if (Date.now() - cached.at < CACHE_MS) return cached.table
  if (!pending) pending = (async () => {
    try {
      const command = "Get-CimInstance Win32_Process | Select-Object @{Name='pid';Expression={$_.ProcessId}},@{Name='parentPid';Expression={$_.ParentProcessId}},@{Name='name';Expression={$_.Name}},@{Name='createdAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress"
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 5000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
      const rows = JSON.parse(stdout || '[]')
      cached = { at: Date.now(), table: (Array.isArray(rows) ? rows : [rows]).filter((row) => Number.isInteger(row.pid) && Number.isInteger(row.parentPid) && typeof row.name === 'string' && Number.isFinite(Date.parse(row.createdAt || ''))) }
    } catch (error) {
      cached = { at: Date.now(), table: null }
      console.log('[run-liveness] process table unavailable: ' + String(error && error.message || error).slice(0, 160))
    } finally {
      pending = null
    }
    return cached.table
  })()
  return wait ? pending : cached.table
}
