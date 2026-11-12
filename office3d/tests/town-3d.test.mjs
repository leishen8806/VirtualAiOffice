import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { chunkPlan, defaultBuildingHeight, geoToWorld, groundPlan, landmarkProfile, polygonShape, polygonWorldPoint, qualitySample, roadTier } from '../town-3d-core.js'
import { readFileSync, statSync } from 'node:fs'

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
  assert.match(html, /type="importmap">\{"imports":\{"three":"\.\/vendor\/three\/three\.module\.js"\}\}/)
  assert.match(html, /town3dLoaderProgress/)
  assert.match(html, /town3dRetry/)
  assert.match(html, /town3dBack2d/)
  assert.match(html, /id="town3dLoader"[^>]*\shidden/)
  assert.match(html, /town3dLoader'\)\.hidden = false/)
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

test('water polygons leave inner rings dry after triangulation', () => {
  const shape = polygonShape(THREE, {
    rings: [
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[3, 3], [3, 7], [7, 7], [7, 3]],
    ],
  }, ([x, y]) => new THREE.Vector2(x, y))
  const geometry = new THREE.ShapeGeometry(shape)
  const positions = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const point = new THREE.Vector2(5, 5)
  let coveringTriangles = 0
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)].map((vertex) => new THREE.Vector2(positions.getX(vertex), positions.getY(vertex)))
    if (new THREE.Triangle(...triangle.map((vertex) => new THREE.Vector3(vertex.x, vertex.y, 0))).containsPoint(new THREE.Vector3(point.x, point.y, 0))) coveringTriangles += 1
  }
  assert.equal(coveringTriangles, 0)

  const data = JSON.parse(readFileSync(new URL('../town-3d/town-3d-data.json', import.meta.url), 'utf8'))
  const kohPich = data.buildings.find((building) => building.name === 'Koh Pich Conference Center')
  const river = data.water.find((item) => item.id === 'union/1')
  const worldShape = polygonShape(THREE, river, (point) => polygonWorldPoint(THREE, point))
  const worldGeometry = new THREE.ShapeGeometry(worldShape).rotateX(-Math.PI / 2)
  const worldPositions = worldGeometry.getAttribute('position')
  const worldIndex = worldGeometry.getIndex()
  const [lon0, lat0, lon1, lat1] = kohPich.bbox
  const worldPoint = geoToWorld((lat0 + lat1) / 2, (lon0 + lon1) / 2, 10)
  let waterAtKohPich = 0
  for (let i = 0; i < worldIndex.count; i += 3) {
    const triangle = [worldIndex.getX(i), worldIndex.getX(i + 1), worldIndex.getX(i + 2)].map((vertex) => new THREE.Vector3(worldPositions.getX(vertex), 0, worldPositions.getZ(vertex)))
    if (new THREE.Triangle(...triangle).containsPoint(new THREE.Vector3(worldPoint.x, 0, worldPoint.z))) waterAtKohPich += 1
  }
  assert.equal(waterAtKohPich, 0)
})

test('town renderer loads the clipped and area-unioned city data', () => {
  const js = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')
  assert.match(js, /fetch\('\/town\/3d-data\/town-3d-data\.json'\)/)
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

test('Independence Monument uses the generated grounded GLB within its budgets', () => {
  const asset = new URL('../assets/models/landmarks/independence-monument.glb', import.meta.url)
  assert.ok(statSync(asset).size <= 500_000)
  const bytes = readFileSync(asset)
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  const bounds = new THREE.Box3()
  let triangles = 0
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale || [1, 1, 1])),
    )
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const position = gltf.accessors[primitive.attributes.POSITION]
      triangles += (primitive.indices === undefined ? position.count : gltf.accessors[primitive.indices].count) / 3
      for (const x of [position.min[0], position.max[0]]) for (const y of [position.min[1], position.max[1]]) for (const z of [position.min[2], position.max[2]]) bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(transform))
    }
  }
  assert.ok(triangles <= 8000)
  assert.ok(gltf.meshes.length <= 3)
  assert.equal(gltf.images?.length || 0, 0)
  assert.equal(gltf.textures?.length || 0, 0)
  const sandstone = gltf.materials.find((material) => material.name === 'Red-brown sandstone')
  assert.deepEqual(sandstone.pbrMetallicRoughness.baseColorFactor.map((value) => Number(value.toFixed(2))), [0.43, 0.18, 0.11, 1])
  assert.ok(Math.abs(bounds.min.y) < 0.001)
  assert.ok(bounds.max.y > 24 && bounds.max.y < 27)
  assert.ok(bounds.max.x - bounds.min.x <= 9.6)
  assert.ok(bounds.max.z - bounds.min.z <= 9.6)
})

test('detailed monument replaces its duplicate OSM footprint and clears the ring road', () => {
  const data = JSON.parse(readFileSync(new URL('../town-3d/town-3d-data.json', import.meta.url), 'utf8'))
  const map = JSON.parse(readFileSync(new URL('../town-map.json', import.meta.url), 'utf8'))
  const landmark = map.layers.landmarks.find((item) => item.name === 'Independence Monument')
  assert.ok(data.buildings.some((building) => building.id === landmark.osm))
  const point = geoToWorld(landmark.lat, landmark.lon)
  const nearbyBuildings = data.buildings.filter((building) => building.id !== landmark.osm).map((building) => {
    const [lon0, lat0, lon1, lat1] = building.bbox.map(Number), a = geoToWorld(lat0, lon0), b = geoToWorld(lat1, lon1)
    return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)]
  })
  assert.ok(nearbyBuildings.every(([x0, z0, x1, z1]) => x1 < point.x - 4.76 || x0 > point.x + 4.76 || z1 < point.z - 4.76 || z0 > point.z + 4.76))
  const segmentDistance = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz))
  }
  const roadDistances = data.roads.flatMap((road) => (road.line || []).slice(1).map((value, index) => segmentDistance(
    geoToWorld(road.line[index][1], road.line[index][0]),
    geoToWorld(value[1], value[0]),
  )))
  assert.ok(Math.min(...roadDistances) > 10.4)
  const source = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')
  assert.match(source, /building\.id !== monument\?\.osm/)
  assert.match(source, /independence-monument\.glb/)
})
