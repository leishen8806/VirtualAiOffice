const ITEM_IDS = [
  'bed_single',
  'sofa_two',
  'table_dining',
  'chair_wood',
  'desk_work',
  'wardrobe',
  'bookshelf',
  'tv_stand',
  'plant_pot',
  'lamp_floor',
  'rug_round',
  'frame_art',
]

export function trayModel(inventory, layout) {
  const entries = Array.isArray(inventory) ? inventory : []
  const inventoryIds = new Set(entries.map((entry) => entry.itemInstanceId))
  return ITEM_IDS.map((itemId) => {
    const owned = entries.filter((entry) => entry.itemId === itemId).length
    const used = (layout?.placements || []).filter((entry) =>
      entry.itemId === itemId && inventoryIds.has(entry.itemInstanceId)
    ).length
    const inconsistent = used > owned
    const remaining = Math.max(0, owned - used)
    return { itemId, owned, placed: used, remaining, disabled: remaining === 0, inconsistent }
  })
}

export function resolveDragStart(pending, pickedId) {
  if (pickedId) {
    return { kind: 'existing', id: pickedId, clearPending: Boolean(pending) }
  }
  if (pending?.itemInstanceId) {
    return { kind: 'pending', id: pending.itemInstanceId, clearPending: false }
  }
  return null
}

export function validateItemParameter(value) {
  return typeof value === 'string' && ITEM_IDS.includes(value) ? value : null
}
