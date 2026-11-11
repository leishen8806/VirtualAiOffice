import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN as layout, createOfficeNavigation } from '../office-layout.js'
import { buildOfficePlazaHost } from '../office-vis2/plaza-host.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const angle = 40 * Math.PI / 180, u = { x: Math.sin(angle), z: Math.cos(angle) }, n = { x: Math.cos(angle), z: -Math.sin(angle) }
const dot = (p, a) => p.x * a.x + p.z * a.z
const gap = (a, b) => {
  const along = (Math.max(...a.footprint.map(p => dot(p, u))) + Math.min(...b.footprint.map(p => dot(p, u)))) / 2
  const values = [...a.footprint, ...b.footprint].map(p => dot(p, n)), across = (Math.min(...values) + Math.max(...values)) / 2
  const half = (Math.max(...values) - Math.min(...values)) / 2 + .7
  return [-1, 1].map(s => ({ x: along * u.x + (across + s * half) * n.x, z: along * u.z + (across + s * half) * n.z }))
}

test('B0 fourth queue slot and every public queue point clear real plaza proxies with 0.28m margin', () => {
  const nav=createOfficeNavigation(layout)
  for(const low of[false,true]){
    const root=new THREE.Group(),world=createFurnitureCollision(),host=buildOfficePlazaHost({THREE,root,layout,search:'?officeSample=1',low,collision:world})
    try{
      const left=host.placements.find(p=>p.id==='plaza-bench-2'),right=host.placements.find(p=>p.kind==='benches'&&p.x>layout.axis.x&&p.z===left.z),slot=nav.consumerQueues.B0[3]
      assert.deepEqual(slot,{x:-8.5,z:22});assert.equal(nav.consumerQueues.B0.length,4)
      for(const point of Object.values(nav.consumerQueues).flat()){
        assert.equal(world.hit(point.x,point.z)===null,true,'queue point must not intersect a native collision body')
        for(const p of host.placements){const b=p.bounds;assert.ok(Math.hypot(Math.max(b.x0-point.x,0,point.x-b.x1),Math.max(b.z0-point.z,0,point.z-b.z1))>=.28,'queue keeps the planned public margin from '+p.id)}
      }
      assert.ok(Math.abs(left.x-left.source.x-.65)<1e-9);assert.ok(Math.abs(right.x-right.source.x+.65)<1e-9)
      for(const [from,to]of[[nav.consumerQueues.B0[2],slot],[slot,nav.consumerQueues.B0[2]]]){
        assert.ok(world.route(from,to));const position={...from};world.move(position,to.x-from.x,to.z-from.z)
        assert.ok(Math.hypot(position.x-to.x,position.z-to.z)<1e-7,'native capsule must reach the unchanged queue endpoint')
      }
    }finally{host.dispose()}
    assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
  }
})

test('actual triangle capsule collision routes and sweeps through both angled kiosk gaps in both directions', () => {
  for (const low of [false, true]) {
    const root = new THREE.Group(), world = createFurnitureCollision(), host = buildOfficePlazaHost({ THREE, root, layout, search: '?officeSample=1', low, collision: world })
    try {
      const kiosks = host.placements.filter(p => p.id.startsWith('kiosk-')).sort((a, b) => a.z - b.z)
      for (let i = 1; i < kiosks.length; i++) for (const reverse of [false, true]) {
        const [from, to] = reverse ? gap(kiosks[i - 1], kiosks[i]).reverse() : gap(kiosks[i - 1], kiosks[i])
        const route = world.route(from, to)
        assert.ok(route); assert.equal(route.length, 1, 'no detour around a falsely closed AABB gap')
        for (let j = 0; j <= 200; j++) assert.equal(!!world.hit(from.x + (to.x - from.x) * j / 200, from.z + (to.z - from.z) * j / 200), false)
        const position = { ...from }
        world.move(position, to.x - from.x, to.z - from.z)
        assert.ok(Math.hypot(position.x - to.x, position.z - to.z) < 1e-6, 'the real 4cm sweep reaches the far side')
      }
      // 同样的横穿命令不能越过摊位实体，避免通过跳过碰撞制造成功。
      const kiosk = kiosks[1], from = { x: kiosk.x - n.x * 2, z: kiosk.z - n.z * 2 }, to = { x: kiosk.x + n.x * 2, z: kiosk.z + n.z * 2 }, position = { ...from }
      world.move(position, to.x - from.x, to.z - from.z)
      assert.ok(Math.hypot(position.x - to.x, position.z - to.z) > .5)
    } finally { host.dispose() }
    assert.equal(world.stats().bodies, 0); assert.equal(root.children.length, 0)
  }
})

test('negative control with former axis-aligned proxies falsely blocks the same gap', () => {
  const root = new THREE.Group(), live = createFurnitureCollision(), host = buildOfficePlazaHost({ THREE, root, layout, search: '?officeSample=1', low: true, collision: live }), control = createFurnitureCollision(), boxes = []
  try {
    const kiosks = host.placements.filter(p => p.id.startsWith('kiosk-')).sort((a, b) => a.z - b.z)
    for (const p of kiosks) {
      const b = p.bounds, box = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), new THREE.MeshBasicMaterial())
      box.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2)
      boxes.push(box); control.add(box, 'old-axis-proxy')
    }
    for (let i = 1; i < kiosks.length; i++) {
      const [from, to] = gap(kiosks[i - 1], kiosks[i])
      let hits = 0
      for (let j = 0; j <= 200; j++) if (control.hit(from.x + (to.x - from.x) * j / 200, from.z + (to.z - from.z) * j / 200)) hits++
      assert.ok(hits > 0, 'the test distinguishes a rotated triangle proxy from an axis-only proxy')
    }
  } finally {
    for (const box of boxes) { control.remove(box); box.geometry.dispose(); box.material.dispose() }
    host.dispose()
  }
  assert.equal(control.stats().bodies, 0); assert.equal(live.stats().bodies, 0)
})
