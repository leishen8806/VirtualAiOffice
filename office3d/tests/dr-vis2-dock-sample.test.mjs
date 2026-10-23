import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES } from '../office-layout.js'
import { buildVis2DockSample, createVis2DockSamplePlan } from '../dr-vis2-dock-sample.js'

const layout = { campus: CAMPUS, zones: CAMPUS_ZONES }
const overlap = (a, b) => ['x', 'y', 'z'].every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > .005)
const instanceBox = (group, mesh, index) => {
  group.updateMatrixWorld(true)
  mesh.geometry.computeBoundingBox()
  const instance = new THREE.Matrix4()
  mesh.getMatrixAt(index, instance)
  return mesh.geometry.boundingBox.clone().applyMatrix4(group.matrixWorld).applyMatrix4(instance)
}

test('W-V1 月台样板从 receiving 区域派生，月台墙、编号卷帘门、车辆、护栏和标线均在局部边界内', () => {
  const plan = createVis2DockSamplePlan(layout)
  const { receiving, platform, wall, doors, truck, rail, marking, cargo, forklift } = plan
  assert.equal(plan.id, 'vis2-dock-sample')
  assert.ok(platform.x0 >= receiving.x0 && platform.x1 <= receiving.x1)
  assert.ok(platform.z0 >= receiving.z0 && platform.z1 <= receiving.z1)
  assert.equal(doors.length, 2)
  assert.deepEqual(doors.map(door => door.id), ['01', '02'])
  assert.ok(wall.x0 >= receiving.x0 && wall.x1 <= receiving.x1)
  assert.ok(wall.z >= platform.z1)
  assert.ok(truck.x - truck.width / 2 >= receiving.x0)
  assert.ok(truck.x + truck.width / 2 <= receiving.x1)
  assert.ok(rail.x0 >= receiving.x0 && rail.x1 <= receiving.x1)
  assert.ok(cargo.x > platform.x0 && cargo.x < platform.x1)
  assert.ok(forklift.x > platform.x0 && forklift.x < platform.x1)
  assert.ok(marking.z1 <= receiving.z0)
})

test('W-V1 月台样板没有实例越界、NaN 包围盒或托盘纸箱/车辆互穿', () => {
  const root = new THREE.Group()
  const sample = buildVis2DockSample({ THREE, root, layout, baseY: 0, quality: { tier: 'high' } })
  const summary = sample.summary()
  for (const node of sample.group.children.filter(node => node.isInstancedMesh)) {
    assert.ok(node.count <= node.instanceMatrix.count, `${node.name} does not exceed its instance capacity`)
    assert.ok(Number.isFinite(node.boundingBox.min.x) && Number.isFinite(node.boundingBox.max.z), `${node.name} has a finite bounding box`)
    assert.ok(Number.isFinite(node.boundingSphere.radius), `${node.name} has a finite bounding sphere`)
  }
  const platform = instanceBox(sample.group, sample.group.getObjectByName('vis2-dock-concrete'), 0)
  const cargo = sample.group.getObjectByName('vis2-dock-cargo')
  for (let index = 0; index < cargo.count; index++) {
    const box = instanceBox(sample.group, cargo, index)
    assert.ok(box.min.y >= platform.max.y - .001, `cargo ${index} rests on or above the platform`)
    assert.equal(overlap(platform, box), false, `cargo ${index} does not intersect platform volume`)
  }
  const rail = sample.group.getObjectByName('vis2-dock-safety-rails')
  assert.ok(instanceBox(sample.group, rail, 0).min.y >= platform.max.y - .001, 'guardrail starts on the platform top')
  const vehicle = sample.group.getObjectByName('vis2-dock-white-vehicle')
  const wheels = sample.group.getObjectByName('vis2-dock-wheels')
  for (let body = 0; body < vehicle.count; body++) for (let wheel = 0; wheel < wheels.count; wheel++) {
    assert.equal(overlap(instanceBox(sample.group, vehicle, body), instanceBox(sample.group, wheels, wheel)), false, `vehicle body ${body} does not intersect wheel ${wheel}`)
  }
  assert.equal(summary.batches['vis2-dock-dark-details'].count, 3)
  assert.equal(summary.batches['vis2-dock-dark-details'].capacity, 9)
})

test('W-V1 月台样板遵守地坪基准、阴影、资源预算和可释放生命周期', () => {
  const root = new THREE.Group()
  const sample = buildVis2DockSample({ THREE, root, layout, baseY: -.54, quality: { tier: 'high' } })
  const summary = sample.summary()
  assert.equal(sample.group.position.y, -.54)
  assert.equal(summary.baseY, -.54)
  assert.equal(summary.resources.animationLoops, 0)
  assert.equal(summary.resources.businessRequests, 0)
  assert.equal(summary.resources.textures, 0)
  assert.ok(summary.calls <= 12)
  assert.ok(summary.triangles > 0 && summary.triangles <= 6000)
  for (const node of sample.group.children.filter(node => node.isMesh)) assert.equal(node.castShadow && node.receiveShadow, true, `${node.name} participates in shadows`)
  assert.equal(root.getObjectByName('vis2-dock-sample'), sample.group)
  sample.dispose()
  assert.equal(root.getObjectByName('vis2-dock-sample'), undefined)
})

test('W-V1 月台样板拒绝缺失区域与非法完成面标高', () => {
  assert.throws(() => createVis2DockSamplePlan({ zones: [] }), /receiving/)
  assert.throws(() => buildVis2DockSample({ THREE, root: new THREE.Group(), layout, baseY: Number.NaN }), /baseY/)
})
