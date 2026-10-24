import { LAYOUT_V3 } from './office-layout.js'
import { OFFICE_THEME_V2 as T } from './office-theme-v2.js'

const zone = (layout, id) => (layout.regions || []).find(item => item.id === id)

function buildZone({ THREE, root, layout = LAYOUT_V3, materials = {}, collision, canvasTex, low = false, id, title, kind }) {
  if (!THREE || !root) throw new TypeError('office zone requires THREE and root')
  const area = zone(layout, id); if (!area) throw new Error(`missing office zone: ${id}`)
  const group = new THREE.Group(); group.name = `office-zone-${id}`; root.add(group)
  const owned = []; const ownedTextures = []; const meshes = []; const get = (name, value) => materials[name] || (owned.push(new THREE.MeshStandardMaterial({ color: value, roughness: .82 })), owned.at(-1))
  const warm = get('wood', T.nameplate), soft = get('fabric', '#607b7d'), line = get('trim', T.trim), white = get('white', T.exteriorWall)
  const cx = (area.x0 + area.x1) / 2, cz = (area.z0 + area.z1) / 2, w = area.x1 - area.x0, d = area.z1 - area.z0
  const add = (geometry, material, x, y, z, name) => { const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = false; group.add(mesh); meshes.push(mesh); return mesh }
  add(new THREE.BoxGeometry(w, .12, d), white, cx, .06, cz, `${id}-plinth`)
  if (kind === 'leisure') {
    add(new THREE.BoxGeometry(Math.min(4.6, w - .8), .56, .9), warm, cx, .34, cz, `${id}-display-wall`)
    add(new THREE.BoxGeometry(1.9, .45, .75), soft, cx - 1.4, .34, cz + 1.2, `${id}-sofa`)
    add(new THREE.BoxGeometry(1.9, .45, .75), soft, cx + 1.4, .34, cz - 1.2, `${id}-sofa-2`)
  } else if (kind === 'creative') {
    add(new THREE.CylinderGeometry(Math.min(1.45, w / 3), Math.min(1.45, w / 3), .08, low ? 12 : 24), warm, cx, .82, cz, `${id}-round-table`)
    add(new THREE.BoxGeometry(w - .6, 1.6, .06), white, cx, 1.5, area.z0 + .18, `${id}-whiteboard`)
    add(new THREE.BoxGeometry(w - .8, .7, .05), line, cx, 1.7, area.z1 - .2, `${id}-postit-wall`)
    for (const [x, z] of [[cx - 1.5, cz], [cx + 1.5, cz], [cx, cz - 1.4]]) add(new THREE.BoxGeometry(.65, .48, .65), soft, x, .3, z, `${id}-chair`)
  } else {
    add(new THREE.CylinderGeometry(Math.min(1.1, w / 3), Math.min(1.1, w / 3), .72, low ? 12 : 20), warm, cx, .42, cz, `${id}-small-bar`)
    for (const i of [0, 1, 2, 3]) { const a = i * Math.PI / 2; add(new THREE.CylinderGeometry(.18, .18, .7, 8), soft, cx + Math.cos(a) * 1.25, .35, cz + Math.sin(a) * 1.25, `${id}-high-stool`) }
    add(new THREE.CylinderGeometry(1.1, 1.1, .08, low ? 12 : 20), white, cx, .82, cz + 1.65, `${id}-round-table`)
  }
  const texture = canvasTex?.(512, 96, (ctx, width, height) => { ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#f6f2e9'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#49453e'; ctx.font = '600 40px Microsoft YaHei,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(title, width / 2, height * .62) })
  if (texture) { ownedTextures.push(texture); const signMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true }); owned.push(signMat); add(new THREE.PlaneGeometry(Math.min(w - .5, 4), .65), signMat, cx, 2, area.z0 + .08, `${id}-label`) }
  return { root: group, seats: [], colliders: [], title, id, summary: () => ({ calls: meshes.length, triangles: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0), seats: 0, low }), dispose() { group.traverse(item => { if (item.isMesh) item.geometry.dispose() }); for (const m of owned) m.dispose(); for (const value of ownedTextures) value.dispose?.(); group.removeFromParent() } }
}

export function buildLeisureZone(options = {}) { return buildZone({ ...options, id: 'leisure', title: '休闲展示区 · 模拟空间', kind: 'leisure' }) }
export function buildCreativeZone(options = {}) { return buildZone({ ...options, id: 'creative', title: '创意讨论区 · 模拟空间', kind: 'creative' }) }
export function buildDiningZone(options = {}) { return buildZone({ ...options, id: 'dining', title: '餐饮休憩角 · 模拟空间', kind: 'dining' }) }
export const officeZoneFactories = Object.freeze([buildLeisureZone, buildCreativeZone, buildDiningZone])
export function buildOfficeZones(options = {}) {
  const root = options.root || new options.THREE.Group(); const values = officeZoneFactories.map(factory => factory({ ...options, root })); return { root, zones: values, summary: () => values.reduce((a, b) => ({ calls: a.calls + b.summary().calls, triangles: a.triangles + b.summary().triangles, seats: 0, low: b.summary().low }), { calls: 0, triangles: 0, seats: 0, low: options.low }), dispose() { values.forEach(item => item.dispose()) } }
}
