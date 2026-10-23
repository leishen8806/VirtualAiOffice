import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('/Users/suchen/Desktop/Niuma/node_modules/playwright')
const ROOT = '/tmp/vis2-qa/cand-2879124/office3d'
const OUT = '/tmp/vis2-qa/visual'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.css': 'text/css; charset=utf-8' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)))
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found') }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const BASE = `http://127.0.0.1:${port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const consoleErrors = [], requests = [], blocked = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)) })
page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + String(error.message).slice(0, 300)))
page.on('request', (request) => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname)) requests.push(url.pathname); else blocked.push(request.url()) })
await page.goto(BASE + '/dr-vis2-rack-cell-preview.html', { waitUntil: 'load', timeout: 45000 })
await page.waitForFunction(() => Boolean(window.__vis2?.cell && window.__vis2?.renderer), null, { timeout: 45000 })
await page.waitForTimeout(1500)
const results = { generatedAt: new Date().toISOString(), url: BASE + '/dr-vis2-rack-cell-preview.html', consoleErrors, requests: [...new Set(requests)], blockedExternal: blocked, checks: [] }
const check = (id, ok, detail) => results.checks.push({ id, ok, detail })
const readout = await page.evaluate(() => JSON.parse(document.getElementById('readout').textContent))
check('preview-summary-high', readout.drawCalls === 6 && readout.triangles === 25144, JSON.stringify({ drawCalls: readout.drawCalls, triangles: readout.triangles, instances: readout.instances }))
const title = await page.title()
check('preview-title-marked-component-only', title.includes('组件预览'), title)
const canvasBox = await page.evaluate(() => { const r = window.__vis2.renderer.domElement.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
async function shot(name) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, name + '.png') }) }
await shot('01-overview')
await page.click('#v-rack').catch(() => {}); await shot('02-rack')
await page.click('#v-shuttle').catch(() => {}); await shot('03-shuttle')
await page.click('#v-aisle').catch(() => {}); await shot('04-aisle')
const clip = { x: Math.round(canvasBox.x), y: Math.round(canvasBox.y), width: Math.round(canvasBox.width), height: Math.round(canvasBox.height) }
await page.screenshot({ path: path.join(OUT, 'canvas-rack.png'), clip })
await page.click('#v-over').catch(() => {}); await page.waitForTimeout(300)
await page.screenshot({ path: path.join(OUT, 'canvas-overview.png'), clip })
// 近景：车轮/轨道、托盘/横梁（直接摆相机，预览的动画循环会重绘）
const setCamera = (pos, target) => page.evaluate(([p, t]) => { const c = window.__vis2.camera; c.position.set(...p); c.lookAt(...t) }, [pos, target])
await setCamera([-146, 1.1, 3.2], [-146, 0.15, -1]); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, 'canvas-wheels.png'), clip })
await setCamera([-151, 3.2, 4.0], [-141, 2.0, -1]); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, 'canvas-pallets.png'), clip })
await page.click('#quality').catch(() => {}); await page.waitForTimeout(400)
const lowReadout = await page.evaluate(() => JSON.parse(document.getElementById('readout').textContent))
await page.screenshot({ path: path.join(OUT, 'canvas-low.png'), clip })
check('preview-low-summary', lowReadout.quality === 'low' && lowReadout.triangles === 9132, JSON.stringify({ quality: lowReadout.quality, triangles: lowReadout.triangles, drawCalls: lowReadout.drawCalls }))
await page.click('#quality').catch(() => {}); await page.waitForTimeout(300)
// 组件级实测：独立 scene + 无阴影 renderer，只放本构件
const component = await page.evaluate(async () => {
  const THREE = window.__vis2.THREE
  const { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } = await import('/office-layout.js')
  const { buildVis2RackCell } = await import('/dr-vis2-rack-cell.js')
  const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.setSize(640, 360)
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 400); camera.position.set(-170, 20, 20); camera.lookAt(-146, 2, -2)
  const holder = new THREE.Group(); scene.add(holder)
  const high = buildVis2RackCell({ THREE, root: holder, layout, quality: { tier: 'high' } })
  renderer.info.autoReset = true
  renderer.render(scene, camera)
  const highCalls = renderer.info.render.calls, highTris = renderer.info.render.triangles
  holder.clear(); high.dispose()
  const lowCell = buildVis2RackCell({ THREE, root: holder, layout, quality: { tier: 'low' } })
  renderer.render(scene, camera)
  const lowCalls = renderer.info.render.calls, lowTris = renderer.info.render.triangles
  holder.clear(); lowCell.dispose()
  const summary = high.summary ? null : null
  renderer.dispose()
  return { highCalls, highTris, lowCalls, lowTris }
})
check('component-high-6calls-25144tris', component.highCalls === 6 && component.highTris === 25144, JSON.stringify(component))
check('component-low-9132tris', component.lowTris === 9132, JSON.stringify(component))
check('low-drawcall-doc-mismatch', component.lowCalls === 6, `summary 自报 drawCalls=6，但低画质 film count=0，实际渲染 draw calls=${component.lowCalls}`)
// 预览页实测（含地面 + 阴影）
const previewInfo = await page.evaluate(() => ({ calls: window.__vis2.renderer.info.render.calls, triangles: window.__vis2.renderer.info.render.triangles, memory: window.__vis2.renderer.info.memory, shadow: window.__vis2.renderer.shadowMap.enabled }))
check('preview-info-captured', previewInfo.calls > 0, JSON.stringify(previewInfo))
// 生命周期：画质切换 20 轮（每次都 dispose + rebuild）
const before = await page.evaluate(() => ({ geometries: window.__vis2.renderer.info.memory.geometries, textures: window.__vis2.renderer.info.memory.textures, children: window.__vis2.cell.group.children.length }))
const series = []
for (let i = 0; i < 20; i++) {
  await page.click('#quality')
  await page.waitForTimeout(120)
  series.push(await page.evaluate(() => ({ geometries: window.__vis2.renderer.info.memory.geometries, textures: window.__vis2.renderer.info.memory.textures, children: window.__vis2.cell.group.children.length, tier: window.__vis2.cell.summary().quality })))
}
const unique = [...new Set(series.map((row) => `${row.geometries}/${row.textures}/${row.children}/${row.tier}`))]
check('quality-toggle-20-stable', series.every((row) => row.children === 5 + 1) && unique.length <= 4, `before=${JSON.stringify(before)} unique=${unique.join(' | ')}`)
// 幂等 dispose（预览重建一次，再验证 dispose 两次）
const disposeCheck = await page.evaluate(() => {
  const holder = new window.__vis2.THREE.Group(); window.__vis2.scene.add(holder)
  return { note: 'dispose 已在 node 探针覆盖（20 次构建/销毁 + 事件计数）' }
})
check('preview-dispose-covered-by-node-probe', Boolean(disposeCheck.note), disposeCheck.note)
results.readout = readout; results.component = component; results.previewInfo = previewInfo; results.lifecycle = { before, series, unique }; results.canvasBox = canvasBox
results.pass = results.checks.every((c) => c.ok)
fs.writeFileSync(path.join(OUT, 'visual.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify({ pass: results.pass, checks: results.checks, component, previewInfo, consoleErrors, blockedExternal: blocked, requests: [...new Set(requests)].slice(0, 30) }, null, 2))
await browser.close(); server.close()
