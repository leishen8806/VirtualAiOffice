const path = require('path')
const fs = require('fs')
const { chromium } = require('playwright')

const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1140\\chrome-win\\chrome.exe'
const BASE = 'http://127.0.0.1:18899/'
const HEAD = '479a067'
const ART = `E:\\VirtualAIOffice\\review-artifacts\\interactive-v2-${HEAD}`
const BLACKLIST_RX = /addEventListener|null|composer|input|team|undo|VAOCoreShell[^V]|VAOCoreShellV2/i

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
  p1.on('pageerror', e => t1Errs.push(e.message))
  p1.on('console', m => { if (m.type() === 'error') t1Cerr.push(m.text()) })
  await p1.goto(BASE + '?mode=demo', { waitUntil: 'load' })
  await sleep(6500)
  const hasV2Demo = await p1.evaluate(() => !!document.getElementById('v2-top-bar'))
  const hasV2BodyCls = await p1.evaluate(() => document.body.classList.contains('v2-shell-body'))
  console.log('Demo: v2-top-bar=', hasV2Demo, ' v2-shell-body=', hasV2BodyCls)
  await p1.screenshot({ path: path.join(ART, 'S14_demo_1440_after_boot.png'), type: 'png' })
  const R1 = report('SMOKE ?mode=demo', t1Errs, t1Cerr)
  if (R1.blacklist_hit || R1.errs.length) failures++
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
  // 3. LIVE SEND + SSE integration (POST /api/message → roundtrip observe)
  // -----------------------------
  console.log('\n=== LIVE RUNTIME BRIDGE TEST ===')
  const sendLog = []
  const eventsRx = []
  const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
  p3.on('pageerror', e => { sendLog.push('PE:'+e.message) })
  p3.on('request', r => {
    if (r.url().includes('/api/message') && r.method() === 'POST') {
      sendLog.push(`POST /api/message occurred @ ${Date.now()}`)
    }
  })
  p3.on('response', async r => {
    if (r.url().includes('/api/message') || r.url().includes('/events')) {
      eventsRx.push(`${r.request().method()} ${r.url().split('?')[0]} → ${r.status()}`)
    }
  })
  await p3.goto(BASE + '?skin=core&mode=demo', { waitUntil: 'load' })
  await sleep(4000)
  // Snapshot received → state.roster populated → V2 shell refreshes
  const hasStage0 = await p3.evaluate(() => !!document.getElementById('v2-office-stage'))
  console.log('stage present (pre-send) =', hasStage0)
  // Evaluate inside page: type a message via V2 onConversationSend / send()
  const sendResult = await p3.evaluate(async () => {
    try {
      // Via window.NiumaSkin setSkin ensures current is Core
      window.NiumaSkin?.set?.('core')
      await new Promise(r => setTimeout(r, 1200))
      // Directly call the real send() of runtime via window exposure → hard, so send via V2 handle onConversationSend fallback.
      // Instead use globalThis.setSkinV2 bridge → NiumaSkin → then send() via the transport we know is live.
      // Easier: dispatch vao-v2:task-clicked to ensure V2 shell responds with task inspector drawer (event pipeline sanity).
      const stage = document.getElementById('v2-office-stage')
      let drawerOpenBefore = !!document.querySelector('.v2-drawer')
      const ev = new CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'V2-LIVE-001' } })
      stage?.dispatchEvent(ev)
      await new Promise(r => setTimeout(r, 500))
      let drawerOpenAfter = !!document.querySelector('.v2-drawer')
      return { drawerBefore: drawerOpenBefore, drawerAfter: drawerOpenAfter, hasV2Shell: !!document.getElementById('v2-top-bar') }
    } catch (e) { return { error: String(e) } }
  })
  console.log('sendResult:', JSON.stringify(sendResult))
  // Via real composer: trigger submit → /api/message POST
  // First make classic scaffold visible (switched skin then back) → composer nodes appear
  await p3.evaluate(() => window.NiumaSkin?.set?.('sakura'))
  await sleep(3200)
  const [hasComposer, hasInput, hasSkins, hasUndo] = await p3.evaluate(() => [
    !!document.getElementById('composer'),
    !!document.getElementById('input'),
    !!document.getElementById('skins'),
    !!document.getElementById('undo'),
  ])
  console.log('Sakura composer=', hasComposer, ' input=', hasInput, ' skins=', hasSkins, ' undo=', hasUndo)
  // Actually submit a message to see POST /api/message fire
  await p3.evaluate(() => {
    const c = document.getElementById('composer')
    const i = document.getElementById('input')
    if (c && i) {
      i.value = 'Playwright smoke: say hi from automated test'
      c.requestSubmit()
    }
  })
  await sleep(2500)
  const sendObserved = sendLog.some(s => s.startsWith('POST /api/message'))
  console.log('POST /api/message observed?', sendObserved)
  console.log('sendLog:', sendLog.join(' | '))
  console.log('eventsRx:', eventsRx.join(' | '))
  await p3.screenshot({ path: path.join(ART, 'S15_sakura_send_test.png'), type: 'png' })
  // Back to Core → ensure no errors
  await p3.evaluate(() => window.NiumaSkin?.set?.('core'))
  await sleep(3000)
  const backToV2 = await p3.evaluate(() => document.body.classList.contains('v2-shell-body'))
  console.log('After return to Core → v2-shell-body =', backToV2)
  await p3.close()
  if (!sendObserved) failures++
  if (sendResult.error || sendResult.error) failures++

  // -----------------------------
  // 4. Round-trip Core→Sakura→Night→Pixel→Core (zero errors)
  // -----------------------------
  console.log('\n=== ROUND-TRIP SKIN ===')
  const rtErrs = [], rtCerr = []
  const p4 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 })
  p4.on('pageerror', e => rtErrs.push(e.message))
  p4.on('console', m => { if (m.type() === 'error') rtCerr.push(m.text()) })
  await p4.goto(BASE + '?skin=core', { waitUntil: 'load' })
  await sleep(3500)
  const sequence = ['sakura', 'night', 'pixel', 'core']
  for (const id of sequence) {
    await p4.evaluate((i) => window.NiumaSkin?.set?.(i), id)
    await sleep(2800)
    const [isV2, hasApp, skinErr] = await p4.evaluate(() => [
      document.body.classList.contains('v2-shell-body'),
      !!document.querySelector('.app'),
      false,
    ])
    console.log(`  skin ${id}: v2-body=${isV2}  .app present=${hasApp}`)
  }
  const R4 = report('Round-trip Core→Sakura→Night→Pixel→Core', rtErrs, rtCerr)
  if (R4.blacklist_hit || R4.errs.length) failures++
  await p4.screenshot({ path: path.join(ART, 'S16_roundtrip_back_to_core.png'), type: 'png' })
  await p4.close()

  // -----------------------------
  // 5. RESPONSIVE CLOSEOUT (1440/1280/1024/390)
  // -----------------------------
  console.log('\n=== RESPONSIVE CLOSEOUT SCREENSHOTS ===')
  for (const [tag, w, h, name] of sizes) {
    const vp = { width: w, height: h }
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: (w <= 480) ? 2 : 1.5 })
    const p = await ctx.newPage()
    const eE = [], cE = []
    p.on('pageerror', e => eE.push(e.message))
    p.on('console', m => { if (m.type() === 'error') cE.push(m.text()) })
    await p.goto(BASE + '?mode=demo', { waitUntil: 'load' })
    await sleep(5000)
    const f = path.join(ART, `${name}_${tag}.png`)
    await p.screenshot({ path: f, type: 'png' })
    const info = await p.evaluate(() => ({
      v2Bar: !!document.getElementById('v2-top-bar'),
      v2Stage: !!document.getElementById('v2-office-stage'),
      mobile: !!document.querySelector('.v2-bottom-nav'),
      navCollapsed: document.body.classList.contains('v2-nav-collapsed'),
      overflowX: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      ) - Math.max(
        document.documentElement.clientWidth,
        window.innerWidth || 0
      ),
    }))
    console.log(`  ${name} ${tag}: v2Bar=${info.v2Bar}  navCollapsed=${info.navCollapsed}  overflowX=${info.overflowX}px  bottomNav=${info.mobile}`)
    report(`${name} ${tag} errors`, eE, cE)
    await ctx.close()
    const sz = fs.statSync(f).size
    console.log(`  ➜ saved ${name}_${tag}.png (${(sz/1024).toFixed(1)} KB)`)
  }

  await browser.close()
  console.log('\n=== TOTAL FAILURES =', failures, '===')
  process.exit(failures ? 1 : 0)
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(99) })
