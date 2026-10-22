import { CENTRAL_CIRCLE, ENTRANCE, FOYER_ITEMS, FOYER_QUEUES, MAIN_AISLE } from './office-layout.js'

const LOUNGE_IDS = new Set(['lounge_west_sofa', 'lounge_coffee_table', 'lounge_east_sofa'])
const PANEL_IDS = { handoff_box: ['handoff'], notice_attendance_wall: ['attendance', 'notice'] }

export const foyerSceneSpec = () => FOYER_ITEMS.map(item => ({
  ...item,
  entityName: `foyer-${item.id}`,
  collides: item.blocksFloor !== false,
  existing: LOUNGE_IDS.has(item.id),
  panels: PANEL_IDS[item.id] || [],
}))

const rectHitsCircle = (r, c) => Math.hypot(Math.max(r.x0, Math.min(c.cx, r.x1)) - c.cx, Math.max(r.z0, Math.min(c.cz, r.z1)) - c.cz) < c.r
const rectHitsRect = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0

export function foyerPlanIssues(spec = foyerSceneSpec()) {
  const entrance = { x0: ENTRANCE.x0, x1: ENTRANCE.x1, z0: 13, z1: 16.5 }
  const aisle = { ...MAIN_AISLE, z0: 8, z1: 30 }
  const queues = Object.values(FOYER_QUEUES).flat()
  return spec.flatMap(item => {
    if (!item.collides) return []
    const issues = []
    if (rectHitsRect(item, aisle)) issues.push(`${item.id}:main-aisle`)
    if (rectHitsRect(item, entrance)) issues.push(`${item.id}:entrance`)
    if (rectHitsCircle(item, CENTRAL_CIRCLE)) issues.push(`${item.id}:central-circle`)
    if (queues.some(p => p.x > item.x0 - .5 && p.x < item.x1 + .5 && p.z > item.z0 - .5 && p.z < item.z1 + .5)) issues.push(`${item.id}:queue`)
    return issues
  })
}
