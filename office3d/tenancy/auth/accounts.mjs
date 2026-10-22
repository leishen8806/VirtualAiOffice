import crypto from 'node:crypto'
import fs from 'node:fs'

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const ROLE_SET = new Set(['company_owner', 'company_member', 'company_viewer'])
const STATUS_SET = new Set(['active', 'disabled'])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(requireParent(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(temp, file)
}

function requireParent(file) {
  return file.slice(0, Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/')))
}

function normalizeUsername(username) {
  const value = String(username || '').trim().toLowerCase()
  if (!USERNAME_RE.test(value)) throw new Error('invalid username')
  return value
}

function validateRole(role) {
  if (!ROLE_SET.has(role)) throw new Error('invalid account role')
  return role
}

function validateStatus(status) {
  if (!STATUS_SET.has(status)) throw new Error('invalid account status')
  return status
}

function validateAccountShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid account record')
  const id = String(input.id || '').trim()
  if (!/^usr_[a-f0-9]{16}$/.test(id)) throw new Error('invalid account id')
  const username = normalizeUsername(input.username)
  const role = validateRole(input.role)
  const status = validateStatus(input.status)
  if (!input.passwordRecord || typeof input.passwordRecord !== 'object') throw new Error('invalid password record')
  if (typeof input.mustChangePassword !== 'boolean') throw new Error('invalid mustChangePassword')
  if (typeof input.createdAt !== 'string' || typeof input.updatedAt !== 'string') throw new Error('invalid account timestamps')
  if (!Number.isInteger(input.version) || input.version < 1) throw new Error('invalid account version')
  return Object.freeze({
    id,
    username,
    role,
    passwordRecord: clone(input.passwordRecord),
    mustChangePassword: input.mustChangePassword,
    status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    version: input.version,
  })
}

function loadJsonArray(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(raw)) throw new Error('accounts store is not an array')
  return raw.map((item) => validateAccountShape(item))
}

export function createAccountStore({ registry, paths, now = Date.now, log = () => {} } = {}) {
  if (!registry || !paths) throw new Error('account store requires registry and paths')

  function resolveCompany(companyRef, { activeOnly = false } = {}) {
    const company = registry.get(companyRef)
    if (!company) throw new Error('unknown company')
    if (activeOnly && company.status !== 'active') throw new Error('company must be active')
    return company
  }

  function fileFor(companyId) {
    return paths.tenantPath(companyId, 'auth', 'accounts.json')
  }

  function load(companyRef) {
    const company = resolveCompany(companyRef)
    const file = fileFor(company.id)
    if (!fs.existsSync(file)) return { company, file, accounts: [], corrupt: false }
    try {
      return { company, file, accounts: loadJsonArray(file), corrupt: false }
    } catch (error) {
      log(`[auth] 账号文件损坏，按只读处理：${company.slug} ${String(error?.message || error)}`)
      return { company, file, accounts: [], corrupt: true }
    }
  }

  function ensureWritable(bundle) {
    if (bundle.corrupt) throw new Error('accounts store is read only because file is corrupt')
    return bundle
  }

  function save(bundle, accounts) {
    writeJsonAtomic(bundle.file, accounts)
    return accounts.map((item) => validateAccountShape(item))
  }

  function requireLastOwnerSafe(accounts, accountId, nextRole, nextStatus) {
    const target = accounts.find((item) => item.id === accountId)
    if (!target) throw new Error('account not found')
    const willRemainOwner = nextRole === 'company_owner' && nextStatus === 'active'
    if (target.role !== 'company_owner' || willRemainOwner) return
    const remaining = accounts.filter((item) => item.id !== accountId && item.role === 'company_owner' && item.status === 'active')
    if (remaining.length === 0) throw new Error('cannot disable the last owner')
  }

  function listAccounts(companyRef) {
    const bundle = load(companyRef)
    return { company: bundle.company, corrupt: bundle.corrupt, accounts: bundle.accounts.map((item) => clone(item)) }
  }

  function getAccount(companyRef, username) {
    const bundle = load(companyRef)
    const name = normalizeUsername(username)
    const account = bundle.accounts.find((item) => item.username === name) || null
    return { company: bundle.company, corrupt: bundle.corrupt, account: account ? clone(account) : null }
  }

  function getAccountById(companyRef, accountId) {
    const bundle = load(companyRef)
    const account = bundle.accounts.find((item) => item.id === accountId) || null
    return { company: bundle.company, corrupt: bundle.corrupt, account: account ? clone(account) : null }
  }

  function countAllAccounts() {
    let count = 0
    for (const company of registry.list()) {
      const bundle = load(company.id)
      count += bundle.accounts.length
    }
    return count
  }

  function createAccount({ company, username, role, passwordRecord, mustChangePassword = true } = {}) {
    const bundle = ensureWritable(load(resolveCompany(company, { activeOnly: true }).id))
    const normalizedUsername = normalizeUsername(username)
    const normalizedRole = validateRole(role)
    if (bundle.accounts.some((item) => item.username === normalizedUsername)) throw new Error('duplicate username')
    const at = new Date(now()).toISOString()
    const record = {
      id: `usr_${crypto.randomBytes(8).toString('hex')}`,
      username: normalizedUsername,
      role: normalizedRole,
      passwordRecord: clone(passwordRecord),
      mustChangePassword: Boolean(mustChangePassword),
      status: 'active',
      createdAt: at,
      updatedAt: at,
      version: 1,
    }
    const next = save(bundle, [...bundle.accounts, record])
    return clone(next.find((item) => item.id === record.id))
  }

  function updateAccount(companyRef, accountId, updater, { expectedVersion } = {}) {
    const bundle = ensureWritable(load(companyRef))
    const next = bundle.accounts.map((item) => clone(item))
    const index = next.findIndex((item) => item.id === accountId)
    if (index === -1) throw new Error('account not found')
    if (typeof expectedVersion === 'number' && next[index].version !== expectedVersion) throw new Error('version conflict')
    const draft = next[index]
    updater(draft)
    draft.username = normalizeUsername(draft.username)
    draft.role = validateRole(draft.role)
    draft.status = validateStatus(draft.status)
    draft.updatedAt = new Date(now()).toISOString()
    draft.version += 1
    requireLastOwnerSafe(next, draft.id, draft.role, draft.status)
    const usernames = new Set()
    for (const account of next) {
      if (usernames.has(account.username)) throw new Error('duplicate username')
      usernames.add(account.username)
      validateAccountShape(account)
    }
    const saved = save(bundle, next)
    return clone(saved.find((item) => item.id === accountId))
  }

  function replacePassword(companyRef, accountId, passwordRecord, { mustChangePassword = false, expectedVersion } = {}) {
    return updateAccount(companyRef, accountId, (draft) => {
      draft.passwordRecord = clone(passwordRecord)
      draft.mustChangePassword = Boolean(mustChangePassword)
    }, { expectedVersion })
  }

  function setStatus(companyRef, accountId, status, options = {}) {
    return updateAccount(companyRef, accountId, (draft) => {
      draft.status = status
    }, options)
  }

  return Object.freeze({
    load,
    listAccounts,
    getAccount,
    getAccountById,
    countAllAccounts,
    createAccount,
    updateAccount,
    replacePassword,
    setStatus,
    normalizeUsername,
    validateAccountShape,
    resolveCompany,
  })
}
