import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { createTenancy } from '../tenancy/index.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const serverPath = path.join(root, 'server.mjs')
const backupServerPath = path.resolve(root, '..', 'office3d-backup-m5-1', 'server.mjs')
const tenancyDir = path.join(root, 'tenancy')

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenancy-index-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  return dir
}

function parseSet(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]+)\\]\\)`))
  return new Set((match?.[1] || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/^['"]|['"]$/g, '')))
}

test('tenancy flag and platform view handle missing, off, corrupt and non-loopback cases without writes', (t) => {
  const dir = tempDir(t)
  const companyIdFile = path.join(dir, 'company-id.txt')
  fs.writeFileSync(companyIdFile, '1a8d32a6-f9e9-4b9f-b39d-1765cc140326\n')

  const missing = createTenancy({ dir, paperclipBaseUrl: 'http://127.0.0.1:3100', companyIdFile })
  assert.equal(missing.platformView().reason, 'missing')
  assert.equal(fs.existsSync(path.join(dir, 'multitenant')), false)

  fs.writeFileSync(path.join(dir, 'multitenant.json'), JSON.stringify({ enabled: false }))
  const off = createTenancy({ dir, paperclipBaseUrl: 'http://127.0.0.1:3100', companyIdFile })
  assert.equal(off.platformView().enabled, false)
  assert.equal(off.platformView().reason, 'off')

  fs.writeFileSync(path.join(dir, 'multitenant.json'), '{bad')
  const corrupt = createTenancy({ dir, paperclipBaseUrl: 'http://127.0.0.1:3100', companyIdFile, log: () => {} })
  assert.equal(corrupt.platformView().reason, 'corrupt')

  fs.writeFileSync(path.join(dir, 'multitenant.json'), JSON.stringify({ enabled: true }))
  const loopbackFail = createTenancy({ dir, paperclipBaseUrl: 'http://192.168.1.5:3100', companyIdFile })
  assert.equal(loopbackFail.platformView().enabled, false)
  assert.equal(loopbackFail.platformView().reason, 'paperclip_not_loopback')
  assert.equal(loopbackFail.platformView().gateway.paperclipLoopbackOnly, false)
})

test('server wiring exposes platform tenancy only to local users and keeps static whitelist unchanged', () => {
  const server = fs.readFileSync(serverPath, 'utf8')
  const backup = fs.readFileSync(backupServerPath, 'utf8')
  const apiPaths = parseSet(server, 'API_PATHS')
  const staticExt = parseSet(server, 'STATIC_EXT')
  const backupStaticExt = parseSet(backup, 'STATIC_EXT')
  const gate = server.indexOf('if (wallScope &&')
  const route = server.indexOf("url.pathname === '/platform/tenancy'")
  const fallback = server.indexOf('if (!staticOk(rel))')

  assert.match(server, /import \{ createTenancy \} from '\.\/tenancy\/index\.mjs'/)
  assert.match(server, /const tenancy = createTenancy\(/)
  assert.match(server, /tenancy\.warnIfPaperclipNotLoopback\(\)/)
  assert.ok(apiPaths.has('/platform/tenancy'))
  assert.ok(gate < route && route < fallback)
  assert.match(server, /if \(lanUser\) return json\(403, \{ error: '多租户平台状态只允许在运行服务的电脑上查看' \}\)/)
  assert.deepEqual([...staticExt], [...backupStaticExt])
  assert.equal(staticExt.has('.json'), false)
  assert.equal(server.includes('/multitenant.json'), false)
})

test('tenancy modules stay offline and do not reference forbidden config files or funding terms', () => {
  const text = fs.readdirSync(tenancyDir).filter((name) => name.endsWith('.mjs')).map((name) => fs.readFileSync(path.join(tenancyDir, name), 'utf8')).join('\n')
  for (const bad of [/\beval\s*\(/, /new Function/, /child_process/, /innerHTML/, /lan\.json/i, /wall\.json/i, /telegram/i, /\btopup\b/i, /\brecharge\b/i, /\bwallet\b/i, /\bbalance\b/i, /\bprice\b/i, /Math\.random/]) assert.doesNotMatch(text, bad)
})
