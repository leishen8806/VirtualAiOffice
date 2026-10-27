import { barSpec, barGaps, barColliders, barSeats, barLounges } from './office-bar-geometry.js'
import { marketSamplePose, marketSamplePlan, marketSampleBounds } from './office-vis2/furniture-sample.js'

export const DISPLAY_DEPARTMENTS = Object.freeze(['market', 'service', 'aftersales', 'marketing'])
export const DISPLAY_LABEL = '展示部门 · 模拟角色'
const HOUR = 3600000
const STEP = .25
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export function displayObstacleHit(p, b, margin = .22) {
  if (b.angle !== undefined) {
    const dx = p.x - b.x, dz = p.z - b.z, c = Math.cos(b.angle), s = Math.sin(b.angle)
    const x = Math.max(0, Math.abs(dx * c + dz * s) - .5)
    const z = Math.max(0, Math.abs(-dx * s + dz * c) - .675)
    return Math.hypot(x, z) < margin
  }
  return p.x > b.x0 - margin && p.x < b.x1 + margin && p.z > b.z0 - margin && p.z < b.z1 + margin
}
export function displayConfig(value, search = '') {
  let data = value
  try { if (typeof value === 'string') data = JSON.parse(value) } catch { data = null }
  const params = new URLSearchParams(String(search).replace(/^\?/, ''))
  return Object.freeze({ enabled: data?.enabled === true || (params.getAll('display').length === 1 && params.get('display') === '1'),
    countPerDepartment: 3 })
}
export function displayRoster(layout) {
  if (layout?.version !== 2) return []
  return DISPLAY_DEPARTMENTS.flatMap(department => layout.displaySeats.filter(s => s.region === department).slice(0, 3)
    .map((s, index) => ({ id: `sim-${s.id}`, department, label: `模拟 ${index + 1}`, synthetic: true,
      home: s.home ? { ...s.home } : { x: s.x, z: s.z + .8 }, desk: { x: s.x, z: s.z }, yaw: s.yaw || 0,
      ...(department==='market'?marketSamplePose(layout,index):null) })))
}
export function displayFurnitureBounds(layout) {
  const people=displayRoster(layout),sample=layout.marketSample===true&&marketSamplePlan(layout)
  const boxes=people.filter(p=>!(sample&&p.department==='market')).flatMap(person => {
    const side=Math.abs(Math.sin(person.yaw))>.5
    return [
      { id: `${person.id}-desk`, x0: person.desk.x-(side?.28:.5), x1: person.desk.x+(side?.28:.5), z0: person.desk.z-(side?.5:.28), z1: person.desk.z+(side?.5:.28) },
      { id: `${person.id}-chair`, x0: person.home.x-(side?.26:.23), x1: person.home.x+(side?.26:.23), z0: person.home.z-(side?.23:.23), z1: person.home.z+(side?.23:.26) },
    ]
  })
  if(sample){
    boxes.push(...(layout.marketObstacles||marketSampleBounds(sample)))
  }
  return boxes
}
function clearLine(a, b, allowed, boxes) {
  const count = Math.max(1, Math.ceil(distance(a, b) / .08))
  for (let i = 1; i <= count; i++) {
    const p = { x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count }
    if (!allowed(p) || boxes.some(box => displayObstacleHit(p, box))) return false
  }
  return true
}
// 展示专用有界网格，只搜索本部门或吧台缓冲，不借用真实同事导演。
function route(a, b, bounds, boxes, allowed, spacing = STEP) {
  if (clearLine(a, b, allowed, boxes)) return [a, b]
  const open = [{ ...a, ix: 0, iz: 0, cost: 0, previous: null }]
  const best = new Map([['0:0', 0]])
  for (let n = 0; open.length && n < 20000; n++) {
    let index = 0
    for (let i = 1; i < open.length; i++) if (open[i].cost + distance(open[i], b) < open[index].cost + distance(open[index], b)) index = i
    const p = open.splice(index, 1)[0]
    if (distance(p, b) < spacing * 1.5 && clearLine(p, b, allowed, boxes)) {
      const path = [b]
      for (let node = p; node; node = node.previous) path.unshift({ x: node.x, z: node.z })
      const simple = [a]
      for (let i = 1; i < path.length;) {
        let j = path.length - 1
        while (j > i && !clearLine(simple.at(-1), path[j], allowed, boxes)) j--
        simple.push(path[j]); i = j + 1
      }
      return simple
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ix = p.ix + dx, iz = p.iz + dz, x = a.x + ix * spacing, z = a.z + iz * spacing
      const key = `${ix}:${iz}`, cost = p.cost + spacing * Math.hypot(dx, dz)
      if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1 || cost >= (best.get(key) ?? Infinity)) continue
      const next = { x, z, ix, iz, cost, previous: p }
      if (!clearLine(p, next, allowed, boxes)) continue
      best.set(key, cost); open.push(next)
    }
  }
  throw new Error('DISPLAY_ROUTE_UNAVAILABLE')
}
export function displayBarObstacles(layout) {
  return [...barColliders(layout), ...barSeats(layout).map(s => ({ id: s.id, x0: s.x - .29, x1: s.x + .29, z0: s.z - .29, z1: s.z + .29 })),
    ...barLounges(layout).map(s => ({ id: s.id, x: s.x, z: s.z, angle: s.angle }))]
}
export function displayRoute(layout, person) {
  const room = layout.regions.find(r => r.id === person.department), door = room.doors[0]
  if (layout.displayAdapter === 'v3' && layout.variant === 'align') {
    const normal = door.side === 'south' ? { x: 0, z: 1 } : door.side === 'north' ? { x: 0, z: -1 }
      : door.side === 'west' ? { x: -1, z: 0 } : { x: 1, z: 0 }
    const inside = {
      x: door.side === 'east' ? room.x1 - .6 : door.side === 'west' ? room.x0 + .6 : door.at,
      z: door.side === 'south' ? room.z1 - .6 : door.side === 'north' ? room.z0 + .6 : door.at,
    }
    const outside = { x: inside.x + normal.x * 1.5, z: inside.z + normal.z * 1.5 }
    const boxes = displayFurnitureBounds(layout).filter(b => b.id !== `${person.id}-chair`)
    const inRoom = p => p.x >= room.x0 + .25 && p.x <= room.x1 - .25 && p.z >= room.z0 + .25 && p.z <= room.z1 - .25
    let interior
    if(layout.marketSample===true&&marketSamplePlan(layout)&&person.department==='market'){
      // 只豁免本人起身0.7m；东西两侧各走椅背外通道，东席绕南端到既有南门。
      const east=person.yaw>0,step={x:person.home.x+(east?.7:-.7),z:person.home.z}
      const spine={x:east?room.x1-1.4:room.x0+1.4,z:person.home.z},all=displayFurnitureBounds(layout)
      const lane=p=>inRoom(p)&&(east?p.x>=person.home.x+.5:p.x<=inside.x+1e-6)
      const entry=east?{x:spine.x,z:room.z1-.7}:inside
      interior=[person.home,step,...route(step,spine,room,all,lane).slice(1),...route(spine,entry,room,all,lane).slice(1),...(east?route(entry,inside,room,all,inRoom).slice(1):[])]
    }else interior=route(person.home,inside,room,boxes,inRoom)
    const go = [...interior, outside]
    const length = go.reduce((sum, p, i) => sum + (i ? distance(p, go[i - 1]) : 0), 0)
    return Object.freeze({ go, back: go.toReversed(), length, side: normal.x < 0 ? 'west' : normal.x > 0 ? 'east' : person.home.x < 2 ? 'west' : 'east', gapAccess: false, reason: 'V3_DISPLAY_ROUTE', durationMs: (length * 2 / 1.4 + 20) * 1000 })
  }
  const north = door.side === 'south', hallway = layout.corridors[north ? 'north' : 'south']
  const z = (hallway.z0 + hallway.z1) / 2, edge = north ? room.z1 : room.z0
  const inside = { x: door.at, z: edge + (north ? -.6 : .6) }, outside = { x: door.at, z }
  if (layout.displayAdapter === 'v3') {
    const go = [person.home, inside, outside]
    const length = go.reduce((sum, p, i) => sum + (i ? distance(p, go[i - 1]) : 0), 0)
    return Object.freeze({ go, back: go.toReversed(), length, side: person.home.x < 2 ? 'west' : 'east', gapAccess: false, reason: 'V3_DISPLAY_ROUTE', durationMs: (length * 2 / 1.4 + 20) * 1000 })
  }
  const boxes = displayFurnitureBounds(layout).filter(b => b.id !== `${person.id}-chair`)
  const inRoom = p => p.x >= room.x0 + .3 && p.x <= room.x1 - .3 && p.z >= room.z0 + .3 && p.z <= room.z1 - .3
  const exit = route(person.home, inside, room, boxes, inRoom)
  const spec = barSpec(layout), r = (spec.ring.r0 + spec.ring.r1) / 2
  const west = person.home.x < spec.center.x, side = west ? 'west' : 'east'
  const split = Math.asin(.5 / r)
  const first = (north ? -Math.PI / 2 : Math.PI / 2) + (west ? (north ? -split : split) : (north ? split : -split))
  const last = west ? (north ? -Math.PI : Math.PI) : 0
  const count = Math.ceil(Math.abs(last - first) / .06)
  const arc = Array.from({ length: count + 1 }, (_, i) => {
    const angle = first + (last - first) * i / count
    return { x: spec.center.x + Math.cos(angle) * r, z: spec.center.z + Math.sin(angle) * r }
  })
  const gap = barGaps(layout).find(g => g.side === side)
  // O5 尚未提供沙发弧穿行路线；停在缺口对应的通行环外侧，不穿过沙发。
  const target = { x: spec.center.x + (west ? -1 : 1) * (spec.ring.r0 + .5), z: (gap.z0 + gap.z1) / 2 }
  const go = [...exit, { x: door.at, z: edge }, outside, { x: arc[0].x, z }, ...arc, target]
    .filter((p, i, all) => !i || distance(p, all[i - 1]) > 1e-6)
  const length = go.reduce((sum, p, i) => sum + (i ? distance(p, go[i - 1]) : 0), 0)
  return Object.freeze({ go, back: go.toReversed(), length, side, gapAccess: false, reason: 'O5_GAP_ROUTE_NOT_CONNECTED',
    durationMs: (length * 2 / 1.4 + 20) * 1000 })
}
export function displayHash(text) {
  let value = 2166136261
  for (const c of String(text)) value = Math.imul(value ^ c.charCodeAt(0), 16777619)
  return value >>> 0
}
export function displaySchedule(roster, routes, hour, seed = 2707) {
  const output = [], date = Math.floor(hour / 24)
  for (const side of ['west', 'east']) {
    const people = roster.filter(p => routes.get(p.id).side === side)
      .toSorted((a, b) => displayHash(`${seed}:${a.department}:${date}:${hour}:${a.id}`) - displayHash(`${seed}:${b.department}:${date}:${hour}:${b.id}`) || a.id.localeCompare(b.id))
    people.forEach((p, index) => {
      const hash = displayHash(`${seed}:${p.department}:${date}:${hour}:${p.id}:visits`), visits = hash % 3
      for (let visit = 0; visit < visits; visit++) {
        const start = hour * HOUR + (index + visit * people.length) * 300000 + hash % 20000
        const duration = routes.get(p.id).durationMs
        if (duration > 280000) throw new Error('DISPLAY_TRIP_TOO_LONG')
        output.push({ id: p.id, start, end: start + duration, side })
      }
    })
  }
  return output.toSorted((a, b) => a.start - b.start || a.id.localeCompare(b.id))
}
function along(path, metres) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], d = distance(a, b)
    if (metres <= d) return { x: a.x + (b.x - a.x) * metres / d, z: a.z + (b.z - a.z) * metres / d,
      yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)) }
    metres -= d
  }
  return { ...path.at(-1), yaw: 0 }
}
export function displayFrame(roster, routes, schedule, timeMs, low = false) {
  return roster.map(p => {
    const trip = low ? null : schedule.find(t => t.id === p.id && timeMs >= t.start && timeMs < t.end)
    if (!trip) return { ...p.home, id: p.id, yaw: p.yaw, state: 'seated', phase: 0 }
    const plan = routes.get(p.id), seconds = (timeMs - trip.start) / 1000, travel = plan.length / 1.4
    const state = seconds < travel ? 'outbound' : seconds < travel + 20 ? 'resting' : 'returning'
    const metres = (state === 'returning' ? seconds - travel - 20 : seconds) * 1.4
    return { ...along(state === 'returning' ? plan.back : plan.go, state === 'resting' ? plan.length : metres),
      id: p.id, state, phase: metres * 4.6 }
  })
}
