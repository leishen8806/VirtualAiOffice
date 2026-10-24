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

// 同一占地内混植，所有叶端留在登记边界内；不生成独立材质或动画。
export function appendOfficeGardenBed({ THREE, batch, bed, low = false, seed = 0, organic = false }) {
  const { x, z, w, d } = bed, points = [], segments = low ? 20 : 32
  for (let i = 0; i < segments; i++) {
    const a = i * Math.PI * 2 / segments, wave = .94 + .06 * Math.sin(a * 3 + seed)
    points.push([Math.cos(a) * w / 2 * wave, Math.sin(a) * d / 2 * wave])
  }
  const shape = scale => {
    const s = new THREE.Shape()
    points.forEach(([px, pz], i) => i ? s.lineTo(px * scale, -pz * scale) : s.moveTo(px * scale, -pz * scale))
    s.closePath(); return s
  }
  if (organic) {
    const border = shape(1), hole = new THREE.Path()
    points.slice().reverse().forEach(([px, pz], i) => i ? hole.lineTo(px * .95, -pz * .95) : hole.moveTo(px * .95, -pz * .95))
    hole.closePath(); border.holes.push(hole)
    const rim = new THREE.ExtrudeGeometry(border, { depth: .16, bevelEnabled: false, steps: 1 }); rim.rotateX(-Math.PI / 2)
    batch.add(rim, '#D9D3C6', [x, .02, z], 0, .85, 0, 'stone')
    const soil = new THREE.ShapeGeometry(shape(.95)); soil.rotateX(-Math.PI / 2)
    batch.add(soil, '#514E36', [x, .13, z], 0, 1)
  } else batch.add(new THREE.BoxGeometry(w, .1, d), '#55533E', [x, .08, z], 0, 1)
  const count = Math.max(5, Math.round(w * d * (low ? 1.5 : 3))), margin = .44
  const fract = n => n - Math.floor(n)
  for (let i = 0; i < count; i++) {
    const a = i * 2.399 + seed, radius = Math.sqrt((i + .5) / count) * (organic ? .88 : 1)
    const px = x + (organic ? Math.cos(a) * radius : fract(i * .618 + seed * .17) * 2 - 1) * (w / 2 - margin)
    const pz = z + (organic ? Math.sin(a) * radius : fract(i * .414 + seed * .13) * 2 - 1) * (d / 2 - margin)
    const height = .2 + fract(i * .37 + seed * .21) * .34
    for (let j = 0; j < (low ? 3 : 5); j++) {
      const leaf = officeLeafGeometry(THREE, a + j * 2.399, .23 + fract(i * .43 + j * .27) * .18, 2)
      leaf.scale(1, .65 + (i % 3) * .18, 1)
      batch.add(leaf, ['#365A3D', '#547044', '#7A8D53', '#456A4C'][(i + j) % 4], [px, height + j * .025, pz], 0, .82)
    }
    if (i % 3 === 0) {
      const stem = new THREE.CylinderGeometry(.008, .012, height + .2, 4)
      batch.add(stem, '#5B7043', [px, .13 + (height + .2) / 2, pz], 0, .9)
      for (let petal = 0; petal < (low ? 3 : 5); petal++) {
        const angle = petal * Math.PI * 2 / (low ? 3 : 5), flower = new THREE.CircleGeometry(.045, 5)
        flower.rotateX(-Math.PI / 2); flower.attributes.position.setY(0, .014); flower.computeVertexNormals()
        batch.add(flower, i % 2 ? '#D5B2AE' : '#E7D7AA', [px + Math.cos(angle) * .04, height + .34, pz + Math.sin(angle) * .04], 0, .8)
      }
    }
  }
}
