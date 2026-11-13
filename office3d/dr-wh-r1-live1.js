import { WH_R1_DATA } from './wh-r1/data.js'
import { WH_R1_VEHICLES, forkliftParts } from './dr-wh-r1-vehicles.js'
import { whToWorld, WH_R1_FLOOR_Y } from './wh-r1-layout.js'
import { WH_R1_CONVEYOR_PATH } from './dr-wh-r1-workflow.js'
import { buildLive3Stations, LIVE3_STATIONS, stationPoint } from './wh-r1/live3-stations.js'
import { SHUTTLE_MAX_LIFT, shuttleFrame } from './dr-campus-shuttle-logic.js'
import { createLive3StageA, LIVE3_DEMO_WARMUP_MS, live3Board, live3ConveyorPose, live3DemonstrationSlot } from './wh-r1/live3-stage-a.js'
import { bindLive3Staff, live3PalletBox } from './wh-r1/live3-staff-motion.js'
import { createLive3StageB } from './wh-r1/live3-stage-b.js'
import { createLive3Tracking } from './wh-r1/live3-tracking.js'

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
  const low = quality?.tier === 'low', slots = WH_R1_DATA.elements.filter(row => row.category === SLOT_CATEGORY), simulation = createLive3StageA({ slotIds: slots.map(row => row.id) }), traffic = createLive3StageB()
  const stations = buildLive3Stations({ THREE, group })
  const previousCargo = root.getObjectByName?.('wh-r1-workflow-cargo')
  if (previousCargo) previousCargo.visible = false
  const beltCargo = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .84 }), 112)
  beltCargo.name = 'wh-r1-live3-belt-cargo'; beltCargo.userData.dynamic = true; group.add(beltCargo)
  const boardRegister = WH_R1_DATA.elements.find(row => row.id === 'WH-02-MON-005')
  const boardLocation = whToWorld(boardRegister.xM, boardRegister.yM)
  const boardWidth = boardRegister.lengthM, boardHeight = boardRegister.heightM
  const slotById = new Map(slots.map(row => [row.id, row])), cargoMeshes = [], shuttleCount = low ? 2 : 4
  if (!low) for (let type = 0; type < 3; type++) { const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: BOX_COLORS[type], roughness: .82 }), slots.length + shuttleCount); mesh.name = `wh-r1-live1-cargo-${type}`; mesh.userData = { dynamic: true, live1Inventory: true, boxType: type }; group.add(mesh); cargoMeshes.push(mesh) }
  const shuttle = new THREE.InstancedMesh(new THREE.BoxGeometry(.82, .18, 1.08), new THREE.MeshStandardMaterial({ color: 0x56636d, metalness: .35, roughness: .58 }), shuttleCount); shuttle.name = 'wh-r1-live1-shuttles'; shuttle.userData = { dynamic: true, live1Shuttles: shuttleCount }; group.add(shuttle)
  const forkliftCount = low ? 2 : 3, registeredForklifts = WH_R1_VEHICLES.filter(row => row.category === '搬运设备占位'), forkliftRows = forkliftParts()
  const forkliftRoots = Array.from({ length: forkliftCount }, (_, i) => { const row = registeredForklifts[i]; const rootNode = new THREE.Group(); rootNode.name = `wh-r1-live2-forklift-root-${i + 1}`; rootNode.userData = { dynamic: true, live2Role: 'forklift', realModel: true, collisionRadius: .7, registeredId: row?.id || null }; group.add(rootNode); return rootNode })
  const forklift = new THREE.InstancedMesh(combinedForkliftGeometry(THREE, forkliftRows), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .74 }), forkliftCount)
  forklift.name = 'wh-r1-live2-forklifts'; forklift.visible = false; forklift.userData = { dynamic: true, live2Role: 'forklift', realModel: true, mergedParts: true, duplicateSuppressed: true, collisionRadius: .7, registeredIds: registeredForklifts.slice(0, forkliftCount).map(row => row.id), live2State: [] }; group.add(forklift)
  const forkliftDummy = new THREE.Object3D()
  // Staff are supplied by the registered WH-R1 staff module.  Do not create a
  // visual fallback here: a primitive fallback hides missing registration and
  // violates the requirement that LIVE-2 uses the roster's real actors.
  const shuttleStates = Array.from({ length: shuttleCount }, () => ({ position: 0, target: 0, movingFrom: 0, movingAt: 0, lastAt: 0, carrying: false, occupied: [false], status: 'idle' }))
  const qcSource = whToWorld(39, 39), qc = { x: qcSource.x, y: WH_R1_FLOOR_Y + 1.05, z: qcSource.z }, sink = WH_R1_CONVEYOR_PATH[0] || qc, carried = [], forkCargo = []
  let board = null, boardTexture = null, disposed = false, lastBoardSecond = -1, runtimeStaff = null, runtimeVehicles = null, staffMotion = null, currentState = null
  const tracking = createLive3Tracking(() => currentState)
  let weightLabel = null, weightTexture = null, lastWaybill = null
  if (canvasTex) {
    boardTexture = canvasTex(768, 360, () => {})
    board = new THREE.Mesh(new THREE.PlaneGeometry(boardWidth, boardHeight), new THREE.MeshBasicMaterial({ map: boardTexture })); board.name = 'wh-r1-live1-status-board'; board.position.set(boardLocation.x, boardRegister.zM + boardHeight / 2, boardLocation.z + boardRegister.widthM / 2 + .02); board.userData = { collapsible: true, noMerge: true, sourceId: boardRegister.id }; group.add(board)
    weightTexture = canvasTex(384, 96, () => {})
    weightLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.45, .36), new THREE.MeshBasicMaterial({ map: weightTexture, side: THREE.DoubleSide }))
    const scale = stationPoint(LIVE3_STATIONS[1])
    weightLabel.name = 'wh-r1-live3-weight-label'; weightLabel.position.set(scale.x, 1.53, scale.z); weightLabel.rotation.y = Math.PI; weightLabel.visible = false
    weightLabel.userData = { noMerge: true, dynamic: true }; group.add(weightLabel)

  }
  const updateBoard = state => {
    if (!boardTexture?.image || !boardTexture.image.getContext) return
    const second = Math.floor(state.nowMs / 1000); if (second === lastBoardSecond) return; lastBoardSecond = second
    const ctx = boardTexture.image.getContext('2d'), model = live3Board(state, traffic.snapshot()), carousel = tracking.tick(state.nowMs)
    ctx.fillStyle = '#10252d'; ctx.fillRect(0, 0, 768, 360)
    ctx.fillStyle = '#d9f3e6'; ctx.font = 'bold 32px sans-serif'
    ctx.fillText('仓配运营看板 · 仿真', 20, 42)
    ctx.font = '22px sans-serif'
    ctx.fillText('今日入库 ' + model.inbound + '   今日出库 ' + model.outbound + '   在库 ' + model.inventory + '   异常待处理 ' + model.exceptions, 20, 85)
    ctx.font = '20px sans-serif'; ctx.fillText('车辆入场 ' + model.vehicleInbound + '   车辆出场 ' + model.vehicleOutbound + '   净距 ' + (model.vehicleClearanceOk ? 'OK' : 'CHECK'), 20, 112)
    ctx.fillText('期初 ' + model.opening + '   平均工序 ' + (model.averageProcessingMs / 1000).toFixed(1) + ' 秒', 20, 140)
    if (carousel) ctx.fillText('大屏轮播 · ' + carousel.waybill + ' · ' + carousel.station.label + ' · ' + carousel.progress + '%', 20, 166)
    const labels = ['收货', '质检', '上架', '取货', '拣货', '输送', '打包', '集货']
    Object.values(model.active).forEach((count, i) => {
      const x = 25 + i * 93, height = 145 * count / Math.max(5, ...Object.values(model.active))
      ctx.fillStyle = '#57c8b1'; ctx.fillRect(x, 300 - height, 52, height)
      ctx.fillStyle = '#d9f3e6'; ctx.fillText(String(count), x + 14, 292 - height)
      ctx.fillText(labels[i], x, 332)
    })
    board.userData.metrics = model
    boardTexture.needsUpdate = true

  }
  const corridorPosition = (slot, progress, stage, id) => {
    const aisle = { x: slot.x, y: slot.y, z: slot.z + (slot.z > qc.z ? -1.15 : 1.15) }, t = Math.max(0, Math.min(1, progress))
    if (live3DemonstrationSlot(id)) return { ...slot, x: slot.x - .91 * (stage === 'retrieve' ? t : 1 - t) }
    if (stage === 'retrieve' || stage === 'putaway') return t < .5 ? { x: slot.x, y: slot.y, z: slot.z + (aisle.z - slot.z) * t * 2 } : { x: aisle.x, y: aisle.y, z: aisle.z + (qc.z - aisle.z) * (t - .5) * 2 }
    return { x: slot.x, y: slot.y, z: slot.z }
  }
  const updateActors = state => {
    const inbound = state.tasks.filter(task => task.status === 'moving' && task.stage === 'arrival')
    const taskForForklift = index => inbound.find(task => { const sequence = Number(String(task.itemId || '').match(/(\d+)$/)?.[1] || 0); return sequence % forkliftCount === index })
    forkCargo.length = 0
    for (let index = 0; index < forkliftCount; index++) {
      const task = taskForForklift(index), parked = registeredForklifts[index], parkedPoint = parked && whToWorld(parked.xM, parked.yM)
      const yaw = (parked?.yawDeg ?? 0) * Math.PI / 180
      const base = parkedPoint || qc
      const fraction = task ? (state.nowMs - task.startedAt) / (task.completeAt - task.startedAt) : 0
      const travel = .48 * Math.sin(Math.PI * fraction)
      const fx = Math.sin(yaw), fz = Math.cos(yaw)
      const position = { x: base.x + fx * travel, z: base.z + fz * travel }
      forkliftRoots[index].position.set(position.x, 0, position.z); forkliftRoots[index].rotation.y = yaw; forkliftRoots[index].userData.stage = task?.stage || 'standby'; forkliftRoots[index].userData.taskId = task?.taskId || null
      forkliftDummy.position.set(position.x, 0, position.z); forkliftDummy.rotation.y = yaw; forkliftDummy.scale.setScalar(1); forkliftDummy.updateMatrix(); forklift.setMatrixAt(index, forkliftDummy.matrix)
      if (task) forkCargo.push({ task, size: [.72, .32, .72], position: { x: position.x + fx * .84, z: position.z + fz * .84, y: .08, action: 'forklift' } })
    }
    forklift.instanceMatrix.needsUpdate = true
    forklift.userData.live2State = registeredForklifts.slice(0, forkliftCount).map((row, index) => ({ id: row.id, stage: forkliftRoots[index].userData.stage, itemId: forkliftRoots[index].userData.taskId }))
    if (runtimeVehicles?.root?.userData?.forklifts) runtimeVehicles.root.userData.forklifts.live2State = registeredForklifts.slice(0, forkliftCount).map((row, index) => ({ id: row.id, stage: forkliftRoots[index].userData.stage, itemId: forkliftRoots[index].userData.taskId }))
  }
  const updateCargo = state => {
    if (low) return
    const rows = [[], [], []], moving = new Map(state.tasks.map(task => [task.slotId, task]))
    state.slots.forEach(slot => {
      if (slot.status === 'reserved_out') {
        const task = moving.get(slot.id)
        if (task && (task.stage !== 'retrieve' || task.startedAt !== null && state.nowMs - task.startedAt > (task.completeAt - task.startedAt) * .05)) return
      } else if (slot.status !== 'occupied') return
      const row = slotById.get(slot.id)
      if (row) rows[slot.boxType].push({ position: pointForSlot(row), type: slot.boxType })
    })
    carried.forEach(item => rows[item.type].push(item))
    rows.forEach((items, type) => { const mesh = cargoMeshes[type]; items.forEach((item, index) => setMatrix(mesh, index, THREE, item.position)); mesh.count = items.length; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() })
  }
  const updateShuttles = state => {
    const moving = state.tasks.filter(task => task.status === 'moving' && ['retrieve', 'putaway'].includes(task.stage))
    moving.sort((a, b) => Number(live3DemonstrationSlot(b.slotId)) - Number(live3DemonstrationSlot(a.slotId)))
    carried.length = 0
    for (let index = 0; index < shuttleCount; index++) {
      const task = moving[index], shuttleState = shuttleStates[index]; let position = { ...qc }, lift = 0
      if (task) {
        const row = slotById.get(task.slotId), slot = row ? pointForSlot(row) : qc, progress = Math.max(0, Math.min(1, (state.nowMs - task.startedAt) / Math.max(1, task.completeAt - task.startedAt)))
        if (['retrieve', 'putaway'].includes(task.stage)) position = corridorPosition(slot, progress, task.stage, task.slotId)


        shuttleState.movingFrom = slot.z; shuttleState.target = sink.z; shuttleState.position = position.z; shuttleState.movingAt = task.startedAt; shuttleState.lastAt = task.startedAt; shuttleState.carrying = progress > .45; shuttleState.status = progress > .5 ? 'delivery' : 'pickup'; lift = shuttleFrame(shuttleState, state.nowMs).lift
        if (progress > .05 && progress < .98) carried.push({ task, type: task.boxType, position: { ...position, y: position.y + SHUTTLE_MAX_LIFT + lift, action: task.stage } })
      }
      setMatrix(shuttle, index, THREE, { ...position, y: position.y + lift }, [.82, .18, 1.08])
    }
    shuttle.instanceMatrix.needsUpdate = true; shuttle.computeBoundingSphere()
  }
  const updateBeltCargo = state => {
    const rows = state.tasks.filter(task => task.status === 'moving').map(task => {
      const position = live3ConveyorPose(task, state.nowMs)
      return position && { task, position }
    }).filter(Boolean)
    rows.push(...forkCargo, ...(staffMotion?.cargo(state) || []))
    const owned = new Set(rows.map(row => row.task.itemId))
    const stacked = state.items.filter(item => item.stage === 'shipped' && !owned.has(item.itemId)).slice(-12)
    stacked.forEach((task, index) => {
      const position = { ...live3PalletBox(index), action: 'staged' }
      rows.push({ task, position })
    })
    beltCargo.count = rows.length
    beltCargo.userData.items = rows.map(({ task, position, size = [.22, .18, .22], carrierId = null }, index) => {
      setMatrix(beltCargo, index, THREE, { ...position, y: position.y + size[1] / 2 }, size)
      beltCargo.setColorAt(index, new THREE.Color(task.anomaly ? 0xc83b32 : BOX_COLORS[task.boxType]))
      return { waybill: task.waybill, action: position.action || (task.anomaly ? 'exception' : null), weightKg: task.weightKg, destination: task.destination, position, size, carrierId }
    })
    beltCargo.userData.rackCargo = low ? [] : carried.map(({ task, position }) => ({ waybill: task.waybill, action: task.stage, position, size: [.72, .58, .82] }))
    beltCargo.instanceMatrix.needsUpdate = true
    if (beltCargo.instanceColor) beltCargo.instanceColor.needsUpdate = true
    beltCargo.computeBoundingSphere()
    const weighed = rows.find(row => row.position.action === 'weigh')?.task
    if (weightLabel) {
      weightLabel.visible = Boolean(weighed)
      if (weighed && weightTexture?.image?.getContext && lastWaybill !== weighed.waybill) {
        lastWaybill = weighed.waybill
        const ctx = weightTexture.image.getContext('2d')
        ctx.fillStyle = '#14353d'; ctx.fillRect(0, 0, 384, 96)
        ctx.fillStyle = '#ebfffb'; ctx.font = 'bold 26px sans-serif'
        ctx.fillText(weighed.waybill + ' · ' + weighed.weightKg + ' kg', 12, 42)
        ctx.font = '22px sans-serif'; ctx.fillText(weighed.destination + ' · 称重', 12, 76)
        weightTexture.needsUpdate = true
      }
    }
  }
  const update = (dt = 0) => {
    const state = currentState = simulation.snapshot()
    traffic.advance(dt * 1000)
    const trafficState = traffic.snapshot()
    runtimeVehicles?.applyMotion?.(trafficState)
    if (runtimeVehicles?.root?.userData) runtimeVehicles.root.userData.traffic = trafficState
    updateShuttles(state); updateCargo(state); updateActors(state)
    if (!state.paused) staffMotion?.update(state, dt, slotById, carried)
    if (!staffMotion) updateBeltCargo(state)
    updateBoard(state)
  }
  simulation.advance(LIVE3_DEMO_WARMUP_MS)
  traffic.advance(LIVE3_DEMO_WARMUP_MS)
  update()
  const pickCargo = id => tracking.select(id)
  return { root: group, simulation, traffic, tracking, cargoMeshes, shuttle, statusBoard: board, qc, sink, pickCargo,
    bindRuntime({ staff: nextStaff, vehicles: nextVehicles } = {}) {
      runtimeStaff = nextStaff || null; runtimeVehicles = nextVehicles || null
      runtimeStaff?.requireRealistic?.()
      staffMotion = bindLive3Staff(runtimeStaff)
      if (staffMotion) runtimeStaff.afterSolve = () => updateBeltCargo(currentState)
      return { staff: Boolean(runtimeStaff), vehicles: Boolean(runtimeVehicles) }
    },
    summary: () => { const state = simulation.snapshot(), road = traffic.snapshot(); return { slots: slots.length, occupied: state.slots.filter(slot => slot.status === 'occupied').length, utilization: state.slots.filter(slot => slot.status === 'occupied').length / slots.length, activeTasks: state.tasks.filter(task => task.status === 'moving').length, shuttles: shuttleCount, quality: low ? 'low' : 'high', traffic: road, tracking: tracking.summary() } },
    toggleBoard(value) { if (board) board.visible = value === undefined ? !board.visible : Boolean(value); return board?.visible ?? false },
    onFrame(dt) { if (disposed || !Number.isFinite(dt) || dt <= 0) return; simulation.advance(dt * 1000); update(dt) },
    dispose() { if (disposed) return; disposed = true; simulation.dispose(); stations.dispose(); beltCargo.geometry.dispose(); beltCargo.material.dispose(); beltCargo.dispose(); if (previousCargo) previousCargo.visible = true; cargoMeshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() }); shuttle.geometry.dispose(); shuttle.material.dispose(); forklift.geometry.dispose(); forklift.material.dispose(); board?.geometry.dispose(); board?.material.dispose(); boardTexture?.dispose?.(); weightLabel?.geometry.dispose(); weightLabel?.material.dispose(); weightTexture?.dispose?.(); group.removeFromParent() },
  }
}
