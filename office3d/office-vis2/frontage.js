import { createSampleBatch } from './batch.js'

export function buildOfficeVis2Frontage({ THREE, root, layout, assets, canvasTex }) {
  const f = layout.foyer, group = new THREE.Group(); group.name = 'office-vis2-frontage'; root.add(group)
  const mid = (f.x0 + f.x1) / 2, batch = createSampleBatch(THREE, assets)
  const box = (x, y, z, w, h, d, tint, roughness = .4, metal = .55) => batch.add(new THREE.BoxGeometry(w, h, d), tint, [x, y, z], 0, roughness, metal)
  const floor = new THREE.PlaneGeometry(24, 30); floor.rotateX(-Math.PI / 2)
  batch.add(floor, '#F4F1EA', [layout.island.center.x, -.02, -2], 0, .78, 0, 'stone')
  for (const x of [f.x0, mid - 2, mid + 2, f.x1]) box(x, 1.4, f.z1, .055, 2.8, .065, '#B89B64')
  box(mid, 2.8, f.z1, f.x1 - f.x0, .055, .065, '#B89B64')
  for (const x of [f.x0, f.x1]) { box(x, 2.8, (f.z0 + f.z1) / 2, .055, .055, f.z1 - f.z0, '#B89B64'); box(x, 1.4, f.z0, .055, 2.8, .055, '#B89B64') }
  const gatePosts = [mid - 2.2, mid + 2.2].map(x => ({ x0: x - .14, x1: x + .14, z0: f.z1 - .55, z1: f.z1 + .05 }))
  for (const post of gatePosts) box((post.x0 + post.x1) / 2, .5, (post.z0 + post.z1) / 2, .28, 1, .6, '#D9D3C6', .65, 0)
  const fixed = batch.build(group, 'frontage-fine-frames-and-entry-posts')
  const material = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .085, roughness: .1, metalness: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true })
  const geometry = new THREE.PlaneGeometry(1, 1), panels = new THREE.InstancedMesh(geometry, material, 4), helper = new THREE.Object3D()
  const specs = [
    { x: (f.x0 + mid - 2) / 2, z: f.z1, width: mid - 2 - f.x0, yaw: 0 },
    { x: (f.x1 + mid + 2) / 2, z: f.z1, width: f.x1 - mid - 2, yaw: 0 },
    { x: f.x0, z: (f.z0 + f.z1) / 2, width: f.z1 - f.z0, yaw: Math.PI / 2 },
    { x: f.x1, z: (f.z0 + f.z1) / 2, width: f.z1 - f.z0, yaw: Math.PI / 2 },
  ]
  specs.forEach((s, i) => { helper.position.set(s.x, 1.4, s.z); helper.rotation.y = s.yaw; helper.scale.set(s.width, 2.75, 1); helper.updateMatrix(); panels.setMatrixAt(i, helper.matrix) })
  panels.instanceMatrix.needsUpdate = true; panels.renderOrder = 2; panels.name = 'vis2-neutral-transparent-glass'; group.add(panels)
  let label, texture, labelMaterial, disposed = false
  if (canvasTex) {
    texture = canvasTex(1024, 128, (ctx, width, height) => { ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#493f32'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 58px Microsoft YaHei, sans-serif'; ctx.fillText('前厅接待  ·  RECEPTION', width / 2, height / 2) })
    labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }); label = new THREE.Mesh(new THREE.PlaneGeometry(3.7, .46), labelMaterial)
    label.position.set(layout.frontDesk.center.x, 1.88, layout.frontDesk.z0 - .24); group.add(label)
  }
  return { root: group, mapping: { glass: specs, gatePosts, entrance: { x: mid, z: f.z1, width: 4 } }, summary: () => ({ calls: label ? 3 : 2, triangles: fixed.triangles() + 8 + (label ? 2 : 0) }), dispose() { if (disposed) return; disposed = true; fixed.dispose(); geometry.dispose(); material.dispose(); panels.dispose(); label?.geometry.dispose(); labelMaterial?.dispose(); texture?.dispose(); group.removeFromParent() } }
}
