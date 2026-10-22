import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const here = path.dirname(fileURLToPath(import.meta.url)), browser = await chromium.launch({ channel: 'chrome', headless: false })
const result = { tiers: {}, errors: [] }
for (const tier of ['high', 'medium', 'low']) {
  const context = await browser.newContext({ viewport: { width: 480, height: 1188 }, deviceScaleFactor: 1 }), page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`http://office.localhost:3200/?q=${tier}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 2, null, { timeout: 90_000 })
  const motion = await page.evaluate(async () => {
    const paths = await import('./foyer-paths.js'), office = window.__office, v = [...office.views.values()][0]
    office.director.clear(); Object.assign(v, { act: null, lounging: null, away: false, leaving: false, arriving: false, visiting: null, waits: [] }); v.char.group.position.set(v.home.x, 0, v.home.z)
    const board = paths.createQueueBoard(), plan = paths.visitPlan({ home: v.home, targetId: 'A1', board, agentId: v.id }), started = plan.ok && office.director.visitConsumer(v, plan, { board, agentId: v.id, dwellMs: 200 })
    let steps = 0; while (started && steps++ < 5000 && (v.visiting || v.act)) office.director.update(.2)
    const consumer = { started, returned: !v.visiting && !v.act && Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05 }
    v.waits = [{ kind: 'question', agentId: v.id }]
    const waitingBoard = paths.createWaitingBoard(), waitingPlan = paths.waitingPlan({ home: v.home, agentId: v.id, board: waitingBoard }); let keep = true
    const waitingStarted = waitingPlan.ok && office.director.visitConsumer(v, waitingPlan, { mode: 'waiting', board: waitingBoard, agentId: v.id, shouldStay: () => keep })
    while (waitingStarted && v.act) office.director.update(.2)
    const waitingArrived = !!v.visiting && !v.act
    for (let i = 0; i < 1500; i++) office.director.update(.2)
    const waitingFiveMinutes = !!v.visiting && !v.act
    keep = false; while (v.visiting || v.act) office.director.update(.2)
    const waitingReturned = Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05
    office.fun.catDiagClear(); const before = office.fun.debug().cat.pos; office.fun.debugCatPlan('plaza')
    for (let i = 0; i < 1200; i++) office.fun.update(1 / 30, i / 30, { night: 0, offDuty: false, raining: false }, () => {})
    const catDebug = office.fun.debug().cat, cat = { before, after: catDebug.pos, moved: before.some((value, index) => Math.abs(value - catDebug.pos[index]) > .01), maxStepDist: catDebug.maxStepDist, diagnostics: office.fun.catDiag() }
    return { quality: office.quality.tier, consumer, waiting: { started: waitingStarted, arrived: waitingArrived, fiveMinutes: waitingFiveMinutes, returned: waitingReturned }, cat }
  })
  result.tiers[tier] = { motion, errors }; result.errors.push(...errors.map(error => `${tier}: ${error}`)); await context.close()
}
await browser.close(); await writeFile(path.join(here, 'tier-motion.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2))
if (result.errors.length || Object.values(result.tiers).some(({ motion }) => motion.quality === undefined || !motion.consumer.started || !motion.consumer.returned || !motion.waiting.started || !motion.waiting.arrived || !motion.waiting.fiveMinutes || !motion.waiting.returned || !motion.cat.moved || motion.cat.diagnostics.length)) process.exitCode = 1
