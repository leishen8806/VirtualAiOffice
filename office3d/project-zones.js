import { createR1Layout, r1ElementWorld } from './office-r1-layout.js'

const R1_LAYOUT = createR1Layout()
const ELEMENTS = new Map(R1_LAYOUT.elements.map(row => [row.id, row]))
const TARGET_DESKS = Object.freeze(R1_LAYOUT.elements
  .filter(row => row.category === '办公桌' && /^04-T-0(?:0[1-9]|1[0-9]|20)$/.test(row.id))
  .sort((a, b) => a.id.localeCompare(b.id)))
const TARGET_DESK_IDS = new Set(TARGET_DESKS.map(row => row.id))
const DESK_BY_AGENT = new Map(R1_LAYOUT.workstations.map(row => [row.business_id, row.desk_id]))

export const ROUTEFIT_ZONE = Object.freeze({
  routefit: Object.freeze(['Lead2', 'PM', 'Architect', 'BackendSenior', 'Backend1', 'DBEngineer', 'ReactSenior', 'React1', 'React2', 'Frontend1', 'UIUX', 'Localizer', 'LedgerAuditor', 'QAAutomation', 'OpsEngineer', 'Reviewer1', 'Reviewer2', 'SecurityReviewer', 'FrontendSenior', 'Frontend2', 'Backend2']),
  platform: Object.freeze(['Lead', 'KnowledgeKeeper', 'OpsLead', 'Reviewer3', 'SecurityReviewer2']),
  paused: Object.freeze(['GoSenior', 'GoSenior2', 'Go1', 'Go2']),
  seatExcluded: Object.freeze(['OpsEngineer']),
  groups: Object.freeze({
    'driver-client': Object.freeze(['ReactSenior', 'React1', 'React2', 'Frontend1']),
    client: Object.freeze(['UIUX', 'Localizer', 'FrontendSenior', 'Frontend2']),
    'admin-backend': Object.freeze(['Lead2', 'PM', 'Architect', 'Backend2']),
    server: Object.freeze(['BackendSenior', 'Backend1', 'OpsEngineer']),
    database: Object.freeze(['DBEngineer', 'LedgerAuditor']),
    'test-review-coordination': Object.freeze(['QAAutomation', 'Reviewer1', 'Reviewer2', 'SecurityReviewer']),
  }),
})

const seatForDesk = desk => {
  const chair = ELEMENTS.get(desk.id.replace('-T-', '-CH-'))
  if (!chair) throw new Error(`RouteFit 指定区域缺少椅子: ${desk.id}`)
  const deskWorld = r1ElementWorld(desk), chairWorld = r1ElementWorld(chair)
  const yaw = Math.atan2(-(desk.xM - chair.xM), desk.yM - chair.yM)
  return ['product', deskWorld.x, deskWorld.z, 0, { ...chairWorld, yaw }]
}

const TARGET_SEATS = Object.freeze(TARGET_DESKS.map(seatForDesk))

export function routefitSeatAssignments(names, oldSeats) {
  if (TARGET_SEATS.length !== 20) throw new Error(`RouteFit 指定区域座位数异常: ${TARGET_SEATS.length}`)
  const result = { ...oldSeats }
  const requested = names.length ? names : ROUTEFIT_ZONE.routefit
  const active = requested.filter(name => !ROUTEFIT_ZONE.seatExcluded.includes(name))
  if (active.length > TARGET_SEATS.length) throw new Error(`RouteFit 在岗人数超过指定座位: ${active.length}`)

  const displaced = [...DESK_BY_AGENT.entries()]
    .filter(([name, deskId]) => !ROUTEFIT_ZONE.routefit.includes(name) && TARGET_DESK_IDS.has(deskId))
    .map(([name]) => name)
  const spareSeats = ROUTEFIT_ZONE.routefit
    .filter(name => !TARGET_DESK_IDS.has(DESK_BY_AGENT.get(name)) && oldSeats[name])
    .map(name => oldSeats[name])
  displaced.forEach((name, index) => { if (spareSeats[index]) result[name] = spareSeats[index] })

  active.forEach((name, index) => { result[name] = TARGET_SEATS[index] })
  return result
}

export function routefitNavigation() {
  const target = TARGET_SEATS.reduce((sum, seat) => ({ x: sum.x + seat[1], z: sum.z + seat[2] }), { x: 0, z: 0 })
  target.x /= TARGET_SEATS.length; target.z /= TARGET_SEATS.length
  return Object.freeze({ target: Object.freeze(target), route(from, to) { return [from, to] } })
}
