import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createTenancy } from '../tenancy/index.mjs'
import { hashPassword } from '../tenancy/auth/password.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

function usage() {
  throw new Error('usage: node tools/tenancy-admin.mjs <create-account|reset-password|disable|enable|unlock|list> --company <slug> [--username <u>] [--role <r>]')
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  if (!command) usage()
  const options = {}
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]
    const value = rest[i + 1]
    if (!key?.startsWith('--') || value === undefined) usage()
    options[key.slice(2)] = value
  }
  return { command, options }
}

function oneTimePassword() {
  return crypto.randomBytes(16).toString('base64url')
}

const { command, options } = parseArgs(process.argv.slice(2))
const tenancy = createTenancy({ dir: ROOT, paperclipBaseUrl: 'http://127.0.0.1:3100' })
if (tenancy.flag().enabled !== true) throw new Error('multitenant.enabled must be true')
const company = tenancy.registry.get(options.company || '')
if (!company || company.status !== 'active') throw new Error('company must exist and be active')

const accounts = tenancy.auth.accounts
const sessions = tenancy.auth.sessions
const events = tenancy.auth.events

if (command === 'create-account') {
  const password = oneTimePassword()
  const record = accounts.createAccount({
    company: company.id,
    username: options.username,
    role: options.role,
    passwordRecord: await hashPassword(password),
    mustChangePassword: true,
  })
  events.append({ companyId: company.id, event: 'account_created', userId: record.id, sourceDigest: 'local-cli', result: 'ok' })
  console.log(JSON.stringify({ company: company.slug, username: record.username, role: record.role, status: record.status, mustChangePassword: true, oneTimePassword: password }, null, 2))
} else if (command === 'reset-password') {
  const lookup = accounts.getAccount(company.id, options.username)
  if (!lookup.account) throw new Error('account not found')
  const password = oneTimePassword()
  const updated = accounts.replacePassword(company.id, lookup.account.id, await hashPassword(password), { mustChangePassword: true, expectedVersion: lookup.account.version })
  sessions.revokeAllForUser(company.id, updated.id)
  events.append({ companyId: company.id, event: 'account_reset', userId: updated.id, sourceDigest: 'local-cli', result: 'ok' })
  console.log(JSON.stringify({ company: company.slug, username: updated.username, status: updated.status, mustChangePassword: true, oneTimePassword: password }, null, 2))
} else if (command === 'disable') {
  const lookup = accounts.getAccount(company.id, options.username)
  if (!lookup.account) throw new Error('account not found')
  const updated = accounts.setStatus(company.id, lookup.account.id, 'disabled', { expectedVersion: lookup.account.version })
  sessions.revokeAllForUser(company.id, updated.id)
  events.append({ companyId: company.id, event: 'account_disabled', userId: updated.id, sourceDigest: 'local-cli', result: 'ok' })
  console.log(JSON.stringify({ company: company.slug, username: updated.username, status: updated.status }, null, 2))
} else if (command === 'enable') {
  const lookup = accounts.getAccount(company.id, options.username)
  if (!lookup.account) throw new Error('account not found')
  const updated = accounts.setStatus(company.id, lookup.account.id, 'active', { expectedVersion: lookup.account.version })
  events.append({ companyId: company.id, event: 'account_enabled', userId: updated.id, sourceDigest: 'local-cli', result: 'ok' })
  console.log(JSON.stringify({ company: company.slug, username: updated.username, status: updated.status }, null, 2))
} else if (command === 'unlock') {
  // 已知取舍：按账号 5 次 / 15 分钟会让合法用户在别人爆破后也登不进去（README 有说明）。
  // 这条命令由董事会在本机执行，清掉该账号的限速状态，不需要重启服务。
  let username
  try {
    username = accounts.normalizeUsername(String(options.username || ''))
  } catch {
    throw new Error('username invalid')
  }
  const cleared = tenancy.auth.limiter.unlock({ companyId: company.id, username }).cleared
  events.append({ companyId: company.id, event: 'account_unlocked', userId: null, sourceDigest: 'local-cli', result: cleared ? 'ok' : 'noop' })
  console.log(JSON.stringify({ company: company.slug, username, cleared }, null, 2))
} else if (command === 'list') {
  const list = accounts.listAccounts(company.id)
  events.append({ companyId: company.id, event: 'account_list', userId: null, sourceDigest: 'local-cli', result: 'ok' })
  console.log(JSON.stringify(list.accounts.map((item) => ({
    username: item.username,
    role: item.role,
    status: item.status,
    createdAt: item.createdAt,
  })), null, 2))
} else {
  usage()
}
