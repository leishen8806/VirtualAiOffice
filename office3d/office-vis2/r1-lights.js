import { r1WallPlan, r1CornerSpec, r1Glazing } from './r1-shell.js'
import { r1ToWorld } from '../office-r1-layout.js'

// Positions and fixture sizes are world metres; no lighting object enters the collision registry.
export function r1LightingPlan(layout) {
  const fixtures = [], lights = [], accents = []
  const box = (id, zone, kind, position, size, glow = false, yaw = 0) => fixtures.push({ id, zone, kind, position, size, glow, yaw })
  const point = (id, zone, position, intensity, distance) => lights.push({ id, zone, position, intensity, distance })
  for (const zone of layout.regions.filter(z => z.id !== '14')) {
    const x = (zone.x0 + zone.x1) / 2, z = (zone.z0 + zone.z1) / 2
    const offsets = ['04', '06', '07', '08'].includes(zone.id) ? [-1, 1] : [0]
    for (const [i, offset] of offsets.entries()) {
      const px = x + offset * (zone.x1 - zone.x0) / 4, id = `zone-${zone.id}-${i + 1}`
      point(id, zone.id, [px, 3.45, z], 90, 19)
    }
  }
  const strip = (id, a, b, y) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    box(id, '00', 'glass-strip', [(a.x + b.x) / 2, y, (a.z + b.z) / 2], [length, .025, .035], true, -Math.atan2(b.z - a.z, b.x - a.x))
  }
  // Follow the actual glass-wall segments, including the two rounded corners, below their solid bands.
  for (const wall of r1WallPlan(layout).straight) {
    if (['00-W-035', '00-W-036', '00-W-037'].includes(wall.id) || wall.height < 2.7) continue
    const [a, b] = wall.points.map(p => r1ToWorld(...p))
    strip(`${wall.id}-strip`, a, b, wall.height - (wall.exterior ? r1Glazing.exteriorBand : r1Glazing.interiorBand))
  }
  for (const [name, corner] of Object.entries(r1CornerSpec)) {
    const start = Math.atan2(corner.from[1] - corner.center[1], corner.from[0] - corner.center[0])
    let arc = Math.atan2(corner.to[1] - corner.center[1], corner.to[0] - corner.center[0]) - start
    while (arc > Math.PI) arc -= 2 * Math.PI
    while (arc < -Math.PI) arc += 2 * Math.PI
    const points = Array.from({ length: 13 }, (_, i) => r1ToWorld(corner.center[0] + 1.5 * Math.cos(start + arc * i / 12), corner.center[1] + 1.5 * Math.sin(start + arc * i / 12)))
    for (let i = 1; i < points.length; i++) strip(`${name}-strip-${i}`, points[i - 1], points[i], 2.7 - r1Glazing.interiorBand)
  }
  for (const light of lights) accents.push({ id: `${light.id}-wash`, zone: light.zone, kind: 'floor-wash', position: [light.position[0], .016, light.position[2]], size: [7, .001, 7], yaw: 0, glow: true })
  const center = r1ToWorld(...layout.r1.data.central.center_m), radius = layout.r1.data.central.radii_m.bar_outer
  const bar = layout.r1.elements.find(row => row.id === '07-BAR-001'), halfEntry = layout.r1.controls.barEntryClearMm / 2000
  for (const [name, y] of [['counter', bar.heightM - .025], ['foot', .04]]) for (let i = 0; i < 192; i++) {
    const a = i * Math.PI / 96, b = (i + 1) * Math.PI / 96, mid = (a + b) / 2
    // Retain the real bar entrance, including its carrying clearance.
    if (Math.sin(mid) < 0 && Math.min(Math.abs(Math.cos(a) * radius), Math.abs(Math.cos(b) * radius)) < halfEntry + .025) continue
    accents.push({ id: `bar-${name}-${i}`, zone: '07', kind: 'bar-strip', position: [center.x + Math.cos(mid) * (radius - .01), y, center.z + Math.sin(mid) * (radius - .01)], size: [radius * Math.PI / 96 * 1.02, .022, .025], yaw: -mid - Math.PI / 2, glow: true })
  }
  const plaza = r1ToWorld(...layout.r1.data.plaza.center_m)
  for (let i = 0; i < 8; i++) {
    const angle = (i + .5) * Math.PI / 4, x = plaza.x + 8.7 * Math.cos(angle), z = plaza.z + 8.7 * Math.sin(angle)
    box(`courtyard-${i}-pole`, '14', 'pole', [x, 1.65, z], [.08, 3.3, .08])
    box(`courtyard-${i}-cap`, '14', 'lantern', [x, 3.35, z], [.42, .06, .42])
    box(`courtyard-${i}-head`, '14', 'lantern', [x, 3.24, z], [.28, .16, .28], true)
  }
  for (let i = 0; i < 40; i++) {
    const a = (i + .5) * Math.PI / 20
    box(`ring-${i}`, '14', 'ground', [plaza.x + 7.95 * Math.cos(a), .06, plaza.z + 7.95 * Math.sin(a)], [.12, .08, .12], true)
  }
  for (const item of layout.r1.elements.filter(e => /^14-KS-00[1-4]$/.test(e.id))) {
    const p = r1ToWorld(item.xM, item.yM)
    box(`${item.id}-sign`, '14', 'stall', [p.x, item.heightM + .03, p.z], [item.lengthM * .7, .045, .12], true, item.yawDeg * Math.PI / 180)
  }
  for (const item of layout.r1.elements.filter(e => /^14-(BN|GB)-\d+$/.test(e.id))) {
    const p = r1ToWorld(item.xM, item.yM), x = p.x, z = p.z + item.widthM / 2 + .4
    box(`${item.id}-path-base`, '14', 'path', [x, .13, z], [.18, .26, .18])
    box(`${item.id}-path-head`, '14', 'ground', [x, .27, z], [.2, .04, .2], true)
  }
  for (const x of [-2.1, 6.1]) {
    // The outer side faces leave the front-facing couplets and the sliding-door parking bay clear.
    box(`gate-${x}-case`, '14', 'gate', [x, 2.8, 18.22], [.14, .34, .20])
    box(`gate-${x}-lamp`, '14', 'gate', [x, 2.8, 18.33], [.12, .27, .025], true)
  }
  for (const [i, position] of [[2, 4.2, 27.5], [-12, 3.5, 25], [16, 3.5, 25], [2, 4.2, 19.5]].entries()) point(`plaza-${i + 1}`, '14', position, 160, 26)
  return { fixtures, lights, accents }
}

export function buildR1Lights({ THREE, root, layout, env }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const plan = r1LightingPlan(layout), group = new THREE.Group(), geometry = new THREE.BoxGeometry(1, 1, 1)
  const pixels = new Uint8Array(128 * 128 * 4)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const radius = Math.hypot((x - 63.5) / 63.5, (y - 63.5) / 63.5), k = (y * 128 + x) * 4
    pixels.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - radius) ** 2)], k)
  }
  const halo = new THREE.DataTexture(pixels, 128, 128); halo.magFilter = halo.minFilter = THREE.LinearFilter; halo.needsUpdate = true
  group.name = 'r1-lights'; group.userData.dynamic = true
  const zones = ['interior', 'plaza'].map(name => {
    const mount = new THREE.Group(); mount.name = name; group.add(mount)
    const fixtures = [...plan.fixtures, ...plan.accents].filter(row => (row.zone === '14') === (name === 'plaza'))
    const materials = [new THREE.MeshBasicMaterial({ color: '#6C5943' }), new THREE.MeshBasicMaterial({ color: '#FFDAB0', toneMapped: false })]
    if (name === 'interior') { materials[1].map = halo; materials[1].transparent = true; materials[1].depthWrite = false; materials[1].opacity = .75 }
    for (const [index, material] of materials.entries()) {
      const rows = fixtures.filter(row => row.glow === Boolean(index))
      if (!rows.length) continue
      const mesh = new THREE.InstancedMesh(geometry, material, rows.length)
      mesh.name = `${name}-${index ? 'glow' : 'housing'}`; mesh.userData.fixtureIds = rows.map(row => row.id)
      rows.forEach((row, i) => mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(...row.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), row.yaw), new THREE.Vector3(...row.size))))
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mount.add(mesh)
    }
    const lights = plan.lights.filter(row => (row.zone === '14') === (name === 'plaza')).map(row => {
      const light = new THREE.PointLight('#FFDDB5', 0, row.distance, 2)
      light.name = row.id; light.position.set(...row.position); light.castShadow = false; light.userData.r1Light = row
      mount.add(light); return light
    })
    return { name, mount, materials, lights }
  })
  root.add(group)
  const onFrame = () => {
    for (const zone of zones) {
      const level = zone.name === 'plaza' ? (env?.night ?? 0) : (env?.indoorLevel ?? 0)
      zone.mount.visible = level > 1e-6
      zone.materials[1].color.set('#FFDAB0').multiplyScalar(level)
      // R1 owns its capped lighting budget at both quality tiers; legacy quality selection is untouched.
      for (const light of zone.lights) { light.visible = true; light.intensity = light.userData.r1Light.intensity * level }
    }
  }
  onFrame()
  return { root: group, plan, onFrame, dispose() { group.removeFromParent(); halo.dispose(); geometry.dispose(); zones.forEach(zone => zone.materials.forEach(material => material.dispose())) } }
}
