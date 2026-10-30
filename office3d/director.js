import { createR1Director } from './office-r1-director.js'
// 动画导演：把「真实事件」变成人物动作。没有事件就没有动作——不制造假活动。
import { createOfficeNavigation } from './office-layout.js'
import { createPedestrianTraffic, PERSON_GAP } from './pedestrian-traffic.js'
import { consumerAdvance as legacyConsumerAdvance, consumerDeparture as legacyConsumerDeparture } from './foyer-paths.js'
class FurnitureBlockedError extends Error {}
const SPEED = 1.4 // 米/秒：正常办公室步速
const MAX_WALKERS = 3
const MAX_EVENT_WALKERS = 4
const MAX_QUEUE = 14
const MAX_BUBBLES = 5
const TYPE_MS = 42
const DEADLOCK_SECONDS = 1.5
const MAX_YIELDS = 3
const MAX_YIELD_WAIT = 6
const YIELD_COOLDOWN = 2
const ACTION_TIMEOUT = 45
const KIND_CLASS = { submit_to_board: 'k-submit', report: 'k-report', dispatch: 'k-dispatch', speak: 'k-speak', board_decision: 'k-board' }
const KIND_LABEL = { submit_to_board: '提交审批', report: '汇报', dispatch: '派活', speak: '', board_decision: '董事会决定' }

const lerp = (a, b, k) => a + (b - a) * k
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const isWalker = act => ['rise', 'walk'].includes(act.phase)

export function createDirector({ views, board, layer, project, needDesk, furnitureCollision, layout, navigation: navigationOverride, r1Furniture, r1Doors }) {
  if (layout?.r1Phase === 'R1') return createR1Director({ views, board, layer, project, needDesk, furnitureCollision, layout, r1Furniture, r1Doors })
  const seatedOnly = layout?.r1Phase === 'R1'
  const navigation = navigationOverride || createOfficeNavigation(layout)
  const { officeExit, officeTrip, boardTrip, corridorPath, ENTRANCE, FOYER_Z, AISLE_OFFSET, CORRIDOR_X, BOARD_DOOR: DOOR, LOUNGE_AREA } = navigation
  const consumerAdvance = navigation.consumerAdvance || legacyConsumerAdvance, consumerDeparture = navigation.consumerDeparture || legacyConsumerDeparture
  const gInLounge = p => Math.abs(p.x - LOUNGE_AREA.x) < LOUNGE_AREA.width / 2 && Math.abs(p.z - LOUNGE_AREA.z) < LOUNGE_AREA.depth / 2
  // views: Map(agentId -> view)；board: { 名字 -> view }；layer: 气泡容器；project(vec3, el): 把世界坐标投到屏幕
  const queue = []
  const active = new Set()
  const visits = new Map()
  const bubbles = new Set()
  const traffic = createPedestrianTraffic({ views, board, furnitureCollision })
  let loungeLane = null
  let yieldCount = 0
  let abandonCount = 0
  let timeoutCount = 0
  let visitAbortCount = 0
  let boardTurn = 0
  const boardNames = Object.keys(board) // 董事会成员（目前只有苏晨）

  function pickBoardMember(ev) {
    // Paperclip 目前不告诉我们审批具体发给董事会的哪一位，这里在董事会成员之间轮流（目前只有苏晨）；气泡里会写明。
    const name = ev.addressee && board[ev.addressee] ? ev.addressee : boardNames[boardTurn++ % boardNames.length]
    return { name, view: board[name] }
  }

  function aisleZ(v) { return v.home.z + AISLE_OFFSET }
  function isEngaged(v) {
    for (const a of active) if (a.tgt && a.tgt.view === v && !a.back) return true
    return false
  }

  function priority(act) {
    const ev = act.ev || {}
    return { leaving: act.commute === 'leave', at: Date.parse(ev.at || '') || 0, id: String(act.view.id || act.view.name || '') }
  }
  function before(a, b) {
    const pa = priority(a), pb = priority(b)
    if (pa.leaving !== pb.leaving) return pa.leaving
    if (pa.at !== pb.at) return pa.at < pb.at
    return pa.id < pb.id
  }
  function resetTimedOut(act) {
    timeoutCount++
    const v = act.view, g = v.char.group
    const where = `(${g.position.x.toFixed(2)}, ${g.position.z.toFixed(2)})`
    g.position.set(v.home.x, 0, v.home.z); g.rotation.y = v.home.yaw || 0
    v.char.pose.sit = 1; v.char.pose.walk = 0; v.char.pose.talk = 0; v.char.pose.carry = 0
    console.warn('[director] 行动超时，已复位', v.name, act.phase, where, act.tgt?.view?.name || act.tgt?.view?.id || '')
    finish(act)
  }
  function returnHome(act) {
    const v = act.view, g = v.char.group, origin = act.origin || v.home
    const trail = (act.trail || [{ x: origin.x, z: origin.z }]).slice().reverse()
    const tail = Math.hypot(origin.x - v.home.x, origin.z - v.home.z) < 0.01 ? [] : officeTrip(origin, v.home, v.home)
    const pts = [...trail, ...tail].filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 1e-6)
    if (!pts.length || Math.hypot(pts.at(-1).x - v.home.x, pts.at(-1).z - v.home.z) > 0.01) pts.push({ x: v.home.x, z: v.home.z })
    act.pts = pts; act.i = 0; act.routedIndex = -1; act.back = true; act.returningHome = true; act.seat = v.home; act.lounge = false
    act.yielding = false; act.yieldBlocker = null; act.yieldFor = null; act.t = 0; act.stall = 0; act.progressI = -1; act.progressStall = 0; act.phaseT = 0; act.phase = 'walk'; act.carry = false
    act.trail = [{ x: g.position.x, z: g.position.z }]
  }
  function abandon(act) {
    if (act.returningHome) return
    abandonCount++
    returnHome(act)
  }
  function rootPriority(act) {
    const seen = new Set()
    while (act?.yieldFor && !seen.has(act)) { seen.add(act); act = act.yieldFor }
    return act
  }
  function yieldPath(act, blocker) {
    const p = act.view.char.group.position, bp = blocker?.char?.group?.position
    if (bp && furnitureCollision) {
      const dx = p.x - bp.x, dz = p.z - bp.z, d = Math.hypot(dx, dz) || 1
      const directions = [[dx / d, dz / d], [-dz / d, dx / d], [dz / d, -dx / d]]
      const people = [...views.values(), ...Object.values(board)]
      for (const distance of [1.1, 1.6]) for (const [x, z] of directions) {
        const end = { x: p.x + x * distance, z: p.z + z * distance }
        if (Math.hypot(end.x - bp.x, end.z - bp.z) < d + PERSON_GAP * 0.7) continue
        if (people.some(other => other !== act.view && other !== blocker && !other.away && other.char && Math.hypot(end.x - other.char.group.position.x, end.z - other.char.group.position.z) < PERSON_GAP * 1.2)) continue
        const route = furnitureCollision.route(p, end, new Set([act.view.chair]))
        if (route && route.reduce((n, point, i) => n + Math.hypot(point.x - (i ? route[i - 1].x : p.x), point.z - (i ? route[i - 1].z : p.z)), 0) <= distance * 2) return route
      }
    }
    return [act.i > 0 ? act.pts[act.i - 1] : act.view.home]
  }
  function beginYield(act, blocker, winner = blocker?.act) {
    if (!act || act.phase !== 'walk' || act.yielding) return false
    if (act.yields >= MAX_YIELDS) { abandon(act); return }
    const blockerId = String(blocker?.id || blocker?.name || '')
    act.yieldCooldown ||= new Map()
    if ((act.yieldCooldown.get(blockerId) || 0) > act.total) return false
    act.yieldCooldown.set(blockerId, act.total + YIELD_COOLDOWN)
    act.yields++; yieldCount++
    act.resumePts = act.pts.slice()
    act.resumeI = act.i
    act.yielding = true; act.yieldBlocker = blocker; act.yieldFor = rootPriority(winner); act.yieldWait = 0
    act.pts = yieldPath(act, blocker)
    act.i = 0; act.routedIndex = -1; act.progressI = -1; act.progressStall = 0; act.phase = 'walk'; act.stall = 0
    return true
  }
  function cancelYield(act) {
    act.pts = act.resumePts; act.i = act.resumeI; act.yielding = false; act.yieldBlocker = null; act.yieldFor = null
    act.routedIndex = -1; act.progressI = -1; act.progressStall = 0; act.t = 0; act.stall = 0; act.phase = 'walk'
  }
  function resolveDeadlock(act, blocker) {
    const other = blocker?.act
    if (!blocker || blocker === act.view) return
    if (!other || !['walk', 'queued'].includes(other.phase)) { beginYield(act, blocker); return }
    const a = rootPriority(act), b = rootPriority(other)
    if (!a || !b) return
    if (a === b) {
      // 退让路线又被原通行者堵住：交换通行方，避免两人维持同一个等待环。
      if (act.yielding) { cancelYield(act); beginYield(other, act.view, act) }
      else if (other.yielding) { cancelYield(other); beginYield(act, other.view, other) }
      return
    }
    const winner = before(a, b) ? a : b
    const loser = winner === a ? b : a
    beginYield(loser, winner.view, winner)
  }
  function moveWithCollision(v, g, dx, dz, ignore) {
    // 入座和离座需要进入自己的椅子；其它家具（包括自己的桌子）始终检测。
    return traffic.move(v, dx, dz, ignore)
  }

  function pathTo(v, tgt) {
    if (!tgt.board) return officeTrip(v.home, tgt.view.home, tgt.stand)
    if (typeof boardTrip === 'function') return boardTrip(v.home, tgt.stand)
    const pts = officeExit(v.home)
    if (tgt.board) {
      pts.push(...corridorPath(pts.at(-1), { x: CORRIDOR_X, z: DOOR.zOut }), { x: DOOR.x, z: DOOR.zOut }, { x: DOOR.x, z: DOOR.zIn })
      for (const p of tgt.via) pts.push(p)
    }
    pts.push({ x: tgt.stand.x, z: tgt.stand.z })
    return pts
  }

  function makeBubble(view, ev) {
    const el = document.createElement('div')
    el.className = `bubble ${ev.lounge ? 'k-chat' : KIND_CLASS[ev.kind] || 'k-speak'}`
    el.innerHTML = `<div class="b-head"></div><div class="b-text"></div><i class="b-tail"></i>`
    el.querySelector('.b-head').textContent = (KIND_LABEL[ev.kind] ? KIND_LABEL[ev.kind] + ' · ' : '') + view.name + (ev.toLabel ? ' → ' + ev.toLabel : '')
    layer.appendChild(el)
    const b = { view, el, textEl: el.querySelector('.b-text'), full: ev.text, shown: 0, acc: 0, doneAt: null }
    bubbles.add(b)
    return b
  }

  function closeBubble(b) {
    b.el.remove()
    bubbles.delete(b)
  }

  function startAction(ev) {
    const from = ev.from === 'board' ? null : views.get(ev.from)
    // 董事会成员发言（审批结果）：不走动，只冒气泡
    if (ev.kind === 'board_decision') {
      const m = pickBoardMember(ev)
      const to = views.get(ev.to)
      ev.toLabel = to ? to.name : ''
      const act = { ev, view: m.view, phase: 'say', bubble: makeBubble(m.view, ev), t: 0, total: 0, stay: true }
      m.view.act = act
      active.add(act)
      return true
    }
    if (!from) return false
    if (ev.kind === 'speak') {
      const act = { ev, view: from, phase: 'say', bubble: makeBubble(from, ev), t: 0, total: 0, stay: true }
      from.act = act
      active.add(act)
      return true
    }
    let tgt = null
    if (ev.to === 'board') {
      const m = pickBoardMember(ev)
      ev.toLabel = m.name
      tgt = { board: true, view: m.view, stand: m.view.stand, via: m.view.via, name: m.name }
    } else {
      const to = views.get(ev.to)
      if (!to || to === from) return false
      ev.toLabel = to.name
      tgt = { board: false, view: to, stand: to.stand, name: to.name }
    }
    let pts
    try { pts = furnitureRoute(from, pathTo(from, tgt)) }
    catch (error) { if (!(error instanceof FurnitureBlockedError)) throw error; console.warn('[director] 无安全事件路线', error.message); return false }
    const act = { ev, view: from, tgt, phase: 'rise', t: 0, total: 0, stall: 0, yields: 0, pts, i: 0, back: false, bubble: null, carry: ev.kind !== 'dispatch', origin: { x: from.char.group.position.x, z: from.char.group.position.z }, trail: [{ x: from.char.group.position.x, z: from.char.group.position.z }] }
    from.act = act
    active.add(act)
    return true
  }

  function finish(act) {
    if (act.phase === 'entry') {
      act.view.away = false; act.view.arriving = false; act.view.char.group.visible = true
      act.view.char.group.position.set(act.view.home.x, 0, act.view.home.z)
    }
    if (loungeLane === act) loungeLane = null
    if (act.bubble) closeBubble(act.bubble)
    if (act.tgt && act.tgt.view.char) act.tgt.view.char.pose.yaw = 0
    act.view.act = null
    active.delete(act)
  }

  function faceToward(view, x, z, dt, rate = 8) {
    const dx = x - view.char.group.position.x, dz = z - view.char.group.position.z
    if (Math.hypot(dx, dz) < 0.01) return
    const want = Math.atan2(-dx, -dz)
    view.char.group.rotation.y += angDiff(view.char.group.rotation.y, want) * clamp01(dt * rate)
  }

  function stepAct(act, dt) {
    if (act.phase === 'entry') return
    const v = act.view
    const p = v.char.pose
    const g = v.char.group
    act.t += dt
    act.total = (act.total || 0) + dt
    if (act._phase !== act.phase) { act._phase = act.phase; act.phaseT = 0 }
    act.phaseT = (act.phaseT || 0) + dt
    if (act.phase === 'queued' && ([...active].some(a => a !== act && !['say', 'queued'].includes(a.phase)) || (act.needsLane && loungeLane && loungeLane !== act))) act.phaseT = 0
    if (act.phaseT > ACTION_TIMEOUT) { resetTimedOut(act); return }
    if (act.phase === 'queued') {
      if (act.yielding) {
        act.yieldWait += dt
        const b = act.yieldBlocker
        const clear = !b?.char || Math.hypot(g.position.x - b.char.group.position.x, g.position.z - b.char.group.position.z) > PERSON_GAP * 1.8
        if (clear || act.yieldWait >= MAX_YIELD_WAIT) {
          if (!clear && act.yields >= MAX_YIELDS) { abandon(act); return }
          cancelYield(act)
        }
      }
      return
    }
    if (act.phase === 'say') {
      // 就地发言：气泡打字 → 停留 → 消失
      const b = act.bubble
      typeBubble(b, dt)
      p.talk = lerp(p.talk, v.isBoard ? 0.5 : 0, clamp01(dt * 4))
      if (b.doneAt !== null && act.t > b.doneAt + 3.2) finish(act)
      return
    }
    if (act.phase === 'rise') {
      if (!act.departure && furnitureCollision) act.departure = { x: g.position.x, z: g.position.z, body: furnitureCollision.seatBody(g.position) }
      p.lounge = 0
      p.sit = lerp(p.sit, 0, clamp01(dt * 6))
      p.type = lerp(p.type, 0, clamp01(dt * 8))
      p.carry = lerp(p.carry, act.carry ? 1 : 0, clamp01(dt * 4))
      if (p.sit < 0.04) { p.sit = 0; act.phase = 'walk'; act.i = 0 }
      return
    }
    if (act.phase === 'walk') {
      const ignore = new Set([v.chair])
      if (act.departure && !act.departure.exited) {
        if (Math.hypot(g.position.x - act.departure.x, g.position.z - act.departure.z) > 0.1 && !furnitureCollision.overlaps(act.departure.body, g.position.x, g.position.z)) act.departure.exited = true
        else ignore.add(act.departure.body)
      }
      // 入座动画可进入指定座椅；不能据此穿过沿路其它桌椅。
      if (act.seat && act.i === act.pts.length - 1) ignore.add(furnitureCollision?.seatBody(act.seat))
      if (furnitureCollision && act.routedIndex !== act.i) {
        const route = furnitureCollision.route(g.position, act.pts[act.i], ignore)
        if (route && route.length > 1) act.pts.splice(act.i, 1, ...route)
        act.routedIndex = act.i
      }
      const tgtPt = act.pts[act.i]
      const dx = tgtPt.x - g.position.x, dz = tgtPt.z - g.position.z
      const dist = Math.hypot(dx, dz)
      if (act.progressI !== act.i) { act.progressI = act.i; act.bestDistance = dist; act.progressStall = 0 }
      else if (dist < act.bestDistance - 0.01) { act.bestDistance = dist; act.progressStall = 0 }
      else act.progressStall = (act.progressStall || 0) + dt
      p.walk = lerp(p.walk, 1, clamp01(dt * 5))
      p.carry = lerp(p.carry, act.carry ? 1 : 0, clamp01(dt * 4))
      if (dist < 0.001) {
        if (!act.yielding && !act.returningHome) act.trail?.push({ x: tgtPt.x, z: tgtPt.z })
        act.i++
        if (act.i >= act.pts.length) {
          p.walk = 0
          act.t = 0
          if (act.commute === 'leave') { if (act.onDone) act.onDone(); finish(act); return } // 走出大门：下班
          if (act.back) act.phase = 'turn'
          else if (!act.tgt.board && act.tgt.view.act) act.phase = 'wait' // 到了发现对方刚离开：站着等
          else { act.phase = 'talk'; act.bubble = makeBubble(v, act.ev) }
        }
        if (act.yielding) { act.phase = 'queued'; act.t = 0; return }
        return
      }
      const slow = act.i === act.pts.length - 1 ? clamp01(dist / 0.8 + 0.25) : 1
      const step = Math.min(dist, SPEED * slow * dt)
      const sx = g.position.x, sz = g.position.z
      const moved = moveWithCollision(v, g, (dx / dist) * step, (dz / dist) * step, ignore)
      p.walk = lerp(p.walk, moved > 1e-6 ? 1 : 0, clamp01(dt * 8))
      if (moved > 1e-6) g.rotation.y += angDiff(g.rotation.y, Math.atan2(-(g.position.x - sx), -(g.position.z - sz))) * clamp01(dt * 9)
      p.phase += moved * 4.6
      if (moved <= 1e-6) {
        act.stall = (act.stall || 0) + dt
      }
      else { act.stall = 0; act.phaseT = 0 }
      const blockedFor = Math.max(act.stall || 0, act.progressStall || 0)
      if (blockedFor >= DEADLOCK_SECONDS) {
        const blocker = traffic.blocker(v)
        if (blocker) resolveDeadlock(act, blocker)
        else if (act.returningHome && furnitureCollision && (act.recoveryRoutes || 0) < MAX_YIELDS) {
          const route = furnitureCollision.route(g.position, tgtPt, ignore)
          if (route?.length) {
            act.pts.splice(act.i, 1, ...route); act.routedIndex = -1; act.progressI = -1; act.progressStall = 0; act.stall = 0
            act.recoveryRoutes = (act.recoveryRoutes || 0) + 1
          }
        }
        else if (!act.yielding && (act.tgt || act.commute || (act.seat && (act.stall || 0) < DEADLOCK_SECONDS)) && blockedFor >= MAX_YIELD_WAIT) abandon(act)
      }
      // 离开休息区前廊后放行下一人；等候者留在座位，不堵在门口。
      if (loungeLane === act && act.fromLounge && g.position.x >= CORRIDOR_X - 0.6 && g.position.z < FOYER_Z - 0.2) loungeLane = null
      return
    }
    if (act.phase === 'wait') {
      p.walk = lerp(p.walk, 0, clamp01(dt * 6))
      faceToward(v, act.tgt.view.home.x, act.tgt.view.home.z, dt, 3)
      if (!act.tgt.view.act) { act.phase = 'talk'; act.t = 0; act.bubble = makeBubble(v, act.ev); return }
      if (act.t > 20) { // 等太久：先回座位，事件放回队列稍后再演
        queue.unshift({ ...act.ev })
        returnHome(act)
      }
      return
    }
    if (act.phase === 'talk') {
      p.walk = lerp(p.walk, 0, clamp01(dt * 6))
      const m = act.tgt.view
      faceToward(v, m.char.group.position.x, m.char.group.position.z, dt)
      // 对方转头看向说话的人并点头
      m.char.pose.yaw = lerp(m.char.pose.yaw, clamp(angDiff(m.char.group.rotation.y, Math.atan2(-(g.position.x - m.char.group.position.x), -(g.position.z - m.char.group.position.z))), -1.1, 1.1), clamp01(dt * 4))
      m.char.pose.pitch = Math.sin(act.t * 2.4) * 0.06
      p.carry = lerp(p.carry, act.carry && act.t < 1.2 ? 1 : 0, clamp01(dt * 4))
      p.talk = lerp(p.talk, act.t > 0.4 ? 1 : 0, clamp01(dt * 4))
      const b = act.bubble
      typeBubble(b, dt)
      if (b.doneAt !== null && act.t > b.doneAt + 3.6) {
        closeBubble(b)
        act.bubble = null
        m.char.pose.yaw = 0
        m.char.pose.pitch = 0
        p.talk = 0
        returnHome(act)
      }
      return
    }
    if (act.phase === 'turn') {
      const seat = act.seat || v.home
      p.sit = 0
      p.walk = lerp(p.walk, 0, clamp01(dt * 8))
      p.carry = lerp(p.carry, 0, clamp01(dt * 8))
      g.rotation.y += angDiff(g.rotation.y, seat.yaw) * clamp01(dt * 8)
      if (Math.abs(angDiff(g.rotation.y, seat.yaw)) < 0.01 && p.walk < 0.04 && act.t > 0.35) {
        g.rotation.y = seat.yaw
        if (act.standing) { const cb = act.onDone; finish(act); if (cb) cb() }
        else { act.phase = 'sit'; act.t = 0 }
      }
      return
    }
    if (act.phase === 'sit') {
      // 回到座位（工位或休息区的沙发）：转向座位朝向，坐下
      const seat = act.seat || v.home
      if (act.lounge !== undefined) p.lounge = act.lounge ? 1 : 0
      g.rotation.y = seat.yaw
      g.position.x = lerp(g.position.x, seat.x, clamp01(dt * 10))
      g.position.z = lerp(g.position.z, seat.z, clamp01(dt * 10))
      p.walk = lerp(p.walk, 0, clamp01(dt * 8))
      p.carry = lerp(p.carry, 0, clamp01(dt * 8))
      p.sit = lerp(p.sit, 1, clamp01(dt * 5))
      if (p.sit > 0.97) { p.sit = 1; g.position.set(seat.x, 0, seat.z); g.rotation.y = seat.yaw; const cb = act.onDone; finish(act); if (cb) cb() }
    }
  }

  function typeBubble(b, dt) {
    b.acc += dt * 1000
    while (b.acc >= TYPE_MS && b.shown < b.full.length) { b.acc -= TYPE_MS; b.shown++ }
    b.textEl.textContent = b.full.slice(0, b.shown) + (b.shown < b.full.length ? '▍' : '')
    if (b.shown >= b.full.length && b.doneAt === null) b.doneAt = (b.view.act ? b.view.act.t : 0)
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

  // 上下班：按作息（金边时间）由真实的「暂停/恢复」状态触发，从正门进出
  const GATE = ENTRANCE.gate
  function furnitureRoute(v, points, seat, start = v.home) {
    if (layout?.version !== 3 || !furnitureCollision) return points
    const ignore = new Set([v.chair]), result = []
    let from = start
    const departure = furnitureCollision.seatBody(start)
    if (departure) ignore.add(departure)
    for (let i = 0; i < points.length; i++) {
      const point = points[i], last = i === points.length - 1
      if (last && seat) ignore.add(furnitureCollision.seatBody(seat))
      if (!last && furnitureCollision.hit(point.x, point.z, ignore)) continue
      const path = furnitureCollision.route(from, point, ignore)
      if (!path) throw new FurnitureBlockedError(`V3 furniture blocks route for ${v.name}`)
      result.push(...path); from = point
    }
    return result
  }
  function commutePath(v) {
    const exit = officeExit(v.home)
    return furnitureRoute(v, [...exit, ...corridorPath(exit.at(-1), ENTRANCE.inner), ...GATE])
  }

  function validRoute(points) {
    return Array.isArray(points) && points.length > 0 && points.every(point =>
      point &&
      typeof point === 'object' &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.z),
    )
  }

  function travel(v, pts, seat, lounge, onDone, standing = false) {
    if (v.act) return false
    if (!validRoute(pts)) {
      console.warn('[director] 拒绝无效路径', v.name || v.id || '')
      return false
    }
    try { pts = furnitureRoute(v, pts, seat, v.char.group.position) }
    catch (error) { if (!(error instanceof FurnitureBlockedError)) throw error; console.warn('[director] 无安全出行路线', error.message); return false }
    const fromLounge = gInLounge(v.char.group.position)
    const act = { ev: { kind: 'commute', text: '' }, view: v, phase: 'queued', t: 0, total: 0, yields: 0, pts, i: 0, back: true, carry: false, seat, lounge, onDone, standing, fromLounge, needsLane: lounge === true || fromLounge, origin: { x: v.char.group.position.x, z: v.char.group.position.z }, trail: [{ x: v.char.group.position.x, z: v.char.group.position.z }] }
    v.act = act
    active.add(act)
    return true
  }

  function setVisitPhase(visit, phase) {
    visit.phase = phase
    visit.v.visiting = { targetId: visit.plan.targetId, phase }
  }

  function finishVisit(visit) {
    visit.v.visiting = null
    visits.delete(visit.agentId)
    if (!visit.aborted && visit.onDone) visit.onDone()
  }

  function moveVisit(visit, pts) {
    if (!visits.has(visit.agentId)) return false
    const current = visit.v.char.group.position
    if (Math.hypot(current.x - visit.point.x, current.z - visit.point.z) <= 0.01) {
      setVisitPhase(visit, 'queued')
      return true
    }
    const started = travel(visit.v, pts, { ...visit.point, yaw: visit.plan.yaw ?? visit.v.char.group.rotation.y }, false, () => {
      if (!visits.has(visit.agentId)) return
      const p = visit.v.char.group.position
      if (Math.hypot(p.x - visit.point.x, p.z - visit.point.z) > 0.01) { setVisitPhase(visit, 'queued'); return }
      setVisitPhase(visit, 'queued')
    }, true)
    if (!started) {
      // 坏的消费者路线不能留在 queued 状态里逐帧重试。
      returnVisit(visit, 'invalidRoute')
      return false
    }
    setVisitPhase(visit, 'moving')
    return true
  }

  function advanceQueue(result) {
    for (const step of result.advance || []) {
      const visit = visits.get(step.agentId)
      if (!visit || visit.returning) continue
      visit.slot = step.to
      visit.point = step.point
    }
  }

  function leaveQueue(visit) {
    if (visit.released) return
    visit.released = true
    advanceQueue(visit.board.leave(visit.agentId))
  }

  function returnVisit(visit, reason) {
    if (!visits.has(visit.agentId) || visit.returning) return false
    visit.returning = true
    if (visit.v.act) finish(visit.v.act)
    visit.returnPoint = { x: visit.v.char.group.position.x, z: visit.v.char.group.position.z }
    leaveQueue(visit)
    if (reason) {
      visit.aborted = true
      visitAbortCount++
      if (visit.onAbort) visit.onAbort(reason)
    }
    setVisitPhase(visit, 'returning')
    return true
  }

  function startVisitReturn(visit) {
    visit.returnStarted = true
    const here = visit.v.char.group.position
    const baseBack = [visit.returnPoint, ...visit.plan.back.slice(1)]
    const departure = consumerDeparture(visit.plan.targetId, visit.returnPoint, baseBack)
    const back = [{ x: here.x, z: here.z }, ...departure.slice(1)]
    if (!travel(visit.v, back, visit.v.home, false, () => finishVisit(visit))) finishVisit(visit)
  }

  function cancelVisit(v, reason = 'cancelled', immediate = false) {
    const visit = [...visits.values()].find((item) => item.v === v)
    if (!visit) return false
    if (!immediate) return returnVisit(visit, reason)
    if (visit.v.act) finish(visit.v.act)
    leaveQueue(visit)
    if (reason) {
      visit.aborted = true
      visitAbortCount++
      if (visit.onAbort) visit.onAbort(reason)
    }
    finishVisit(visit)
    return true
  }

  function updateVisits(dt) {
    for (const visit of [...visits.values()]) {
      if (visit.returning) {
        if (visit.v.act) continue
        if (visit.returnStarted) finishVisit(visit)
        else if (![...visits.values()].some(other => other !== visit && other.returning && other.returnStarted && other.plan.targetId === visit.plan.targetId)) startVisitReturn(visit)
        continue
      }
      if (visit.v.away || visit.v.leaving) { returnVisit(visit, 'offDuty'); continue }
      if (visit.mode === 'waiting' && !visit.shouldStay()) { returnVisit(visit); continue }
      if (visit.mode !== 'waiting' && visit.v.waits?.length) { returnVisit(visit, 'recalled'); continue }
      if (visit.phase === 'moving' && !visit.v.act) { returnVisit(visit, 'timeout'); continue }
      if (visit.phase === 'queued') {
        const p = visit.v.char.group.position
        const atPoint = Math.hypot(p.x - visit.point.x, p.z - visit.point.z) <= 0.01
        const departing = [...visits.values()].some(other => other !== visit && other.returning && other.plan.targetId === visit.plan.targetId)
        const advancingAhead = visit.started && [...visits.values()].some(other => other !== visit && !other.returning && other.plan.targetId === visit.plan.targetId && other.slot < visit.slot && Math.hypot(other.v.char.group.position.x - other.point.x, other.v.char.group.position.z - other.point.z) > 0.01)
        const fillingBehind = !visit.started && [...visits.values()].some(other => other !== visit && !other.returning && other.plan.targetId === visit.plan.targetId && other.slot > visit.slot && Math.hypot(other.v.char.group.position.x - other.point.x, other.v.char.group.position.z - other.point.z) > 0.01)
        if (!atPoint && !departing && !advancingAhead && !fillingBehind && !visit.v.act) {
          const route = visit.started ? consumerAdvance(visit.plan.targetId, p, visit.point) : visit.plan.go
          visit.started = true
          moveVisit(visit, route)
          continue
        }
        const settled = [...visits.values()].every(other => other.plan.targetId !== visit.plan.targetId || other.returning || (!other.v.act && Math.hypot(other.v.char.group.position.x - other.point.x, other.v.char.group.position.z - other.point.z) <= 0.01))
        if (atPoint && settled && (visit.mode === 'waiting' || visit.board.head(visit.plan.targetId) === visit.agentId)) {
          setVisitPhase(visit, 'dwell'); visit.elapsed = 0
          if (!visit.arrived) { visit.arrived = true; if (visit.onArrive) visit.onArrive() }
        }
      }
      if (visit.phase === 'dwell') {
        visit.elapsed += dt
        if (visit.mode === 'waiting') {
          if (visit.elapsed >= visit.maxMs) returnVisit(visit, 'timeout')
        } else if (visit.elapsed >= visit.dwellMs) returnVisit(visit)
      }
    }
  }

  function visitConsumer(v, plan, options = {}) {
    const { board: queueBoard, agentId, onArrive, onDone, onAbort } = options
    const waiting = options.mode === 'waiting', stay = Number(options.dwellMs), maxMs = Number(options.maxMs ?? 600000)
    if (!plan?.ok || !queueBoard || typeof queueBoard.leave !== 'function' || typeof queueBoard.head !== 'function' || !agentId) return false
    if (waiting ? typeof options.shouldStay !== 'function' || !Number.isFinite(maxMs) || maxMs < 0 : !Number.isFinite(stay) || stay < 0) return false
    if (v.act || v.lounging || v.away || v.leaving || v.visiting || visits.has(agentId)) return false
    if (waiting ? !v.waits?.some(item => item?.kind === 'question') : v.waits?.length) return false
    const visit = { v, plan, board: queueBoard, agentId, mode: waiting ? 'waiting' : 'consumer', shouldStay: options.shouldStay, maxMs: maxMs / 1000, dwellMs: waiting ? 0 : stay / 1000, elapsed: 0, slot: plan.slot, point: plan.stand, onArrive, onDone, onAbort, phase: 'queued', released: false, returning: false, aborted: false, arrived: false, started: false }
    visits.set(agentId, visit)
    setVisitPhase(visit, 'queued')
    return true
  }

  return {
    // 走到某个座位坐下（去休息区 / 从休息区回工位）
    travel(v, pts, seat, lounge, onDone) {
      if (seatedOnly) return false
      return travel(v, pts, seat, lounge, onDone)
    },
    visitConsumer(v, plan, options) {
      return seatedOnly ? false : visitConsumer(v, plan, options)
    },
    cancelVisit,
    aisleZ,
    goHome(v, onDone) {
      if (seatedOnly) return false
      if (v.act) return false
      let pts
      try { pts = commutePath(v) } catch (error) { if (!(error instanceof FurnitureBlockedError)) throw error; console.warn('[director] 无安全下班路线', error.message); return false }
      const act = { ev: { kind: 'commute', text: '' }, view: v, phase: 'rise', t: 0, total: 0, stall: 0, yields: 0, pts, i: 0, back: false, carry: false, commute: 'leave', onDone, origin: { x: v.char.group.position.x, z: v.char.group.position.z }, trail: [{ x: v.char.group.position.x, z: v.char.group.position.z }] }
      v.act = act
      active.add(act)
      return true
    },
    arrive(v) {
      if (seatedOnly) return false
      if (v.act) return false
      let pts
      try { pts = commutePath(v).reverse().slice(1).concat([{ x: v.home.x, z: v.home.z }]) } catch (error) { if (!(error instanceof FurnitureBlockedError)) throw error; console.warn('[director] 无安全上班路线', error.message); return false }
      const g = v.char.group
      g.position.set(GATE[1].x, 0, GATE[1].z)
      g.rotation.y = 0
      v.char.pose.sit = 0
      const act = { ev: { kind: 'commute', text: '' }, view: v, phase: 'walk', t: 0, total: 0, stall: 0, yields: 0, pts, i: 0, back: true, carry: false, commute: 'arrive', origin: { x: GATE[1].x, z: GATE[1].z }, trail: [{ x: GATE[1].x, z: GATE[1].z }] }
      if (layout?.version === 3) { act.phase = 'entry'; v.away = true; v.arriving = true; g.visible = false }
      v.act = act
      active.add(act)
      return true
    },
    enqueue(ev) {
      if (seatedOnly) return
      if (queue.length >= MAX_QUEUE) queue.shift()
      const actor = views.get(ev.from), target = views.get(ev.to)
      if (actor?.visiting) cancelVisit(actor, 'event')
      if (target?.visiting) cancelVisit(target, 'event')
      queue.push({ ...ev })
    },
    clear() {
      for (const visit of [...visits.values()]) { leaveQueue(visit); visit.v.visiting = null }
      visits.clear()
      for (const a of [...active]) finish(a)
      queue.length = 0
    },
    update(dt) {
      // V3 arrivals wait outside the rendered scene until the doorway is clear.
      for (const act of active) if (act.phase === 'entry') {
        const gate = GATE[1], people = [...views.values(), ...Object.values(board)]
        if ([...active].some(a => a.commute === 'leave') || [...active].filter(isWalker).length >= MAX_WALKERS) break
        if (people.some(v => v !== act.view && !v.away && Math.hypot(v.char.group.position.x - gate.x, v.char.group.position.z - gate.z) < PERSON_GAP * 1.5)) break
        act.view.away = false; act.view.arriving = false; act.view.char.group.visible = true; act.phase = 'walk'
      }
      // 已在座位等候的出行先申请空位，不能被新事件持续插队。
      for (const act of active) if (act.phase === 'queued' && !act.yielding) {
        const moving = [...active].filter(isWalker).length
        if (moving >= MAX_WALKERS || (act.needsLane && loungeLane)) continue
        if (act.needsLane) loungeLane = act
        act.phase = 'rise'; act.t = 0
      }
      // 取队列里第一个「可以开始」的事件
      for (let i = 0; i < queue.length; i++) {
        const ev = queue[i]
        const walking = [...active].filter(isWalker).length
        const needsWalker = ev.kind !== 'speak' && ev.kind !== 'board_decision'
        if (needsWalker && walking >= MAX_EVENT_WALKERS) continue
        if (!needsWalker && bubbles.size >= MAX_BUBBLES) continue
        const actor = ev.kind === 'board_decision' ? null : views.get(ev.from)
        const tv = ev.to && ev.to !== 'board' ? views.get(ev.to) : null
        if ((actor && actor.away) || (tv && tv.away)) { queue.splice(i, 1); i--; continue } // 已下班的人不演
        if (actor?.visiting || tv?.visiting) continue // 访问被打断后先沿原路回工位，再演事件
        if (actor && actor.act) continue // 这个人正忙，稍后再来
        if (actor && isEngaged(actor)) continue // 正有人在跟他说话，不能起身走开
        // 在休息区的人：先回工位，再演这个事件
        if (!ev.lounge && ((actor && actor.lounging) || (tv && tv.lounging))) { if (needDesk) { if (actor && actor.lounging) needDesk(actor); if (tv && tv.lounging) needDesk(tv) } continue }
        const target = ev.to && ev.to !== 'board' ? views.get(ev.to) : null
        if (needsWalker && target && target.act) continue // 对方不在工位：等他回来再去，不对着空椅子派活
        queue.splice(i, 1)
        i--
        if (!startAction(ev)) continue
      }
      for (const act of [...active]) stepAct(act, dt)
      updateVisits(dt)
      for (const b of bubbles) {
        const head = b.view.char.body.head
        head.getWorldPosition(project.tmp)
        project.fn(project.tmp, b.el, 0.35)
      }
    },
    stats() { return { queued: queue.length, active: active.size, bubbles: bubbles.size, yields: yieldCount, abandons: abandonCount, timeouts: timeoutCount, visits: visits.size, visitAborts: visitAbortCount } },
  }
}
