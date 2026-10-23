import { CAMBODIA_CITIES, CAMBODIA_OUTLINE_D, CAMBODIA_ROUTE_PAIRS, MAP_VIEW } from './dr-cambodia-outline.js'
import {
  controlRoomLiveEnabled,
  createControlRoomLiveScreen,
} from './dr-control-room-screen.js'

export const CONTROL_ROOM_SPEC = Object.freeze({
  width: 16, depth: 10, wallHeight: 3.8, consoleSeats: 4,
  camera: Object.freeze({ az: 0, el: 22, r: 24, targetY: 1.6 }),
  watermark: '模拟数据 · 示意',
})

const mat = (THREE, color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...options })
const addBox = (THREE, root, material, size, position, cast = true) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position); mesh.castShadow = cast; mesh.receiveShadow = true; root.add(mesh); return mesh
}
const addPlane = (THREE, root, material, size, position, rotation = [0, 0, 0]) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material)
  mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.receiveShadow = true; root.add(mesh); return mesh
}

function drawScreen(ctx, width, height) {
  ctx.fillStyle = '#071521'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#24485c'; ctx.fillRect(18, 18, width - 36, height - 36)
  ctx.strokeStyle = '#8fb4c1'; ctx.lineWidth = 4; ctx.strokeRect(18, 18, width - 36, height - 36)
  ctx.fillStyle = '#f4f1eb'; ctx.font = '700 28px sans-serif'; ctx.fillText('DR 仓配服务中心 · 调度中控', 40, 52)
  ctx.fillStyle = '#d5af62'; ctx.font = '600 18px sans-serif'; ctx.fillText('模拟数据 · 示意', width - 210, 52)
  const leftW = width * .2, rightX = width * .75
  ctx.fillStyle = '#102735'; ctx.fillRect(30, 72, leftW - 12, height - 100)
  ctx.fillStyle = '#b7d4e0'; ctx.font = '600 18px sans-serif'
  ;['入库车辆 12', '在途车辆 18', '今日任务 42', '异常预警 03'].forEach((line, i) => ctx.fillText(line, 48, 120 + i * 56))
  ctx.fillStyle = '#193c4d'; ctx.fillRect(leftW + 8, 72, width * .5 - 16, height - 100)
  ctx.save(); ctx.translate(leftW + 24, 96); const scale = Math.min((width * .5 - 48) / MAP_VIEW.width, (height - 144) / MAP_VIEW.height); ctx.scale(scale, scale)
  ctx.fillStyle = '#183847'; ctx.strokeStyle = '#8fb4c1'; ctx.lineWidth = 4 / scale; const outline = new Path2D(CAMBODIA_OUTLINE_D); ctx.fill(outline); ctx.stroke(outline)
  ctx.strokeStyle = '#b7d4e0'; ctx.lineWidth = 2.5 / scale
  const nodes = CAMBODIA_CITIES.map(item => ({ ...item, x: item.x, y: item.y })); const byId = Object.fromEntries(nodes.map(item => [item.id, item]))
  for (const [from, to] of CAMBODIA_ROUTE_PAIRS) { const a = byId[from], b = byId[to]; if (!a || !b) continue; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
  for (const node of nodes) { ctx.fillStyle = node.id === 'phnom-penh' ? '#d5af62' : '#b7d4e0'; ctx.beginPath(); ctx.arc(node.x, node.y, node.id === 'phnom-penh' ? 12 : 6, 0, Math.PI * 2); ctx.fill(); if (node.id === 'phnom-penh') { ctx.fillStyle = '#f4f1eb'; ctx.font = '700 24px sans-serif'; ctx.fillText('Phnom Penh', node.x + 16, node.y + 7) } }
  ctx.restore()
  ctx.fillStyle = '#102735'; ctx.fillRect(rightX, 72, width - rightX - 30, height - 100)
  ctx.fillStyle = '#f4f1eb'; ctx.font = '700 18px sans-serif'; ctx.fillText('仓储监控', rightX + 18, 106)
  ctx.fillStyle = '#8fb4c1'; ctx.font = '600 17px sans-serif'; ctx.fillText('月台', rightX + 18, 146); ctx.fillText('车辆', rightX + 18, 202); ctx.fillText('设备', rightX + 18, 258)
  ctx.strokeStyle = '#b7d4e0'; ctx.lineWidth = 5; [146, 202, 258].forEach((y, i) => { ctx.beginPath(); ctx.moveTo(rightX + 70, y - 6); ctx.lineTo(rightX + 100 + i * 34, y - 6); ctx.stroke() })
}

function addOperator(THREE, root, x, material) {
  const group = new THREE.Group(); group.position.set(x, 0, .05); root.add(group)
  addBox(THREE, group, material, [.52, 1.05, .32], [0, 1.15, 0])
  addBox(THREE, group, material, [.38, .38, .38], [0, 1.88, 0])
  addBox(THREE, group, mat(THREE, 0x20262b), [.14, .7, .14], [-.15, .38, -.08])
  addBox(THREE, group, mat(THREE, 0x20262b), [.14, .7, .14], [.15, .38, -.08])
}

export function buildDrControlRoom({
  THREE,
  scene,
  canvasTex,
  origin = { x: -161, z: 8 },
  search = globalThis.location?.search || '',
  liveOptions = {},
}) {
  const root = new THREE.Group(); root.name = 'dr-control-room'; root.position.set(origin.x, 0, origin.z); scene.add(root)
  // Keep the opt-in room out of the global quality variants and campus merge; it owns its lifecycle.
  root.userData.dynamic = true
  const materials = [mat(THREE, 0xf4f1ea), mat(THREE, 0xd9d3c6), mat(THREE, 0x26333a), mat(THREE, 0x2f6fa8), mat(THREE, 0xe8832a), mat(THREE, 0xb7c2b4)]
  const [warm, pale, graphite, blue, orange, plant] = materials
  addPlane(THREE, root, mat(THREE, 0xd9d3c6, { roughness: .58 }), [CONTROL_ROOM_SPEC.width, CONTROL_ROOM_SPEC.depth], [0, .01, 0], [-Math.PI / 2, 0, 0])
  addBox(THREE, root, warm, [CONTROL_ROOM_SPEC.width, CONTROL_ROOM_SPEC.wallHeight, .22], [0, CONTROL_ROOM_SPEC.wallHeight / 2, -4.7], false)
  addBox(THREE, root, pale, [.18, CONTROL_ROOM_SPEC.wallHeight, CONTROL_ROOM_SPEC.depth], [7.9, CONTROL_ROOM_SPEC.wallHeight / 2, 0], false)
  addBox(THREE, root, pale, [CONTROL_ROOM_SPEC.width, .12, CONTROL_ROOM_SPEC.depth], [0, 3.9, 0], false)
  addBox(THREE, root, graphite, [17, .08, .08], [0, .12, 4.45], false)
  addBox(THREE, root, graphite, [.08, 3.8, .08], [7.9, 1.9, 4.45], false)
  addPlane(THREE, root, new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, transparent: true, opacity: .12, roughness: .04, side: THREE.DoubleSide }), [16, 3.8], [0, 1.9, 4.48], [0, 0, 0])
  let screenContext = null
  const screenTexture = canvasTex(1200, 520, (ctx, width, height) => {
    screenContext = ctx
    drawScreen(ctx, width, height)
  })
  const screenMesh = addPlane(THREE, root, new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, depthTest: false, side: THREE.DoubleSide }), [12.3, 3.45], [0, 2.95, -4.98], [0, 0, 0]); screenMesh.name = 'dr-control-room-screen'; screenMesh.renderOrder = 20
  const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x26333a, depthTest: false })
  for (const [size, position] of [[[12.7, .12, .12], [0, 4.82, -4.9]], [[12.7, .12, .12], [0, 1.08, -4.9]], [[.12, 3.78, .12], [-6.3, 2.95, -4.9]], [[.12, 3.78, .12], [6.3, 2.95, -4.9]]]) { const bar = addBox(THREE, root, frameMaterial, size, position, false); bar.renderOrder = 10 }
  addBox(THREE, root, pale, [14.8, .1, .1], [0, 3.92, -4.45], false)
  for (let i = 0; i < 4; i++) {
    const x = -5.55 + i * 3.7
    addBox(THREE, root, warm, [3.45, .12, 1.0], [x, 1.05, -1.0])
    addBox(THREE, root, pale, [.7, .95, .85], [x - 1.1, .48, -1.0])
    addBox(THREE, root, pale, [.7, .95, .85], [x + 1.1, .48, -1.0])
    for (let monitor = 0; monitor < 2; monitor++) addBox(THREE, root, graphite, [1.2, .72, .06], [x + (monitor ? .72 : -.72), 1.65, -1.32], false)
    addOperator(THREE, root, x, i % 2 ? mat(THREE, 0xc4d8e2) : mat(THREE, 0xaec8d9))
  }
  for (const x of [-7.1, 7.0]) { addBox(THREE, root, pale, [.7, .8, .7], [x, .4, -3.25]); addBox(THREE, root, plant, [.22, .65, .22], [x, 1.1, -3.25]) }
  for (let i = 0; i < 4; i++) { const x = 8.8 + (i % 2) * 1.3, z = -2.8 + Math.floor(i / 2) * 2.1; addBox(THREE, root, blue, [.9, 1.9, .08], [x, 1.1, z]); addBox(THREE, root, orange, [.95, .08, .1], [x, 2.0, z], false) }
  const liveScreen = controlRoomLiveEnabled(search) && screenContext
    ? createControlRoomLiveScreen({
        context: screenContext,
        texture: screenTexture,
        drawStatic: drawScreen,
        isVisible: () => root.visible !== false,
        ...liveOptions,
      })
    : null
  liveScreen?.start()
  const liveApi = Object.freeze({
    start: () => liveScreen?.start(),
    stop: () => liveScreen?.stop(),
    setDemo: (provider) => liveScreen?.setDemo(provider),
    liveMetrics: () => liveScreen?.metrics() || Object.freeze({
      running: false,
      desired: false,
      uploads: 0,
      intervalMs: 0,
    }),
  })
  root.userData.controlRoomLive = liveApi
  return {
    root,
    ...liveApi,
    dispose() {
      liveScreen?.dispose()
      delete root.userData.controlRoomLive
      root.traverse(node => { if (node.geometry) node.geometry.dispose(); if (node.material) { const list = Array.isArray(node.material) ? node.material : [node.material]; list.forEach(item => { if (item.map === screenTexture) screenTexture.dispose(); item.dispose?.() }) } })
      root.removeFromParent()
    },
  }
}
