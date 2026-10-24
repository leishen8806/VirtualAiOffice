import { createSampleBatch } from './batch.js'
import { appendOfficePlaza } from './plaza.js'

export function appendOfficePlazaPaving({ THREE, batch, layout, low = false }) {
  const plaza = layout.plaza, c = plaza.center
  const disk = new THREE.CircleGeometry(plaza.radius - .25, low ? 48 : 96)
  disk.rotateX(-Math.PI / 2); batch.add(disk, '#E1C399', [c.x, .09, c.z], 0, .9, 0, 'stone')
  for (const radius of [3.1, 5.8, 8.3]) {
    const ring = new THREE.RingGeometry(radius - .055, radius + .055, low ? 40 : 80)
    ring.rotateX(-Math.PI / 2); batch.add(ring, '#A59B88', [c.x, .104, c.z], 0, .85)
  }
  for (let i = 0; i < plaza.radialSeams; i++) {
    const a = i * Math.PI * 2 / plaza.radialSeams, length = plaza.radius - .25 - 3.2
    batch.add(new THREE.BoxGeometry(.018, .006, length), '#B8AF9F', [c.x + Math.sin(a) * (3.2 + length / 2), .103, c.z + Math.cos(a) * (3.2 + length / 2)], a, .9)
  }
  batch.add(new THREE.BoxGeometry(3.8, .02, 1.8), '#D9D3C6', [c.x, .105, 12.9], 0, .78, 0, 'stone')
}

// Preview-owned decoration. Functional seats, colliders and navigation remain in the host.
export function buildOfficeCompletionVisual({ THREE, root, layout, canvasTex, low = false, includePaving = true, includeZones = true }) {
  const group = new THREE.Group(); group.name = 'office-vis2-completion'; root.add(group)
  const batch = createSampleBatch(THREE), placements = [], displayIds = ['market', 'service', 'aftersales', 'marketing']
  const box = (x, y, z, w, h, d, color, surface = '') => batch.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], 0, surface === 'wood' ? .66 : .78, 0, surface)
  const cylinder = (x, y, z, radius, height, color, segments = 12) => batch.add(new THREE.CylinderGeometry(radius, radius, height, segments), color, [x, y, z], 0, .8)
  const plant = (x, z, scale = 1) => {
    cylinder(x, .21 * scale, z, .27 * scale, .42 * scale, '#D9D3C6')
    cylinder(x, .49 * scale, z, .22 * scale, .04 * scale, '#534A3C')
    for (let i = 0; i < (low ? 5 : 9); i++) {
      const a = i * 2.399, leaf = new THREE.IcosahedronGeometry(.23 * scale, 0)
      leaf.scale(.68, 1.3, .5); leaf.rotateZ(a)
      batch.add(leaf, i % 3 ? '#3E5A4E' : '#648B50', [x + Math.sin(a) * .16 * scale, (.7 + (i % 3) * .12) * scale, z + Math.cos(a) * .16 * scale], 0, .95)
    }
  }
  const desk = (x, z) => {
    box(x, .74, z - .55, 1.15, .07, .58, '#C9A57A', 'wood')
    for (const dx of [-.48, .48]) for (const dz of [-.23, .23]) box(x + dx, .36, z - .55 + dz, .045, .72, .045, '#B89B64')
    box(x, 1.04, z - .72, .45, .28, .025, '#26333A')
    box(x, .87, z - .72, .04, .07, .04, '#596455')
    box(x, .78, z - .37, .42, .015, .13, '#F4F1EA')
    box(x, .47, z + .22, .48, .08, .43, '#3E5A4E')
    box(x, .81, z + .41, .48, .61, .09, '#3E5A4E')
    for (const dx of [-.19, .19]) box(x + dx, .23, z + .22, .035, .42, .035, '#596455')
    placements.push({ kind: 'display-desk', x, z: z - .55, width: 1.15, depth: .58 })
  }
  for (const id of displayIds) {
    const room = layout.regions.find(value => value.id === id)
    if (!room) continue
    for (const seat of layout.displaySeats.filter(value => value.region === id)) desk(seat.x, seat.z)
    const outerX = id === 'market' || id === 'aftersales' ? room.x0 + .52 : room.x1 - .52
    const shelfZ = room.z0 + 1.25
    box(outerX, 1.03, shelfZ, .42, 2.02, 1.55, '#C9A57A', 'wood')
    for (const y of [.48, 1.05, 1.62]) box(outerX, y, shelfZ, .48, .05, 1.66, '#F4F1EA')
    for (const y of [.72, 1.31, 1.84]) box(outerX, y, shelfZ + .21, .26, .36, .25, '#B7C2B4')
    plant(room.x0 + 1, room.z1 - .75, .8)
    placements.push({ kind: 'shelf', room: id, x: outerX, z: shelfZ, width: .48, depth: 1.66 })
  }
  // Meeting rooms get edge fittings only. Trae must relocate the shared tables and their seat/hotspot contract together.
  for (const id of ['board', 'review', 'plan']) {
    const room = layout.regions.find(value => value.id === id)
    if (!room) continue
    box((room.x0 + room.x1) / 2, 2.13, room.z0 + .23, 2.2, 1.12, .055, '#596455')
    box((room.x0 + room.x1) / 2, 2.13, room.z0 + .27, 2.06, .98, .012, '#26333A')
    plant(room.x1 - .7, room.z0 + .85, .7)
  }
  for (const id of includeZones ? ['creative', 'dining', 'leisure'] : []) {
    const room = layout.regions.find(value => value.id === id)
    if (!room) continue
    const x = (room.x0 + room.x1) / 2, z = (room.z0 + room.z1) / 2
    cylinder(x, .67, z, 1.04, .07, '#C9A57A', low ? 20 : 32)
    cylinder(x, .34, z, .12, .64, '#B89B64')
    for (const dx of [-1.5, 1.5]) {
      box(x + dx, .43, z, .6, .12, .56, '#3E5A4E')
      box(x + dx, .65, z + (dx < 0 ? -.27 : .27), .6, .48, .08, '#B7C2B4')
    }
    plant(room.x0 + .8, room.z0 + .8, .8)
    placements.push({ kind: 'discussion-table', room: id, x, z, radius: 1.04 })
  }
  const plaza = layout.plaza, c = plaza.center
  if (includePaving) appendOfficePlazaPaving({ THREE, batch, layout, low })
  const plazaStart = batch.triangles()
  placements.push(...appendOfficePlaza({ THREE, batch, layout, low }))
  const plazaTriangles = batch.triangles() - plazaStart
  const fixed = batch.build(group, 'office-completion-furniture-and-plaza')
  let sign, signTexture, signMaterial, disposed = false
  try {
    if (canvasTex) {
      const rooms = [...displayIds, 'board', 'review', 'plan', ...(includeZones ? ['creative'] : [])].map(id => layout.regions.find(room => room.id === id)).filter(Boolean)
      signTexture = canvasTex(1024, 512, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        rooms.forEach((room, i) => {
          const x = i % 2 * 512, y = Math.floor(i / 2) * 128
          ctx.fillStyle = '#F4F1EA'; ctx.fillRect(x, y, 512, 128)
          ctx.fillStyle = '#493f32'; ctx.font = '600 46px Microsoft YaHei, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(room.name, x + 256, y + 64)
        })
      })
      const positions = [], uvs = [], indices = []
      rooms.forEach((room, i) => {
        const x = (room.x0 + room.x1) / 2, y = 2.5, z = room.z1 - .26, u0 = i % 2 * .5, v0 = 1 - (Math.floor(i / 2) + 1) * .25
        const start = positions.length / 3
        positions.push(x - 1.2, y - .19, z, x + 1.2, y - .19, z, x + 1.2, y + .19, z, x - 1.2, y + .19, z)
        uvs.push(u0, v0, u0 + .5, v0, u0 + .5, v0 + .25, u0, v0 + .25)
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
      })
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
      signMaterial = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide })
      sign = new THREE.Mesh(geometry, signMaterial); sign.name = 'office-completion-room-signs'; group.add(sign)
    }
  } catch (error) { fixed.dispose(); sign?.geometry.dispose(); signMaterial?.dispose(); signTexture?.dispose(); group.removeFromParent(); throw error }
  return { root: group, placements, summary: () => ({ calls: sign ? 2 : 1, triangles: fixed.triangles() + (sign ? sign.geometry.index.count / 3 : 0), plazaTriangles, signs: !!sign }), dispose() {
    if (disposed) return; disposed = true
    fixed.dispose(); sign?.geometry.dispose(); signMaterial?.dispose(); signTexture?.dispose(); group.removeFromParent()
  } }
}
