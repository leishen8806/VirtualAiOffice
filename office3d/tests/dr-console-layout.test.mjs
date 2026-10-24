// D-V1-R5 几何验收（Playwright，只读；无浏览器则 skip）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
let chromium
try { chromium = require(process.env.VIS3_PLAYWRIGHT || 'playwright').chromium } catch { chromium = null }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json; charset=utf-8' }
const VIEWPORTS = [
  { w: 1920, h: 1080, mapMin: 150, fontMin: 11, bgx: '50%' },
  { w: 1366, h: 768, mapMin: 120, fontMin: 10, bgx: '50%' },
  { w: 1024, h: 768, mapMin: 100, fontMin: 10, bgx: '0%' },
]

test('D-V1-R5 几何验收（1920/1366/1024）', { skip: chromium ? false : 'playwright 不可用，NOT_RUN' }, async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const f = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)))
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const BASE = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }))
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.goto(BASE + '/dr-console.html', { waitUntil: 'load', timeout: 45000 })
      await page.waitForFunction(() => document.querySelectorAll('#kpis .card').length === 8, null, { timeout: 45000 })
      await page.waitForTimeout(400)
      const m = await page.evaluate(() => {
        const hero = document.querySelector('.hero').getBoundingClientRect()
        const netEl = document.querySelector('.networkPanel')
        const net = netEl.getBoundingClientRect()
        const kpi = document.querySelector('.kpis').getBoundingClientRect()
        const aside = document.querySelector('aside').getBoundingClientRect()
        const map = document.querySelector('.map svg')
        const mapText = document.querySelector('.map text')
        const pan = getComputedStyle(document.querySelector('.panorama'))
        const region = (x0, y0, x1, y1) => ({ l: hero.left + x0 * hero.width, t: hero.top + y0 * hero.height, r: hero.left + x1 * hero.width, b: hero.top + y1 * hero.height })
        const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
        const w3 = region(0.69, 0.20, 0.84, 0.40)
        const w1 = region(0.13, 0.07, 0.30, 0.25)
        const netBox = { l: net.left, t: net.top, r: net.right, b: net.bottom }
        const asideBox = { l: aside.left, t: aside.top, r: aside.right, b: aside.bottom }
        return {
          netInHero: netEl.closest('.hero') !== null,
          netW3Inter: inter(netBox, w3),
          kpiNetGap: net.left - kpi.right,
          mapH: map ? map.getBoundingClientRect().height : 0,
          mapFont: mapText ? parseFloat(getComputedStyle(mapText).fontSize) : 0,
          bgX: pan.backgroundPositionX,
          w1CoveredByAside: inter(w1, asideBox) / ((w1.r - w1.l) * (w1.b - w1.t)),
          kpiCards: document.querySelectorAll('#kpis .card').length,
          overflowX: document.scrollingElement.scrollWidth - window.innerWidth,
        }
      })
      const label = `${vp.w}x${vp.h}`
      assert.equal(m.netInHero, false, label + ' networkPanel 不能是 .hero 后代')
      assert.ok(m.netW3Inter <= 1, label + ' networkPanel 与 W3 标题牌区域相交面积应为 0（实测 ' + m.netW3Inter.toFixed(1) + '）')
      assert.ok(m.kpiNetGap <= 16, label + ' KPI 右缘到面板左缘间距应 ≤16px（实测 ' + m.kpiNetGap.toFixed(1) + '）')
      assert.ok(m.mapH >= vp.mapMin, label + ' 地图 SVG 高度应 ≥' + vp.mapMin + 'px（实测 ' + m.mapH.toFixed(1) + '）')
      assert.ok(m.mapFont >= vp.fontMin, label + ' 地图城市标签字号应 ≥' + vp.fontMin + 'px（实测 ' + m.mapFont + '）')
      assert.equal(m.bgX, vp.bgx, label + ' panorama background-position-x 应为 ' + vp.bgx + '（实测 ' + m.bgX + '）')
      assert.ok(m.w1CoveredByAside < 0.5, label + ' W1 标题牌被侧栏覆盖应 <50%（实测 ' + (m.w1CoveredByAside * 100).toFixed(0) + '%）')
      assert.equal(m.kpiCards, 8, label + ' KPI 应为 8')
      assert.ok(m.overflowX <= 1, label + ' 无横向溢出（实测 ' + m.overflowX + '）')
      await ctx.close()
    }
  } finally {
    await browser.close(); server.close()
  }
})

test('D-V1-R6 窄屏无空洞 + 1366 KPI 副标题不截断', { skip: chromium ? false : 'playwright 不可用，NOT_RUN' }, async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const f = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)))
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const BASE = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }))
  try {
    // 窄屏无空洞
    for (const vp of [{ w: 600, h: 900 }, { w: 390, h: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.goto(BASE + '/dr-console.html', { waitUntil: 'load', timeout: 45000 })
      await page.waitForFunction(() => document.querySelectorAll('#kpis .card').length === 8, null, { timeout: 45000 })
      await page.waitForTimeout(300)
      const m = await page.evaluate(() => {
        const hero = document.querySelector('.hero').getBoundingClientRect()
        const pan = document.querySelector('.panorama').getBoundingClientRect()
        const mode = document.querySelector('.modeStrip').getBoundingClientRect()
        const site = document.querySelector('.sitePanel').getBoundingClientRect()
        const deepest = Math.max(pan.bottom, mode.bottom, site.bottom)
        const gap = site.top - Math.max(pan.bottom, mode.bottom)
        return {
          heroBottomGap: hero.bottom - deepest,
          siteFullWidth: site.left <= hero.left + 1 && site.right >= hero.right - 1,
          siteTopGap: gap,
        }
      })
      const label = `${vp.w}x${vp.h}`
      assert.ok(m.heroBottomGap <= 16, label + ' hero 底边应不超过最底可见元素 +16px（实测 ' + m.heroBottomGap.toFixed(1) + '）')
      assert.ok(m.siteFullWidth, label + ' 园区实景面板应覆盖整行（无空洞）')
      assert.ok(m.siteTopGap <= 50, label + ' 主图底到面板顶间距应 <50px（实测 ' + m.siteTopGap.toFixed(1) + '）')
      await ctx.close()
    }
    // 1366 KPI 副标题不截断
    {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.goto(BASE + '/dr-console.html', { waitUntil: 'load', timeout: 45000 })
      await page.waitForFunction(() => document.querySelectorAll('#kpis .card').length === 8, null, { timeout: 45000 })
      await page.waitForTimeout(300)
      const subs = await page.evaluate(() => [...document.querySelectorAll('#kpis .card .sub')].map((el) => ({ text: el.textContent, clipped: el.scrollWidth > el.clientWidth + 1, sw: el.scrollWidth, cw: el.clientWidth })))
      for (const s of subs) assert.ok(!s.clipped, `KPI 副标题不应截断："${s.text}"（scrollWidth ${s.sw} > clientWidth ${s.cw}）`)
      await ctx.close()
    }
  } finally {
    await browser.close(); server.close()
  }
})
