import { OFFICE_THEME_V2 as T } from './office-theme-v2.js'
import { DISPLAY_DEPARTMENTS, DISPLAY_LABEL, displayRoster, displayFurnitureBounds } from './display-staff-logic.js'
import { displayBatch, displayAtlas } from './display-staff-mesh.js'

const names = Object.freeze({ market: '市场部', service: '客服部', aftersales: '售后部', marketing: '营销部' })
export function buildDisplayDepartments({ THREE, root, layout, low = false, canvasTex, departments = DISPLAY_DEPARTMENTS }) {
  if (layout?.version !== 2) throw new Error('DISPLAY_LAYOUT_REQUIRED')
  const group = new THREE.Group(), pieces = [], labels = []
  group.name = 'office2-display-departments'
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: T.wallRoughness })
  const white = new THREE.Color(T.nameplate), wood = new THREE.Color(T.trim).lerp(white, .55)
  const leaf = new THREE.Color(T.glass).offsetHSL(.05, .25, -.18)
  const box = (x, y, z, w, h, d, color) => {
    const source = new THREE.BoxGeometry(w, h, d), g = source.toNonIndexed(); source.dispose()
    g.translate(x, y, z)
    const colors = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
    for (let i = 0; i < g.attributes.uv.count; i++) g.attributes.uv.setXY(i, .005, .005)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(g)
  }
  const rooms = departments.map(id => layout.regions.find(r => r.id === id))
  rooms.forEach((room, index) => {
    box((room.x0 + room.x1) / 2, .025, (room.z0 + room.z1) / 2, room.x1 - room.x0 - .2, .03, room.z1 - room.z0 - .2, new THREE.Color(T.exteriorWall))
    const door = room.doors[0]
    let g
    if (layout.variant !== 'align') {
      const north = door.side === 'south', z = north ? room.z1 - .25 : room.z0 + .25
      box(door.at, 2.25, z, 3.8, .7, .08, wood)
      g = new THREE.PlaneGeometry(3.7, .64)
      if (!north) g.rotateY(Math.PI)
      g.translate(door.at, 2.25, z + (north ? .05 : -.05))
    } else {
      const side = door.side, horizontal = side === 'north' || side === 'south'
      const x = horizontal ? door.at : (side === 'west' ? room.x0 + .25 : room.x1 - .25)
      const z = horizontal ? (side === 'south' ? room.z1 - .25 : room.z0 + .25) : door.at
      box(x, 2.25, z, horizontal ? 3.8 : .08, .7, horizontal ? .08 : 3.8, wood)
      g = new THREE.PlaneGeometry(3.7, .64)
      if (side === 'north') g.rotateY(Math.PI)
      if (side === 'west') g.rotateY(Math.PI / 2)
      if (side === 'east') g.rotateY(-Math.PI / 2)
      g.translate(
        x + (horizontal ? 0 : side === 'west' ? .05 : -.05),
        2.25,
        z + (horizontal ? side === 'south' ? .05 : -.05 : 0),
      )
    }
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + rooms.length - index - 1) / rooms.length)
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3))
    labels.push(g.toNonIndexed()); g.dispose()
    box(room.x1 - .55, .35, room.z0 + .65, .45, .65, .45, white)
    if (!low) box(room.x1 - .55, .95, room.z0 + .65, .55, .65, .5, leaf)
  })
  for (const p of displayRoster(layout).filter(p => departments.includes(p.department))) {
    box(p.desk.x, .76, p.desk.z, 1, .08, .56, wood)
    for (const dx of [-.4, .4]) box(p.desk.x + dx, .37, p.desk.z, .06, .72, .45, white)
    box(p.home.x, .47, p.home.z, .46, .1, .46, leaf)
    box(p.home.x, .74, p.home.z + .23, .46, .48, .06, leaf)
    box(p.home.x, .24, p.home.z, .08, .42, .08, wood)
    box(p.desk.x, 1.04, p.desk.z - .08, .42, .35, .05, new THREE.Color(T.nameplateText))
    if (!low) box(p.desk.x, 1.04, p.desk.z - .047, .36, .28, .012, leaf)
  }
  const texture = displayAtlas(THREE, rooms.map(r => [names[r.id], DISPLAY_LABEL]), canvasTex)
  material.map = texture
  const solid = displayBatch(THREE, [...pieces, ...labels], material); solid.name = 'display-furniture-sign-batch'; group.add(solid)
  root.add(group)
  const regions = rooms.map(r => Object.freeze({ id: r.id, kind: '展示区域', title: names[r.id], description: DISPLAY_LABEL,
    bounds: { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 } }))
  group.userData.displayRegions = regions
  let disposed = false
  return { root: group, regions, bounds: displayFurnitureBounds(layout).filter(b => departments.some(id => b.id.startsWith(`sim-${id}-`))),
    summary: () => ({ calls: 1, triangles: group.children.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0),
      departments: rooms.length, desks: departments.length * 3, low }),
    dispose() {
      if (disposed) return
      disposed = true
      group.children.forEach(m => m.geometry.dispose()); material.dispose(); texture?.dispose()
      group.removeFromParent()
    } }
}
