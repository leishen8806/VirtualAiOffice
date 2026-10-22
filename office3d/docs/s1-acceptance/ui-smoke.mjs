import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ channel: 'chrome', headless: false })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = [], info = []
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); else if (message.text().includes('静态网格合并')) info.push(message.text()) })
await page.goto(process.env.OFFICE_URL || 'http://office.localhost:3200/', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 1, null, { timeout: 90_000 })

const click = id => page.evaluate(id => document.getElementById(id)?.click(), id)
const modal = async id => {
  await click(id)
  await page.waitForFunction(() => document.getElementById('modalWrap')?.classList.contains('show'))
  await page.waitForFunction(() => !/读取.*…|统计中…|加载中…/.test(document.getElementById('modal')?.innerText || ''), null, { timeout: 30_000 }).catch(() => {})
  const text = await page.locator('#modal').innerText()
  await page.locator('#modal [data-x]').click()
  return text.slice(0, 300)
}

await click('todoChip')
const taskPanel = await page.evaluate(() => ({ exists: !!document.getElementById('quest'), open: !document.getElementById('quest')?.classList.contains('collapsed') }))

const search = {}
for (const term of ['咖啡', '接待', '服务台', '广场']) {
  await click('searchBtn')
  await page.locator('#searchInput').fill(term)
  await page.waitForTimeout(400)
  search[term] = await page.evaluate(() => ({ open: document.getElementById('searchPanel')?.classList.contains('show'), text: document.getElementById('searchResults')?.innerText.slice(0, 500), count: document.querySelectorAll('#searchResults .search-item').length }))
  await page.keyboard.press('Escape')
}

const governance = await modal('govBtn')
await click('govBtn')
await page.waitForFunction(() => document.getElementById('workloadSection'))
await page.evaluate(() => { const node = document.getElementById('workloadSection'); node.open = true; node.dispatchEvent(new Event('toggle')) })
await page.waitForFunction(() => !document.getElementById('workloadPanel')?.textContent.includes('读取编制与工作量'), null, { timeout: 30_000 })
const workload = (await page.locator('#workloadPanel').innerText()).slice(0, 300)
await page.locator('#modal [data-x]').click()

const collaboration = await modal('collabBtn')
const daily = await modal('daily')
const knowledge = await modal('kbBtn')

await click('replay')
await page.waitForTimeout(1000)
const replay = await page.evaluate(() => ({ exists: !!document.getElementById('replayUI'), text: document.getElementById('replayUI')?.innerText.slice(0, 300) }))
await page.keyboard.press('Escape')

const personPoint = await page.evaluate(() => {
  const v = [...window.__office.views.values()].find(view => view.data?.status !== 'terminated') || [...window.__office.views.values()][0]
  Object.assign(v, { away: false, leaving: false })
  v.char.group.visible = true
  const point = v.char.group.position.clone().setY(1).project(window.__office.camera)
  const rect = window.__office.renderer.domElement.getBoundingClientRect()
  return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
})
await page.mouse.click(personPoint.x, personPoint.y)
await page.waitForFunction(() => document.getElementById('detail')?.style.display === 'block')
await click('detailChat')
await page.waitForFunction(() => document.getElementById('modalWrap')?.classList.contains('show'))
await page.waitForFunction(() => !/加载中…/.test(document.getElementById('modal')?.innerText || ''), null, { timeout: 30_000 }).catch(() => {})
const chat = (await page.locator('#modal').innerText()).slice(0, 300)
await page.locator('#modal [data-x]').click()

const dock = await page.evaluate(async () => {
  const rows = []
  for (const button of document.querySelectorAll('#dock button')) {
    button.click()
    await new Promise(resolve => setTimeout(resolve, 40))
    rows.push({ label: button.textContent.trim(), target: window.__office.cam.t.toArray() })
  }
  return rows
})

const minimap = await page.locator('#minimap').boundingBox()
const miniPoint = async ([x, z]) => page.evaluate(async ([x, z]) => {
  const { MINI_BOUNDS: bounds } = await import('./office-layout.js'), canvas = document.getElementById('minimap'), rect = canvas.getBoundingClientRect()
  const scale = Math.min(canvas.width / (bounds.x1 - bounds.x0), canvas.height / (bounds.z1 - bounds.z0)), ox = (canvas.width - (bounds.x1 - bounds.x0) * scale) / 2, oy = (canvas.height - (bounds.z1 - bounds.z0) * scale) / 2
  return { x: rect.left + (ox + (x - bounds.x0) * scale) / canvas.width * rect.width, y: rect.top + (oy + (z - bounds.z0) * scale) / canvas.height * rect.height }
}, [x, z])
const minimapClicks = []
for (const target of [{ name: '前厅', world: [15, 10.5] }, { name: '广场', world: [2, 23] }]) {
  const point = await miniPoint(target.world), before = await page.evaluate(() => window.__office.cam.t.toArray())
  await page.mouse.click(point.x, point.y); await page.waitForTimeout(100)
  const after = await page.evaluate(() => window.__office.cam.t.toArray())
  minimapClicks.push({ ...target, before, after, changed: before.some((value, index) => Math.abs(value - after[index]) > .01) })
}

const narrow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
await context.close()

const townContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const townPage = await townContext.newPage()
const townErrors = []
townPage.on('pageerror', error => townErrors.push(String(error)))
townPage.on('console', message => { if (message.type() === 'error') townErrors.push(message.text()) })
const townResponse = await townPage.goto('http://office.localhost:3200/town.html', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await townPage.waitForSelector('#townMap')
await townPage.waitForTimeout(1000)
const town = { status: townResponse?.status(), canvas: await townPage.locator('#townMap').isVisible(), text: (await townPage.locator('body').innerText()).slice(0, 300), errors: townErrors }
await townContext.close()
await browser.close()

const result = { taskPanel, search, governance, workload, collaboration, daily, knowledge, replay, chat, dock, minimap: minimapClicks, narrow, town, mergeLogs: info, errors }
await writeFile(path.join(here, 'ui-smoke.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (errors.length || townErrors.length || !taskPanel.open || Object.values(search).some(item => !item.open || !item.count) || !replay.exists || !chat || !dock.length || minimapClicks.some(item => !item.changed) || townResponse?.status() !== 200 || !town.canvas) process.exitCode = 1
