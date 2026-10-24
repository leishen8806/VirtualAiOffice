// FIX4：退出码矩阵、网络守卫（随机端口 + 连接计数 + 逐项 BLOCKED）、变异自测、日志脱敏、清理。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.resolve(HERE, '..', 'run.mjs')
const GUARD = path.resolve(HERE, '..', 'block-network.mjs')
const REPO = path.resolve(HERE, '..', '..', '..')
const NODE = process.execPath

function runNode(args, env = {}) {
  return spawnSync(NODE, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 20000, killSignal: 'SIGKILL' })
}
async function runNodeAsync(args, env = {}) {
  const { spawn } = await import('node:child_process')
  return new Promise((resolve) => {
    const child = spawn(NODE, args, { env: { ...process.env, ...env } })
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    const killTimer = setTimeout(() => { child.kill('SIGKILL') }, 20000)
    child.on('close', (code, signal) => { clearTimeout(killTimer); resolve({ status: code, signal, stdout: out, stderr: err }) })
  })
}

// 起一个连接计数服务器（随机端口），返回 { port, conn, req, close }
async function startCounter() {
  const net = await import('node:net')
  const state = { conn: 0, req: 0 }
  const srv = net.createServer()
  srv.on('connection', (sock) => { state.conn++; sock.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n') })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  return { port: srv.address().port, state, close: () => srv.close() }
}

// 探针脚本：对目标端口逐一尝试，输出每项结果（fetch 用 await 判 promise 拒绝）
function probeScript() {
  return `
    import http from 'node:http'
    import https from 'node:https'
    import net from 'node:net'
    import tls from 'node:tls'
    const P = Number(process.env.VIS3_PROBE_PORT)
    const out = []
    const t = (name, fn) => { try { fn(); out.push(name + ':NOT-BLOCKED') } catch (e) { out.push(name + ':' + (String(e.message || '').includes('VIS3_NETWORK_BLOCKED') ? 'BLOCKED' : 'OTHER')) } }
    t('http', () => http.get('http://127.0.0.1:' + P + '/').on('error', () => {}))
    t('https', () => https.get('https://127.0.0.1:' + P + '/').on('error', () => {}))
    t('net1', () => net.connect(P, '127.0.0.1', () => {}).on('error', () => {}))
    t('net2', () => net.connect({ port: P, host: '127.0.0.1' }, () => {}).on('error', () => {}))
    t('net3', () => net.createConnection(P, '127.0.0.1').on('error', () => {}))
    t('net4', () => new net.Socket().connect(P, '127.0.0.1', () => {}).on('error', () => {}))
    t('net5', () => net.connect(P, '127.0.0.1').on('error', () => {}))
    t('tls', () => tls.connect({ port: P, host: '127.0.0.1' }, () => {}).on('error', () => {}))
    try { await fetch('http://127.0.0.1:' + P + '/'); out.push('fetch:NOT-BLOCKED') } catch (e) { out.push('fetch:' + (String(e.message || '').includes('VIS3_NETWORK_BLOCKED') ? 'BLOCKED' : 'OTHER')) }
    await new Promise((r) => setTimeout(r, 300))
    console.log(JSON.stringify(out))
    process.exit(0)
  `
}

test('F2-01/F2-03 网络守卫：未授权端口连接数=0 且逐项 BLOCKED', async (t) => {
  const c = await startCounter(); t.after(() => c.close())
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const script = path.join(tmp, 'probe.mjs'); fs.writeFileSync(script, probeScript())
  const r = await runNodeAsync(['--import', pathToFileURL(GUARD).href, script], { VIS3_PROBE_PORT: String(c.port), VIS3_ALLOWED_PORTS: '' })
  await new Promise((rr) => setTimeout(rr, 60))
  assert.equal(r.status, 0, '探针应正常退出，stderr=' + r.stderr)
  assert.equal(c.state.conn, 0, '未授权端口连接数必须为 0（实测 ' + c.state.conn + '）')
  const attempts = JSON.parse(r.stdout.trim().split('\n').pop())
  for (const k of ['http', 'https', 'net1', 'net2', 'net3', 'net4', 'net5', 'tls', 'fetch']) {
    assert.equal(attempts.find((a) => a.startsWith(k + ':')) || k + ':MISSING', k + ':BLOCKED', `${k} 应严格等于 BLOCKED（实测 ${attempts.find((a) => a.startsWith(k + ':'))}）`)
  }
})

test('F2-05 允许端口 http.get 能拿到响应', async (t) => {
  const net = await import('node:net')
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `
    import http from 'node:http'
    const P = Number(process.env.VIS3_PROBE_PORT)
    http.createServer((req, res) => res.end('ok')).listen(P, '127.0.0.1', () => {
      http.get('http://127.0.0.1:' + P + '/', (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => { console.log(b); process.exit(0) }) })
    })
  `)
  const r = runNode(['--import', pathToFileURL(GUARD).href, script], { VIS3_PROBE_PORT: String(port), VIS3_ALLOWED_PORTS: String(port) })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), 'ok')
})

test('FIX4 变异自测：逐个去掉守卫 API，连接数>0 且探针失败', async (t) => {
  // 去掉某条路径上的全部拦截（net.connect/createConnection 内部会走 Socket.prototype.connect，tls 也走 net 的 TCP 连接）
  const mutations = [
    { name: 'netSocket', removes: ['net.Socket.prototype.connect = function'], expect: ['net4'] },
    { name: 'netConnect', removes: ['net.connect = guardConnect', 'net.createConnection = guardConnect', 'net.Socket.prototype.connect = function'], expect: ['net1', 'net2', 'net3', 'net5'] },
    { name: 'tlsConnect', removes: ['tls.connect = guardConnect', 'net.Socket.prototype.connect = function'], expect: ['tls'] },
    { name: 'fetch', begin: '@@VIS3_FETCH_GUARD_BEGIN', end: '@@VIS3_FETCH_GUARD_END', removes: ['net.connect = guardConnect', 'net.createConnection = guardConnect', 'net.Socket.prototype.connect = function'], expect: ['fetch'] },
  ]
  for (const m of mutations) {
    const c = await startCounter(); t.after(() => c.close())
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-mut-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
    const guardSrc = fs.readFileSync(GUARD, 'utf8')
    let lines = guardSrc.split('\n')
    if (m.begin && m.end) {
      const b = lines.findIndex((l) => l.includes(m.begin)); const e = lines.findIndex((l) => l.includes(m.end))
      lines = lines.filter((_, i) => i <= b || i >= e)
    }
    lines = lines.filter((l) => !(m.removes || []).some((r) => l.includes(r)))
    const mutGuard = path.join(tmp, 'block-network.mut.mjs'); fs.writeFileSync(mutGuard, lines.join('\n'))
    const script = path.join(tmp, 'probe.mjs'); fs.writeFileSync(script, probeScript())
    const r = await runNodeAsync(['--import', pathToFileURL(mutGuard).href, script], { VIS3_PROBE_PORT: String(c.port), VIS3_ALLOWED_PORTS: '' })
    await new Promise((rr) => setTimeout(rr, 60))
    assert.ok(c.state.conn > 0, `去掉 ${m.name} 路径守卫后连接数应 >0（实测 ${c.state.conn}）`)
    const attempts = JSON.parse(r.stdout.trim().split('\n').pop())
    for (const k of m.expect) {
      assert.ok(attempts.some((a) => a === k + ':NOT-BLOCKED'), `去掉 ${m.name} 后 ${k} 应为 NOT-BLOCKED（实测 ${attempts.find((a) => a.startsWith(k + ':'))}）`)
    }
  }
})

test('FIX4 静态：scripts/vis3 无 3199/3200 字面量（注释除外）', () => {
  const files = []
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (path.basename(p) !== 'tests') walk(p) } else if (p.endsWith('.mjs')) files.push(p) } }
  walk(path.resolve(HERE, '..'))
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(src, /\b(3199|3200)\b/, `${path.relative(REPO, f)} 不应出现 3199/3200 字面量`)
  }
})

test('P-02 退出码矩阵：坏参数均退出 2', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const aFile = path.join(tmp, 'outfile'); fs.writeFileSync(aFile, 'x')
  const cases = [
    ['--playwright', '/nonexistent/playwright', '--repo', REPO, '--scene', 'office', '--out', path.join(tmp, 'o1')],
    ['--repo', REPO, '--scene', 'office', '--out', path.join(tmp, 'missing-parent', 'o2')],
    ['--repo', REPO, '--scene', 'office', '--out', aFile],
    ['--repo', '/nonexistent-repo-xyz', '--scene', 'office', '--out', path.join(tmp, 'o3')],
    ['--repo', REPO, '--scene', 'office', '--out', path.join(os.homedir(), 'vis3-not-temp-x')],
  ]
  for (const args of cases) {
    const r = runNode([RUN, ...args], { VIS3_PLAYWRIGHT: '/nonexistent/pw' })
    assert.equal(r.status, 2, `case ${args.join(' ')} expected exit 2, got ${r.status}`)
  }
})

test('P-07 阻断日志只记 origin，路径脱敏', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const log = path.join(tmp, 'net.jsonl')
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `try { await fetch('http://127.0.0.1:' + Number(process.env.VIS3_PROBE_PORT) + '/bot123456:ABC/sendMessage?x=1') } catch {}`)
  runNode(['--import', pathToFileURL(GUARD).href, script], { VIS3_NET_LOG: log, VIS3_ALLOWED_PORTS: '', VIS3_PROBE_PORT: '12345' })
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
  assert.ok(lines.length >= 1, 'should log a block')
  for (const l of lines) {
    const obj = JSON.parse(l)
    assert.ok(obj.blocked.startsWith('http://127.0.0.1:12345'), 'log origin should match probe origin, got ' + obj.blocked)
    assert.ok(!obj.blocked.includes('bot123456'), 'token must not appear in log')
  }
})
