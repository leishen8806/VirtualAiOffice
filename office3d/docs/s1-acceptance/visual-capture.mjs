import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const here = path.dirname(fileURLToPath(import.meta.url)), shots = path.join(here, 'screenshots')
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false })
const context = await browser.newContext({ viewport: { width: 480, height: 1188 }, deviceScaleFactor: 1 })
const page = await context.newPage(), errors = []
page.on('pageerror', error => errors.push(String(error)))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
await page.goto('http://office.localhost:3200/?q=high', { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForFunction(() => window.__office?.quality?.metrics?.rendered > 2, null, { timeout: 90_000 })
await page.waitForTimeout(1500)
const panelText = await page.evaluate(() => {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); ctx.font = '500 42px sans-serif'
  return Object.fromEntries(Object.entries(window.__office.foyerPanels()).map(([id, panel]) => {
    const lines = JSON.parse(panel.signature || '{"lines":[]}').lines || []
    return [id, lines.map(line => { const width = ctx.measureText(line).width; return { line, width: Math.round(width), effectiveTextureFont: Math.round(42 * Math.min(1, 916 / Math.max(1, width))) } })]
  }))
})
await page.screenshot({ path: path.join(shots, 's1-minimap-and-ui.png') })
await page.evaluate(() => document.getElementById('clean')?.click())

const scenes = [
  ['foyer-overview', { az: 6, el: 48, r: 31, t: [2, 0, 10] }],
  ['central-reception-carpet', { az: 4, el: 28, r: 10, t: [2, 0, 6] }],
  ['service-panels', { az: 3, el: 24, r: 8, t: [15, 0, 9.5] }],
  ['waiting-sofa', { az: 3, el: 22, r: 7, t: [18.5, 0, 11.5] }],
  ['plaza-overview', { az: 8, el: 34, r: 20, t: [2, 0, 23] }],
  ['coffee-cart', { az: 5, el: 24, r: 10, t: [-5, 0, 22] }],
  ['stalls-benches-lamps', { az: 5, el: 29, r: 13, t: [9, 0, 23] }],
]
for (const [name, goal] of scenes) {
  await page.evaluate(goal => window.__office.setGoal(goal), goal)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: path.join(shots, `s1-${name}-dark.png`) })
}
await page.evaluate(() => document.getElementById('bright')?.click())
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(shots, 's1-stalls-benches-lamps-light.png') })
const result = { viewport: { width: 480, height: 1188 }, scenes: scenes.map(([name]) => name), panelText, errors }
await context.close(); await browser.close()
await writeFile(path.join(here, 'visual-capture.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exitCode = 1
