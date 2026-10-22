import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CORRIDOR_X, FOYER_ITEMS, FOYER_QUEUES, FOYER_RECEPTION, MAIN_AISLE, RECEPTION, SEATS, foyerTrip, workHome } from '../office-layout.js'
import { foyerPlanIssues, foyerSceneSpec } from '../foyer-scene-spec.js'

test('all 27 planned items have one named entity and the correct collision contract', () => {
  const spec = foyerSceneSpec()
  assert.equal(spec.length, 27)
  assert.deepEqual(spec.map(x => x.id), FOYER_ITEMS.map(x => x.id))
  assert.equal(new Set(spec.map(x => x.entityName)).size, 27)
  assert.deepEqual(spec.filter(x => x.collides).map(x => x.id), FOYER_ITEMS.filter(x => x.blocksFloor !== false).map(x => x.id))
  assert.deepEqual(spec.filter(x => x.existing).map(x => x.id), ['lounge_west_sofa', 'lounge_coffee_table', 'lounge_east_sofa'])
})

test('planned collisions keep the aisle, entrance, circle and all 42 queue points clear', () => {
  assert.deepEqual(foyerPlanIssues(), [])
  assert.equal(Object.values(FOYER_QUEUES).flat().length, 42)
})

test('dynamic panel mounts are explicit and both desks keep independent boundaries', () => {
  const panels = foyerSceneSpec().flatMap(x => x.panels.map(panel => `foyer-panel-${panel}`))
  assert.deepEqual(panels, ['foyer-panel-handoff', 'foyer-panel-attendance', 'foyer-panel-notice'])
  assert.deepEqual(RECEPTION, { x: CORRIDOR_X, z: 5.5, width: 5.5, z0: 3.8, z1: 6.5, bypassX: -2 })
  assert.deepEqual(FOYER_RECEPTION, { x0: 8.5, x1: 14.5, z0: 8.5, z1: 9.5 })
  assert.equal(FOYER_ITEMS.find(x => x.id === 'reception_desk').name, '前厅服务台')
  assert.equal(MAIN_AISLE.x0, 0); assert.equal(MAIN_AISLE.x1, 4)
})

test('all 25 homes detour around the restored central reception on foyer trips', () => {
  for (const seat of Object.values(SEATS)) {
    const path = foyerTrip(workHome(seat), 'A1')
    assert.ok(path.some(p => p.x === RECEPTION.bypassX), JSON.stringify(path))
  }
})

test('scene source uses the shared plan, restores the old counter and stays offline', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  assert.match(app, /foyerSceneSpec\(\)/)
  assert.match(app, /furnitureCollision\.add\(reception, 'receptionCounter'\)/)
  assert.match(app, /reception\.name = 'entrance-reception'/)
  assert.equal(app.match(/reception-brand-logo/g)?.length, 1)
  assert.match(app, /foyer-service-desk-label/)
  assert.doesNotMatch(app, /fetch\(['"]https?:\/\//)
  assert.doesNotMatch(app, /innerHTML\s*\+=/)
})
