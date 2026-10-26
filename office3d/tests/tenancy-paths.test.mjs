import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createTenantPaths } from '../tenancy/tenant-paths.mjs'

const TENANT_ID = 'cmp_1234567890abcdef'

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenancy-paths-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  try { return fs.realpathSync(dir) } catch { return dir } // 规避平台 realpath 不对称（macOS /var 符号链接等）
}

function registryStub(extra = {}) {
  const entry = { id: TENANT_ID, slug: 'khmerx', ...extra }
  return { get(id) { return id === TENANT_ID ? entry : null } }
}

test('tenant paths accept valid registered ids and keep results under tenant root', (t) => {
  const dir = tempDir(t)
  const paths = createTenantPaths({ dir, registry: registryStub() })
  const root = paths.tenantRoot(TENANT_ID)
  const file = paths.tenantPath(TENANT_ID, 'state', 'report.json')
  assert.equal(root.endsWith(path.join('multitenant', 'tenants', TENANT_ID)), true)
  assert.equal(file, path.join(root, 'state', 'report.json'))
})

test('tenant paths reject unregistered ids and hostile path segments', (t) => {
  const dir = tempDir(t)
  const paths = createTenantPaths({ dir, registry: registryStub() })
  assert.throws(() => paths.tenantRoot('cmp_bad'), /invalid tenant id|unknown tenant id/)
  for (const segment of ['', '.', '..', 'CON', 'NUL', 'COM1', 'file.txt:stream', 'segment ', 'segment.', '..\\bad', '../bad', 'C:\\bad', '\\\\?\\C:\\bad', 'bad/bad', 'bad\\bad', 'a'.repeat(65), 'TEMP~1']) {
    assert.throws(() => paths.tenantPath(TENANT_ID, segment), /invalid path segment/)
  }
})

test('tenant paths reject junction and symlink escapes via realpath check', (t) => {
  const dir = tempDir(t)
  const paths = createTenantPaths({ dir, registry: registryStub() })
  const root = paths.tenantRoot(TENANT_ID)
  fs.mkdirSync(root, { recursive: true })
  const outside = path.join(dir, 'outside')
  fs.mkdirSync(outside, { recursive: true })
  const link = path.join(root, 'safe')
  fs.symlinkSync(outside, link, 'junction')
  assert.throws(() => paths.tenantPath(TENANT_ID, 'safe', 'file.json'), /outside tenant root/)
})

test('tenant paths allow mixed-case normal segments on Windows-safe comparison', (t) => {
  const dir = tempDir(t)
  const paths = createTenantPaths({ dir, registry: registryStub() })
  const root = paths.tenantRoot(TENANT_ID)
  fs.mkdirSync(path.join(root, 'Logs'), { recursive: true })
  const target = paths.tenantPath(TENANT_ID, 'Logs', 'Daily.txt')
  assert.equal(target, path.join(root, 'Logs', 'Daily.txt'))
})
