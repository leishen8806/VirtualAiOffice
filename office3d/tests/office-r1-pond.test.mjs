import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Fountain } from '../office-vis2/r1-fountain.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { LAYOUT_V3_ALIGN_L2B } from '../office-layout.js'

// OFFICE-R1-POND 接线勘察给定的既有数值（卡 B / C / D 行），测试按卡面数值校核，不从实现里回读。
const WATER = .34, WALL = 3.6, BOTTOM = .003, BASE = .8
const LANDING_R = 2.05, LANDING_FOAM = .24, RING_MIN = 2.35, RING_MAX = 3.4
const JET_GAP = .1, FOAM_GAP = .05, WALL_GAP = .1

const setup = (options = {}) => {
  const root = new THREE.Group(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  return { root, collision, f: buildR1Fountain({ THREE, root, layout, collision, ...options }) }
}
const radius = p => Math.hypot(p.x, p.z)
// 16 道喷射弧的实际管线顶点（去重后约数千点），用于逐件核对荷叶 / 荷花与水柱的间隙。
const jetCloud = f => {
  const p = f.root.getObjectByName('r1-fountain-jets').geometry.attributes.position, seen = new Set(), out = []
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = `${x.toFixed(2)}|${y.toFixed(2)}|${z.toFixed(2)}`
    if (!seen.has(key)) { seen.add(key); out.push([x, y, z]) }
  }
  return out
}
// 把荷叶当水平圆盘、荷花当竖直圆柱，取到管线的最小三维距离。
const gapToJets = (cloud, { x, z, y0, y1, r }) => {
  let min = Infinity
  for (const [jx, jy, jz] of cloud) {
    const flat = Math.max(0, Math.hypot(jx - x, jz - z) - r)
    const up = jy > y1 ? jy - y1 : jy < y0 ? y0 - jy : 0
    min = Math.min(min, Math.hypot(flat, up))
  }
  return min
}
const gapToLandings = ({ x, z, r }) => {
  assert.ok([x, z, r].every(Number.isFinite), 'gapToLandings needs x/z/r')
  let min = Infinity
  for (let j = 0; j < 16; j++) {
    const a = j * Math.PI / 8
    min = Math.min(min, Math.hypot(x - Math.cos(a) * LANDING_R, z - Math.sin(a) * LANDING_R) - LANDING_FOAM - r)
  }
  return min
}
const koiPose = (mesh, i, m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()) => {
  mesh.getMatrixAt(i, m); m.decompose(p, q, s)
  return { x: p.x, y: p.y, z: p.z, length: s.x }
}

test('PD-2 荷叶在喷泉落水点与池壁之间的外环内，离落点泡沫、池壁和 16 道水柱都有间隙', () => {
  const { f } = setup(), { pads } = f.pond, cloud = jetCloud(f)
  assert.ok(pads.length >= 15 && pads.length <= 45, `pads=${pads.length}`)
  assert.ok(f.pond.padClusters.length >= 3 && f.pond.padClusters.length <= 5, `clusters=${f.pond.padClusters.length}`)
  for (const pad of pads) {
    const r = radius(pad)
    assert.ok(pad.radius >= .15 && pad.radius <= .35, `pad radius ${pad.radius}`)
    assert.ok(r >= RING_MIN && r <= RING_MAX, `pad centre r=${r}`)
    assert.ok(r - pad.radius >= LANDING_R + LANDING_FOAM + FOAM_GAP, `pad inner edge ${r - pad.radius}`)
    assert.ok(r + pad.radius <= WALL - WALL_GAP, `pad outer edge ${r + pad.radius}`)
    assert.ok(pad.y > WATER && pad.y <= WATER + .02, `pad y ${pad.y}`)
    assert.ok(gapToLandings({ ...pad, r: pad.radius }) >= FOAM_GAP, 'pad clears a jet landing foam disc')
    assert.ok(gapToJets(cloud, { ...pad, r: pad.radius, y0: pad.y, y1: pad.y }) >= JET_GAP, 'pad clears the jet tubes')
  }
  f.dispose()
})

test('PD-2 荷花 6–10 朵长在外环荷叶簇里，高出水面 0.08–0.25 m，不穿进水柱', () => {
  const { f } = setup(), { flowers, buds, pads } = f.pond, cloud = jetCloud(f)
  assert.ok(flowers.length >= 6 && flowers.length <= 10, `flowers=${flowers.length}`)
  assert.ok(buds.length >= 1 && buds.length <= 3, `buds=${buds.length}`)
  for (const flower of [...flowers, ...buds]) {
    const r = radius(flower)
    assert.ok(flower.height >= .08 && flower.height <= .25, `flower height ${flower.height}`)
    assert.ok(r >= RING_MIN && r <= RING_MAX, `flower centre r=${r}`)
    assert.ok(r - flower.radius >= LANDING_R + LANDING_FOAM + FOAM_GAP, `flower inner edge ${r - flower.radius}`)
    assert.ok(r + flower.radius <= WALL - WALL_GAP, `flower outer edge ${r + flower.radius}`)
    assert.ok(gapToLandings({ ...flower, r: flower.radius }) >= FOAM_GAP, 'flower clears a jet landing foam disc')
    const top = WATER + flower.height + flower.crown
    assert.ok(gapToJets(cloud, { ...flower, r: flower.radius, y0: WATER, y1: top }) >= JET_GAP, `flower clears the jet tubes`)
    assert.ok(pads.some(p => Math.hypot(p.x - flower.x, p.z - flower.z) <= p.radius + flower.radius + .35), '荷花长在荷叶簇里')
  }
  f.dispose()
})

test('PD-2 锦鲤整条闭合路径与 600 帧连续模拟都留在池内、水面以下、池底以上', () => {
  const quality = { tier: 'high' }, { f } = setup({ quality }), { koi, koiMesh } = f.pond
  assert.ok(koi.length >= 6 && koi.length <= 12, `koi=${koi.length}`)
  assert.equal(koiMesh.count, koi.length)
  // 路径是 r(θ)=R+A·sin(kθ) 的闭合曲线，半径极值可解析取到，等于把整条路径一次性校核完。
  for (const fish of koi) {
    assert.ok(fish.length >= .25 && fish.length <= .45, `koi length ${fish.length}`)
    assert.ok(fish.speed >= .1 && fish.speed <= .3, `koi speed ${fish.speed}`)
    assert.ok(Number.isInteger(fish.harmonic) && fish.harmonic >= 1, 'closed path needs an integer harmonic')
    assert.ok(fish.radius + fish.amplitude + fish.length / 2 <= WALL - .05, `koi outer sweep ${fish.radius + fish.amplitude}`)
    assert.ok(fish.radius - fish.amplitude - fish.length / 2 >= BASE + .3, `koi inner sweep ${fish.radius - fish.amplitude}`)
  }
  const seen = []
  for (let frame = 0; frame < 600; frame++) {
    f.onFrame(.1)
    for (let i = 0; i < koi.length; i++) {
      const pose = koiPose(koiMesh, i), r = radius(pose), half = pose.length / 2
      assert.ok(r + half <= WALL, `frame ${frame} koi ${i} r=${r}`)
      assert.ok(r - half >= BASE + .2, `frame ${frame} koi ${i} inside the base r=${r}`)
      assert.ok(pose.y < WATER && pose.y > BOTTOM, `frame ${frame} koi ${i} y=${pose.y}`)
      assert.ok(pose.y + .06 < WATER, `frame ${frame} koi ${i} breaks the surface`)
      if (frame % 150 === 0 && i === 0) seen.push(r)
    }
  }
  assert.ok(new Set(seen.map(r => r.toFixed(3))).size > 1, '锦鲤确实沿路径移动')
  f.dispose()
})

test('PD-3 高档锦鲤在动且速度在 0.1–0.3 m/s；低档静止但仍可见；来回切档不泄漏几何与材质', () => {
  const quality = { tier: 'high' }, { f } = setup({ quality }), { koiMesh, koi, padMesh, flowerMesh } = f.pond
  const before = koiPose(koiMesh, 0)
  for (let i = 0; i < 10; i++) f.onFrame(.1) // onFrame 把 dt 截在 .1，一秒要走十帧
  const after = koiPose(koiMesh, 0)
  const moved = Math.hypot(after.x - before.x, after.z - before.z)
  assert.ok(moved >= .09 && moved <= .33, `1 秒位移 ${moved}`)
  quality.tier = 'low'
  f.onFrame(.1)
  const frozen = koiMesh.instanceMatrix.array.slice()
  for (let i = 0; i < 10; i++) f.onFrame(.1)
  assert.deepEqual(koiMesh.instanceMatrix.array, frozen, '低档：锦鲤静止')
  // 低档选择：静止（保持可见），不隐藏。
  assert.equal(koiMesh.visible, true); assert.equal(padMesh.visible, true); assert.equal(flowerMesh.visible, true)
  let disposals = 0
  const watched = [koiMesh, padMesh, flowerMesh]
  for (const mesh of watched) { mesh.geometry.addEventListener('dispose', () => disposals++); mesh.material.addEventListener('dispose', () => disposals++) }
  for (let i = 0; i < 20; i++) { quality.tier = i % 2 ? 'low' : 'high'; f.onFrame(.1) }
  assert.equal(disposals, 0, '切档不重建几何')
  quality.tier = 'high'; f.onFrame(.1)
  assert.notDeepEqual(koiMesh.instanceMatrix.array, frozen, '回到高档继续游动')
  f.dispose()
  assert.equal(disposals, watched.length * 2, 'dispose 释放全部新增几何与材质')
})

test('PD-4 新增 3 个批次、三角形在预算内，碰撞体与非 R1 入口不变', () => {
  const { f, collision, root } = setup()
  const added = [f.pond.padMesh, f.pond.flowerMesh, f.pond.koiMesh]
  assert.ok(added.every(m => m.parent === f.pond.group), '新增网格都挂在 r1-fountain-life 子组里')
  assert.equal(f.pond.group.parent, f.root)
  const triangles = added.reduce((sum, m) => {
    const g = m.geometry, tris = (g.index ? g.index.count : g.attributes.position.count) / 3
    return sum + tris * (m.isInstancedMesh ? m.count : 1)
  }, 0)
  assert.ok(added.length <= 4, `draw calls +${added.length}`)
  assert.ok(triangles <= 15000, `triangles +${triangles}`)
  assert.equal(collision.stats().bodies, 1, '鱼和荷都不进碰撞')
  assert.equal(f.proxy.geometry.parameters.radiusTop, 4.15)
  // FT-4/5 口径：水池直属可见批次仍是 6 个，新增内容不混进去。
  assert.equal(f.root.children.filter(n => (n.isMesh || n.isPoints) && n.visible && n.material.visible).length, 6)
  f.dispose()
  for (const old of [undefined, LAYOUT_V3_ALIGN_L2B]) {
    const none = buildR1Fountain({ THREE, root, layout: old, collision })
    assert.equal(none.pond, undefined); assert.equal(root.children.length, 0)
    none.dispose()
  }
})

test('PD-4 锦鲤与荷的布局确定，不依赖共享随机状态', () => {
  const a = setup().f, b = setup().f
  assert.deepEqual(a.pond.pads, b.pond.pads)
  assert.deepEqual(a.pond.flowers, b.pond.flowers)
  assert.deepEqual(a.pond.koi, b.pond.koi)
  // 既有水滴粒子的确定性不能被新增内容打乱。
  assert.deepEqual(a.particles.geometry.attributes.position.array, b.particles.geometry.attributes.position.array)
  assert.equal(a.particleCount, 2380)
  a.dispose(); b.dispose()
})
