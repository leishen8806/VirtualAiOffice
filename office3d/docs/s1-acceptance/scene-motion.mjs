import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling'] })
const context = await browser.newContext({ viewport: { width: 480, height: 1188 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
await page.goto('http://office.localhost:3200/?q=high', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 2, null, { timeout: 90_000 })

const result = await page.evaluate(async () => {
  const paths = await import('./foyer-paths.js'), layout = await import('./office-layout.js')
  const office = window.__office, views = [...office.views.values()]
  const reset = v => {
    Object.assign(v, { act: null, lounging: null, away: false, leaving: false, arriving: false, visiting: null, waits: [] })
    v.char.group.visible = true; v.char.group.position.set(v.home.x, 0, v.home.z)
  }
  office.director.clear(); views.forEach(reset)
  const targets = Object.keys(layout.FOYER_QUEUES), runs = []
  for (const v of views) for (const targetId of targets) {
    office.director.clear(); reset(v)
    const board = paths.createQueueBoard(), plan = paths.visitPlan({ home: v.home, targetId, board, agentId: v.id }), before = office.director.stats()
    const started = plan.ok && office.director.visitConsumer(v, plan, { board, agentId: v.id, dwellMs: 200 })
    let steps = 0
    while (started && steps++ < 5000 && (v.visiting || v.act)) office.director.update(.2)
    const after = office.director.stats(), returned = !v.visiting && !v.act && Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05
    runs.push({ agentId: v.id, targetId, plan: plan.ok, started, returned, steps, timeoutDelta: after.timeouts - before.timeouts, abortDelta: after.visitAborts - before.visitAborts })
  }

  office.director.clear(); views.slice(0, 6).forEach(reset)
  const sameBoard = paths.createQueueBoard(), sameBefore = office.director.stats()
  const sameStarted = views.slice(0, 6).map(v => {
    const plan = paths.visitPlan({ home: v.home, targetId: targets[0], board: sameBoard, agentId: v.id })
    return { id: v.id, plan: plan.ok, started: plan.ok && office.director.visitConsumer(v, plan, { board: sameBoard, agentId: v.id, dwellMs: 200 }) }
  })
  let sameSteps = 0
  while (sameSteps++ < 12000 && views.slice(0, 6).some(v => v.visiting || v.act)) office.director.update(.2)
  const sameAfter = office.director.stats()
  const sixSame = { started: sameStarted, steps: sameSteps, returned: views.slice(0, 6).every(v => !v.visiting && !v.act && Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05), timeoutDelta: sameAfter.timeouts - sameBefore.timeouts, abortDelta: sameAfter.visitAborts - sameBefore.visitAborts }

  office.director.clear(); views.slice(0, 6).forEach(reset)
  const crossBoard = paths.createQueueBoard(), crossBefore = office.director.stats(), crossStarted = []
  const startCross = (v, targetId) => {
    const plan = paths.visitPlan({ home: v.home, targetId, board: crossBoard, agentId: v.id })
    crossStarted.push({ id: v.id, targetId, plan: plan.ok, started: plan.ok && office.director.visitConsumer(v, plan, { board: crossBoard, agentId: v.id, dwellMs: 200 }) })
  }
  views.slice(0, 3).forEach((v, index) => startCross(v, targets[index]))
  for (let i = 0; i < 80; i++) office.director.update(.2)
  views.slice(3, 6).forEach((v, index) => startCross(v, targets[3 + index]))
  let crossSteps = 0
  while (crossSteps++ < 12000 && views.slice(0, 6).some(v => v.visiting || v.act)) office.director.update(.2)
  const crossAfter = office.director.stats()
  const threeInThreeOut = { started: crossStarted, steps: crossSteps, returned: views.slice(0, 6).every(v => !v.visiting && !v.act && Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05), timeoutDelta: crossAfter.timeouts - crossBefore.timeouts, abortDelta: crossAfter.visitAborts - crossBefore.visitAborts }

  office.director.clear(); views.slice(0, 5).forEach(reset)
  const waitingBoard = paths.createWaitingBoard(), keep = [true, true, true, true, true], waitingBefore = office.director.stats()
  const waitingStarted = views.slice(0, 5).map((v, index) => {
    v.waits = [{ kind: 'question', agentId: v.id }]
    const plan = paths.waitingPlan({ home: v.home, agentId: v.id, board: waitingBoard })
    return { id: v.id, plan: plan.ok, started: plan.ok && office.director.visitConsumer(v, plan, { mode: 'waiting', board: waitingBoard, agentId: v.id, shouldStay: () => keep[index] }) }
  })
  let arriveSteps = 0
  while (arriveSteps++ < 5000 && views.slice(0, 4).some(v => v.act)) office.director.update(.2)
  const fourSeated = views.slice(0, 4).every(v => v.visiting && !v.act), fifthStayedHome = !views[4].visiting && !views[4].act && Math.hypot(views[4].char.group.position.x - views[4].home.x, views[4].char.group.position.z - views[4].home.z) < .05
  for (let i = 0; i < 1500; i++) office.director.update(.2)
  const fiveMinutes = views.slice(0, 4).every(v => v.visiting && !v.act) && office.director.stats().timeouts === waitingBefore.timeouts
  keep.fill(false)
  let returnSteps = 0
  while (returnSteps++ < 5000 && views.slice(0, 4).some(v => v.visiting || v.act)) office.director.update(.2)
  const waitingAfter = office.director.stats()
  const waiting = { started: waitingStarted, fourSeated, fifthStayedHome, fiveMinutes, returned: views.slice(0, 4).every(v => !v.visiting && !v.act && Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05), timeoutDelta: waitingAfter.timeouts - waitingBefore.timeouts, abortDelta: waitingAfter.visitAborts - waitingBefore.visitAborts, seats: layout.WAITING_SEATS }
  return { agents: views.length, targets, runs, failures: runs.filter(run => !run.plan || !run.started || !run.returned || run.timeoutDelta || run.abortDelta), sixSame, threeInThreeOut, waiting, director: office.director.stats() }
})

result.errors = errors
await context.close(); await browser.close()
await writeFile(path.join(here, 'scene-motion.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ agents: result.agents, targets: result.targets, runs: result.runs.length, failures: result.failures, sixSame: result.sixSame, threeInThreeOut: result.threeInThreeOut, waiting: result.waiting, errors }, null, 2))
if (errors.length || result.agents !== 25 || result.runs.length !== 175 || result.failures.length || !result.sixSame.returned || result.sixSame.timeoutDelta || result.sixSame.abortDelta || !result.threeInThreeOut.returned || result.threeInThreeOut.timeoutDelta || result.threeInThreeOut.abortDelta || !result.waiting.fourSeated || !result.waiting.fifthStayedHome || !result.waiting.fiveMinutes || !result.waiting.returned || result.waiting.timeoutDelta || result.waiting.abortDelta) process.exitCode = 1
