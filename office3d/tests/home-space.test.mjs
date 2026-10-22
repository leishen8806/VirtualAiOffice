import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  CATALOG,
  CATEGORIES,
  ITEM_IDS,
  LAYERS,
  getItem,
} from '../town/home-catalog.mjs'
import {
  CELL_M,
  GRID_W,
  GRID_D,
  MAX_PLACEMENTS,
  DOOR,
  ENTRY_CLEAR,
  cellCenter,
  occupiedCells,
  validateLayout,
  canPlace,
  placeItem,
  moveItem,
  rotateItem,
  removeItem,
  starterInventory,
  defaultLayout,
  normalizeLayout,
  layoutStats,
} from '../town/home-space.mjs'

const inventory = (entries) => entries.map((itemId, index) => ({
  itemInstanceId: `${itemId}#${index + 1}`,
  itemId,
  acquiredAt: '2026-10-21T00:00:00Z',
  source: 'starter',
}))

const p = (itemInstanceId, itemId, cx, cz, rot = 0, layer = getItem(itemId)?.layer) => ({
  itemInstanceId, itemId, cx, cz, rot, layer,
})

test('catalog has every v1 item exactly and is frozen', () => {
  assert.deepEqual(ITEM_IDS, ['bed_single', 'sofa_two', 'table_dining', 'chair_wood', 'desk_work', 'wardrobe', 'bookshelf', 'tv_stand', 'plant_pot', 'lamp_floor', 'rug_round', 'frame_art'])
  assert.deepEqual(CATEGORIES, ['furniture', 'decor', 'plant', 'light', 'wall_art', 'rug'])
  assert.deepEqual(LAYERS, ['floor', 'wall', 'rug'])
  const expected = [
    ['bed_single', '单人床', 'furniture', 4, 3, 0.6, 'floor', true],
    ['sofa_two', '双人沙发', 'furniture', 4, 2, 0.8, 'floor', true],
    ['table_dining', '餐桌', 'furniture', 3, 2, 0.75, 'floor', true],
    ['chair_wood', '木椅', 'furniture', 1, 1, 0.9, 'floor', true],
    ['desk_work', '书桌', 'furniture', 3, 2, 0.75, 'floor', true],
    ['wardrobe', '衣柜', 'furniture', 2, 1, 2, 'floor', true],
    ['bookshelf', '书架', 'furniture', 3, 1, 1.8, 'wall', true],
    ['tv_stand', '电视柜', 'furniture', 3, 1, 0.5, 'wall', true],
    ['plant_pot', '盆栽', 'plant', 1, 1, 1, 'floor', true],
    ['lamp_floor', '落地灯', 'light', 1, 1, 1.6, 'floor', true],
    ['rug_round', '圆形地毯', 'rug', 4, 4, 0.02, 'rug', false],
    ['frame_art', '挂画', 'wall_art', 2, 1, 1, 'wall', false],
  ]
  for (const [id, name, category, w, d, height, layer, blocks] of expected) {
    const value = getItem(id)
    assert.deepEqual(value, { id, name, category, footprint: { w, d }, height, layer, blocks, stackable: false })
    assert.ok(Object.isFrozen(value))
    assert.ok(Object.isFrozen(value.footprint))
    assert.throws(() => { value.id = 'bad' }, TypeError)
  }
  assert.ok(Object.isFrozen(CATALOG))
  assert.equal(getItem('not-in-catalog'), null)
})

test('space constants and cell centers use local half-metre coordinates', () => {
  assert.equal(CELL_M, 0.5)
  assert.equal(GRID_W, 16)
  assert.equal(GRID_D, 12)
  assert.equal(MAX_PLACEMENTS, 60)
  assert.deepEqual(DOOR, { cx0: 7, cx1: 8, cz: 11 })
  assert.deepEqual(ENTRY_CLEAR, { cx0: 6, cx1: 9, cz0: 10, cz1: 11 })
  assert.deepEqual(cellCenter(0, 0), { x: 0.25, z: 0.25 })
  assert.deepEqual(cellCenter(15, 11), { x: 7.75, z: 5.75 })
})

test('occupiedCells supports all rotations and rejects invalid rotation', () => {
  const bed = getItem('bed_single')
  assert.equal(occupiedCells(bed, 2, 3, 0).length, 12)
  assert.deepEqual(occupiedCells(bed, 2, 3, 90)[0], { cx: 2, cz: 3 })
  assert.deepEqual(occupiedCells(bed, 2, 3, 90).at(-1), { cx: 4, cz: 6 })
  assert.deepEqual(occupiedCells(bed, 2, 3, 180).at(-1), { cx: 5, cz: 5 })
  assert.deepEqual(occupiedCells(bed, 2, 3, 270).at(-1), { cx: 4, cz: 6 })
  assert.equal(occupiedCells(bed, 0, 0, 45), null)
})

test('boundary rule accepts exact fit and rejects one cell out', () => {
  const inv = inventory(['bed_single', 'sofa_two', 'table_dining'])
  assert.equal(validateLayout([p('bed_single#1', 'bed_single', 12, 9)], inv).ok, true)
  const result = validateLayout([p('bed_single#1', 'bed_single', 13, 9)], inv)
  assert.equal(result.ok, false)
  assert.ok(result.violations.some((item) => item.rule === 1))
})

test('floor overlap rule rejects exact and obvious overlaps', () => {
  const inv = inventory(['bed_single', 'sofa_two', 'table_dining'])
  const exact = validateLayout([p('bed_single#1', 'bed_single', 0, 0), p('sofa_two#2', 'sofa_two', 4, 0)], inv)
  assert.equal(exact.ok, true)
  for (const second of [p('sofa_two#2', 'sofa_two', 2, 1), p('table_dining#3', 'table_dining', 0, 0)]) {
    const result = validateLayout([p('bed_single#1', 'bed_single', 0, 0), second], inv)
    assert.equal(result.ok, false)
    assert.ok(result.violations.some((item) => item.rule === 2))
  }
})

test('rug overlap is allowed over floor but rugs cannot overlap rugs', () => {
  const inv = inventory(['rug_round', 'rug_round', 'bed_single'])
  assert.equal(validateLayout([p('rug_round#1', 'rug_round', 0, 0), p('bed_single#3', 'bed_single', 0, 0)], inv).ok, true)
  const result = validateLayout([p('rug_round#1', 'rug_round', 0, 0), p('rug_round#2', 'rug_round', 1, 1)], inv)
  assert.equal(result.ok, false)
  assert.ok(result.violations.some((item) => item.rule === 3))
})

test('wall rule accepts four walls, rejects loose and door placements', () => {
  const inv = inventory(['frame_art', 'frame_art', 'frame_art', 'frame_art', 'frame_art'])
  const valid = [
    p('frame_art#1', 'frame_art', 0, 0),
    p('frame_art#2', 'frame_art', 0, 11),
    p('frame_art#3', 'frame_art', 0, 5, 90),
    p('frame_art#4', 'frame_art', 15, 5, 90),
  ]
  assert.equal(validateLayout(valid, inv).ok, true)
  for (const bad of [
    p('frame_art#5', 'frame_art', 4, 4),
    p('frame_art#5', 'frame_art', 7, 11),
    p('frame_art#5', 'frame_art', 7, 11, 90),
  ]) {
    const result = validateLayout([bad], inv)
    assert.equal(result.ok, false)
    assert.ok(result.violations.some((item) => item.rule === 4))
  }
})

test('entry clear rule rejects blocking chair and allows rug', () => {
  const inv = inventory(['chair_wood', 'rug_round'])
  const bad = validateLayout([p('chair_wood#1', 'chair_wood', 6, 10)], inv)
  assert.equal(bad.ok, false)
  assert.ok(bad.violations.some((item) => item.rule === 5))
  assert.equal(validateLayout([p('rug_round#2', 'rug_round', 6, 8)], inv).ok, true)
})

test('connectivity rule detects a sealed blocking item', () => {
  const items = ['chair_wood', 'chair_wood', 'chair_wood', 'chair_wood', 'chair_wood', 'chair_wood', 'chair_wood', 'chair_wood', 'chair_wood']
  const inv = inventory(items)
  const ring = [
    p('chair_wood#1', 'chair_wood', 4, 4),
    p('chair_wood#2', 'chair_wood', 5, 4),
    p('chair_wood#3', 'chair_wood', 6, 4),
    p('chair_wood#4', 'chair_wood', 4, 5),
    p('chair_wood#5', 'chair_wood', 6, 5),
    p('chair_wood#6', 'chair_wood', 4, 6),
    p('chair_wood#7', 'chair_wood', 5, 6),
    p('chair_wood#8', 'chair_wood', 6, 6),
    p('chair_wood#9', 'chair_wood', 5, 5),
  ]
  const result = validateLayout(ring, inv)
  assert.equal(result.ok, false)
  assert.ok(result.violations.some((item) => item.rule === 6))
  assert.equal(validateLayout([p('chair_wood#1', 'chair_wood', 5, 5)], inventory(['chair_wood'])).ok, true)
})

test('inventory, duplicate, unknown, bad rotation and count rules are explicit', () => {
  const noInventory = validateLayout([p('chair_wood#1', 'chair_wood', 0, 0)], [])
  assert.ok(noInventory.violations.some((item) => item.rule === 'inventory'))
  const duplicate = validateLayout([p('chair_wood#1', 'chair_wood', 0, 0), p('chair_wood#1', 'chair_wood', 2, 0)], inventory(['chair_wood']))
  assert.ok(duplicate.violations.some((item) => item.rule === 'duplicate'))
  const unknown = validateLayout([p('fake#1', 'missing_item', 0, 0)], inventory(['chair_wood']))
  assert.ok(unknown.violations.some((item) => item.rule === 'unknown_item'))
  const badRot = validateLayout([p('chair_wood#1', 'chair_wood', 0, 0, 45)], inventory(['chair_wood']))
  assert.ok(badRot.violations.some((item) => item.rule === 'bad_rot'))
  const sixtyOne = Array.from({ length: 61 }, (_, index) => p(`chair_wood#${index + 1}`, 'chair_wood', index % 15, Math.floor(index / 15)))
  assert.ok(validateLayout(sixtyOne, inventory(sixtyOne.map((item) => item.itemId))).violations.some((item) => item.rule === 7))
})

test('immutable placement operations return new layouts and reject invalid changes', () => {
  const inv = inventory(['chair_wood', 'chair_wood'])
  const layout = defaultLayout('owner_1')
  const placed = placeItem(layout, inv, p('chair_wood#1', 'chair_wood', 1, 1))
  assert.equal(placed.ok, true)
  assert.deepEqual(layout.placements, [])
  const moved = moveItem(placed.layout, inv, 'chair_wood#1', 2, 2)
  assert.equal(moved.ok, true)
  assert.deepEqual(placed.layout.placements[0].cx, 1)
  const rotated = rotateItem(moved.layout, inv, 'chair_wood#1', 90)
  assert.equal(rotated.ok, true)
  const rejected = placeItem(rotated.layout, inv, p('chair_wood#1', 'chair_wood', 4, 4))
  assert.equal(rejected.ok, false)
  assert.ok(rejected.violations.some((item) => item.rule === 'duplicate'))
  const removed = removeItem(rotated.layout, 'chair_wood#1')
  assert.deepEqual(removed.placements, [])
  assert.notEqual(removed, rotated.layout)
  assert.equal(canPlace(removed, inv, p('chair_wood#2', 'chair_wood', 2, 2)).ok, true)
})

test('starter inventory and default layout are deterministic', () => {
  const items = starterInventory('2026-10-21T00:00:00Z')
  assert.equal(items.length, 16)
  assert.equal(items.filter((item) => item.itemId === 'chair_wood').length, 3)
  assert.equal(items.filter((item) => item.itemId === 'plant_pot').length, 2)
  assert.equal(items.filter((item) => item.itemId === 'frame_art').length, 2)
  assert.ok(items.every((item) => item.source === 'starter' && item.acquiredAt === '2026-10-21T00:00:00Z'))
  assert.deepEqual(defaultLayout('owner_1'), { schemaVersion: 1, ownerId: 'owner_1', revision: 0, updatedAt: null, placements: [] })
})

test('normalizeLayout safely drops garbage and preserves only the schema', () => {
  const raw = {
    schemaVersion: 99,
    ownerId: 'x'.repeat(100),
    revision: -1,
    updatedAt: 'x'.repeat(100),
    unexpected: true,
    placements: [
      p('chair_wood#1', 'chair_wood', 0, 0),
      p('chair_wood#1', 'chair_wood', 1, 0),
      p('bad#1', 'chair_wood', -1, 0),
      p('bad#2', 'chair_wood', 0, 0, 45),
      p('bad#3', 'missing', 0, 0),
      null,
      p('', 'chair_wood', 0, 0),
    ],
  }
  const result = normalizeLayout(raw)
  assert.equal(result.layout.schemaVersion, 1)
  assert.equal(result.layout.ownerId.length, 40)
  assert.equal(result.layout.placements.length, 1)
  assert.equal(result.dropped.total, 6)
  assert.deepEqual(Object.keys(result.layout).sort(), ['ownerId', 'placements', 'revision', 'schemaVersion', 'updatedAt'])
  for (const value of [null, [], {}, { placements: 'bad' }, 'bad']) assert.doesNotThrow(() => normalizeLayout(value))
})

test('layoutStats is deterministic and counts blocking cells', () => {
  const layout = { placements: [p('chair_wood#1', 'chair_wood', 0, 0), p('rug_round#2', 'rug_round', 0, 0)] }
  assert.deepEqual(layoutStats(layout), {
    count: 2,
    byCategory: { furniture: 1, rug: 1 },
    blockingCells: 1,
    freeCells: 191,
  })
  assert.deepEqual(layoutStats(layout), layoutStats(layout))
})

test('pure modules contain no forbidden runtime or commerce dependencies', () => {
  for (const file of ['town/home-catalog.mjs', 'town/home-space.mjs']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\b(?:THREE|document|window|fetch|Math\.random|Date\.now|performance\.now|innerHTML|eval)\b/)
    assert.doesNotMatch(source, /\b(?:buy|purchase|price|balance|wallet)\b/i)
  }
})
