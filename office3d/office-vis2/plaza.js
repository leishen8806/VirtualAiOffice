import { buildOfficePlazaProps } from '../office-plaza-props.js'

// 复用已登记构件，只给预览提供占地映射；宿主碰撞与热点仍由集成人接线。
export function appendOfficePlaza({ THREE, batch, layout }) {
  const p = layout.plaza, placements = [], prototypes = new Map()
  const box = (x, y, z, w, h, d, color, grain = '') => batch.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], 0, .78, 0, grain)
  const add = (category, kind, id, point, yaw = 0, scale = [1, 1, 1], offset = [0, 0]) => {
    const key = category + kind
    if (!prototypes.has(key)) prototypes.set(key, buildOfficePlazaProps({ THREE, root: new THREE.Group(), placements: { [category]: [{ id: key, kind, x: 0, z: 0, yaw: 0 }] } }))
    const source = prototypes.get(key), bounds = new THREE.Box3()
    for (const mesh of source.root.children) {
      const geometry = mesh.geometry.clone()
      // 原共享伞盖为向上开口的锥面，私有副本翻正，保持原杆、桌与椅不变。
      if (category === 'cafe' && mesh.name.endsWith('-accent')) geometry.translate(0, -3.15, 0).rotateX(Math.PI).translate(0, 3.15, 0)
      geometry.scale(...scale); geometry.rotateY(yaw); geometry.translate(point.x + offset[0], .11, point.z + offset[1])
      geometry.computeBoundingBox(); bounds.union(geometry.boundingBox)
      batch.add(geometry, null, [0, 0, 0], 0, mesh.material.roughness, mesh.material.metalness)
    }
    placements.push({ id, kind: category, source: { x: point.x, z: point.z }, x: point.x + offset[0], z: point.z + offset[1], yaw, scale, bounds: { x0: bounds.min.x, x1: bounds.max.x, z0: bounds.min.z, z1: bounds.max.z, y0: bounds.min.y, y1: bounds.max.y }, interaction: 'preview-only' })
  }
  try {
    for (const point of p.carts) {
      add('vendors', 'awning-cart', point.id, point, Math.PI / 2, [.72, 1, .72])
      box(point.x + .565, 1, point.z, .02, .86, 2.14, '#C9A57A', 'wood')
      for (let i = 0; i < 12; i++) box(point.x + .581, 1, point.z - .99 + i * .18, .015, .78, .022, '#B89B64')
    }
    for (const point of p.kiosks) {
      add('vendors', 'square-kiosk', point.id, point, Math.PI / 2, [.72, 1, .72])
      for (const dz of [-.8, .8]) box(point.x - .94, 1.43, point.z + dz, .07, 1.14, .07, '#C9A57A', 'wood')
      for (const y of [1.16, 1.69]) box(point.x - .96, y, point.z, .035, .05, 1.51, '#C9A57A', 'wood')
      for (let i = 0; i < 5; i++) box(point.x - .95, 1.83, point.z - .53 + i * .26, .045, .23, .15, i % 2 ? '#B7C2B4' : '#D9D3C6')
      box(point.x - .96, 2.08, point.z, .035, .035, 1.55, '#B89B64')
    }
    p.umbrellaTables.forEach((point, i) => add('cafe', '', `plaza-cafe-${i + 1}`, point, 0, [.85, 1, .85]))
    // 既定点位的长椅会穿入伞桌、花箱或亭体，预览移至边缘；明确输出原/新坐标供 Trae 审核。
    p.benches.forEach((point, i) => {
      const side = point.x < p.center.x ? -1 : 1
      const shift = point.z < p.center.z ? -side * 2.5 : side * 2
      const yaw = point.z > p.center.z && point.z < p.center.z + 5 ? -side * Math.PI / 2 : point.z > p.center.z ? Math.PI : 0
      add('benches', '', `plaza-bench-${i + 1}`, point, yaw, [.72, 1, .72], [shift, 0])
    })
    // 杆灯与伞面有冲突的点位暂不实例化，保留南侧两盏，避免穿过伞盖。
    p.lamps.filter(point => point.z >= p.center.z + p.radius).forEach((point, i) => add('lamps', '', `plaza-lamp-${i + 1}`, point, 0, [1, 1, 1], [0, .5]))
    p.flowerBands.filter(point => point.z > p.center.z).forEach((point, i) => {
      box(point.x, .28, point.z, 3.02, .34, .82, '#D9D3C6', 'stone')
      box(point.x, .46, point.z, 2.88, .025, .68, '#534A3C')
      for (let j = 0; j < 24; j++) {
        const x = point.x - 1.25 + (j % 8) * .35, z = point.z - .23 + Math.floor(j / 8) * .23
        for (let k = 0; k < 5; k++) {
          const leaf = new THREE.IcosahedronGeometry(.14, 0); leaf.scale(.4, 1.6, .25); leaf.rotateZ(.65); leaf.rotateY(k * 2.399)
          batch.add(leaf, k % 3 ? '#3E5A4E' : '#648B50', [x, .62, z], 0, .9)
        }
        if (j % 2) batch.add(new THREE.IcosahedronGeometry(.045, 0), j % 3 ? '#BD8C94' : '#E6CD92', [x, .79, z], 0, .95)
      }
      placements.push({ id: `plaza-flowers-${i + 1}`, kind: 'flowers', source: { ...point }, ...point, bounds: { x0: point.x - 1.51, x1: point.x + 1.51, z0: point.z - .41, z1: point.z + .41, y0: .11, y1: .84 }, interaction: 'preview-only' })
    })
  } finally { prototypes.forEach(source => source.dispose()) }
  return placements
}
