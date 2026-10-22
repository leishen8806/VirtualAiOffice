import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { MINI_BOUNDS } from '../office-layout.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const output = 'E:\\VirtualAIOffice\\paperclip-ops\\office3d-backup-s2-1'
await mkdir(path.join(output, 'screenshots'), { recursive: true })
const oldLayout = await readFile(path.join(output, 'office-layout.js'), 'utf8')
const oldEnv = await readFile(path.join(output, 'env.js'), 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
const result = { bounds: MINI_BOUNDS, before: {}, after: {}, clicks: [], warehouseSearch: null, errors: [] }

async function open(before) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', error => { result.errors.push(error.message); console.error('PAGEERROR', error.message) })
  page.on('console', message => { if (message.type() === 'error') { result.errors.push(message.text()); console.error('CONSOLE', message.text()) } })
  if (before) {
    await page.route('**/office-layout.js*', route => route.fulfill({ contentType: 'text/javascript', body: oldLayout }))
    await page.route('**/env.js*', route => route.fulfill({ contentType: 'text/javascript', body: oldEnv }))
  }
  await page.route(url => new URL(url).pathname === '/state', route => route.fulfill({ contentType: 'application/json', body: '{"agents":[]}' }))
  await page.route(url => new URL(url).pathname === '/foyer', route => route.fulfill({ contentType: 'application/json', body: '{"enabled":false}' }))
  await page.route(url => new URL(url).pathname === '/wall/data', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.route(url => new URL(url).pathname === '/kb', route => route.fulfill({ contentType: 'application/json', body: '{"ok":true,"docs":[]}' }))
  await page.goto(`http://office.localhost:3200/?q=high&s2=${before ? 'before' : 'after'}-${Date.now()}`, { waitUntil: 'domcontentloaded' })
  await page.bringToFront()
  await page.waitForFunction(() => window.__office?.scene, null, { timeout: 90_000 })
  return page
}

async function capture(page, prefix, name, target, radius) {
  await page.evaluate(({ target, radius }) => window.__office.setGoal({ az: 8, el: 34, r: radius, t: target }), { target, radius })
  await page.waitForTimeout(1400)
  const camera = await page.evaluate(() => ({ target: window.__office.cam.t.toArray(), goal: window.__office.goal.t.toArray() }))
  await page.locator('#stage canvas').screenshot({ path: path.join(output, 'screenshots', `${prefix}-${name}.png`) })
  return camera
}

try {
  for (const before of [true, false]) {
    const prefix = before ? 'before' : 'after', page = await open(before)
    result[prefix].office = await capture(page, prefix, 'office', [-11, 0, 0], 75)
    result[prefix].foyer = await capture(page, prefix, 'foyer', [2, 0, 11], 34)
    result[prefix].plaza = await capture(page, prefix, 'plaza', [2, 0, 23], 30)
    result[prefix].southwest = await capture(page, prefix, 'southwest', [-46, 0, 30], 24)
    await page.locator('#minimap').screenshot({ path: path.join(output, 'screenshots', `${prefix}-minimap.png`) })
    if (!before) {
      const box = await page.locator('#minimap').boundingBox()
      const scale = Math.min(440 / (MINI_BOUNDS.x1 - MINI_BOUNDS.x0), 188 / (MINI_BOUNDS.z1 - MINI_BOUNDS.z0))
      const ox = (440 - (MINI_BOUNDS.x1 - MINI_BOUNDS.x0) * scale) / 2, oy = (188 - (MINI_BOUNDS.z1 - MINI_BOUNDS.z0) * scale) / 2
      for (const [name, x, z] of [['前厅', 15, 10.5], ['广场', 2, 23], ['西南空地', -44, 34]]) {
        const px = ox + (x - MINI_BOUNDS.x0) * scale, py = oy + (z - MINI_BOUNDS.z0) * scale
        await page.mouse.click(box.x + px / 440 * box.width, box.y + py / 188 * box.height)
        const goal = await page.evaluate(() => window.__office.goal.t.toArray())
        result.clicks.push({ name, expected: [x, 0, z], goal, pass: Math.abs(goal[0] - x) < 0.05 && Math.abs(goal[2] - z) < 0.05 })
      }
      await page.locator('#searchBtn').click()
      await page.locator('#searchInput').fill('仓库')
      await page.waitForTimeout(100)
      result.warehouseSearch = { text: await page.locator('#searchResults').innerText(), count: await page.locator('.search-item').count() }
    }
    await page.close()
  }
  await writeFile(path.join(output, 'browser-acceptance.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  if (result.errors.length || result.clicks.some(item => !item.pass) || result.warehouseSearch.count) process.exitCode = 1
} finally {
  await browser.close()
}
