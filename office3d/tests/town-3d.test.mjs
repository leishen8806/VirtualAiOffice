import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkPlan, defaultBuildingHeight, geoToWorld, groundPlan, landmarkProfile, qualitySample, roadTier } from '../town-3d-core.mjs'
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

test('river data is area-unioned and keeps holes-ready rings', () => {
  const data = JSON.parse(readFileSync(new URL('../town-3d/town-3d-data.json', import.meta.url), 'utf8'))
  assert.ok(data.waterSource.inputAreaCount > 0)
  assert.ok(data.waterSource.largest10.length >= 3)
  assert.ok(data.water.some((item) => Array.isArray(item.rings) && item.rings[0].length >= 3))
  assert.ok(data.waterSource.largest10[0].id && data.waterSource.largest10[0].sourceIds.length > 0)
})

test('town renderer loads the clipped and area-unioned city data', () => {
  const js = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')
  assert.match(js, /fetch\('\/town-3d\/town-3d-data\.json'\)/)
  assert.doesNotMatch(js, /fetch\('\/town-3d-data\.json'\)/)
})

test('town renderer uses ShapeGeometry for water and green areas without span skipping', () => {
  const js = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')
  assert.match(js, /new THREE\.ShapeGeometry\(shape\)/)
  assert.doesNotMatch(js, /maxSpan/)
})

test('roads are classified and the ground covers every building', () => {
  assert.equal(roadTier('primary'), 'major')
  assert.equal(roadTier('secondary'), 'secondary')
  assert.equal(roadTier('residential'), 'local')
  const data = JSON.parse(readFileSync(new URL('../town-3d/town-3d-data.json', import.meta.url), 'utf8'))
  assert.deepEqual([...new Set(data.roads.map((road) => roadTier(road.type)))].sort(), ['local', 'major', 'secondary'])
  assert.deepEqual(groundPlan([{ bboxWorld: [-10, -20, 40, 60] }], 5), { x: 15, z: 20, width: 60, depth: 90 })
  const js = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')
  assert.match(js, /const a = pointWorld\(p0\), b = pointWorld\(p1\)/)
})

test('landmark labels choose visible silhouette profiles', () => {
  assert.equal(landmarkProfile('Independence Monument'), 'spire')
  assert.equal(landmarkProfile('Olympic Stadium'), 'stadium')
  assert.equal(landmarkProfile('Central Market'), 'block')
})
