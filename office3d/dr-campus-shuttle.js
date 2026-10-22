import { createMotionClock } from './dr-campus-motion-logic.js'
import {
  applyShuttleEvent,
  confirmedShuttleEvents,
  createDemoShuttleEventSource,
  initialShuttleState,
  palletCount,
  SHUTTLE_MAX_LIFT,
  shuttleFrame,
  shuttlePlan,
} from './dr-campus-shuttle-logic.js'

const COLORS = Object.freeze({
  blue: 0x27598c,
  blueDark: 0x183b60,
  orange: 0xe8832a,
  gold: 0xd5af62,
  steel: 0xa4abb2,
  wheel: 0x34383c,
  sensor: 0x15212a,
  green: 0x61df72,
  yellow: 0xf0c63c,
  pallet: 0xb98b50,
  cargo: 0xd8c5a5,
})

export const CAMPUS_SHUTTLE_SPEC = Object.freeze({
  slabTop: .18,
  sleeperTop: .26,
  railTop: .5,
  wheel: .7,
  body: .82,
  deck: .93,
  lift: 1.02,
  pallet: 1.18,
  wheelRadius: .2,
  maxLift: SHUTTLE_MAX_LIFT,
  bodyWidth: 1.72,
  bodyLength: 1.55,
  palletWidth: 1.2,
  palletLength: 1,
})
const HEIGHTS = CAMPUS_SHUTTLE_SPEC

function createWarningTexture(canvasTex) {
  if (typeof canvasTex !== 'function') return null
  return canvasTex(256, 128, (ctx, width, height) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width / 2, height)
    ctx.fillStyle = '#171a1d'
    ctx.fillRect(width / 2, 0, width / 2, height)
    ctx.strokeStyle = '#f0c63c'
    ctx.lineWidth = 18
    for (let x = width / 2 - height; x < width + height; x += 36) {
      ctx.beginPath()
      ctx.moveTo(x, height)
      ctx.lineTo(x + height, 0)
      ctx.stroke()
    }
  })
}

function geometryBuilder(THREE, plan, low) {
  const parts = [], ranges = {}
  const color = value => new THREE.Color(value)
  const add = (geometry, role, tint, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, warning = false) => {
    const source = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    geometry.dispose()
    const object = new THREE.Object3D()
    object.position.set(x, y, z); object.scale.set(sx, sy, sz); object.rotation.set(rx, ry, rz); object.updateMatrix()
    source.applyMatrix4(object.matrix)
    const count = source.attributes.position.count, colors = new Float32Array(count * 3)
    const shade = color(tint)
    for (let index = 0; index < count; index++) colors.set([shade.r, shade.g, shade.b], index * 3)
    source.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const uv = source.attributes.uv
    if (uv) for (let index = 0; index < uv.count; index++) {
      if (warning) uv.setXY(index, .5 + uv.getX(index) * .5, uv.getY(index))
      else uv.setXY(index, .2, .5)
    }
    parts.push({ geometry: source, role })
  }
  const box = (role, tint, x, y, z, w, h, d, warning = false, ry = 0) =>
    add(new THREE.BoxGeometry(w, h, d), role, tint, x, y, z, 1, 1, 1, 0, ry, 0, warning)
  const cyl = (role, tint, x, y, z, radius, depth) =>
    add(new THREE.CylinderGeometry(radius, radius, depth, low ? 8 : 14), role, tint, x, y, z, 1, 1, 1, 0, 0, Math.PI / 2)
  const carZ = plan.slots[0].z, x = plan.centerX
  box('car', COLORS.blue, x, HEIGHTS.body, carZ, 1.72, .2, 1.55)
  box('car', COLORS.blueDark, x, HEIGHTS.deck, carZ, 1.28, .08, 1.12)
  for (const end of [-1, 1]) {
    box('car', COLORS.orange, x, HEIGHTS.body + .01, carZ + end * .82, 1.58, .24, .18)
    for (const side of [-1, 1]) box('car', COLORS.orange, x + side * .74, HEIGHTS.body + .02, carZ + end * .72, .18, .26, .28, false, end * side * .18)
  }
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) cyl('car', COLORS.wheel, x + side * .7, HEIGHTS.wheel, carZ + end * .52, .2, .16)
    box('car', COLORS.gold, x + side * .86, HEIGHTS.body + .07, carZ, .025, .035, 1.02)
    box('car', COLORS.gold, x + side * .86, HEIGHTS.body + .07, carZ + .48, .025, .035, .34, false, side * .22)
  }
  box('car', 0xffffff, x + .87, HEIGHTS.body - .03, carZ + .38, .03, .1, .48, true)
  for (const z of [-.34, .16]) box('car', COLORS.sensor, x - .87, HEIGHTS.body + .06, carZ + z, .045, .15, .18)
  box('indicator', COLORS.green, x + .875, HEIGHTS.body + .08, carZ - .48, .05, .14, .14)
  for (const side of [-1, 1]) box('lift', COLORS.orange, x + side * .38, HEIGHTS.lift, carZ, .16, .1, 1.22)
  const pallet = (role, px, pz) => {
    const y = HEIGHTS.pallet
    for (const dx of [-.46, 0, .46]) box(role, COLORS.pallet, px + dx, y, pz, .25, .12, 1)
    for (const dz of [-.38, .38]) box(role, COLORS.pallet, px, y - .09, pz + dz, 1.2, .08, .12)
    box(role, COLORS.cargo, px, y + .36, pz, 1.05, .58, .86)
  }
  pallet('top', x, carZ)
  plan.slots.forEach((slot, index) => pallet(`slot-${index}`, slot.x, slot.z))

  const attributes = ['position', 'normal', 'uv', 'color']
  const merged = new THREE.BufferGeometry(), totals = Object.fromEntries(attributes.map(name => [name, 0]))
  for (const part of parts) for (const name of attributes) totals[name] += part.geometry.attributes[name].array.length
  for (const name of attributes) {
    const size = name === 'uv' ? 2 : 3, values = new Float32Array(totals[name])
    let offset = 0, vertex = 0
    for (const part of parts) {
      const array = part.geometry.attributes[name].array
      values.set(array, offset)
      if (name === 'position') {
        const count = part.geometry.attributes.position.count
        if (!ranges[part.role]) ranges[part.role] = []
        ranges[part.role].push({ start: vertex, count })
        vertex += count
      }
      offset += array.length
    }
    merged.setAttribute(name, new THREE.BufferAttribute(values, size))
  }
  parts.forEach(part => part.geometry.dispose())
  merged.computeBoundingSphere()
  return { geometry: merged, ranges, carZ }
}

function buildRails(THREE, root, plan) {
  const group = new THREE.Group()
  group.name = 'campus-shuttle-static'
  const material = new THREE.MeshStandardMaterial({ color: COLORS.steel, roughness: .55, metalness: .72 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b5157, roughness: .76, metalness: .42 })
  const length = plan.path.z1 - plan.path.z0 + 1.6, centerZ = (plan.path.z0 + plan.path.z1) / 2
  plan.rails.forEach((x, railIndex) => {
    for (const [part, w, h, y] of [['lower', .28, .05, .285], ['web', .08, .14, .38], ['upper', .24, .05, .475]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, length), material)
      mesh.name = `campus-shuttle-rail-${railIndex + 1}-${part}`
      mesh.position.set(x, y, centerZ); group.add(mesh)
    }
  })
  let sleeperIndex = 0
  for (let z = plan.path.z0 - .6; z <= plan.path.z1 + .6; z += 1.15) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(2, .08, .15), dark)
    sleeper.name = `campus-shuttle-sleeper-${++sleeperIndex}`
    sleeper.position.set(plan.centerX, .22, z); group.add(sleeper)
  }
  root.add(group)
  return { group, materials: [material, dark] }
}

export function buildCampusShuttle({ THREE, root, layout, quality, canvasTex, eventSource, now,
  search = globalThis.location?.search || '' }) {
  const plan = shuttlePlan(layout), low = quality?.tier === 'low'
  const enabled = new URLSearchParams(search).get('campusMotion') !== '0'
  const staticParts = buildRails(THREE, root, plan)
  const group = new THREE.Group()
  group.name = 'campus-shuttle'
  group.userData.dynamic = !low
  group.userData.spec = CAMPUS_SHUTTLE_SPEC
  root.add(group)
  const texture = low ? null : createWarningTexture(canvasTex)
  const built = geometryBuilder(THREE, plan, low)
  const material = new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: .62, metalness: .34 })
  const mesh = new THREE.Mesh(built.geometry, material)
  mesh.name = 'campus-shuttle-vehicle'
  mesh.userData.qualityProxy = true
  mesh.frustumCulled = false
  if (low) staticParts.group.add(mesh)
  else group.add(mesh)
  if (low) {
    const lifecycle = new THREE.Object3D()
    lifecycle.name = 'campus-shuttle-lifecycle'
    group.add(lifecycle)
  }
  const basePositions = built.geometry.attributes.position.array.slice()
  const colors = built.geometry.attributes.color
  const sourceEpoch = typeof now === 'function' ? now() : 0
  let fallbackTime = 0
  const source = eventSource || createDemoShuttleEventSource({
    now: () => typeof now === 'function' ? Math.max(0, now() - sourceEpoch) : fallbackTime,
    seed: 1212,
    plan,
  })
  const pending = [], queued = new Map(), seen = new Set(), clock = createMotionClock()
  const unsubscribe = source.subscribe(event => { if (pending.length < 200) pending.push(event) })
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4()
  const bounds = new THREE.Box3(new THREE.Vector3(plan.strip.x0, 0, plan.strip.z0), new THREE.Vector3(plan.strip.x1, 2, plan.strip.z1))
  let state = initialShuttleState(plan), paused = false, failed = false, disposed = false, lastSource = null
  let playbackSource = null, playbackAnimation = null
  function translate(role, dx, dy, dz, visible = true) {
    for (const range of built.ranges[role] || []) for (let vertex = range.start; vertex < range.start + range.count; vertex++) {
      const offset = vertex * 3
      built.geometry.attributes.position.array[offset] = basePositions[offset] + dx
      built.geometry.attributes.position.array[offset + 1] = visible ? basePositions[offset + 1] + dy : -8
      built.geometry.attributes.position.array[offset + 2] = basePositions[offset + 2] + dz
    }
  }
  function setIndicator(status) {
    const value = new THREE.Color(status === 'pickup' ? COLORS.yellow : status === 'delivery' ? COLORS.orange : COLORS.green)
    for (const range of built.ranges.indicator || []) for (let vertex = range.start; vertex < range.start + range.count; vertex++) {
      colors.setXYZ(vertex, value.r, value.g, value.b)
    }
    colors.needsUpdate = true
  }
  function draw(time) {
    const frame = shuttleFrame(state, time), dz = frame.position - built.carZ
    translate('car', 0, 0, dz)
    translate('indicator', 0, 0, dz)
    translate('lift', 0, frame.lift, dz)
    translate('top', 0, frame.lift, dz, frame.carrying)
    frame.occupied.forEach((occupied, index) => translate(`slot-${index}`, 0, 0, 0, occupied))
    setIndicator(frame.status)
    built.geometry.attributes.position.needsUpdate = true
    group.userData.pallets = { total: palletCount(frame), occupied: [...frame.occupied], carrying: frame.carrying }
    group.userData.shuttle = { position: frame.position, lift: frame.lift, status: frame.status }
  }
  draw(0)
  const reset = () => clock.reset()
  globalThis.document?.addEventListener('visibilitychange', reset)
  function onFrame(dt, context = {}) {
    if (failed) return
    try {
      fallbackTime += Math.max(0, Number.isFinite(dt) ? dt * 1000 : 0)
      const snapshot = source.advance?.() || source.snapshot()
      let inView = true
      if (context.camera) {
        context.camera.updateMatrixWorld()
        projection.multiplyMatrices(context.camera.projectionMatrix, context.camera.matrixWorldInverse)
        frustum.setFromProjectionMatrix(projection)
        inView = frustum.intersectsBox(bounds)
      }
      const allowed = !low && quality?.tier !== 'low' && enabled && !paused &&
        !globalThis.document?.hidden && group.visible && root.visible && inView
      if (lastSource !== null && (snapshot.at < lastSource || snapshot.at - lastSource > 200)) clock.reset()
      lastSource = snapshot.at
      const animationTime = clock.update(snapshot.at, allowed)
      const confirmed = confirmedShuttleEvents([...(snapshot.events || []), ...pending.splice(0)], snapshot.at, plan)
      for (const event of confirmed) if (!seen.has(event.id) && !queued.has(event.id)) queued.set(event.id, event)
      while (queued.size > 200) queued.delete(queued.keys().next().value)
      if (allowed && queued.size) {
        const events = [...queued.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
        let anchored = false
        if (playbackSource === null) {
          playbackSource = events[0].at
          playbackAnimation = animationTime
          anchored = true
        }
        for (const event of anchored ? [] : events) {
          const scheduledAt = playbackAnimation + event.at - playbackSource
          if (scheduledAt > animationTime) break
          state = applyShuttleEvent(state, { ...event, at: scheduledAt }, plan)
          seen.add(event.id)
          queued.delete(event.id)
        }
        if (!queued.size) {
          playbackSource = null
          playbackAnimation = null
        }
      }
      while (seen.size > 200) seen.delete(seen.values().next().value)
      if (allowed) draw(animationTime)
      group.userData.progress = { synthetic: true, sourceMs: snapshot.at, animationMs: animationTime,
        events: seen.size, queued: queued.size, paused: !allowed }
    } catch {
      failed = true
      group.userData.failed = true
    }
  }
  return {
    root: group,
    onFrame,
    setPaused(value) { paused = value === true; clock.reset() },
    summary: () => ({
      calls: low ? 0 : 1,
      triangles: low ? 0 : (built.geometry.index?.count || built.geometry.attributes.position.count) / 3,
      vehicles: 1,
      pallets: group.userData.pallets?.total ?? 2,
      low,
      enabled,
      failed,
      ...group.userData.progress,
    }),
    dispose() {
      if (disposed) return
      disposed = true; failed = true
      unsubscribe?.()
      globalThis.document?.removeEventListener('visibilitychange', reset)
      built.geometry.dispose(); material.dispose(); texture?.dispose?.()
      staticParts.materials.forEach(value => value.dispose())
      staticParts.group.traverse(item => { if (item.isMesh && item !== mesh) item.geometry.dispose() })
      staticParts.group.removeFromParent(); group.removeFromParent()
    },
  }
}
