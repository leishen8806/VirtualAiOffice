import { appendOfficeGardenBed } from './plants.js'
import { appendTropicalPlant, PLAZA_SPECIES } from './r1-tropical.js'

// Map the existing leaf source onto continuous beds; the same outline is used by the solid proxy.
export function appendR1GardenStrip({ THREE, batch, leaves, row, low, index }) {
  const trough = !!row.wall, length = row.length, width = trough ? .3 : row.width
  const angle = (row.angle ?? (row.d > row.w ? 90 : 0)) * Math.PI / 180
  const center = u => {
    if (row.shape === 'arc') { const a = row.startDeg * Math.PI / 180 + (u + length / 2) / row.radius; return [row.x + row.radius * Math.cos(a), row.z + row.radius * Math.sin(a)] }
    return [row.x + u * Math.cos(angle), row.z + u * Math.sin(angle)]
  }
  const map = (u, y, v) => {
    if (row.shape === 'arc') { const a = row.startDeg * Math.PI / 180 + (u + length / 2) / row.radius; return [row.x + (row.radius + v) * Math.cos(a), y, row.z + (row.radius + v) * Math.sin(a)] }
    return [row.x + u * Math.cos(angle) - v * Math.sin(angle), y, row.z + u * Math.sin(angle) + v * Math.cos(angle)]
  }
  const bounds = new THREE.Box3(), colors = ['#B94E54', '#D992AE', '#E2C65F', '#F1E8D7']
  const startVertex = batch.triangles() * 3, leafStart = leaves.vertices()
  function add(g, color, yOffset = 0, uOffset = 0, vOffset = 0) {
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...map(p.getX(i) + uOffset, p.getY(i) + yOffset, p.getZ(i) + vOffset))
    g.computeVertexNormals(); g.computeBoundingBox(); bounds.union(g.boundingBox)
    batch.add(g, color, [0, 0, 0])
  }
  const shape = new THREE.Shape(), segments = row.shape === 'arc' ? Math.ceil(length / .15) : 1
  for (let i = 0; i <= segments; i++) { const p = map(-length / 2 + i / segments * length, 0, -width / 2); i ? shape.lineTo(p[0] - row.x, -(p[2] - row.z)) : shape.moveTo(p[0] - row.x, -(p[2] - row.z)) }
  for (let i = segments; i >= 0; i--) { const p = map(-length / 2 + i / segments * length, 0, width / 2); shape.lineTo(p[0] - row.x, -(p[2] - row.z)) }
  shape.closePath()
  const proxyGeometry = new THREE.ExtrudeGeometry(shape, { depth: trough ? .45 : .16, bevelEnabled: false }); proxyGeometry.rotateX(-Math.PI / 2)
  const base = proxyGeometry.clone(); base.translate(row.x, 0, row.z); base.computeBoundingBox(); bounds.union(base.boundingBox)
  batch.add(base, trough ? '#C5BCA9' : '#C9C0AA', [0, 0, 0], 0, .85, 0, 'stone')
  add(new THREE.BoxGeometry(length - .04, .015, width - .04, segments), '#514E36', trough ? .452 : .165)
  const patches = Math.ceil(length / .8)
  for (let k = 0; k < patches; k++) {
    const pieces = [], capture = { add(g, color, position = [0, 0, 0], yaw = 0) { g.rotateY(yaw); g.translate(...position); pieces.push({ g, color }) } }
    appendOfficeGardenBed({ THREE, batch: capture, bed: { x: 0, z: 0, w: .9, d: .9 }, low, seed: index * 37 + k, organic: false })
    const box = new THREE.Box3()
    for (const { g } of pieces) { g.computeBoundingBox(); box.union(g.boundingBox) }
    const size = box.getSize(new THREE.Vector3()), middle = box.getCenter(new THREE.Vector3())
    for (const { g, color } of pieces) {
      g.translate(-middle.x, -box.min.y, -middle.z)
      g.scale((length / patches) / size.x, (trough ? .5 : .6) / size.y, (width - .04) / size.z)
      add(g, ['#D5B2AE', '#E7D7AA'].includes(color) ? colors[(index + k) % 4] : color, trough ? .45 : .16, -length / 2 + (k + .5) / patches * length)
    }
  }
  if (trough) {
    for (let k = 0; k < Math.ceil(length / .6); k++) {
      const u = -length / 2 + .3 + k * .6, p = center(u)
      const raisedBatch = { triangles: batch.triangles, add(g, color) { g.translate(0, .3, 0); g.computeBoundingBox(); bounds.union(g.boundingBox); batch.add(g, color) } }
      const raisedLeaves = { vertices: leaves.vertices, add(g, color) { g.translate(0, .3, 0); g.computeBoundingBox(); bounds.union(g.boundingBox); leaves.add(g, color) } }
      appendTropicalPlant({ THREE, batch: raisedBatch, leaves: raisedLeaves, low, inBed: true, row: { id: `${row.id}-vine-${k}`, x: p[0], z: p[1], r: .145, height: .55, species: '花叶绿萝', scale: 1.15 } })
    }
  } else for (let k = 0; k < row.count; k++) {
    const p = center((k + .5) / row.count * length - length / 2), speciesIndex = (index + k) % 4
    const plant = appendTropicalPlant({ THREE, batch, leaves, low, plaza: true, row: { id: `${row.id}-plant-${k}`, x: p[0], z: p[1], r: width * .42, height: speciesIndex === 1 ? 1.1 : 2.3, speciesIndex } })
    bounds.union(plant.bounds)
  }
  return { ...row, bounds, proxyGeometry, area: trough ? 0 : length * width, startVertex, vertexCount: batch.triangles() * 3 - startVertex, leafStart, leafCount: leaves.vertices() - leafStart, batch: 'pots', kind: trough ? 'trough' : 'flowerbed', renderHeight: bounds.max.y, species: trough ? '花叶绿萝' : PLAZA_SPECIES[index % 4], flowerColor: colors[index % 4], collision: 'ordinary Mesh' }
}
