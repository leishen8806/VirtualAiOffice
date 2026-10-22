export const SCREEN_REFRESH_MS = 5000

const seeded = value => () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000)
export const screenSliceAt = elapsedMs => Math.max(0, Math.floor(elapsedMs / SCREEN_REFRESH_MS))

export function screenFrame(seed = 2808, timeSlice = 0) {
  const random = seeded((seed + timeSlice * 7919) >>> 0)
  const nodes = Object.freeze(Array.from({ length: 5 }, (_, index) => Object.freeze({ id: `SIM-${index + 1}`, x: .12 + random() * .68, y: .2 + random() * .42, state: ['就绪', '流转', '待检'][Math.floor(random() * 3)] })))
  const bars = Object.freeze(Array.from({ length: 4 }, (_, index) => Math.round(28 + random() * 58)))
  const lights = Object.freeze(Array.from({ length: 3 }, (_, index) => ['绿', '黄', '绿'][Math.floor((random() + index) * 2) % 3]))
  return Object.freeze({ timeSlice, watermark: '模拟数据 · 示意', nodes, links: Object.freeze([[0, 1], [1, 2], [2, 3], [1, 4]]), bars, lights })
}

const zone = (zones, id) => zones.find(item => item.id === id)
const box = (items, x, y, z, sx, sy, sz, color) => items.push({ x, y, z, sx, sy, sz, color })
const put = (mesh, index, THREE, item) => {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(item.x, item.y, item.z), new THREE.Quaternion(), new THREE.Vector3(item.sx, item.sy, item.sz))
  mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, new THREE.Color(item.color))
}
const quad = (positions, uvs, indices, x, y, z, width, height, u0, u1) => {
  const base = positions.length / 3, left = x - width / 2, right = x + width / 2, bottom = y - height / 2, top = y + height / 2
  positions.push(left, bottom, z, right, bottom, z, right, top, z, left, top, z)
  uvs.push(u0, 0, u1, 0, u1, 1, u0, 1); indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function draw(ctx, width, height, frame) {
  ctx.fillStyle = '#111c25'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#1b3040'; ctx.fillRect(28, 32, 610, 448)
  ctx.strokeStyle = '#5f94a9'; ctx.lineWidth = 4; ctx.strokeRect(28, 32, 610, 448)
  ctx.fillStyle = '#d5af62'; ctx.font = '700 30px sans-serif'; ctx.fillText(frame.watermark, 52, 76)
  ctx.strokeStyle = '#8fb4c1'; ctx.lineWidth = 3
  for (const [from, to] of frame.links) { const a = frame.nodes[from], b = frame.nodes[to]; ctx.beginPath(); ctx.moveTo(52 + a.x * 560, 96 + a.y * 310); ctx.lineTo(52 + b.x * 560, 96 + b.y * 310); ctx.stroke() }
  for (const node of frame.nodes) { ctx.fillStyle = node.state === '待检' ? '#d5af62' : '#6fbf9c'; ctx.beginPath(); ctx.arc(52 + node.x * 560, 96 + node.y * 310, 12, 0, Math.PI * 2); ctx.fill() }
  frame.bars.forEach((value, index) => { ctx.fillStyle = '#6da2bd'; ctx.fillRect(68 + index * 128, 438 - value * 1.6, 74, value * 1.6) })
  ctx.fillStyle = '#18232b'; ctx.fillRect(674, 32, 322, 448); ctx.strokeStyle = '#d5af62'; ctx.strokeRect(674, 32, 322, 448)
  ctx.fillStyle = '#f4f1eb'; ctx.font = '700 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DR 仓配服务中心', 835, 156); ctx.fillText('示意展示', 835, 206)
  ctx.fillStyle = '#d5af62'; ctx.font = '600 28px sans-serif'; ctx.fillText('授权标签 · 示意 / 模拟', 835, 274); ctx.fillText('参观外观 · 非业务入口', 835, 330); ctx.textAlign = 'left'
}

export function buildCampusInterior({ THREE, root, canvasTex, layout, quality }) {
  const zones = layout.zones, dispatch = zone(zones, 'dispatch'), visitor = zone(zones, 'visitor'), showcase = zone(zones, 'showcase'), office = zone(zones, 'officeMeeting'), maintenance = zone(zones, 'maintenance')
  const props = []
  box(props, -161, .56, 8, 6.4, 1.12, 1.4, 0x344b58); box(props, -161, 1.18, 7.15, 5.8, .08, .32, 0xd5af62)
  box(props, -161, .5, 25.8, 7.2, 1, 1.2, 0x405867); box(props, -164, .55, 22.2, 3.1, .7, 1.25, 0x708997); box(props, -158, .55, 22.2, 3.1, .7, 1.25, 0x708997)
  box(props, -142, .55, 25, 4.8, 1.1, 3.6, 0x4a5e69); box(props, -142, 1.3, 25, 2.8, .18, 1.5, 0xd5af62)
  for (const x of [-126, -118, -110]) box(props, x, .55, 23.2, 3.8, 1.1, 1.8, 0x53626a)
  box(props, -117, .62, 27.4, 7.2, 1.2, 2.4, 0x405867); box(props, -92, .12, 25, 9.6, .24, 4.8, 0x26333a); box(props, -92, 1.05, 25, 1.7, 2.1, .34, 0x6da2bd)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .18 })
  const propsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, props.length)
  propsMesh.name = 'campus-interior-static'; propsMesh.receiveShadow = false; props.forEach((item, index) => put(propsMesh, index, THREE, item)); propsMesh.instanceMatrix.needsUpdate = true; propsMesh.instanceColor.needsUpdate = true; root.add(propsMesh)
  let slice = 0, seen = false, texture
  texture = canvasTex(1024, 512, (ctx, width, height) => draw(ctx, width, height, screenFrame(2808, slice)))
  const positions = [], uvs = [], indices = []
  quad(positions, uvs, indices, (dispatch.x0 + dispatch.x1) / 2, 3.15, dispatch.z0 + .16, 11.6, 5.8, 0, .64)
  quad(positions, uvs, indices, (showcase.x0 + showcase.x1) / 2, 3.15, showcase.z0 + .16, 12.8, 5.8, .66, 1)
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeBoundingSphere()
  const screen = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }))
  screen.name = 'campus-dispatch-simulation'; screen.userData.dynamic = quality?.tier !== 'low'; screen.onBeforeRender = () => { seen = true }; root.add(screen)
  const timer = quality?.tier === 'low' ? null : setInterval(() => {
    if (document.hidden || !seen) return
    seen = false; slice++
    draw(texture.image.getContext('2d'), 1024, 512, screenFrame(2808, slice)); texture.needsUpdate = true
  }, SCREEN_REFRESH_MS)
  return { dispose() { if (timer) clearInterval(timer); texture.dispose(); geometry.dispose(); material.dispose(); propsMesh.geometry.dispose(); screen.material.dispose() } }
}
