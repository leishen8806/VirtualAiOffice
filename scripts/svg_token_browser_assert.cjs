const path = require('path')
const NODE_PW = process.env.NODE_PATH || 'E:\\VirtualAIOffice\\review-artifacts\\node_modules'
require('module').Module.globalPaths.push(NODE_PW)
const playwright = require('playwright')
const BASE = process.env.BASE_URL || 'http://localhost:18998'

const roleIds = ['product', 'architect', 'frontend', 'backend', 'qa', 'reviewer', 'docs', 'helix']

async function main() {
  const chromiumPath = process.env.CHROMIUM_PATH
    || 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1140\\chrome-win\\chrome.exe'
  const browser = await playwright.chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  let consoleErrors = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors++ })
  page.on('pageerror', () => { consoleErrors++ })

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.waitForSelector('html[data-theme-core]', { timeout: 15000 })

  const zoneBgSelectors = {
    Planning:    '.zone-planning path:nth-child(1)',
    Engineering: '.zone-engineering path:nth-child(1)',
    Quality:     '.zone-quality path:nth-child(1)',
    Knowledge:   '.zone-knowledge path:nth-child(1)',
  }
  const zoneRugSelectors = {
    Planning:    '.zone-planning ellipse',
    Engineering: '.zone-engineering ellipse',
    Quality:     '.zone-quality ellipse',
    Knowledge:   '.zone-knowledge ellipse',
    Helix:       '.zone-helix-hub ellipse:nth-of-type(1)',
  }

  const results = await page.evaluate(({ roleIds, zoneBgSelectors, zoneRugSelectors }) => {
    const cs = getComputedStyle(document.documentElement)
    const tokens = { role: {}, bad: {}, font: {} }
    for (const r of roleIds) {
      const name = `--role-${r}`
      tokens.role[name] = cs.getPropertyValue(name).trim()
    }
    for (const badName of ['--role---role-product', '--role---role-frontend', '--role---role-docs', '--role---role-helix']) {
      tokens.bad[badName] = cs.getPropertyValue(badName).trim()
    }
    tokens.font['--sansZh'] = cs.getPropertyValue('--sansZh').trim()
    tokens.font['--sans']   = cs.getPropertyValue('--sans').trim()
    tokens.font['--mono']   = cs.getPropertyValue('--mono').trim()

    function evalSelectors(sels) {
      const out = {}
      for (const [k, sel] of Object.entries(sels)) {
        const el = document.querySelector(sel)
        if (!el) { out[k] = { found: false }; continue }
        const fill = (getComputedStyle(el).fill || '').trim()
        const stroke = (getComputedStyle(el).stroke || '').trim()
        const rgb = fill.toLowerCase()
        const isBlack = (rgb === 'rgb(0, 0, 0)' || rgb === 'black' || rgb === '')
        out[k] = { found: true, fill, stroke, isBlack }
      }
      return out
    }
    return { tokens, zones: evalSelectors(zoneBgSelectors), rugs: evalSelectors(zoneRugSelectors) }
  }, { roleIds, zoneBgSelectors, zoneRugSelectors })

  results.consoleErrors = consoleErrors
  results.pageUrl = page.url()
  results.themeAttr = await page.getAttribute('html', 'data-theme-core')

  console.log('\n============ SVG TOKEN + ZONE FILL REPORT ============\n')
  console.log(JSON.stringify(results, null, 2))

  let anyFail = 0
  console.log('\n------------ ROLE TOKENS (Step 4) ------------')
  for (const [k, v] of Object.entries(results.tokens.role)) {
    const ok = v !== ''
    console.log(`  ${k} = "${v}" ${ok ? '✅' : '❌ EMPTY ❗'}`)
    if (!ok) anyFail++
  }
  console.log('\n------------ BAD DOUBLE-PREFIX TOKENS ------------')
  for (const [k, v] of Object.entries(results.tokens.bad)) {
    const ok = v === ''
    console.log(`  ${k} = "${v}" ${ok ? '✅ empty (correct)' : '❌ LEAKED VALUE (BUG) ❗'}`)
    if (!ok) anyFail++
  }
  console.log('\n------------ FONT TOKENS (Step 2) ------------')
  for (const [k, v] of Object.entries(results.tokens.font)) {
    const ok = v !== ''
    console.log(`  ${k} = "${v.slice(0, 60)}${v.length > 60 ? '…' : ''}" ${ok ? '✅' : '❌ EMPTY ❗'}`)
    if (!ok) anyFail++
  }
  console.log('\n------------ ZONE BACKGROUND FILLS (Step 5/8) ------------')
  for (const [k, z] of Object.entries(results.zones)) {
    const ok = z.found && !z.isBlack
    console.log(`  ${k}: found=${z.found} fill="${z.fill}" black?=${z.isBlack} ${ok ? '✅ NOT BLACK' : '❌ BLACK OR MISSING ❗'}`)
    if (!ok) anyFail++
  }
  console.log('\n------------ ZONE RUG SAMPLES ------------')
  for (const [k, z] of Object.entries(results.rugs)) {
    const ok = z.found && !z.isBlack
    console.log(`  ${k} rug: found=${z.found} fill="${z.fill}" black?=${z.isBlack} ${ok ? '✅' : '❌ BLACK ❗'}`)
    if (!ok) anyFail++
  }
  console.log('\nconsoleErrors =', consoleErrors, 'anyFail =', anyFail)
  await browser.close()
  process.exit(anyFail > 0 ? 2 : 0)
}
main().catch((e) => { console.error('FATAL:', e); process.exit(3) })
