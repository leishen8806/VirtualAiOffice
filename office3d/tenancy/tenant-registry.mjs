import fs from 'node:fs'
import path from 'node:path'

import {
  COMPANY1_SLUG,
  COMPANY1_TENANT_ID,
  createTownCompanyId,
  isCompanyStatus,
  isPaperclipCompanyId,
  isTenantSlug,
  validateCompanyRecordShape,
  cleanDisplayName,
} from './tenant-ids.mjs'

export const REGISTRY_RELATIVE_FILE = path.join('multitenant', 'config', 'companies.json')
const STATUS_FLOW = Object.freeze({
  applied: new Set(['approved']),
  approved: new Set(['active']),
  active: new Set(['paused', 'exited']),
  paused: new Set(['active', 'exited']),
  exited: new Set([]),
})

const clone = (value) => JSON.parse(JSON.stringify(value))

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJsonAtomic(file, value) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

function normalizeInput(input, nowIso) {
  const displayName = cleanDisplayName(input.displayName)
  const slug = typeof input.slug === 'string' ? input.slug : ''
  const kind = input.kind
  const status = input.status || 'applied'
  const paperclipCompanyId = input.paperclipCompanyId === undefined ? null : input.paperclipCompanyId
  if (!displayName) throw new Error('invalid company display name')
  if (!isTenantSlug(slug)) throw new Error('invalid company slug')
  if (!['real', 'simulated'].includes(kind)) throw new Error('invalid company kind')
  if (!isCompanyStatus(status)) throw new Error('invalid company status')
  if (!isPaperclipCompanyId(paperclipCompanyId)) throw new Error('invalid paperclip company id')
  const approvedAt = status === 'approved' || status === 'active' || status === 'paused' || status === 'exited' ? nowIso : null
  return Object.freeze({
    id: createTownCompanyId(),
    slug,
    displayName,
    kind,
    status,
    paperclipCompanyId,
    createdAt: nowIso,
    approvedAt,
    version: 1,
  })
}

function company1Record({ paperclipCompanyId }) {
  return Object.freeze({
    id: COMPANY1_TENANT_ID,
    slug: COMPANY1_SLUG,
    displayName: '智序工场',
    kind: 'real',
    status: 'active',
    paperclipCompanyId,
    createdAt: '2026-10-20T00:00:00.000Z',
    approvedAt: '2026-10-20T00:00:00.000Z',
    version: 1,
  })
}

export function createTenantRegistry({ dir, now = Date.now, log = () => {}, companyIdFile = path.join(dir, '..', 'company-id.txt') } = {}) {
  const file = path.join(dir, REGISTRY_RELATIVE_FILE)
  const state = { loaded: false, corrupt: false, missing: false, paperclipCompanyId: null, paperclipReadError: null, companies: [] }

  function loadCompanyId() {
    try {
      const raw = fs.readFileSync(companyIdFile, 'utf8').trim()
      state.paperclipCompanyId = raw || null
      state.paperclipReadError = null
    } catch (error) {
      state.paperclipCompanyId = null
      state.paperclipReadError = String(error?.message || error)
    }
  }

  function load() {
    if (state.loaded) return
    loadCompanyId()
    state.loaded = true
    state.corrupt = false
    state.missing = false
    state.companies = []
    if (!fs.existsSync(file)) {
      state.missing = true
      return
    }
    try {
      const raw = readJson(file)
      const list = Array.isArray(raw) ? raw : raw?.companies
      if (!Array.isArray(list)) throw new Error('registry is not an array')
      state.companies = list.map((item) => validateCompanyRecordShape(item))
    } catch (error) {
      state.corrupt = true
      state.companies = []
      log(`[tenancy] 注册表损坏，按只读处理：${String(error?.message || error)}`)
    }
  }

  function legacy() {
    load()
    return company1Record({ paperclipCompanyId: state.paperclipCompanyId })
  }

  function list() {
    load()
    return [legacy(), ...state.companies.map((item) => clone(item))]
  }

  function get(idOrSlug) {
    return list().find((item) => item.id === idOrSlug || item.slug === idOrSlug) || null
  }

  function ensureWritable() {
    load()
    if (state.corrupt) throw new Error('registry is read only because file is corrupt')
  }

  function ensureUnique(companies, record, excludeId = null) {
    for (const item of companies) {
      if (item.id === excludeId) continue
      if (item.slug === record.slug) throw new Error('duplicate company slug')
      if (record.paperclipCompanyId && item.paperclipCompanyId === record.paperclipCompanyId) throw new Error('duplicate paperclip company id')
    }
    const builtin = legacy()
    if (builtin.id !== excludeId) {
      if (builtin.slug === record.slug) throw new Error('duplicate company slug')
      if (record.paperclipCompanyId && builtin.paperclipCompanyId === record.paperclipCompanyId) throw new Error('duplicate paperclip company id')
    }
  }

  function create(input) {
    ensureWritable()
    const record = normalizeInput(input, new Date(now()).toISOString())
    if (record.kind === 'simulated' && record.paperclipCompanyId !== null) throw new Error('simulated company cannot bind paperclip company')
    if (record.kind === 'real' && record.status === 'active' && !record.paperclipCompanyId) throw new Error('active real company requires paperclip company id')
    const next = state.companies.map((item) => clone(item))
    ensureUnique(next, record)
    next.push(record)
    writeJsonAtomic(file, next)
    state.companies = next.map((item) => validateCompanyRecordShape(item))
    state.missing = false
    return clone(record)
  }

  function transition(id, targetStatus, { expectedVersion } = {}) {
    ensureWritable()
    if (!isCompanyStatus(targetStatus)) throw new Error('invalid target status')
    const next = state.companies.map((item) => clone(item))
    const index = next.findIndex((item) => item.id === id)
    if (index === -1) throw new Error('company not found')
    const current = next[index]
    if (typeof expectedVersion === 'number' && current.version !== expectedVersion) throw new Error('version conflict')
    if (!STATUS_FLOW[current.status].has(targetStatus)) throw new Error('invalid status transition')
    if (current.status === 'exited') throw new Error('exited company cannot be restored')
    if (current.kind === 'real' && targetStatus === 'active' && !current.paperclipCompanyId) throw new Error('active real company requires paperclip company id')
    current.status = targetStatus
    current.version += 1
    if (targetStatus === 'approved' || targetStatus === 'active' || targetStatus === 'paused' || targetStatus === 'exited') current.approvedAt = current.approvedAt || new Date(now()).toISOString()
    ensureUnique(next, current, current.id)
    writeJsonAtomic(file, next)
    state.companies = next.map((item) => validateCompanyRecordShape(item))
    return clone(current)
  }

  function meta() {
    load()
    return {
      file,
      missing: state.missing,
      corrupt: state.corrupt,
      paperclipCompanyId: state.paperclipCompanyId,
      paperclipReadError: state.paperclipReadError,
    }
  }

  return Object.freeze({ list, get, create, transition, meta, legacy })
}
