// VIS3 框架自检：突变必须让强制检查变红；未授权端口 POST 必须在传输前被阻断。
import http from 'node:http'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.join(HERE, 'run.mjs')
const PW = '/Users/suchen/Desktop/Niuma/node_modules/playwright'
const REPO = path.resolve(HERE, '..', '..')
const run = (mutate, out) => {
  const cmd = ['node', RUN, '--repo', REPO, '--scene', 'office', '--out', out]
  if (mutate) cmd.push('--mutate', mutate)
  try { const r = execFileSync(process.execPath, cmd.slice(1), { env: { ...process.env, VIS3_PLAYWRIGHT: PW }, cwd: REPO, encoding: 'utf8', timeout: 300000 }); return { exit: 0, stdout: r } }
  catch (e) { return { exit: e.status ?? -1, stdout: e.stdout || '' } }
}
const results = {}
for (const mutate of ['dup-loop', 'runtime-error']) {
  const out = `/tmp/vis3/mut-${mutate}`
  const r = run(mutate, out)
  let failedCheck = ''
  try { const rep = JSON.parse(require('node:fs').readFileSync(path.join(out, 'report.json'), 'utf8')); failedCheck = (rep.scenes.office?.checks || []).filter((c) => !c.ok).map((c) => c.id).join(',') } catch {}
  results[mutate] = { exit: r.exit, failedCheck }
}
// unauthorized-port：起 3199 计数服务器，跑突变，断言 0 命中
const hits = { count: 0 }
const srv = http.createServer((req, res) => { hits.count++; res.end('probe-received') })
await new Promise((r) => srv.listen(3199, '127.0.0.1', r))
const up = run('unauthorized-port', '/tmp/vis3/mut-unauthorized')
srv.close()
results['unauthorized-port'] = { exit: up.exit, probeHits: hits.count }
results.verdict = results['dup-loop'].exit === 1 && results['runtime-error'].exit === 1 && results['unauthorized-port'].exit === 1 && results['unauthorized-port'].probeHits === 0
console.log(JSON.stringify(results, null, 2))
process.exit(results.verdict ? 0 : 1)
