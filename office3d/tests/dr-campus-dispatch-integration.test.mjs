import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_BUILDING, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { CAMPUS_FINISHED_FLOOR_Y } from '../dr-campus-shell.js'
import { campusModules } from '../dr-campus-modules.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { buildCampusInterior } from '../dr-campus-interior.js'
import { sharedDemoSnapshotAt } from '../dr-demo-snapshot.js'
import { VIS2B_LABELS } from '../dr-vis2-dispatch-suite.js'

const layout = { campus: CAMPUS, building: CAMPUS_BUILDING, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const canvasTex = (w, h, draw) => {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true })
  draw(ctx, w, h)
  const texture = new THREE.Texture(); texture.image = { width: w, height: h, getContext: () => ctx }
  return texture
}
const factory = new Map(campusModules).get('dispatch-suite')
const build = () => {
  const root = new THREE.Group()
  const suite = factory({ THREE, root, layout, quality: { tier: 'high' }, canvasTex })
  root.updateMatrixWorld(true)
  return { root, suite }
}
function boxes(root) {
  root.updateMatrixWorld(true)
  const result = [], matrix = new THREE.Matrix4()
  root.traverse(node => {
    if (!node.geometry) return
    node.geometry.computeBoundingBox()
    // 图集几何跨多个独立物体，按真实三角面测，不能把中间空地当成实物。
    if (!node.isInstancedMesh && node.material?.map && node.geometry.index) {
      const indices=node.geometry.index, points=node.geometry.attributes.position
      for(let i=0;i<indices.count;i+=3) {
        const box=new THREE.Box3()
        for(let j=0;j<3;j++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(points,indices.getX(i+j)).applyMatrix4(node.matrixWorld))
        result.push({name:node.name,index:i/3,box})
      }
      return
    }
    for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
      if (node.isInstancedMesh) node.getMatrixAt(i, matrix); else matrix.identity()
      result.push({ name: node.name, index: i, box: node.geometry.boundingBox.clone().applyMatrix4(matrix.clone().premultiply(node.matrixWorld)) })
    }
  })
  return result
}
const horizontalGap = (a, b) => Math.hypot(Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0), Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0))
const rectangle = (x0, x1, z0, z1) => new THREE.Box3(new THREE.Vector3(x0, -100, z0), new THREE.Vector3(x1, 100, z1))

test('B5 final zones come from layout; actual instances retain a one metre L04 clearance at the finished floor', () => {
  const { suite } = build()
  const refs = { dispatch: [-168,-149,6,20], visitor: [-168,-147,20,30], showcase: [-147,-116,20,30] }
  for (const [id, values] of Object.entries(refs)) {
    const z = CAMPUS_ZONES.find(zone => zone.id === id)
    assert.deepEqual([z.x0,z.x1,z.z0,z.z1], values)
  }
  const band = rectangle(-167,-116,29,30.8), actual = boxes(suite.group)
  for (const item of actual) assert.ok(horizontalGap(item.box, band) >= 1 - 1e-5, `${item.name}[${item.index}] L04`)
  const all = actual.reduce((b, item) => b.union(item.box), new THREE.Box3())
  assert.ok(Math.abs(all.min.y - CAMPUS_FINISHED_FLOOR_Y) < 1e-5)
  assert.ok(all.max.y < 4.68 - .28 / 2, 'all geometry below the real roof underside')
  suite.dispose()
})

test('B5 actual eastern enclosure clears P-FORK-01 by at least 0.3 m', () => {
  const { suite } = build(), lane = rectangle(-148.7,-80,11.2,14.7)
  for (const item of boxes(suite.group).filter(i => i.box.min.z < 20)) assert.ok(horizontalGap(item.box,lane) >= .3 - 1e-5, `${item.name}[${item.index}] fork lane`)
  suite.dispose()
})

test('B5 south doorway measures 2 m between post inner edges and has a 2 m clear apron', () => {
  const { suite } = build(), actual = boxes(suite.group)
  const posts = actual.filter(i => i.name === 'vis2b-structure' && Math.abs(i.box.max.y - (CAMPUS_FINISHED_FLOOR_Y + 4)) < 1e-5 && Math.abs(i.box.min.z - 19.67) < 1e-4 && i.box.max.x - i.box.min.x < .061)
  const left = posts.find(i => Math.abs(i.box.getCenter(new THREE.Vector3()).x + 154.93) < 1e-4)
  const right = posts.find(i => Math.abs(i.box.getCenter(new THREE.Vector3()).x + 152.87) < 1e-4)
  assert.ok(!!left && !!right)
  assert.ok(right.box.min.x - left.box.max.x >= 2 - 1e-4)
  const apron = rectangle(-154.9 + .001,-152.9 - .001,19.741,21.741)
  for (const i of actual) assert.equal(i.box.intersectsBox(apron), false, `${i.name}[${i.index}] blocks the southern apron`)
  suite.dispose()
})

test('B5 replaces only seven Z07-Z09 placeholder instances; six Z10-Z11 instances retain all transforms and colours', () => {
  const previous = globalThis.Path2D; globalThis.Path2D = class {}
  const rootA = new THREE.Group(), rootB = new THREE.Group()
  let a, b
  try {
    a = buildCampusInterior({THREE,root:rootA,layout,canvasTex,search:'',liveOptions:{documentRef:null}})
    b = buildCampusInterior({THREE,root:rootB,layout,canvasTex,replaceDispatch:true})
    const old = rootA.getObjectByName('campus-interior-static'), next = rootB.getObjectByName('campus-interior-static')
    assert.equal(old.count,13); assert.equal(next.count,6)
    assert.deepEqual(Array.from(next.instanceMatrix.array),Array.from(old.instanceMatrix.array).slice(7*16))
    assert.deepEqual(Array.from(next.instanceColor.array),Array.from(old.instanceColor.array).slice(7*3))
    assert.equal(rootB.getObjectByName('campus-dispatch-simulation'),undefined)
    assert.equal(rootB.userData.campusDispatchLive,undefined,'no replaced screen timer')
  } finally { a?.dispose(); b?.dispose(); globalThis.Path2D=previous }
})

test('B5 real registry has one suite, deterministic demo snapshot, no old screens and idempotent cleanup', () => {
  const scene = new THREE.Scene(), registry = createCampusRegistry({THREE,scene,layout,quality:{tier:'high'}})
  for (const [name, factory] of campusModules.filter(([name]) => ['dispatch-suite','interior'].includes(name))) registry.register(name,factory)
  registry.buildAll({canvasTex,quality:{tier:'high'}})
  assert.equal(registry.summary().skipped.length,0)
  assert.equal(registry.root.children.filter(c=>c.name==='vis2-dispatch-suite').length,1)
  assert.equal(registry.root.getObjectByName('campus-dispatch-simulation'),undefined)
  const suite = registry.root.userData.dispatchSuite
  assert.equal(suite.summary().snapshotVersion,sharedDemoSnapshotAt(0).generatedAt)
  assert.ok(VIS2B_LABELS.simulated.includes('演示数据'))
  assert.equal(suite.update(sharedDemoSnapshotAt(0)),false)
  registry.dispose(); registry.dispose()
  assert.equal(scene.children.length,0); assert.equal(registry.root.userData.dispatchSuite,undefined)
})

test('B5 legacy controlRoom query redirects camera without building or hiding a second room', () => {
  const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
  assert.equal(/import.*buildDrControlRoom|buildDrControlRoom\(/.test(source),false)
  assert.equal(source.includes('if (controlRoom && campusRegistry) campusRegistry.root.visible = false'),false)
  assert.ok(source.includes('if (CONTROL_ROOM_MODE) setGoal({ az: 90'))
})
