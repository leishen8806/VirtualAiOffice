import { createSampleBatch } from './batch.js'
import { officeLeafGeometry } from './plants.js'

const overlaps = (a, b, gap = 0) => a.x1 + gap > b.x0 && a.x0 - gap < b.x1 && a.z1 + gap > b.z0 && a.z0 - gap < b.z1
const rect = b => ['x0', 'x1', 'z0', 'z1'].every(k => Number.isFinite(b?.[k])) && b.x1 > b.x0 && b.z1 > b.z0

// 只生成陈设占地，不注册工位、热点或碰撞；空间不足时跳过并报告，不挤占通道。
export function planOpenFurnishing({ area, workstations, corridors, reserved = [], ring, zoneKind }) {
  if (!rect(area) || !Array.isArray(workstations) || !Array.isArray(corridors) || !corridors.length ||
    workstations.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.radius) || p.radius < .6) ||
    corridors.some(b => !rect(b) || Math.min(b.x1 - b.x0, b.z1 - b.z0) < 1.2 - 1e-9)) throw new TypeError('Invalid open area, workstation clearance or 1.2m corridor')
  const placements = [], skipped = [], groups = []
  let templates = [
    { id: 'shared-table', template: 'shared-table-island', count: 2, members: [
      ['table', 0, .225, 3.2, 1.2, .83], ['partition', 0, -.64, 1.6, .22, 1.15],
      ['cabinet', -1.95, .225, .5, 1.2, .78], ['cabinet', 1.95, .225, .5, 1.2, .78],
    ] },
    { id: 'green-edge', template: 'plant-edge', count: 4, members: [['plant', 0, 0, 1, 1, 1.5]] },
  ]
  if (zoneKind) {
    const nook = zoneKind === 'north-nook', reach = nook ? .9 : 1.1
    const seats = zoneKind === 'leisure'
      ? [['bench', -1, 0, .8, 1.8, .9], ['bench', 1, 0, .8, 1.8, .9], ['round-table', 0, 0, .7, .7, .55]]
      : [['round-table', 0, 0, nook ? 1 : 1.2, nook ? 1 : 1.2, .8], ...[[-reach,0],[reach,0],[0,-reach],[0,reach]].map(([x,z]) => ['chair',x,z,.6,.6,.9])]
    templates = [{ id: zoneKind, template: `${zoneKind}-seating`, count: nook ? 2 : 1, members: seats }, ...(nook ? [] : [templates[1]])]
  }
  for (const t of templates) for (let n = 0; n < t.count; n++) {
    const id = `${t.id}-${n + 1}`, candidates = []
    if (t.template === 'plant-edge') {
      for (const z of [area.z0 + .8, area.z1 - .8]) for (const x of [area.x0 + .8, area.x1 - .8]) candidates.push([x, z])
      for (const c of corridors) for (const z of [c.z0 - .8, c.z1 + .8]) for (const x of [c.x0 - .8, c.x1 + .8]) candidates.push([x, z])
    } else {
      const step = zoneKind === 'north-nook' ? .1 : .25
      for (let z = area.z0; z <= area.z1; z += step) for (let x = area.x0; x <= area.x1; x += step) candidates.push([x, z])
    }
    let placed = false
    for (const [cx, cz] of candidates) {
      const members = t.members.map(([kind, dx, dz, w, d, height], i) => {
        const x = cx + dx, z = cz + dz
        return { id: `${id}-${kind}-${i + 1}`, groupId: id, kind, x, z, w, d, height,
          ...(['chair','bench'].includes(kind)?{facing:Math.abs(dx)>Math.abs(dz)?(dx<0?'east':'west'):(dz<0?'south':'north')}:{}),
          bounds: { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: 0, y1: height } }
      })
      const bounds = { x0: Math.min(...members.map(p => p.bounds.x0)), x1: Math.max(...members.map(p => p.bounds.x1)),
        z0: Math.min(...members.map(p => p.bounds.z0)), z1: Math.max(...members.map(p => p.bounds.z1)) }
      // 长桌前侧 .6m 使用空间随整组避让；不是新增业务席位。
      if (t.template === 'shared-table-island') bounds.z1 += .61
      if (bounds.x0 < area.x0 + .3 || bounds.x1 > area.x1 - .3 || bounds.z0 < area.z0 + .3 || bounds.z1 > area.z1 - .3 ||
        corridors.some(c => overlaps(bounds, c)) || reserved.some(c => zoneKind === 'north-nook'
          ? members.some(p => overlaps(p.bounds, c, .02)) : overlaps(bounds, c)) ||
        (ring && Math.hypot(Math.max(bounds.x0 - ring.center.x, 0, ring.center.x - bounds.x1), Math.max(bounds.z0 - ring.center.z, 0, ring.center.z - bounds.z1)) < ring.outer) ||
        groups.some(g => overlaps(bounds, g.groupBounds, 1.2)) || workstations.some(p => {
          const dx = Math.max(bounds.x0 - p.x, 0, p.x - bounds.x1), dz = Math.max(bounds.z0 - p.z, 0, p.z - bounds.z1)
          return Math.hypot(dx, dz) < p.radius + .6
        })) continue
      placements.push(...members); groups.push({ id, template: t.template, memberIds: members.map(p => p.id), groupBounds: bounds,
        ...(t.template === 'shared-table-island' ? { useSpace: { x0: cx - 1.6, x1: cx + 1.6, z0: cz + .835, z1: cz + 1.435 } } : {}) })
      placed = true; break
    }
    if (!placed) skipped.push(id)
  }
  return { placements, skipped, groups, corridors: corridors.map(c => ({ ...c })) }
}

export function buildOpenFurnishing({ THREE, root, area, workstations, corridors, reserved, ring, zoneKind, plan: suppliedPlan, low = false, assets }) {
  const plan = structuredClone(suppliedPlan ?? planOpenFurnishing({ area, workstations, corridors, reserved, ring, zoneKind })), batch = createSampleBatch(THREE, assets)
  const curveSegments = plan.groups.some(g => g.template === 'north-nook-seating') ? 2 : 3
  let measured
  const put = (g, color, position, roughness = .75, grain = '') => {
    g.computeBoundingBox(); measured.union(g.boundingBox.clone().translate(new THREE.Vector3(...position)))
    batch.add(g, color, position, 0, roughness, 0, grain)
  }
  const box = (w, h, d, color, x, y, z, grain = '') => put(new THREE.BoxGeometry(w, h, d), color, [x, y, z], .75, grain)
  const cushion = (w, h, d, color, x, y, z) => {
    if (low) { box(w, h, d, color, x, y, z, 'fabric'); return }
    // 倒角向内预留尺寸，软包仍落在原占地与坐高内。
    const bevel = Math.min(.018, w / 8, h / 8, d / 8), a = w / 2 - bevel, b = d / 2 - bevel, r = Math.min(.09, w / 4, d / 4) - bevel
    const s = new THREE.Shape()
    s.moveTo(-a + r, -b); s.lineTo(a - r, -b); s.quadraticCurveTo(a, -b, a, -b + r)
    s.lineTo(a, b - r); s.quadraticCurveTo(a, b, a - r, b)
    s.lineTo(-a + r, b); s.quadraticCurveTo(-a, b, -a, b - r)
    s.lineTo(-a, -b + r); s.quadraticCurveTo(-a, -b, -a + r, -b)
    const g = new THREE.ExtrudeGeometry(s, {depth:h - 2 * bevel, steps:1, bevelEnabled:true, bevelSize:bevel, bevelThickness:bevel, bevelSegments:1, curveSegments})
    g.rotateX(-Math.PI / 2); put(g, color, [x, y - h / 2 + bevel, z], .96, 'fabric')
  }
  for (const p of plan.placements) {
    measured = new THREE.Box3()
    const firstVertex = batch.triangles() * 3
    const { x, z, w, d } = p
    if (p.kind === 'table') {
      box(w, .07, d, '#C9A57A', x, .745, z, 'wood')
      for (const side of [-1, 1]) box(.1, .71, .94, '#B89B64', x + side * 1.3, .355, z)
      box(2.6, .09, .08, '#B89B64', x, .6, z)
      if (!low) { box(.34, .025, .22, '#B7C2B4', x - .6, .795, z, 'fabric'); box(.32, .02, .22, '#F4F1EA', x - .6, .8175, z) }
    } else if (p.kind === 'cabinet' || p.kind === 'planter-cabinet') {
      box(w, .68, d - .03, '#F4F1EA', x, .4, z, 'wood')
      box(w, .04, d, '#C9A57A', x, .76, z, 'wood')
      box(w - .16, .06, d - .12, '#756857', x, .03, z)
      for (const dx of [-w / 4, w / 4]) box(w / 2 - .022, .59, .015, '#D9C9AE', x + dx, .405, z + d / 2 - .0165, 'wood')
      for (const dx of [-w / 4, w / 4]) box(low ? .025 : .035, .2, .015, '#B89B64', x + dx, .46, z + d / 2 - .0075)
      if (p.kind === 'planter-cabinet') {
        box(w-.06,.12,d-.06,'#D9D3C6',x,.86,z,'stone')
        box(w-.12,.015,d-.12,'#554B3E',x,.9275,z)
        for (let i=0;i<(low?6:12);i++) {
          const leaf=officeLeafGeometry(THREE,i*2.399,.16,low?3:7)
          put(leaf,i%3?'#426344':'#718651',[x + (w > .8 ? (i % 3 - 1) * (w / 2 - .19) : 0),.94+(i%3)*.07,z+(i%2?-.12:.12)])
        }
      }
    } else if (p.kind === 'desk-divider') {
      box(w,.34,d,'#B7C2B4',x,.94,z,'fabric')
      box(w,.025,d,'#B89B64',x,1.1225,z)
      for(const dx of [-w/2+.025,w/2-.025])box(.04,.74,d,'#B89B64',x+dx,.37,z)
    } else if (p.kind === 'partition') {
      box(w, 1.05, .08, '#B7C2B4', x, .625, z, 'fabric')
      for (const dx of [-.65, .65]) { box(.045, 1.15, .045, '#B89B64', x + dx, .575, z); box(.12, .025, d, '#756857', x + dx, .0125, z) }
    } else if (p.kind === 'round-table') {
      const r = w / 2, top = p.height
      put(new THREE.CylinderGeometry(r,r,.065,low ? 12 : 24),'#C9A57A',[x,top-.0325,z],.7,'wood')
      put(new THREE.CylinderGeometry(.08,.12,top-.065,8),'#B89B64',[x,(top-.065)/2,z],.55)
    } else if (p.kind === 'bench' || p.kind === 'chair') {
      box(w,.05,d,'#596455',x,.345,z)
      const sideways = p.facing === 'east' || p.facing === 'west'
      if (p.kind === 'bench') for (const side of [-1, 1]) cushion(w-.08,.11,d/2-.024,'#506A5A',x,.425,z+side*d/4)
      else cushion(w-.08,.11,d-.08,'#506A5A',x,.425,z)
      if(sideways)cushion(.09,.42,d,'#B7C2B4',x+(p.facing==='east'?-1:1)*(w/2-.045),.69,z)
      else cushion(w,.42,.09,'#B7C2B4',x,.69,z+(p.facing==='north'?1:-1)*(d/2-.045))
      for (const side of [-1, 1]) {
        if (sideways) cushion(w-.09,.18,.09,'#7F937E',x,.55,z+side*(d/2-.045))
        else cushion(.09,.18,d-.09,'#7F937E',x+side*(w/2-.045),.55,z)
      }
      for (const dx of [-w/2+.08,w/2-.08]) for (const dz of [-d/2+.08,d/2-.08]) box(.045,.32,.045,'#B89B64',x+dx,.16,z+dz)
    } else {
      box(.86, .38, .86, '#D9D3C6', x, .19, z, 'stone')
      box(.76, .025, .76, '#554B3E', x, .395, z)
      for (let i = 0; i < (low ? 6 : 12); i++) {
        const a = i * 2.399, h = .55 + (i % 4) * .13
        put(new THREE.CylinderGeometry(.008, .012, h - .4, low ? 3 : 5), '#526448', [x, (.4 + h) / 2, z])
        const g = officeLeafGeometry(THREE, a, .32, low ? 3 : 7)
        put(g, i % 4 ? '#4D6A46' : '#708650', [x, h, z], .76)
      }
    }
    p.bounds = { x0: measured.min.x, x1: measured.max.x, z0: measured.min.z, z1: measured.max.z, y0: measured.min.y, y1: measured.max.y }
    p.vertices = { start: firstVertex, count: batch.triangles() * 3 - firstVertex }
  }
  const built = batch.build(root, 'open-furnishing-static')
  // 包围盒覆盖全部细节；宿主以后注册这些盒，本卡没有 collision.add。
  return { root: built.mesh, placements: plan.placements, groups: plan.groups, skipped: plan.skipped, corridors: plan.corridors,
    colliders: plan.placements.map(p => ({ id: p.id, ...p.bounds })),
    summary: () => ({ calls: plan.placements.length ? 1 : 0, triangles: built.triangles(), components: plan.placements.length, low }), dispose: built.dispose }
}
