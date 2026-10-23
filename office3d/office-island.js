import { LAYOUT_V3 } from './office-layout.js'
import { OFFICE_THEME_V2 as T } from './office-theme-v2.js'
import { LOUNGE_SIT, barColliders, barLounges } from './office-bar-geometry.js'

const color = (THREE, value) => new THREE.Color(value)

function makeMaterial(THREE, value, options = {}) {
  return new THREE.MeshStandardMaterial({ color: value, roughness: options.roughness ?? .78, metalness: options.metalness ?? 0, ...options })
}

function labelTexture(THREE, canvasTex, text) {
  if (!canvasTex) return null
  return canvasTex(512, 96, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#f6f2e9'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#49453e'; ctx.font = '600 42px Microsoft YaHei, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2)
  })
}

export function buildOfficeIsland({ THREE, root, layout = LAYOUT_V3, materials = {}, collision, canvasTex, low = false, materialOverrides = {} } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeIsland requires THREE and root')
  const spec = layout.island || LAYOUT_V3.island
  const center = spec.center || { x: 2, z: -6 }
  const owned = []
  const ownedTextures = []
  const mat = (name, value, options) => {
    if (materialOverrides[name]) return materialOverrides[name]
    if (materials[name]) return materials[name]
    const made = makeMaterial(THREE, value, options); owned.push(made); return made
  }
  const wood = mat('wood', T.nameplate, { roughness: .72 })
  const trim = mat('trim', T.trim, { roughness: .6 })
  const fabric = mat('fabric', '#607b7d', { roughness: .94 })
  const leaf = mat('leaf', '#3e6544', { roughness: .96 })
  const leafLight = mat('leafLight', '#668b58', { roughness: .94 })
  const leafDeep = mat('leafDeep', '#294b35', { roughness: .98 })
  const trunk = mat('trunk', '#6f6252', { roughness: 1 })
  const barkLight = mat('barkLight', '#8b7963', { roughness: 1 })
  const treePool = mat('treePool', '#e8decd', { roughness: .9 })
  const soil = mat('soil', '#4f4538', { roughness: 1 })
  const metal = mat('metal', '#26333a', { metalness: .35, roughness: .48 })
  const glow = mat('glow', '#e8c878', { emissive: color(THREE, '#e8c878'), emissiveIntensity: .55, toneMapped: false })
  const group = new THREE.Group(); group.name = 'office-island'
  const meshes = []
  const add = (geometry, material, position = [center.x, 0, center.z], rotation = 0, name = 'office-island-mesh') => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position)
    if (typeof rotation === 'number') mesh.rotation.y = rotation
    else mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0)
    mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh); meshes.push(mesh); return mesh
  }
  const radial = (r, angle, y = 0) => [center.x + Math.cos(angle) * r, y, center.z + Math.sin(angle) * r]
  const segments = low ? 20 : 32
  add(new THREE.CylinderGeometry(spec.barOuter, spec.barOuter, .82, segments), wood, [center.x, .48, center.z], 0, 'office-island-bar')
  add(new THREE.CylinderGeometry(spec.barOuter + .04, spec.barOuter + .04, .06, segments), trim, [center.x, .91, center.z], 0, 'office-island-top')
  add(new THREE.TorusGeometry(spec.barOuter - .06, .025, 6, segments), glow, [center.x, .07, center.z], 0, 'office-island-led')
  // 福州南后街“爱心榕树”的观赏面朝南（前厅）：双峰、中央凹口和不对称下收拢都用真实体量表达。
  const treeProfile = Object.freeze({ height: 3.8, crownWidth: 4, crownDepth: 2.8, poolDiameter: 2, face: 'south' })
  add(new THREE.CylinderGeometry(1.05, 1.05, .18, segments), treePool, [center.x, 1.01, center.z], 0, 'office-island-tree-pool')
  add(new THREE.CylinderGeometry(.78, .84, .04, segments), soil, [center.x, 1.12, center.z], 0, 'office-island-tree-soil')
  add(new THREE.CylinderGeometry(.23, .34, 1.65, low ? 8 : 12), trunk, [center.x, 1.94, center.z], 0, 'office-island-tree-trunk')
  const branch = (x, y, z, radius, height, tilt, material = trunk, name = 'office-island-tree-branch') => add(new THREE.CylinderGeometry(radius * .72, radius, height, low ? 6 : 9), material, [center.x + x, y, center.z + z], { z: tilt }, name)
  branch(-.38, 2.72, .02, .12, 1.2, -.28)
  branch(.42, 2.78, .04, .11, 1.18, .3, barkLight)
  branch(-.1, 2.93, -.02, .08, .8, -.08, barkLight)
  const clusterGeometry = (scale = 1) => new THREE.SphereGeometry(scale, low ? 7 : 11, low ? 5 : 8)
  const clusters = low
    ? [[-.78, 3.12, .02, .8, .62, .62, leaf], [.8, 3.15, .05, .82, .64, .62, leafLight], [0, 2.58, .04, .95, .55, .7, leafDeep]]
    : [
      [-.84, 3.35, .03, .9, .72, .68, leaf], [.88, 3.38, .02, .94, .74, .7, leafLight],
      [-1.43, 3.02, -.02, .73, .58, .66, leafDeep], [1.46, 3.03, .02, .76, .6, .7, leaf],
      [-.72, 2.72, .08, .82, .6, .72, leafLight], [.2, 2.54, .04, .88, .58, .8, leafDeep],
      [.92, 2.72, .06, .78, .58, .7, leaf], [-.15, 3.78, -.02, .48, .36, .5, leafLight],
    ]
  for (const [x, y, z, sx, sy, sz, material] of clusters) add(clusterGeometry(1), material, [center.x + x, y, center.z + z], 0, 'office-island-tree-leaf-cluster').scale.set(sx, sy, sz)
  const seats = (layout.bar?.seats || Array.from({ length: 10 }, (_, i) => ({ id: `bar-seat-${i + 1}`, ...Object.fromEntries([]) }))).map((seat, i) => {
    const angle = Number.isFinite(seat.x) ? Math.atan2(seat.z - center.z, seat.x - center.x) : i * Math.PI * 2 / 10
    const r = spec.stoolRadius || 4.2
    return { id: seat.id || `bar-seat-${i + 1}`, x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r, yaw: angle + Math.PI, angle, sitOffset: { forward: 0, lift: 0 } }
  })
  for (const seat of seats) {
    add(new THREE.CylinderGeometry(.28, .28, .11, low ? 8 : 12), fabric, [seat.x, .82, seat.z], 0, 'office-island-stool-seat')
    add(new THREE.CylinderGeometry(.045, .055, .72, 8), metal, [seat.x, .43, seat.z], 0, 'office-island-stool-leg')
  }
  const lounges = barLounges({ bar: { center, radius: spec.sofaOuter || 5.8, gaps: [{ width: 1.5 }] } }).map(seat => ({ ...seat, sitOffset: { forward: LOUNGE_SIT.hipForward, lift: LOUNGE_SIT.hipLift } }))
  for (const seat of lounges) {
    add(new THREE.BoxGeometry(1.35, .12, LOUNGE_SIT.seatDepth), fabric, [seat.x, LOUNGE_SIT.seatTop - .06, seat.z], seat.yaw, 'office-island-sofa-seat')
    add(new THREE.BoxGeometry(1.35, .44, .12), fabric, [seat.x + Math.cos(seat.angle) * .18, .78, seat.z + Math.sin(seat.angle) * .18], seat.yaw, 'office-island-sofa-back')
  }
  // Merge static geometry into one material batch; the independent label is the only extra draw.
  for (const mesh of meshes) mesh.updateMatrix()
  const values = { position: [], normal: [], color: [] }
  for (const mesh of meshes) {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrix); geometry.computeVertexNormals()
    const positions = geometry.attributes.position, normals = geometry.attributes.normal, tint = mesh.material.color || color(THREE, '#ffffff')
    for (let i = 0; i < positions.count; i++) { values.position.push(positions.getX(i), positions.getY(i), positions.getZ(i)); values.normal.push(normals.getX(i), normals.getY(i), normals.getZ(i)); values.color.push(tint.r, tint.g, tint.b) }
    geometry.dispose()
    mesh.removeFromParent()
  }
  const merged = new THREE.BufferGeometry(); merged.setAttribute('position', new THREE.Float32BufferAttribute(values.position, 3)); merged.setAttribute('normal', new THREE.Float32BufferAttribute(values.normal, 3)); merged.setAttribute('color', new THREE.Float32BufferAttribute(values.color, 3))
  const mergedMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .82 }); owned.push(mergedMaterial)
  const staticMesh = new THREE.Mesh(merged, mergedMaterial); staticMesh.name = 'office-island-static-batch'; staticMesh.castShadow = false; staticMesh.receiveShadow = false; group.add(staticMesh); meshes.splice(0, meshes.length, staticMesh)
  const sign = labelTexture(THREE, canvasTex, '中央茶水吧岛 · 演示空间')
  if (sign) { ownedTextures.push(sign); const signMat = new THREE.MeshBasicMaterial({ map: sign, transparent: true }); owned.push(signMat); add(new THREE.PlaneGeometry(3.2, .6), signMat, [center.x, 1.2, center.z - spec.barOuter - .03], Math.PI, 'office-island-label') }
  const proxies = []
  for (const bounds of barColliders({ bar: { center, radius: spec.barOuter, gaps: [{ width: 1.5 }] } })) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(bounds.x1 - bounds.x0, 1.1, bounds.z1 - bounds.z0), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = bounds.id; proxy.visible = false; proxy.position.set((bounds.x0 + bounds.x1) / 2, .55, (bounds.z0 + bounds.z1) / 2); group.add(proxy); proxies.push(proxy); collision?.add?.(proxy, 'officeIsland')
  }
  root.add(group)
  let disposed = false
  return {
    root: group, seats, lounges, treeProfile, colliders: barColliders({ bar: { center, radius: spec.barOuter, gaps: [{ width: 1.5 }] } }),
    summary: () => ({ calls: meshes.filter(m => m.visible).length, triangles: meshes.filter(m => m.visible).reduce((sum, m) => sum + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0), seats: seats.length, sofas: lounges.length, colliders: proxies.length, low }),
    dispose() { if (disposed) return; disposed = true; group.traverse(item => { if (item.isMesh) item.geometry.dispose() }); for (const m of owned) m.dispose(); for (const texture of ownedTextures) texture.dispose?.(); for (const proxy of proxies) collision?.remove?.(proxy); group.removeFromParent() },
  }
}

export const officeIsland = buildOfficeIsland
