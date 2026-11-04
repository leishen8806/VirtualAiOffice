import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createSnapshotGet } from '../state-last-good.mjs'

const exec = promisify(execFile)
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith('--') ? [value.slice(2), all[index + 1]] : []).filter(Boolean))
const root = path.resolve(args.root || process.cwd())
const out = path.resolve(args.out || path.join(root, 'server-load-r3.json'))
const minutes = Number(args.minutes || 40)
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes must be positive')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const json = value => JSON.stringify(value)
const agents = Array.from({ length: 30 }, (_, n) => ({ id: `agent-${n}`, name: `Agent ${n}`, status: 'working' }))
const issues = Array.from({ length: 24 }, (_, n) => ({ id: `issue-${n}`, identifier: `CMP-${n}`, status: n % 5 ? 'in_progress' : 'blocked', title: `Synthetic ${n}`, updatedAt: '2026-11-04T00:00:00.000Z' }))
const runs = Array.from({ length: 1000 }, (_, n) => ({ id: `run-${n}`, agentId: `agent-${n % 30}`, issueId: `issue-${n % 24}`, status: n % 19 ? 'succeeded' : 'failed', createdAt: new Date(Date.now() - n * 60000).toISOString(), updatedAt: new Date(Date.now() - n * 60000).toISOString(), finishedAt: new Date(Date.now() - n * 60000).toISOString(), errorCode: n % 19 ? null : 'upstream' }))
const fit = (rows, target) => {
  const copy = structuredClone(rows), base = Buffer.byteLength(json(copy))
  if (base < target) copy[0].fixturePadding = 'x'.repeat(Math.max(0, target - base - 22))
  return copy
}
const fullRunRows = runs.map(run => ({ ...run, resultJson: { text: 'result '.repeat(250) }, logRefs: ['log '.repeat(120)], usageJson: { inputTokens: 10000, outputTokens: 500 } }))
const summaryRunRows = runs.map(run => ({ ...run, resultJson: null, logRefs: null, usageJson: null }))
const requests = []
const api = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://stub')
  let body = [], delay = 10
  if (url.pathname.endsWith('/agents')) body = agents
  else if (url.pathname.endsWith('/projects')) body = [{ id: 'project-1', name: 'Synthetic', status: 'active' }]
  else if (url.pathname.endsWith('/dashboard')) body = { tasks: { total: 24, done: 3 }, costs: { total: 0 } }
  else if (url.pathname.endsWith('/issues')) { body = fit(issues, url.searchParams.has('status') ? 73728 : 2169509); delay = url.searchParams.has('status') ? 290 : 320 }
  else if (url.pathname.endsWith('/heartbeat-runs')) {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 1000, 1000)
    const summary = url.searchParams.get('summary') === 'true'
    body = fit((summary ? summaryRunRows : fullRunRows).slice(0, limit), limit === 1000 ? (summary ? 1729059 : 4114038) : (summary ? 157696 : 161435))
    delay = limit === 1000 ? (summary ? 3400 : 4000) : 550
  } else if (url.pathname.includes('/comments')) body = []
  else if (url.pathname.endsWith('/activity') || url.pathname.endsWith('/approvals')) body = []
  await sleep(delay)
  const payload = json(body), bytes = Buffer.byteLength(payload)
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': bytes }).end(payload)
  requests.push({ at: new Date().toISOString(), path: url.pathname + url.search, bytes, elapsedMs: delay })
})
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
const apiPort = api.address().port
const officePort = 33991
const sha = (await exec('git', ['-C', root, 'rev-parse', 'HEAD'])).stdout.trim()
const companyFile = path.join(root, 'company-id.txt')
let syntheticCompanyFile = false
try { await fs.access(companyFile) } catch { await fs.writeFile(companyFile, 'synthetic-company\n'); syntheticCompanyFile = true }
const child = spawn(process.execPath, ['office3d/server.mjs'], { cwd: root, env: { ...process.env, PAPERCLIP_API_URL: `http://127.0.0.1:${apiPort}`, OFFICE3D_PORT: String(officePort), OFFICE3D_LOAD_METRICS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
const readyBy = Date.now() + 30000
while (!output.includes('办公室 3D:')) {
  if (Date.now() > readyBy) throw new Error(`server did not start: ${output.slice(-500)}`)
  await sleep(100)
}
const samples = [], started = Date.now(), durationMs = minutes * 60000
try {
  while (Date.now() - started < durationMs) {
    const t0 = performance.now()
    const state = await fetch(`http://127.0.0.1:${officePort}/state`)
    await state.arrayBuffer()
    let rss = null
    try { rss = Number((await exec('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${child.pid}).WorkingSet64`])).stdout.trim()) } catch {}
    samples.push({ at: new Date().toISOString(), state: state.status, stateElapsedMs: Math.round(performance.now() - t0), rssBytes: rss })
    await sleep(5000)
  }
} finally {
  child.kill('SIGTERM')
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(6000)])
  await new Promise(resolve => api.close(resolve))
  if (syntheticCompanyFile) await fs.unlink(companyFile).catch(() => {})
}
const metrics = output.split(/\r?\n/).filter(line => line.startsWith('[load-metrics]')).map(line => { try { return JSON.parse(line.slice('[load-metrics]'.length).trim()) } catch { return null } }).filter(Boolean)
const periodic = requests.filter(row => Date.parse(row.at) - started > 5 * 60000 && (row.bytes > 1000000 || row.elapsedMs > 1000))
const rss = samples.map(row => row.rssBytes).filter(Number.isFinite)
const measure = (fn, count = 5) => {
  const before = process.memoryUsage().heapUsed, cpuBefore = process.cpuUsage(), t0 = performance.now()
  for (let i = 0; i < count; i++) fn()
  const cpu = process.cpuUsage(cpuBefore)
  return { count, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system, heapDeltaBytes: process.memoryUsage().heapUsed - before }
}
const cloneBenchmark = async () => {
  const runsPayload = fit(fullRunRows, 4114038), issuesPayload = fit(issues, 2169509), shared = createSnapshotGet({ get: async p => p.includes('heartbeat-runs') ? runsPayload : issuesPayload })
  const runsGet = shared.forModule('load-benchmark'), issuesGet = shared.forModule('load-benchmark')
  await runsGet('/api/companies/demo/heartbeat-runs?limit=1000&summary=false')
  await issuesGet('/api/companies/demo/issues')
  return { payloadBytes: { runs: Buffer.byteLength(json(runsPayload)), issues: Buffer.byteLength(json(issuesPayload)) }, structuredClone: { runs: measure(() => structuredClone(runsPayload)), issues: measure(() => structuredClone(issuesPayload)) }, sharedRead: { runs: await (async () => { const t0 = performance.now(); const cpuBefore = process.cpuUsage(); const before = process.memoryUsage().heapUsed; for (let i = 0; i < 5; i++) await runsGet('/api/companies/demo/heartbeat-runs?limit=1000&summary=false'); const cpu = process.cpuUsage(cpuBefore); return { count: 5, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system, heapDeltaBytes: process.memoryUsage().heapUsed - before } })(), issues: await (async () => { const t0 = performance.now(); const cpuBefore = process.cpuUsage(); const before = process.memoryUsage().heapUsed; for (let i = 0; i < 5; i++) await issuesGet('/api/companies/demo/issues'); const cpu = process.cpuUsage(cpuBefore); return { count: 5, elapsedMs: Math.round((performance.now() - t0) * 100) / 100, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system, heapDeltaBytes: process.memoryUsage().heapUsed - before } })() } }
}
const cloneCost = await cloneBenchmark()
const report = { codeSha: sha, fixture: { realPayloadTargets: { runs1000: { fullBytes: 4114038, summaryBytes: 1729059, fullMs: 4000, summaryMs: 3400 }, issuesUnfilteredBytes: 2169509 }, noPaperclipWrites: true }, startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(), minutes, samples, metrics, cloneCost, requests, summary: { totalBytes: requests.reduce((sum, row) => sum + row.bytes, 0), periodicLargeRequests: periodic.length, commentRequests: requests.filter(row => row.path.includes('/comments')).length, rssRangeBytes: rss.length ? Math.max(...rss) - Math.min(...rss) : null, metricsSamples: metrics.length, gcCount: metrics.at(-1)?.gcCount ?? null, moduleLog: output.split(/\r?\n/).filter(line => line.startsWith('[snapshot]')) } }
await fs.mkdir(path.dirname(out), { recursive: true })
await fs.writeFile(out, json(report) + '\n')
console.log(json(report.summary))
