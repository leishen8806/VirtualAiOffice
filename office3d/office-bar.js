import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'
import { barArcs, barColliders, barLounges, barSeats, barSpec, validateBarGeometry } from './office-bar-geometry.js'

export function buildOfficeBar({ THREE, root, layout, materials, collision, canvasTex, low = false }) {
  if (!validateBarGeometry(layout).ok) throw new Error('Invalid office bar geometry')
  const spec = barSpec(layout), group = new THREE.Group()
  group.name = 'office2-bar'
  const parts = [[], [], []], ownedMaterials = [], proxies = []
  const white = new THREE.Color(THEME.nameplate), wood = new THREE.Color(THEME.trim).lerp(white, .58)
  const metal = new THREE.Color(THEME.trim), leaf = new THREE.Color(THEME.glass).offsetHSL(.05, .32, -.28)
  const opaque = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: THEME.wallRoughness })
  const glass = new THREE.MeshStandardMaterial({ color: THEME.glass, transparent: true, opacity: THEME.glassOpacity * .45, roughness: THEME.glassRoughness, depthWrite: false })
  const glow = new THREE.MeshBasicMaterial({ color: THEME.nameplate })
  ownedMaterials.push(opaque, glass, glow)
  function bake(geometry, x, y, z, color, batch = 0, yaw = 0) {
    const value = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    geometry.dispose()
    value.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw))
    value.translate(x, y, z)
    const count = value.attributes.position.count, colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
    value.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts[batch].push(value)
  }
  function box(x, y, z, w, h, d, color, batch = 0, yaw = 0) { bake(new THREE.BoxGeometry(w, h, d), x, y, z, color, batch, yaw) }
  function ring(r0, r1, y, color, batch = 0, arcs = [{ start: 0, end: Math.PI * 2 }]) {
    for (const arc of arcs) {
      const shape = new THREE.Shape()
      const n = low ? 16 : 40
      for (let i = 0; i <= n; i++) { const a = arc.start + (arc.end - arc.start) * i / n; const x = Math.cos(a) * r1, z = Math.sin(a) * r1; if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z) }
      for (let i = n; i >= 0; i--) { const a = arc.start + (arc.end - arc.start) * i / n; shape.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0) }
      shape.closePath()
      const geometry = new THREE.ShapeGeometry(shape)
      geometry.rotateX(-Math.PI / 2)
      bake(geometry, spec.center.x, y, spec.center.z, color, batch)
    }
  }
  function solidArc(r0, r1, y, h, color, batch = 0) {
    for (const arc of barArcs(layout)) {
      const n = low ? 12 : 30, positions = []
      for (let i = 0; i < n; i++) {
        const a = arc.start + (arc.end - arc.start) * i / n, b = arc.start + (arc.end - arc.start) * (i + 1) / n
        const p = (r, angle, height) => [Math.cos(angle) * r, height, Math.sin(angle) * r]
        for (const r of [r0, r1]) {
          const v = [p(r, a, y), p(r, b, y), p(r, b, y + h), p(r, a, y + h)]
          const order = r === r0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]
          for (const j of order) positions.push(...v[j])
        }
      }
      for (const a of [arc.start, arc.end]) {
        const p = (r, height) => [Math.cos(a) * r, height, Math.sin(a) * r]
        const v = [p(r0, y), p(r1, y), p(r1, y + h), p(r0, y + h)]
        for (const j of (a === arc.start ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2])) positions.push(...v[j])
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals()
      bake(geometry, spec.center.x, 0, spec.center.z, color, batch)
    }
    ring(r0, r1, y + h, color, batch, barArcs(layout))
  }
  ring(0, 8, .008, new THREE.Color(THEME.exteriorWall))
  for (const [r0, r1] of [[3.55, 3.62], [4.65, 4.7], [5.98, 6.03], [7.94, 8]]) ring(r0, r1, .015, wood)
  solidArc(spec.innerRadius, 3.25, .08, .87, wood)
  solidArc(spec.innerRadius, spec.radius, .95, .11, white)
  ring(3.2, 3.27, .93, white, low ? 0 : 2, barArcs(layout))
  if (!low) solidArc(2.15, 2.19, 1.07, .28, metal)
  const seats = barSeats(layout, low), lounges = barLounges(layout)
  for (const seat of seats) {
    bake(new THREE.CylinderGeometry(.29, .29, .12, low ? 8 : 16), seat.x, .8, seat.z, wood)
    bake(new THREE.CylinderGeometry(.055, .055, .7, 8), seat.x, .39, seat.z, metal)
    bake(new THREE.CylinderGeometry(.24, .24, .045, 12), seat.x, .03, seat.z, metal)
  }
  for (const seat of lounges) {
    box(seat.x, .36, seat.z, 1.35, .52, .8, white, 0, seat.yaw)
    const backX = seat.x + Math.cos(seat.angle) * .43, backZ = seat.z + Math.sin(seat.angle) * .43
    box(backX, .76, backZ, 1.35, .48, .13, white, 0, seat.yaw)
    box(seat.x, .08, seat.z, 1.25, .12, .74, wood, 0, seat.yaw)
  }
  bake(new THREE.CylinderGeometry(.66, .5, .6, 16), spec.center.x, .3, spec.center.z, white)
  bake(new THREE.CylinderGeometry(.055, .11, 1.5, 8), spec.center.x, 1.1, spec.center.z, wood)
  for (let i = 0; i < (low ? 3 : 9); i++) {
    const a = i * 2.4, r = low ? .42 : .5
    bake(new THREE.SphereGeometry(.3, low ? 6 : 10, low ? 4 : 6), spec.center.x + Math.cos(a) * r, 1.55 + (i % 3) * .22, spec.center.z + Math.sin(a) * r, leaf)
  }
  box(spec.center.x, 1.23, spec.center.z + 2.65, .42, .34, .38, metal)
  for (const dx of [-.65, .65]) bake(new THREE.CylinderGeometry(.075, .055, .13, 8), spec.center.x + dx, 1.135, spec.center.z + 2.65, white)
  if (!low) solidArc(2.7, 2.72, 1.08, .27, new THREE.Color(THEME.glass), 1)
  parts.forEach((list, batch) => {
    if (!list.length) return
    const merged = new THREE.BufferGeometry()
    for (const key of ['position', 'normal', 'color']) {
      const count = list.reduce((sum, g) => sum + g.attributes[key].array.length, 0), array = new Float32Array(count)
      let offset = 0
      for (const g of list) { array.set(g.attributes[key].array, offset); offset += g.attributes[key].array.length }
      merged.setAttribute(key, new THREE.BufferAttribute(array, 3))
    }
    list.forEach(g => g.dispose())
    const mesh = new THREE.Mesh(merged, ownedMaterials[batch])
    mesh.name = `office2-bar-${['solid', 'glass', 'light-strip'][batch]}`
    mesh.castShadow = false; mesh.receiveShadow = false
    group.add(mesh)
  })
  root.add(group)
  for (const bounds of barColliders(layout)) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(bounds.x1 - bounds.x0, 1.1, bounds.z1 - bounds.z0), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = bounds.id; proxy.visible = false
    proxy.position.set((bounds.x0 + bounds.x1) / 2, .55, (bounds.z0 + bounds.z1) / 2); group.add(proxy)
    collision?.add(proxy, 'officeBar'); proxies.push(proxy)
  }
  group.userData.bar = { seats, lounges, colliders: barColliders(layout), plantCollision: false }
  let disposed = false
  return { root: group, seats, lounges, summary: () => ({
    calls: group.children.filter(m => m.isMesh && m.visible).length,
    triangles: group.children.filter(m => m.visible && m.isMesh).reduce((sum, m) => sum + m.geometry.attributes.position.count / 3, 0),
    seats: seats.length, sofas: lounges.length, colliders: proxies.length, low,
  }), dispose() {
    if (disposed) return
    disposed = true
    group.traverse(m => { if (m.isMesh) { m.geometry.dispose(); if (proxies.includes(m)) m.material.dispose() } })
    ownedMaterials.forEach(m => m.dispose())
    for (const proxy of proxies) collision?.remove?.(proxy)
    group.removeFromParent()
  } }
}
