// VIS2-Q-R3：RC1 集成候选的隔离浏览器 QA（mock Paperclip、随机端口、阻断外网、真实 Chromium）。
// 只读产品代码；运行夹具写入为本 worktree 的运行数据（company-id/lan/wall/workhours/visual json），不修改已跟踪源码。
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const OFFICE = path.join(ROOT, 'office3d')
const OUT = path.resolve(process.env.VIS2_R3_OUT || path.join(ROOT, 'docs/dispatch/vis2/qa-r3-rc1'))
const PW = process.env.VIS2_PLAYWRIGHT || require.resolve('playwright')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true })
const writeJson = (name, value) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + '\n')
const SHA = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const BASE = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD^'], { encoding: 'utf8' }).trim()

// ---- 运行夹具 ----
fs.writeFileSync(path.join(ROOT, 'company-id.txt'), 'fixture-company-0001\n')
fs.mkdirSync(path.join(ROOT, 'workhours'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'workhours', 'workhours.json'), JSON.stringify({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 'Asia/Phnom_Penh' }))
fs.writeFileSync(path.join(OFFICE, 'lan.json'), JSON.stringify({ enabled: false, write: false, code: 'fixture-lan-code' }))
fs.writeFileSync(path.join(OFFICE, 'wall.json'), JSON.stringify({ enabled: false, token: 'fixture-wall-token-0001' }))
for (const f of ['acceptance.json', 'standup.json', 'committee.json', 'evidence-version.json', 'telegram.json', 'state-last-good.json']) { try { fs.rmSync(path.join(OFFICE, f), { force: true }) } catch {} }
const setFlags = (office, campus, { corrupt = false, missing = false } = {}) => {
  for (const [name, enabled] of [['office-visual.json', office], ['campus-visual.json', campus]]) {
    const file = path.join(OFFICE, name)
    if (missing) { try { fs.rmSync(file, { force: true }) } catch {} }
    else fs.writeFileSync(file, corrupt ? '{bad' : JSON.stringify({ enabled }))
  }
}

// ---- mock Paperclip ----
const mockRequests = []
const mock = http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    mockRequests.push({ at: new Date().toISOString(), method: req.method, url: req.url })
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (req.method !== 'GET') return res.end(JSON.stringify({ ok: true, id: 'mock-1' }))
    const p = String(req.url || '').split('?')[0]
    if (p.endsWith('/agents')) return res.end('[]')
    if (p.includes('/issues')) return res.end('[]')
    if (p.endsWith('/dashboard')) return res.end(JSON.stringify({ tasks: {}, costs: {}, pendingApprovals: 0 }))
    if (p.includes('approvals') || p.includes('heartbeat-runs') || p.includes('projects')) return res.end('[]')
    return res.end('[]')
  })
})
await new Promise((r) => mock.listen(0, '127.0.0.1', r))
const mockPort = mock.address().port
const netLog = path.join(OUT, 'logs/blocked-network.jsonl'); fs.writeFileSync(netLog, '')
const mockLog = path.join(OUT, 'logs/mock-requests.jsonl'); fs.writeFileSync(mockLog, '')

let browser
try { browser = await (await import('node:module')).createRequire(import.meta.url)(PW).chromium.launch({ headless: true, channel: 'chrome' }) }
catch { browser = await require(PW).chromium.launch({ headless: true }) }
const results = { sha: SHA, base: BASE, generatedAt: new Date().toISOString(), environment: { platform: process.platform, node: process.version, browser: browser.version(), viewport: '1280x720' }, variants: [], smoke: null, console: [], requests: [], mockWrites: 0 }

const startServer = async () => {
  const server = http.createServer // placeholder
  return null
}
const boot = async () => {
  const probe = net.createServer(); await new Promise((r) => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise((r) => probe.close(r))
  const log = fs.openSync(path.join(OUT, `logs/server-${Date.now()}.log`), 'w')
  const child = spawn(process.execPath, ['--import', path.join(HERE, 'block-network.mjs'), path.join(OFFICE, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PAPERCLIP_API_URL: `http://127.0.0.1:${mockPort}`, OFFICE3D_PORT: String(port), VIS2_NET_LOG: netLog, VIS2_ALLOWED_PORTS: `${mockPort},${port}`, NODE_OPTIONS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => fs.writeSync(log, d)); child.stderr.on('data', (d) => fs.writeSync(log, d))
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) }); if (r.ok) return { child, base } } catch {} await new Promise((r) => setTimeout(r, 300)) }
  child.kill('SIGKILL'); throw new Error('isolated server boot failed')
}
const newPage = async (context, pageErrors) => {
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push({ type: 'console', text: m.text().slice(0, 400) }) })
  page.on('pageerror', (e) => pageErrors.push({ type: 'pageerror', text: String(e.message).slice(0, 400) }))
  return page
}
const collectScene = (page) => page.evaluate(() => {
  const o = window.__office, names = [], batchGroups = [], colorCounts = { oldBlue: 0, newBlue: 0, orange: 0 }
  const target = { oldBlue: new (o.THREE.Color)(0x2d608b), newBlue: new (o.THREE.Color)(0x2f6fa8), orange: new (o.THREE.Color)(0xe8832a) }
  o.scene.traverse((node) => {
    if (node.name) names.push(node.name)
    if (node.userData?.batchGroup) batchGroups.push(node.userData.batchGroup)
    const colors = node.geometry?.getAttribute?.('color'); if (!colors) return
    for (let i = 0; i < colors.count; i++) {
      const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i)
      for (const [key, c] of Object.entries(target)) if (Math.abs(r - c.r) < .01 && Math.abs(g - c.g) < .01 && Math.abs(b - c.b) < .01) colorCounts[key]++
    }
  })
  const shuttle = o.scene.getObjectByName('vis2-shuttle')
  const film = o.scene.getObjectByName('vis2-rack-film')
  return {
    flags: o.visualFlags, campus: o.campus ? o.campus.summary() : null, officeV2: Boolean(o.officeV2),
    canvasCount: document.querySelectorAll('canvas').length,
    camera: { fov: o.camera.fov, position: o.camera.position.toArray().map((v) => +v.toFixed(2)) },
    quality: o.quality.metrics,
    renderer: { calls: o.renderer.info.render.calls, triangles: o.renderer.info.render.triangles, geometries: o.renderer.info.memory.geometries, textures: o.renderer.info.memory.textures, dpr: o.renderer.getPixelRatio() },
    names, batchGroups: [...new Set(batchGroups)], colorCounts,
    shuttle: shuttle ? { z: shuttle.position.z, lift: shuttle.getObjectByName('vis2-shuttle-platform')?.parent?.position.y ?? null } : null,
    film: film ? { opacity: film.material.opacity, dynamic: film.userData.dynamic } : null,
    roof: names.filter((n) => n === 'campus-roof-north' || n === 'campus-roof-south').length,
  }
})
const capture = async (page, file) => { await page.screenshot({ path: path.join(OUT, 'screenshots', file + '.png') }) }
const variantSpecs = [
  { id: 'missing', office: false, campus: false, missing: true },
  { id: 'corrupt', office: false, campus: false, corrupt: true },
  { id: 'both-false', office: false, campus: false },
  { id: 'office-only', office: true, campus: false },
  { id: 'campus-only', office: false, campus: true },
  { id: 'both-true', office: true, campus: true },
]
const openPage = async (base, url) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  const requests = [], errors = []
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.continue(); fs.appendFileSync(netLog, JSON.stringify({ blockedBrowser: u.origin + u.pathname }) + '\n'); return route.abort() })
  const page = await newPage(context, errors)
  page.on('request', (r) => { const u = new URL(r.url()); if (['127.0.0.1', 'localhost'].includes(u.hostname)) requests.push({ method: r.method(), path: u.pathname + u.search, type: r.resourceType() }) })
  await page.goto(base + url, { waitUntil: 'load', timeout: 45000 })
  await page.waitForFunction(() => Boolean(window.__office && window.__office.renderer), null, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1200)
  return { context, page, requests, errors }
}

for (const spec of variantSpecs) {
  setFlags(spec.office, spec.campus, spec)
  const { child, base } = await boot()
  const flagResponse = await fetch(base + '/visual-flags').then((r) => r.json()).catch((e) => ({ error: String(e) }))
  const row = { id: spec.id, flags: flagResponse, pages: {} }
  const urls = ['/', '/?campus=1']
  if (spec.office) urls.push('/?layout=2')
  for (const url of urls) {
    const { context, page, requests, errors } = await openPage(base, url)
    const scene = await collectScene(page)
    row.pages[url] = { scene, requests: requests.filter((r) => r.path.startsWith('/') && (r.path.endsWith('.js') || r.path === '/visual-flags') || r.path.startsWith('/state')).slice(0, 40), requestCount: requests.length, errors }
    await context.close()
  }
  child.kill('SIGTERM')
  results.variants.push(row)
}

// ---- 集成 smoke（both flags true，campus=1）----
setFlags(true, true)
{
  const { child, base } = await boot()
  const smoke = { pages: {}, shots: [], lifecycle: [], network: {}, checks: [] }
  const { context, page, requests, errors } = await openPage(base, '/?campus=1&q=high')
  const scene = await collectScene(page)
  smoke.pages.high = { scene, errors, requestCount: requests.length }
  const check = (id, ok, detail) => smoke.checks.push({ id, ok, detail })
  const names = new Set(scene.names)
  check('flags-on', scene.flags.officeV2 === true && scene.flags.campus === true, JSON.stringify(scene.flags))
  check('campus-registry-built', scene.campus?.modules?.includes('vis2Rack') && scene.campus.skipped.length === 0, JSON.stringify(scene.campus))
  check('no-legacy-racks', !names.has('campus-racks-static'), '旧 campus-racks-static 不存在')
  check('no-legacy-shuttle-static', !names.has('campus-shuttle-static'), '旧轨道不存在')
  check('no-legacy-shuttle-vehicle', !names.has('campus-shuttle-vehicle'), '旧车体不存在')
  check('new-cell-present', names.has('vis2-shuttle') && scene.colorCounts.newBlue > 0 && scene.colorCounts.orange > 0, JSON.stringify(scene.colorCounts))
  check('old-rack-color-absent', scene.colorCounts.oldBlue === 0, `oldBlue=${scene.colorCounts.oldBlue}`)
  check('labels-retained', names.has('campus-rack-labels'))
  check('film-dynamic', scene.film?.dynamic === true && scene.film?.opacity === 0.28)
  check('cutaway-default', scene.roof > 0, `roof meshes=${scene.roof}`)
  check('no-BB1-objects', !scene.names.some((n) => /vis2b-|dispatch-suite|office-vis2/.test(n)), 'RC1 不含 B/B1（门禁已标记阻断）')
  const setView = async (goal) => { await page.evaluate((g) => window.__office.setGoal(g), goal); await page.waitForTimeout(5000) }
  await setView({ az: 35, el: 48, r: 68, t: [-124, 0, 6] }); await capture(page, 'rc1-overview-high')
  await setView({ az: 35, el: 22, r: 22, t: [-146, 0.6, -1] }); await capture(page, 'rc1-eye-shuttle')
  await setView({ az: 28, el: 26, r: 26, t: [-141, 1.6, -1] }); await capture(page, 'rc1-rack-close')
  await setView({ az: 88, el: 10, r: 8, t: [-146, 0.35, -1] }); await capture(page, 'rc1-wheel-close')
  // 保持穿梭机视野，采样默认运动（registry 的 onFrame 只在视锥内推进动画）
  let z1 = (await collectScene(page)).shuttle?.z
  await page.waitForTimeout(2600)
  let z2 = (await collectScene(page)).shuttle?.z
  check('shuttle-moves-default', Math.abs((z1 ?? 0) - (z2 ?? 0)) > 1e-4, `z ${z1} → ${z2}`)
  smoke.shuttleMotion = { z1, z2 }
  smoke.cameraTrace = await page.evaluate(() => ({ camera: window.__office.camera.position.toArray().map((v) => +v.toFixed(2)), goal: { az: window.__office.goal.az, el: window.__office.goal.el, r: window.__office.goal.r, t: [window.__office.goal.t.x, window.__office.goal.t.z] } }))
  await context.close()
  // 低画质
  const low = await openPage(base, '/?campus=1&q=low')
  const lowScene = await collectScene(low.page)
  smoke.pages.low = { scene: lowScene, errors: low.errors }
  check('low-quality-built', lowScene.quality && lowScene.campus?.modules?.includes('vis2Rack'), JSON.stringify(lowScene.campus))
  await capture(low.page, 'rc1-overview-low')
  await low.context.close()
  // campusMotion=0
  const still = await openPage(base, '/?campus=1&campusMotion=0')
  await still.page.evaluate(() => window.__office.setGoal({ az: 35, el: 22, r: 22, t: [-146, 0.6, -1] }))
  await still.page.waitForTimeout(3800)
  const s1 = (await collectScene(still.page)).shuttle?.z; await still.page.waitForTimeout(2600); const s2 = (await collectScene(still.page)).shuttle?.z
  check('motion-disabled', Math.abs((s1 ?? 0) - (s2 ?? 0)) < 1e-6, `campusMotion=0 z ${s1} → ${s2}`)
  await still.context.close()
  // 网络：6 秒内 GET/轮询；无写请求
  const net = await openPage(base, '/?campus=1')
  const before = net.requests.length
  await net.page.waitForTimeout(6000)
  const during = net.requests.slice(before)
  smoke.network = { total: net.requests.length, during: during.length, state: during.filter((r) => r.path.startsWith('/state')).length, writes: net.requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length, flags: net.requests.filter((r) => r.path === '/visual-flags').length }
  check('no-page-writes', smoke.network.writes === 0)
  check('flags-fetched-once-ish', smoke.network.flags >= 1)
  await net.context.close()
  // 生命周期：10 次重新加载 + 进入/退出
  for (let i = 0; i < 10; i++) {
    const round = await openPage(base, i % 2 ? '/?campus=1' : '/')
    const snap = await collectScene(round.page)
    const roots = round.page.evaluate ? await round.page.evaluate(() => { let n = 0; window.__office.scene.traverse((o) => { if (o.name === 'campus-root') n++ }); return n }) : 0
    smoke.lifecycle.push({ round: i + 1, url: i % 2 ? 'campus' : 'office', canvas: snap.canvasCount, geometries: snap.renderer.geometries, textures: snap.renderer.textures, roots, campusRoots: roots, calls: snap.renderer.calls })
    await round.context.close()
  }
  check('lifecycle-no-duplicate-root', smoke.lifecycle.every((r) => r.roots <= 1), JSON.stringify(smoke.lifecycle.map((r) => r.roots)))
  child.kill('SIGTERM')
  smoke.console = errors
  results.smoke = smoke
}

results.mockWrites = mockRequests.filter((r) => r.method !== 'GET').length
results.mockTotal = mockRequests.length
results.checks = [...(results.smoke?.checks || [])]
results.pass = results.checks.every((c) => c.ok)
writeJson('run.json', results)
fs.writeFileSync(path.join(OUT, 'report-data.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify({ sha: SHA, variants: results.variants.map((v) => ({ id: v.id, flags: v.flags, campusPage: v.pages['/?campus=1']?.scene?.campus ? v.pages['/?campus=1'].scene.campus.modules : null, officeV2: v.pages['/']?.scene?.officeV2 })), checks: results.checks, smoke: results.smoke ? { pages: Object.keys(results.smoke.pages), lifecycle: results.smoke.lifecycle, network: results.smoke.network, console: results.smoke.console } : null, mockWrites: results.mockWrites }, null, 2))
await browser.close(); mock.close()
