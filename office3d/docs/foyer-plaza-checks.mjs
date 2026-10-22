import assert from 'node:assert/strict'
import { CENTRAL_CIRCLE, ENVELOPE, FOYER_ITEMS, FOYER_QUEUES, FOYER_TARGETS, MAIN_AISLE, PLAZA } from '../office-layout.js'
import { foyerPlanIssues, foyerSceneSpec } from '../foyer-scene-spec.js'

const GRID = 0.5, CLEARANCE = 0.25, PERSON_GAP = 0.52
const foyer = { x0: ENVELOPE.x0, x1: ENVELOPE.x1, z0: 8, z1: 13 }
const mainLane = { ...MAIN_AISLE, z0: 8, z1: PLAZA.z1 }
const items = FOYER_ITEMS.map(r => ({ ...r }))
if (process.env.FOYER_CHECK_MUTATE === 'overlap') Object.assign(items[1], { x0: items[0].x0, x1: items[0].x1, z0: items[0].z0, z1: items[0].z1 })
const targets = Object.entries(FOYER_TARGETS).map(([id, p]) => ({ id, ...p }))
const queues = FOYER_QUEUES

const onGrid = n => Number.isInteger(n / GRID)
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const inWalkArea = p =>
  (p.z >= foyer.z0 && p.z <= foyer.z1 && p.x >= foyer.x0 && p.x <= foyer.x1) ||
  (p.z >= foyer.z1 && p.z <= PLAZA.z0 && p.x >= mainLane.x0 && p.x <= mainLane.x1) ||
  (p.z >= PLAZA.z0 && p.z <= PLAZA.z1 && p.x >= PLAZA.x0 && p.x <= PLAZA.x1)
const blocked = p => items.filter(r => r.blocksFloor).some(r => p.x > r.x0 - CLEARANCE && p.x < r.x1 + CLEARANCE && p.z > r.z0 - CLEARANCE && p.z < r.z1 + CLEARANCE)
const inMainLane = p => p.x >= mainLane.x0 && p.x <= mainLane.x1 && p.z >= mainLane.z0 && p.z <= mainLane.z1
const rectHitsCircle = r => Math.hypot(Math.max(r.x0, Math.min(CENTRAL_CIRCLE.cx, r.x1)) - CENTRAL_CIRCLE.cx, Math.max(r.z0, Math.min(CENTRAL_CIRCLE.cz, r.z1)) - CENTRAL_CIRCLE.cz) < CENTRAL_CIRCLE.r
const key = p => `${p.x},${p.z}`
function reachable(start, goal) {
  const open = [start], seen = new Set([key(start)])
  while (open.length) {
    const p = open.shift()
    if (p.x === goal.x && p.z === goal.z) return true
    for (const [dx, dz] of [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID]]) {
      const n = { x: p.x + dx, z: p.z + dz }, k = key(n)
      if (!seen.has(k) && inWalkArea(n) && !blocked(n)) { seen.add(k); open.push(n) }
    }
  }
  return false
}
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`) } catch (e) { console.log(`FAIL ${name}: ${e.message}`); process.exitCode = 1 }
}

check('所有坐标均落在 0.5 米网格', () => {
  for (const r of items) for (const n of [r.x0, r.x1, r.z0, r.z1, r.center.x, r.center.z, r.size.x, r.size.z]) assert.ok(onGrid(n), `${r.name}=${n}`)
  for (const p of [...targets, ...Object.values(queues).flat()]) for (const n of [p.x, p.z]) assert.ok(onGrid(n), `${p.id || 'queue'}=${n}`)
})
check('每个摆件都有一个具名可达点', () => { assert.deepEqual(targets.map(x => x.id).sort(), items.map(x => x.id).sort()) })
check('摆件互不重叠', () => { for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) assert.ok(!overlaps(items[i], items[j]), `${items[i].name}/${items[j].name}`) })
check('4 米主通道及门洞无摆件', () => { for (const r of items.filter(r => r.blocksFloor)) assert.ok(!overlaps(r, mainLane), r.name) })
check('广场中央 8 米开阔圆无摆件', () => { for (const r of items.filter(r => r.blocksFloor && r.z1 >= PLAZA.z0)) assert.ok(!rectHitsCircle(r), r.name) })
check('所有站位点与排队点均可走', () => { for (const p of [...targets, ...Object.values(queues).flat()]) assert.ok(inWalkArea(p) && !blocked(p), `${p.id || 'queue'} ${key(p)}`) })
check('正门到每个站位点存在 0.5 米网格路径', () => { for (const p of targets) assert.ok(reachable({ x: 2, z: 12 }, p), p.id) })
check('每个消费点六人排队保持人员净距', () => { for (const [name, list] of Object.entries(queues)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z) >= PERSON_GAP, `${name} ${i}/${j}`) })
check('六人排队不占门洞和主通道', () => { for (const [name, list] of Object.entries(queues)) for (const p of list) assert.ok(!inMainLane(p), `${name} ${key(p)}`) })
check('27 个场景实体逐项对应规划', () => { assert.equal(foyerSceneSpec().length, 27); foyerSceneSpec().forEach((x, i) => { assert.equal(x.id, FOYER_ITEMS[i].id); assert.equal(x.entityName, `foyer-${x.id}`) }) })
check('碰撞实体避开主通道、门洞、中央圆和 42 个排队点', () => { assert.deepEqual(foyerPlanIssues(), []) })
check('动态面板挂载点固定', () => { assert.equal(foyerSceneSpec().flatMap(x => x.panels).join(','), 'handoff,attendance,notice') })

console.log(`SUMMARY items=${items.length} targets=${targets.length} queues=${Object.keys(queues).length} queueSlots=${Object.values(queues).flat().length} result=${process.exitCode ? 'FAIL' : 'PASS'}`)

// 在办公室页面控制台粘贴运行；输出实体、包围盒、碰撞标记与当前渲染预算。
export const BROWSER_FOYER_CHECK = String.raw`(async () => {
  const office = window.__office, tolerance = .05
  const rows = office.foyerSpec.map(item => {
    const object = office.scene.getObjectByName('foyer-' + item.id)
    const box = object && new office.THREE.Box3().setFromObject(object)
    const inside = !!box && box.min.x >= item.x0 - tolerance && box.max.x <= item.x1 + tolerance && box.min.z >= item.z0 - tolerance && box.max.z <= item.z1 + tolerance
    return { id: item.id, found: !!object, inside, collision: object?.userData.foyerCollision === true, min: box && [box.min.x, box.min.z], max: box && [box.max.x, box.max.z] }
  })
  const result = {
    entities: rows.length,
    found: rows.filter(x => x.found).length,
    inBounds: rows.filter(x => x.inside).length,
    collisions: rows.filter(x => x.collision).length,
    invalid: rows.filter(x => !x.found || !x.inside),
    collisionWorld: office.furnitureCollision.stats(),
    render: { calls: office.renderer.info.render.calls, triangles: office.renderer.info.render.triangles, lights: office.quality.metrics.lights, tier: office.quality.tier },
  }
  console.table(rows); console.log(result); return result
})()`
