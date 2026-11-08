import { WH_R1_DATA } from './wh-r1/data.js'
import { WH_R1_VEHICLES, forkliftParts } from './dr-wh-r1-vehicles.js'
import { whToWorld, WH_R1_FLOOR_Y } from './wh-r1-layout.js'
import { WH_R1_CONVEYOR_PATH } from './dr-wh-r1-workflow.js'
import { pathPoint } from './dr-campus-motion-logic.js'
import { SHUTTLE_MAX_LIFT, shuttleFrame } from './dr-campus-shuttle-logic.js'
import { createLive2Simulation } from './wh-r1/live2-sim.js'

const SLOT_CATEGORY = '托位载荷控制体'
const BOX_COLORS = [0xb98a58, 0x6d9c91, 0xd69a50]
const pointForSlot = row => { const p = whToWorld(row.xM, row.yM); return { x: p.x, y: row.zM + .63, z: p.z } }
const setMatrix = (mesh, index, THREE, position, scale = [.72, .58, .82]) => { const object = new THREE.Object3D(); object.position.set(position.x, position.y, position.z); object.scale.set(...scale); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix) }

function combinedForkliftGeometry(THREE, rows) {
  const positions = [], normals = [], colors = []
  const add = (row, source) => {
    const geometry = source.index ? source.toNonIndexed() : source
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(row.x, row.y, row.z), new THREE.Quaternion(), new THREE.Vector3(row.sx, row.sy, row.sz))
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), color = new THREE.Color(row.color)
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix)
      const n = new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix).normalize()
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); colors.push(color.r, color.g, color.b)
    }
    geometry.dispose(); if (geometry !== source) source.dispose()
  }
  for (const row of rows) {
    const source = row.shape === 'wheel'
      ? new THREE.CylinderGeometry(.5, .5, 1, 12).rotateX(Math.PI / 2)
      : row.shape === 'steering'
        ? new THREE.TorusGeometry(.5, .1, 6, 12).rotateY(Math.PI / 2)
        : row.shape === 'lamp' ? new THREE.CylinderGeometry(.5, .5, 1, 8) : new THREE.BoxGeometry(1, 1, 1)
    add(row, source)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  return geometry
}

export function buildWhR1Live1({ THREE, root, quality, canvasTex }) {
  const group = new THREE.Group(); group.name = 'wh-r1-live1'; group.userData.dynamic = true; group.userData.noMerge = true; group.position.y = WH_R1_FLOOR_Y; root.add(group)
  const low = quality?.tier === 'low', slots = WH_R1_DATA.elements.filter(row => row.category === SLOT_CATEGORY), simulation = createLive2Simulation({ slotIds: slots.map(row => row.id), multiplier: 8 })
  const slotById = new Map(slots.map(row => [row.id, row])), cargoMeshes = [], shuttleCount = low ? 2 : 4
  if (!low) for (let type = 0; type < 3; type++) { const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: BOX_COLORS[type], roughness: .82 }), slots.length + shuttleCount); mesh.name = `wh-r1-live1-cargo-${type}`; mesh.userData = { dynamic: true, live1Inventory: true, boxType: type }; group.add(mesh); cargoMeshes.push(mesh) }
  const shuttle = new THREE.InstancedMesh(new THREE.BoxGeometry(.82, .18, 1.08), new THREE.MeshStandardMaterial({ color: 0x56636d, metalness: .35, roughness: .58 }), shuttleCount); shuttle.name = 'wh-r1-live1-shuttles'; shuttle.userData = { dynamic: true, live1Shuttles: shuttleCount }; group.add(shuttle)
  const forkliftCount = low ? 2 : 3, registeredForklifts = WH_R1_VEHICLES.filter(row => row.category === '搬运设备占位'), forkliftRows = forkliftParts()
  const forkliftRoots = Array.from({ length: forkliftCount }, (_, i) => { const row = registeredForklifts[i]; const rootNode = new THREE.Group(); rootNode.name = `wh-r1-live2-forklift-root-${i + 1}`; rootNode.userData = { dynamic: true, live2Role: 'forklift', realModel: true, collisionRadius: .7, registeredId: row?.id || null }; group.add(rootNode); return rootNode })
  const forklift = new THREE.InstancedMesh(combinedForkliftGeometry(THREE, forkliftRows), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .74 }), forkliftCount)
  forklift.name = 'wh-r1-live2-forklifts'; forklift.userData = { dynamic: true, live2Role: 'forklift', realModel: true, mergedParts: true, registeredIds: registeredForklifts.slice(0, forkliftCount).map(row => row.id) }; group.add(forklift)
  const forkliftDummy = new THREE.Object3D()
  // Staff are supplied by the registered WH-R1 staff module.  Do not create a
  // visual fallback here: a primitive fallback hides missing registration and
  // violates the requirement that LIVE-2 uses the roster's real actors.
  const staff = null
  const shuttleStates = Array.from({ length: shuttleCount }, () => ({ position: 0, target: 0, movingFrom: 0, movingAt: 0, lastAt: 0, carrying: false, occupied: [false], status: 'idle' }))
  const qcSource = whToWorld(39, 39), qc = { x: qcSource.x, y: WH_R1_FLOOR_Y + 1.05, z: qcSource.z }, sink = WH_R1_CONVEYOR_PATH[0] || qc, carried = []
  let board = null, boardTexture = null, disposed = false, dirty = true, lastBoardSecond = -1, runtimeStaff = null, runtimeVehicles = null
  if (canvasTex) {
    boardTexture = canvasTex(768, 192, (ctx, w, h) => { ctx.fillStyle = '#10252d'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d9f3e6'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('仓配仿真 · 演示', 20, 42); ctx.font = '24px sans-serif'; ctx.fillText('模拟时间 00:00 · 在库 60% · 任务 4', 20, 84); ctx.fillText('可收起 · LIVE-1', 20, 126) })
    board = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: boardTexture, transparent: true, depthWrite: false })); board.name = 'wh-r1-live1-status-board'; board.position.set(-72, 4.8, 27); board.userData = { collapsible: true, noMerge: true }; group.add(board)
    board.rotation.y = Math.PI
  }
  const updateBoard = () => {
    if (!boardTexture?.image || !boardTexture.image.getContext) return
    const state = simulation.snapshot(), second = Math.floor(state.nowMs / 1000); if (second === lastBoardSecond) return; lastBoardSecond = second
    const ctx = boardTexture.image.getContext('2d'), occupied = state.slots.filter(slot => slot.status === 'occupied').length, active = state.tasks.filter(task => task.status === 'moving').length
    ctx.fillStyle = '#10252d'; ctx.fillRect(0, 0, 768, 192); ctx.fillStyle = '#d9f3e6'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('仓配仿真 · LIVE-2', 20, 42); ctx.font = '24px sans-serif'; const queues = Object.values(state.queues || {}).reduce((sum, count) => sum + count, 0); ctx.fillText(`模拟时间 ${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')} · 在库 ${Math.round(occupied / state.slots.length * 100)}% · 在途 ${active} · 排队 ${queues}`, 20, 84); ctx.fillText(`今日入库 ${state.counters.received} · 出库 ${state.counters.shipped} · 可收起`, 20, 126); boardTexture.needsUpdate = true
  }
  const corridorPosition = (slot, progress, stage) => {
    const aisle = { x: slot.x, y: slot.y, z: slot.z + (slot.z > qc.z ? -1.15 : 1.15) }, t = Math.max(0, Math.min(1, progress))
    if (stage === 'retrieve' || stage === 'putaway') return t < .5 ? { x: slot.x, y: slot.y, z: slot.z + (aisle.z - slot.z) * t * 2 } : { x: aisle.x, y: aisle.y, z: aisle.z + (qc.z - aisle.z) * (t - .5) * 2 }
    return { x: slot.x, y: slot.y, z: slot.z }
  }
  const updateActors = state => {
    const moving = state.tasks.filter(task => task.status === 'moving'), inbound = moving.filter(task => task.kind === 'inbound' && ['arrival', 'quality', 'putaway'].includes(task.stage))
    const taskForForklift = index => inbound.find(task => { const sequence = Number(String(task.itemId || '').match(/(\d+)$/)?.[1] || 0); return sequence % forkliftCount === index })
    for (let index = 0; index < forkliftCount; index++) {
      const task = taskForForklift(index), row = task && slotById.get(task.slotId), parked = registeredForklifts[index], parkedPoint = parked && whToWorld(parked.xM, parked.yM)
      let position = parkedPoint ? { x: parkedPoint.x, y: 0, z: parkedPoint.z } : { x: qc.x, y: 0, z: qc.z }
      if (row) { const target = pointForSlot(row), p = Math.max(0, Math.min(1, (state.nowMs - (task.startedAt || state.nowMs)) / Math.max(1, (task.completeAt || state.nowMs + 1) - (task.startedAt || state.nowMs)))); position = corridorPosition(target, p, task.stage); position.y = 0 }
      forkliftRoots[index].position.set(position.x, 0, position.z); forkliftRoots[index].rotation.y = ((row?.yawDeg ?? parked?.yawDeg ?? 0) * Math.PI / 180); forkliftRoots[index].userData.stage = task?.stage || 'standby'; forkliftRoots[index].userData.taskId = task?.taskId || null
      forkliftDummy.position.set(position.x, 0, position.z); forkliftDummy.rotation.y = (row?.yawDeg ?? parked?.yawDeg ?? 0) * Math.PI / 180; forkliftDummy.scale.setScalar(1); forkliftDummy.updateMatrix(); forklift.setMatrixAt(index, forkliftDummy.matrix)
    }
    forklift.instanceMatrix.needsUpdate = true
    if (runtimeStaff?.members?.length) {
      if (staff) staff.visible = false
      runtimeStaff.members.forEach(member => { const target = member.char?.group || member.placeholder?.group; if (target) target.userData.live2Stage = state.tasks.find(task => task.stage === member.role)?.stage || 'idle' })
    }
    if (runtimeVehicles?.root?.userData?.forklifts) runtimeVehicles.root.userData.forklifts.live2State = registeredForklifts.slice(0, forkliftCount).map((row, index) => ({ id: row.id, stage: forkliftRoots[index].userData.stage, itemId: forkliftRoots[index].userData.taskId }))
  }
  const updateCargo = () => {
    if (low) return
    const rows = [[], [], []], state = simulation.snapshot(), moving = new Map(state.tasks.filter(task => task.status === 'moving').map(task => [task.slotId, task]))
    state.slots.forEach(slot => { if (slot.status === 'occupied' || slot.status === 'reserved_out') { const task = moving.get(slot.id), progress = task ? Math.max(0, Math.min(1, (state.nowMs - task.startedAt) / Math.max(1, task.completeAt - task.startedAt))) : 0; if (slot.status === 'reserved_out' && progress > .05) return; const row = slotById.get(slot.id); if (row) rows[slot.boxType].push({ position: pointForSlot(row), type: slot.boxType }) } })
    carried.forEach(item => rows[item.type].push(item))
    rows.forEach((items, type) => { const mesh = cargoMeshes[type]; items.forEach((item, index) => setMatrix(mesh, index, THREE, item.position)); mesh.count = items.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() })
  }
  const updateShuttles = () => {
    const state = simulation.snapshot(), moving = state.tasks.filter(task => task.status === 'moving'); carried.length = 0
    for (let index = 0; index < shuttleCount; index++) {
      const task = moving[index], shuttleState = shuttleStates[index]; let position = { ...qc }, lift = 0
      if (task) {
        const row = slotById.get(task.slotId), slot = row ? pointForSlot(row) : qc, progress = Math.max(0, Math.min(1, (state.nowMs - task.startedAt) / Math.max(1, task.completeAt - task.startedAt)))
        if (['retrieve', 'putaway'].includes(task.stage)) position = corridorPosition(slot, progress, task.stage)
        else if (task.stage === 'conveyor') { const p = pathPoint(WH_R1_CONVEYOR_PATH, Math.max(0, state.nowMs - task.startedAt), 1); position = { x: p.x, y: slot.y, z: p.z } }
        else position = { x: slot.x + (sink.x - slot.x) * progress, y: slot.y + (sink.y - slot.y) * progress, z: slot.z + (sink.z - slot.z) * progress }
        shuttleState.movingFrom = slot.z; shuttleState.target = sink.z; shuttleState.position = position.z; shuttleState.movingAt = task.startedAt; shuttleState.lastAt = task.startedAt; shuttleState.carrying = progress > .45; shuttleState.status = progress > .5 ? 'delivery' : 'pickup'; lift = shuttleFrame(shuttleState, state.nowMs).lift
        if (progress > .05 && progress < .98) carried.push({ type: task.boxType, position: { ...position, y: position.y + SHUTTLE_MAX_LIFT + lift } })
      }
      setMatrix(shuttle, index, THREE, { ...position, y: position.y + lift }, [.82, .18, 1.08])
    }
    shuttle.instanceMatrix.needsUpdate = true; shuttle.computeBoundingSphere()
  }
  const update = () => { const state = simulation.snapshot(); updateCargo(); updateShuttles(); updateActors(state); updateBoard(); dirty = false }
  update()
  return { root: group, simulation, cargoMeshes, shuttle, statusBoard: board, qc, sink,
    bindRuntime({ staff: nextStaff, vehicles: nextVehicles } = {}) { runtimeStaff = nextStaff || null; runtimeVehicles = nextVehicles || null; return { staff: Boolean(runtimeStaff), vehicles: Boolean(runtimeVehicles) } },
    summary: () => { const state = simulation.snapshot(); return { slots: slots.length, occupied: state.slots.filter(slot => slot.status === 'occupied').length, utilization: state.slots.filter(slot => slot.status === 'occupied').length / slots.length, activeTasks: state.tasks.filter(task => task.status === 'moving').length, shuttles: shuttleCount, quality: low ? 'low' : 'high' } },
    toggleBoard(value) { if (board) board.visible = value === undefined ? !board.visible : Boolean(value); return board?.visible ?? false },
    onFrame(dt) { if (disposed || !Number.isFinite(dt) || dt <= 0) return; simulation.advance(dt * 1000); dirty = true; if (dirty) update() },
    dispose() { if (disposed) return; disposed = true; simulation.dispose(); cargoMeshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() }); shuttle.geometry.dispose(); shuttle.material.dispose(); forklift.geometry.dispose(); forklift.material.dispose(); board?.geometry.dispose(); board?.material.dispose(); boardTexture?.dispose?.(); group.removeFromParent() },
  }
}
