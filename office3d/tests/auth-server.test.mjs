import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const serverPath = path.join(root, 'server.mjs')
const tenancyIndexPath = path.join(root, 'tenancy', 'index.mjs')
const snapshotPath = path.join(root, 'tools', 'tenancy-snapshot.mjs')

function indexOfOrThrow(text, needle) {
  const index = text.indexOf(needle)
  assert.notEqual(index, -1, `missing text: ${needle}`)
  return index
}

test('server keeps auth bypass narrow and behind existing access control order', () => {
  const server = fs.readFileSync(serverPath, 'utf8')
  const authRouteAt = indexOfOrThrow(server, 'const authRoute = tenancy.auth.router.match(req.method, url.pathname)')
  const lanGateAt = indexOfOrThrow(server, 'else if (!authRoute) return res.writeHead(401')
  const wallGateAt = indexOfOrThrow(server, "if (wallScope && (req.method !== 'GET' || ((API_PATHS.has(url.pathname) || authRoute) && !['/state', '/wall/data'].includes(url.pathname))))")
  const authHandleAt = indexOfOrThrow(server, 'if (authRoute) {')
  const method405At = indexOfOrThrow(server, "if (req.method !== 'GET' && !(req.method === 'HEAD' && url.pathname === '/town/map')) return json(405, { error: '不支持' })")

  assert.ok(authRouteAt < lanGateAt)
  assert.ok(lanGateAt < wallGateAt)
  assert.ok(wallGateAt < authHandleAt)
  assert.ok(authHandleAt < method405At)
  assert.match(server, /else if \(!authRoute\) return res\.writeHead\(401, \{ 'Content-Type': 'text\/html; charset=utf-8', 'Cache-Control': 'no-store' \}\)\.end\(loginPage\(\)\)/)
  assert.match(server, /if \(authRoute\) \{\s+const reply = await tenancy\.auth\.router\.handle\(req, url, \{ remoteAddress: addr, hostOk, originOk \}\)/)
})

test('platform view and snapshot tooling expose the auth contract without leaking details', () => {
  const tenancyIndex = fs.readFileSync(tenancyIndexPath, 'utf8')
  const snapshot = fs.readFileSync(snapshotPath, 'utf8')

  assert.match(tenancyIndex, /auth: auth\.summary\(\)/)
  assert.match(snapshot, /path: '\/auth\/session'/)
  // 缺陷 1 方案 A：需要 cookie 的接口挪到 /c/:slug/auth/… 之下，快照探针也要覆盖新路径
  assert.match(snapshot, /path: '\/c\/zhixu\/auth\/session'/)
  assert.match(snapshot, /path: '\/c\/zhixu\/whoami'/)
  assert.match(snapshot, /method: 'POST', path: '\/auth\/login'/)
  assert.match(snapshot, /body: \{ company: 'zhixu', username: 'snapshot', password: 'placeholder' \}/)
})
