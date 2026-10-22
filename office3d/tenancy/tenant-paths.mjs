import fs from 'node:fs'
import path from 'node:path'

import { isTownCompanyId } from './tenant-ids.mjs'

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function lower(value) {
  return path.resolve(value).replace(/\//g, '\\').toLowerCase()
}

function deepestExisting(target) {
  let current = path.resolve(target)
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return current
}

function validateSegment(segment) {
  if (typeof segment !== 'string' || !segment) throw new Error('invalid path segment')
  if (segment === '.' || segment === '..') throw new Error('invalid path segment')
  if (segment !== segment.trim()) throw new Error('invalid path segment')
  if (!SEGMENT_RE.test(segment)) throw new Error('invalid path segment')
  if (/[\\/:\u0000]/.test(segment)) throw new Error('invalid path segment')
  if (segment.endsWith('.') || segment.endsWith(' ')) throw new Error('invalid path segment')
  if (RESERVED_RE.test(segment)) throw new Error('invalid path segment')
  return segment
}

export function createTenantPaths({ dir, registry } = {}) {
  const tenantsDir = path.join(dir, 'multitenant', 'tenants')

  function ensureRegistered(id) {
    if (!isTownCompanyId(id)) throw new Error('invalid tenant id')
    if (!registry?.get(id)) throw new Error('unknown tenant id')
  }

  function tenantRoot(id) {
    ensureRegistered(id)
    return path.join(tenantsDir, id)
  }

  function tenantPath(id, ...segments) {
    ensureRegistered(id)
    if (!segments.length) return tenantRoot(id)
    const clean = segments.map(validateSegment)
    const root = tenantRoot(id)
    const target = path.resolve(root, ...clean)
    const rel = path.relative(root, target)
    if (path.isAbsolute(rel) || rel.startsWith('..') || rel.includes('..\\') || rel.includes('../')) throw new Error('path escapes tenant root')
    const existing = deepestExisting(target)
    const real = fs.realpathSync(existing)
    if (lower(real) !== lower(existing)) throw new Error('path resolves outside tenant root')
    return target
  }

  return Object.freeze({ tenantRoot, tenantPath })
}
