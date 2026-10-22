import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createTenancy } from '../tenancy/index.mjs'
import { hashPassword } from '../tenancy/auth/password.mjs'

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-accounts-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))
  return dir
}

function setup(t) {
  const dir = tempDir(t)
  const companyIdFile = path.join(dir, 'company-id.txt')
  fs.writeFileSync(companyIdFile, '1a8d32a6-f9e9-4b9f-b39d-1765cc140326\n')
  fs.writeFileSync(path.join(dir, 'multitenant.json'), JSON.stringify({ enabled: true, auth: { enabled: true } }, null, 2))
  let nowMs = Date.parse('2026-10-20T10:00:00.000Z')
  const tenancy = createTenancy({ dir, companyIdFile, paperclipBaseUrl: 'http://127.0.0.1:3100', now: () => nowMs, log: () => {} })
  const company = tenancy.registry.create({ slug: 'khmerx', displayName: 'KhmerX', kind: 'simulated', status: 'active', paperclipCompanyId: null })
  return { dir, tenancy, company, setNow(value) { nowMs = Date.parse(value) } }
}

test('account store creates, normalizes and lists accounts', async (t) => {
  const { tenancy, company } = setup(t)
  const record = tenancy.auth.accounts.createAccount({
    company: company.id,
    username: 'Owner.One',
    role: 'company_owner',
    passwordRecord: await hashPassword('OwnerPassword123'),
    mustChangePassword: true,
  })
  const listed = tenancy.auth.accounts.listAccounts(company.id)
  assert.equal(record.username, 'owner.one')
  assert.equal(listed.accounts.length, 1)
  assert.equal(listed.accounts[0].role, 'company_owner')
  assert.equal(tenancy.auth.summary().accounts, 1)
})

test('account store protects the last owner and stays read-only on corrupt files', async (t) => {
  const { tenancy, company } = setup(t)
  const owner = tenancy.auth.accounts.createAccount({
    company: company.id,
    username: 'owner1',
    role: 'company_owner',
    passwordRecord: await hashPassword('OwnerPassword123'),
  })
  assert.throws(() => tenancy.auth.accounts.setStatus(company.id, owner.id, 'disabled', { expectedVersion: owner.version }), /last owner/)
  const file = tenancy.paths.tenantPath(company.id, 'auth', 'accounts.json')
  fs.writeFileSync(file, '{bad json')
  const listed = tenancy.auth.accounts.listAccounts(company.id)
  assert.equal(listed.corrupt, true)
  assert.throws(() => tenancy.auth.accounts.createAccount({
    company: company.id,
    username: 'owner2',
    role: 'company_owner',
    passwordRecord: owner.passwordRecord,
  }), /read only/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad json')
})

test('account store supports password replacement and version conflicts', async (t) => {
  const { tenancy, company } = setup(t)
  const owner = tenancy.auth.accounts.createAccount({
    company: company.id,
    username: 'owner1',
    role: 'company_owner',
    passwordRecord: await hashPassword('OwnerPassword123'),
  })
  const replaced = tenancy.auth.accounts.replacePassword(company.id, owner.id, await hashPassword('NewPassword123'), { mustChangePassword: false, expectedVersion: owner.version })
  assert.equal(replaced.version, owner.version + 1)
  assert.equal(replaced.mustChangePassword, false)
  assert.throws(() => tenancy.auth.accounts.setStatus(company.id, owner.id, 'active', { expectedVersion: owner.version }), /version conflict/)
})

test('tenancy admin source files stay offline and avoid forbidden secrets', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const text = [
    fs.readFileSync(path.join(root, 'tenancy', 'auth', 'password.mjs'), 'utf8'),
    fs.readFileSync(path.join(root, 'tenancy', 'auth', 'accounts.mjs'), 'utf8'),
    fs.readFileSync(path.join(root, 'tenancy', 'auth', 'sessions.mjs'), 'utf8'),
    fs.readFileSync(path.join(root, 'tenancy', 'auth', 'rate-limit.mjs'), 'utf8'),
    fs.readFileSync(path.join(root, 'tenancy', 'auth', 'routes.mjs'), 'utf8'),
    fs.readFileSync(path.join(root, 'tools', 'tenancy-admin.mjs'), 'utf8'),
  ].join('\n')
  for (const bad of [/\beval\s*\(/, /new Function/, /child_process/, /Math\.random/, /lan\.json/i, /wall\.json/i, /telegram/i, /\btopup\b/i, /\brecharge\b/i, /\bwallet\b/i, /\bbalance\b/i, /\bprice\b/i, /ACT_TOKEN/]) {
    assert.doesNotMatch(text, bad)
  }
})
