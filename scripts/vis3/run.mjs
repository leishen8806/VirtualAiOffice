// VIS3-TEST-001：可复用浏览器视觉回归 + 运行时性能 + 生命周期测试执行器。
// 用法：
//   node scripts/vis3/run.mjs --repo <仓库根> --scene office,dr,dashboard --out <输出目录> [--dpr 1] [--viewport 1280x720] [--playwright <路径>]
// 只读产品代码；用 mock Paperclip + 阻断外网 + 随机端口；证据写入 --out。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { bootIsolated } from './fixture.mjs'
import { INSTRUMENT } from './instrument.mjs'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries([...Array.from({ length: process.argv.length }).keys()].map((i) => [process.argv[i], process.argv[i + 1]]).filter(([k]) => k && k.startsWith('--')))
const REPO = path.resolve(args['--repo'] || process.cwd())
const SCENES = String(args['--scene'] || 'office,dr,dashboard').split(',').map((s) => s.trim())
const OUT = path.resolve(args['--out'] || path.join(REPO, 'docs/dispatch/vis3/qa-baseline'))
const DPR = Number(args['--dpr'] || 1)
const VIEWPORT = (args['--viewport'] || '1280x720').split('x').map(Number)
const PW = args['--playwright'] || process.env.VIS3_PLAYWRIGHT || require.resolve('playwright')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true })
const SHA = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const { chromium } = require(PW)
const report = { sha: SHA, generatedAt: new Date().toISOString(), env: { platform: process.platform, node: process.version, dpr: DPR, viewport: VIEWPORT.join('x') }, scenes: {} }
const check = (list, id, ok, detail) => list.push({ id, ok, detail })
const writeJson = (n, v) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(v, null, 2) + '\n')

const collect = (page) => page.evaluate(() => {
  const o = window.__office || window.__vis2 || {}
  const renderer = o.renderer
  const names = [], batchGroups = [], colorCounts = { oldBlue: 0, newBlue: 0, orange: 0 }
  const root = o.scene || o.root || null
  const targets = o.THREE ? { oldBlue: new (o.THREE.Color)(0x2d608b), newBlue: new (o.THREE.Color)(0x2f6fa8), orange: new (o.THREE.Color)(0xe8832a) } : null
  if (root) root.traverse((node) => {
    if (node.name) names.push(node.name)
    if (node.userData?.batchGroup) batchGroups.push(node.userData.batchGroup)
    if (!targets) return
    const colors = node.geometry?.getAttribute?.('color'); if (!colors) return
    for (let i = 0; i < colors.count; i++) { const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i); for (const [k, c] of Object.entries(targets)) if (Math.abs(r - c.r) < .01 && Math.abs(g - c.g) < .01 && Math.abs(b - c.b) < .01) colorCounts[k]++ }
  })
  return {
    canvasCount: document.querySelectorAll('canvas').length,
    rendererInfo: renderer ? { calls: renderer.info?.render?.calls, triangles: renderer.info?.render?.triangles, geometries: renderer.info?.memory?.geometries, textures: renderer.info?.memory?.textures, dpr: renderer.getPixelRatio?.() } : null,
    gpu: renderer ? (() => { const gl = renderer.getContext?.(); const d = gl?.getExtension?.('WEBGL_debug_renderer_info'); return d && gl ? { vendor: gl.getParameter(d.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(d.UNMASKED_RENDERER_WEBGL) } : null })() : null,
    names, batchGroups: [...new Set(batchGroups)], colorCounts,
    vis3: window.__vis3 ? { raf: window.__vis3.raf, rafActive: window.__vis3.rafActive, intervals: window.__vis3.intervals, timeouts: window.__vis3.timeouts, fetchCalls: window.__vis3.fetchCalls } : null,
  }
})
const sampleFrames = (page, ms = 5000) => page.evaluate((duration) => new Promise((resolve) => { const d = []; let s = performance.now(), p = s; function f(t) { d.push(t - p); p = t; if (t - s < duration) requestAnimationFrame(f); else resolve(d) } requestAnimationFrame(f) }), ms).then((d) => { const s = [...d].sort((a, b) => a - b); const p = (q) => s.length ? +s[Math.min(s.length - 1, Math.floor(q / 100 * s.length))].toFixed(2) : null; return { samples: s.length, p50: p(50), p95: p(95), max: s.length ? +s[s.length - 1].toFixed(2) : null } })

async function openPage(browser, base, url, { abort = [], netLog } = {}) {
  const context = await browser.newContext({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] }, deviceScaleFactor: DPR, serviceWorkers: 'block' })
  const requests = [], errors = []
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname)) { if (abort.some((a) => u.pathname.includes(a))) return route.abort(); return route.continue() } fs.appendFileSync(netLog, JSON.stringify({ blockedBrowser: u.origin + u.pathname }) + '\n'); return route.abort() })
  const page = await context.newPage()
  await page.addInitScript(INSTRUMENT)
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)))
  page.on('request', (r) => { const u = new URL(r.url()); if (['127.0.0.1', 'localhost'].includes(u.hostname)) requests.push({ method: r.method(), path: u.pathname + u.search, type: r.resourceType() }) })
  await page.goto(base + url, { waitUntil: 'load', timeout: 45000 })
  await page.waitForFunction(() => Boolean((window.__office || window.__vis2) && (window.__office?.renderer || window.__vis2?.renderer)), null, { timeout: 45000 }).catch(() => {})
  return { context, page, requests, errors }
}
const screenshot = (page, file) => page.screenshot({ path: path.join(OUT, 'screenshots', file + '.png') })

// ---- DR 场景（仓库/仓配） ----
async function sceneDr(browser, base) {
  const checks = []
  const { page, context, requests } = await openPage(browser, base, '/?campus=1&q=high', { netLog: path.join(OUT, 'logs/blocked-network.jsonl') })
  const t0 = Date.now()
  await page.waitForFunction(() => Boolean(window.__office?.campus?.summary), null, { timeout: 45000 })
  const loadMs = Date.now() - t0
  const setView = async (g) => { await page.evaluate((x) => window.__office.setGoal(x), g); await page.waitForTimeout(4500) }
  await setView({ az: 35, el: 48, r: 68, t: [-124, 0, 6] }); await screenshot(page, 'dr-cutaway-high')
  const scene = await collect(page)
  const names = new Set(scene.names)
  check(checks, 'dr-campus-built', scene.names.includes('vis2-shuttle') || scene.names.includes('vis2-rack-cell'), JSON.stringify(scene.campus?.modules ?? null))
  check(checks, 'dr-no-legacy-racks', !names.has('campus-racks-static') && !names.has('campus-shuttle-static') && !names.has('campus-shuttle-vehicle'))
  check(checks, 'dr-new-rack-colors', scene.colorCounts.newBlue > 0 && scene.colorCounts.orange > 0 && scene.colorCounts.oldBlue === 0, JSON.stringify(scene.colorCounts))
  check(checks, 'dr-labels-retained', names.has('campus-rack-labels'))
  check(checks, 'dr-film-dynamic', (() => { const f = scene.names.includes('vis2-rack-film'); return f })())
  const frames = await sampleFrames(page, 5000)
  const perf = { loadMs, frames, rendererInfo: scene.rendererInfo, gpu: scene.gpu, canvasCount: scene.canvasCount, vis3: scene.vis3 }
  // 设备/货架近景
  await setView({ az: 28, el: 26, r: 26, t: [-141, 1.6, -1] }); await screenshot(page, 'dr-rack-close')
  await setView({ az: 88, el: 10, r: 8, t: [-146, 0.35, -1] }); await screenshot(page, 'dr-shuttle-wheel')
  // 穿梭机运动 / 静止
  const z1 = await page.evaluate(() => window.__office.scene.getObjectByName('vis2-shuttle')?.position.z ?? 0)
  await page.waitForTimeout(2500)
  const z2 = await page.evaluate(() => window.__office.scene.getObjectByName('vis2-shuttle')?.position.z ?? 0)
  check(checks, 'dr-shuttle-moves-in-view', Math.abs(z1 - z2) > 1e-4, `z ${z1} → ${z2}`)
  const writes = requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length
  check(checks, 'dr-no-writes', writes === 0, `writes=${writes}`)
  await context.close()
  // 低画质 + campusMotion=0 + 重复进出
  const low = await openPage(browser, base, '/?campus=1&q=low', { netLog: path.join(OUT, 'logs/blocked-network.jsonl') })
  const lowScene = await collect(low.page)
  check(checks, 'dr-low-quality-built', Boolean(lowScene.names.includes('vis2-shuttle')), 'low 场景含 vis2-shuttle')
  await screenshot(low.page, 'dr-cutaway-low')
  await low.context.close()
  const still = await openPage(browser, base, '/?campus=1&campusMotion=0', { netLog: path.join(OUT, 'logs/blocked-network.jsonl') })
  await still.page.evaluate(() => window.__office.setGoal({ az: 35, el: 22, r: 22, t: [-146, 0.6, -1] })); await still.page.waitForTimeout(4000)
  const s1 = await still.page.evaluate(() => window.__office.scene.getObjectByName('vis2-shuttle')?.position.z ?? 0); await still.page.waitForTimeout(2200); const s2 = await still.page.evaluate(() => window.__office.scene.getObjectByName('vis2-shuttle')?.position.z ?? 0)
  check(checks, 'dr-motion-disabled', Math.abs(s1 - s2) < 1e-6, `campusMotion=0 z ${s1} → ${s2}`)
  await still.context.close()
  const life = []
  for (let i = 0; i < 8; i++) { const p = await openPage(browser, base, i % 2 ? '/?campus=1' : '/', { netLog: path.join(OUT, 'logs/blocked-network.jsonl') }); const c = await collect(p.page); const roots = await p.page.evaluate(() => { let n = 0; (window.__office?.scene).traverse((o) => { if (o.name === 'campus-root') n++ }); return n }); life.push({ round: i + 1, canvas: c.canvasCount, geom: c.rendererInfo?.geometries, tex: c.rendererInfo?.textures, roots }); await p.context.close() }
  check(checks, 'dr-lifecycle-no-duplicate-root', life.every((r) => r.roots <= 1), JSON.stringify(life.map((r) => r.roots)))
  check(checks, 'dr-lifecycle-canvas-stable', [...new Set(life.map((r) => r.canvas))].length <= 1, JSON.stringify([...new Set(life.map((r) => r.canvas))]))
  return { checks, perf, lifecycle: life, requests: requests.length }
}

// ---- Office 场景（办公室样板 preview + app layout2） ----
async function sceneOffice(browser, base) {
  const checks = []
  const { page, context } = await openPage(browser, base, '/office-vis2-preview.html', { netLog: path.join(OUT, 'logs/blocked-network.jsonl') })
  await page.waitForFunction(() => window.__vis2, null, { timeout: 45000 })
  await page.click('#enter').catch(() => {}); await page.waitForTimeout(1400)
  const snap = await page.evaluate(() => { const names = []; window.__vis2.scene.traverse((n) => { if (n.name) names.push(n.name) }); return { mode: window.__vis2.mode(), names, status: document.getElementById('status').textContent } })
  check(checks, 'office-sample-open', snap.mode === 'open', snap.status)
  check(checks, 'office-approved-logo', snap.names.includes('office-vis2-approved-logo-marks'))
  await page.click('[data-view="overview"]').catch(() => {}); await page.waitForTimeout(900); await screenshot(page, 'office-overview')
  await page.click('[data-view="reception"]').catch(() => {}); await page.waitForTimeout(900); await screenshot(page, 'office-reception')
  await page.click('[data-view="bar"]').catch(() => {}); await page.waitForTimeout(900); await screenshot(page, 'office-tea-bar')
  await context.close()
  // logo 降级
  const fb = await openPage(browser, base, '/office-vis2-preview.html', { abort: ['assets/logo.png'], netLog: path.join(OUT, 'logs/blocked-network.jsonl') })
  await fb.page.waitForFunction(() => window.__vis2, null, { timeout: 45000 }); await fb.page.click('#enter').catch(() => {}); await fb.page.waitForTimeout(1400)
  const fbSnap = await fb.page.evaluate(() => { const names = []; window.__vis2.scene.traverse((n) => { if (n.name) names.push(n.name) }); return { mode: window.__vis2.mode(), names, status: document.getElementById('status').textContent } })
  check(checks, 'office-logo-fallback', fbSnap.mode === 'open' && fbSnap.names.includes('office-vis2-brand-placeholder-slots'), JSON.stringify(fbSnap.names.filter((n) => n.includes('logo') || n.includes('placeholder'))))
  await fb.page.click('[data-view="overview"]').catch(() => {}); await fb.page.waitForTimeout(900); await screenshot(fb.page, 'office-overview-fallback')
  await fb.context.close()
  const perf = { loadMs: null, frames: await Promise.resolve({}), rendererInfo: snap.rendererInfo || null }
  return { checks, perf, office: snap }
}

// ---- Dashboard 场景（dr-console.html 桌面布局） ----
async function sceneDashboard(browser, base) {
  const checks = []
  const { page, context, requests, errors } = await openPage(browser, base, '/dr-console.html', { netLog: path.join(OUT, 'logs/blocked-network.jsonl') })
  await page.waitForTimeout(1200)
  const text = await page.evaluate(() => document.body.innerText)
  const has = (s) => text.includes(s)
  check(checks, 'dashboard-kpi', has('入库') || has('出库') || has('运单') || has('W1') || has('W2') || has('W3'), 'KPI/运单文本存在')
  check(checks, 'dashboard-demo-label', has('模拟') || has('演示') || has('示意'), '演示数据标注存在')
  check(checks, 'dashboard-no-errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
  await screenshot(page, 'dashboard-desktop')
  const perf = { loadMs: null, requests: requests.length, writes: requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length }
  check(checks, 'dashboard-no-writes', perf.writes === 0)
  await context.close()
  return { checks, perf, text: text.slice(0, 400) }
}

// ---- 主流程 ----
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
report.browser = browser.version()
const NETLOG = path.join(OUT, 'logs', 'blocked-network.jsonl'); fs.mkdirSync(path.dirname(NETLOG), { recursive: true }); fs.writeFileSync(NETLOG, '')
if (SCENES.includes('dr')) {
  const { base, mock, stop } = await bootIsolated({ repo: REPO, office: false, campus: true, outDir: OUT })
  report.scenes.dr = await sceneDr(browser, base)
  report.scenes.dr.mockWrites = mock.requests.filter((r) => r.method !== 'GET').length
  report.scenes.dr.mockTotal = mock.requests.length
  stop()
}
if (SCENES.includes('office')) {
  const { base, mock, stop } = await bootIsolated({ repo: REPO, office: true, campus: false, outDir: OUT })
  report.scenes.office = await sceneOffice(browser, base)
  report.scenes.office.mockWrites = mock.requests.filter((r) => r.method !== 'GET').length
  stop()
}
if (SCENES.includes('dashboard')) {
  const { base, mock, stop } = await bootIsolated({ repo: REPO, office: false, campus: false, outDir: OUT })
  report.scenes.dashboard = await sceneDashboard(browser, base)
  report.scenes.dashboard.mockWrites = mock.requests.filter((r) => r.method !== 'GET').length
  stop()
}
report.blockedNetwork = fs.existsSync(NETLOG) ? fs.readFileSync(NETLOG, 'utf8').trim().split('\n').filter(Boolean).length : 0
report.blockedBrowser = fs.existsSync(NETLOG) ? fs.readFileSync(NETLOG, 'utf8').split('\n').filter((l) => l.includes('blockedBrowser')).length : 0
for (const [name, scene] of Object.entries(report.scenes)) {
  scene.pass = (scene.checks || []).every((c) => c.ok)
  report[name + '_checks'] = scene.checks
}
writeJson('report.json', report)
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.scenes).map(([k, v]) => [k, { pass: v.pass, checks: v.checks }])), null, 2))
await browser.close()
