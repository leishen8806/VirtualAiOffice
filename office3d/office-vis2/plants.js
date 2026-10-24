import { LAYOUT_V3 } from '../office-layout.js'
import { createSampleBatch } from './batch.js'
const backdropOwners = new WeakMap()

// 小叶按固定三维方向铺在冠层内，使用真实几何轮廓，不依赖透明贴图或相机朝向。
export function officeBackdropCanopy(THREE, low = false) {
  const positions = [], colors = [], count = low ? 32 : 128, vertex = new THREE.Vector3(), rotation = new THREE.Euler()
  const fract = n => n - Math.floor(n)
  let radius2 = 0
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996323, y = 1 - 2 * (i + .5) / count, r = Math.sqrt(1 - y * y) * (.67 + .26 * fract(i * .618))
    const center = new THREE.Vector3(Math.sin(a) * r, y * .78, Math.cos(a) * r)
    const length = (low ? .45 : .30) * (.85 + .3 * fract(i * .37)), width = length * .43
    const rim = [[0,.5],[.5,.22],[.5,-.22],[0,-.5],[-.5,-.22],[-.5,.22]]
    rotation.set(a * .71, a, Math.sin(a * 1.3) * 1.4)
    const shade = .75 + .25 * fract(i * .43)
    for (let j = 0; j < 6; j++) for (const point of [[0,0,.022], [...rim[j],0], [...rim[(j+1)%6],0]]) {
      vertex.set(point[0] * width, point[1] * length, point[2]).applyEuler(rotation).add(center)
      positions.push(vertex.x, vertex.y, vertex.z); colors.push(shade, shade, shade); radius2 = Math.max(radius2, vertex.lengthSq())
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.scale(.98 / Math.sqrt(radius2), .98 / Math.sqrt(radius2), .98 / Math.sqrt(radius2))
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}

export function buildOfficeBackdropTrees({ THREE, scene, root, layout, low = false, quality } = {}) {
  const oldColors = [0x4f8a3c, 0x5d9a44, 0x3f7a39, 0x6aa04f], palette = ['#46633F','#56734A','#3A593B','#67804D']
  const sources = (scene?.children || []).filter(m => m.isInstancedMesh && m.geometry?.type === 'IcosahedronGeometry' &&
    m.geometry.parameters?.radius === 1 && m.geometry.parameters?.detail === 1 && m.userData.dynamic === true &&
    (m.material?.isMeshStandardMaterial || m.material?.isMeshLambertMaterial) &&
    Array.isArray(m.userData.list) && m.count === m.userData.list.length && m.count > 0 && m.count <= 512 &&
    m.userData.list.every(c => ['x','y','z','r','ph','m'].every(k => Number.isFinite(c[k])) && Number.isInteger(c.m) && c.m >= 0 && c.m < 4 && c.r > 0 && oldColors[c.m] === m.material.color.getHex()))
  const records = [], geometries = new Map(), materials = new Map(), owner = {}, matrix = new THREE.Matrix4(), masked = new THREE.Matrix4(), tiny = new THREE.Vector3(1e-6,1e-6,1e-6)
  const group = new THREE.Group(); group.name = 'office-owned-backdrop-trees'; group.userData.dynamic = true
  let disposed = false, reason = '', tier, ownedMesh
  const dispose = () => {
    if (disposed) return; disposed = true
    for (const r of records) {
      if (r.source.instanceMatrix?.version === r.maskedVersion) { r.indices.forEach((index,i) => r.source.setMatrixAt(index,r.saved[i])); r.source.instanceMatrix.needsUpdate = true }
      if (backdropOwners.get(r.source) === owner) backdropOwners.delete(r.source)
    }
    ownedMesh?.dispose(); ownedMesh = null
    group.removeFromParent(); group.clear(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
    records.length = 0; geometries.clear(); materials.clear()
  }
  const chooseTier = () => {
    const next = quality ? quality.tier === 'low' : low
    if (next === tier) return
    if (!geometries.has(next)) geometries.set(next,officeBackdropCanopy(THREE,next))
    if (!materials.has(next)) {
      const options = { color:'#ffffff', vertexColors:true, side:THREE.DoubleSide }
      materials.set(next,next ? new THREE.MeshLambertMaterial(options) : new THREE.MeshStandardMaterial({...options,roughness:.88}))
    }
    if (ownedMesh) { ownedMesh.geometry = geometries.get(next); ownedMesh.material = materials.get(next); ownedMesh.boundingSphere = null }
    tier = next
  }
  const sync = () => {
    if (disposed || !records.length) return
    try {
      if (records.some(r => r.source.parent !== scene)) { reason = 'environment removed'; dispose(); return }
      chooseTier(); root.updateWorldMatrix(true,false)
      const inverse = root.matrixWorld.clone().invert(); let updated = false
      for (const r of records) {
        // RenderPass与GTAO同帧各调用一次；不能再次读取本模块已缩小的源矩阵。
        if (r.source.instanceMatrix.version === r.maskedVersion) continue
        r.source.updateWorldMatrix(true,false); const local = inverse.clone().multiply(r.source.matrixWorld)
        r.indices.forEach((index,i) => {
          r.source.getMatrixAt(index,r.saved[i]); ownedMesh.setMatrixAt(r.offset+i,matrix.multiplyMatrices(local,r.saved[i]))
          r.source.setMatrixAt(index,masked.copy(r.saved[i]).scale(tiny))
        })
        r.source.instanceMatrix.needsUpdate = true; r.maskedVersion = r.source.instanceMatrix.version
        updated = true
      }
      if (updated) ownedMesh.instanceMatrix.needsUpdate = true
      if (!ownedMesh.boundingSphere) { ownedMesh.computeBoundingSphere(); ownedMesh.boundingSphere.radius += .3 }
    } catch (error) { reason = String(error?.message || error); dispose() }
  }
  try {
    if (!root || !layout?.envelope || sources.length !== 4 || new Set(sources.map(s=>s.geometry.uuid)).size !== 1 || sources.some(s=>backdropOwners.has(s))) reason = 'unrecognized or already owned environment'
    else {
      let count = 0
      for (const source of sources) {
        const indices = source.userData.list.map((_,i)=>i)
        if (indices.length) { records.push({source,indices,saved:indices.map(()=>new THREE.Matrix4()),offset:count,color:source.userData.list[0].m}); count += indices.length }
      }
      if (records.length) {
        chooseTier()
        ownedMesh = new THREE.InstancedMesh(geometries.get(tier),materials.get(tier),count)
        ownedMesh.name = 'office-backdrop-leaf-clusters'; ownedMesh.userData.qualityProxy = true
        ownedMesh.castShadow = ownedMesh.receiveShadow = false; group.add(ownedMesh)
        for (const r of records) {
          const color = new THREE.Color(palette[r.color]); r.indices.forEach((_,i)=>ownedMesh.setColorAt(r.offset+i,color))
          backdropOwners.set(r.source,owner)
        }
        ownedMesh.instanceColor.needsUpdate = true
        root.add(group); sync()
      } else reason = 'no office trees'
    }
  } catch (error) { reason = String(error?.message || error); dispose() }
  return { root:group, sync, dispose, summary:()=>({ enabled:!disposed&&records.length>0, reason, calls:ownedMesh?1:0, clusters:records.reduce((n,r)=>n+r.indices.length,0), triangles:ownedMesh?ownedMesh.geometry.attributes.position.count/3*ownedMesh.count:0, low:!!tier }) }
}
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
