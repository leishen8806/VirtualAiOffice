import { BOARD_DOOR, CORRIDOR_X, CORRIDORS, CROSS_Z, ENTRANCE, ENVELOPE, FOYER_Z, LOUNGE_AREA, LOUNGE_SEATS, OFFICE_ROOMS, PLAZA, RECEPTION, SEATS, corridorPath, officeExit, roomSegments, workHome, createOfficeNavigation } from './office-layout.js'
import { PERSON_GAP } from './pedestrian-traffic.js'

export const CAT_COOLDOWN_MS = 1500
export const CAT_IDLE_EXIT_MS = 15000
export const CAT_BALL_MS = 10000
export const CAT_REACTIONS = ['meow', 'rub', 'stretch', 'wander']

const inside = (p, r, pad = 0) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.z > r.z0 - pad && p.z < r.z1 + pad
export function isPublicPoint(p) {
  const gate = p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1 && p.z >= ENVELOPE.z1 && p.z <= PLAZA.z0
  const floor = inside(p, ENVELOPE) || inside(p, PLAZA) || gate
  return Boolean(floor && !OFFICE_ROOMS.some(r => inside(p, r, 0.12)))
}

export const CAT_DESTINATIONS = {
  foyer: { ...ENTRANCE.inner },
  plaza: { x: (PLAZA.x0 + PLAZA.x1) / 2, z: (PLAZA.z0 + PLAZA.z1) / 2 },
  lounge: { x: LOUNGE_AREA.x, z: LOUNGE_AREA.entryZ },
  board: { x: BOARD_DOOR.x - 1.6, z: CORRIDORS.horizontal.z0 + 0.7 },
  rearWindow: { x: CORRIDOR_X, z: ENVELOPE.z0 + 0.7 },
}

export const catDeskAnchor = (home) => ({ x: home.x + 1, z: home.z })
// 桌面左前角避开中间的显示器/键盘、右侧鼠标和两侧随机摆件。
export const catDeskTopPoint = (home) => ({ x: home.x - 0.58, z: home.z - 0.72 })

export function catFurnitureBoxes() {
  const desks = Object.values(SEATS).flatMap(([, x, z]) => [
    { x0: x - 0.92, x1: x + 0.92, z0: z - 0.52, z1: z + 0.52, kind: 'desk' },
    { x0: x - 0.38, x1: x + 0.38, z0: z + 0.62, z1: z + 1.38, kind: 'chair' },
  ])
  const lounge = LOUNGE_SEATS.map((s) => ({ x0: s.x - 0.72, x1: s.x + 0.72, z0: s.z - 0.52, z1: s.z + 0.52, kind: 'lounge' }))
  return [...desks, ...lounge,
    { x0: RECEPTION.x - RECEPTION.width / 2 - 0.2, x1: RECEPTION.x + RECEPTION.width / 2 + 0.2, z0: RECEPTION.z0 - 0.2, z1: RECEPTION.z1 + 0.2, kind: 'reception' },
    { x0: 7.2, x1: 14.8, z0: -9.7, z1: -6.3, kind: 'boardTable' },
    { x0: 18.6, x1: 21.4, z0: -9.0, z1: -7.0, kind: 'bossDesk' },
  ]
}

const pointInBox = (p, b, pad = 0) => p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.z >= b.z0 - pad && p.z <= b.z1 + pad
const wallPoint = (p) => OFFICE_ROOMS.some((room) => roomSegments(room).some((s) => {
  const vertical = s.side === 'west' || s.side === 'east'
  const fixed = vertical ? (s.side === 'west' ? room.x0 : room.x1) : (s.side === 'north' ? room.z0 : room.z1)
  const along = vertical ? p.z : p.x
  return Math.abs((vertical ? p.x : p.z) - fixed) < 0.11 && along >= s.lo - 0.01 && along <= s.hi + 0.01
}))
export const isCatGroundPoint = (p) => {
  const gate = p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1 && p.z >= ENVELOPE.z1 && p.z <= PLAZA.z0
  const floor = pointInBox(p, ENVELOPE) || pointInBox(p, PLAZA) || gate
  return floor && !wallPoint(p) && !catFurnitureBoxes().some(b => pointInBox(p, b, 0.3))
}

export function nearestCatGroundPoint(from, maxRadius = 0.85) {
  if (isCatGroundPoint(from)) return { x: from.x, z: from.z }
  for (let radius = 0.05; radius <= maxRadius + 1e-9; radius += 0.05) for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16, point = { x: from.x + Math.cos(angle) * radius, z: from.z + Math.sin(angle) * radius }
    if (isCatGroundPoint(point)) return point
  }
  return null
}

export function catSegmentSafe(a, b) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05))
  for (let i = 1; i <= steps; i++) {
    const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }
    if (!isCatGroundPoint(p)) return false
  }
  return true
}

export function catJumpSegmentSafe(a, b) {
  const homes = Object.values(SEATS).map(workHome)
  const deskHome = homes.find((home) => [a, b].some((p) => {
    const top = catDeskTopPoint(home)
    return Math.hypot(top.x - p.x, top.z - p.z) < 0.05
  }))
  if (!deskHome) return catSegmentSafe(a, b)
  const boxes = catFurnitureBoxes(), allowed = boxes.find((box) => box.kind === 'desk' && Math.abs((box.x0 + box.x1) / 2 - deskHome.x) < 0.01 && Math.abs((box.z0 + box.z1) / 2 - (deskHome.z - 1)) < 0.01)
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05))
  for (let i = 0; i <= steps; i++) {
    const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }
    const gate = p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1 && p.z >= ENVELOPE.z1 && p.z <= PLAZA.z0
    if ((!pointInBox(p, ENVELOPE) && !pointInBox(p, PLAZA) && !gate) || wallPoint(p)) return false
    if (boxes.some((box) => box !== allowed && pointInBox(p, box, 0.08))) return false
  }
  return true
}

const dedupe = (points) => points.filter((p, i) => !i || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 0.03)
function detour(start, end) {
  const step = 0.25, margin = 4, key = (x, z) => `${x},${z}`
  const first = { x: start.x, z: start.z, ix: 0, iz: 0, cost: 0, prev: null }, open = [first], best = new Map([[key(0, 0), 0]])
  const score = p => p.cost + Math.hypot(p.x - end.x, p.z - end.z)
  for (let count = 0; open.length && count < 18000; count++) {
    let at = 0
    for (let i = 1; i < open.length; i++) if (score(open[i]) < score(open[at])) at = i
    const cur = open.splice(at, 1)[0]
    if (Math.hypot(cur.x - end.x, cur.z - end.z) < step * 1.5 && catSegmentSafe(cur, end)) {
      const path = [{ ...end }]
      for (let p = cur; p.prev; p = p.prev) path.unshift({ x: p.x, z: p.z })
      const simple = []; let anchor = start
      for (let i = 0; i < path.length;) {
        let j = path.length - 1
        while (j > i && !catSegmentSafe(anchor, path[j])) j--
        simple.push(path[j]); anchor = path[j]; i = j + 1
      }
      return simple
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ix = cur.ix + dx, iz = cur.iz + dz, x = start.x + ix * step, z = start.z + iz * step
      if (x < Math.min(start.x, end.x) - margin || x > Math.max(start.x, end.x) + margin || z < Math.min(start.z, end.z) - margin || z > Math.max(start.z, end.z) + margin) continue
      const cost = cur.cost + Math.hypot(dx, dz) * step, k = key(ix, iz), next = { x, z, ix, iz, cost, prev: cur }
      if (cost >= (best.get(k) ?? Infinity) || !catSegmentSafe(cur, next)) continue
      best.set(k, cost); open.push(next)
    }
  }
  return null
}
function refineRoute(start, points) {
  const result = []; let anchor = start
  if (!isCatGroundPoint(anchor)) {
    // 出生点可能被后续家具覆盖；只用正常步长走到最近的可走地面。
    const safe = nearestCatGroundPoint(anchor)
    if (!safe) return null
    result.push(safe); anchor = safe
  }
  for (const point of points) {
    const part = catSegmentSafe(anchor, point) ? [{ ...point }] : detour(anchor, point)
    if (!part) return null
    result.push(...part); anchor = point
  }
  return dedupe(result)
}
const inLounge = (p) => Math.abs(p.x - LOUNGE_AREA.x) <= LOUNGE_AREA.width / 2 + 0.3 && Math.abs(p.z - LOUNGE_AREA.z) <= LOUNGE_AREA.depth / 2 + 0.3
const pathToHub = (p) => {
  const hub = { x: CORRIDOR_X, z: CROSS_Z }
  if (inLounge(p)) return dedupe([{ ...p }, { x: p.x, z: LOUNGE_AREA.entryZ }, { x: CORRIDOR_X, z: LOUNGE_AREA.entryZ }, ...corridorPath({ x: CORRIDOR_X, z: LOUNGE_AREA.entryZ }, hub)])
  if (inside(p, PLAZA)) return dedupe([{ ...p }, { x: CORRIDOR_X, z: p.z }, ...ENTRANCE.gate.slice().reverse(), ENTRANCE.inner, ...corridorPath(ENTRANCE.inner, hub)])
  return dedupe([{ ...p }, ...corridorPath(p, hub)])
}
function publicRoute(from, to) {
  if (catSegmentSafe(from, to)) return [{ ...to }]
  const a = pathToHub(from), b = pathToHub(to).reverse()
  return dedupe([...a, ...b.slice(1)]).slice(1)
}

export function catRoute(from, to, { fromDeskHome = null, toDeskHome = null } = {}) {
  const fromRoom = OFFICE_ROOMS.find((room) => inside(from, room)), toRoom = OFFICE_ROOMS.find((room) => inside(to, room))
  if (!fromDeskHome && !toDeskHome && fromRoom && fromRoom === toRoom) return refineRoute(from, [{ ...to }])
  const homes = Object.values(SEATS).map(workHome)
  if (!fromDeskHome) fromDeskHome = homes.find((home) => {
    const anchor = catDeskAnchor(home), top = catDeskTopPoint(home)
    return Math.min(Math.hypot(anchor.x - from.x, anchor.z - from.z), Math.hypot(top.x - from.x, top.z - from.z)) <= 1.1
  }) || null
  if (!toDeskHome) toDeskHome = homes.find((home) => {
    const anchor = catDeskAnchor(home)
    return Math.hypot(anchor.x - to.x, anchor.z - to.z) <= 0.3
  }) || null
  const fromExit = fromDeskHome ? officeExit(fromDeskHome) : null
  const toExit = toDeskHome ? officeExit(toDeskHome) : null
  const publicFrom = fromExit?.at(-1) || from
  const publicTo = toExit?.at(-1) || to
  const semantic = dedupe([
    ...(fromExit ? [{ ...from }, ...fromExit] : [{ ...from }]),
    ...publicRoute(publicFrom, publicTo),
    ...(toExit ? toExit.slice().reverse().slice(1) : []),
  ]).slice(1)
  return refineRoute(from, semantic)
}

export function planHop(from, to, { segmentSafe = () => true } = {}) {
  const dist = Math.hypot(to.x - from.x, to.z - from.z)
  if (dist <= 1 && segmentSafe(from, to)) return { mode: 'hop', from: { ...from }, to: { ...to }, jumpFrom: { ...from }, dur: Math.max(0.45, dist / 2.5) }
  const groundNear = (center, toward, reachableFrom = null) => {
    const angle = Math.atan2(toward.z - center.z, toward.x - center.x)
    const candidates = []
    for (const radius of [0.45, 0.65, 0.85, 0.98]) for (let i = 0; i < 16; i++) {
      const a = angle + (i ? (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 8 : 0)
      const p = { x: center.x + Math.cos(a) * radius, z: center.z + Math.sin(a) * radius }
      if (segmentSafe(p, p) && segmentSafe(p, center)) candidates.push(p)
    }
    if (reachableFrom) {
      const reachable = candidates.find((p) => segmentSafe(reachableFrom, p))
      if (reachable) return reachable
    }
    if (candidates.length) return candidates[0]
    return { ...toward }
  }
  const jumpFrom = groundNear(to, from, from), landAt = groundNear(from, to)
  const jumpDist = Math.hypot(jumpFrom.x - to.x, jumpFrom.z - to.z)
  return { mode: 'walk', walkTo: { ...jumpFrom }, jumpFrom, landAt, to: { ...to }, dur: Math.max(0.45, jumpDist / 2.5), unsafe: !segmentSafe(from, to) }
}

export function classifyJump(prev, next, { threshold = 0.6 } = {}) {
  if (!prev) return { kind: 'first', dist: 0 }
  const dist = Math.hypot((next.x || 0) - (prev.x || 0), (next.y || 0) - (prev.y || 0), (next.z || 0) - (prev.z || 0))
  return { kind: dist > threshold ? 'anomaly' : dist > 0.075 ? 'hop' : dist > 0 ? 'normal' : 'still', dist }
}

const safeWhy = (why = '') => String(why)
  .replace(/^去找\s+.+$/, '去找同事')
  .replace(/^蹭\s+.+$/, '蹭同事')
  .replace(/^在\s+.+\s+的桌上睡觉$/, '在桌上睡觉')

export function createCatDiagBuffer(cap = 50, { now = Date.now, warn = console.warn, warnWindowMs = 10000 } = {}) {
  const items = [], warned = new Map()
  const clone = (x) => ({ ...x, from: x.from && { ...x.from }, to: x.to && { ...x.to }, target: x.target && { ...x.target } })
  return {
    record(event) {
      const at = event.at ?? now(), item = { ...event, at, why: safeWhy(event.why) }
      items.push(clone(item)); if (items.length > cap) items.splice(0, items.length - cap)
      const key = item.reason || item.why || item.mode || 'unknown', last = warned.get(key) ?? -Infinity
      if (at - last >= warnWindowMs) { warned.set(key, at); warn(`[cat] 位移异常 ${key}${Number.isFinite(item.dist) ? ` ${item.dist.toFixed(2)}m` : ''}`) }
      return clone(item)
    },
    list: () => items.map(clone),
    clear() { items.length = 0; warned.clear() },
  }
}

export function catRoamPoints() {
  const candidates = [
    ...OFFICE_ROOMS.map((r) => ({ x: r.doors[0].at, z: CROSS_Z + (r.doors[0].side === 'south' ? -0.5 : 0.5) })),
    { x: CORRIDOR_X, z: CROSS_Z }, { x: CORRIDOR_X, z: FOYER_Z }, CAT_DESTINATIONS.foyer,
    CAT_DESTINATIONS.lounge, CAT_DESTINATIONS.board, CAT_DESTINATIONS.rearWindow, CAT_DESTINATIONS.plaza,
  ]
  return dedupe(candidates).filter(isCatGroundPoint)
}

export function catTarget(raw) {
  const p = { x: Number(raw?.x) || 0, z: Number(raw?.z) || 0 }
  const room = OFFICE_ROOMS.find(r => inside(p, r))
  if (!room) return { point: isPublicPoint(p) ? p : { x: Math.max(PLAZA.x0, Math.min(PLAZA.x1, p.x)), z: Math.max(PLAZA.z0, Math.min(PLAZA.z1, p.z)) }, room: null, lookAt: null }
  const door = room.doors[0], north = door.side === 'south', side = door.at + (door.width || 2) / 2 + 0.35
  const x = Math.min(room.x1 - 0.25, Math.max(room.x0 + 0.25, side))
  return { point: { x, z: north ? room.z1 + 0.65 : room.z0 - 0.65 }, room: room.id, lookAt: p }
}

export function chooseCatReaction(last, random = Math.random) {
  const choices = CAT_REACTIONS.filter(x => x !== last)
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
}

export function createCatPlayState(at = 0) {
  return { enabled: false, mode: 'idle', target: null, lookAt: null, ball: null, lastPointerAt: at, lastReactAt: -Infinity, lastReaction: null, actionUntil: 0 }
}

export function toggleCatPlay(s, on, at) {
  s.enabled = on == null ? !s.enabled : Boolean(on)
  s.lastPointerAt = at
  if (!s.enabled) { s.mode = 'idle'; s.target = null; s.lookAt = null; s.ball = null; s.actionUntil = 0 }
  return s.enabled
}

export function reactCat(s, at, random = Math.random) {
  if (at - s.lastReactAt < CAT_COOLDOWN_MS) return null
  const reaction = chooseCatReaction(s.lastReaction, random)
  s.lastReactAt = at; s.lastReaction = reaction; s.mode = reaction; s.actionUntil = at + (reaction === 'wander' ? 2500 : 1200)
  return reaction
}

export function aimCat(s, raw, at, ball = false, navigation = null) {
  if (!s.enabled) return false
  const t = (navigation?.catTarget || catTarget)(raw)
  s.lastPointerAt = at; s.target = t.point; s.lookAt = t.lookAt
  if (ball) s.ball = { point: { ...t.point }, bornAt: at, batted: false }
  s.mode = 'chase'
  return true
}

function safeStep(position, dx, dz, publicPoint = isPublicPoint) {
  const tries = [[dx, dz], [dx, 0], [0, dz], [-dz, dx], [dz, -dx]]
  for (const [x, z] of tries) { const p = { x: position.x + x, z: position.z + z }; if (publicPoint(p)) return p }
  return { ...position }
}

export function updateCatPlay(s, { now, dt, position, people = [], navigation = null }) {
  const targetAt = navigation?.catTarget || catTarget, routeTo = navigation?.catRoute || catRoute
  if (!s.enabled) return false
  if (now - s.lastPointerAt >= CAT_IDLE_EXIT_MS) { toggleCatPlay(s, false, now); return { enabled: false, expired: true, position: { ...position } } }
  if (s.ball && now - s.ball.bornAt >= CAT_BALL_MS) s.ball = null
  if (now < s.actionUntil) return { enabled: true, moved: false, mode: s.mode, position: { ...position } }
  const raw = s.ball?.point || s.target
  if (!raw) { s.mode = 'idle'; return { enabled: true, moved: false, mode: s.mode, position: { ...position } } }
  const t = targetAt(raw), route = routeTo(position, t.point)
  if (!route) { s.mode = 'idle'; return { enabled: true, moved: false, unreachable: true, mode: s.mode, position: { ...position } } }
  const waypoint = route[0] || t.point
  const dx = waypoint.x - position.x, dz = waypoint.z - position.z, d = Math.hypot(dx, dz)
  if (d < 0.22) {
    if (s.ball && !s.ball.batted) {
      const roll = targetAt({ x: s.ball.point.x + (Math.abs(dx) < 0.01 ? 1 : dx / Math.max(d, 0.01)), z: s.ball.point.z + (Math.abs(dz) < 0.01 ? 0.7 : dz / Math.max(d, 0.01)) }).point
      s.ball.point = roll; s.ball.batted = true; s.mode = 'batting'; s.actionUntil = now + 700
    } else { s.mode = 'pounce'; s.actionUntil = now + 650; if (s.ball?.batted) s.target = null }
    return { enabled: true, moved: false, mode: s.mode, position: { ...position }, pounce: true }
  }
  const step = Math.min(d, 0.48 * Math.max(0, dt)), next = safeStep(position, dx / d * step, dz / d * step, navigation?.isCatGroundPoint)
  if (people.some(p => Math.hypot(next.x - p.x, next.z - p.z) < PERSON_GAP)) { s.mode = 'wander'; return { enabled: true, moved: false, yield: true, mode: s.mode, position: { ...position } } }
  s.mode = 'chase'
  return { enabled: true, moved: next.x !== position.x || next.z !== position.z, mode: s.mode, position: next, target: t.point, lookAt: t.lookAt }
}

export function createCatNavigation(layout, collision) {
  if (layout?.version !== 2) return null
  const nav = createOfficeNavigation(layout), homes = Object.values(layout.seats).map(workHome)
  const clearSegment = (a,b,ignore) => {
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05))
    for(let i=0;i<=steps;i++)if(collision.hit(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,ignore))return false
    return true
  }
  const ground = p => p.z >= layout.envelope.z0 + .3 && (inside(p, layout.envelope) || inside(p, layout.plaza)) && !collision.hit(p.x, p.z)
  const target = raw => {
    const p = { x: Number(raw?.x) || 0, z: Number(raw?.z) || 0 }, room = nav.roomAt(p)
    if (room) { const door = room.doors[0]; return { point: { x: door.at, z: door.side === 'south' ? -8 : 6 }, room: room.id, lookAt: p } }
    if (ground(p)) return { point: p, room: null, lookAt: null }
    for (let r = .25; r <= 8; r += .25) for (let i = 0; i < 32; i++) {
      const q = { x: p.x + Math.cos(i * Math.PI / 16) * r, z: p.z + Math.sin(i * Math.PI / 16) * r }
      if (ground(q) && !nav.roomAt(q)) return { point: q, room: null, lookAt: null }
    }
    return { point: { x: 2, z: 6 }, room: null, lookAt: null }
  }
  const route = (from, to, { fromDeskHome = null, toDeskHome = null } = {}) => {
    const a = fromDeskHome || (nav.roomAt(from) ? from : null), b = toDeskHome || (nav.roomAt(to) ? to : null)
    const exit = a ? nav.officeExit(a) : [], entry = b ? nav.officeExit(b).toReversed() : []
    const points = nav.roomAt(from) && nav.roomAt(from) === nav.roomAt(to) ? [to] : [...exit, ...nav.corridorPath(exit.at(-1) || from, entry[0] || to), ...entry.slice(1), to]
    const result = []; let here = from
    for (const point of points) {
      if (Math.hypot(here.x-point.x,here.z-point.z)<.001) continue
      const part = collision.route(here,point)
      if (!part) return null
      result.push(...part); here=point
    }
    return result
  }
  const destinations = { foyer: nav.ENTRANCE.inner, plaza: CAT_DESTINATIONS.plaza, lounge: { x: -5, z: -1 }, board: { x: -22.5, z: -8 }, rearWindow: { x: 2, z: -17 } }
  const api = {
    CAT_DESTINATIONS: destinations, catTarget: target, isCatGroundPoint: ground, catRoute: route,
    catRoamPoints: () => [...Object.values(destinations), ...layout.regions.map(r=>({x:r.doors[0].at,z:r.doors[0].side==='south'?-8:6}))].filter(ground),
    catJumpSegmentSafe: (a,b) => {
      const home=homes.find(h=>[a,b].some(p=>Math.hypot(p.x-catDeskTopPoint(h).x,p.z-catDeskTopPoint(h).z)<.05))
      const body=home&&collision.hit(catDeskTopPoint(home).x,catDeskTopPoint(home).z)
      return clearSegment(a,b,body?.kind==='desk'?body.group:undefined)
    },
    aimCat: (s,p,at,ball) => aimCat(s,p,at,ball,api),
    updateCatPlay: (s,options) => updateCatPlay(s,{...options,navigation:api}),
  }
  return api
}
