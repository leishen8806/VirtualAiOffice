import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  CENTRAL_CIRCLE, ENTRANCE, FOYER_ITEMS, FOYER_QUEUES, MAIN_AISLE,
  PLAZA, RECEPTION, WAITING_SEATS,
} from '../../office-layout.js'
import { foyerPlanIssues, foyerSceneSpec } from '../../foyer-scene-spec.js'

const root = new URL('../../', import.meta.url)
const app = await readFile(new URL('app.js', root), 'utf8')
const foyerFile = new URL('foyer.json', root)
const reception = { x0: RECEPTION.x - RECEPTION.width / 2, x1: RECEPTION.x + RECEPTION.width / 2, z0: RECEPTION.z0, z1: RECEPTION.z1 }
const contains = (r, p, pad = 0) => p.x > r.x0 - pad && p.x < r.x1 + pad && p.z > r.z0 - pad && p.z < r.z1 + pad
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const points = [...Object.values(FOYER_QUEUES).flat().map(p => ({ ...p, kind: 'queue' })), ...WAITING_SEATS.map(p => ({ ...p, kind: 'waiting' }))]
const issues = [...foyerPlanIssues()]
for (const item of FOYER_ITEMS) if (overlap(reception, item)) issues.push(`central reception overlaps ${item.id}`)
for (const p of points) {
  if (contains(reception, p)) issues.push(`${p.kind} enters central reception`)
  if (p.x > MAIN_AISLE.x0 && p.x < MAIN_AISLE.x1 && p.z >= 8 && p.z <= PLAZA.z1) issues.push(`${p.kind} enters main aisle`)
  if (p.z >= 13 && p.z <= 16 && p.x >= ENTRANCE.x0 && p.x <= ENTRANCE.x1) issues.push(`${p.kind} enters entrance`)
  if (Math.hypot(p.x - CENTRAL_CIRCLE.cx, p.z - CENTRAL_CIRCLE.cz) < CENTRAL_CIRCLE.r) issues.push(`${p.kind} enters circle`)
}
const output = {
  checkedAt: new Date().toISOString(),
  items: foyerSceneSpec().length,
  queueSlots: Object.values(FOYER_QUEUES).flat().length,
  waitingSeats: WAITING_SEATS.length,
  polling: {
    state: (app.match(/setInterval\(poll, POLL_MS\)/g) || []).length,
    foyer: (app.match(/setInterval\(pollFoyer, 30_000\)/g) || []).length,
    milestones: (app.match(/setInterval\(pollMilestones, 30_000\)/g) || []).length,
    hiddenGuards: (app.match(/if \(document\.hidden\) return/g) || []).length,
  },
  automaticVisitCalls: (app.match(/director\.visitConsumer\(/g) || []).length,
  foyerJsonExists: existsSync(foyerFile),
  foyerJsonSize: existsSync(foyerFile) ? (await stat(foyerFile)).size : null,
  issues,
}
console.log(JSON.stringify(output, null, 2))
if (issues.length || output.items !== 27 || output.queueSlots !== 42 || output.waitingSeats !== 4 || output.polling.foyer !== 1 || output.polling.milestones !== 1 || output.automaticVisitCalls !== 1) process.exitCode = 1
