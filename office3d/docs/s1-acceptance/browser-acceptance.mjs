import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.join(here, 'screenshots')
await mkdir(shots, { recursive: true })

const base = process.env.OFFICE_URL || 'http://office.localhost:3200/'
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
const results = { measuredAt: new Date().toISOString(), url: base, viewport: { width: 480, height: 1188 }, tiers: {}, ui: {}, wallGo: {}, errors: [] }

async function ready(page) {
  await page.bringToFront()
  await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 1, null, { timeout: 90_000 })
  await page.waitForFunction(() => {
    const q = window.__office?.quality?.summary?.()
    return q?.medium && q?.low
  }, null, { timeout: 90_000 })
  await page.waitForTimeout(1500)
}

async function camera(page, name) {
  if (name === 'plaza') await page.evaluate(() => window.__office.setGoal({ az: 8, el: 34, r: 20, t: [2, 0, 23] }))
  if (name === 'foyer') await page.evaluate(() => window.__office.setGoal({ az: 6, el: 36, r: 14, t: [15, 0, 10.5] }))
  if (name === 'overview') await page.getByRole('button', { name: '🏢 全景' }).click()
  await page.waitForTimeout(1800)
  return page.evaluate(() => ({ ...window.__office.quality.metrics, summary: window.__office.quality.summary(), camera: { position: window.__office.camera.position.toArray(), target: window.__office.cam.t.toArray() } }))
}

async function memoryMotion(page) {
  return page.evaluate(async () => {
    const paths = await import('./foyer-paths.js')
    const views = [...window.__office.views.values()]
    const v = views.find(item => !item.act && !item.visiting) || views[0]
    window.__office.director.clear()
    Object.assign(v, { act: null, lounging: null, away: false, leaving: false, arriving: false, visiting: null, waits: [] })
    v.char.group.visible = true
    v.char.group.position.set(v.home.x, 0, v.home.z)
    const before = window.__office.director.stats()
    const board = paths.createQueueBoard()
    const plan = paths.visitPlan({ home: v.home, targetId: 'A1', board, agentId: v.id })
    const started = plan.ok && window.__office.director.visitConsumer(v, plan, { board, agentId: v.id, dwellMs: 1000 })
    let steps = 0
    while (started && steps++ < 3000 && (v.visiting || v.act)) window.__office.step(.2)
    const consumer = { started, plan: plan.ok, returned: Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05, steps, timeouts: window.__office.director.stats().timeouts - before.timeouts }

    v.waits = [{ kind: 'question', agentId: v.id }]
    const waitingBoard = paths.createWaitingBoard()
    const waiting = paths.waitingPlan({ home: v.home, agentId: v.id, board: waitingBoard })
    let keep = true
    const waitingStarted = waiting.ok && window.__office.director.visitConsumer(v, waiting, { mode: 'waiting', board: waitingBoard, agentId: v.id, shouldStay: () => keep })
    let waitSteps = 0
    while (waitingStarted && waitSteps++ < 3000 && v.act) window.__office.step(.2)
    const waitingArrived = Boolean(v.visiting && !v.act)
    for (let i = 0; i < 1500; i++) window.__office.step(.2)
    const waitingFiveMinutes = Boolean(v.visiting && window.__office.director.stats().timeouts === before.timeouts)
    keep = false
    for (let i = 0; i < 3000 && (v.visiting || v.act); i++) window.__office.step(.2)
    v.waits = []
    const waitingReturned = Math.hypot(v.char.group.position.x - v.home.x, v.char.group.position.z - v.home.z) < .05

    window.__office.fun.catDiagClear()
    window.__office.fun.debugCatPlan('plaza')
    for (let i = 0; i < 900; i++) window.__office.step(1 / 30)
    const cat = window.__office.fun.catDiag()
    return { consumer, waiting: { started: waitingStarted, arrived: waitingArrived, fiveMinutes: waitingFiveMinutes, returned: waitingReturned }, cat: { diagnostics: cat.length, entries: cat.slice(-3) } }
  })
}

async function geometry(page) {
  return page.evaluate(async () => {
    const layout = await import('./office-layout.js')
    const THREE = window.__office.THREE
    const box = new THREE.Box3()
    const rows = layout.FOYER_ITEMS.map(item => {
      const object = window.__office.scene.getObjectByName(`foyer-${item.id}`)
      if (!object) return { id: item.id, exists: false }
      box.setFromObject(object)
      const world = { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }
      const overflow = Math.max(item.x0 - world.x0, world.x1 - item.x1, item.z0 - world.z0, world.z1 - item.z1, 0)
      return { id: item.id, exists: true, world, planned: { x0: item.x0, x1: item.x1, z0: item.z0, z1: item.z1 }, overflow: Number(overflow.toFixed(3)), collides: item.blocksFloor !== false }
    })
    const points = [...Object.values(layout.FOYER_QUEUES).flat(), ...layout.WAITING_SEATS]
    return {
      rows,
      allExist: rows.every(row => row.exists),
      boundsWithinTolerance: rows.filter(row => row.id !== 'lounge_coffee_table').every(row => row.overflow <= .05),
      loungeCoffeeTable: rows.find(row => row.id === 'lounge_coffee_table'),
      collision: window.__office.furnitureCollision.stats(),
      occupiedPoints: points.map((point, index) => ({ index, point, kind: window.__office.furnitureCollision.hit(point.x, point.z)?.kind || null })).filter(item => item.kind),
      panelRedraws: window.__office.foyerPanels(),
    }
  })
}

for (const tier of ['high', 'medium', 'low']) {
  const context = await browser.newContext({ viewport: results.viewport, deviceScaleFactor: 1, colorScheme: 'dark' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${base}?q=${tier}&perf=1`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await ready(page)
  const overview = await camera(page, 'overview')
  await page.screenshot({ path: path.join(shots, `${tier}-overview.png`), fullPage: false })
  const foyer = await camera(page, 'foyer')
  await page.screenshot({ path: path.join(shots, `${tier}-foyer.png`), fullPage: false })
  const plaza = await camera(page, 'plaza')
  await page.screenshot({ path: path.join(shots, `${tier}-plaza.png`), fullPage: false })
  const geom = tier === 'high' ? await geometry(page) : null
  const motion = await memoryMotion(page)
  results.tiers[tier] = { overview, foyer, plaza, geometry: geom, motion, errors }
  results.errors.push(...errors.map(error => `${tier}: ${error}`))
  if (tier === 'high') {
    const before = await page.evaluate(() => window.__office.foyerPanels())
    await page.waitForTimeout(61_000)
    const after = await page.evaluate(() => window.__office.foyerPanels())
    results.panelRedrawsOneMinute = { before, after }
  }
  await context.close()
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${base}?q=high&perf=1`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await ready(page)
  await camera(page, 'foyer')
  await page.screenshot({ path: path.join(shots, 'mobile-390-foyer.png') })
  results.mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth, errors: [] }))
  results.mobile.errors = errors
  await context.close()
}

{
  const context = await browser.newContext({ viewport: results.viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${base}?wall=1&q=high`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await ready(page)
  for (const key of ['tour', 'overview', 'review', 'plan', 'plaza', 'product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'meet', 'board']) results.wallGo[key] = await page.evaluate(key => window.__office.wallGo(key), key)
  results.wallGo.errors = errors
  await context.close()
}

await browser.close()
await writeFile(path.join(here, 'baseline.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
if (results.errors.length || Object.values(results.tiers).some(tier => tier.errors.length || !tier.motion.consumer.returned || tier.motion.consumer.timeouts || !tier.motion.waiting.fiveMinutes || !tier.motion.waiting.returned) || results.mobile.overflow || Object.entries(results.wallGo).some(([key, value]) => key !== 'errors' && value !== true)) process.exitCode = 1
