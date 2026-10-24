import { createSampleBatch } from './batch.js'

const overlaps = (a, b, gap = 0) => a.x1 + gap > b.x0 && a.x0 - gap < b.x1 && a.z1 + gap > b.z0 && a.z0 - gap < b.z1
const rect = b => ['x0', 'x1', 'z0', 'z1'].every(k => Number.isFinite(b?.[k])) && b.x1 > b.x0 && b.z1 > b.z0

// 只生成陈设占地，不注册工位、热点或碰撞；空间不足时跳过并报告，不挤占通道。
export function planOpenFurnishing({ area, workstations, corridors }) {
  if (!rect(area) || !Array.isArray(workstations) || !Array.isArray(corridors) || !corridors.length ||
    workstations.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.radius) || p.radius < .6) ||
    corridors.some(b => !rect(b) || Math.min(b.x1 - b.x0, b.z1 - b.z0) < 1.2 - 1e-9)) throw new TypeError('Invalid open area, workstation clearance or 1.2m corridor')
  const placements = [], skipped = []
  const specs = [['table', 2, 3.2, 1.2, .83], ['cabinet', 3, 1.6, .5, .78], ['plant', 4, 1, 1, 1.15], ['partition', 3, 1.6, .22, 1.15]]
  for (const [kind, count, w, d, height] of specs) for (let n = 0; n < count; n++) {
    let placed = false
    for (let z = area.z0 + .3 + d / 2; !placed && z <= area.z1 - .3 - d / 2; z += .5) {
      for (let x = area.x0 + .3 + w / 2; x <= area.x1 - .3 - w / 2; x += .5) {
        const bounds = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: 0, y1: height }
        if (corridors.some(c => overlaps(bounds, c)) || placements.some(p => overlaps(bounds, p.bounds, 1.2)) || workstations.some(p => {
          const dx = Math.max(bounds.x0 - p.x, 0, p.x - bounds.x1), dz = Math.max(bounds.z0 - p.z, 0, p.z - bounds.z1)
          return Math.hypot(dx, dz) < p.radius + .6
        })) continue
        placements.push({ id: `open-${kind}-${n + 1}`, kind, x, z, w, d, height, bounds }); placed = true; break
      }
    }
    if (!placed) skipped.push(`open-${kind}-${n + 1}`)
  }
  return { placements, skipped, corridors: corridors.map(c => ({ ...c })) }
}

export function buildOpenFurnishing({ THREE, root, area, workstations, corridors, low = false, assets }) {
  const plan = planOpenFurnishing({ area, workstations, corridors }), batch = createSampleBatch(THREE, assets)
  let measured
  const put = (g, color, position, roughness = .75, grain = '') => {
    g.computeBoundingBox(); measured.union(g.boundingBox.clone().translate(new THREE.Vector3(...position)))
    batch.add(g, color, position, 0, roughness, 0, grain)
  }
  const box = (w, h, d, color, x, y, z, grain = '') => put(new THREE.BoxGeometry(w, h, d), color, [x, y, z], .75, grain)
  for (const p of plan.placements) {
    measured = new THREE.Box3()
    const firstVertex = batch.triangles() * 3
    const { x, z, w, d } = p
    if (p.kind === 'table') {
      box(w, .07, d, '#C9A57A', x, .745, z, 'wood')
      for (const side of [-1, 1]) box(.1, .71, .94, '#B89B64', x + side * 1.3, .355, z)
      box(2.6, .09, .08, '#B89B64', x, .6, z)
      if (!low) { box(.34, .025, .22, '#B7C2B4', x - .6, .795, z, 'fabric'); box(.32, .02, .22, '#F4F1EA', x - .6, .8175, z) }
    } else if (p.kind === 'cabinet') {
      box(w, .68, d - .03, '#F4F1EA', x, .4, z, 'wood')
      box(w, .04, d, '#C9A57A', x, .76, z, 'wood')
      box(w - .16, .06, d - .12, '#756857', x, .03, z)
      for (const dx of [-.4, .4]) box(low ? .025 : .035, .2, .015, '#B89B64', x + dx, .46, z + d / 2 - .0075)
    } else if (p.kind === 'partition') {
      box(w, 1.05, .08, '#B7C2B4', x, .625, z, 'fabric')
      for (const dx of [-.65, .65]) { box(.045, 1.15, .045, '#B89B64', x + dx, .575, z); box(.12, .025, d, '#756857', x + dx, .0125, z) }
    } else {
      box(.86, .38, .86, '#D9D3C6', x, .19, z, 'stone')
      box(.76, .025, .76, '#554B3E', x, .395, z)
      for (let i = 0; i < (low ? 6 : 12); i++) {
        const a = i * 2.399, h = .55 + (i % 4) * .13
        put(new THREE.CylinderGeometry(.008, .012, h - .4, low ? 3 : 5), '#526448', [x, (.4 + h) / 2, z])
        const g = new THREE.BufferGeometry(), points = [0,0,0, .12,.12,.18, 0,.2,.4, -.12,.12,.18], indices = [0,1,2,0,2,3,2,1,0,3,2,0]
        g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.setIndex(indices); g.computeVertexNormals(); g.rotateY(a)
        put(g, i % 4 ? '#4D6A46' : '#708650', [x, h, z], .76)
      }
    }
    p.bounds = { x0: measured.min.x, x1: measured.max.x, z0: measured.min.z, z1: measured.max.z, y0: measured.min.y, y1: measured.max.y }
    p.vertices = { start: firstVertex, count: batch.triangles() * 3 - firstVertex }
  }
  const built = batch.build(root, 'open-furnishing-static')
  // 包围盒覆盖全部细节；宿主以后注册这些盒，本卡没有 collision.add。
  return { root: built.mesh, placements: plan.placements, skipped: plan.skipped, corridors: plan.corridors,
    colliders: plan.placements.map(p => ({ id: p.id, ...p.bounds })),
    summary: () => ({ calls: plan.placements.length ? 1 : 0, triangles: built.triangles(), components: plan.placements.length, low }), dispose: built.dispose }
}
