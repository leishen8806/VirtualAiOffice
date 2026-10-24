// P-01/P-02/P-05/P-07 自测：不启动浏览器。退出码矩阵、网络钩子、日志脱敏。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

test('P-02 退出码矩阵：坏参数均退出 2', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
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

test('P-05 网络钩子拦截 fetch/http/https/net/tls', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
  const log = path.join(tmp, 'net.jsonl')
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `
    import http from 'node:http'
    import https from 'node:https'
    import net from 'node:net'
    import tls from 'node:tls'
    const blocked = []
    const t = async (name, fn) => { try { await fn(); blocked.push(name + ':NOT-BLOCKED') } catch (e) { blocked.push(name + ':' + (String(e.message||'').includes('VIS3_NETWORK_BLOCKED') ? 'BLOCKED' : 'OTHER:' + e.message)) } }
    await t('fetch', async () => { await fetch('http://127.0.0.1:3199/x') })
    await t('http', () => new Promise((_, rej) => { http.get('http://127.0.0.1:3199/x').on('error', rej) }))
    await t('https', () => new Promise((_, rej) => { https.get('https://127.0.0.1:3199/x').on('error', rej) }))
    await t('net', () => new Promise((_, rej) => { const s = net.connect(3199, '127.0.0.1'); s.on('error', rej) }))
    await t('tls', () => new Promise((_, rej) => { const s = tls.connect(3199, '127.0.0.1'); s.on('error', rej) }))
    console.log(JSON.stringify(blocked))
  `)
  const r = runNode(['--import', GUARD, script], { VIS3_NET_LOG: log, VIS3_ALLOWED_PORTS: '3200' })
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout.trim().split('\n').pop())
  for (const k of ['fetch', 'http', 'https', 'net', 'tls']) {
    assert.ok(out.some((s) => s.startsWith(k + ':') && s.endsWith('BLOCKED')), `${k} should be blocked: ${JSON.stringify(out)}`)
  }
})

test('P-07 阻断日志只记 origin，路径脱敏', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-t-'))
  const log = path.join(tmp, 'net.jsonl')
  const script = path.join(tmp, 'probe.mjs')
  fs.writeFileSync(script, `try { await fetch('http://127.0.0.1:3199/bot123456:ABC/sendMessage?x=1') } catch {}`)
  runNode(['--import', GUARD, script], { VIS3_NET_LOG: log, VIS3_ALLOWED_PORTS: '3200' })
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
  assert.ok(lines.length >= 1, 'should log a block')
  for (const l of lines) {
    const obj = JSON.parse(l)
    assert.equal(obj.blocked, 'http://127.0.0.1:3199', 'log must be origin only, got ' + obj.blocked)
    assert.ok(!obj.blocked.includes('bot123456'), 'token must not appear in log')
  }
})
