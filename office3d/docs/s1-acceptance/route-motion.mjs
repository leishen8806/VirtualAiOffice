import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright'), here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: false }), context = await browser.newContext({ viewport: { width: 480, height: 1188 } })
await context.route('**/tests/browser-motion-acceptance.js', route => route.fulfill({ path: path.resolve(here, '..', '..', 'tests', 'browser-motion-acceptance.js'), contentType: 'text/javascript' }))
const page = await context.newPage(), errors = []
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
await page.goto('http://office.localhost:3200/?q=low', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 2, null, { timeout: 90_000 })
await page.waitForFunction(() => window.__office?.views?.size === 25, null, { timeout: 90_000 })
const result = await page.evaluate(async () => {
  const checks = await import('./tests/browser-motion-acceptance.js'), office = window.__office
  return { commute: checks.checkCommuteRoutes(office), loungeAndMeetings: checks.checkLoungeRoutes(office, [...office.LOUNGE, ...office.meetingSeats]), colleagueReports: checks.checkOfficeRoutes(office), boardReview: checks.checkOfficeRoutes(office, 1 / 60, true) }
})
result.errors = errors
await context.close(); await browser.close(); await writeFile(path.join(here, 'route-motion.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ commute: { agents: result.commute.agents, completed: result.commute.completed }, loungeAndMeetings: { seats: result.loungeAndMeetings.seats, completed: result.loungeAndMeetings.completed }, colleagueReports: { routes: result.colleagueReports.routes, completed: result.colleagueReports.completed, contacts: result.colleagueReports.contacts }, boardReview: { routes: result.boardReview.routes, completed: result.boardReview.completed, contacts: result.boardReview.contacts }, errors }, null, 2))
if (errors.length || result.commute.completed !== result.commute.agents || result.loungeAndMeetings.completed !== result.loungeAndMeetings.seats || result.colleagueReports.completed !== result.colleagueReports.routes || result.colleagueReports.contacts || result.boardReview.completed !== result.boardReview.routes || result.boardReview.contacts) process.exitCode = 1
