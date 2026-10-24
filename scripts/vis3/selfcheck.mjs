// P-01/FIX4：自检。基线 exit0 且 mandatory.total>0；每个突变 exit1 且指定 check 为 false；
// unauthorized-port 命中网络类检查（office-blocked-zero）且计数服务器连接数=0。
import fs from 'node:fs'
import os from 'node:os'
import http from 'node:http'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.join(HERE, 'run.mjs')
const REPO = path.resolve(HERE, '..', '..')
const PW = process.env.VIS3_PLAYWRIGHT
if (!PW) { console.error('SELFCHECK_FAIL: 需要 VIS3_PLAYWRIGHT 指向可加载 playwright'); process.exit(1) }

const run = (mutate, out, extraEnv = {}) => {
  const cmd = ['node', RUN, '--repo', REPO, '--scene', 'office', '--out', out]
  if (mutate) cmd.push('--mutate', mutate)
  try { const r = execFileSync(process.execPath, cmd.slice(1), { env: { ...process.env, VIS3_PLAYWRIGHT: PW, ...extraEnv }, cwd: REPO, encoding: 'utf8', timeout: 300000 }); return { exit: 0, stdout: r } }
  catch (e) { return { exit: e.status ?? -1, stdout: e.stdout || '' } }
}
const readReport = (out) => { try { return JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) } catch { return null } }
const results = {}

// 1) 无突变基线
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-sc-'))
  const r = run(null, out)
  const rep = readReport(out)
  results.baseline = { exit: r.exit, mandatoryTotal: rep?.mandatory?.total ?? null }
}

// 2) dup-loop / runtime-error
const expectations = {
  'dup-loop': { check: 'office-no-duplicate-loop' },
  'runtime-error': { checkMatch: /no-runtime-errors/ },
}
for (const [mutate, exp] of Object.entries(expectations)) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-sc-'))
  const r = run(mutate, out)
  const rep = readReport(out)
  const checks = rep?.scenes?.office?.checks || []
  const hit = exp.check ? checks.find((c) => c.id === exp.check && c.ok === false) : checks.find((c) => exp.checkMatch.test(c.id) && c.ok === false)
  results[mutate] = { exit: r.exit, reportExists: Boolean(rep), hit: hit ? hit.id : null }
}

// 3) unauthorized-port：随机端口 + 连接计数；断言 0 连接且命中网络检查 office-blocked-zero
{
  const conn = { n: 0 }
  const srv = http.createServer((req, res) => { res.end('probe-received') })
  srv.on('connection', () => { conn.n++ })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const port = srv.address().port
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-sc-'))
  const r = run('unauthorized-port', out, { VIS3_PROBE_PORT: String(port) })
  srv.close()
  const rep = readReport(out)
  const checks = rep?.scenes?.office?.checks || []
  const hit = checks.find((c) => c.id === 'office-blocked-zero' && c.ok === false)
  results['unauthorized-port'] = { exit: r.exit, reportExists: Boolean(rep), hit: hit ? hit.id : null, probeConnections: conn.n }
}

const okBaseline = results.baseline.exit === 0 && (results.baseline.mandatoryTotal || 0) > 0
const okDup = results['dup-loop'].exit === 1 && results['dup-loop'].hit === 'office-no-duplicate-loop'
const okRuntime = results['runtime-error'].exit === 1 && Boolean(results['runtime-error'].hit)
const okUn = results['unauthorized-port'].exit === 1 && results['unauthorized-port'].probeConnections === 0 && results['unauthorized-port'].hit === 'office-blocked-zero'
results.verdict = okBaseline && okDup && okRuntime && okUn
results.checks = { okBaseline, okDup, okRuntime, okUn }
console.log(JSON.stringify(results, null, 2))
process.exit(results.verdict ? 0 : 1)
