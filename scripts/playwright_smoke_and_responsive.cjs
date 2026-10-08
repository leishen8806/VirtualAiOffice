﻿﻿﻿const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')

const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1140\\chrome-win\\chrome.exe'
const BASE = 'http://127.0.0.1:18899/'
const HEAD = 'ec00997'
const ART = `E:\\VirtualAIOffice\\review-artifacts\\interactive-v2-${HEAD}`
const BLACKLIST_RX = /addEventListener|null|composer|input|team|undo|VAOCoreShell[^V]|VAOCoreShellV2/i

try { if (!fs.existsSync(ART)) fs.mkdirSync(ART, { recursive: true }) } catch (_) {}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function report(label, errs, cerr) {
  console.log(`\n[${label}]`)
  console.log(`  pageerrors=${errs.length}  console.errors=${cerr.length}`)
  errs.forEach(e => console.log('   PAGE_ERROR:', e))
  cerr.forEach(e => console.log('   CONS_ERROR:', e))
  const blacklist_hit = (errs.concat(cerr)).some(e => BLACKLIST_RX.test(e))
  console.log(`  blacklist_hit=${blacklist_hit}`)
  return { errs, cerr, blacklist_hit }
}

function instrumentEventSource(page) {
  return page.addInitScript(() => {
    window.__esCount = 0
    const Orig = window.EventSource
    window.EventSource = function EvPatched(url, opts) {
      window.__esCount = (window.__esCount || 0) + 1
      return new Orig(url, opts)
    }
    Object.assign(window.EventSource, Orig)
  })
}

;(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true, args: ['--window-size=1440,900'],
  })
  const sizes = [
    ['1440x900', 1440, 900, 'S14'],
    ['1280x800', 1280, 800, 'R01'],
    ['1024x768', 1024, 768, 'R02'],
    ['390x844', 390, 844, 'R03'],
  ]
  let failures = 0

  // -----------------------------
  // 1. ZERO ERROR SMOKE (?mode=demo)
  // -----------------------------
  const t1Errs = [], t1Cerr = []
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
  await instrumentEventSource(p1)
  p1.on('pageerror', e => t1Errs.push(e.message))
  p1.on('console', m => { if (m.type() === 'error') t1Cerr.push(m.text()) })
  await p1.goto(BASE + '?mode=demo', { waitUntil: 'load' })
  await sleep(6500)
  const hasV2Demo = await p1.evaluate(() => !!document.getElementById('v2-top-bar'))
  const hasV2BodyCls = await p1.evaluate(() => document.body.classList.contains('v2-shell-body'))
  const esCount1 = await p1.evaluate(() => window.__esCount || 0)
  console.log('Demo: v2-top-bar=', hasV2Demo, ' v2-shell-body=', hasV2BodyCls, ' EventSource=', esCount1)
  await p1.screenshot({ path: path.join(ART, 'S14_demo_1440_after_boot.png'), type: 'png' })
  const R1 = report('SMOKE ?mode=demo', t1Errs, t1Cerr)
  if (R1.blacklist_hit || R1.errs.length) failures++
  if (esCount1 !== 1) { console.log('  FAIL: Expected EventSource count=1, got', esCount1); failures++ }
  await p1.close()

  // -----------------------------
  // 2. ZERO ERROR (live/fake default, no mode)
  // -----------------------------
  const t2Errs = [], t2Cerr = []
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
  p2.on('pageerror', e => t2Errs.push(e.message))
  p2.on('console', m => { if (m.type() === 'error') t2Cerr.push(m.text()) })
  await p2.goto(BASE, { waitUntil: 'load' })
  await sleep(6500)
  const [hasBar2, hasCls2, hasConnLive] = await p2.evaluate(() => [
    !!document.getElementById('v2-top-bar'),
    document.body.classList.contains('v2-shell-body'),
    (document.getElementById('conn')?.className || '').includes('pill-'),
  ])
  console.log('Default: bar=', hasBar2, ' cls=', hasCls2, ' conn-pill=', hasConnLive)
  const R2 = report('SMOKE default (fake/live)', t2Errs, t2Cerr)
  if (R2.blacklist_hit || R2.errs.length) failures++
  await p2.close()

  // -----------------------------
  // 3. LIVE SEND + SSE integration (P0-6 REAL V2 COMPOSER + P0-7 SINGLE ES COUNT)
  // -----------------------------
  console.log('\n=== LIVE RUNTIME BRIDGE TEST (REAL V2 COMPOSER + DISPATCH) ===')
  const sendLog = []
  const eventsRx = []
  let postV2Count = 0
  let apiStateSeen = false
  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
  await instrumentEventSource(p3)
  p3.on('pageerror', e => { sendLog.push('PE:'+e.message) })
  p3.on('request', r => {
    const u = r.url()
    const m = r.method()
    if (u.includes('/api/message') && m === 'POST') {
      sendLog.push(`POST /api/message @ ${Date.now()}`)
      postV2Count++
    }
    if (u.includes('/api/state') && m === 'GET') apiStateSeen = true
  })
  p3.on('response', async r => {
    if (r.url().includes('/api/message') || r.url().includes('/events') || r.url().includes('/api/state')) {
      eventsRx.push(`${r.request().method()} ${r.url().split('?')[0]} → ${r.status()}`)
    }
  })
  await p3.goto(BASE + '?skin=core', { waitUntil: 'load' })
  await sleep(4500)
  const hasStage0 = await p3.evaluate(() => !!document.getElementById('v2-office-stage'))
  console.log('stage present (pre-send) =', hasStage0)

  // ==== V2 SEND INTEGRATION (REAL V2 COMPOSER, STAY CORE) P0-6 ====
  await p3.evaluate(() => window.__coreHandleV2?.setHelix?.(true))
  await sleep(900)
  await p3.fill('.v2-h-composer textarea', 'Playwright V2 live composer smoke')
  await sleep(150)
  await p3.click('.v2-h-composer button')
  await sleep(2800)
  const skinDuringSend = await p3.evaluate(() => [
    document.body.classList.contains('v2-shell-body'),
    !!document.querySelector('.app'),
  ])
  console.log(`V2 composer send: still core=${skinDuringSend[0]}  classic .app present=${skinDuringSend[1]}`)
  console.log(`POST count (V2 composer) = ${postV2Count}`)

  // ==== LIVE APP.JS → V2 BRIDGE INTEGRATION TESTS P0-4/P0-5/P0-2 ====
  const v2Bridge = await p3.evaluate(async () => {
    try {
      const bridge = window.VAOAppV2
      if (!bridge) return { error: 'VAOAppV2 bridge missing' }
      // Inject roster: one employee id="e-fe" mapped to role frontend
      bridge._dispatchSse({ type: 'roster', roster: { groups: [{ id:'g', name:'G', available:true }], employees: [{ id:'e-fe', name:'Claude (test)', group:'frontend', available:true, model:'test-model' }] }, agents: { 'e-fe': { status:'idle' } } })
      await new Promise(r => setTimeout(r, 350))
      // Agent state: working → front end visual
      bridge._dispatchSse({ type: 'agent', id:'e-fe', status:'working' })
      await new Promise(r => setTimeout(r, 250))
      const workingSeat = bridge._getSeatState('frontend')
      // Task: upsert real task into state.tasks → V2 office capsule visible
      bridge._dispatchSse({ type: 'task', task: { id:'V2-LIVE-TASK-01', title:'V2 live bridge spec compliance test', status:'running', role:'frontend', kind:'code', agentId:'e-fe', who:'Claude', sinceMs: Date.now() - 90000, required:true, difficulty:'medium' } })
      await new Promise(r => setTimeout(r, 350))
      const taskInState = (bridge._getState().tasks || []).some(t => t.id === 'V2-LIVE-TASK-01')
      // Open task inspector for that id by firing DOM event
      const stage = document.getElementById('v2-office-stage')
      const ev = new CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'V2-LIVE-TASK-01' } })
      stage?.dispatchEvent(ev)
      await new Promise(r => setTimeout(r, 550))
      const drawerOpenAfter = !!document.querySelector('.v2-drawer.open')
      // Agent → BLOCKED visual
      bridge._dispatchSse({ type: 'agent', id:'e-fe', status:'error' })
      await new Promise(r => setTimeout(r, 250))
      const blockedSeat = bridge._getSeatState('frontend')
      // Dispatch event (real SSE dispatch) ev.to = employee id
      bridge._dispatchSse({ type: 'dispatch', to:'e-fe' })
      await new Promise(r => setTimeout(r, 550))
      const afterDispatchSeat = bridge._getSeatState('frontend')
      // busy + commit refresh (no crash; state updates)
      bridge._dispatchSse({ type: 'busy', busy: true })
      bridge._dispatchSse({ type: 'commit', commit: 'abcdef1234567890 closeout' })
      await new Promise(r => setTimeout(r, 150))
      const st = bridge._getState()
      return {
        workingSeat, blockedSeat, afterDispatchSeat,
        taskInState, drawerOpenAfter,
        busyAfter: st.busy, commitAfter: String(st.lastCommit || '').slice(0, 8),
      }
    } catch (e) { return { error: String(e), stack: e.stack } }
  })
  console.log('V2 app.js bridge integration result:', JSON.stringify(v2Bridge, null, 2))

  // EventSource count after boot + send + many roster/agent/task/dispatches: still 1
  const esCountAfter = await p3.evaluate(() => window.__esCount || 0)
  console.log('EventSource count (after SSE+send) =', esCountAfter)
  const sendObserved = postV2Count >= 1
  console.log('POST /api/message observed?', sendObserved)
  console.log('sendLog:', sendLog.join(' | '))
  console.log('eventsRx:', eventsRx.join(' | '))
  console.log('GET /api/state observed?', apiStateSeen)

  // ==== P0-7 CORE ↔ CLASSIC 6-SKIN ROUNDTRIP: EventSource still 1 ====
  const sequence = ['sakura', 'night', 'core', 'pixel', 'core']
  const roundTripSkinFlags = []
  for (const id of sequence) {
    await p3.evaluate((i) => window.NiumaSkin?.set?.(i) || window.VAOAppV2?.setSkin?.(i), id)
    await sleep(2400)
    const [isV2, hasApp, esNow] = await p3.evaluate(() => [
      document.body.classList.contains('v2-shell-body'),
      !!document.querySelector('.app'),
      window.__esCount || 0,
    ])
    roundTripSkinFlags.push({ id, isV2, hasApp, esNow })
    console.log(`  skin ${id}: v2-body=${isV2}  .app present=${hasApp}  EventSource=${esNow}`)
  }
  const esFinal = roundTripSkinFlags[roundTripSkinFlags.length - 1].esNow
  console.log('EventSource final (post 6 skin flips):', esFinal)
  if (esFinal !== 1) { console.log('  FAIL: expected EventSource count=1 after round-trip, got', esFinal); failures++ }

  await p3.screenshot({ path: path.join(ART, 'S15_v2_send_bridge_test.png'), type: 'png' })
  if (!sendObserved) failures++
  if (postV2Count !== 1) { console.log(`  NOTE: V2 POST count = ${postV2Count} (expected exactly 1)`); if (postV2Count !== 1) failures++ }
  if (esCountAfter !== 1) { failures++ }
  if (v2Bridge.error) failures++
  if (!v2Bridge.workingSeat || v2Bridge.workingSeat !== 'WORKING') { console.log('  FAIL: seat frontend not WORKING after agent event'); failures++ }
  if (!v2Bridge.blockedSeat || v2Bridge.blockedSeat !== 'BLOCKED') { console.log('  FAIL: seat frontend not BLOCKED after agent status error'); failures++ }
  if (!v2Bridge.taskInState) { console.log('  FAIL: task event not in state.tasks'); failures++ }
  if (!v2Bridge.drawerOpenAfter) { console.log('  FAIL: task inspector drawer not open after task-click'); failures++ }
  await p3.close()

  // -----------------------------
  // 4. Round-trip Core→Sakura→Night→Pixel→Core (zero errors)
  // -----------------------------
  console.log('\n=== ROUND-TRIP SKIN (STANDALONE ZERO-ERROR) ===')
  const rtErrs = [], rtCerr = []
  const p4 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
  await instrumentEventSource(p4)
  p4.on('pageerror', e => rtErrs.push(e.message))
  p4.on('console', m => { if (m.type() === 'error') rtCerr.push(m.text()) })
  await p4.goto(BASE + '?skin=core', { waitUntil: 'load' })
  await sleep(3500)
  const sequence2 = ['sakura', 'night', 'pixel', 'core']
  for (const id of sequence2) {
    await p4.evaluate((i) => window.NiumaSkin?.set?.(i) || window.VAOAppV2?.setSkin?.(i), id)
    await sleep(2800)
    const [isV2, hasApp, esNow] = await p4.evaluate(() => [
      document.body.classList.contains('v2-shell-body'),
      !!document.querySelector('.app'),
      window.__esCount || 0,
    ])
    console.log(`  skin ${id}: v2-body=${isV2}  .app present=${hasApp}  EventSource=${esNow}`)
  }
  const R4 = report('Round-trip Core→Sakura→Night→Pixel→Core', rtErrs, rtCerr)
  if (R4.blacklist_hit || R4.errs.length) failures++
  await p4.screenshot({ path: path.join(ART, 'S16_roundtrip_back_to_core.png'), type: 'png' })
  await p4.close()

  // -----------------------------
  // 5. RESPONSIVE CLOSEOUT (1440/1280/1024/390) — documentOverflowX + stageOverflowX P0-7
  // -----------------------------
  console.log('\n=== RESPONSIVE CLOSEOUT SCREENSHOTS (documentOverflowX=0 requirement) ===')
  for (const [tag, w, h, name] of sizes) {
    const vp = { width: w, height: h }
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: (w <= 480) ? 2 : 1.5 })
    const p = await ctx.newPage()
    await instrumentEventSource(p)
    const eE = [], cE = []
    p.on('pageerror', e => eE.push(e.message))
    p.on('console', m => { if (m.type() === 'error') cE.push(m.text()) })
    await p.goto(BASE + '?mode=demo', { waitUntil: 'load' })
    await sleep(5000)
    const f = path.join(ART, `${name}_${tag}.png`)
    await p.screenshot({ path: f, type: 'png' })
    const info = await p.evaluate(() => {
      const de = document.documentElement
      const documentOverflowX = de.scrollWidth - de.clientWidth
      const stage = document.querySelector('.v2-stage-wrap')
      const stageOverflowX = stage ? (stage.scrollWidth - stage.clientWidth) : 0
      // If overflow-x:hidden CSS is active → scrollWidth may still be wider than clientWidth; real requirement = page can't horizontally scroll.
      const actualDocumentHScroll = Math.max(
        (document.body.scrollWidth - document.body.clientWidth),
        (document.documentElement.scrollWidth - document.documentElement.clientWidth),
      )
      // But overflow-x:hidden clips scroll bars; use window innerWidth - max(scrollWidth,clientWidth) < 0 positive means overflow past viewport.
      return {
        v2Bar: !!document.getElementById('v2-top-bar'),
        v2Stage: !!document.getElementById('v2-office-stage'),
        mobile: !!document.querySelector('.v2-bottom-nav'),
        navCollapsed: document.body.classList.contains('v2-nav-collapsed'),
        documentOverflowX: actualDocumentHScroll,
        stageOverflowX,
        clientWidth: document.documentElement.clientWidth,
        deScrollWidth: document.documentElement.scrollWidth,
      }
    })
    console.log(`  ${name} ${tag}: v2Bar=${info.v2Bar}  navCollapsed=${info.navCollapsed}  documentOverflowX=${info.documentOverflowX}px  stageOverflowX=${info.stageOverflowX}px  bottomNav=${info.mobile}  clientWidth=${info.clientWidth} deScroll=${info.deScrollWidth}`)
    report(`${name} ${tag} errors`, eE, cE)
    if (info.documentOverflowX > 0) {
      console.log(`  * ACCEPTANCE ISSUE: ${name}_${tag} documentOverflowX=${info.documentOverflowX} > 0. Clipping via overflow-x:hidden is NOT acceptance; document viewport must not exceed.`)
    }
    await ctx.close()
    const sz = fs.statSync(f).size
    console.log(`  ➜ saved ${name}_${tag}.png (${(sz/1024).toFixed(1)} KB)`)
  }

  await browser.close()
  console.log('\n=== TOTAL FAILURES =', failures, '===')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(99) })
