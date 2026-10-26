import { confirmedEvents, conveyorLoop, createDemoCampusEventSource, createMotionClock, forkliftPath, pathPoint, routePointAt, truckPlan } from './dr-campus-motion-logic.js'

export function buildCampusMotion({ THREE, root, layout, quality, eventSource, now, search = globalThis.location?.search || '' }) {
  const low = quality?.tier === 'low'
  const enabled = new URLSearchParams(search).get('campusMotion') !== '0'
  const group = new THREE.Group()
  group.name = 'campus-motion'
  group.userData.dynamic = !low
  if (low) {
    const lifecycle = new THREE.Object3D()
    lifecycle.name = 'campus-motion-lifecycle'
    group.add(lifecycle)
  }
  root.add(group)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ roughness: .72, metalness: .18 })
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler()
  const vector = new THREE.Vector3(), scale = new THREE.Vector3()
  const forklift = forkliftPath(layout), trucks = truckPlan(layout), belts = conveyorLoop(layout)
  const b3Workstations = root.userData.b3Workstations
  const externalConveyors = Boolean(b3Workstations)
  const b3Path = b3Workstations?.conveyorPath
  const pieces = [[], [], []]
  const add = (batch, kind, index, x, y, z, sx, sy, sz, color) => pieces[batch].push({ kind, index, x, y, z, sx, sy, sz, color })
  for (let i = 0; i < (low ? 1 : 2); i++) {
    add(0, 'forklift', i, 0, .65, 0, 1.1, .75, 1.4, 0xe4a844)
    add(0, 'forklift', i, 0, 1.55, -.25, .9, .14, 1, 0x34404a)
    for (const x of [-.4, .4]) {
      add(0, 'forklift', i, x, 1.1, -.6, .1, .9, .1, 0x34404a)
      add(0, 'forklift', i, x, .65, .85, .08, 1.2, .12, 0x34404a)
      add(0, 'forklift', i, x, .15, 1.2, .12, .08, .7, 0x34404a)
      for (const z of [-.5, .5]) add(0, 'forklift', i, x * 1.4, .3, z, .18, .45, .38, 0x242b30)
    }
  }
  for (let i = 0; i < (low ? 2 : trucks.length); i++) {
    add(1, 'truck', i, 0, 1.35, 0, 2.55, 2.3, 9, 0xdce2df)
    add(1, 'truck', i, 0, .9, 4.2, 2.55, 1.7, .9, 0x426979)
    add(1, 'truck', i, 0, 1.4, 4.65, 1.95, .65, .06, 0x1b2d35)
    for (const x of [-1.15, 1.15]) for (const z of [-3.6, -1.2, 1.2, 3.6]) add(1, 'truck', i, x, .35, z, .3, .6, .7, 0x252c31)
  }
  if (!externalConveyors) for (let i = 0; i < 2; i++) {
    const path = belts[i], width = path[1].x - path[0].x
    add(2, 'fixed', i, (path[0].x + path[1].x) / 2, .58, path[0].z + .45, width + .6, .22, 1.5, 0x4a6870)
    for (let j = 0; j < 6; j++) add(2, 'cargo', i * 6 + j, 0, .92, 0, .65, .55, .6, 0xbc9560)
  }
  if (externalConveyors) for (let i = 0; i < (low ? 2 : 4); i++) {
    add(2, 'b3-cargo', i, 0, b3Workstations.conveyorSurfaceY + .24, 0, .56, .48, .48, 0xbc9560)
  }
  const batches = [pieces.flat()]
  const meshes = batches.map((items, i) => {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length)
    mesh.name = `campus-motion-${i}`
    mesh.userData.qualityProxy = true
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    items.forEach((item, index) => mesh.setColorAt(index, new THREE.Color(item.color)))
    group.add(mesh)
    return mesh
  })
  let sourceTime = 0
  const source = eventSource || createDemoCampusEventSource({ now: () => typeof now === 'function' ? now() : sourceTime, seed: 2606 })
  const motionClock = createMotionClock(), seen = new Set(), pending = []
  const unsubscribe = source.subscribe((event) => { if (pending.length < 200) pending.push(event) })
  let failed = false, paused = false, epoch = 0, lastEvent = null, disposed = false
  let lastSource = null, activeTruckIndex = null
  const lanes = new Set()
  const truckOffsets = trucks.map(() => 1)
  let truckStart = 1
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4()
  const bounds = new THREE.Box3(new THREE.Vector3(layout.campus.x0, 0, layout.campus.z0), new THREE.Vector3(layout.campus.x1, 6, layout.campus.z1))
  function draw(elapsed) {
    const forkliftEnabled = lanes.has('forklift_move')
    const conveyorEnabled = lanes.has('conveyor_tick')
    const truckEvent = lastEvent
    const activeTruck = truckEvent?.index ?? -1
    const truckProgress = truckEvent ? Math.max(0, Math.min(1, (elapsed - epoch) / 3200)) : 0
    const positions = [pathPoint(forklift, forkliftEnabled ? elapsed : 0), pathPoint(forklift, forkliftEnabled ? elapsed + 10000 : 10000)]
    batches.forEach((items, batch) => {
      items.forEach((item, index) => {
        let x = item.x, z = item.z, angle = 0
        if (item.kind === 'forklift') {
          const p = positions[item.index]
          angle = p.angle
          x = p.x + item.x * Math.cos(angle) + item.z * Math.sin(angle)
          z = p.z - item.x * Math.sin(angle) + item.z * Math.cos(angle)
        } else if (item.kind === 'truck') {
          const dock = trucks[item.index]
          const target = truckEvent?.type === 'truck_depart' ? 0 : 1
          const progress = item.index === activeTruck && !low ? truckStart + (target - truckStart) * truckProgress : truckOffsets[item.index]
          truckOffsets[item.index] = progress
          const p = routePointAt(dock.route, progress)
          angle = p.angle + (dock.reverseSegments.includes(p.segment) ? Math.PI : 0)
          x = p.x + item.x * Math.cos(angle) + item.z * Math.sin(angle)
          z = p.z - item.x * Math.sin(angle) + item.z * Math.cos(angle)
        } else if (item.kind === 'cargo') {
          const p = pathPoint(belts[Math.floor(item.index / 6)], (conveyorEnabled ? elapsed : 0) + item.index % 6 * 2300, 1)
          x = p.x; z = p.z; angle = p.angle
        } else if (item.kind === 'b3-cargo') {
          const p = pathPoint(b3Path, (conveyorEnabled ? elapsed : 0) + item.index * 3100, 1.2)
          x = p.x; z = p.z; angle = p.angle
        }
        quaternion.setFromEuler(euler.set(0, angle, 0))
        meshes[batch].setMatrixAt(index, matrix.compose(vector.set(x, item.y, z), quaternion, scale.set(item.sx, item.sy, item.sz)))
      })
      meshes[batch].instanceMatrix.needsUpdate = true
    })
  }
  draw(0)
  const hidden = () => { motionClock.reset() }
  globalThis.document?.addEventListener('visibilitychange', hidden)
  function onFrame(dt, context = {}) {
    if (failed) return
    try {
      sourceTime += Math.max(0, Number.isFinite(dt) ? dt * 1000 : 0)
      const snapshot = source.advance?.() || source.snapshot()
      const confirmed = confirmedEvents([...(snapshot.events || []), ...pending.splice(0)], snapshot.at)
      let inView = true
      if (context.camera) {
        context.camera.updateMatrixWorld()
        projection.multiplyMatrices(context.camera.projectionMatrix, context.camera.matrixWorldInverse)
        frustum.setFromProjectionMatrix(projection)
        inView = frustum.intersectsBox(bounds)
      }
      const allowed = !low && quality?.tier !== 'low' && enabled && !paused && !globalThis.document?.hidden && group.visible && root.visible && inView
      if (lastSource !== null && (snapshot.at < lastSource || snapshot.at - lastSource > 200)) motionClock.reset()
      lastSource = snapshot.at
      const elapsed = motionClock.update(snapshot.at, allowed)
      for (const event of confirmed) if (!seen.has(event.id)) {
        const truckIndex = trucks.findIndex(dock => dock.id === event.dockId)
        if (['truck_arrive', 'truck_depart'].includes(event.type) &&
            (truckIndex < 0 || (activeTruckIndex !== null && truckIndex !== activeTruckIndex && elapsed - epoch < 3200))) continue
        seen.add(event.id); lanes.add(event.type)
        if (allowed && ['truck_arrive', 'truck_depart'].includes(event.type)) {
          activeTruckIndex = truckIndex
          lastEvent = { ...event, index: truckIndex }
          truckStart = truckOffsets[truckIndex] ?? 1
          epoch = elapsed
        }
      }
      while (seen.size > 200) seen.delete(seen.values().next().value)
      if (allowed) draw(elapsed)
      group.userData.progress = { synthetic: true, sourceMs: snapshot.at, animationMs: elapsed, events: seen.size, paused: !allowed }
    } catch { failed = true; group.userData.failed = true }
  }
  return {
    root: group, onFrame, setPaused(value) { paused = value === true; motionClock.reset() },
    summary: () => ({ calls: low ? 0 : 1, triangles: pieces.reduce((sum, items) => sum + items.length * 12, 0), low, enabled, failed, ...group.userData.progress }),
    dispose() {
      if (disposed) return
      disposed = true; failed = true
      unsubscribe?.(); globalThis.document?.removeEventListener('visibilitychange', hidden); geometry.dispose(); material.dispose(); group.removeFromParent()
    },
  }
}
