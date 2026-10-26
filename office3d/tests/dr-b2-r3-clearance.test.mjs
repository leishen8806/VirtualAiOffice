import assert from 'node:assert/strict'
import test from 'node:test'
import { CAMPUS_BUILDING, CAMPUS_DOCKS, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { createCampusRackPlan } from '../dr-campus-racks.js'
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
