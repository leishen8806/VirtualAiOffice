import crypto from 'node:crypto'

export const TENANT_ID_RE = /^cmp_[a-z0-9]{16,32}$/
export const TENANT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
export const PAPERCLIP_COMPANY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const COMPANY1_TENANT_ID = 'cmp_zhixuoffice000001'
export const COMPANY1_SLUG = 'zhixu'
export const COMPANY_STATUSES = Object.freeze(['applied', 'approved', 'active', 'paused', 'exited'])
export const COMPANY_KINDS = Object.freeze(['real', 'simulated'])

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/

function strictAscii(value) {
  if (typeof value !== 'string') return null
  if (value !== value.trim()) return null
  if (value.normalize('NFKC') !== value) return null
  if (/[^\x20-\x7e]/.test(value)) return null
  if (CONTROL_RE.test(value)) return null
  return value
}

export function isTownCompanyId(value) {
  const text = strictAscii(value)
  return !!(text && TENANT_ID_RE.test(text))
}

export function isTenantSlug(value) {
  const text = strictAscii(value)
  return !!(text && TENANT_SLUG_RE.test(text))
}

export function cleanDisplayName(value) {
  if (typeof value !== 'string') return null
  if (value !== value.trim()) return null
  if (value.normalize('NFKC') !== value) return null
  if (CONTROL_RE.test(value)) return null
  const text = Array.from(value).join('')
  if (!text || text.length > 40) return null
  return text
}

export function isPaperclipCompanyId(value) {
  return value === null || (typeof value === 'string' && value === value.trim() && PAPERCLIP_COMPANY_ID_RE.test(value))
}

export function isCompanyKind(value) {
  return COMPANY_KINDS.includes(value)
}

export function isCompanyStatus(value) {
  return COMPANY_STATUSES.includes(value)
}

export function createTownCompanyId(bytes = 8) {
  if (!Number.isInteger(bytes) || bytes < 8 || bytes > 16) throw new Error('invalid company id size')
  return `cmp_${crypto.randomBytes(bytes).toString('hex')}`
}

export function validateCompanyRecordShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid company record')
  const id = strictAscii(input.id)
  const slug = strictAscii(input.slug)
  const displayName = cleanDisplayName(input.displayName)
  const kind = input.kind
  const status = input.status
  const paperclipCompanyId = input.paperclipCompanyId === undefined ? null : input.paperclipCompanyId
  const createdAt = typeof input.createdAt === 'string' && input.createdAt === input.createdAt.trim() ? input.createdAt : null
  const approvedAt = input.approvedAt === null ? null : (typeof input.approvedAt === 'string' && input.approvedAt === input.approvedAt.trim() ? input.approvedAt : null)
  const version = Number.isInteger(input.version) && input.version >= 1 ? input.version : null

  if (!isTownCompanyId(id)) throw new Error('invalid company id')
  if (!isTenantSlug(slug)) throw new Error('invalid company slug')
  if (!displayName) throw new Error('invalid company display name')
  if (!isCompanyKind(kind)) throw new Error('invalid company kind')
  if (!isCompanyStatus(status)) throw new Error('invalid company status')
  if (!isPaperclipCompanyId(paperclipCompanyId)) throw new Error('invalid paperclip company id')
  if (!createdAt) throw new Error('invalid createdAt')
  if (input.approvedAt !== undefined && approvedAt === null && input.approvedAt !== null) throw new Error('invalid approvedAt')
  if (version === null) throw new Error('invalid company version')
  if (kind === 'simulated' && paperclipCompanyId !== null) throw new Error('simulated company cannot bind paperclip company')
  if (kind === 'real' && status === 'active' && !paperclipCompanyId) throw new Error('active real company requires paperclip company id')

  return Object.freeze({
    id,
    slug,
    displayName,
    kind,
    status,
    paperclipCompanyId,
    createdAt,
    approvedAt,
    version,
  })
}
