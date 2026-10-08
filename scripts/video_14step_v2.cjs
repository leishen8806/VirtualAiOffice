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
  console.log('\n=== §19 INTERACTION VIDEO (14 steps, ~56-72s) ===')
  const vctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
    recordVideo: { dir: ART, size: { width: 1440, height: 900 } },
  })
  const vp = await vctx.newPage()
  async function step(n, desc, fn) {
    console.log(`[STEP ${String(n).padStart(2,'0')}/14] ${desc}`)
    await fn()
    await sleep(3500)
  }
  await step(1, 'Idle demo scene: fresh open', async () => {
    await vp.goto(`${URL_BASE}?mode=demo`, { waitUntil: 'networkidle' })
  })
  await step(2, 'Dispatch event: Helix → Frontend (pulse + WORKING)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.dispatch?.('frontend') })
  })
  await step(3, 'Frontend WORKING state (typing arms, green glow)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.office?.setRoleState?.('frontend', 'WORKING') })
  })
  await step(4, 'Backend THINKING state (head tilt)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.dispatch?.('backend'); window.__coreHandleV2?.office?.setRoleState?.('backend', 'THINKING') })
  })
  await step(5, 'Click Frontend role → open Role Inspector drawer', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.openRoleInspector?.('frontend') })
  })
  await step(6, 'Close role → click task → open Task Inspector', async () => {
    await vp.evaluate(() => {
      window.__coreHandleV2?.closeInspector?.()
      const ev = new CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'V2-101' } })
      document.getElementById('v2-office-stage').dispatchEvent(ev)
    })
  })
  await step(7, 'Close task → QA + Reviewer enter REVIEW state', async () => {
    await vp.evaluate(() => {
      window.__coreHandleV2?.closeInspector?.(); window.__coreHandleV2?.animate?.review?.()
    })
  })
  await step(8, 'WAITING_HUMAN: activate Human Area (amber glow + card)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.waitingHuman?.(true) })
  })
  await step(9, 'Human Area spotlight amber', async () => {
    await vp.evaluate(() => { document.querySelector('.zone-human-area')?.scrollIntoView?.({ block: 'center', inline: 'center' }) })
  })
  await step(10, 'Open Helix expanded panel (conversation + composer + metrics)', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.waitingHuman?.(false); window.__coreHandleV2?.setHelix?.(true) })
  })
  await step(11, 'Return to office: close Helix', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.setHelix?.(false) })
  })
  await step(12, 'animate.done(frontend, 1200) → brief done then IDLE', async () => {
    await vp.evaluate(() => { window.__coreHandleV2?.animate?.done?.('frontend', 1200) })
  })
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
  await step(14, 'Final wide 2.5D 6-zone view', async () => {
    await vp.evaluate(() => { window.scrollTo(0, 0) })
  })

  const video = vp.video()
  const beforePath = video ? await video.path() : null
  await vp.close()
  try { await vctx.close() } catch (_) {}
  await sleep(6000)
  const finalVid = path.join(ART, 'interactive-office-v2-14step.webm')
  async function withRetry(fn, maxTries=8, wait=2500) {
    let lastErr = null
    for (let i=1;i<=maxTries;i++) {
      try { return await fn() }
      catch (e) {
        lastErr = e
        console.log(`  [retry ${i}/${maxTries}] Windows EBUSY wait…`)
        await sleep(wait)
      }
    }
    throw lastErr
  }
  if (beforePath && fs.existsSync(beforePath)) {
    await withRetry(async () => {
      fs.copyFileSync(beforePath, finalVid)
      try { fs.rmSync(beforePath, { maxRetries: 8, retryDelay: 2000 }) } catch(_){}
    })
    console.log(`\n[VIDEO SAVED] ${finalVid} — ${fs.statSync(finalVid).size} bytes`)
  } else {
    const cand = fs.readdirSync(ART).filter(f => f.endsWith('.webm') && f !== path.basename(finalVid))
    for (const f of cand) {
      const p = path.join(ART, f)
      console.log('[CANDIDATE VID]', p, fs.statSync(p).size, 'bytes')
      await withRetry(async () => {
        fs.copyFileSync(p, finalVid)
        try { fs.rmSync(p, { maxRetries: 6, retryDelay: 2000 }) } catch(_){}
      })
      console.log('[RENAMED via copy+rm] →', finalVid)
      break
    }
  }
  await browser.close()

  console.log('\n=== ARTIFACTS DONE →', ART)
  fs.readdirSync(ART).forEach(f => {
    const p = path.join(ART, f); const s = fs.statSync(p).size
    const kb = (s/1024).toFixed(1)
    console.log(`  ${f}  ${kb} KB`)
  })
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(2) })
