import * as THREE from './vendor/three/three.module.js'
import { createR1Navigation, R1_RESERVED_SEATS, R1_PUBLIC_TRANSITIONS } from './office-r1-navigation.js'
const stationName = v => v.data?.name || v.name
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const smooth = t => t * t * (3 - 2 * t)
const clamp = n => Math.max(0, Math.min(1, n))

// R1 owns its lifecycle; no L2B routes, meetingAccess, or legacy phase mutations.
export function createR1Director({ views, layer, project, layout, furnitureCollision: collision, r1Furniture: furniture, r1Doors: doors }) {
  if (!collision?.navigationBodies || !furniture?.moveChair || !doors?.records) throw new Error('R1 movement requires real collision, furniture and doors')
  const nav = createR1Navigation(layout), actions = new Set(), pending = [], chairMoves = new Map(), bubbles = new Set(), history = []
  const doorBodies = [], activeDoors = new Set(), publicTransitions = new Map(), geometry = new THREE.BoxGeometry(1, 1, 1)
  let elapsed = 0, planningMs = 0, blockedFrames = 0, preparationError = null, chairsMoving = false
  for (const row of doors.records) {
    const p = doors.positionAt(row, doors.doors.state(row.id).progress), mesh = new THREE.Mesh(geometry)
    mesh.name = `r1-navigation-door-${row.id}`; mesh.userData.r1Door = row.doorId; mesh.userData.r1Id = row.id
    mesh.position.set(p.x, row.height / 2, p.z); mesh.scale.set(row.vertical ? row.thickness : row.width, row.height, row.vertical ? row.width : row.thickness)
    collision.add(mesh, 'r1-moving-door'); doorBodies.push({ row, mesh, p })
  }
  nav.attach(collision)
  const ready = nav.prepare().catch(error => { preparationError = error.message; console.error('R1 navigation:', error.message) })
  const anchor = v => v.r1Position || v.home
  const countAway = () => [...views.values()].filter(v => !v.away && (v.r1AwayFromDesk || v.act && v.act.phase !== 'queued')).length
  const put = (v, p) => { v.r1Position = { x: p.x, z: p.z }; v.char.group.position.set(p.x, 0, p.z) }
  function chair(v, amount) {
    const p = nav.parameters.get(stationName(v)), moving = furniture.moveChair(p.chairId, p.back.x * p.slide * amount, p.back.z * p.slide * amount, p.turn * Math.PI / 180 * amount)
    if (moving) { nav.refreshChairs(); chairsMoving = true }
    return moving
  }
  function reserveChair(v, open) {
    const p = nav.parameters.get(stationName(v)), current = furniture.chairMotion(p.chairId), start = Math.hypot(current.dx, current.dz) / p.slide
    chairMoves.set(stationName(v), { v, from: start, to: open ? 1 : 0, t: 0 })
  }
  function peopleClear(v, p) {
    return [...views.values()].every(other => other === v || other.away || !other.char.group.visible || dist(anchor(other), p) >= .5 - 1e-7)
  }
  function transitionOccupied(v, returning = false) {
    const p = nav.parameters.get(stationName(v)), a = p.standing, b = p.exit
    const pointDistance = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) }
    const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
    for (const other of views.values()) {
      if (other === v || other.away || !other.char.group.visible) continue
      const otherParams = nav.parameters.get(stationName(other))
      // Returning neighbours reserve their shared approach until seated, not while idle elsewhere.
      const reserved = returning ? other.act && other.act.phase !== 'queued' : other.r1AwayFromDesk || other.act && other.act.phase !== 'queued'
      if (reserved && otherParams && dist(p.exit, otherParams.exit) < .5) return true
      if (reserved && otherParams) {
        const end = { x: v.home.x + p.back.x * p.slide, z: v.home.z + p.back.z * p.slide }
        const otherEnd = { x: other.home.x + otherParams.back.x * otherParams.slide, z: other.home.z + otherParams.back.z * otherParams.slide }
        // Adjacent exits can cross a neighbour's parked chair even when the people have left.
        if (Math.min(pointDistance(p.exit, other.home, otherEnd), pointDistance(otherParams.exit, v.home, end)) < 1.04) return true
      }
      if (returning) continue // Actual return-chair clearance is checked by safeChairMove, without the departure approximation.
      // Reserve the entire chair sweep before rising; pausing halfway can trap a passing colleague.
      const end = { x: v.home.x + p.back.x * p.slide, z: v.home.z + p.back.z * p.slide }
      if (pointDistance(anchor(other), v.home, end) < 1.04) return true
      if (!other.act || other.act.phase === 'queued') continue
      if (['rise', 'exit', 'return-transition', 'sit'].includes(other.act.phase)) {
        const q = nav.parameters.get(stationName(other)), c = q.standing, d = q.exit
        const crossing = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
        if (crossing || Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b)) < .5) return true
      } else if (pointDistance(anchor(other), a, b) < .5) return true
    }
    return false
  }
  function safeChairMove(v, amount) {
    const p = nav.parameters.get(stationName(v)), current = furniture.chairMotion(p.chairId), body = nav.bodyFor(p.chairId)
    const target = { dx: p.back.x * p.slide * amount, dz: p.back.z * p.slide * amount, yaw: p.turn * Math.PI / 180 * amount }
    const travel = Math.hypot(target.dx - current.dx, target.dz - current.dz) + Math.abs(target.yaw - current.yaw) * .45
    const samples = Math.max(1, Math.ceil(travel / .005))
    for (const other of views.values()) {
      if (other === v && ['rise', 'sit'].includes(v.act?.phase) || other.away || !other.char.group.visible) continue
      const pos = anchor(other), radius = other === v ? .24 : .6
      const parked = Math.hypot(current.dx, current.dz)
      if (travel > 1e-9 && (parked < 1e-9 || Math.abs(parked - p.slide) < 1e-9) && nav.chairSweepHit(p.chairId, pos, radius)) return false
      if (dist(pos, { x: v.home.x + target.dx, z: v.home.z + target.dz }) > 1.1 + travel) continue
      for (let i = 1; i <= samples; i++) {
        const t = i / samples, dx = current.dx + (target.dx - current.dx) * t, dz = current.dz + (target.dz - current.dz) * t, yaw = (target.yaw - current.yaw) * t, co = Math.cos(yaw), si = Math.sin(yaw)
        const x = pos.x - v.home.x - dx, z = pos.z - v.home.z - dz
        // Inverse rigid motion queries the unchanged real mesh, without cloning its triangles.
        if (collision.navigationHit(v.home.x + current.dx + co * x - si * z, v.home.z + current.dz + si * x + co * z, radius, null, [body])) return false
      }
    }
    return true
  }
  function bubble(v, text, seconds = 4) {
    if (!layer || !globalThis.document || !text) return
    const el = document.createElement('div'); el.className = 'bubble k-speak'; el.textContent = text; layer.appendChild(el); bubbles.add({ v, el, until: elapsed + seconds })
  }
  function pathTo(v, target) {
    const peers = [...views.values()].filter(other => other !== v && !other.away && other.char.group.visible && (other.r1AwayFromDesk || other.act && other.act.phase !== 'queued')).map(anchor)
    const t = performance.now(), result = nav.plan(anchor(v), target, stationName(v), peers)
    planningMs = Math.max(planningMs, performance.now() - t)
    return result
  }
  function approach(seat, v) {
    if (!seat.id) return { ...seat }
    if (R1_RESERVED_SEATS.includes(seat.id)) return null
    const chairBody = nav.bodyFor(seat.id)
    if (!chairBody) throw new Error(`R1 public seat has no collision body: ${seat.id}`)
    const facing = furniture.chairFacings.get(seat.id)
    if (facing) seat.yaw = facing.yaw + Math.PI
    if (seat.category === '弧形沙发段') seat.yaw = Math.atan2(seat.x - 16, seat.z - 13.2)
    const ignored = new Set([chairBody.group, nav.bodyFor(nav.parameters.get(stationName(v)).chairId)?.group])
    const clear = (a, b) => {
      const n = Math.max(1, Math.ceil(dist(a, b) / .005))
      for (let i = 0; i <= n; i++) if (nav.query({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n }, stationName(v), .25, ignored)) return false
      return true
    }
    let path = R1_PUBLIC_TRANSITIONS[seat.id]
    if (path && dist(path[0], seat) > 1e-7) throw new Error(`R1 public seat changed: ${seat.id}`)
    if (!path) {
      const reachable = nav.reachableFrom(anchor(v), stationName(v))
      for (let cm = 1; cm <= 350 && !path; cm++) for (let degrees = 0; degrees < 360; degrees += 10) {
        const a = degrees * Math.PI / 180, p = { x: seat.x + Math.sin(a) * cm / 100, z: seat.z + Math.cos(a) * cm / 100 }
        if (!nav.query(p, stationName(v)) && clear(seat, p) && reachable(p)) { path = [{ x: seat.x, z: seat.z }, p]; break }
      }
    }
    if (!path || path.slice(1).some((p, i) => !clear(path[i], p)) || nav.query(path.at(-1), stationName(v))) return null
    publicTransitions.set(seat.id, { seat: { ...seat }, approach: path.at(-1), path, excluded: [seat.id] })
    return path.at(-1)
  }
  function localPosition(path, seconds) {
    let left = seconds * .8
    for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], length = dist(a, b); if (left < length) return { p: { x: a.x + (b.x - a.x) * left / length, z: a.z + (b.z - a.z) * left / length }, done: false }; left -= length }
    return { p: path.at(-1), done: true }
  }
  function start(v, seat, options = {}) {
    if (!v || v.act || v.away && options.commute !== 'arrive' || R1_RESERVED_SEATS.includes(seat?.id)) return false
    const back = !options.cheer && (options.back || dist(seat, v.home) < .001)
    const act = { v, view: v, seat, back, phase: 'queued', t: 0, total: 0, options, trail: [], returnQueued: false, stall: 0 }
    v.act = act; actions.add(act); pending.push(act); return true
  }
  function transitionClear(v, pos, publicSeat) {
    const p = nav.parameters.get(stationName(v)), ids = publicSeat?.excluded || [p.deskId, p.chairId]
    const groups = new Set([nav.bodyFor(p.chairId)?.group, ...ids.map(id => nav.bodyFor(id)?.group)])
    if (publicSeat) return !nav.query(pos, stationName(v), .25, groups)
    const table = nav.bodyFor(p.deskId)
    return !nav.query(pos, stationName(v), .6, groups) && (!table || !collision.navigationHit(pos.x, pos.z, .25, null, [table]))
  }
  function finish(act) {
    const v = act.v; v.act = null; actions.delete(act); act.options.onDone?.()
    history.push({ name: stationName(v), kind: act.options.kind || (act.back ? 'return' : act.seat.zone || 'travel'), duration: act.total, end: { ...anchor(v) } })
  }
  function beginWalk(act, target, next) {
    if (chairsMoving || chairMoves.has(stationName(act.v))) { act.phase = 'wait-chair'; act.retryTarget = target; act.next = next; act.t = 0; return }
    const path = pathTo(act.v, target)
    if (!path) { act.phase = 'blocked'; act.retryTarget = target; act.next = next; act.t = 0; return }
    act.blockedFor = 0; act.path = nav.smoothPath(path, stationName(act.v)); act.i = 1; act.phase = 'walk'; act.next = next; act.t = 0
  }
  function openAhead(v, target) {
    const pos = anchor(v)
    for (const { row } of doorBodies) {
      const c = row.closed, segmentNear = Math.min(dist(pos, c), dist(target, c)) < row.width / 2 + 2
      if (segmentNear) { doors.doors.set(row.id, 'open'); activeDoors.add(row.id) }
    }
  }
  function goStep(act, target, dt) {
    const v = act.v, pos = anchor(v), length = dist(pos, target), step = Math.min(length, 1.21 * dt)
    if (length < 1e-9) return true
    const next = { x: pos.x + (target.x - pos.x) * step / length, z: pos.z + (target.z - pos.z) * step / length }
    openAhead(v, target)
    if (!peopleClear(v, next)) {
      act.stall += dt; v.char.pose.walk = 0
      if (act.stall > .4) for (const side of [1, -1]) {
        const avoid = { x: pos.x - (target.z - pos.z) / length * .65 * side, z: pos.z + (target.x - pos.x) / length * .65 * side }
        if (peopleClear(v, avoid) && nav.clear(pos, avoid, stationName(v))) { act.path.splice(act.i, 0, avoid); act.stall = 0; break }
      }
      return false
    }
    const movingDoor = doorBodies.some(({ row }) => {
      const state = doors.doors.state(row.id), normal = row.normal, axis = row.axis
      return state.state === 'moving' && Math.abs(next[normal] - row.closed[normal]) < .6 + row.thickness / 2 && Math.abs(next[axis] - row.closed[axis]) < row.width / 2 + .6
    })
    const ownChair = nav.bodyFor(nav.parameters.get(stationName(v)).chairId)
    if (movingDoor || nav.query(next, stationName(v)) || collision.navigationHit(next.x, next.z, .24, null, [ownChair])) { act.stall += dt; blockedFrames++; v.char.pose.walk = 0; return false }
    act.stall = 0; const yaw = Math.atan2(-(next.x - pos.x), -(next.z - pos.z)), diff = Math.atan2(Math.sin(yaw - v.char.group.rotation.y), Math.cos(yaw - v.char.group.rotation.y))
    v.char.group.rotation.y += diff * Math.min(1, dt * 10); put(v, next); v.char.pose.phase += step * 4.6; v.char.pose.walk = 1
    return step === length
  }
  function step(act, dt) {
    const v = act.v, p = nav.parameters.get(stationName(v)), pose = v.char.pose
    act.t += dt; act.total += dt
    if (act.phase === 'queued') return
    pose.r1AtDesk = false
    if (act.phase === 'rise') {
      const k = smooth(clamp(act.t / .8)); pose.sit = 1 - k; pose.walk = 0
      if (!safeChairMove(v, k)) { act.t -= dt; return }
      chair(v, k); put(v, p.standing); v.char.group.rotation.y = v.home.yaw
      if (k === 1) { pose.sit = 0; act.phase = act.options.cheer ? 'cheer' : 'exit'; act.t = 0 }
    } else if (act.phase === 'cheer') {
      pose.r1Motion = act.options.cheer
      if (act.t >= 4) { pose.r1Motion = null; act.phase = 'sit'; act.t = 0 }
    } else if (act.phase === 'exit' || act.phase === 'return-transition') {
      const entering = act.phase === 'return-transition', a = entering ? p.exit : p.standing, b = entering ? p.standing : p.exit, k = clamp(act.t / .5)
      const next = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }
      if (!peopleClear(v, next) || !transitionClear(v, next)) { act.t -= dt; return }
      put(v, next); pose.walk = 1; pose.phase += dist(a, b) * dt / .5 * 4.6
      if (k === 1) {
        pose.walk = 0; act.t = 0
        if (entering) act.phase = 'sit'
        else {
          v.r1AwayFromDesk = true
          const target = approach(act.seat, v)
          if (!target) { act.phase = 'blocked'; act.retryTarget = null; return }
          beginWalk(act, target, act.options.commute === 'leave' ? 'leave' : act.options.chat ? 'chat' : act.options.stand ? 'destination-stand' : 'destination-sit')
        }
      }
    } else if (act.phase === 'walk') {
      if (dist(anchor(v), p.exit) >= 1 && !act.back && !act.returnQueued) { reserveChair(v, false); act.returnQueued = true }
      if (goStep(act, act.path[act.i], dt)) {
        act.i++
        if (act.i === act.path.length) { pose.walk = 0; act.phase = act.next; act.t = 0; act.from = { ...anchor(v) } }
      } else if (act.stall > 1.5 && act.t > 1.5 && !chairsMoving) {
        const revised = pathTo(v, act.path.at(-1)); if (revised) { act.path = nav.smoothPath(revised, stationName(v)); act.i = 1 }; act.t = 0
      }
    } else if (act.phase === 'wait-chair') {
      if (!chairsMoving) beginWalk(act, act.retryTarget, act.next)
    } else if (act.phase === 'blocked') {
      act.blockedFor = (act.blockedFor || 0) + dt
      // Yield the exit back to a neighbour's restoring chair instead of holding it indefinitely.
      if (!act.back && act.blockedFor > 3 && dist(anchor(v), p.exit) < .01) {
        act.yielding = true; act.phase = 'return-transition'; act.t = 0
      } else if (act.t > 1 && act.retryTarget) beginWalk(act, act.retryTarget, act.next)
    } else if (act.phase === 'leave') {
      v.away = true; v.char.group.visible = false; reserveChair(v, false); finish(act)
    } else if (act.phase === 'sit') {
      const k = smooth(clamp(act.t / .8))
      if (!safeChairMove(v, 1 - k)) { act.t -= dt; return }
      chair(v, 1 - k); pose.sit = k; pose.walk = 0; put(v, v.home); v.char.group.rotation.y = v.home.yaw
      if (k === 1) {
        pose.r1AtDesk = true; v.r1Standing = false; v.r1AwayFromDesk = false; v.r1Position = null; v.arriving = false
        if (act.yielding) {
          act.yielding = false; act.blockedFor = 0; act.phase = 'queued'; act.t = 0; act.retryAfter = elapsed + 2; pending.push(act)
        } else finish(act)
      }
    } else if (act.phase === 'public-rise') {
      const k = smooth(clamp(act.t / .8)); pose.sit = 1 - k; pose.walk = 0
      if (k === 1) { act.phase = 'public-exit'; act.t = 0; act.from = { ...anchor(v) } }
    } else if (act.phase === 'public-exit') {
      const local = localPosition(v.r1PublicSeat.path, act.t), next = local.p
      if (!peopleClear(v, next) || !transitionClear(v, next, v.r1PublicSeat)) { act.t -= dt; return }
      put(v, next); pose.walk = 1; pose.phase += .8 * dt * 4.6
      if (local.done) {
        v.r1PublicSeat = null; pose.lounge = 0
        if (act.back) { reserveChair(v, true); beginWalk(act, p.exit, 'return-transition') }
        else {
          const target = approach(act.seat, v)
          if (!target) { act.phase = 'blocked'; act.retryTarget = null; return }
          beginWalk(act, target, act.options.commute === 'leave' ? 'leave' : 'destination-sit')
        }
      }
    } else if (act.phase === 'destination-sit') {
      const transition = publicTransitions.get(act.seat.id), path = transition?.path.slice().reverse() || [act.from, act.seat], local = localPosition(path, act.t), next = local.p
      pose.sit = clamp(1 - dist(next, act.seat) / .4); pose.lounge = act.seat.pose === 'lounge' ? 1 : 0
      if (!peopleClear(v, next) || !transitionClear(v, next, transition)) { act.t -= dt; return }
      put(v, next); v.char.group.rotation.y = act.seat.yaw || 0
      if (local.done) { v.r1PublicSeat = transition || null; finish(act) }
    } else if (act.phase === 'destination-stand') {
      pose.sit = 0; pose.walk = 0; v.r1Standing = true; finish(act)
    } else if (act.phase === 'chat') {
      const other = act.options.chat
      if (other.act && !['chat', 'chat-wait'].includes(other.act.phase)) return
      const q = anchor(other), pos = anchor(v); v.char.group.rotation.y = Math.atan2(-(q.x - pos.x), -(q.z - pos.z)); other.char.group.rotation.y = Math.atan2(-(pos.x - q.x), -(pos.z - q.z))
      pose.talk = 1; pose.r1Motion = 'gestic_talk_relaxed_01'; bubble(v, act.options.text, 5)
      act.phase = 'chat-wait'; act.t = 0
    } else if (act.phase === 'chat-wait' && act.t >= 5) {
      pose.talk = 0; pose.r1Motion = null; reserveChair(v, true); act.back = true; beginWalk(act, p.exit, 'return-transition')
    }
  }
  function update(dt) {
    if (!nav.prepared() || !Number.isFinite(dt) || dt <= 0) return
    elapsed += dt; chairsMoving = false
    let changed = false
    for (const b of doorBodies) {
      const p = doors.positionAt(b.row, doors.doors.state(b.row.id).progress)
      if (p.x !== b.p.x || p.z !== b.p.z) { b.mesh.position.x = p.x; b.mesh.position.z = p.z; collision.translateNavigationBody(b.mesh, p.x - b.p.x, p.z - b.p.z); b.p = p; changed = true }
    }
    if (changed) nav.refreshChairs()
    for (const [name, move] of chairMoves) {
      // Start only after the entire chair sweep is empty; walking then respects its temporary reservation.
      if (move.t === 0 && !safeChairMove(move.v, move.to)) continue
      const next = Math.min(.6, move.t + dt), k = smooth(next / .6), amount = move.from + (move.to - move.from) * k
      if (!safeChairMove(move.v, amount)) continue
      chair(move.v, amount); move.t = next; if (next === .6) chairMoves.delete(name)
    }
    for (let i = 0; i < pending.length;) {
      const a = pending[i], v = a.v
      if (elapsed < (a.retryAfter || 0) || (v.away || !v.r1AwayFromDesk) && countAway() >= 8 || transitionOccupied(v, a.back)) { i++; continue }
      pending.splice(i, 1); a.t = 0
      if (a.options.commute === 'arrive') { const gate = nav.ENTRANCE.gate[1]; if (!peopleClear(v, gate)) { pending.push(a); break }; v.away = false; v.char.group.visible = true; put(v, gate); v.char.pose.sit = 0; v.char.pose.r1AtDesk = false; reserveChair(v, true); beginWalk(a, nav.parameters.get(stationName(v)).exit, 'return-transition') }
      else if (v.r1PublicSeat) a.phase = 'public-rise'
      else if (a.back) { v.char.pose.sit = 0; v.char.pose.lounge = 0; reserveChair(v, true); beginWalk(a, nav.parameters.get(stationName(v)).exit, 'return-transition') }
      else a.phase = 'rise'
    }
    for (const a of [...actions]) step(a, dt)
    for (const id of [...activeDoors]) {
      const row = doors.records.find(r => r.id === id)
      if ([...views.values()].every(v => v.away || dist(anchor(v), row.closed) > row.width / 2 + 2.5)) { doors.doors.set(id, 'closed'); activeDoors.delete(id) }
    }
    for (const b of [...bubbles]) { if (elapsed >= b.until) { b.el.remove(); bubbles.delete(b) } else if (project) { b.v.char.body.head.getWorldPosition(project.tmp); project.fn(project.tmp, b.el, .35) } }
  }
  return {
    r1: true, ready, navigation: nav, history, publicTransitions,
    travel(v, pts, seat, lounge, onDone) { return start(v, seat, { back: !lounge && dist(seat, v.home) < .01, onDone }) },
    goHome(v, onDone) { return start(v, nav.ENTRANCE.gate[1], { commute: 'leave', onDone }) },
    arrive(v) { return start(v, v.home, { back: true, commute: 'arrive' }) },
    enqueue(ev) {
      const v = views.get(ev.from), other = views.get(ev.to)
      if (!v || v.away) return
      if (!other || other.away || v.act || other.act || v.lounging || other.lounging || countAway() > 6) { bubble(v, ev.text); return }
      const center = nav.parameters.get(stationName(v)).exit
      for (let radius = 1; radius <= 5; radius += .25) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const a = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius }, b = { x: a.x - Math.sin(angle) * 1.05, z: a.z + Math.cos(angle) * 1.05 }
        // Chat destinations must stay outside both chairs' complete slide envelopes.
        if (dist(a, v.home) < nav.parameters.get(stationName(v)).slide + 1 || dist(b, other.home) < nav.parameters.get(stationName(other)).slide + 1 || nav.query(a, stationName(v)) || nav.query(b, stationName(other)) || !peopleClear(v, a) || !peopleClear(other, b)) continue
        start(v, a, { chat: other, text: ev.text, kind: 'chat' }); start(other, b, { chat: v, kind: 'chat' }); return
      }
      bubble(v, ev.text)
    },
    celebrate(v) { if (!v || v.away || v.act) return; start(v, v.home, { cheer: 'cheer_01', kind: 'cheer' }); for (const other of views.values()) if (other !== v && other.mode === 'idle' && !other.away && !other.act && dist(anchor(v), anchor(other)) <= 6 && Math.random() < .5) start(other, other.home, { cheer: Math.random() < .5 ? 'claphands_01' : 'cheer_03', kind: 'applause' }) },
    visitConsumer(v, plan, options) { return plan?.ok ? start(v, plan.stand, { stand: true, onDone: options?.onArrive }) : false },
    cancelVisit() {}, aisleZ: v => v.home.z,
    clear() { for (const a of [...actions]) { a.v.char.pose.r1Motion = null; a.v.act = null }; actions.clear(); pending.length = 0; for (const b of bubbles) b.el.remove(); bubbles.clear() },
    update,
    stats() { return { queued: pending.length, active: actions.size - pending.length, away: countAway(), bubbles: bubbles.size, blockedFrames, planningMs, prepared: nav.prepared(), preparationError, visits: 0 } },
  }
}
