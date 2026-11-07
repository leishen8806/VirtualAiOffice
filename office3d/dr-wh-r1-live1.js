import { WH_R1_DATA } from './wh-r1/data.js'
import { WH_R1_VEHICLES, forkliftParts } from './dr-wh-r1-vehicles.js'
import { whToWorld, WH_R1_FLOOR_Y } from './wh-r1-layout.js'
import { WH_R1_CONVEYOR_PATH } from './dr-wh-r1-workflow.js'
import { SHUTTLE_MAX_LIFT, shuttleFrame } from './dr-campus-shuttle-logic.js'
import { createLive2Simulation } from './wh-r1/live2-sim.js'

const SLOT_CATEGORY = '托位载荷控制体'
const BOX_COLORS = [0xb98a58, 0x6d9c91, 0xd69a50]
const pointForSlot = row => { const p = whToWorld(row.xM, row.yM); return { x: p.x, y: row.zM + .63, z: p.z } }
const setMatrix = (mesh, index, THREE, position, scale = [.72, .58, .82]) => { const object = new THREE.Object3D(); object.position.set(position.x, position.y, position.z); object.scale.set(...scale); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix) }

export function buildWhR1Live1({ THREE, root, quality, canvasTex }) {
  const group = new THREE.Group(); group.name = 'wh-r1-live1'; group.userData.dynamic = true; group.userData.noMerge = true; group.position.y = WH_R1_FLOOR_Y; root.add(group)
  const low = quality?.tier === 'low', slots = WH_R1_DATA.elements.filter(row => row.category === SLOT_CATEGORY), simulation = createLive2Simulation({ slotIds: slots.map(row => row.id), multiplier: 8 })
  const slotById = new Map(slots.map(row => [row.id, row])), cargoMeshes = [], shuttleCount = low ? 2 : 4
  if (!low) for (let type = 0; type < 3; type++) { const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: BOX_COLORS[type], roughness: .82 }), slots.length + shuttleCount); mesh.name = `wh-r1-live1-cargo-${type}`; mesh.userData = { dynamic: true, live1Inventory: true, boxType: type }; group.add(mesh); cargoMeshes.push(mesh) }
  const shuttle = new THREE.InstancedMesh(new THREE.BoxGeometry(.82, .18, 1.08), new THREE.MeshStandardMaterial({ color: 0x56636d, metalness: .35, roughness: .58 }), shuttleCount); shuttle.name = 'wh-r1-live1-shuttles'; shuttle.userData = { dynamic: true, live1Shuttles: shuttleCount }; group.add(shuttle)
  const forkliftCount = low ? 2 : 3, forkliftRoots = Array.from({ length: forkliftCount }, (_, i) => { const rootNode = new THREE.Group(); rootNode.name = `wh-r1-live2-forklift-root-${i + 1}`; rootNode.userData = { dynamic: true, live2Role: 'forklift', realModel: true, collisionRadius: .7 }; group.add(rootNode); return rootNode })
  const forkliftRows = forkliftParts(), forkliftMeshes = new Map(), forkliftDummy = new THREE.Object3D()
  for (const partName of [...new Set(forkliftRows.map(row => row.part))]) { const rows = forkliftRows.filter(row => row.part === partName), mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: rows[0].color, roughness: .74 }), forkliftCount); mesh.name = `wh-r1-live2-forklift-${partName}`; mesh.userData = { dynamic: true, live2Role: 'forklift', realModelPart: partName }; group.add(mesh); forkliftMeshes.set(partName, { mesh, rows: rows[0] }) }
  const staff = low ? null : new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .18, 1.08, 8), new THREE.MeshStandardMaterial({ color: 0x496f83, roughness: .88 }), 12); if (staff) { staff.name = 'wh-r1-live2-staff'; staff.userData = { dynamic: true, live2Role: 'warehouse-staff', displayOnly: true }; group.add(staff) }
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
    const object = new THREE.Object3D()
    for (let index = 0; index < forkliftCount; index++) { const task = inbound[index % Math.max(1, inbound.length)], row = task && slotById.get(task.slotId); let position = { x: qc.x, y: WH_R1_FLOOR_Y + .38, z: qc.z }; if (row) { const target = pointForSlot(row), p = Math.max(0, Math.min(1, (state.nowMs - (task.startedAt || state.nowMs)) / Math.max(1, (task.completeAt || state.nowMs + 1) - (task.startedAt || state.nowMs)))); position = corridorPosition(target, p, task.stage); position.y = WH_R1_FLOOR_Y + .38 } forkliftRoots[index].position.set(position.x, position.y, position.z); forkliftRoots[index].userData.stage = task?.stage || 'idle'; for (const { mesh, rows: part } of forkliftMeshes.values()) { forkliftDummy.position.set(position.x + part.x, position.y + part.y - .38, position.z + part.z); forkliftDummy.scale.set(part.sx, part.sy, part.sz); forkliftDummy.updateMatrix(); mesh.setMatrixAt(index, forkliftDummy.matrix) } }
    for (const { mesh } of forkliftMeshes.values()) { mesh.instanceMatrix.needsUpdate = true }
    const roles = [{ x: qc.x, z: qc.z }, { x: qc.x + 2, z: qc.z }, { x: -111, z: -1 }, { x: -116, z: -1 }, { x: -120, z: -1 }, { x: -112, z: 5 }, { x: -118, z: 5 }, { x: -108, z: 5 }, { x: -102, z: 5 }, { x: -92, z: 2 }, { x: -86, z: 2 }, { x: -98, z: 8 }]
    if (runtimeStaff?.members?.length) {
      if (staff) staff.visible = false
      runtimeStaff.members.forEach((member, index) => { const p = roles[index % roles.length], target = member.char?.group || member.placeholder?.group; if (target) { target.position.x = p.x; target.position.y = WH_R1_FLOOR_Y; target.position.z = p.z; target.userData.live2Stage = state.tasks.find(task => task.stage === member.role)?.stage || 'idle' } })
    } else if (staff) { staff.visible = true; roles.forEach((p, index) => { const actor = new THREE.Object3D(); actor.position.set(p.x, WH_R1_FLOOR_Y + .62, p.z); actor.updateMatrix(); staff.setMatrixAt(index, actor.matrix) }); staff.instanceMatrix.needsUpdate = true }
    if (runtimeVehicles?.root?.userData?.forklifts) runtimeVehicles.root.userData.forklifts.live2State = inbound.slice(0, forkliftCount).map((task, index) => ({ id: WH_R1_VEHICLES.filter(row => row.category === '搬运设备占位')[index]?.id || `forklift-${index + 1}`, stage: task?.stage || 'idle', itemId: task?.itemId || null }))
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
        position = ['retrieve', 'putaway'].includes(task.stage) ? corridorPosition(slot, progress, task.stage) : { x: slot.x + (sink.x - slot.x) * progress, y: slot.y + (sink.y - slot.y) * progress, z: slot.z + (sink.z - slot.z) * progress }
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
    dispose() { if (disposed) return; disposed = true; simulation.dispose(); cargoMeshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() }); shuttle.geometry.dispose(); shuttle.material.dispose(); for (const { mesh } of forkliftMeshes.values()) { mesh.geometry.dispose(); mesh.material.dispose() }; staff?.geometry.dispose(); staff?.material.dispose(); board?.geometry.dispose(); board?.material.dispose(); boardTexture?.dispose?.(); group.removeFromParent() },
  }
}
