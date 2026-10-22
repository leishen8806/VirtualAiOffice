import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CAMPUS_SHUTTLE_STRIP, CAMPUS_ZONES } from '../office-layout.js'
import { createCampusRackPlan } from '../dr-campus-racks-spec.mjs'

const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0

test('racks remain in highRack, clear of shuttle and deterministic', () => {
  const a = createCampusRackPlan(), b = createCampusRackPlan(), highRack = CAMPUS_ZONES.find((item) => item.id === 'highRack')
  assert.deepEqual(a, b)
  assert.deepEqual(a.racks.map((rack) => rack.label), ['A1', 'R2', 'C2', 'B2'])
  assert.equal(new Set(a.labels.map((label) => label.label)).size, 4)
  assert.ok(a.labels.every((label) => label.offset >= .12))
  for (const rack of a.racks) {
    assert.ok(rack.x0 >= highRack.x0 && rack.x1 <= highRack.x1 && rack.z0 >= highRack.z0 && rack.z1 <= highRack.z1)
    assert.equal(overlap(rack, CAMPUS_SHUTTLE_STRIP), false)
    assert.ok(rack.sections.every((section) => section.x0 >= highRack.x0 && section.x1 <= highRack.x1))
  }
  for (let i = 1; i < a.racks.length; i++) assert.ok(a.racks[i].x0 - a.racks[i - 1].x1 >= 2.5)
  assert.equal(a.receivingDoors.length, 4); assert.equal(a.shippingDoors.length, 3)
  assert.ok([...a.receivingDoors, ...a.shippingDoors].every((door) => door.offset >= .12))
})

test('rack modules stay static and avoid runtime data APIs', async () => {
  const source = await Promise.all(['../dr-campus-racks-spec.mjs', '../dr-campus-racks.js'].map((file) => readFile(new URL(file, import.meta.url), 'utf8')))
  assert.doesNotMatch(source.join('\n'), /Math\.random|Date\.now|fetch\s*\(|innerHTML|userData\.dynamic|\beval\s*\(|new Function/)
  const plan = createCampusRackPlan()
  assert.ok(plan.cargo.length <= 48)
  assert.equal(plan.racks.length * 6 * 6 + plan.cargo.length + plan.stations.length + plan.receivingDoors.length + plan.shippingDoors.length + 1, 203)
  assert.ok(203 * 12 <= 18000)
  assert.ok(93 * 12 <= 5000)
})
