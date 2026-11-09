import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkPlan, defaultBuildingHeight, geoToWorld, qualitySample } from '../town-3d-core.mjs'
import { readFileSync } from 'node:fs'

test('town 3d projection uses the existing map origin and metre scale', () => {
  assert.deepEqual(geoToWorld(11.57, 104.905), { x: 0, z: -0 })
  assert.ok(geoToWorld(11.58, 104.905).z < 0)
})

test('building height prefers explicit height, then levels, then type fallback', () => {
  assert.equal(defaultBuildingHeight({ height: '18m', 'building:levels': '2' }), 18)
  assert.equal(defaultBuildingHeight({ 'building:levels': '4' }), 12.8)
  assert.equal(defaultBuildingHeight({ building: 'office' }), 12)
  assert.equal(defaultBuildingHeight({ building: 'shed' }), 6)
})

test('low quality keeps every building while marking simplified LOD deterministically', () => {
  const buildings = [{ bboxWorld: [0, 0, 1, 1] }, { bboxWorld: [205, 0, 206, 1] }, { bboxWorld: [0, 0, 1, 1] }]
  assert.equal(qualitySample(buildings, 'low').length, 3)
  assert.ok(qualitySample(buildings, 'low').every((building) => building.simplified))
  assert.deepEqual(chunkPlan(buildings).map((x) => x.id), ['0:0', '1:0'])
})

test('3d town exposes real progress loader, retry/back buttons, and reduced-motion path', () => {
  const html = readFileSync(new URL('../town.html', import.meta.url), 'utf8')
  const js = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')
  assert.match(html, /town3dLoaderProgress/)
  assert.match(html, /town3dRetry/)
  assert.match(html, /town3dBack2d/)
  assert.match(js, /下载城市数据/)
  assert.match(js, /场景就绪/)
  assert.match(js, /prefers-reduced-motion/)
})
