import { buildDisplayDepartments } from '../display-departments.js'
import { displayBatch } from '../display-staff-mesh.js'
import { DISPLAY_DEPARTMENTS, displayRoster } from '../display-staff-logic.js'
import { officeSampleRequested } from './host.js'
import { officeLeafGeometry } from './plants.js'

// 保留原标签图集、身份、路线边界及释放契约；只替换已识别的静态陈设。
export function buildOfficeDisplayFinish(context) {
  const result = buildDisplayDepartments(context)
  if (context.layout?.variant !== 'align' || !officeSampleRequested(context.search)) return result
  const { THREE, layout, low = false, departments = DISPLAY_DEPARTMENTS } = context
  const mesh = result.root.children[0], original = mesh.geometry, pieces = [], parts = []
  const rooms = departments.map(id => layout.regions.find(r => r.id === id))
  const people = displayRoster(layout).filter(p => departments.includes(p.department))
  const boxes = rooms.flatMap(r => [
    [r.x1 - .55, .35, r.z0 + .65, .45, .65, .45],
    ...(!low ? [[r.x1 - .55, .95, r.z0 + .65, .55, .65, .5]] : []),
  ]).concat(people.flatMap(p => [
    [p.home.x, .47, p.home.z, .46, .1, .46],
    [p.home.x, .74, p.home.z + .23, .46, .48, .06],
    [p.home.x, .24, p.home.z, .08, .42, .08],
  ]))
  const pos = original.attributes.position, keep = []
  for (let i = 0; i < pos.count; i += 3) {
    const removed = boxes.some(([x, y, z, w, h, d]) => [i, i + 1, i + 2].every(j =>
      Math.abs(pos.getX(j) - x) <= w / 2 + 1e-5 && Math.abs(pos.getY(j) - y) <= h / 2 + 1e-5 && Math.abs(pos.getZ(j) - z) <= d / 2 + 1e-5))
    if (!removed) keep.push(i, i + 1, i + 2)
  }
  // 上游几何发生变化时保留原件，不能猜测并删除未知物件。
  if (original.index || pos.count - keep.length !== boxes.length * 36) return result
  try {
    const retained = new THREE.BufferGeometry()
    for (const [key, attr] of Object.entries(original.attributes)) {
      const values = new Float32Array(keep.length * attr.itemSize)
      keep.forEach((old, i) => values.set(attr.array.subarray(old * attr.itemSize, (old + 1) * attr.itemSize), i * attr.itemSize))
      retained.setAttribute(key, new THREE.BufferAttribute(values, attr.itemSize))
    }
    pieces.push(retained)
    const add = (source, color, x, y, z) => {
      const g = source.index ? source.toNonIndexed() : source
      if (source !== g) source.dispose()
      g.translate(x, y, z)
      const c = new THREE.Color(color), count = g.attributes.position.count
      const colors = new Float32Array(count * 3), uv = new Float32Array(count * 2).fill(.005)
      for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      pieces.push(g)
    }
    const box = (x, y, z, w, h, d, color) => add(new THREE.BoxGeometry(w, h, d), color, x, y, z)
    const cylinder = (x, y, z, r, h, color) => add(new THREE.CylinderGeometry(r, r, h, low ? 8 : 16), color, x, y, z)
    const part = (id, kind, draw) => {
      const start = pieces.reduce((n, g) => n + g.attributes.position.count, 0)
      draw()
      parts.push({ id, kind, start, count: pieces.reduce((n, g) => n + g.attributes.position.count, 0) - start })
    }
    for (const r of rooms) part(r.id, 'plant', () => {
      const x = r.x1 - .55, z = r.z0 + .65
      add(new THREE.CylinderGeometry(.225, .20, .65, low ? 8 : 16, 1, true), '#D9D3C6', x, .35, z)
      cylinder(x, .03, z, .20, .01, '#D9D3C6')
      cylinder(x, .669, z, .20, .01, '#534A3C')
      if (low) return
      for (let i = 0; i < 10; i++) {
        const angle = i * 2.399, y = .73 + (i % 4) * .065
        cylinder(x, (.675 + y) / 2, z, .006, y - .675, '#526448')
        add(officeLeafGeometry(THREE, angle, .19, 5), i % 3 ? '#4D6A46' : '#708650', x, y, z)
      }
    })
    for (const p of people) {
      part(p.id, 'chair', () => {
        const x = p.home.x, z = p.home.z
        // 圆角外轮廓完全包含于原座垫方形；顶面及靠背高度不变。
        cylinder(x, .47, z, .23, .10, '#B7C2B4')
        box(x, .74, z + .23, .46, .48, .06, '#B7C2B4')
        cylinder(x, .275, z, .032, .29, '#746A59')
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5, g = new THREE.BoxGeometry(.025, .025, .18)
          g.rotateY(a)
          add(g, '#746A59', x + Math.sin(a) * .09, .12, z + Math.cos(a) * .09)
          cylinder(x + Math.sin(a) * .18, .085, z + Math.cos(a) * .18, .025, .07, '#4A4D48')
        }
        for (const s of [-1, 1]) {
          box(x + s * .21, .61, z + .03, .025, .23, .025, '#746A59')
          box(x + s * .21, .73, z + .03, .04, .035, .33, '#B7C2B4')
        }
      })
      part(p.id, 'desk-detail', () => {
        const x = p.desk.x, z = p.desk.z
        box(x, .805, z - .08, .20, .01, .14, '#746A59')
        box(x, .8375, z - .08, .035, .055, .035, '#746A59')
        box(x - .04, .812, z + .15, .32, .024, .1, '#4A4D48')
        box(x + .24, .812, z + .15, .045, .024, .07, '#4A4D48')
        box(x - .22, .40, z, .24, .64, .38, '#D9D3C6')
        for (const y of [.22, .43, .64]) box(x - .22, y, z + .195, .10, .012, .01, '#B89B64')
      })
    }
    const replacement = displayBatch(THREE, pieces, mesh.material).geometry
    mesh.geometry = replacement; original.dispose()
    result.finish = { parts, retainedVertices: keep.length }
  } catch (error) {
    pieces.forEach(g => g.dispose())
    result.finish = { fallback: true, reason: String(error?.message || error) }
  }
  return result
}
