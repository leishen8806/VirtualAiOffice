// F2-02/F2-03/F2-04：退出码矩阵、网络守卫（计数服务器命中数=0）、日志脱敏、清理。
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
  return spawnSync(NODE, args, { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 })
}

test('P-02 退出码矩阵：坏参数均退出 2', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
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

test('F2-01/F2-03 网络守卫：未授权端口计数服务器命中数为 0', async (t) => {
  const http = await import('node:http')
  const hits = { n: 0 }
  const srv = http.createServer((req, res) => { hits.n++; res.end('probe-received') })
  await new Promise((r) => srv.listen(3199, '127.0.0.1', r))
  t.after(() => srv.close())

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const log = path.join(tmp, 'net.jsonl')
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `
    import http from 'node:http'
    import https from 'node:https'
    import net from 'node:net'
    import tls from 'node:tls'
    const attempts = []
    const tryIt = (name, fn) => { try { fn(); attempts.push(name + ':NOT-BLOCKED') } catch (e) { attempts.push(name + ':' + (String(e.message||'').includes('VIS3_NETWORK_BLOCKED') ? 'BLOCKED' : 'OTHER')) } }
    // 同步抛错型
    tryIt('fetch', () => { fetch('http://127.0.0.1:3199/x').catch(() => {}) })
    tryIt('http', () => http.get('http://127.0.0.1:3199/x').on('error', () => {}))
    tryIt('https', () => https.get('https://127.0.0.1:3199/x').on('error', () => {}))
    tryIt('net1', () => net.connect(3199, '127.0.0.1', () => {}).on('error', () => {}))
    tryIt('net2', () => net.connect({ port: 3199, host: '127.0.0.1' }, () => {}).on('error', () => {}))
    tryIt('net3', () => net.createConnection(3199, '127.0.0.1').on('error', () => {}))
    tryIt('net4', () => new net.Socket().connect(3199, '127.0.0.1', () => {}).on('error', () => {}))
    tryIt('net5', () => net.connect(3199, '127.0.0.1').on('error', () => {}))
    tryIt('tls', () => tls.connect({ port: 3199, host: '127.0.0.1' }, () => {}).on('error', () => {}))
    // 等待异步 fetch 的失败落地
    await new Promise((r) => setTimeout(r, 500))
    console.log(JSON.stringify(attempts))
  `)
  const r = runNode(['--import', pathToFileURL(GUARD).href, script], { VIS3_NET_LOG: log, VIS3_ALLOWED_PORTS: '3200' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(hits.n, 0, '未授权端口计数服务器命中数必须为 0（实测 ' + hits.n + '）')
  const attempts = JSON.parse(r.stdout.trim().split('\n').pop())
  for (const k of ['fetch', 'http', 'https', 'net1', 'net2', 'net3', 'net4', 'net5', 'tls']) {
    assert.ok(attempts.some((a) => a.startsWith(k + ':')), `${k} 应被尝试`)
  }
})

test('F2-05 允许端口 http.get 能拿到响应', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `
    import http from 'node:http'
    http.createServer((req, res) => res.end('ok')).listen(3200, '127.0.0.1', () => {
      http.get('http://127.0.0.1:3200/', (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => { console.log(b); process.exit(0) }) })
    })
  `)
  const r = runNode(['--import', pathToFileURL(GUARD).href, script], { VIS3_ALLOWED_PORTS: '3200' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), 'ok')
})

test('P-07 阻断日志只记 origin，路径脱敏', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const log = path.join(tmp, 'net.jsonl')
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `try { await fetch('http://127.0.0.1:3199/bot123456:ABC/sendMessage?x=1') } catch {}`)
  runNode(['--import', pathToFileURL(GUARD).href, script], { VIS3_NET_LOG: log, VIS3_ALLOWED_PORTS: '3200' })
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
  assert.ok(lines.length >= 1, 'should log a block')
  for (const l of lines) {
    const obj = JSON.parse(l)
    assert.equal(obj.blocked, 'http://127.0.0.1:3199', 'log must be origin only, got ' + obj.blocked)
    assert.ok(!obj.blocked.includes('bot123456'), 'token must not appear in log')
  }
})
