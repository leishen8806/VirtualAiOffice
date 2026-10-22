import { getItem, ITEM_IDS } from './town/home-catalog.mjs'
import { canPlace, occupiedCells } from './town/home-space.mjs'
import { resolveDragStart, trayModel } from './home-editor-logic.js'

const rotations = [0, 90, 180, 270]
const clone = (value) => JSON.parse(JSON.stringify(value))
const sameItem = (a, b) => a?.itemId === b?.itemId

export function pointerToCell(local, item, rot) {
  const rotated = rot === 90 || rot === 270
  const width = rotated ? item.footprint.d : item.footprint.w
  const depth = rotated ? item.footprint.w : item.footprint.d
  const centerX = Number(local?.x) / 0.5 + 8
  const centerZ = Number(local?.z) / 0.5 + 6
  const rawCx = Math.round(centerX - width / 2)
  const rawCz = Math.round(centerZ - depth / 2)
  return {
    cx: Math.max(0, Math.min(16 - width, rawCx)),
    cz: Math.max(0, Math.min(12 - depth, rawCz)),
  }
}

export function previewState(layout, inventory, candidate) {
  const item = getItem(candidate?.itemId)
  const cells = item ? occupiedCells(item, candidate.cx, candidate.cz, candidate.rot) : []
  const result = canPlace(layout, inventory, candidate)
  const first = result.violations?.[0]?.rule
  const reasonText = first === 5
    ? '会挡住入口'
    : first === 1
      ? '超出房间'
      : first === 2 || first === 3
        ? '与已有物品重叠'
        : first === 4
          ? '墙面物品要贴墙'
          : first === 6
            ? '会把通道堵死'
            : result.ok ? '' : '当前摆放不可用'
  return { ok: result.ok, violations: result.violations || [], cells, reasonText }
}

export function createHistory({ limit = 50 } = {}) {
  const past = []
  const future = []
  const cap = Math.max(1, Math.floor(limit))
  const snapshot = (layout) => clone(layout)
  return {
    push(layout) {
      past.push(snapshot(layout))
      while (past.length > cap) past.shift()
      future.length = 0
    },
    undo(current) {
      if (!past.length) return null
      future.push(snapshot(current))
      return past.pop()
    },
    redo(current) {
      if (!future.length) return null
      past.push(snapshot(current))
      return future.pop()
    },
    canUndo() { return past.length > 0 },
    canRedo() { return future.length > 0 },
    reset(layout) {
      past.length = 0
      future.length = 0
      return snapshot(layout)
    },
  }
}

export function restoreDefault(layout) {
  return { ...clone(layout), placements: [] }
}

export { resolveDragStart, rotations, sameItem, trayModel }
