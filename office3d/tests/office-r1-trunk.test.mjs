import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Plants } from '../office-vis2/r1-plants.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createR1Layout, R1_BOARD_TRUNK_OVERRIDES, R1_TRUNK_DIAMETER_M, r1ToWorld } from '../office-r1-layout.js'
import { R1_DATA } from '../office-r1/data.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
hooks.deregister()
const bytes = readFileSync(new URL('../assets/models/furniture/pottedPlant.glb', import.meta.url))
const A = { furn: { pottedPlant: (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene } }
const near = (a, b, tolerance = 1e-9, message = '') => assert.ok(Math.abs(a - b) <= tolerance, `${message} ${a} != ${b} (±${tolerance})`)
const rawOf = id => R1_DATA.elements.find(row => row.id === id)

// 室内登记绿植 = r1-plants.js 的同一判据（排除区 14 广场与中央大榕树 07-PL-001）；
// 这里独立重算一遍，偏离表若漏株或多株都会被抓住。
const INDOOR_PLANTS = R1_DATA.elements.filter(row => row.category === '植物总成' && row.regionId !== '14' && row.id !== '07-PL-001')
const INDOOR_TRUNK_IDS = INDOOR_PLANTS.map(row => `${row.id}-TR`)
// 登记数据的树干原值：室内 35 株一律 Ø0.16 / 高 1.0 / 底 0.45。
const REGISTERED_DIAMETER = .16

const plantsWith = elements => {
  const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  const target = elements ? { ...layout, r1: { ...layout.r1, elements } } : layout
  return { built: buildR1Plants({ THREE, root, layout: target, A, collision }), collision, root }
}
// 登记绿植自己那一批（r1-indoor-plants），不含 LOOK 补植与密化花园。
const registeredBatch = built => {
  const found = []
  built.root.traverse(node => { if (node.isMesh) found.push(node) })
  const mesh = found.find(node => node.name === 'r1-indoor-plants')
  assert.ok(mesh, `没找到 r1-indoor-plants 批次，只有 ${found.map(node => node.name).join(',')}`)
  return { mesh, calls: found.length, triangles: mesh.geometry.attributes.position.count / 3 }
}

test('TK-2 树干偏离表冻结在 35 条室内登记绿植上，只改直径，data.js 一个字节不动', () => {
  assert.ok(Object.isFrozen(R1_BOARD_TRUNK_OVERRIDES))
  assert.equal(INDOOR_PLANTS.length, 35)
  assert.equal(R1_BOARD_TRUNK_OVERRIDES.length, 35)
  // ID 与 data.js 的室内树干一一对应，不重不漏。
  const ids = R1_BOARD_TRUNK_OVERRIDES.map(entry => entry.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual([...ids].sort(), [...INDOOR_TRUNK_IDS].sort())
  // 区 14 广场的 10 株与中央大榕树都不在表里。
  for (const id of ids) assert.ok(!id.startsWith('14-') && id !== '07-PL-001-TR', id)
  // 新直径落在派单给的 0.03–0.06 m 区间，35 株同一值。
  assert.ok(R1_TRUNK_DIAMETER_M >= .03 && R1_TRUNK_DIAMETER_M <= .06, `新直径 ${R1_TRUNK_DIAMETER_M} 不在 0.03–0.06 m`)
  for (const entry of R1_BOARD_TRUNK_OVERRIDES) {
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.from) && Object.isFrozen(entry.to), entry.id)
    assert.equal(entry.date, '2026-10-29', entry.id)
    assert.ok(typeof entry.reason === 'string' && /树干/.test(entry.reason), entry.id)
    // 原值必须与登记数据逐值相符，否则登记漂移了而偏离表没跟上。
    const raw = rawOf(entry.id)
    assert.ok(raw, entry.id)
    assert.equal(raw.category, '树干占位', entry.id)
    for (const key of Object.keys(entry.from)) assert.deepEqual(entry.from[key], raw[key], `${entry.id}.${key}`)
    near(entry.from.lengthM, REGISTERED_DIAMETER, 1e-9, entry.id)
    near(entry.from.widthM, REGISTERED_DIAMETER, 1e-9, entry.id)
    // 只改 lengthM / widthM：高度、底高、位置、朝向都不许进表。
    assert.deepEqual(Object.keys(entry.to).sort(), ['lengthM', 'widthM'], entry.id)
    near(entry.to.lengthM, R1_TRUNK_DIAMETER_M, 1e-9, entry.id)
    near(entry.to.widthM, R1_TRUNK_DIAMETER_M, 1e-9, entry.id)
  }
})

test('TK-2 合并后只有这 35 行树干变了，其余登记行与区 14 / 大榕树逐值不变', () => {
  const applied = createR1Layout({ candidateC01: false }).elements
  const registered = applied.slice(0, R1_DATA.elements.length)
  const trunkSet = new Set(INDOOR_TRUNK_IDS)
  for (const [index, item] of registered.entries()) {
    const raw = R1_DATA.elements[index]
    if (!trunkSet.has(item.id)) continue
    // 树干行：只有直径两项变，其余字段逐值与登记相同。
    assert.deepEqual({ ...item, lengthM: raw.lengthM, widthM: raw.widthM }, raw, item.id)
    near(item.lengthM, R1_TRUNK_DIAMETER_M, 1e-9, item.id)
    near(item.widthM, R1_TRUNK_DIAMETER_M, 1e-9, item.id)
    near(item.heightM, raw.heightM, 1e-9, `${item.id} 高度`)
    near(item.zM, raw.zM, 1e-9, `${item.id} 底高`)
  }
  // 不在本卡范围的树干一行不动：区 14 的 10 株景观树与中央大榕树 07-PL-001。
  for (const raw of R1_DATA.elements.filter(row => /-TR$/.test(row.id) && !trunkSet.has(row.id))) {
    assert.deepEqual(applied.find(row => row.id === raw.id), raw, raw.id)
  }
  assert.equal(R1_DATA.elements.filter(row => /-TR$/.test(row.id)).length, 46)
  // 盆与冠不进表：35 株的 -POT / -CR 逐值与登记相同。
  for (const plant of INDOOR_PLANTS) for (const suffix of ['-POT', '-CR']) {
    assert.deepEqual(applied.find(row => row.id === `${plant.id}${suffix}`), rawOf(`${plant.id}${suffix}`), `${plant.id}${suffix}`)
  }
})

test('TK-3 树干在冠包络内水平居中、底面贴盆顶，碰撞体与三角数、draw call 都不增加', () => {
  const thin = plantsWith(), thick = plantsWith(R1_DATA.elements)
  assert.equal(thin.built.records.length, 35)
  for (const record of thin.built.records) {
    const world = r1ToWorld(rawOf(record.id).xM, rawOf(record.id).yM)
    const trunk = record.parts.TR, pot = rawOf(`${record.id}-POT`), raw = rawOf(trunk.id)
    near(trunk.diameter, R1_TRUNK_DIAMETER_M, 1e-9, `${trunk.id} 直径`)
    // 底面贴盆顶，高度与登记一致：树干仍从盆顶接到冠里。
    near(trunk.base, pot.zM + pot.heightM, 1e-9, `${trunk.id} 底高`)
    near(trunk.base, raw.zM, 1e-9, `${trunk.id} 底高与登记一致`)
    near(trunk.height, raw.heightM, 1e-9, `${trunk.id} 高度`)
    // 水平居中在冠包络里，且整根落在冠的水平范围内。
    const crown = record.parts.CR.bounds, centre = crown.getCenter(new THREE.Vector3())
    near(centre.x, world.x, .02, `${trunk.id} 冠心 x`)
    near(centre.z, world.z, .02, `${trunk.id} 冠心 z`)
    assert.ok(world.x - trunk.diameter / 2 >= crown.min.x && world.x + trunk.diameter / 2 <= crown.max.x, `${trunk.id} 水平超出冠包络`)
    assert.ok(world.z - trunk.diameter / 2 >= crown.min.z && world.z + trunk.diameter / 2 <= crown.max.z, `${trunk.id} 水平超出冠包络`)
    // 树干顶端藏进冠里（顶面高于冠底面）。
    assert.ok(trunk.base + trunk.height > crown.min.y, `${trunk.id} 顶端没进冠`)
    assert.ok(trunk.base + trunk.height <= crown.max.y + 1e-6, `${trunk.id} 顶端穿出冠`)
  }
  // 碰撞只挂在盆上，数量与 ID 都不变。
  assert.deepEqual(thin.built.proxies.map(proxy => proxy.userData.r1Id), thick.built.proxies.map(proxy => proxy.userData.r1Id))
  assert.equal(thin.built.proxies.length, 35)
  // 细树干是同一个 8 段圆柱，三角数与批次数一个不增。
  const a = registeredBatch(thin.built), b = registeredBatch(thick.built)
  assert.equal(a.calls, b.calls)
  assert.equal(a.triangles, b.triangles)
  thin.built.dispose(); thick.built.dispose()
})

test('TK-2 data.js 的树干登记值没被改动（哈希与逐值双保险）', () => {
  // 偏离表必须是「覆盖」而不是「改登记」：data.js 里仍然是 Ø0.16。
  for (const id of INDOOR_TRUNK_IDS) {
    const raw = rawOf(id)
    near(raw.lengthM, REGISTERED_DIAMETER, 1e-9, id)
    near(raw.widthM, REGISTERED_DIAMETER, 1e-9, id)
  }
  // 与 office-r1-plaza-fan.test.mjs 的 I6C-1 同一口径（换行归一后再哈希）。
  const text = Buffer.from(readFileSync(new URL('../office-r1/data.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), 'utf8')
  assert.equal(createHash('sha256').update(text).digest('hex'), 'ac78918393e78a943a884323e5db2bcd3cf61641e24bccc05428417cc6c084bf')
})
