import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES } from '../office-layout.js'
import { buildVis2DockSample, createVis2DockSamplePlan } from '../dr-vis2-dock-sample.js'

const layout = { campus: CAMPUS, zones: CAMPUS_ZONES }

test('W-V1 月台样板从 receiving 区域派生，车辆、护栏和标线均在局部边界内', () => {
  const plan = createVis2DockSamplePlan(layout)
  const { receiving, platform, truck, rail, marking, cargo } = plan
  assert.equal(plan.id, 'vis2-dock-sample')
  assert.ok(platform.x0 >= receiving.x0 && platform.x1 <= receiving.x1)
  assert.ok(platform.z0 >= receiving.z0 && platform.z1 <= receiving.z1)
  assert.ok(truck.x - truck.width / 2 >= receiving.x0)
  assert.ok(truck.x + truck.width / 2 <= receiving.x1)
  assert.ok(rail.x0 >= receiving.x0 && rail.x1 <= receiving.x1)
  assert.ok(cargo.x > platform.x0 && cargo.x < platform.x1)
  assert.ok(marking.z1 <= receiving.z0)
})

test('W-V1 月台样板遵守地坪基准、资源预算和可释放生命周期', () => {
  const root = new THREE.Group()
  const sample = buildVis2DockSample({ THREE, root, layout, baseY: -.54, quality: { tier: 'high' } })
  const summary = sample.summary()
  assert.equal(sample.group.position.y, -.54)
  assert.equal(summary.baseY, -.54)
  assert.equal(summary.resources.animationLoops, 0)
  assert.equal(summary.resources.businessRequests, 0)
  assert.equal(summary.resources.textures, 0)
  assert.equal(summary.calls, 6)
  assert.ok(summary.triangles > 0 && summary.triangles <= 4000)
  assert.equal(root.getObjectByName('vis2-dock-sample'), sample.group)
  sample.dispose()
  assert.equal(root.getObjectByName('vis2-dock-sample'), undefined)
})

test('W-V1 月台样板拒绝缺失区域与非法完成面标高', () => {
  assert.throws(() => createVis2DockSamplePlan({ zones: [] }), /receiving/)
  assert.throws(() => buildVis2DockSample({ THREE, root: new THREE.Group(), layout, baseY: Number.NaN }), /baseY/)
})
