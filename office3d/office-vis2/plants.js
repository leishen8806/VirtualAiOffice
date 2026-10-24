import { LAYOUT_V3 } from '../office-layout.js'
import { createSampleBatch } from './batch.js'
export function buildOfficeSamplePlants({ THREE, root, layout = LAYOUT_V3, assets } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeSamplePlants requires THREE and root')
  const c = layout.island.center, f = layout.foyer
  const poses = [-1, 1].flatMap(sign => [-1, 1].map(side => ({ x: c.x + sign * 4.4, z: c.z + side * 3.3 })))
  for (const x of [f.x0 + .75, f.x1 - .75]) for (const z of [f.z0 + 2.2, f.z1 - 1]) poses.push({ x, z })
  const group = new THREE.Group(); group.name = 'office-sample-plants'; const batch = createSampleBatch(THREE, assets)
  batch.add(new THREE.CylinderGeometry(.32, .4, .46, 12), '#F4F1EA', [0, .23, 0], 0, .9)
  batch.add(new THREE.CylinderGeometry(.29, .29, .025, 12), '#534A3C', [0, .47, 0], 0, 1)
  const rim = new THREE.TorusGeometry(.315, .018, 3, 12); rim.rotateX(Math.PI / 2)
  batch.add(rim, '#D9D3C6', [0, .46, 0], 0, .8)
  for (let i = 0; i < 10; i++) {
    const angle = i * 2.399, height = .62 + (i % 4) * .14, length = .27 + (i % 3) * .035
    const base = new THREE.Vector3(Math.sin(angle) * .12, height, Math.cos(angle) * .12)
    const soil = new THREE.Vector3(Math.sin(angle) * .035, .47, Math.cos(angle) * .035), stem = base.clone().sub(soil)
    const stalk = new THREE.CylinderGeometry(.006, .009, stem.length(), 5, 1, true)
    stalk.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), stem.normalize()))
    batch.add(stalk, '#526448', soil.clone().add(base).multiplyScalar(.5).toArray(), 0, .85)
    const leaf = officeLeafGeometry(THREE, angle, length)
    batch.add(leaf, i % 4 ? '#4D6A46' : '#708650', base.toArray(), 0, .76)
  }
  const plants = batch.build(group, 'sample-instanced-potted-plants', poses); root.add(group)
  return { root: group, placements: poses, summary: () => ({ calls: 1, triangles: plants.triangles(), pots: poses.length }), dispose() { plants.dispose(); group.removeFromParent() } }
}

export function officeLeafGeometry(THREE, angle, length, segments = 7) {
  const vertices = [], indices = []
  // 独立正反顶点保留薄叶两面的法线；不叠透明贴片，也不把球体当叶片。
  for (let side = 0; side < 2; side++) {
    const offset = vertices.length / 3
    for (let row = 0; row <= segments; row++) {
      const t = row / segments, arch = Math.sin(Math.PI * t), width = row === 0 || row === segments ? 0 : .105 * arch ** .75, radius = length * t
      for (const edge of [-1, 0, 1]) vertices.push(radius * Math.sin(angle) + edge * width * Math.cos(angle), .26 * t + .11 * arch - Math.abs(edge) * .025 * arch, radius * Math.cos(angle) - edge * width * Math.sin(angle))
    }
    for (let row = 0; row < segments; row++) for (let col = 0; col < 2; col++) {
      const a = offset + row * 3 + col, b = a + 1, c = a + 3, d = c + 1
      if (row > 0) indices.push(...(side ? [a, c, b] : [a, b, c]))
      if (row < segments - 1) indices.push(...(side ? [b, c, d] : [b, d, c]))
    }
  }
  const leaf = new THREE.BufferGeometry(); leaf.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); leaf.setIndex(indices); leaf.computeVertexNormals()
  return leaf
}
