import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  CENTRAL_CIRCLE, ENTRANCE, FOYER_ITEMS, FOYER_QUEUES, MAIN_AISLE,
  PLAZA, RECEPTION, WAITING_SEATS,
} from '../office-layout.js'
import { foyerPlanIssues, foyerSceneSpec } from '../foyer-scene-spec.js'

const reception = {
  x0: RECEPTION.x - RECEPTION.width / 2,
  x1: RECEPTION.x + RECEPTION.width / 2,
  z0: RECEPTION.z0,
  z1: RECEPTION.z1,
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const contains = (r, p, pad = 0) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.z > r.z0 - pad && p.z < r.z1 + pad

test('S1 combined geometry keeps both receptions, 27 items, 42 queue points and 4 waiting seats separate', () => {
  const queues = Object.values(FOYER_QUEUES).flat()
  assert.equal(FOYER_ITEMS.length, 27)
  assert.equal(queues.length, 42)
  assert.equal(WAITING_SEATS.length, 4)
  assert.deepEqual(foyerPlanIssues(), [])
  assert.ok(FOYER_ITEMS.every(item => !overlaps(reception, item)), 'central reception overlaps a foyer item')
  for (const [kind, points] of [['queue', queues], ['waiting', WAITING_SEATS]]) {
    for (const p of points) {
      assert.equal(contains(reception, p), false, `${kind} point enters central reception`)
      assert.equal(p.x > MAIN_AISLE.x0 && p.x < MAIN_AISLE.x1 && p.z >= 8 && p.z <= PLAZA.z1, false, `${kind} point enters main aisle`)
      assert.equal(p.z >= 13 && p.z <= 16 && p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1, false, `${kind} point enters entrance bridge`)
      assert.ok(Math.hypot(p.x - CENTRAL_CIRCLE.cx, p.z - CENTRAL_CIRCLE.cz) >= CENTRAL_CIRCLE.r, `${kind} point enters central circle`)
    }
  }
})

test('S1 scene contract names every item once and only floor blockers collide', () => {
  const spec = foyerSceneSpec()
  assert.deepEqual(spec.map(item => item.entityName), FOYER_ITEMS.map(item => `foyer-${item.id}`))
  assert.deepEqual(spec.filter(item => item.collides).map(item => item.id), FOYER_ITEMS.filter(item => item.blocksFloor !== false).map(item => item.id))
  assert.equal(new Set(spec.map(item => item.entityName)).size, 27)
})

test('S1 polling stays additive and consumer visits have no automatic trigger outside real waiting questions', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  assert.equal((app.match(/setInterval\(pollFoyer, 30_000\)/g) || []).length, 1)
  assert.equal((app.match(/setInterval\(pollMilestones, 30_000\)/g) || []).length, 1)
  assert.equal((app.match(/setInterval\(poll, POLL_MS\)/g) || []).length, 1)
  assert.match(app, /async function pollFoyer\(\) \{\s*if \(document\.hidden\) return/)
  assert.match(app, /async function pollMilestones\(\) \{\s*if \(document\.hidden\) return/)
  const calls = [...app.matchAll(/director\.visitConsumer\(/g)]
  assert.equal(calls.length, 1, 'only real-question waiting may start a visit automatically')
  assert.match(app, /selectWaitingPeople\(latestState\?\.waiting, WAITING_CAPACITY\)/)
  assert.match(app.slice(calls[0].index, calls[0].index + 220), /mode: 'waiting'/)
})

test('S1 interface remains free of commerce wording', async () => {
  const files = await Promise.all(['app.js', 'foyer-panels.js', 'foyer-paths.js'].map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')))
  const source = files.join('\n').toLowerCase()
  assert.doesNotMatch(source, /(?:购买|余额|价格|金额|\bbuy\b|\bpay\b|\bbalance\b|\bprice\b)/)
})
