import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const beforeRoot = path.resolve(root, '..', 'office3d-backup-s1-3')
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
const result = { measuredAt: new Date().toISOString(), viewport: { width: 480, height: 1188 }, source: { beforeApp: path.join(beforeRoot, 'app.js'), sharedLayout: path.join(root, 'office-layout.js'), after: root }, tiers: {}, errors: [] }

async function measure(version, tier) {
  const context = await browser.newContext({ viewport: result.viewport, deviceScaleFactor: 1 })
  if (version === 'before') {
    await context.route('**/app.js', route => route.fulfill({ path: path.join(beforeRoot, 'app.js'), contentType: 'text/javascript' }))
  }
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`http://office.localhost:3200/?q=${tier}&perf=1&paired=${version}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  try {
    await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 2, null, { timeout: 20_000 })
    await page.waitForFunction(() => { const summary = window.__office?.quality?.summary?.(); return summary?.medium && summary?.low }, null, { timeout: 20_000 })
    await page.waitForTimeout(1500)
  } catch (error) {
    const unavailable = { unavailable: error.message, errors, body: (await page.locator('body').innerText()).slice(0, 500) }
    await context.close()
    return unavailable
  }
  const camera = async (name, goal) => {
    if (goal) await page.evaluate(goal => window.__office.setGoal(goal), goal)
    else await page.getByRole('button', { name: '🏢 全景' }).click()
    await page.waitForTimeout(1800)
    const full = await page.evaluate(() => ({ ...window.__office.quality.metrics, summary: window.__office.quality.summary() }))
    if (tier !== 'high') return { full, main: full }
    await page.evaluate(() => { window.__office.renderer.shadowMap.enabled = false })
    await page.waitForTimeout(1200)
    const main = await page.evaluate(() => ({ ...window.__office.quality.metrics, summary: window.__office.quality.summary() }))
    await page.evaluate(() => { window.__office.renderer.shadowMap.enabled = true })
    await page.waitForTimeout(600)
    return { full, main }
  }
  const value = {
    overview: await camera('overview'),
    foyer: await camera('foyer', { az: 6, el: 36, r: 14, t: [15, 0, 10.5] }),
    plaza: await camera('plaza', { az: 8, el: 34, r: 20, t: [2, 0, 23] }),
    errors,
  }
  await context.close()
  return value
}

for (const tier of ['high', 'low']) {
  result.tiers[tier] = { before: await measure('before', tier), after: await measure('after', tier) }
  result.errors.push(...result.tiers[tier].before.errors.map(error => `${tier}/before: ${error}`), ...result.tiers[tier].after.errors.map(error => `${tier}/after: ${error}`))
}
await browser.close()
await writeFile(path.join(here, 'paired-baseline.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (result.errors.length) process.exitCode = 1
