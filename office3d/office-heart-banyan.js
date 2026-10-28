// 静态缩景资产；本地小叶几何，新闻图片仅作形态参考，不进入纹理。
import { bindOfficeLeafNormalPass } from './office-vis2/leaf-pass.js'
export function buildHeartBanyan({ THREE, root, center = { x: 0, z: 0 }, low = false, leafTriangles = false, fit } = {}) {
  if (!THREE || !root) throw new TypeError('buildHeartBanyan requires THREE and root')
  if (fit && (!['crownDiameter', 'crownBase', 'totalHeight', 'poolDiameter', 'poolHeight', 'trunkDiameter', 'trunkTop'].every(key => Number.isFinite(fit[key]) && fit[key] > 0) || fit.totalHeight <= fit.crownBase || fit.trunkTop <= fit.poolHeight)) throw new TypeError('Invalid banyan fit')
  const group = new THREE.Group(); group.name = 'office-heart-banyan'
  group.position.set(center.x, 0, center.z)
  const geometries = [], materials = []
  let seed = 7319, disposed = false
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const material = options => { const m = new THREE.MeshStandardMaterial(options); materials.push(m); return m }
  const merge = (parts, name, options) => {
    const p = [], n = [], c = []
    for (const [geometry, tint] of parts) {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry
      const color = new THREE.Color(tint)
      for (let i = 0; i < flat.attributes.position.count; i++) {
        p.push(flat.attributes.position.getX(i), flat.attributes.position.getY(i), flat.attributes.position.getZ(i))
        n.push(flat.attributes.normal.getX(i), flat.attributes.normal.getY(i), flat.attributes.normal.getZ(i))
        const grain = name === 'heart-banyan-trunk-and-branches' ? .78 + .22 * Math.abs(Math.sin(flat.attributes.position.getX(i) * 67 + flat.attributes.position.getZ(i) * 53 + flat.attributes.position.getY(i) * 2)) : 1
        c.push(color.r * grain, color.g * grain, color.b * grain)
      }
      if (flat !== geometry) flat.dispose()
      geometry.dispose()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
    geometries.push(g)
    const mesh = new THREE.Mesh(g, material({ vertexColors: true, ...options })); mesh.name = name
    mesh.receiveShadow = true; group.add(mesh); return mesh
  }
  const pool = new THREE.LatheGeometry([[.82, .08], [.97, .08], [1, .35], [.98, .4], [.83, .4], [.82, .08]].map(([x, y]) => new THREE.Vector2(x, y)), 32)
  const soil = new THREE.CircleGeometry(.82, 32); soil.rotateX(-Math.PI / 2); soil.translate(0, .29, 0)
  merge([[pool, '#e8decd'], [soil, '#554b3e']], 'heart-banyan-pool', { roughness: .88 })

  const wood = []; let branchCount = 0
  const branch = (points, r0, r1, radial = 8) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)))
    const g = new THREE.TubeGeometry(curve, 7, 1, radial, false)
    const a = g.attributes.position
    for (let i = 0; i <= 7; i++) {
      const origin = curve.getPointAt(i / 7), radius = r0 + (r1 - r0) * i / 7
      for (let j = 0; j <= radial; j++) {
        const idx = i * (radial + 1) + j
        const ridge = 1 + .07 * Math.sin(j * 2.7 + i * .35)
        a.setXYZ(idx, origin.x + (a.getX(idx) - origin.x) * radius * ridge, origin.y + (a.getY(idx) - origin.y) * radius * ridge, origin.z + (a.getZ(idx) - origin.z) * radius * ridge)
      }
    }
    g.computeVertexNormals(); wood.push([g, '#756857']); branchCount++
  }
  branch([[0, .27, 0], [-.08, .7, .04], [.03, 1.2, -.02], [-.02, 1.75, 0], [.12, 2.35, -.05]], .23, .07, 12)
  branch([[0, 1.25, 0], [-.3, 1.8, .04], [-.75, 2.4, .1], [-1.18, 3.1, .05]], .14, .025)
  branch([[0, 1.45, 0], [.33, 1.96, -.1], [.9, 2.62, -.15], [1.28, 3.16, -.12]], .13, .025)
  branch([[0, 1.65, 0], [-.2, 2.15, -.4], [-.55, 2.7, -.85], [-.8, 3.14, -.9]], .095, .016)
  branch([[.04, 1.85, 0], [.3, 2.2, .45], [.6, 2.72, .82], [.8, 3.15, .87]], .09, .016)
  for (const sign of [-1, 1]) for (let i = 0; i < 3; i++) {
    const z = (i - 1) * .7
    branch([[sign * .6, 2.35, 0], [sign * 1.05, 2.7, z * .6], [sign * 1.6, 2.95, z]], .035, .008, 5)
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .4, x = Math.cos(a), z = Math.sin(a)
    branch([[0, .75, 0], [x * .18, .42, z * .18], [x * .55, .31, z * .55]], .065, .018, 4)
    branch([[x * .65, 2.5, z * .55], [x * 1.1, 2.85, z * .8], [x * 1.35, 3.12, z * .88]], .022, .006, 4)
  }
  const mainTrunkCount = wood[0][0].index?.count ?? wood[0][0].attributes.position.count
  merge(wood, 'heart-banyan-trunk-and-branches', { roughness: .98 })

  // 小叶用解析椭圆裁边，保留三维固定朝向；不加载照片，也不随相机转动。
  const vertices = [], uvs = [], visibleLeaves = []
  for (let i = 0; i < 3; i++) {
    const angle = i * 2.399, x = Math.cos(angle) * .07, z = Math.sin(angle) * .07, y = (i % 2) * .035
    const rim = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => {
      const u = a * .09, v = b * .038
      return [x + Math.cos(angle) * u - Math.sin(angle) * v, y + v * .2, z + Math.sin(angle) * u + Math.cos(angle) * v]
    })
    visibleLeaves.push(...rim.flat())
    if (leafTriangles) { vertices.push(...rim[0], ...rim[1].map((v,j)=>2*v-rim[0][j]), ...rim[3].map((v,j)=>2*v-rim[0][j]));uvs.push(0,0,2,0,0,2) }
    else { for (const j of [0,1,2,0,2,3]) vertices.push(...rim[j]);uvs.push(0,0,1,0,1,1,0,0,1,1,0,1) }
  }
  const leafGeometry = new THREE.BufferGeometry(); leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); leafGeometry.computeVertexNormals(); geometries.push(leafGeometry)
  if (leafTriangles) { const bounds=new THREE.BufferGeometry();bounds.setAttribute('position',new THREE.Float32BufferAttribute(visibleLeaves,3));bounds.computeBoundingBox();bounds.computeBoundingSphere();leafGeometry.boundingBox=bounds.boundingBox.clone();leafGeometry.boundingSphere=bounds.boundingSphere.clone();bounds.dispose() }
  const count = low ? 500 : 1000
  const leafMaterial = material({ color: 0xffffff, roughness: .87, side: THREE.DoubleSide })
  leafMaterial.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 banyanUv;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nbanyanUv = uv;')
    shader.fragmentShader = 'varying vec2 banyanUv;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nvec2 leafPoint = banyanUv * 2.0 - 1.0;\nif (dot(leafPoint, leafPoint) > 1.0) discard;\ndiffuseColor.rgb *= 0.94 + 0.06 * smoothstep(0.0, 0.035, abs(leafPoint.y));')
  }
  leafMaterial.customProgramCacheKey = () => 'heart-banyan-oval-leaf-v1'
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, count)
  leaves.name = 'heart-banyan-small-leaf-clusters'; const transform = new THREE.Object3D()
  if (leafTriangles) bindOfficeLeafNormalPass(leaves)
  const colors = ['#355638', '#426640', '#4C7545', '#557A48', '#648B50'].map(c => new THREE.Color(c))
  const accepted = []
  const envelope = (x, y, z) => {
    const ellipsoid = (cx, cy, cz, rx, ry, rz) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
    const shape = Math.min(ellipsoid(-.83, 2.92, 0, .98, .68, 1.12), ellipsoid(.86, 3.00, -.05, .97, .65, 1.16), ellipsoid(0, 2.48, .02, 1.37, .59, 1.01))
    const notch = 2.97 + Math.min(1, Math.abs(x) / .8) * .72
    // 更多细叶覆盖冠层外缘，中央凹口贯穿冠深，斜俯视也可辨认双峰。
    return shape > .55 && shape < 1 + .065 * Math.sin(11 * x + 9 * y + 7 * z) && y < notch
  }
  let attempts = 0
  while (accepted.length < count && attempts++ < count * 100) {
    const x = (random() * 2 - 1) * 1.85, y = 1.85 + random() * 1.85, z = (random() * 2 - 1) * 1.23
    if (!envelope(x, y, z)) continue
    const scale = .86 + random() * .42
    transform.position.set(x, y, z); transform.rotation.set(random() * Math.PI, random() * Math.PI * 2, random() * Math.PI)
    transform.scale.setScalar(scale); transform.updateMatrix()
    const i = accepted.length; leaves.setMatrixAt(i, transform.matrix); leaves.setColorAt(i, colors[Math.floor(random() * colors.length)])
    accepted.push({ x, y, z })
  }
  leaves.count = accepted.length; leaves.instanceMatrix.needsUpdate = true; leaves.instanceColor.needsUpdate = true
  leaves.computeBoundingBox(); leaves.computeBoundingSphere(); group.add(leaves); root.add(group)
  if (fit) {
    const { crownDiameter, crownBase, totalHeight, poolDiameter, poolHeight, trunkDiameter, trunkTop } = fit
    // Measure expanded leaf vertices: cached instance bounds include empty corners of each leaf plane.
    const bounds = new THREE.Box3(), matrix = new THREE.Matrix4(), vertex = new THREE.Vector3()
    for (let i = 0; i < leaves.count; i++) {
      leaves.getMatrixAt(i, matrix)
      for (let j = 0; j < leafGeometry.attributes.position.count; j++) bounds.expandByPoint(vertex.fromBufferAttribute(leafGeometry.attributes.position, j).applyMatrix4(matrix))
    }
    const size = bounds.getSize(new THREE.Vector3()), middle = bounds.getCenter(new THREE.Vector3())
    leaves.scale.set(crownDiameter / size.x, (totalHeight - crownBase) / size.y, crownDiameter / size.z)
    leaves.position.set(-middle.x * leaves.scale.x, crownBase - bounds.min.y * leaves.scale.y, -middle.z * leaves.scale.z)
    const pot = group.getObjectByName('heart-banyan-pool'), woodMesh = group.getObjectByName('heart-banyan-trunk-and-branches')
    pot.geometry.computeBoundingBox()
    const potBox = pot.geometry.boundingBox, potSize = potBox.getSize(new THREE.Vector3())
    pot.scale.set(poolDiameter / potSize.x, poolHeight / potSize.y, poolDiameter / potSize.z)
    pot.position.y = -potBox.min.y * pot.scale.y
    const positions = woodMesh.geometry.attributes.position
    woodMesh.geometry.computeBoundingBox()
    const woodBox = woodMesh.geometry.boundingBox.clone(), baseScale = trunkDiameter / (.46 * 1.07)
    const trunkBox = new THREE.Box3()
    for (let i = 0; i < mainTrunkCount; i++) trunkBox.expandByPoint(vertex.fromBufferAttribute(positions, i))
    const trunkSize = trunkBox.getSize(new THREE.Vector3()), trunkCenter = trunkBox.getCenter(new THREE.Vector3())
    for (let i = 0; i < positions.count; i++) {
      if (i < mainTrunkCount) {
        positions.setXYZ(i, (positions.getX(i) - trunkCenter.x) * trunkDiameter / trunkSize.x, poolHeight + (positions.getY(i) - trunkBox.min.y) * (trunkTop - poolHeight) / trunkSize.y, (positions.getZ(i) - trunkCenter.z) * trunkDiameter / trunkSize.z)
        continue
      }
      const y = positions.getY(i), upper = Math.max(0, Math.min(1, (y - 1.25) / (2.35 - 1.25)))
      const xScale = baseScale + (leaves.scale.x - baseScale) * upper, zScale = baseScale + (leaves.scale.z - baseScale) * upper
      const fittedY = y <= 2.35 ? poolHeight + (y - woodBox.min.y) / (2.35 - woodBox.min.y) * (trunkTop - poolHeight) : trunkTop + (y - 2.35) / (woodBox.max.y - 2.35) * (totalHeight - trunkTop)
      positions.setXYZ(i, positions.getX(i) * xScale, fittedY, positions.getZ(i) * zScale)
    }
    positions.needsUpdate = true; woodMesh.geometry.computeVertexNormals(); woodMesh.geometry.computeBoundingBox(); woodMesh.geometry.computeBoundingSphere()
    woodMesh.userData.trunkVertices = { start: 0, count: mainTrunkCount }
    group.userData.fit = { ...fit }
  }
  const triangles = group.children.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1), 0)
  return {
    root: group,
    summary: () => ({ calls: 3, triangles, leafClusters: leaves.count, branches: branchCount, face: '+z', static: true, low }),
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); leaves.dispose() },
  }
}
