import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS_BUILDING, CAMPUS_DOCKS, CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from '../office-layout.js'
import { buildCampusRacks, createCampusRackPlan } from '../dr-campus-racks.js'
import { shuttlePlan } from '../dr-campus-shuttle-logic.js'

const separation = (first, second) => {
  const x = Math.max(first.x0 - second.x1, second.x0 - first.x1, 0)
  const z = Math.max(first.z0 - second.z1, second.z0 - first.z1, 0)
  return Math.hypot(x, z)
}

test('R3 fixes four five-section rack rows at the approved 12.7m bounds', () => {
  const plan = createCampusRackPlan()
  assert.deepEqual(plan.racks.map(({ label, x0, x1, z0, z1, sections }) => ({
    label, x0, x1, z0, z1, sections: sections.length,
  })), [
    { label: 'A1', x0: -122, x1: -120, z0: -17.7, z1: -5, sections: 5 },
    { label: 'R2', x0: -116, x1: -114, z0: -17.7, z1: -5, sections: 5 },
    { label: 'C2', x0: -110, x1: -108, z0: -17.7, z1: -5, sections: 5 },
    { label: 'B2', x0: -104, x1: -102, z0: -17.7, z1: -5, sections: 5 },
  ])
  for (const rack of plan.racks) {
    assert.equal(rack.sections.length, 5)
    for (const section of rack.sections) assert.ok(Math.abs(section.z1 - section.z0 - 2.54) < 1e-9)
  }
})

test('R4 keeps the real label world box clear of dock work and aligns its four row names', () => {
  const root = new THREE.Group()
  const fillTextCalls = []
  const canvasTex = (width, height, draw) => {
    draw({
      fillRect() {}, strokeRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {}, set font(value) {}, set textAlign(value) {},
      fillText(text, x, y) { fillTextCalls.push({ text, x, y }) },
    }, width, height)
    const texture = new THREE.Texture()
    texture.image = { width, height }
    return texture
  }
  const layout = { shuttle: CAMPUS_SHUTTLE_STRIP, zones: CAMPUS_ZONES }
  const built = buildCampusRacks({ THREE, root, canvasTex, layout, quality: { tier: 'high' }, replaceRackCell: true })
  const label = root.getObjectByName('campus-rack-labels')
  const box = new THREE.Box3().setFromObject(label)
  const labelBounds = { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }

  assert.ok(Math.abs(labelBounds.x0 - -121.8) < 1e-5)
  assert.ok(Math.abs(labelBounds.x1 - -102.2) < 1e-5)
  assert.ok(labelBounds.z0 >= -4.95 && labelBounds.z1 <= -4.85)
  assert.ok(labelBounds.x1 < CAMPUS_SHUTTLE_STRIP.x0, 'label does not enter the shuttle strip')
  for (const dock of CAMPUS_DOCKS.filter(({ id }) => /^D0[5-8]$/.test(id))) {
    const closest = Math.min(separation(labelBounds, dock.bay), separation(labelBounds, dock.work))
    assert.ok(closest >= .9, `label clears ${dock.id} by ${closest.toFixed(2)}m`)
  }

  assert.deepEqual(
    fillTextCalls.filter(({ text }) => ['A1', 'R2', 'C2', 'B2'].includes(text)),
    [
      { text: 'A1', x: 125, y: 68 },
      { text: 'R2', x: 375, y: 68 },
      { text: 'C2', x: 625, y: 68 },
      { text: 'B2', x: 875, y: 68 },
    ],
  )
  built.dispose()
})

test('R3 shuttle strip, wall, docks, and rail clearances obey the board ruling', () => {
  const plan = createCampusRackPlan()
  const shuttle = shuttlePlan({ shuttle: CAMPUS_SHUTTLE_STRIP })
  const rails = { x0: CAMPUS_SHUTTLE_STRIP.x0, x1: CAMPUS_SHUTTLE_STRIP.x1, z0: shuttle.path.z0 - 1.1, z1: shuttle.path.z1 + 1.1 }
  const northWallInterior = CAMPUS_BUILDING.z0 + .28

  assert.deepEqual(CAMPUS_SHUTTLE_STRIP, {
    x0: -94, x1: -90, z0: -17.7, z1: -5, kind: 'mark', label: '穿梭机展示带（示意）',
  })
  assert.ok(northWallInterior <= -17.7, 'rack north end does not embed in the north wall')
  assert.ok(Math.abs(rails.z0 - -17.65) < 1e-9)
  assert.ok(Math.abs(rails.z1 - -5.05) < 1e-9)

  const d05to08 = CAMPUS_DOCKS.filter(({ id }) => /^D0[5-8]$/.test(id))
  for (const dock of d05to08) {
    const boundaries = [...plan.racks, rails]
    for (const part of boundaries) {
      const closest = Math.min(separation(part, dock.bay), separation(part, dock.work))
      assert.ok(closest >= 1, `${part.label || 'rails'} clears ${dock.id} by ${closest.toFixed(2)}m`)
    }
  }
})
