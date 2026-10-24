import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { CAMPUS_PAVING, ENVELOPE, FOYER_ITEMS, PLAZA, SERVICE_PASSAGE, WAITING_SEATS, WAREHOUSE, WEST_WALK } from '../office-layout.js'
import { thinPartOffsets, warehouseShellSpec } from '../warehouse-shell.js'

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..')
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0

test('warehouse shell follows the reviewed footprint, doors and static collision contract', () => {
  const spec = warehouseShellSpec(), byName = new Map(spec.map(part => [part.name, part]))
  assert.ok((WAREHOUSE.x1 - WAREHOUSE.x0) * (WAREHOUSE.z1 - WAREHOUSE.z0) >= 336)
  assert.deepEqual(byName.get('warehouse-door-east'), { name: 'warehouse-door-east', x0: -14.5, x1: -14, z0: 24.5, z1: 26.5, collides: false, dynamic: false })
  assert.deepEqual(['warehouse-door-cargo-1', 'warehouse-door-cargo-2', 'warehouse-door-cargo-3'].map(name => [byName.get(name).x0, byName.get(name).x1]), [[-40, -36], [-31, -27], [-22, -18]])
  assert.ok(spec.every(part => !part.dynamic))
  assert.ok(spec.every(part => part.x0 >= CAMPUS_PAVING.x0 && part.x1 <= CAMPUS_PAVING.x1 && part.z0 >= CAMPUS_PAVING.z0 && part.z1 <= CAMPUS_PAVING.z1))
  assert.ok(spec.every(part => !overlap(part, PLAZA) && !overlap(part, ENVELOPE)))
  assert.ok(spec.every(part => FOYER_ITEMS.every(item => !overlap(part, item))))
  assert.ok(spec.every(part => WAITING_SEATS.every(seat => !(seat.x > part.x0 && seat.x < part.x1 && seat.z > part.z0 && seat.z < part.z1))))
  assert.ok(spec.filter(part => part.collides).every(part => !overlap(part, WEST_WALK) && !overlap(part, SERVICE_PASSAGE)))
  assert.equal(byName.get('warehouse-roof').collides, false)
  assert.equal(byName.get('warehouse-parking').collides, false)
  assert.equal(byName.get('warehouse-sign').collides, false)
  assert.equal(byName.get('warehouse-entrance').collides, false)
})

test('warehouse shell remains offline, static and free of business operations', async () => {
  const source = await readFile(path.join(root, 'warehouse-shell.js'), 'utf8')
  assert.doesNotMatch(source, /innerHTML|\beval\b|fetch\s*\(|Math\.random|performance\.now/)
  assert.doesNotMatch(source, /\b(?:buy|price|balance|wallet)\b/i)
  assert.doesNotMatch(source, /userData\.dynamic\s*=\s*true/)
  assert.match(source, /userData\.warehouseEntrance\s*=\s*true/)
})

test('warehouse wall decals and ground lines keep a stable depth offset', () => {
  const offsets = thinPartOffsets()
  assert.deepEqual(offsets.filter(part => part.surface === 'wall').map(part => part.name), [
    'warehouse-door-east', 'warehouse-door-east-frame',
    'warehouse-door-cargo-1', 'warehouse-door-cargo-1-frame',
    'warehouse-door-cargo-2', 'warehouse-door-cargo-2-frame',
    'warehouse-door-cargo-3', 'warehouse-door-cargo-3-frame',
    'warehouse-sign',
  ])
  assert.ok(offsets.filter(part => part.surface === 'wall').every(part => part.offset >= .12))
  assert.deepEqual(offsets.filter(part => part.surface === 'ground'), [
    { name: 'warehouse-parking-lines', surface: 'ground', offset: .045 },
  ])
  assert.ok(offsets.filter(part => part.surface === 'ground').every(part => part.offset >= .03))
})

test('app wiring stays minimal and does not add unsafe APIs', async () => {
  const current = await readFile(path.join(root, 'app.js'), 'utf8')
  const beforeNav = await readFile(path.resolve(root, 'tests/fixtures/historical', 'office3d-backup-nav-1d', 'app.js'), 'utf8')
  const backup = await readFile(path.resolve(root, 'tests/fixtures/historical', 'office3d-backup-s2-2', 'app.js'), 'utf8')
  const old = new Set(backup.split(/\r?\n/)), priorAdded = beforeNav.split(/\r?\n/).filter(line => !old.has(line))
  const h2b = priorAdded.filter(line => line.includes("latestState?.stale?.active"))
  assert.equal(h2b.length, 2, 'H2b 仅允许两行降级态派发禁用接线')
  const added = priorAdded.filter(line => !h2b.includes(line))
  assert.ok(added.length <= 30, `新增 ${added.length} 行`)
  // NAV-1d 行预算绑定其真实合入快照，不累计后续已验收的 O6 / rev3 接线。
  const navAfter = await readFile(path.resolve(root, 'tests/fixtures/historical/office3d-backup-nav-1d/app.after-merge-before-control-room-camera-fix.js'), 'utf8')
  const navOld = new Set(beforeNav.split(/\r?\n/)), navAdded = navAfter.split(/\r?\n/).filter(line => !navOld.has(line))
  assert.match(current, /CAMPUS_MODE/)
  const controlRoom = navAdded.filter(line => /controlRoom|CONTROL_ROOM|buildDrControlRoom|keepRoots/.test(line))
  assert.ok(controlRoom.length <= 10, `调度中控室接线新增 ${controlRoom.length} 行`)
  assert.ok(navAdded.filter(line => !controlRoom.includes(line)).length <= 80, `NAV-1d 新增 ${navAdded.length - controlRoom.length} 行`)
  assert.doesNotMatch([...priorAdded, ...navAdded].join('\n'), /innerHTML|\beval\b|fetch\s*\(|Math\.random|\b(?:buy|price|balance|wallet)\b/i)
})
