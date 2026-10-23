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
  const leaf = mat('leaf', '#82a987', { roughness: .9 })
  const trunk = mat('trunk', '#826646', { roughness: 1 })
  const metal = mat('metal', '#26333a', { metalness: .35, roughness: .48 })
  const glow = mat('glow', '#e8c878', { emissive: color(THREE, '#e8c878'), emissiveIntensity: .55, toneMapped: false })
  const group = new THREE.Group(); group.name = 'office-island'
  const meshes = []
  const add = (geometry, material, position = [center.x, 0, center.z], rotation = 0, name = 'office-island-mesh') => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position); mesh.rotation.y = rotation; mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh); meshes.push(mesh); return mesh
  }
  const radial = (r, angle, y = 0) => [center.x + Math.cos(angle) * r, y, center.z + Math.sin(angle) * r]
  const segments = low ? 20 : 32
  add(new THREE.CylinderGeometry(spec.barOuter, spec.barOuter, .82, segments), wood, [center.x, .48, center.z], 0, 'office-island-bar')
  add(new THREE.CylinderGeometry(spec.barOuter + .04, spec.barOuter + .04, .06, segments), trim, [center.x, .91, center.z], 0, 'office-island-top')
  add(new THREE.TorusGeometry(spec.barOuter - .06, .025, 6, segments), glow, [center.x, .07, center.z], 0, 'office-island-led')
  const treeR = spec.treeRadius || 1.2
  add(new THREE.CylinderGeometry(.18, .28, 2.15, low ? 8 : 12), trunk, [center.x, 1.35, center.z], 0, 'office-island-tree-trunk')
  const crown = low ? 2 : 4
  for (let i = 0; i < crown; i++) add(new THREE.SphereGeometry(treeR * (low ? .62 : .72), low ? 8 : 12, low ? 5 : 8), leaf, [center.x + Math.cos(i * 1.7) * .45, 2.65 + (i % 2) * .3, center.z + Math.sin(i * 1.7) * .45], 0, 'office-island-tree-crown')
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
    root: group, seats, lounges, colliders: barColliders({ bar: { center, radius: spec.barOuter, gaps: [{ width: 1.5 }] } }),
    summary: () => ({ calls: meshes.filter(m => m.visible).length, triangles: meshes.filter(m => m.visible).reduce((sum, m) => sum + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0), seats: seats.length, sofas: lounges.length, colliders: proxies.length, low }),
    dispose() { if (disposed) return; disposed = true; group.traverse(item => { if (item.isMesh) item.geometry.dispose() }); for (const m of owned) m.dispose(); for (const texture of ownedTextures) texture.dispose?.(); for (const proxy of proxies) collision?.remove?.(proxy); group.removeFromParent() },
  }
}

export const officeIsland = buildOfficeIsland
