import assert from 'node:assert/strict'
import test from 'node:test'
import { officeDestinationsForLayout } from '../office-destinations.js'
import { resolveOfficeLayout } from '../office-layout.js'
import { WH_R1_CAMERA_VIEWS } from '../dr-wh-r1-zones.js'

test('aligned V3 destinations match every registered region name and target', () => {
  const layout = resolveOfficeLayout('?layout=3&align=1')
  const destinations = officeDestinationsForLayout(layout)
  assert.equal(destinations.length, layout.regions.length)
  assert.deepEqual(destinations.map(({ regionId, label }) => [regionId, label]), layout.regions.map(({ id, name }) => [String(id), name]))
  assert.ok(destinations.every(({ id }) => id.startsWith('office:align:region:')))
  for (const destination of destinations) {
    const region = layout.regions.find(({ id }) => String(id) === destination.regionId)
    const [x, y, z] = destination.focus.t
    assert.equal(y, 0)
    assert.ok(x >= region.x0 && x <= region.x1, `${destination.label}: x lies in its registered region`)
    assert.ok(z >= region.z0 && z <= region.z1, `${destination.label}: z lies in its registered region`)
    assert.ok(destination.focus.r > 0)
  }
})

test('R1 latest office destinations use all 14 named region rectangles', () => {
  const layout = resolveOfficeLayout('?place=drlife-office&layout=3&align=1&officeSample=1&r1=1')
  const destinations = officeDestinationsForLayout(layout)
  assert.equal(layout.variant, 'r1')
  assert.equal(destinations.length, 14)
  assert.deepEqual(destinations.map(({ regionId, label }) => [regionId, label]), layout.regions.map(({ id, name }) => [String(id), name]))
  assert.ok(destinations.every(({ id }) => id.startsWith('office:r1:region:')))
  for (const destination of destinations) {
    const region = layout.regions.find(({ id }) => String(id) === destination.regionId)
    assert.deepEqual(destination.focus.t, [(region.x0 + region.x1) / 2, 0, (region.z0 + region.z1) / 2])
  }
  assert.ok(!layout.regionFocus?.['02'])
  assert.ok(!layout.regionFocus?.['06'])
})

test('legacy office layout does not get remapped through the V3 region registry', () => {
  assert.deepEqual(officeDestinationsForLayout(resolveOfficeLayout('')), [])
})

test('warehouse east annex uses the approved no-count label and preserves its stable view ID and target', () => {
  const view = WH_R1_CAMERA_VIEWS.find(({ id }) => id === 'eastAnnex')
  assert.equal(view.label, '东侧附建区')
  assert.deepEqual(view.t, [-119, 0, 4])
})
