import assert from 'node:assert/strict'
import test from 'node:test'
import { starterInventory, defaultLayout, occupiedCells } from '../town/home-space.mjs'
import { getItem } from '../town/home-catalog.mjs'
import { ITEM_IDS } from '../town/home-catalog.mjs'
import { createHistory, pointerToCell, previewState, resolveDragStart, restoreDefault, trayModel } from '../home-editor-logic.mjs'
import { resolveDragStart as browserResolveDragStart, trayModel as browserTrayModel } from '../home-editor-logic.js'

test('pointerToCell centers, snaps and clamps every bed rotation', () => {
  const item = getItem('bed_single')
  for (const rot of [0, 90, 180, 270]) {
    const cell = pointerToCell({ x: 0, z: 0 }, item, rot)
    const cells = occupiedCells(item, cell.cx, cell.cz, rot)
    assert.equal(Math.min(...cells.map((entry) => entry.cx)), cell.cx)
    assert.equal(Math.min(...cells.map((entry) => entry.cz)), cell.cz)
    assert.ok(cell.cx >= 0 && cell.cz >= 0)
    assert.ok(cell.cx <= 16 && cell.cz <= 12)
  }
  assert.deepEqual(pointerToCell({ x: -99, z: -99 }, item, 0), { cx: 0, cz: 0 })
  assert.deepEqual(pointerToCell({ x: 99, z: 99 }, item, 0), { cx: 12, cz: 9 })
})

test('previewState returns usable reason text for invalid placement', () => {
  const inventory = starterInventory('test')
  const layout = defaultLayout('demo')
  const candidate = { itemInstanceId: 'bed_single#1', itemId: 'bed_single', cx: 0, cz: 0, rot: 0, layer: 'floor' }
  assert.equal(previewState(layout, inventory, candidate).ok, true)
  const blocked = { ...candidate, cx: 6, cz: 10 }
  const result = previewState(layout, inventory, blocked)
  assert.equal(result.ok, false)
  assert.ok(result.reasonText)
})

test('history keeps immutable snapshots and clears redo on new work', () => {
  const history = createHistory({ limit: 2 })
  const a = { placements: [] }
  const b = { placements: [{ itemId: 'chair_wood' }] }
  const c = { placements: [{ itemId: 'table_dining' }] }
  history.push(a); history.push(b); history.push(c)
  const undo = history.undo(c)
  undo.placements[0].itemId = 'mutated'
  assert.equal(history.canRedo(), true)
  assert.equal(history.redo(b).placements[0].itemId, 'table_dining')
  history.push(a)
  assert.equal(history.canRedo(), false)
})

test('trayModel filters placed instances by item kind', () => {
  const inventory = starterInventory('test')
  const layout = {
    placements: [
      { itemInstanceId: 'chair_wood#1', itemId: 'chair_wood' },
      { itemInstanceId: 'bed_single#1', itemId: 'bed_single' },
    ],
  }
  const model = trayModel(inventory, layout)
  const chair = model.find((entry) => entry.itemId === 'chair_wood')
  const bed = model.find((entry) => entry.itemId === 'bed_single')
  assert.deepEqual(chair, { itemId: 'chair_wood', owned: 3, placed: 1, remaining: 2, disabled: false, inconsistent: false })
  assert.deepEqual(bed, { itemId: 'bed_single', owned: 1, placed: 1, remaining: 0, disabled: true, inconsistent: false })
  for (const entry of model.filter((item) => !['chair_wood', 'bed_single'].includes(item.itemId))) {
    assert.equal(entry.placed, 0)
    assert.equal(entry.remaining, entry.owned)
    assert.equal(entry.disabled, false)
  }
})

test('trayModel keeps every demo item non-negative', () => {
  const inventory = starterInventory('test')
  const ids = ['bed_single', 'sofa_two', 'rug_round', 'table_dining', 'chair_wood', 'chair_wood', 'plant_pot', 'lamp_floor', 'bookshelf', 'frame_art', 'tv_stand']
  const seen = new Map()
  const placements = ids.map((itemId) => {
    const index = (seen.get(itemId) || 0) + 1
    seen.set(itemId, index)
    return { itemInstanceId: `${itemId}#${index}`, itemId }
  })
  const model = trayModel(inventory, { placements })
  assert.equal(model.length, ITEM_IDS.length)
  for (const entry of model) {
    assert.ok(entry.remaining >= 0)
    assert.equal(entry.inconsistent, false)
  }
  const chair = model.find((entry) => entry.itemId === 'chair_wood')
  assert.equal(chair.remaining, 1)
})

test('trayModel restores one kind without changing other kinds after deletion', () => {
  const inventory = starterInventory('test')
  const full = { placements: inventory.filter((entry) => entry.itemId === 'chair_wood').map((entry) => ({ ...entry })) }
  const before = trayModel(inventory, full)
  const after = trayModel(inventory, { placements: full.placements.slice(1) })
  const chairBefore = before.find((entry) => entry.itemId === 'chair_wood')
  const chairAfter = after.find((entry) => entry.itemId === 'chair_wood')
  assert.deepEqual(chairBefore, { itemId: 'chair_wood', owned: 3, placed: 3, remaining: 0, disabled: true, inconsistent: false })
  assert.deepEqual(chairAfter, { itemId: 'chair_wood', owned: 3, placed: 2, remaining: 1, disabled: false, inconsistent: false })
  for (const item of after.filter((entry) => entry.itemId !== 'chair_wood')) {
    assert.equal(item.placed, 0)
    assert.equal(item.remaining, item.owned)
  }
})

test('trayModel reports inconsistent duplicate or foreign placements without negatives', () => {
  const inventory = starterInventory('test')
  const model = trayModel(inventory, {
    placements: [
      { itemInstanceId: 'chair_wood#1', itemId: 'chair_wood' },
      { itemInstanceId: 'chair_wood#1', itemId: 'chair_wood' },
    ],
  })
  const chair = model.find((entry) => entry.itemId === 'chair_wood')
  assert.equal(chair.remaining, 1)
  assert.equal(chair.inconsistent, false)
  assert.ok(model.every((entry) => entry.remaining >= 0))
})

test('trayModel returns starter counts for an empty layout', () => {
  const inventory = starterInventory('test')
  const model = trayModel(inventory, defaultLayout('demo'))
  assert.deepEqual(model.find((entry) => entry.itemId === 'chair_wood'), {
    itemId: 'chair_wood', owned: 3, placed: 0, remaining: 3, disabled: false, inconsistent: false,
  })
  assert.deepEqual(model.find((entry) => entry.itemId === 'plant_pot'), {
    itemId: 'plant_pot', owned: 2, placed: 0, remaining: 2, disabled: false, inconsistent: false,
  })
  assert.deepEqual(model.find((entry) => entry.itemId === 'frame_art'), {
    itemId: 'frame_art', owned: 2, placed: 0, remaining: 2, disabled: false, inconsistent: false,
  })
  for (const entry of model.filter((item) => !['chair_wood', 'plant_pot', 'frame_art'].includes(item.itemId))) {
    assert.equal(entry.owned, 1)
    assert.equal(entry.remaining, 1)
  }
})

test('trayModel clamps impossible overuse and marks it inconsistent', () => {
  const inventory = starterInventory('test')
  const model = trayModel(inventory, {
    placements: Array.from({ length: 4 }, () => ({ itemInstanceId: 'chair_wood#1', itemId: 'chair_wood' })),
  })
  const chair = model.find((entry) => entry.itemId === 'chair_wood')
  assert.equal(chair.remaining, 0)
  assert.equal(chair.disabled, true)
  assert.equal(chair.inconsistent, true)
})

test('browser tray model stays identical to the Node tray model', () => {
  const inventory = starterInventory('test')
  const layout = {
    placements: [
      { itemInstanceId: 'chair_wood#1', itemId: 'chair_wood' },
      { itemInstanceId: 'bed_single#1', itemId: 'bed_single' },
    ],
  }
  assert.deepEqual(browserTrayModel(inventory, layout), trayModel(inventory, layout))
})

test('resolveDragStart chooses an existing hit over pending placement', () => {
  const pending = { itemId: 'chair_wood', itemInstanceId: 'chair_wood#2', rot: 0 }
  assert.deepEqual(resolveDragStart(pending, 'rug_round#1'), {
    kind: 'existing',
    id: 'rug_round#1',
    clearPending: true,
  })
  assert.deepEqual(resolveDragStart(pending, null), {
    kind: 'pending',
    id: 'chair_wood#2',
    clearPending: false,
  })
  assert.deepEqual(resolveDragStart(null, 'rug_round#1'), {
    kind: 'existing',
    id: 'rug_round#1',
    clearPending: false,
  })
  assert.equal(resolveDragStart(null, null), null)
})

test('browser and Node drag decisions stay identical', () => {
  const inputs = [
    [{ itemId: 'chair_wood', itemInstanceId: 'chair_wood#2', rot: 0 }, 'rug_round#1'],
    [{ itemId: 'chair_wood', itemInstanceId: 'chair_wood#2', rot: 0 }, null],
    [null, 'rug_round#1'],
    [null, null],
  ]
  for (const [pending, pickedId] of inputs) {
    assert.deepEqual(browserResolveDragStart(pending, pickedId), resolveDragStart(pending, pickedId))
  }
})

test('restoreDefault clears placements but preserves other document fields', () => {
  const layout = { schemaVersion: 1, ownerId: 'demo', revision: 3, placements: [{ itemId: 'chair_wood' }] }
  assert.deepEqual(restoreDefault(layout), { schemaVersion: 1, ownerId: 'demo', revision: 3, placements: [] })
})
