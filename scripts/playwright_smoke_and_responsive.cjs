﻿﻿﻿﻿﻿﻿﻿const path = require('path')
const fs = require('fs')
const cp = require('child_process')
const { chromium } = require('playwright')

const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1140\\chrome-win\\chrome.exe'
const BASE = 'http://127.0.0.1:18900/'
const WORKTREE = 'E:\\VirtualAIOffice\\interactive-office-v2-worktree'
const SHORT_SHA = cp.execSync('git rev-parse --short HEAD', { cwd: WORKTREE, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
const HEAD = SHORT_SHA
const ART = `E:\\VirtualAIOffice\\review-artifacts\\interactive-v2-${HEAD}`
const BLACKLIST_RX = /addEventListener|null|composer|input|team|undo|VAOCoreShell[^V]|VAOCoreShellV2/i

console.log(`[playwright] worktree = ${WORKTREE}`)
console.log(`[playwright] HEAD (git rev-parse --short) = ${SHORT_SHA}`)
console.log(`[playwright] artifacts folder = ${ART}`)

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
  const R1 = report(`SMOKE ?mode=demo (HEAD=${HEAD})`, t1Errs, t1Cerr)
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
  const R2 = report(`SMOKE default (fake/live, HEAD=${HEAD})`, t2Errs, t2Cerr)
  if (R2.blacklist_hit || R2.errs.length) failures++
  await p2.close()

  // -----------------------------
  // 3. LIVE BRIDGE, REAL FIXTURES (Realistic roster + role resolvers + V2 composer + EventSource)
  // -----------------------------
  console.log('\n=== LIVE RUNTIME BRIDGE (REALISTIC ROSTER, REAL V2 COMPOSER, REAL DISPATCH) ===')
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

  // P0-6 REAL V2 COMPOSER (stay Core; NO classic switch)
  await p3.evaluate(() => window.__coreHandleV2?.setHelix?.(true))
  await sleep(900)
  await p3.fill('.v2-h-composer textarea', 'Playwright V2 live composer smoke')
  await sleep(150)
  await p3.click('.v2-h-composer button')
  await sleep(2800)
  const [stillCore, classicApp] = await p3.evaluate(() => [
    document.body.classList.contains('v2-shell-body'),
    !!document.querySelector('.app'),
  ])
  console.log(`V2 composer send: still core=${stillCore}  classic .app present=${classicApp}`)
  console.log(`POST count (V2 composer) = ${postV2Count}`)

  // Realistic repo-shaped fixtures where employee.group = model (claude/codex), NOT visual role
  const bridges = await p3.evaluate(async () => {
    try {
      const B = window.VAOAppV2
      if (!B) return { error: 'VAOAppV2 missing' }

      const snap0 = B._getSnapshot()
      const preSeatHasClaude = ('claude' in (snap0.snapshot.seatStates || {}))
      const preSeatHasCodex = ('codex' in (snap0.snapshot.seatStates || {}))

      // Roster: group = model/executor, skill/id = visual role (per user spec)
      const roster = {
        groups: [{ id:'g', name:'G', available:true }],
        employees: [
          { id:'frontend',  name:'Frontend Dev',  skill:'frontend',  group:'claude', available:true, model:'claude-opus' },
          { id:'backend',   name:'Backend Dev',   skill:'backend',   group:'codex',  available:true, model:'codex-super' },
          { id:'tester',    name:'QA Engineer',   skill:'tester',    group:'codex',  available:true, model:'codex-base'  },
          { id:'reviewer',  name:'Code Reviewer', skill:'reviewer',  group:'claude', available:true, model:'claude-sonnet' },
        ],
      }
      const agents = {
        frontend: { status:'working' },
        backend:  { status:'thinking' },
        tester:   { status:'working' },
        reviewer: { status:'idle' },
      }
      B._dispatchSse({ type:'roster', roster, agents })
      await new Promise(r => setTimeout(r, 350))

      // Resolver assertions (before animation)
      const eFrontend = (B._getState().roster.employees || []).find(e => e.id === 'frontend')
      const eBackend  = (B._getState().roster.employees || []).find(e => e.id === 'backend')
      const eTester   = (B._getState().roster.employees || []).find(e => e.id === 'tester')
      const eReviewer = (B._getState().roster.employees || []).find(e => e.id === 'reviewer')
      const roleFrontend  = B.resolveVisualRoleForEmployee(eFrontend)
      const roleBackend   = B.resolveVisualRoleForEmployee(eBackend)
      const roleTester    = B.resolveVisualRoleForEmployee(eTester)
      const roleReviewer  = B.resolveVisualRoleForEmployee(eReviewer)

      // Agent state: reviewer → status reviewing → REVIEWING visual
      B._dispatchSse({ type:'agent', id:'reviewer', status:'reviewing' })
      await new Promise(r => setTimeout(r, 260))
      const seatFrontend = B._getSeatState('frontend')
      const seatBackend  = B._getSeatState('backend')
      const seatQA       = B._getSeatState('qa')       // "tester" maps to qa (alias) per spec
      const seatReviewer = B._getSeatState('reviewer')

      const snap1 = B._getSnapshot()
      const seatClaudeMissing = !('claude' in (snap1.snapshot.seatStates || {}))
      const seatCodexMissing  = !('codex'  in (snap1.snapshot.seatStates || {}))
      const seatFrontendExists = 'frontend' in (snap1.snapshot.seatStates || {})
      const seatBackendExists  = 'backend'  in (snap1.snapshot.seatStates || {})
      const seatQAExists       = 'qa'       in (snap1.snapshot.seatStates || {})
      const seatReviewerExists = 'reviewer' in (snap1.snapshot.seatStates || {})

      // Task role resolution: t.agent = tester / frontend (legacy shape)
      B._dispatchSse({ type:'task', task:{ id:'T-QA-01',  title:'QA spec: login smoke regression', status:'running', agent:'tester',   kind:'qa',     sinceMs: Date.now()-3000, required:true, difficulty:'medium' } })
      B._dispatchSse({ type:'task', task:{ id:'T-FE-01',  title:'[FE] Helix composer focus state', status:'running', agent:'frontend', kind:'frontend', sinceMs: Date.now()-8000, required:true, difficulty:'easy' } })
      await new Promise(r => setTimeout(r, 400))

      const taskQARole   = B.resolveVisualRoleForTask({ agent:'tester' })
      const taskFERole   = B.resolveVisualRoleForTask({ agent:'frontend' })
      const v2Tasks = snap1.snapshot.tasks // stale check
      const snap2 = B._getSnapshot()
      const realTasks = snap2.snapshot.tasks || []
      const taskQA = realTasks.find(t => t.id === 'T-QA-01')
      const taskFE = realTasks.find(t => t.id === 'T-FE-01')

      // Dispatch to employee "tester" -> animate.dispatch("qa") alias
      B._dispatchSse({ type:'dispatch', to:'tester' })
      await new Promise(r => setTimeout(r, 550))
      const postDispatchQA = B._getSeatState('qa')

      return {
        preSeatHasClaude, preSeatHasCodex,
        roleFrontend, roleBackend, roleTester, roleReviewer,
        seatFrontend, seatBackend, seatQA, seatReviewer,
        seatClaudeMissing, seatCodexMissing,
        seatFrontendExists, seatBackendExists, seatQAExists, seatReviewerExists,
        taskQARole, taskFERole,
        taskQARoleActual: taskQA?.role, taskFERoleActual: taskFE?.role,
        taskQAWho: taskQA?.who, taskFEWho: taskFE?.who,
        postDispatchQA,
      }
    } catch (e) { return { error: String(e), stack: e.stack } }
  })
  console.log('Bridges (realistic fixtures, role resolvers, seats & tasks):', JSON.stringify(bridges, null, 2))

  const esCountAfter = await p3.evaluate(() => window.__esCount || 0)
  console.log('EventSource count (post SSE + V2 compose + dispatch + roundtrip candidate) =', esCountAfter)
  const sendObserved = postV2Count >= 1
  console.log('POST /api/message observed?', sendObserved)
  console.log('sendLog:', sendLog.join(' | '))
  console.log('eventsRx:', eventsRx.join(' | '))
  console.log('GET /api/state observed?', apiStateSeen)

  // Skin round-trip assertions on this page (P0-7 ES still 1)
  const sequence = ['sakura', 'night', 'core', 'pixel', 'core']
  for (const id of sequence) {
    await p3.evaluate((i) => window.NiumaSkin?.set?.(i) || window.VAOAppV2?.setSkin?.(i), id)
    await sleep(2400)
    const esNow = await p3.evaluate(() => window.__esCount || 0)
    console.log(`  skin ${id}: EventSource=${esNow}`)
    if (esNow !== 1) { failures++; console.log(`  FAIL: expected EventSource=1 after skin ${id}`) }
  }

  await p3.screenshot({ path: path.join(ART, 'S15_v2_send_bridge_test.png'), type: 'png' })
  if (!sendObserved) failures++
  if (postV2Count !== 1) { console.log(`  NOTE: V2 POST count = ${postV2Count} (expected exactly 1)`); if (postV2Count !== 1) failures++ }
  if (esCountAfter !== 1) failures++
  if (bridges.error) failures++
  // Explicit regression role != model / alias tester->qa assertions
  if (bridges.roleFrontend !== 'frontend') { console.log('  FAIL: frontend employee role != frontend (got', bridges.roleFrontend, ')'); failures++ }
  if (bridges.roleBackend  !== 'backend')  { console.log('  FAIL: backend employee role != backend  (got', bridges.roleBackend,  ')'); failures++ }
  if (bridges.roleTester   !== 'qa')       { console.log('  FAIL: tester/qa alias resolver returned', bridges.roleTester, 'expected qa'); failures++ }
  if (bridges.roleReviewer !== 'reviewer') { console.log('  FAIL: reviewer employee role != reviewer'); failures++ }
  if (bridges.seatFrontend !== 'WORKING')  { console.log('  FAIL: seat frontend not WORKING after agent event'); failures++ }
  if (bridges.seatBackend  !== 'THINKING') { console.log('  FAIL: seat backend not THINKING after agent event'); failures++ }
  if (bridges.seatQA       !== 'WORKING')  { console.log('  FAIL: seat qa (tester) not WORKING after agent event'); failures++ }
  if (bridges.seatReviewer !== 'REVIEWING'){ console.log('  FAIL: seat reviewer not REVIEWING after agent event'); failures++ }
  if (!bridges.seatClaudeMissing) { console.log('  FAIL: seatStates.claude MUST be absent (regression)'); failures++ }
  if (!bridges.seatCodexMissing)  { console.log('  FAIL: seatStates.codex MUST be absent (regression)'); failures++ }
  if (!bridges.seatFrontendExists || !bridges.seatBackendExists || !bridges.seatQAExists || !bridges.seatReviewerExists) { console.log('  FAIL: one of frontend/backend/qa/reviewer seatStates missing'); failures++ }
  if (bridges.taskQARoleActual !== 'qa')       { console.log('  FAIL: task.agent=tester → V2 capsule role actual =', bridges.taskQARoleActual, 'expected qa'); failures++ }
  if (bridges.taskFERoleActual !== 'frontend') { console.log('  FAIL: task.agent=frontend → V2 capsule role actual =', bridges.taskFERoleActual, 'expected frontend'); failures++ }
  await p3.close()

  // -----------------------------
  // 4. Round-trip zero errors
  // -----------------------------
  console.log('\n=== ROUND-TRIP SKIN (STANDALONE ZERO ERROR) ===')
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
    if (esNow !== 1) { failures++ }
  }
  const R4 = report(`Round-trip Core→Sakura→Night→Pixel→Core (HEAD=${HEAD})`, rtErrs, rtCerr)
  if (R4.blacklist_hit || R4.errs.length) failures++
  await p4.screenshot({ path: path.join(ART, 'S16_roundtrip_back_to_core.png'), type: 'png' })
  await p4.close()

  // -----------------------------
  // 5. RESPONSIVE CLOSEOUT — doc overflow 0 + stage allowed > 0
  // -----------------------------
  console.log('\n=== RESPONSIVE CLOSEOUT (documentOverflowX=0 STRICT; stageOverflowX>0 OK) ===')
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
      const body = document.body
      const deCW = de.clientWidth, deSW = de.scrollWidth
      const bCW  = body.clientWidth, bSW = body.scrollWidth
      const documentOverflowX = Math.max(deSW - deCW, bSW - bCW, 0)
      const stage = document.querySelector('.v2-stage-wrap')
      const stCW = stage ? stage.clientWidth : 0
      const stSW = stage ? stage.scrollWidth : 0
      const stageOverflowX = Math.max(stSW - stCW, 0)
      const culprits = []
      for (const child of Array.from(document.body.children)) {
        const r = child.getBoundingClientRect()
        const maxX = Math.max(r.right, r.left + child.offsetWidth || 0)
        const exceeds = maxX > (window.innerWidth + 1) || child.scrollWidth > (deCW + 2)
        if (exceeds) culprits.push({ tag: child.tagName, id: child.id, cls: child.className.substring ? child.className.substring(0,60) : '', r: {right:Math.round(r.right),width:Math.round(r.width)}, sw: child.scrollWidth })
      }
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (culprits.length > 25) break
        const r = el.getBoundingClientRect()
        if (r.right > window.innerWidth + 4 || el.scrollWidth > deCW + 4) {
          culprits.push({ tag: el.tagName, id: el.id, cls: (el.className||'').toString().substring(0,60), rRight: Math.round(r.right), sw: el.scrollWidth, ow: el.offsetWidth })
        }
      }
      return {
        v2Bar: !!document.getElementById('v2-top-bar'),
        v2Stage: !!document.getElementById('v2-office-stage'),
        mobile: !!document.querySelector('.v2-bottom-nav'),
        navCollapsed: document.body.classList.contains('v2-nav-collapsed'),
        deCW, deSW, bCW, bSW,
        documentOverflowX, stageOverflowX,
        stCW, stSW,
        culprits: culprits.slice(0, 20),
      }
    })
    console.log(`  ${name} ${tag}: v2Bar=${info.v2Bar}  navCollapsed=${info.navCollapsed}  bottomNav=${info.mobile}`)
    console.log(`       de clientW=${info.deCW}  de scrollW=${info.deSW}  |  body clientW=${info.bCW}  body scrollW=${info.bSW}`)
    console.log(`       stage clientW=${info.stCW} stage scrollW=${info.stSW}  => documentOverflowX=${info.documentOverflowX}  stageOverflowX=${info.stageOverflowX}`)
    if (tag === '390x844') console.log(`       CULPRITS R03: ${JSON.stringify(info.culprits, null, 1)}`)
    const Rtag = report(`${name} ${tag} errors`, eE, cE)
    if (Rtag.blacklist_hit || Rtag.errs.length) failures++
    // STRICT requirement: documentOverflowX === 0
    if (info.documentOverflowX !== 0) {
      console.log(`  FAIL: ${name}_${tag} documentOverflowX=${info.documentOverflowX} !== 0 (ACCEPTANCE REQUIRES 0)`)
      failures++
    }
    if (tag === '390x844' && info.stageOverflowX <= 0) {
      console.log(`  NOTE: R03 390×844 stageOverflowX=${info.stageOverflowX} (positive preferred: ensures 760px office readable via internal scroll not shrunk tiny)`)
    }
    await ctx.close()
    const sz = fs.statSync(f).size
    console.log(`  ➜ saved ${name}_${tag}.png (${(sz/1024).toFixed(1)} KB)`)
  }

  // -----------------------------
  // 6. VISUAL POLISH SCREENSHOT CAPTURE (A→I)
  // -----------------------------
  console.log('\n=== VISUAL POLISH SCREENSHOTS (A→I) ===')
  const visualCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
  const pV = await visualCtx.newPage()
  await instrumentEventSource(pV)
  const vE = [], vC = []
  pV.on('pageerror', e => vE.push(e.message))
  pV.on('console', m => { if (m.type() === 'error') vC.push(m.text()) })
  await pV.goto(BASE + '?mode=demo', { waitUntil: 'load' })
  await sleep(7000)

  // A. 1440×900 honest live office — Helix collapsed
  const helixOpenA = await pV.evaluate(() => document.body.classList.contains('v2-helix-open'))
  console.log('  [A] helix-open class present (should be false)?', helixOpenA)
  await pV.screenshot({ path: path.join(ART, 'A_honest_1440_helix_collapsed.png'), type: 'png' })
  console.log('  ➜ saved A_honest_1440_helix_collapsed.png')

  // B. full demo working office
  await sleep(2500)
  await pV.screenshot({ path: path.join(ART, 'B_full_demo_working_office.png'), type: 'png' })
  console.log('  ➜ saved B_full_demo_working_office.png')

  // C. Frontend WORKING close visual
  await pV.evaluate(async () => {
    const B = window.VAOAppV2
    if (B && B._dispatchSse) {
      B._dispatchSse({ type:'agent', id:'frontend', status:'working' })
    }
    try { if (window.__coreHandleV2?.seatMap) window.__coreHandleV2.seatMap.forEach(s => s.role==='frontend' && (s._forceState='WORKING')) } catch (_) {}
  })
  await sleep(900)
  const feBox = await pV.evaluate(() => {
    const el = document.querySelector('[data-char="frontend"], .char-frontend, figure[data-role="frontend"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.max(0, r.x - 80), y: Math.max(0, r.y - 60), width: r.width + 160, height: r.height + 120 }
  })
  if (feBox) {
    await pV.screenshot({ path: path.join(ART, 'C_frontend_WORKING_close.png'), type: 'png', clip: feBox })
    console.log('  ➜ saved C_frontend_WORKING_close.png')
  } else {
    await pV.screenshot({ path: path.join(ART, 'C_frontend_WORKING_close_FALLBACK.png'), type: 'png' })
    console.log('  ⚠ frontend element not found; saved fallback screenshot')
  }

  // D. Backend THINKING close visual
  await pV.evaluate(async () => {
    const B = window.VAOAppV2
    if (B && B._dispatchSse) {
      B._dispatchSse({ type:'agent', id:'backend', status:'thinking' })
    }
    try { if (window.__coreHandleV2?.seatMap) window.__coreHandleV2.seatMap.forEach(s => s.role==='backend' && (s._forceState='THINKING')) } catch (_) {}
  })
  await sleep(900)
  const beBox = await pV.evaluate(() => {
    const el = document.querySelector('[data-char="backend"], .char-backend, figure[data-role="backend"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.max(0, r.x - 80), y: Math.max(0, r.y - 60), width: r.width + 160, height: r.height + 120 }
  })
  if (beBox) {
    await pV.screenshot({ path: path.join(ART, 'D_backend_THINKING_close.png'), type: 'png', clip: beBox })
    console.log('  ➜ saved D_backend_THINKING_close.png')
  } else {
    await pV.screenshot({ path: path.join(ART, 'D_backend_THINKING_close_FALLBACK.png'), type: 'png' })
    console.log('  ⚠ backend element not found; saved fallback')
  }

  // E. QA + Reviewer REVIEWING pair
  await pV.evaluate(async () => {
    const B = window.VAOAppV2
    if (B && B._dispatchSse) {
      B._dispatchSse({ type:'agent', id:'qa', status:'reviewing' })
      B._dispatchSse({ type:'agent', id:'reviewer', status:'reviewing' })
    }
    try {
      if (window.__coreHandleV2?.seatMap) window.__coreHandleV2.seatMap.forEach(s => {
        if (s.role==='qa' || s.role==='reviewer') s._forceState='REVIEWING'
      })
    } catch (_) {}
  })
  await sleep(900)
  const pairBox = await pV.evaluate(() => {
    const qa = document.querySelector('[data-char="qa"], .char-qa, figure[data-role="qa"]')
    const rv = document.querySelector('[data-char="reviewer"], .char-reviewer, figure[data-role="reviewer"]')
    if (!qa || !rv) return null
    const r1 = qa.getBoundingClientRect(), r2 = rv.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(r1.x, r2.x) - 70),
      y: Math.max(0, Math.min(r1.y, r2.y) - 70),
      width: Math.max(r1.right, r2.right) - Math.min(r1.x, r2.x) + 140,
      height: Math.max(r1.bottom, r2.bottom) - Math.min(r1.y, r2.y) + 140,
    }
  })
  if (pairBox) {
    await pV.screenshot({ path: path.join(ART, 'E_qa_reviewer_REVIEWING.png'), type: 'png', clip: pairBox })
    console.log('  ➜ saved E_qa_reviewer_REVIEWING.png')
  } else {
    await pV.screenshot({ path: path.join(ART, 'E_qa_reviewer_REVIEWING_FALLBACK.png'), type: 'png' })
    console.log('  ⚠ qa/reviewer element not found; saved fallback')
  }

  // F. WAITING_HUMAN activated
  await pV.evaluate(async () => {
    try {
      if (window.__coreHandleV2?.officeHandle?.activateHumanArea) {
        window.__coreHandleV2.officeHandle.activateHumanArea(true)
      }
    } catch (_) {}
    const B = window.VAOAppV2
    if (B && B._dispatchSse) {
      B._dispatchSse({ type:'agent', id:'product', status:'waiting_human' })
    }
    try { if (window.__coreHandleV2?.seatMap) window.__coreHandleV2.seatMap.forEach(s => s.role==='product' && (s._forceState='WAITING_HUMAN')) } catch (_) {}
  })
  await sleep(1300)
  await pV.screenshot({ path: path.join(ART, 'F_WAITING_HUMAN_activated.png'), type: 'png' })
  console.log('  ➜ saved F_WAITING_HUMAN_activated.png')

  // G. Helix dispatch path visible
  await pV.evaluate(async () => {
    try {
      const h = window.__coreHandleV2
      if (h?.animate?.dispatch) {
        for (const role of ['product','frontend','backend','qa','docs']) {
          h.animate.dispatch(role, `VISUAL-${role.toUpperCase()}`)
        }
      }
    } catch (_) {}
  })
  await sleep(500)
  await pV.screenshot({ path: path.join(ART, 'G_helix_dispatch_path.png'), type: 'png' })
  console.log('  ➜ saved G_helix_dispatch_path.png')

  // H. Helix expanded panel
  await pV.evaluate(() => {
    try { window.__coreHandleV2?.setHelix?.(true) } catch (_) {}
    try { window.VAOAppV2?.setHelix?.(true) } catch (_) {}
  })
  await sleep(1400)
  await pV.screenshot({ path: path.join(ART, 'H_helix_expanded_panel.png'), type: 'png' })
  console.log('  ➜ saved H_helix_expanded_panel.png')

  // Collapse helix to restore state before mobile capture
  await pV.evaluate(() => { try { window.__coreHandleV2?.setHelix?.(false) } catch (_) {} })
  await sleep(600)
  await visualCtx.close()

  // I. 390 mobile role-slice / internal-scroll view
  const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pM = await mobCtx.newPage()
  const mE = [], mC = []
  pM.on('pageerror', e => mE.push(e.message))
  pM.on('console', m => { if (m.type() === 'error') mC.push(m.text()) })
  await pM.goto(BASE + '?mode=demo', { waitUntil: 'load' })
  await sleep(5500)
  await pM.screenshot({ path: path.join(ART, 'I_390_mobile_role_slice.png'), type: 'png' })
  console.log('  ➜ saved I_390_mobile_role_slice.png')
  // Also scroll stage to the right to show the internal scroll behaviour
  await pM.evaluate(() => {
    const s = document.querySelector('.v2-stage-wrap')
    if (s) s.scrollLeft = s.scrollWidth * 0.5
  })
  await sleep(400)
  await pM.screenshot({ path: path.join(ART, 'I_390_mobile_scrolled_stage.png'), type: 'png' })
  console.log('  ➜ saved I_390_mobile_scrolled_stage.png')
  await mobCtx.close()

  const RV = report(`VISUAL POLISH A→I capture (HEAD=${HEAD})`, vE.concat(mE), vC.concat(mC))
  if (RV.blacklist_hit || RV.errs.length) failures++

  await browser.close()
  console.log('\n=== TOTAL FAILURES =', failures, '===')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(99) })
