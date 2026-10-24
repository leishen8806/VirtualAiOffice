import test from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { monitorScreenFit } from '../office-furniture-v2.js'
import { buildOpenOfficeDeskGroups } from '../office-open-desk-groups.js'
import { buildOfficePlants } from '../office-plants.js'
import { buildOfficeFoyerFurniture } from '../office-foyer-furniture.js'
import { buildOfficeFloorPattern } from '../office-floor-pattern.js'

const host = factory => { const scene = new THREE.Scene(); const root = new THREE.Group(); scene.add(root); const value = factory({ THREE, root, layout: LAYOUT_V3, low: false }); return { scene, root, value } }

test('R3-R B desk groups use measured monitor fit and instanced batches', () => {
  const { root, value } = host(buildOpenOfficeDeskGroups)
  assert.equal(value.seats.length, 25)
  assert.equal(value.monitorSource, 'MONITOR_GLASS_SOURCE')
  assert.equal(value.summary().calls, 4)
  assert.equal(root.children.length, 1)
  assert.ok(value.summary().triangles > 0)
  const fit = monitorScreenFit({ x: value.seats[0].x, y: .76, z: value.seats[0].z - .17, yaw: 0 })
  assert.ok(fit.width > 0 && fit.height > 0 && fit.offset >= .001)
  value.dispose()
})

test('R3-R B plants expose three requested placement classes', () => {
  const { value } = host(buildOfficePlants)
  assert.equal(value.placements.pots.length, 4)
  assert.equal(value.placements.planters.length, 2)
  assert.equal(value.placements.flowerbeds.length, 2)
  assert.equal(value.summary().calls, 3)
  value.dispose()
})

test('R3-R B foyer furniture reads frozen foyer geometry', () => {
  const { value } = host(buildOfficeFoyerFurniture)
  assert.equal(value.summary().counters, 2)
  assert.equal(value.summary().sofas, 2)
  assert.equal(value.summary().seats, 4)
  value.dispose()
})

test('R3-R B floor pattern creates parameterized concentric rings', () => {
  const { value } = host(buildOfficeFloorPattern)
  assert.deepEqual(value.radii, [6.2, 7.5, 8.8])
  assert.equal(value.summary().calls, 1)
  assert.equal(value.summary().center.x, LAYOUT_V3.ring.center.x)
  value.dispose()
})

test('R3-R B factories accept the host module contract and clean up', () => {
  for (const factory of [buildOpenOfficeDeskGroups, buildOfficePlants, buildOfficeFoyerFurniture, buildOfficeFloorPattern]) {
    const { scene, root, value } = host(factory)
    assert.equal(scene.children.includes(root), true)
    value.dispose()
    assert.equal(root.children.length, 0)
  }
})


test('R3-R B modules stay independent of host wiring and network APIs', () => {
  for (const file of ['office-open-desk-groups.js', 'office-plants.js', 'office-foyer-furniture.js', 'office-floor-pattern.js']) {
    const source = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    for (const token of ['app.js', 'ui.js', 'index.html', 'fetch(', 'Date.now', 'Math.random', 'server.mjs']) assert.equal(source.includes(token), false)
  }
})






