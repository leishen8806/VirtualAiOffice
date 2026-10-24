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
  for (let wheel = 0; wheel < 4; wheel++) {
    const box = instanceBox(sample.group, wheels, wheel)
    assert.ok(box.max.x - box.min.x < box.max.y - box.min.y, 'vehicle wheel width is narrower than its diameter')
  }
  const forklift = sample.group.getObjectByName('vis2-dock-forklift')
  assert.ok(instanceBox(sample.group, forklift, 0).min.y <= .001, 'forklift body rests on the finished floor')
  for (let wheel = 4; wheel < wheels.count; wheel++) assert.ok(instanceBox(sample.group, wheels, wheel).min.y <= .001, 'forklift wheels rest on the finished floor')
  const number = sample.group.getObjectByName('vis2-dock-markings')
  const wall = sample.group.getObjectByName('vis2-dock-wall')
  const wallFront = instanceBox(sample.group, wall, 3).min.z
  const labels = Array.from({ length: number.count }, (_, index) => instanceBox(sample.group, number, index)).filter(box => box.min.y > 3)
  assert.ok(labels.length >= 15, 'door labels contain readable seven-segment geometry')
  assert.ok(labels.every(box => wallFront - box.max.z <= .005 && wallFront - box.max.z >= 0), 'door number backs sit against the wall')
  const [door01, door02] = summary.plan.doors
  const label01 = labels.filter(box => Math.abs((box.min.x + box.max.x) / 2 - door01.x) < .4)
  const label02 = labels.filter(box => Math.abs((box.min.x + box.max.x) / 2 - door02.x) < .4)
  const vertical = boxes => boxes.filter(box => box.max.y - box.min.y > box.max.x - box.min.x)
  const oneSegments = vertical(label01).filter(box => (box.min.x + box.max.x) / 2 < door01.x)
  assert.ok(oneSegments.length >= 2, '01 digit has observer-right vertical segments')
  const twoSegments = vertical(label02).filter(box => (box.min.x + box.max.x) / 2 < door02.x)
  assert.ok(twoSegments.length >= 2, '02 digit has observer-right vertical segments')
  assert.equal(summary.batches['vis2-dock-dark-details'].count, 3)
  assert.equal(summary.batches['vis2-dock-dark-details'].capacity, 9)
})

const dockScene = () => {
  const root = new THREE.Group()
  const sample = buildVis2DockSample({ THREE, root, layout, baseY: 0, quality: { tier: 'high' } })
  return { sample, summary: sample.summary() }
}

test('W-V1-R3 door numbers read correctly from the vehicle side', () => {
  const { sample, summary } = dockScene()
  const labels = Array.from({ length: sample.group.getObjectByName('vis2-dock-markings').count }, (_, index) =>
    instanceBox(sample.group, sample.group.getObjectByName('vis2-dock-markings'), index),
  ).filter(box => box.min.y > 3)
  const vertical = boxes => boxes.filter(box => box.max.y - box.min.y > box.max.x - box.min.x)
  const [, door02] = summary.plan.doors
  const twoSegments = vertical(labels.filter(box => Math.abs((box.min.x + box.max.x) / 2 - door02.x) < .4 && (box.min.x + box.max.x) / 2 < door02.x))
  const upperRight = twoSegments.reduce((candidate, box) => (box.max.y > candidate.max.y ? box : candidate))
  const lowerLeft = twoSegments.reduce((candidate, box) => (box.min.y < candidate.min.y ? box : candidate))
  assert.ok((upperRight.min.x + upperRight.max.x) / 2 < (lowerLeft.min.x + lowerLeft.max.x) / 2, '02 digit two reads correctly from the vehicle side')
})

test('W-V1-R3 forklift forks clear the body', () => {
  const { sample } = dockScene()
  const forklift = sample.group.getObjectByName('vis2-dock-forklift')
  const forkliftBody = instanceBox(sample.group, forklift, 0)
  assert.equal(overlap(forkliftBody, instanceBox(sample.group, forklift, 2)), false, 'forks end at the forklift front without entering its body')
})

test('W-V1-R3 forklift wheels project outward from the body', () => {
  const { sample } = dockScene()
  const forklift = sample.group.getObjectByName('vis2-dock-forklift')
  const wheels = sample.group.getObjectByName('vis2-dock-wheels')
  const forkliftBody = instanceBox(sample.group, forklift, 0)
  for (let wheel = 4; wheel < wheels.count; wheel++) {
    const box = instanceBox(sample.group, wheels, wheel)
    const insideX = Math.max(0, Math.min(box.max.x, forkliftBody.max.x) - Math.max(box.min.x, forkliftBody.min.x))
    assert.ok(insideX <= (box.max.x - box.min.x) / 2, 'at least half of each forklift wheel projects outside the body')
  }
})

test('W-V1-R3 guardrail clears the dock 02 adjustment plate', () => {
  const { sample } = dockScene()
  const rail = sample.group.getObjectByName('vis2-dock-safety-rails')
  const doors = sample.group.getObjectByName('vis2-dock-doors')
  const dock02Plate = instanceBox(sample.group, doors, 3)
  for (let index = 0; index < 3; index++) assert.equal(overlap(instanceBox(sample.group, rail, index), dock02Plate), false, `guardrail ${index} clears dock 02 adjustment plate`)
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
  assert.ok(summary.calls <= 10)
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
