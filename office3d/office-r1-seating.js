import { r1ToWorld } from './office-r1-layout.js'

export const R1_ADDED_AVATARS = Object.freeze({
  Reviewer3: 'Female_Adult_13', SecurityReviewer2: 'Female_Adult_17',
  Lead2: 'Business_Male_06', GoSenior2: 'Business_Male_07', React2: 'Male_Adult_20',
})
export const R1_SEAT_GROUP_RULES = Object.freeze([
  Object.freeze({ pattern: /^(Go|React|DB|Ledger|Localizer)|Dr\.?life|研发|账务|本地化/i, group: 'drlife', zone: '08' }),
  Object.freeze({ pattern: /^(Lead|PM|Architect|UIUX|Frontend|Backend|Knowledge)|产品|设计|技术协调/i, group: 'product', zone: '04' }),
  Object.freeze({ pattern: /Reviewer|Security|QA|Ops|审查|安全|测试|运维/i, group: 'ops', zone: '06' }),
])

// MOVEFIX H：把一个人按"坐在自己工位上"复位。不在前台上班 / 下班隐藏时也要走这里，
// 否则 r1AwayFromDesk 等状态残留，这些人被算成离座：满 8 人后所有出发都被挡住，聊天被拒。
export function r1SeatView(v) {
  if (!v) return
  v.r1AwayFromDesk = false; v.r1Position = null; v.r1PublicSeat = null; v.r1Standing = false
  const pose = v.char?.pose
  if (!pose) return
  pose.walk = 0; pose.lounge = 0; pose.r1PublicSeatY = null; pose.r1Motion = null; pose.talk = 0
  pose.sit = 1; pose.r1AtDesk = true
}

export function r1RegisteredStation(name, desk, chair, group, details = {}) {
  return Object.freeze({ business_id: name, desk_id: desk.id, chair_id: chair.id,
    xM: desk.xM, yM: desk.yM, x_mm: Math.round(desk.xM * 1000), y_mm: Math.round(desk.yM * 1000),
    chairXM: chair.xM, chairYM: chair.yM, chair_x_mm: Math.round(chair.xM * 1000), chair_y_mm: Math.round(chair.yM * 1000),
    group, zone: desk.regionId, ...details })
}

// Only the browser's R1 instance owns these temporary assignments; source layouts stay frozen.
export function createR1RuntimeLayout(base) {
  if (base?.r1Phase !== 'R1') return base
  const workstations = [...base.r1.workstations], seats = Object.assign(Object.create(null), base.seats)
  const temporary = [], unseated = new Set(), reserved = new Set((base.r1.reservedSeats || []).map(seat => seat.desk))
  const elements = new Map(base.r1.elements.map(e => [e.id, e]))
  function assignAgents(agents) {
    const added = [], used = new Set(workstations.map(w => w.desk_id))
    for (const agent of agents) {
      if (typeof agent.name !== 'string' || !agent.name || Object.hasOwn(seats, agent.name)) continue
      const text = `${agent.name} ${agent.title || ''}`, rule = R1_SEAT_GROUP_RULES.find(r => r.pattern.test(text)) || R1_SEAT_GROUP_RULES[2]
      const peers = workstations.filter(w => w.group === rule.group)
      const distance = d => Math.min(...peers.map(p => Math.hypot(d.xM - p.xM, d.yM - p.yM)))
      const candidates = base.r1.elements.filter(e => e.category === '办公桌' && e.regionId === rule.zone && !reserved.has(e.id) && !used.has(e.id))
        .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))
      const desk = candidates.find(d => elements.has(d.id.replace('-T-', '-CH-')))
      if (!desk) { unseated.add(agent.name); continue }
      const chair = elements.get(desk.id.replace('-T-', '-CH-'))
      const station = r1RegisteredStation(agent.name, desk, chair, rule.group, { island: 'AUTO', temporary: true, status: 'TEMPORARY_SEAT' })
      // MOVEFIX G：座位与 home 一律用 r1ToWorld 取整。未取整的 desk.xM - 26 会和家具查找的
      // 6 位小数坐标对不上（29 张空桌里 28 张对不上），桌子被占了人却不出现。
      const deskWorld = r1ToWorld(desk.xM, desk.yM), chairWorld = r1ToWorld(chair.xM, chair.yM)
      const home = Object.freeze({ ...chairWorld, yaw: Math.atan2(-(desk.xM - chair.xM), desk.yM - chair.yM) })
      seats[agent.name] = Object.freeze([rule.group, deskWorld.x, deskWorld.z, 0, home])
      workstations.push(station); temporary.push(station); added.push(station); used.add(desk.id); unseated.delete(agent.name)
    }
    return added
  }
  const runtime = { ...base, r1: Object.freeze({ ...base.r1, workstations }), seats }
  Object.defineProperties(runtime, { assignAgents: { value: assignAgents }, temporary: { value: temporary }, unseated: { value: unseated } })
  return Object.freeze(runtime)
}
