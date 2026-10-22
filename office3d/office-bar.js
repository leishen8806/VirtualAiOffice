import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'
import { LOUNGE_SIT, barArcs, barColliders, barLounges, barSeats, barSpec, validateBarGeometry } from './office-bar-geometry.js'

const finitePeriod = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback

export function buildOfficeBar({ THREE, root, layout, materials, collision, canvasTex, low = false, materialOverrides = {}, uvScale = {} }) {
  if (!validateBarGeometry(layout).ok) throw new Error('Invalid office bar geometry')
  const spec = barSpec(layout), group = new THREE.Group()
  group.name = 'office2-bar'
  const scales = {
    top: finitePeriod(uvScale.top, 1.2),
    face: finitePeriod(uvScale.face, 1.2),
    sofa: finitePeriod(uvScale.sofa, .6),
  }
  const ownedMaterials = [], proxies = []
  const white = new THREE.Color(THEME.nameplate), wood = new THREE.Color(THEME.trim).lerp(white, .58)
  const metal = new THREE.Color(THEME.trim), leaf = new THREE.Color(THEME.glass).offsetHSL(.05, .32, -.28)
  const opaque = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: THEME.wallRoughness })
  const glass = new THREE.MeshStandardMaterial({ color: THEME.glass, transparent: true, opacity: THEME.glassOpacity * .45, roughness: THEME.glassRoughness, depthWrite: false })
  const glow = new THREE.MeshBasicMaterial({ color: THEME.nameplate })
  ownedMaterials.push(opaque, glass, glow)
  const batches = [
    { material: opaque, name: 'office2-bar-solid', parts: [] },
    { material: glass, name: 'office2-bar-glass', parts: [] },
    { material: glow, name: 'office2-bar-light-strip', parts: [] },
  ]
  const override = {
    top: materialOverrides.top || opaque,
    face: materialOverrides.face || opaque,
    seat: materialOverrides.seat || opaque,
    sofa: materialOverrides.sofa || opaque,
  }
  function target(material, slot = 'solid') {
    let batch = batches.find(item => item.material === material)
    if (!batch) {
      batch = { material, name: `office2-bar-${slot}`, parts: [] }
      batches.push(batch)
    }
    return batch.parts
  }
  function worldUvs(geometry, mode) {
    const positions = geometry.attributes.position, normals = geometry.attributes.normal
    const values = new Float32Array(positions.count * 2)
    let anchor = 0
    if (mode === 'top' || mode === 'face') {
      let sx = 0, sz = 0
      for (let i = 0; i < positions.count; i++) {
        sx += positions.getX(i) - spec.center.x
        sz += positions.getZ(i) - spec.center.z
      }
      anchor = Math.atan2(sz, sx)
    }
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
      if (mode === 'top' || mode === 'face') {
        const dx = x - spec.center.x, dz = z - spec.center.z, radius = Math.hypot(dx, dz)
        let angle = Math.atan2(dz, dx)
        while (angle - anchor > Math.PI) angle -= Math.PI * 2
        while (angle - anchor < -Math.PI) angle += Math.PI * 2
        values[i * 2] = angle * radius / scales[mode]
        values[i * 2 + 1] = (mode === 'top' ? radius : y) / scales[mode]
      } else if (mode === 'sofa') {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i))
        if (ny >= nx && ny >= nz) {
          values[i * 2] = x / scales.sofa; values[i * 2 + 1] = z / scales.sofa
        } else if (nx >= nz) {
          values[i * 2] = z / scales.sofa; values[i * 2 + 1] = y / scales.sofa
        } else {
          values[i * 2] = x / scales.sofa; values[i * 2 + 1] = y / scales.sofa
        }
      } else {
        values[i * 2] = x / 1.2; values[i * 2 + 1] = z / 1.2
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(values, 2))
  }
  function bake(geometry, x, y, z, color, material = opaque, yaw = 0, uvMode = 'world', slot = 'solid') {
    const value = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    geometry.dispose()
    value.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw))
    value.translate(x, y, z)
    const count = value.attributes.position.count, colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
    value.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    worldUvs(value, uvMode)
    target(material, slot).push(value)
  }
  function box(x, y, z, w, h, d, color, material = opaque, yaw = 0, uvMode = 'world', slot = 'solid') {
    bake(new THREE.BoxGeometry(w, h, d), x, y, z, color, material, yaw, uvMode, slot)
  }
  function ring(r0, r1, y, color, material = opaque, arcs = [{ start: 0, end: Math.PI * 2 }], uvMode = 'world', slot = 'solid') {
    for (const arc of arcs) {
      const shape = new THREE.Shape()
      const n = low ? 16 : 40
      for (let i = 0; i <= n; i++) { const a = arc.start + (arc.end - arc.start) * i / n; const x = Math.cos(a) * r1, z = Math.sin(a) * r1; if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z) }
      for (let i = n; i >= 0; i--) { const a = arc.start + (arc.end - arc.start) * i / n; shape.lineTo(Math.cos(a) * r0, -Math.sin(a) * r0) }
      shape.closePath()
      const geometry = new THREE.ShapeGeometry(shape)
      geometry.rotateX(-Math.PI / 2)
      bake(geometry, spec.center.x, y, spec.center.z, color, material, 0, uvMode, slot)
    }
  }
  function solidArc(r0, r1, y, h, color, faceMaterial = opaque, topMaterial = opaque, faceSlot = 'solid', topSlot = 'solid') {
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
      bake(geometry, spec.center.x, 0, spec.center.z, color, faceMaterial, 0, 'face', faceSlot)
    }
    ring(r0, r1, y + h, color, topMaterial, barArcs(layout), 'top', topSlot)
  }
  ring(0, 8, .008, new THREE.Color(THEME.exteriorWall))
  for (const [r0, r1] of [[3.55, 3.62], [4.65, 4.7], [5.98, 6.03], [7.94, 8]]) ring(r0, r1, .015, wood)
  solidArc(spec.innerRadius, 3.25, .08, .87, wood, override.face, opaque, 'face')
  solidArc(spec.innerRadius, spec.radius, .95, .11, white, override.face, override.top, 'face', 'top')
  ring(3.2, 3.27, .93, white, low ? opaque : glow, barArcs(layout))
  if (!low) solidArc(2.15, 2.19, 1.07, .28, metal)
  const seats = barSeats(layout, low), lounges = barLounges(layout)
  for (const seat of seats) {
    bake(new THREE.CylinderGeometry(.29, .29, .12, low ? 8 : 16), seat.x, .8, seat.z, wood, override.seat, 0, 'world', 'seat')
    bake(new THREE.CylinderGeometry(.055, .055, .7, 8), seat.x, .39, seat.z, metal)
    bake(new THREE.CylinderGeometry(.24, .24, .045, 12), seat.x, .03, seat.z, metal)
  }
  for (const seat of lounges) {
    const cushionHeight = .12, backDepth = .13, backHeight = .48
    box(seat.x, LOUNGE_SIT.seatTop - cushionHeight / 2, seat.z, 1.35, cushionHeight, LOUNGE_SIT.seatDepth,
      white, override.sofa, seat.yaw, 'sofa', 'sofa')
    const backDistance = LOUNGE_SIT.seatDepth / 2 - backDepth / 2
    const backX = seat.x + Math.cos(seat.angle) * backDistance, backZ = seat.z + Math.sin(seat.angle) * backDistance
    box(backX, LOUNGE_SIT.seatTop + backHeight / 2, backZ, 1.35, backHeight, backDepth,
      white, override.sofa, seat.yaw, 'sofa', 'sofa')
    const baseDepth = LOUNGE_SIT.seatDepth - LOUNGE_SIT.legRoom
    const baseDistance = LOUNGE_SIT.seatDepth / 2 - baseDepth / 2
    const baseX = seat.x + Math.cos(seat.angle) * baseDistance, baseZ = seat.z + Math.sin(seat.angle) * baseDistance
    box(baseX, (LOUNGE_SIT.seatTop - cushionHeight) / 2, baseZ, 1.05, LOUNGE_SIT.seatTop - cushionHeight,
      baseDepth, wood, opaque, seat.yaw)
  }
  bake(new THREE.CylinderGeometry(.66, .5, .6, 16), spec.center.x, .3, spec.center.z, white)
  bake(new THREE.CylinderGeometry(.055, .11, 1.5, 8), spec.center.x, 1.1, spec.center.z, wood)
  for (let i = 0; i < (low ? 3 : 9); i++) {
    const a = i * 2.4, r = low ? .42 : .5
    bake(new THREE.SphereGeometry(.3, low ? 6 : 10, low ? 4 : 6), spec.center.x + Math.cos(a) * r, 1.55 + (i % 3) * .22, spec.center.z + Math.sin(a) * r, leaf)
  }
  box(spec.center.x, 1.23, spec.center.z + 2.65, .42, .34, .38, metal)
  for (const dx of [-.65, .65]) bake(new THREE.CylinderGeometry(.075, .055, .13, 8), spec.center.x + dx, 1.135, spec.center.z + 2.65, white)
  if (!low) solidArc(2.7, 2.72, 1.08, .27, new THREE.Color(THEME.glass), glass, glass)
  batches.forEach(({ parts: list, material, name }) => {
    if (!list.length) return
    const merged = new THREE.BufferGeometry()
    for (const key of ['position', 'normal', 'color', 'uv']) {
      const count = list.reduce((sum, g) => sum + g.attributes[key].array.length, 0), array = new Float32Array(count)
      let offset = 0
      for (const g of list) { array.set(g.attributes[key].array, offset); offset += g.attributes[key].array.length }
      merged.setAttribute(key, new THREE.BufferAttribute(array, key === 'uv' ? 2 : 3))
    }
    list.forEach(g => g.dispose())
    const mesh = new THREE.Mesh(merged, material)
    mesh.name = name
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
  group.userData.bar = { seats, lounges, loungeSit: LOUNGE_SIT, colliders: barColliders(layout), plantCollision: false }
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
