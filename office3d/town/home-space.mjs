import { getItem } from './home-catalog.mjs'

export const CELL_M = 0.5
export const GRID_W = 16
export const GRID_D = 12
export const MAX_PLACEMENTS = 60
export const DOOR = Object.freeze({ cx0: 7, cx1: 8, cz: 11 })
export const ENTRY_CLEAR = Object.freeze({ cx0: 6, cx1: 9, cz0: 10, cz1: 11 })

const ROTATIONS = new Set([0, 90, 180, 270])
const LAYER_SET = new Set(['floor', 'wall', 'rug'])
const clone = (value) => JSON.parse(JSON.stringify(value))
const keyOf = (cx, cz) => `${cx},${cz}`
const inside = (cx, cz) => cx >= 0 && cx < GRID_W && cz >= 0 && cz < GRID_D
const neighbours = (cx, cz) => [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]]
const isDoorCell = (cx, cz) => cz === DOOR.cz && cx >= DOOR.cx0 && cx <= DOOR.cx1
const inEntry = (cx, cz) =>
  cx >= ENTRY_CLEAR.cx0 && cx <= ENTRY_CLEAR.cx1 && cz >= ENTRY_CLEAR.cz0 && cz <= ENTRY_CLEAR.cz1
const detail = (text) => String(text).slice(0, 40)
const violation = (rule, instanceId, text) => ({ rule, instanceId: instanceId || 'unknown', detail: detail(text) })

export function cellCenter(cx, cz) {
  return { x: (cx + 0.5) * CELL_M, z: (cz + 0.5) * CELL_M }
}

export function occupiedCells(item, cx, cz, rot) {
  if (!item || !ROTATIONS.has(rot)) return null
  const w = rot === 90 || rot === 270 ? item.footprint.d : item.footprint.w
  const d = rot === 90 || rot === 270 ? item.footprint.w : item.footprint.d
  const cells = []
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) cells.push({ cx: cx + x, cz: cz + z })
  }
  return cells
}

function placementCells(placement) {
  const item = getItem(placement.itemId)
  return item ? occupiedCells(item, placement.cx, placement.cz, placement.rot) : null
}

function basicPlacementViolations(placement, inventoryIds, seen) {
  const out = []
  const instanceId = placement?.itemInstanceId
  if (!placement || typeof placement !== 'object' || Array.isArray(placement)) {
    return [violation('inventory', instanceId, '摆放记录无效')]
  }
  if (typeof instanceId !== 'string' || instanceId.length === 0) out.push(violation('inventory', instanceId, '物品实例编号缺失'))
  if (!getItem(placement.itemId)) out.push(violation('unknown_item', instanceId, '目录中没有该物品'))
  if (!inventoryIds.has(instanceId)) out.push(violation('inventory', instanceId, '物品不在库存'))
  if (seen.has(instanceId)) out.push(violation('duplicate', instanceId, '同一实例重复摆放'))
  if (!ROTATIONS.has(placement.rot)) out.push(violation('bad_rot', instanceId, '旋转角度无效'))
  const item = getItem(placement.itemId)
  if (item && placement.layer !== item.layer) out.push(violation('inventory', instanceId, '层级与目录不一致'))
  if (!LAYER_SET.has(placement.layer)) out.push(violation('inventory', instanceId, '层级无效'))
  if (![placement.cx, placement.cz].every(Number.isInteger)) out.push(violation(1, instanceId, '坐标必须是整数'))
  return out
}

function reachableCells(blocked) {
  const starts = [[7, 10], [8, 10]].filter(([cx, cz]) => inside(cx, cz) && !blocked.has(keyOf(cx, cz)))
  const seen = new Set(starts.map(([cx, cz]) => keyOf(cx, cz)))
  const queue = starts.slice()
  while (queue.length) {
    const [cx, cz] = queue.shift()
    for (const [nx, nz] of neighbours(cx, cz)) {
      const key = keyOf(nx, nz)
      if (inside(nx, nz) && !blocked.has(key) && !seen.has(key)) {
        seen.add(key)
        queue.push([nx, nz])
      }
    }
  }
  return seen
}

export function validateLayout(placements, inventory = []) {
  const list = Array.isArray(placements) ? placements : []
  const inventoryList = Array.isArray(inventory) ? inventory : []
  const inventoryIds = new Set(inventoryList.map((entry) => entry?.itemInstanceId))
  const violations = []
  const seen = new Set()
  const prepared = []

  for (const placement of list) {
    violations.push(...basicPlacementViolations(placement, inventoryIds, seen))
    const instanceId = placement?.itemInstanceId
    if (instanceId) seen.add(instanceId)
    const item = getItem(placement?.itemId)
    const cells = item && ROTATIONS.has(placement?.rot) && Number.isInteger(placement?.cx) && Number.isInteger(placement?.cz)
      ? occupiedCells(item, placement.cx, placement.cz, placement.rot)
      : null
    if (!cells) continue
    prepared.push({ placement, item, cells })
    if (cells.some(({ cx, cz }) => !inside(cx, cz))) {
      violations.push(violation(1, instanceId, '物品超出房间边界'))
    }
  }

  if (list.length > MAX_PLACEMENTS) {
    violations.push(violation(7, list[MAX_PLACEMENTS]?.itemInstanceId, '摆放数量超过 60 件'))
  }

  const floorCells = new Map()
  const rugCells = new Map()
  for (const { placement, item, cells } of prepared) {
    const target = item.layer === 'floor' ? floorCells : item.layer === 'rug' ? rugCells : null
    if (!target) continue
    for (const cell of cells) {
      const key = keyOf(cell.cx, cell.cz)
      const previous = target.get(key)
      if (previous) {
        violations.push(violation(item.layer === 'floor' ? 2 : 3, placement.itemInstanceId, '同层物品占用格重叠'))
      } else {
        target.set(key, placement.itemInstanceId)
      }
    }
  }

  for (const { placement, item, cells } of prepared) {
    if (item.layer === 'wall') {
      const rotated = placement.rot === 90 || placement.rot === 270
      const width = rotated ? item.footprint.d : item.footprint.w
      const depth = rotated ? item.footprint.w : item.footprint.d
      const northSouth = depth === 1 && cells.some(({ cz }) => cz === 0 || cz === GRID_D - 1)
      const eastWest = width === 1 && cells.some(({ cx }) => cx === 0 || cx === GRID_W - 1)
      const touchesWall = northSouth || eastWest
      const inDoor = cells.some(({ cx, cz }) => isDoorCell(cx, cz))
      if (!touchesWall) violations.push(violation(4, placement.itemInstanceId, '墙面物品必须贴墙'))
      if (inDoor) violations.push(violation(4, placement.itemInstanceId, '墙面物品不得占门洞'))
    }
    if (item.blocks && cells.some(({ cx, cz }) => inEntry(cx, cz))) {
      violations.push(violation(5, placement.itemInstanceId, '阻挡物品占用入口净空'))
    }
  }

  const blocked = new Set()
  for (const { item, cells } of prepared) {
    if (item.blocks) for (const { cx, cz } of cells) if (inside(cx, cz)) blocked.add(keyOf(cx, cz))
  }
  const reachable = reachableCells(blocked)
  for (const { placement, item, cells } of prepared) {
    if (!item.blocks) continue
    const accessible = cells.some(({ cx, cz }) =>
      neighbours(cx, cz).some(([nx, nz]) => inside(nx, nz) && !blocked.has(keyOf(nx, nz)) && reachable.has(keyOf(nx, nz)))
    )
    if (!accessible) violations.push(violation(6, placement.itemInstanceId, '门到物品无连通空格'))
  }
  return { ok: violations.length === 0, violations }
}

export function canPlace(layout, inventory, candidate) {
  const placements = Array.isArray(layout?.placements) ? layout.placements : []
  return validateLayout([...placements, candidate], inventory)
}

function resultFor(layout, placements, inventory) {
  const checked = validateLayout(placements, inventory)
  if (!checked.ok) return checked
  return { ok: true, layout: { ...layout, placements, revision: (layout.revision || 0) + 1 } }
}

export function placeItem(layout, inventory, candidate) {
  const placements = Array.isArray(layout?.placements) ? layout.placements : []
  return resultFor(layout, [...placements, clone(candidate)], inventory)
}

export function moveItem(layout, inventory, instanceId, cx, cz) {
  const placements = (layout?.placements || []).map((entry) =>
    entry.itemInstanceId === instanceId ? { ...entry, cx, cz } : entry
  )
  return resultFor(layout, placements, inventory)
}

export function rotateItem(layout, inventory, instanceId, rot) {
  const placements = (layout?.placements || []).map((entry) =>
    entry.itemInstanceId === instanceId ? { ...entry, rot } : entry
  )
  return resultFor(layout, placements, inventory)
}

export function removeItem(layout, instanceId) {
  return {
    ...layout,
    placements: (layout?.placements || []).filter((entry) => entry.itemInstanceId !== instanceId),
    revision: (layout?.revision || 0) + 1,
  }
}

export function starterInventory(acquiredAt = null) {
  const counts = { chair_wood: 3, plant_pot: 2, frame_art: 2 }
  const entries = []
  for (const itemId of ['bed_single', 'sofa_two', 'table_dining', 'chair_wood', 'desk_work', 'wardrobe', 'bookshelf', 'tv_stand', 'plant_pot', 'lamp_floor', 'rug_round', 'frame_art']) {
    const count = counts[itemId] || 1
    for (let index = 1; index <= count; index++) {
      entries.push({ itemInstanceId: `${itemId}#${index}`, itemId, acquiredAt, source: 'starter' })
    }
  }
  return entries
}

export function defaultLayout(ownerId) {
  return { schemaVersion: 1, ownerId, revision: 0, updatedAt: null, placements: [] }
}

export function normalizeLayout(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const dropped = { total: 0, reasons: {} }
  const placements = []
  const seen = new Set()
  const sourcePlacements = Array.isArray(source.placements) ? source.placements : []
  for (const candidate of sourcePlacements) {
    const reason = !candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      ? 'record'
      : !getItem(candidate.itemId)
        ? 'unknown_item'
        : !ROTATIONS.has(candidate.rot)
          ? 'bad_rot'
          : !Number.isInteger(candidate.cx) || !Number.isInteger(candidate.cz)
            ? 'coordinate'
            : (occupiedCells(getItem(candidate.itemId), candidate.cx, candidate.cz, candidate.rot) || []).some(({ cx, cz }) => !inside(cx, cz))
              ? 'coordinate'
            : typeof candidate.itemInstanceId !== 'string' || candidate.itemInstanceId.length === 0
              ? 'instance'
            : !LAYER_SET.has(candidate.layer) || candidate.layer !== getItem(candidate.itemId).layer
              ? 'layer'
              : seen.has(candidate.itemInstanceId)
                ? 'duplicate'
                : null
    if (reason) {
      dropped.total += 1
      dropped.reasons[reason] = (dropped.reasons[reason] || 0) + 1
      continue
    }
    seen.add(candidate.itemInstanceId)
    placements.push({
      itemInstanceId: String(candidate.itemInstanceId).slice(0, 80),
      itemId: candidate.itemId,
      cx: candidate.cx,
      cz: candidate.cz,
      rot: candidate.rot,
      layer: candidate.layer,
    })
  }
  return {
    layout: {
      schemaVersion: 1,
      ownerId: typeof source.ownerId === 'string' ? source.ownerId.slice(0, 40) : '',
      revision: Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
      updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt.slice(0, 80) : null,
      placements,
    },
    dropped,
  }
}

export function layoutStats(layout) {
  const placements = Array.isArray(layout?.placements) ? layout.placements : []
  const byCategory = {}
  const blocking = new Set()
  for (const placement of placements) {
    const item = getItem(placement.itemId)
    if (!item) continue
    byCategory[item.category] = (byCategory[item.category] || 0) + 1
    if (item.blocks) for (const cell of occupiedCells(item, placement.cx, placement.cz, placement.rot) || []) blocking.add(keyOf(cell.cx, cell.cz))
  }
  return {
    count: placements.length,
    byCategory,
    blockingCells: blocking.size,
    freeCells: GRID_W * GRID_D - blocking.size,
  }
}
