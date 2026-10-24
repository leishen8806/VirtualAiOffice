import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3, workHome, createOfficeNavigation } from '../office-layout.js'
import { createDirector } from '../director.js'
import { createSampleBatch } from '../office-vis2/batch.js'
import { appendOfficePlaza } from '../office-vis2/plaza.js'
import { buildOfficeCompletionVisual } from '../office-vis2/completion.js'
import { buildOfficePlazaHost } from '../office-vis2/plaza-host.js'
import { createFurnitureCollision } from '../furniture-collision.js'

function actor(id, seat) {
  const home = workHome(seat), group = new THREE.Group()
  group.position.set(home.x, 0, home.z)
  return { id, name: id, home, stand: { ...home }, char: { group, pose: { sit: 1, walk: 0, carry: 0, type: 0, lounge: 0, phase: 0 } }, act: null }
}
const directorFor = (v, extra = {}) => createDirector({ layout: LAYOUT_V3, views: new Map([[v.id, v]]), board: {}, layer: {}, project: {}, ...extra })
function settle(d, v) {
  for (let i = 0; i < 7200 && v.act; i++) d.update(1 / 30)
  assert.equal(v.act === null, true, `${v.id} finishes`)
  assert.equal(d.stats().timeouts, 0)
}

test('OF-R1 all 25 actual director arrivals and departures settle without director warnings', () => {
  const warnings = [], warn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    for (const [id, seat] of Object.entries(LAYOUT_V3.seats)) {
      const v = actor(id, seat), d = directorFor(v)
      assert.equal(d.arrive(v), true); settle(d, v)
      assert.equal(v.away, false)
      assert.ok(Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .01)
      let departed = 0
      assert.equal(d.goHome(v, () => { departed++; v.away = true; v.char.group.visible = false }), true); settle(d, v)
      assert.equal(departed, 1)
      assert.equal(v.away, true)
      assert.equal(v.char.group.visible, false)
      d.clear()
    }
    assert.equal(warnings.filter(args => String(args[0]).startsWith('[director]')).length, 0)
  } finally { console.warn = warn }
})

test('OF-R1 only explicit furniture obstruction is caught; navigation and collision TypeErrors propagate', () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    for (const action of ['arrive', 'goHome', 'travel', 'event']) {
      const v = actor('Lead', LAYOUT_V3.seats.Lead)
      const target = actor('PM', LAYOUT_V3.seats.PM)
      const invoke = d => {
        if (action === 'travel') return d.travel(v, [{ x: v.home.x + 1, z: v.home.z }], v.home, false)
        if (action !== 'event') return d[action](v)
        d.enqueue({ kind: 'report', from: v.id, to: target.id, text: 'fixture' }); d.update(0)
        return v.act !== null
      }
      const collision = { seatBody: () => null, hit: () => null, route: () => null }
      const context = { views: new Map([[v.id, v], [target.id, target]]), furnitureCollision: collision }
      assert.equal(invoke(directorFor(v, context)), false, action + ' blocked')
      const failure = new TypeError('fixture collision bug')
      collision.route = () => { throw failure }
      assert.throws(() => invoke(directorFor(v, context)), error => error === failure, action)
    }
    const v = actor('Lead', LAYOUT_V3.seats.Lead), navigation = createOfficeNavigation(LAYOUT_V3)
    const failure = new TypeError('fixture navigation bug')
    const d = directorFor(v, { navigation: { ...navigation, officeExit() { throw failure } } })
    assert.throws(() => d.arrive(v), error => error === failure)
    assert.throws(() => d.goHome(v), error => error === failure)
  } finally { console.warn = warn }
})

test('OF-R1 plaza quality propagates through both owners, with complete instancing and fewer low triangles', () => {
  const results = []
  for (const low of [false, true]) {
    const root = new THREE.Group(), batch = createSampleBatch(THREE)
    const placements = appendOfficePlaza({ THREE, batch, layout: LAYOUT_V3, low })
    const built = batch.build(root, 'plaza')
    assert.equal(placements.length, 30)
    assert.ok(placements.every(p => p.bounds.y1 > .5 && p.bounds.x1 > p.bounds.x0))
    const completion = buildOfficeCompletionVisual({ THREE, root, layout: LAYOUT_V3, low })
    assert.equal(completion.summary().plazaTriangles, built.triangles(), 'completion forwards its quality tier to actual plaza geometry')
    const collision = createFurnitureCollision()
    const host = buildOfficePlazaHost({ THREE, root, layout: LAYOUT_V3, search: '?officeSample=1', collision, low })
    const mesh = root.getObjectByName('office-plaza-props')
    results.push({ plaza: built.triangles(), completion: completion.summary().triangles, host: mesh.geometry.attributes.position.count / 3, ids: host.placements.map(p => p.id) })
    assert.equal(collision.stats().bodies, 30)
    host.dispose(); completion.dispose(); built.dispose()
    assert.equal(collision.stats().bodies, 0)
    assert.equal(root.children.length, 0)
  }
  assert.deepEqual(results[0].ids, results[1].ids)
  for (const key of ['plaza', 'completion', 'host']) assert.ok(results[1][key] < results[0][key], `${key}: low ${results[1][key]} < high ${results[0][key]}`)
  console.log('OF-R1 plaza triangles', JSON.stringify(results))
})
