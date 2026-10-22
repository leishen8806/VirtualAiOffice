import { trayModel } from './home-editor-logic.js'
import { CATALOG } from './town/home-catalog.mjs'

export const INVENTORY_CATEGORIES = Object.freeze({
  furniture: '家具', decor: '装饰', plant: '植物', light: '灯', wall_art: '挂画', rug: '地毯',
})

export function canShowHomeEntry({ fullAccess = false, lan = false, wall = false } = {}) {
  return fullAccess === true && lan === false && wall === false
}

export function inventoryRows(inventory = [], layout = {}) {
  const entries = Array.isArray(inventory) ? inventory : []
  const counts = new Map(trayModel(entries, layout).map((entry) => [entry.itemId, entry]))
  return CATALOG.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    footprint: item.footprint,
    ...counts.get(item.id),
    source: entries.some((entry) => entry.itemId === item.id && entry.source && entry.source !== 'starter') ? '来源暂无' : '初始赠送',
  }))
}

export function inventorySummary(rows) {
  return rows.reduce((summary, row) => ({
    types: summary.types + Number(row.owned > 0),
    owned: summary.owned + row.owned,
    placed: summary.placed + row.placed,
    remaining: summary.remaining + row.remaining,
  }), { types: 0, owned: 0, placed: 0, remaining: 0 })
}

export function filterInventory(rows, { query = '', category = '' } = {}) {
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => (!category || row.category === category) &&
    words.every((word) => `${row.name} ${row.id} ${INVENTORY_CATEGORIES[row.category]}`.toLowerCase().includes(word)))
    .slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
