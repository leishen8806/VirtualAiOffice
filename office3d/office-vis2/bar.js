import { LAYOUT_V3 } from '../office-layout.js'
import { barArcs, barColliders, barLounges, barSeats, barSpec, LOUNGE_SIT } from '../office-bar-geometry.js'
import { buildHeartBanyan } from '../office-heart-banyan.js'
import { createSampleBatch } from './batch.js'

export function buildOfficeTeaBarSample({ THREE, root, layout = LAYOUT_V3, low = false, collision, assets } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeTeaBarSample requires THREE and root')
  const original = barSpec(layout), spec = { center: original.center, barOuter: original.counterRadius ?? original.radius, diameter: layout.island?.diameter || 12 }, center = spec.center, group = new THREE.Group(); group.name = 'office-vis2-bar'
  const batch = createSampleBatch(THREE, assets), detail = low ? 12 : 24, barLayout = { bar: { ...layout.bar, center, radius: spec.barOuter } }
  const ring = (inner, outer, bottom, height, tint, roughness, metalness = 0) => {
    for (const arc of barArcs(barLayout)) {
      const shape = new THREE.Shape()
      for (let i = 0; i <= detail; i++) { const a = arc.start + (arc.end - arc.start) * i / detail; const x = Math.cos(a) * outer, z = Math.sin(a) * outer; if (i) shape.lineTo(x, z); else shape.moveTo(x, z) }
      for (let i = detail; i >= 0; i--) { const a = arc.start + (arc.end - arc.start) * i / detail; shape.lineTo(Math.cos(a) * inner, Math.sin(a) * inner) }
      shape.closePath()
      const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }); g.rotateX(-Math.PI / 2)
      batch.add(g, tint, [center.x, bottom, center.z], 0, roughness, metalness, tint === '#C9A57A' ? 'wood' : 'stone')
    }
  }
  ring(2.1, spec.barOuter, .08, .87, '#C9A57A', .61)
  ring(2.06, spec.barOuter + .045, .95, .1, '#F4F1EA', .32)
  ring(2.11, spec.barOuter + .012, .11, .045, '#B89B64', .33, .7)
  ring(2.11, spec.barOuter + .012, .88, .025, '#B89B64', .33, .7)
  // 台身竖向橡木条与凹入踢脚形成深度，仍在台面投影内，不改变碰撞与座位环。
  for (const arc of layout.variant === 'align' ? barArcs(barLayout) : []) {
    const count = Math.ceil((arc.end - arc.start) * spec.barOuter / .15)
    for (let i = 1; i < count; i++) {
      const a = arc.start + (arc.end - arc.start) * i / count
      batch.add(new THREE.BoxGeometry(.055, .64, .018), i % 4 ? '#A9845C' : '#BFA17A',
        [center.x + Math.cos(a) * (spec.barOuter + .009), .5, center.z + Math.sin(a) * (spec.barOuter + .009)], Math.PI / 2 - a, .72, 0, 'wood')
    }
  }
  // 工作区是可见空腔，树池落地；东西两口沿用既有 1.5 m 通行口与碰撞段。
  const workFloor = new THREE.RingGeometry(1.08, 2.04, detail * 2); workFloor.rotateX(-Math.PI / 2)
  batch.add(workFloor, '#D9D3C6', [center.x, .018, center.z], 0, .9)
  const box = (w, h, d, tint, x, y, z, roughness = .6, metalness = 0) => batch.add(new THREE.BoxGeometry(w, h, d), tint, [x, y, z], 0, roughness, metalness)
  // 静态咖啡机、接水盘与水槽给出设备体量，不触发任何设备操作。
  box(.58, .43, .4, '#26333A', center.x - .8, 1.27, center.z - 2.75, .3, .5)
  box(.62, .04, .47, '#B89B64', center.x - .8, 1.07, center.z - 2.75, .35, .65)
  box(.14, .22, .06, '#758E8B', center.x - .8, 1.3, center.z - 2.52, .4)
  box(.65, .018, .4, '#7C8789', center.x + .75, 1.056, center.z - 2.75, .3, .7)
  box(.49, .02, .27, '#26333A', center.x + .75, 1.07, center.z - 2.75, .4)
  const tap = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .22, 0), new THREE.Vector3(0, .27, .12), new THREE.Vector3(0, .19, .19),
  ]), 8, .018, 6, false)
  batch.add(tap, '#9A968E', [center.x + .75, 1.06, center.z - 2.93], 0, .28, .75)
  // 设备全部落在原有台面内，不在操作通道增加落地柜。
  for (const dx of [-.16, .16]) {
    box(.07, .09, .09, '#9A968E', center.x - .8 + dx, 1.23, center.z - 2.5, .25, .75)
    box(.15, .012, .09, '#26333A', center.x - .8 + dx, 1.2, center.z - 2.42, .4)
  }
  for (let i = 0; i < 3; i++) {
    const x = center.x - 1.55 - i * .19, z = center.z - 2.52
    batch.add(new THREE.CylinderGeometry(.065, .065, .18, 10), '#D9D3C6', [x, 1.145, z], 0, .46)
    batch.add(new THREE.CylinderGeometry(.073, .073, .025, 10), '#C9A57A', [x, 1.2475, z], 0, .65, 0, 'wood')
  }
  // 内移 1 mm 避开高低档折线内壁；合入原批次，不增加 draw call。
  for (const arc of barArcs(barLayout)) for (let i = 1; i < 6; i++) {
    const a = arc.start + (arc.end - arc.start) * i / 6
    batch.add(new THREE.BoxGeometry(.014, .63, .008), '#756857', [center.x + Math.cos(a) * 2.095, .49, center.z + Math.sin(a) * 2.095], Math.PI / 2 - a, .85)
  }
  for (const offset of [-.15, .15]) {
    const cup = new THREE.CylinderGeometry(.075, .06, .15, 10)
    batch.add(cup, '#F4F1EA', [center.x + 1.7 + offset, 1.13, center.z - 2.1], 0, .35)
  }
  const fixed = batch.build(group, 'tea-bar-body-top-equipment')
  const seatPoses = barSeats(layout, low)
  const seats = seatPoses.map(seat => {
    const angle = seat.angle ?? Math.atan2(seat.z - center.z, seat.x - center.x)
    return { ...seat, angle, yaw: seat.yaw ?? -angle - Math.PI / 2, sitOffset: { forward: 0, lift: 0 }, decorative: true }
  })
  const stool = createSampleBatch(THREE, assets)
  stool.add(new THREE.CylinderGeometry(.28, .28, .1, low ? 10 : 16), '#687D68', [0, .82, 0], 0, .95, 0, 'fabric')
  stool.add(new THREE.CylinderGeometry(.04, .055, .72, 8), '#9B8B6D', [0, .42, 0], 0, .35, .7)
  stool.add(new THREE.CylinderGeometry(.23, .25, .04, 12), '#9B8B6D', [0, .06, 0], 0, .35, .7)
  const stoolFoot = new THREE.TorusGeometry(.17, .015, 4, 12); stoolFoot.rotateX(Math.PI / 2)
  stool.add(stoolFoot, '#B89B64', [0, .3, 0], 0, .35, .7)
  const stools = stool.build(group, 'tea-bar-instanced-stools', seats)
  const sofaRadius = original.counterRadius == null ? 5.25 : layout.island?.sofaOuter ?? 5.25
  const lounges = barLounges(layout).map(seat => ({ ...seat, sitOffset: { forward: LOUNGE_SIT.hipForward, lift: LOUNGE_SIT.hipLift } }))
  const sofa = createSampleBatch(THREE, assets)
  const curvedCushion = (z0, z1, y, height) => {
    const shape = new THREE.Shape(), radius = sofaRadius
    for (let i = 0; i <= 12; i++) { const x = -.675 + i * 1.35 / 12, z = radius - Math.sqrt(radius * radius - x * x) + z0; if (i) shape.lineTo(x, -z); else shape.moveTo(x, -z) }
    for (let i = 12; i >= 0; i--) { const x = -.675 + i * 1.35 / 12, z = radius - Math.sqrt(radius * radius - x * x) + z1; shape.lineTo(x, -z) }
    shape.closePath(); const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }); g.rotateX(-Math.PI / 2)
    sofa.add(g, '#687D68', [0, y, 0], 0, .97, 0, 'fabric')
  }
  curvedCushion(-LOUNGE_SIT.seatDepth / 2, LOUNGE_SIT.seatDepth / 2, LOUNGE_SIT.seatTop - .22, .22)
  curvedCushion(.14, .27, .5, .45)
  sofa.add(new THREE.BoxGeometry(1.27, .08, .4), '#C9A57A', [0, .27, 0], 0, .7, 0, 'wood')
  for (const x of [-.62, .62]) sofa.add(new THREE.BoxGeometry(.1, .26, .52), '#C9A57A', [x, .55, 0], 0, .7, 0, 'wood')
  const sofas = sofa.build(group, 'tea-bar-instanced-lounges', lounges)
  const tree = buildHeartBanyan({ THREE, root: group, center, low, leafTriangles: layout.variant === 'align' })
  const bounds = barColliders(layout), proxies = []
  if (collision) for (const b of bounds) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 1.1, b.z1 - b.z0), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.visible = false; proxy.name = b.id; proxy.position.set((b.x0 + b.x1) / 2, .55, (b.z0 + b.z1) / 2); group.add(proxy); proxies.push(proxy); collision.add(proxy, 'officeBar')
  }
  root.add(group); let disposed = false
  group.userData.bar = { seats, lounges, loungeSit: LOUNGE_SIT, colliders: bounds, plantCollision: false }
  return { root: group, seats, lounges, colliders: bounds, treeProfile: { height: 3.8, crownWidth: 4, crownDepth: 2.8, poolDiameter: 2, face: 'south' },
    summary: () => ({ calls: 6, triangles: fixed.triangles() + stools.triangles() + sofas.triangles() + tree.summary().triangles, seats: seats.length, sofas: lounges.length, colliders: proxies.length, low, diameter: spec.diameter, innerRadius: 2.1 }),
    dispose() { if (disposed) return; disposed = true; tree.dispose(); for (const item of [fixed, stools, sofas]) item.dispose(); for (const p of proxies) { collision?.remove?.(p); p.geometry.dispose(); p.material.dispose() } group.removeFromParent() },
  }
}
