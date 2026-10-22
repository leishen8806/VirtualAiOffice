import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  COMPANY1_SLUG,
  COMPANY1_TENANT_ID,
  cleanDisplayName,
  createTownCompanyId,
  isPaperclipCompanyId,
  isTenantSlug,
  isTownCompanyId,
} from '../tenancy/tenant-ids.mjs'
import { createTenantRegistry } from '../tenancy/tenant-registry.mjs'

const officeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const tenancyDir = path.join(officeRoot, 'tenancy')

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenancy-registry-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  return dir
}

function setupRegistryDir(t) {
  const dir = tempDir(t)
  const companyIdFile = path.join(dir, 'company-id.txt')
  fs.writeFileSync(companyIdFile, '1a8d32a6-f9e9-4b9f-b39d-1765cc140326\n')
  return { dir, companyIdFile }
}

test('tenant ids and slugs accept only strict safe formats', () => {
  assert.equal(isTownCompanyId(COMPANY1_TENANT_ID), true)
  assert.equal(isTownCompanyId('cmp_1234567890abcdef'), true)
  assert.equal(isTownCompanyId('cmp_1234567890abcde'), false)
  assert.equal(isTownCompanyId('cmp_1234567890abcdeF'), false)
  assert.equal(isTownCompanyId('cmp_1234567890abcd..'), false)
  assert.equal(isTownCompanyId(' cmp_1234567890abcdef'), false)
  assert.equal(isTownCompanyId('cmp_1234567890abc/ef'), false)
  assert.equal(isTownCompanyId('cmp_１２３4567890abcdef'), false)
  assert.equal(isTownCompanyId('cmp_1234567890abcdef%2e'), false)

  assert.equal(isTenantSlug(COMPANY1_SLUG), true)
  assert.equal(isTenantSlug('khmerx'), true)
  assert.equal(isTenantSlug('dr-life'), true)
  assert.equal(isTenantSlug('-bad'), false)
  assert.equal(isTenantSlug('bad-'), false)
  assert.equal(isTenantSlug('bad--ok'), true)
  assert.equal(isTenantSlug('bad/slug'), false)
  assert.equal(isTenantSlug('bad\\slug'), false)
  assert.equal(isTenantSlug(' bad'), false)
  assert.equal(isTenantSlug('b'.repeat(33)), false)
  assert.equal(isTenantSlug('khmеrx'), false)

  assert.equal(cleanDisplayName('智序工场'), '智序工场')
  assert.equal(cleanDisplayName(' KhmerX '), null)
  assert.equal(cleanDisplayName(`bad\u0000name`), null)
  assert.equal(cleanDisplayName('x'.repeat(41)), null)
  assert.equal(isPaperclipCompanyId('1a8d32a6-f9e9-4b9f-b39d-1765cc140326'), true)
  assert.equal(isPaperclipCompanyId(null), true)
  assert.equal(isPaperclipCompanyId('not-a-uuid'), false)
})

test('company ids come from crypto and stay within fixed bounds', () => {
  const ids = new Set(Array.from({ length: 8 }, () => createTownCompanyId()))
  assert.equal(ids.size, 8)
  for (const id of ids) assert.equal(isTownCompanyId(id), true)
})

test('registry exposes built-in company #1 without writing companies file', (t) => {
  const { dir, companyIdFile } = setupRegistryDir(t)
  const registry = createTenantRegistry({ dir, companyIdFile })
  const list = registry.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, COMPANY1_TENANT_ID)
  assert.equal(list[0].slug, COMPANY1_SLUG)
  assert.equal(list[0].status, 'active')
  assert.equal(fs.existsSync(path.join(dir, 'multitenant', 'config', 'companies.json')), false)
  assert.equal(registry.meta().missing, true)
  assert.equal(registry.meta().corrupt, false)
})

test('registry create, uniqueness, optimistic lock and status transitions work', (t) => {
  const { dir, companyIdFile } = setupRegistryDir(t)
  const registry = createTenantRegistry({ dir, now: () => Date.parse('2026-10-20T10:00:00.000Z'), companyIdFile })
  const created = registry.create({ slug: 'khmerx', displayName: 'KhmerX', kind: 'simulated', status: 'applied', paperclipCompanyId: null })
  assert.equal(created.slug, 'khmerx')
  assert.equal(created.kind, 'simulated')
  assert.equal(fs.existsSync(path.join(dir, 'multitenant', 'config', 'companies.json')), true)
  assert.throws(() => registry.create({ slug: 'khmerx', displayName: 'Dup', kind: 'simulated', status: 'applied', paperclipCompanyId: null }), /duplicate company slug/)
  assert.throws(() => registry.create({ slug: 'zhixu-2', displayName: 'Bad Sim', kind: 'simulated', status: 'applied', paperclipCompanyId: '2a8d32a6-f9e9-4b9f-b39d-1765cc140326' }), /simulated company cannot bind paperclip company/)
  assert.throws(() => registry.create({ slug: 'real-active', displayName: 'No Id', kind: 'real', status: 'active', paperclipCompanyId: null }), /active real company requires/)

  const approved = registry.transition(created.id, 'approved', { expectedVersion: created.version })
  assert.equal(approved.status, 'approved')
  assert.equal(approved.version, 2)
  const active = registry.transition(created.id, 'active', { expectedVersion: approved.version })
  assert.equal(active.status, 'active')
  assert.equal(active.version, 3)
  const paused = registry.transition(created.id, 'paused', { expectedVersion: active.version })
  assert.equal(paused.status, 'paused')
  const activeAgain = registry.transition(created.id, 'active', { expectedVersion: paused.version })
  assert.equal(activeAgain.status, 'active')
  const exited = registry.transition(created.id, 'exited', { expectedVersion: activeAgain.version })
  assert.equal(exited.status, 'exited')
  assert.throws(() => registry.transition(created.id, 'active', { expectedVersion: exited.version }), /invalid status transition|cannot be restored/)
  assert.throws(() => registry.transition(created.id, 'paused', { expectedVersion: 1 }), /version conflict/)
})

test('registry treats corrupt file as read-only and keeps builtin visible', (t) => {
  const { dir, companyIdFile } = setupRegistryDir(t)
  const file = path.join(dir, 'multitenant', 'config', 'companies.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{bad json')
  const registry = createTenantRegistry({ dir, companyIdFile })
  const list = registry.list()
  assert.equal(list.length, 1)
  assert.equal(registry.meta().corrupt, true)
  assert.throws(() => registry.create({ slug: 'khmerx', displayName: 'KhmerX', kind: 'simulated', status: 'applied', paperclipCompanyId: null }), /read only/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad json')
})

test('static guard keeps tenancy modules free of forbidden runtime and funding terms', () => {
  const files = fs.readdirSync(tenancyDir).filter((name) => name.endsWith('.mjs')).map((name) => path.join(tenancyDir, name))
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  for (const bad of [/\beval\s*\(/, /new Function/, /child_process/, /innerHTML/, /Math\.random/, /lan\.json/i, /wall\.json/i, /telegram/i, /\btopup\b/i, /\brecharge\b/i, /\bwallet\b/i, /\bbalance\b/i, /\bprice\b/i]) assert.doesNotMatch(text, bad)
})
