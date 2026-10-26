import { addPlan1Equipment } from './plan1-furniture.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { createSampleBatch } from './batch.js'
import { officePlan1Reception } from '../office-plan1-layout.js'

export function receptionBackdrop(front, layout) {
  const wall = layout && officePlan1Reception(layout)?.wall
  if (wall) return { ...wall, top:wall.height, grille:{height:wall.height,depth:0,faceZ:wall.z1} }
  return { x0: front.x0 + .35, x1: front.x1 - .35, z0: front.z0 - .45, z1: front.z0 - .29, top: 2.35,
    grille: { height: 2.3, depth: .045, faceZ: front.z0 - .29 + .04 + .045 / 2 } }
}

export function buildOfficeFoyerFurniture({ THREE, root, layout = LAYOUT_V3, assets } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeFoyerFurniture requires THREE and root')
  const group = new THREE.Group(); group.name = 'office3-r3-foyer-furniture'
  const front = layout.frontDesk, bar = layout.serviceBar, sofa = layout.waitingArc, batch = createSampleBatch(THREE, assets)
  const box = (w, h, d, tint, x, y, z, rough = .7, metal = 0, grain = '') => batch.add(new THREE.BoxGeometry(w, h, d), tint, [x, y, z], 0, rough, metal, grain)
  let counterVertices = 0
  const counter = (bounds, height, tint, bottom) => {
    const w = bounds.x1 - bounds.x0, d = bounds.z1 - bounds.z0, shape = new THREE.Shape()
    shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.quadraticCurveTo(w / 2, d / 2, 0, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, -d / 2)
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 20 }); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI)
    counterVertices += g.attributes.position.count
    batch.add(g, tint, [bounds.center.x, bottom, bounds.center.z], 0, bottom > 1 ? .4 : .65, tint === '#B89B64' ? .65 : 0, bottom > 1 ? 'stone' : '')
  }
  // 前台保持原边界，以弧面台身、薄台面和香槟金腰线形成接待台轮廓。
  // 腰线与台身按高度拼接，避免两层同形弧面共面闪烁。
  counter(front, .1, '#F4F1EA', .08); counter(front, .035, '#B89B64', .18)
  counter(front, .885, '#F4F1EA', .215); counter(front, .07, '#F4F1EA', 1.1)
  box(2.4, .055, .5, '#C9A57A', front.center.x, .94, front.center.z - .32, .65, 0, 'wood')
  box(.38, .26, .035, '#2F4A5C', front.center.x + 1.3, 1.31, front.center.z - .2, .3)
  box(.035, .18, .035, '#9A968E', front.center.x + 1.3, 1.18, front.center.z - .2, .3, .7)
  box(.18, .02, .16, '#9A968E', front.center.x + 1.3, 1.15, front.center.z - .2, .3, .7)
  box(.29, .012, .1, '#9A968E', front.center.x + 1.3, 1.178, front.center.z - .4, .6)
  box(.055, .018, .08, '#9A968E', front.center.x + 1.53, 1.182, front.center.z - .4, .6)
  box(.36, .018, .25, '#B7C2B4', front.center.x - 1.5, 1.179, front.center.z, .95)
  box(.31, .025, .22, '#F4F1EA', front.center.x - 1.5, 1.2, front.center.z, .9)
  const backdrop = receptionBackdrop(front, layout), grille = backdrop.grille
  if (!layout.walls?.reception) {
  box(backdrop.x1 - backdrop.x0, backdrop.top, .16, '#D9D3C6', front.center.x, backdrop.top / 2, (backdrop.z0 + backdrop.z1) / 2, .75)
  for (let i = 0; i < 14; i++) box(.055, grille.height, grille.depth, '#C9A57A', front.x0 + .5 + i * (front.x1 - front.x0 - 1) / 13, grille.height / 2, grille.faceZ - grille.depth / 2, .65, 0, 'wood')
  }
  const bw = bar.x1 - bar.x0, bd = bar.z1 - bar.z0
  box(bw, .85, bd * .55, '#C9A57A', bar.center.x, .5, bar.center.z, .65, 0, 'wood')
  box(bw + .02, .07, bd * .58, '#F4F1EA', bar.center.x, .96, bar.center.z, .35, 0, 'stone')
  for (const offset of [-bw * .28, 0, bw * .28]) box(.025, .7, .025, '#B89B64', bar.center.x + offset, .5, bar.center.z + bd * .28, .35, .6)
  for (const y of [1.4, 1.95]) box(bw * .92, .06, .27, '#C9A57A', bar.center.x, y, bar.z0 + .18, .65, 0, 'wood')
  for (const y of [1.4, 1.95]) for (const offset of [-.9, -.65, .6, .85]) {
    batch.add(new THREE.CylinderGeometry(.065, .065, .16, 10), '#F4F1EA', [bar.center.x + offset, y + .11, bar.z0 + .18], 0, .4)
  }
  for (const x of [bar.x0 + .12, bar.x1 - .12]) box(.04, 1.15, .04, '#B89B64', x, 1.47, bar.z0 + .18, .35, .6)
  if(layout.plan1Phase === 'L2') addPlan1Equipment(THREE,batch,'southCafe')
  else {
  box(.55, .4, .38, '#26333A', bar.center.x, 1.2, bar.center.z, .35, .6)
  box(.58, .035, .43, '#9A968E', bar.center.x, 1.015, bar.center.z, .3, .7)
  for (const offset of [-.9, -.62, .65, .92]) batch.add(new THREE.CylinderGeometry(.07, .06, .13, 10), '#F4F1EA', [bar.center.x + offset, 1.06, bar.center.z + .22], 0, .35)
  }
  for (const x of [bar.x0 + .5, bar.x1 - .5]) {
    batch.add(new THREE.CylinderGeometry(.42, .42, .06, 24), '#F4F1EA', [x, .73, layout.foyer.z1 - 1.4], 0, .4)
    batch.add(new THREE.CylinderGeometry(.04, .06, .67, 8), '#B89B64', [x, .37, layout.foyer.z1 - 1.4], 0, .35, .7)
    batch.add(new THREE.CylinderGeometry(.2, .24, .04, 16), '#9A968E', [x, .035, layout.foyer.z1 - 1.4], 0, .35, .6)
  }
  const seatCenter = { x: sofa.center.x + (sofa.x1 - sofa.x0) * .14, z: sofa.center.z }
  batch.add(new THREE.CylinderGeometry(.43, .43, .045, 24), '#C9A57A', [seatCenter.x, .46, seatCenter.z], 0, .6, 0, 'wood')
  batch.add(new THREE.CylinderGeometry(.2, .27, .4, 16), '#D9D3C6', [seatCenter.x, .23, seatCenter.z], 0, .8)
  const fixed = batch.build(group, 'foyer-reception-coffee-tables')
  const p = fixed.mesh.geometry.attributes.position, n = fixed.mesh.geometry.attributes.normal, normal = new THREE.Vector3()
  // 合批生成原 UV 后才平滑前四段台身的曲面，保留台面/背面硬边及贴图方向。
  for (let i = 0; i < counterVertices; i++) if (Math.abs(n.getY(i)) < .001 && n.getZ(i) > 0) {
    const x = p.getX(i) - front.center.x, w = front.x1 - front.x0, d = front.z1 - front.z0
    const t = Math.sqrt(Math.max(0, 1 - 2 * Math.abs(x) / w))
    normal.set(Math.sign(x) * 2 * d * (1 - t), 0, w * t).normalize()
    n.setXYZ(i, normal.x, normal.y, normal.z)
  }
  const upholstery = createSampleBatch(THREE, assets)
  const arc = (inner, outer, y, height, tint, rough) => {
    const shape = new THREE.Shape(), a0 = .18 * Math.PI, a1 = .82 * Math.PI
    for (let i = 0; i <= 20; i++) { const a = a0 + (a1 - a0) * i / 20; if (i) shape.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); else shape.moveTo(Math.cos(a) * outer, Math.sin(a) * outer) }
    for (let i = 20; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 20; shape.lineTo(Math.cos(a) * inner, Math.sin(a) * inner) }
    shape.closePath(); const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }); g.rotateX(-Math.PI / 2)
    upholstery.add(g, tint, [0, y, 0], 0, rough, 0, rough > .9 ? 'fabric' : 'wood')
  }
  arc(.83, 1.28, .25, .24, '#687D68', .97); arc(1.15, 1.28, .49, .38, '#687D68', .97); arc(.86, 1.25, .18, .07, '#C9A57A', .65)
  const sofas = upholstery.build(group, 'foyer-instanced-curved-sofas', [{ ...seatCenter, yaw: 0 }, { ...seatCenter, yaw: Math.PI }])
  group.userData.module = 'r3-foyer-furniture'; root.add(group); let disposed = false
  return { root: group, footprints: { front, bar, sofa, backdrop }, summary: () => ({ calls: 2, triangles: fixed.triangles() + sofas.triangles(), counters: 2, sofas: 2, seats: 4 }), dispose() { if (disposed) return; disposed = true; fixed.dispose(); sofas.dispose(); group.removeFromParent() } }
}
export const buildOfficeFoyer = buildOfficeFoyerFurniture
