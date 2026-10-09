const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1140\\chrome-win\\chrome.exe'
const URL_BASE = 'http://127.0.0.1:18899/'
const HEAD = '479a067'
const ART = `E:\\VirtualAIOffice\\review-artifacts\\interactive-v2-${HEAD}`
if (!fs.existsSync(ART)) fs.mkdirSync(ART, { recursive: true })

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--window-size=1440,900', '--force-device-scale-factor=1'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
  const page = await ctx.newPage()

  async function shot(name) {
    const f = path.join(ART, `${name}.png`)
    await page.screenshot({ path: f, fullPage: false, type: 'png' })
    const sz = fs.statSync(f).size
    console.log(`[SAVE] ${name}.png ${sz} bytes`)
    return f
  }

  // ============ §18 S01-S12 screenshots ============

  // S01. Honest empty office (LIVE mode, no fixtures)
  await page.goto(`${URL_BASE}?mode=live`, { waitUntil: 'networkidle' })
  await sleep(3000)
  await shot('S01_honest_empty_live')

  // S02. Full demo mode (all roles visible + DEMO banner + 8 control buttons)
  await page.goto(`${URL_BASE}?mode=demo`, { waitUntil: 'networkidle' })
  await sleep(3500)
  await shot('S02_full_demo_mode')

  // S03. FE WORKING state (apply via dev console API setRoleState)
  await page.evaluate(() => {
    if (window.__coreHandleV2) window.__coreHandleV2.applyDemoStateVisual('IDLE')
  })
  await page.evaluate(() => {
    window.__coreHandleV2?.office?.setRoleState?.('frontend', 'WORKING')
  })
  await sleep(1500)
  await shot('S03_frontend_working_state')

  // S04. BE THINKING state
  await page.evaluate(() => {
    window.__coreHandleV2?.office?.setRoleState?.('backend', 'THINKING')
  })
  await sleep(1000)
  await shot('S04_backend_thinking_state')

  // S05. QA+Rev REVIEWING
  await page.evaluate(() => {
    window.__coreHandleV2?.animate?.review?.()
  })
  await sleep(1400)
  await shot('S05_qa_reviewer_reviewing')

  // S06. WAITING_HUMAN → activate Human Area
  await page.evaluate(() => {
    window.__coreHandleV2?.animate?.waitingHuman?.(true)
  })
  await sleep(1600)
  await shot('S06_waiting_human_amber_zone')

  // S07. BLOCKED role
  await page.evaluate(() => {
    window.__coreHandleV2?.animate?.blocked?.('product')
  })
  await sleep(1200)
  await shot('S07_blocked_role_state')

  // S08. MEETING state
  await page.evaluate(() => {
    window.__coreHandleV2?.applyDemoStateVisual?.('MEETING')
  })
  await sleep(1500)
  await shot('S08_meeting_orientation')

  // S09. Role Inspector open
  await page.evaluate(() => {
    window.__coreHandleV2?.openRoleInspector?.('architect')
  })
  await sleep(900)
  await shot('S09_role_inspector_open')

  // S10. Task Inspector open
  await page.evaluate(() => {
    window.__coreHandleV2?.closeInspector?.()
    const tasks = window.__coreHandleV2?.office?.constructor ? null : null
    // fire task-clicked event
    const ev = new CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'V2-101' } })
    document.getElementById('v2-office-stage').dispatchEvent(ev)
  })
  await sleep(900)
  await shot('S10_task_inspector_open')

  // S11. Helix panel expanded
  await page.evaluate(() => {
    window.__coreHandleV2?.closeInspector?.()
    window.__coreHandleV2?.setHelix?.(true)
  })
  await sleep(1000)
  await shot('S11_helix_panel_expanded')

  // S12. Reduced motion mode
  await page.addInitScript(() => {
    window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, media: '(prefers-reduced-motion: reduce)' })
  })
  const page2 = await ctx.newPage()
  await page2.goto(`${URL_BASE}?mode=demo`, { waitUntil: 'networkidle' })
  await page2.evaluate(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    document.documentElement.setAttribute('data-reduced-motion', mq.matches ? '1' : '0')
    if (window.VAOAppV2) window.VAOAppV2.setSkin('core')
  })
  await sleep(3000)
  await page2.screenshot({ path: path.join(ART, 'S12_reduced_motion.png'), type: 'png' })
  console.log(`[SAVE] S12_reduced_motion.png ${fs.statSync(path.join(ART, 'S12_reduced_motion.png')).size} bytes`)
  await page2.close()

  // ============ §19 60s interaction video (14 steps, sequentially) ============
  console.log('\n=== §19 INTERACTION VIDEO (14 steps) ===')
  const videoPath = path.join(ART, 'interactive-office-v2-14step.webm')
  const vctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    recordVideo: { dir: ART, size: { width: 1440, height: 900 } },
  })
  const vp = await vctx.newPage()
  async function step(n, desc, fn) {
    console.log(`[STEP ${String(n).padStart(2,'0')}/14] ${desc}`)
    await fn()
    await sleep(3200)
  }
  // Step 01: Idle demo
  await step(1, 'Idle demo scene: fresh open', async () => {
    await vp.goto(`${URL_BASE}?mode=demo`, { waitUntil: 'networkidle' })
  })
  // Step 02: Dispatch from Helix → FE
  await step(2, 'Dispatch event: Helix → Frontend (pulse + WORKING)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.dispatch?.('frontend') })
  })
  // Step 03: FE WORKING
  await step(3, 'Frontend shows WORKING state (typing arms, green glow)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.office?.setRoleState?.('frontend', 'WORKING') })
  })
  // Step 04: BE THINKING
  await step(4, 'Backend shows THINKING state (head tilt)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.dispatch?.('backend'); window.__coreHandleV2?.office?.setRoleState?.('backend', 'THINKING') })
  })
  // Step 05: Click FE role → role inspector
  await step(5, 'Click Frontend role → open Role Inspector drawer', async () => {
    await vp.evaluate(() => {
      window.__coreHandleV2?.openRoleInspector?.('frontend')
    })
  })
  // Step 06: Close inspector, click task capsule → task inspector
  await step(6, 'Close role → click task capsule → open Task Inspector', async () => {
    await vp.evaluate(() => {
      window.__coreHandleV2?.closeInspector?.()
      const ev = new CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'V2-101' } })
      document.getElementById('v2-office-stage').dispatchEvent(ev)
    })
  })
  // Step 07: Review state QA+Reviewer
  await step(7, 'Close task → QA + Reviewer enter REVIEW state', async () => {
    await vp.evaluate(() => {
      window.__coreHandleV2?.closeInspector?.(); window.__coreHandleV2?.animate?.review?.()
    })
  })
  // Step 08: WAITING_HUMAN
  await step(8, 'WAITING_HUMAN: activate Human Area (amber glow + card)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.waitingHuman?.(true) })
  })
  // Step 09: Human Area activates
  await step(9, 'Human Area spotlight amber', async () => {
    await vp.evaluate(() => {
      document.querySelector('.zone-human-area')?.scrollIntoView?.({ block: 'center', inline: 'center' })
    })
  })
  // Step 10: Open Helix panel
  await step(10, 'Open Helix expanded panel (conversation + composer + metrics)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.waitingHuman?.(false); window.__coreHandleV2?.setHelix?.(true) })
  })
  // Step 11: Return → close Helix
  await step(11, 'Return to office: close Helix', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.setHelix?.(false) })
  })
  // Step 12: DONE → IDLE
  await step(12, 'animate.done(frontend, 1200) → brief done then IDLE', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.done?.('frontend', 1200) })
  })
  // Step 13: Toggle DEMO banner reduced-motion button toggle
  await step(13, 'Reduced motion toggle: disable ambient animations', async () => {
    await vp.evaluate(() => {
      const style = document.createElement('style')
      style.id = 'force-rm'
      style.textContent = `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`
      document.head.appendChild(style)
      document.documentElement.setAttribute('data-reduced-motion', '1')
      if (window.VAOCoreCharactersV2?.injectStyles) window.VAOCoreCharactersV2.injectStyles()
    })
  })
  // Step 14: Final wide view
  await step(14, 'Final wide 2.5D 6-zone view', async () => {
    await vp.evaluate(() => { window.scrollTo(0, 0) })
  })

  await vp.close()
  const rawVid = await vctx.video?.path?.()
  await vctx.close()
  if (rawVid && fs.existsSync(rawVid)) {
    // playwright names it with GUID; rename to friendly
    fs.renameSync(rawVid, videoPath)
    console.log(`[VIDEO SAVE] ${videoPath} ${fs.statSync(videoPath).size} bytes`)
  } else {
    console.log('[VIDEO] No video path available; recorded videos in folder:')
    const dirFiles = fs.readdirSync(ART).filter(f => f.endsWith('.webm'))
    dirFiles.forEach(f => console.log('  -', f, fs.statSync(path.join(ART,f)).size, 'bytes'))
  }

  await browser.close()
  console.log('\n=== §18 + §19 ARTIFACTS in:', ART)
  fs.readdirSync(ART).forEach(f => {
    const p = path.join(ART, f); const s = fs.statSync(p).size
    console.log(`  ${f}  ${s} bytes`)
  })
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(2) })
