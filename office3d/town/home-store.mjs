import fs from 'node:fs'
import path from 'node:path'
import {
  MAX_PLACEMENTS,
  defaultLayout,
  starterInventory,
  normalizeLayout,
  validateLayout,
} from './home-space.mjs'

const OWNER_RE = /^[a-z0-9_-]{1,40}$/
const RESERVED_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const MAX_BYTES = 64 * 1024
const TEMP_RE = /\.tmp$/
const clone = (value) => JSON.parse(JSON.stringify(value))

function fail(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function assertOwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !OWNER_RE.test(ownerId) ||
    ownerId !== ownerId.trim() ||
    ownerId.endsWith('.') || ownerId.endsWith(' ') ||
    RESERVED_RE.test(ownerId) ||
    /[.]{2}|[\\/:*\?"<>|\u0000]/.test(ownerId)) {
    throw fail('invalid_owner_id')
  }
}

function nowValue(now) {
  const value = now()
  if (!Number.isFinite(value)) throw fail('invalid_clock')
  return value
}

function isoAt(now) {
  return new Date(nowValue(now)).toISOString()
}

function within(root, target) {
  const relative = path.relative(root, target)
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
}

function realPath(fsOps, target) {
  return fsOps.realpathSync(target)
}

function makeStore({ dir, now, fsOps = fs } = {}) {
  if (typeof dir !== 'string' || !dir) throw fail('invalid_dir')
  if (typeof now !== 'function') throw fail('clock_required')
  const root = path.resolve(dir)
  const homeRoot = path.join(root, 'home')
  const queues = new Map()
  const memoryInventory = new Map()

  function ensureRoot() {
    fsOps.mkdirSync(root, { recursive: true })
    fsOps.mkdirSync(homeRoot, { recursive: true })
    const realDataRoot = realPath(fsOps, root)
    const realRoot = realPath(fsOps, homeRoot)
    const expected = path.join(realDataRoot, 'home')
    if (realRoot.toLowerCase() !== expected.toLowerCase()) throw fail('unsafe_home_root')
  }

  function homePath(ownerId) {
    assertOwnerId(ownerId)
    ensureRoot()
    const target = path.resolve(homeRoot, `${ownerId}.json`)
    if (!within(homeRoot, target)) throw fail('unsafe_path')
    const existing = fsOps.existsSync(target) ? target : homeRoot
    const realExisting = realPath(fsOps, existing)
    const realHome = realPath(fsOps, homeRoot)
    if (!within(realHome, realExisting)) throw fail('unsafe_path')
    return target
  }

  function inventoryPath(ownerId) {
    assertOwnerId(ownerId)
    const layout = homePath(ownerId)
    return path.join(path.dirname(layout), `${ownerId}.inventory.json`)
  }

  function cleanupTemps() {
    ensureRoot()
    let names = []
    try { names = fsOps.readdirSync(homeRoot) } catch { return }
    const cutoff = nowValue(now) - 60 * 60 * 1000
    for (const name of names) {
      if (!TEMP_RE.test(name)) continue
      const file = path.join(homeRoot, name)
      try {
        if (fsOps.statSync(file).mtimeMs < cutoff) fsOps.unlinkSync(file)
      } catch {}
    }
  }

  function readJson(file) {
    if (!fsOps.existsSync(file)) return { exists: false, value: null }
    let stat
    try { stat = fsOps.statSync(file) } catch { return { exists: true, corrupt: true } }
    if (stat.size > MAX_BYTES) return { exists: true, corrupt: true }
    try {
      const value = JSON.parse(fsOps.readFileSync(file, 'utf8'))
      return { exists: true, value }
    } catch {
      return { exists: true, corrupt: true }
    }
  }

  function copyCorrupt(file, ownerId) {
    const stamp = nowValue(now)
    const prefix = `${ownerId}.corrupt-${stamp}`
    let chosen = path.join(homeRoot, `${prefix}.json`)
    let suffix = 1
    while (fsOps.existsSync(chosen)) chosen = path.join(homeRoot, `${prefix}-${suffix++}.json`)
    try { fsOps.copyFileSync(file, chosen) } catch {}
    const copies = fsOps.readdirSync(homeRoot)
      .filter((name) => name.startsWith(`${ownerId}.corrupt-`) && name.endsWith('.json'))
      .map((name) => ({ name, mtime: (() => { try { return fsOps.statSync(path.join(homeRoot, name)).mtimeMs } catch { return 0 } })() }))
      .sort((a, b) => a.mtime - b.mtime)
    while (copies.length > 5) {
      const item = copies.shift()
      try { fsOps.unlinkSync(path.join(homeRoot, item.name)) } catch {}
    }
  }

  function atomicWrite(file, value) {
    const serialized = JSON.stringify(value, null, 2) + '\n'
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw fail('too_large')
    const temp = `${file}.${process.pid}.${nowValue(now)}.tmp`
    try {
      fsOps.writeFileSync(temp, serialized, 'utf8')
      fsOps.renameSync(temp, file)
    } catch (error) {
      try { if (fsOps.existsSync(temp)) fsOps.unlinkSync(temp) } catch {}
      throw error
    }
  }

  function loadInventory(ownerId) {
    const file = inventoryPath(ownerId)
    if (memoryInventory.has(ownerId)) return clone(memoryInventory.get(ownerId))
    const parsed = readJson(file)
    if (!parsed.exists || parsed.corrupt || !Array.isArray(parsed.value)) {
      const inventory = starterInventory(isoAt(now))
      memoryInventory.set(ownerId, inventory)
      return clone(inventory)
    }
    memoryInventory.set(ownerId, parsed.value)
    return clone(parsed.value)
  }

  function inventory(ownerId) {
    const file = inventoryPath(ownerId)
    const parsed = readJson(file)
    const result = loadInventory(ownerId)
    if (!parsed.exists) atomicWrite(file, result)
    return result
  }

  function sanitizeLayout(ownerId, raw, inventoryList) {
    const normalized = normalizeLayout({ ...(raw || {}), ownerId })
    const accepted = []
    const dropped = { total: normalized.dropped.total, reasons: { ...normalized.dropped.reasons } }
    for (const placement of normalized.layout.placements) {
      const checked = validateLayout([...accepted, placement], inventoryList)
      if (!checked.ok) {
        dropped.total += 1
        for (const item of checked.violations) dropped.reasons[item.rule] = (dropped.reasons[item.rule] || 0) + 1
      } else accepted.push(placement)
    }
    return {
      layout: { ...normalized.layout, ownerId, placements: accepted },
      dropped,
    }
  }

  function load(ownerId) {
    cleanupTemps()
    const file = homePath(ownerId)
    const inventoryList = loadInventory(ownerId)
    const parsed = readJson(file)
    if (!parsed.exists) {
      return { layout: defaultLayout(ownerId), inventory: inventoryList, status: 'new', dropped: { total: 0, reasons: {} } }
    }
    if (parsed.corrupt || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
      copyCorrupt(file, ownerId)
      return { layout: defaultLayout(ownerId), inventory: inventoryList, status: 'corrupt', dropped: { total: 0, reasons: {} } }
    }
    const clean = sanitizeLayout(ownerId, parsed.value, inventoryList)
    return { layout: clean.layout, inventory: inventoryList, status: 'ok', dropped: clean.dropped }
  }

  function enqueue(ownerId, operation) {
    const prior = queues.get(ownerId) || Promise.resolve()
    const next = prior.catch(() => {}).then(operation)
    const tracked = next.finally(() => {
      if (queues.get(ownerId) === tracked) queues.delete(ownerId)
    })
    tracked.catch(() => {})
    queues.set(ownerId, tracked)
    return next
  }

  function save(ownerId, { placements, expectedRevision } = {}) {
    return enqueue(ownerId, () => {
      const current = load(ownerId)
      if (current.layout.revision !== expectedRevision) return { ok: false, code: 'revision_conflict', layout: current.layout }
      if (!Array.isArray(placements) || placements.length > MAX_PLACEMENTS) return { ok: false, code: 'too_many', layout: current.layout }
      const checked = validateLayout(placements, current.inventory)
      if (!checked.ok) return { ok: false, code: 'invalid_layout', violations: checked.violations, layout: current.layout }
      const layout = {
        ...current.layout,
        schemaVersion: 1,
        ownerId,
        revision: current.layout.revision + 1,
        updatedAt: isoAt(now),
        placements: clone(placements),
      }
      atomicWrite(homePath(ownerId), layout)
      return { ok: true, layout }
    })
  }

  function reset(ownerId, { expectedRevision } = {}) {
    return save(ownerId, { expectedRevision, placements: [] })
  }

  return Object.freeze({ homePath, load, save, reset, inventory })
}

export function createHomeStore(options) {
  return makeStore(options)
}
