// VIS3-TEST-001-FIX1：修复 T-01..T-12 的浏览器测试执行器。
// 退出码：0 全部强制检查通过；1 任一强制检查失败；2 基础设施错误或强制检查未执行。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { bootIsolated, InfraError } from './fixture.mjs'
import { compareRepoClean } from './tree-check.mjs'
import { INSTRUMENT } from './instrument.mjs'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const parse = () => { const o = {}; for (let i = 2; i < process.argv.length; i++) { if (process.argv[i].startsWith('--')) { const k = process.argv[i]; if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) o[k.slice(2)] = process.argv[i + 1], i++ ; else o[k.slice(2)] = true } } return o }
const A = parse()
const REPO = A.repo ? path.resolve(A.repo) : process.cwd()
const SCENES = String(A.scene || 'office,dashboard').split(',').map((s) => s.trim())
const TMPDIR = fs.realpathSync(os.tmpdir())
const TMP_ROOTS = [TMPDIR].concat((process.platform !== 'win32' && fs.existsSync('/tmp')) ? [fs.realpathSync('/tmp')] : [])
let OUT
try {
  const rawOut = A.out ? path.resolve(A.out) : path.join(TMPDIR, `vis3-out-${process.pid}`)
  OUT = path.join(fs.realpathSync(path.dirname(rawOut)), path.basename(rawOut))
} catch (e) { console.error('INFRA_ERROR: --out 路径不可用（父目录不存在或不可解析）：' + (e?.message || e)); process.exit(2) }
if (!TMP_ROOTS.some((d) => OUT === d || OUT.startsWith(d + path.sep))) { console.error('INFRA_ERROR: --out 必须位于系统临时目录内：' + OUT); process.exit(2) }
if (OUT.startsWith(REPO + path.sep)) { console.error('INFRA_ERROR: --out 不得位于被测仓库内：' + OUT); process.exit(2) }
if (fs.existsSync(OUT)) { if (fs.statSync(OUT).isFile()) { console.error('INFRA_ERROR: --out 是文件，拒绝：' + OUT); process.exit(2) } if (fs.readdirSync(OUT).length > 0) { console.error('INFRA_ERROR: --out 目录已存在且非空，拒绝覆盖：' + OUT); process.exit(2) } }
const MIN_FREE_MB = Number(process.env.VIS3_MIN_FREE_MB || 3000)
if (os.freemem() < MIN_FREE_MB * 1024 * 1024) { const freeMB = Math.round(os.freemem() / 1048576); console.error('INFRA_ERROR: 空闲内存不足 ' + MIN_FREE_MB + 'MB（' + freeMB + 'MB），NOT_RUN'); try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ status: 'NOT_RUN', reason: '空闲内存不足', freeMB, thresholdMB: MIN_FREE_MB }) + '\n') } catch {} ; process.exit(2) }
const WATCHDOG_MS = Number(process.env.VIS3_WATCHDOG_MS || (30 * 60 * 1000))
const watchdog = setTimeout(() => { console.error('INFRA_ERROR: 看门狗超时，结束全部子进程'); process.exit(2) }, WATCHDOG_MS)
watchdog.unref?.()
const DPR = Number(A.dpr || 1)
const VIEWPORT = String(A.viewport || '1280x720').split('x').map(Number)
let PW
try { PW = A.playwright || process.env.VIS3_PLAYWRIGHT || require.resolve('playwright') } catch (e) { console.error('INFRA_ERROR: playwright 不可用（VIS3_PLAYWRIGHT 或 --playwright 需指向可加载的 playwright）：' + (e?.message || e)); process.exit(2) }
const NETLOG = path.join(OUT, 'logs', 'blocked-network.jsonl')
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true }); fs.writeFileSync(NETLOG, '')
let SHA, repoCleanBefore
try { SHA = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); repoCleanBefore = execFileSync('git', ['-C', REPO, 'status', '--porcelain'], { encoding: 'utf8' }).trim() }
catch (e) { console.error('INFRA_ERROR: 无法读取被测仓库（非 git 或不可访问）：' + (e?.message || e)); process.exit(2) }
if (repoCleanBefore) { console.error('INFRA_ERROR: --repo 工作树不干净，拒绝运行：\n' + repoCleanBefore); process.exit(2) }
const PROTECTED_RE = /(lan\.json|wall\.json|telegram[^/]*\.json|telegram[^/]*\.dpapi|[^/]*\.dpapi|\.env[^/]*|[^/]*ed25519[^/]*|office3d\/config\.json)$/i
const WARN_ONLY_RE = /niuma\.config\.json$/i
let ignoredProtected = '', warnOnlyProtected = ''
try {
  const ignored = execFileSync('git', ['-C', REPO, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory'], { encoding: 'utf8' }).split('\n')
  ignoredProtected = ignored.filter((f) => f && !f.includes('node_modules/') && PROTECTED_RE.test(f)).join('\n')
  warnOnlyProtected = ignored.filter((f) => f && !f.includes('node_modules/') && WARN_ONLY_RE.test(f)).join('\n')
} catch {}
if (ignoredProtected) { console.error('INFRA_ERROR: 存在被忽略的受保护文件，拒绝运行（仅列名，不读内容）：\n' + ignoredProtected); process.exit(2) }
if (warnOnlyProtected) { console.error('WARN: niuma.config.json 董事会尚未裁决，本次仅列名警告、不拒绝：\n' + warnOnlyProtected) }
const report = { sha: SHA, generatedAt: new Date().toISOString(), env: { platform: process.platform, node: process.version, dpr: DPR, viewport: VIEWPORT.join('x') }, mutate: A.mutate || null, scenes: {}, exit: null }
const M = { pass: 0, fail: 0, total: 0 }
const addCheck = (list, id, ok, detail, mandatory = true) => { list.push({ id, ok, detail: String(detail ?? '').slice(0, 400), mandatory }); if (mandatory) { M.total++; ok ? M.pass++ : M.fail++ } }
const json = (n, v) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(v, null, 2) + '\n')
const isSoftwareRenderer = (gpu) => gpu && /swiftshader|llvmpipe|software|mesa offline/i.test(gpu.renderer || '')

const collect = (page) => page.evaluate(() => {
  const o = window.__office || window.__vis2 || {}
  const renderer = o.renderer
  const root = o.scene || o.root || null
  const names = [], colorCounts = { oldBlue: 0, newBlue: 0, orange: 0 }
  const targets = o.THREE ? { oldBlue: new (o.THREE.Color)(0x2d608b), newBlue: new (o.THREE.Color)(0x2f6fa8), orange: new (o.THREE.Color)(0xe8832a) } : null
  if (root) root.traverse((n) => { if (n.name) names.push(n.name); if (!targets) return; const c = n.geometry?.getAttribute?.('color'); if (!c) return; for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); for (const [k, t] of Object.entries(targets)) if (Math.abs(r - t.r) < .01 && Math.abs(g - t.g) < .01 && Math.abs(b - t.b) < .01) colorCounts[k]++ } })
  const gl = renderer?.getContext?.(); const dbg = gl?.getExtension?.('WEBGL_debug_renderer_info')
  return {
    ready: Boolean(renderer), names, colorCounts,
    flags: window.__office?.visualFlags ?? null,
    officeV2: Boolean(window.__office?.officeV2),
    campus: window.__office?.campus ? window.__office.campus.summary() : null,
    rendererInfo: renderer ? { calls: renderer.info?.render?.calls, triangles: renderer.info?.render?.triangles, geometries: renderer.info?.memory?.geometries, textures: renderer.info?.memory?.textures, dpr: renderer.getPixelRatio?.() } : null,
    gpu: dbg && gl ? { vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) } : null,
    vis3: window.__vis3 || null,
  }
})
const sampleFrames = (page, ms = 5000) => page.evaluate((d) => new Promise((r) => { const a = []; let s = performance.now(), p = s; function f(t) { a.push(t - p); p = t; if (t - s < d) requestAnimationFrame(f); else r(a) } requestAnimationFrame(f) }), ms).then((a) => { const s = [...a].sort((x, y) => x - y); const q = (n) => s.length ? +s[Math.min(s.length - 1, Math.floor(n / 100 * s.length))].toFixed(2) : null; return { samples: s.length, p50: q(50), p95: q(95), max: s.length ? +s[s.length - 1].toFixed(2) : null } })
const navLoadMs = (page) => page.evaluate(() => { const e = performance.getEntriesByType('navigation')[0]; return e ? +(e.loadEventEnd - e.fetchStart).toFixed(1) : null })
const shot = (page, f) => page.screenshot({ path: path.join(OUT, 'screenshots', f + '.png') })

const MUTATIONS = {
  'dup-loop': `setInterval(() => requestAnimationFrame(() => {}), 0)`,
  'runtime-error': `setTimeout(() => { throw new Error('VIS3_MUT_RUNTIME') }, 400)`,
  'unauthorized-port': `setTimeout(() => fetch('http://127.0.0.1:' + globalThis.__VIS3_PROBE_PORT + '/probe', { method: 'POST', body: 'x' }).catch(() => {}), 300)`,
}
async function openPage(browser, base, url, opts = {}) {
  const allowOrigins = new Set([`http://127.0.0.1:${base.split(':')[2]}`, `http://localhost:${base.split(':')[2]}`])
  const context = await browser.newContext({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] }, deviceScaleFactor: DPR, serviceWorkers: 'block' })
  const requests = [], errors = [], blocked = []
  context.on('websocket', (ws) => { try { const u = new URL(ws.url()); if (!allowOrigins.has(u.origin)) { blocked.push({ blocked: u.origin + u.pathname, rule: 'websocket' }); ws.close() } } catch {} })
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url())
    const local = ['127.0.0.1', 'localhost'].includes(u.hostname)
    const allowed = local && allowOrigins.has(u.origin)
    if (opts.abort && opts.abort.some((a) => u.pathname.includes(a))) { blocked.push({ blocked: u.origin + u.pathname, rule: 'abort-pattern' }); return route.abort() }
    if (!allowed) { blocked.push({ blocked: u.origin + u.pathname, rule: local ? 'unrelated-local-port' : 'external' }); fs.appendFileSync(NETLOG, JSON.stringify({ blockedBrowser: u.origin + u.pathname }) + '\n'); return route.abort() }
    if (route.request().method() !== 'GET' && route.request().method() !== 'HEAD') { blocked.push({ blocked: u.origin + u.pathname, rule: 'non-get' }); return route.abort() }
    return route.continue()
  })
  const page = await context.newPage()
  await page.addInitScript(INSTRUMENT)
  if (A.mutate && MUTATIONS[A.mutate]) { if (A.mutate === 'unauthorized-port') await page.addInitScript(`globalThis.__VIS3_PROBE_PORT = ${JSON.stringify(process.env.VIS3_PROBE_PORT)}`); await page.addInitScript(MUTATIONS[A.mutate]) }
  page.on('pageerror', (e) => errors.push({ type: 'pageerror', text: String(e.message).slice(0, 300) }))
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ type: 'console', text: m.text().slice(0, 300) }) })
  page.on('request', (r) => { const u = new URL(r.url()); if (['127.0.0.1', 'localhost'].includes(u.hostname)) requests.push({ method: r.method(), path: u.pathname + u.search }) })
  const started = Date.now()
  await page.goto(base + url, { waitUntil: 'load', timeout: 45000 })
  return { context, page, requests, errors, blocked, started }
}

async function waitReady(page, fn, ms = 45000) { await page.waitForFunction(fn, null, { timeout: ms }).catch(() => {}) ; return await page.evaluate(fn) }

// ---- DR 场景 ----
async function sceneDr(browser, base) {
  const checks = []
  const { page, context, requests, errors, blocked } = await openPage(browser, base, '/?campus=1&q=high')
  const ready = await waitReady(page, () => Boolean(window.__office?.campus?.summary?.() && window.__office?.renderer))
  addCheck(checks, 'dr-ready', Boolean(ready), 'campus registry + renderer 就绪', true)
  addCheck(checks, 'dr-no-runtime-errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)), true)
  const loadMs = await navLoadMs(page)
  const scene = await collect(page)
  const names = new Set(scene.names)
  const software = isSoftwareRenderer(scene.gpu)
  addCheck(checks, 'dr-no-legacy', !names.has('campus-racks-static') && !names.has('campus-shuttle-static') && !names.has('campus-shuttle-vehicle'), '无重复旧货架/轨道/车体', true)
  addCheck(checks, 'dr-new-cell', scene.colorCounts.newBlue > 0 && scene.colorCounts.orange > 0 && scene.colorCounts.oldBlue === 0, JSON.stringify(scene.colorCounts), true)
  addCheck(checks, 'dr-labels-retained', names.has('campus-rack-labels'), '', true)
  const film = await page.evaluate(() => { const m = window.__office.scene.getObjectByName('vis2-rack-film'); return m ? { opacity: m.material.opacity, dynamic: m.userData.dynamic } : null })
  addCheck(checks, 'dr-film-properties', film?.dynamic === true && Math.abs(film.opacity - 0.28) < 1e-3, JSON.stringify(film), true)
  const shuttle = await page.evaluate(() => { const s = window.__office.scene.getObjectByName('vis2-shuttle'); const p = s?.getObjectByName('vis2-shuttle-platform'); return s ? { z: s.position.z, liftGroupY: p?.parent?.position.y, dynamic: s.userData.dynamic } : null })
  addCheck(checks, 'dr-shuttle-properties', Boolean(shuttle?.dynamic), JSON.stringify(shuttle), true)
  const frames = await sampleFrames(page, 5000)
  const r0 = await page.evaluate(() => window.__vis3.raf); await page.waitForTimeout(1000); const r1 = await page.evaluate(() => window.__vis3.raf)
  addCheck(checks, 'dr-no-duplicate-loop', (r1 - r0) < 100, `raf Δ=${r1 - r0}/s`, true)
  const perf = { loadMs, frames, rendererInfo: scene.rendererInfo, gpu: scene.gpu, softwareRenderer: software, seed: 4207, motion: 'campusMotion 默认（墙钟采样，仅观察）' }
  addCheck(checks, 'dr-no-page-writes', requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length === 0, '0 写请求', true)
  addCheck(checks, 'dr-network-allowlist', blocked.length === 0, JSON.stringify(blocked.slice(0, 5)), true)
  await page.evaluate(() => window.__office.setGoal({ az: 35, el: 48, r: 68, t: [-124, 0, 6] })); await page.waitForTimeout(4500); await shot(page, 'dr-cutaway-high')
  await context.close()
  // 确定性静止（campusMotion=0）
  const still = await openPage(browser, base, '/?campus=1&campusMotion=0')
  await waitReady(still.page, () => Boolean(window.__office?.renderer))
  await still.page.evaluate(() => window.__office.setGoal({ az: 35, el: 22, r: 22, t: [-146, 0.6, -1] })); await still.page.waitForTimeout(4000)
  const s1 = await still.page.evaluate(() => window.__office.scene.getObjectByName('vis2-shuttle')?.position.z ?? 0); await still.page.waitForTimeout(1500); const s2 = await still.page.evaluate(() => window.__office.scene.getObjectByName('vis2-shuttle')?.position.z ?? 0)
  addCheck(checks, 'dr-motion-disabled-deterministic', Math.abs(s1 - s2) < 1e-9, `campusMotion=0 静止 z=${s1}`, true)
  await still.context.close()
  // 生命周期：同一页面内导航（page.goto 复用同一 page 对象，非新建 context）
  const lf = await openPage(browser, base, '/')
  await waitReady(lf.page, () => Boolean(window.__office?.renderer))
  const rootsSeq = [], canvasSeq = []
  for (let i = 0; i < 6; i++) { await lf.page.goto(base + (i % 2 ? '/?campus=1' : '/'), { waitUntil: 'load', timeout: 45000 }); await waitReady(lf.page, () => Boolean(window.__office?.renderer)); await lf.page.waitForTimeout(400); const c = await collect(lf.page); const roots = await lf.page.evaluate(() => { let n = 0; window.__office?.scene.traverse((o) => { if (o.name === 'campus-root') n++ }); return n }); rootsSeq.push(roots); canvasSeq.push(c.rendererInfo ? 1 : 0) }
  addCheck(checks, 'dr-lifecycle-same-page', rootsSeq.every((r) => r <= 1), JSON.stringify(rootsSeq), true)
  // 页面可见性：冻结生命周期状态后 RAF 不再注册
  try {
    const cdp = await lf.page.context().newCDPSession(lf.page)
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
    const fr0 = await lf.page.evaluate(() => window.__vis3.raf)
    await lf.page.waitForTimeout(800)
    const fr1 = await lf.page.evaluate(() => window.__vis3.raf)
    await cdp.send('Page.setWebLifecycleState', { state: 'active' })
    addCheck(checks, 'dr-visibility-freeze-no-raf', (fr1 - fr0) < 15, `frozen raf Δ=${fr1 - fr0}`, true)
  } catch (e) { addCheck(checks, 'dr-visibility-freeze-no-raf', false, 'CDP Page.setWebLifecycleState 不可用', true) }
  await lf.context.close()
  return { checks, perf, requests: requests.length, blocked }
}

// ---- Office 场景（同一页面 enter/exit 真实生命周期） ----
async function sceneOffice(browser, base) {
  const checks = []
  const { page, context, errors, blocked } = await openPage(browser, base, '/office-vis2-preview.html')
  const ready = await waitReady(page, () => Boolean(window.__vis2?.renderer))
  addCheck(checks, 'office-ready', Boolean(ready), 'office preview renderer 就绪', true)
  addCheck(checks, 'office-no-runtime-errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)), true)
  const loadMs = await navLoadMs(page)
  await page.click('#enter').catch(() => {}); await page.waitForTimeout(1200)
  const snap = await page.evaluate(() => { const names = []; window.__vis2.scene.traverse((n) => { if (n.name) names.push(n.name) }); return { mode: window.__vis2.mode(), names } })
  addCheck(checks, 'office-open', snap.mode === 'open', '样板开启', true)
  addCheck(checks, 'office-logo', snap.names.includes('office-vis2-approved-logo-marks'), '', true)
  const frames = await sampleFrames(page, 3000)
  const r0 = await page.evaluate(() => window.__vis3.raf); await page.waitForTimeout(1000); const r1 = await page.evaluate(() => window.__vis3.raf)
  addCheck(checks, 'office-no-duplicate-loop', (r1 - r0) < 100, `raf Δ=${r1 - r0}/s`, true)
  const scene = await collect(page)
  addCheck(checks, 'office-no-runtime-errors-2', errors.length === 0, JSON.stringify(errors.slice(0, 3)), true)
  const perf = { loadMs, frames, rendererInfo: scene.rendererInfo, gpu: scene.gpu, softwareRenderer: isSoftwareRenderer(scene.gpu) }
  await page.click('[data-view="overview"]').catch(() => {}); await page.waitForTimeout(800); await shot(page, 'office-overview')
  await page.click('[data-view="reception"]').catch(() => {}); await page.waitForTimeout(800); await shot(page, 'office-reception')
  await page.click('[data-view="bar"]').catch(() => {}); await page.waitForTimeout(800); await shot(page, 'office-tea-bar')
  // 同一页面 enter/exit 10 轮
  const life = []
  for (let i = 0; i < 10; i++) { await page.click('#exit').catch(() => {}); await page.waitForTimeout(200); await page.click('#enter').catch(() => {}); await page.waitForTimeout(200); life.push(await page.evaluate(() => window.__vis2.mode())) }
  addCheck(checks, 'office-lifecycle-enter-exit', life.every((m) => m === 'open'), JSON.stringify(life.slice(0, 5)), true)
  await context.close()
  // logo 降级（独立页）
  const fb = await openPage(browser, base, '/office-vis2-preview.html', { abort: ['assets/logo.png'] })
  await waitReady(fb.page, () => Boolean(window.__vis2?.renderer)); await fb.page.click('#enter').catch(() => {}); await fb.page.waitForTimeout(1200)
  const fbSnap = await fb.page.evaluate(() => { const names = []; window.__vis2.scene.traverse((n) => { if (n.name) names.push(n.name) }); return { mode: window.__vis2.mode(), names } })
  addCheck(checks, 'office-logo-fallback', fbSnap.mode === 'open' && fbSnap.names.includes('office-vis2-brand-placeholder-slots'), '', true)
  addCheck(checks, 'office-blocked-zero', [...blocked, ...fb.blocked].filter((b) => b.rule !== 'abort-pattern').length === 0, JSON.stringify([...blocked, ...fb.blocked].filter((b) => b.rule !== 'abort-pattern').slice(0, 5)), true)
  await shot(fb.page, 'office-overview-fallback'); await fb.context.close()
  return { checks, perf }
}

async function sceneDashboard(browser, base) {
  const checks = []
  const { page, context, requests, errors } = await openPage(browser, base, '/dr-console.html', { noApp: true, netLog: NETLOG })
  const ready = await waitReady(page, () => Boolean(document.body && document.body.innerText.length > 0))
  addCheck(checks, 'dashboard-ready', Boolean(ready), '看板文本就绪', true)
  addCheck(checks, 'dashboard-no-runtime-errors', errors.length === 0, JSON.stringify(errors.slice(0, 3)), true)
  const text = await page.evaluate(() => document.body.innerText)
  addCheck(checks, 'dashboard-kpi', /入库|出库|运单|W1|W2|W3/.test(text), '', true)
  addCheck(checks, 'dashboard-demo-label', /模拟|演示|示意/.test(text), '', true)
  addCheck(checks, 'dashboard-no-writes', requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length === 0, '0 写', true)
  const loadMs = await navLoadMs(page)
  await shot(page, 'dashboard-desktop')
  await context.close()
  return { checks, perf: { loadMs, requests: requests.length } }
}

let browser
try {
  const pw = require(PW)
  browser = await pw.chromium.launch({ headless: true, channel: 'chrome', args: ['--js-flags=--max-old-space-size=1024'] }).catch(() => pw.chromium.launch({ headless: true, args: ['--js-flags=--max-old-space-size=1024'] }))
} catch (e) { console.error('INFRA_ERROR: 浏览器/playwright 启动失败（--playwright / VIS3_PLAYWRIGHT 需指向可加载的 playwright）：' + (e?.message || e)); process.exit(2) }
report.browser = await browser.version()
try {
// ---- T-10 功能开关矩阵（针对带 /visual-flags 桥的集成分支，如 RC1） ----
async function sceneFlags(browser, repo) {
  const checks = []
  const variants = [
    { id: 'missing', office: false, campus: false, missing: true },
    { id: 'corrupt', office: false, campus: false, corrupt: true },
    { id: 'both-false', office: false, campus: false },
    { id: 'office-only', office: true, campus: false },
    { id: 'campus-only', office: false, campus: true },
    { id: 'both-true', office: true, campus: true },
  ]
  const matrix = []
  for (const v of variants) {
    const { base, mock, stop } = await bootIsolated({ repo, office: v.office, campus: v.campus, missing: v.missing, corrupt: v.corrupt, outDir: OUT })
    const flag = await fetch(base + '/visual-flags').then((r) => r.json()).catch(() => null)
    const writes = []
    // 每个页面用完即关（串行，不同时打开）
    const root = await openPage(browser, base, '/', { netLog: NETLOG })
    await root.page.waitForFunction(() => window.__office?.visualFlags, null, { timeout: 15000 }).catch(() => {})
    const rootScene = await collect(root.page)
    writes.push(...root.requests)
    await root.context.close()
    const campus = await openPage(browser, base, '/?campus=1', { netLog: NETLOG })
    await campus.page.waitForFunction(() => window.__office?.visualFlags, null, { timeout: 15000 }).catch(() => {})
    const campusScene = await collect(campus.page)
    writes.push(...campus.requests)
    await campus.context.close()
    const layout2 = await openPage(browser, base, '/?layout=2', { netLog: NETLOG })
    await layout2.page.waitForFunction(() => window.__office?.visualFlags, null, { timeout: 15000 }).catch(() => {})
    const layout2Scene = await collect(layout2.page)
    writes.push(...layout2.requests)
    await layout2.context.close()
    const writeCount = writes.filter((r) => r.method !== 'GET' && r.method !== 'HEAD').length
    matrix.push({ id: v.id, flag, root: { flags: rootScene.flags, officeV2: rootScene.officeV2, campus: rootScene.campus }, campus: { flags: campusScene.flags, campus: campusScene.campus }, layout2: { officeV2: layout2Scene.officeV2 }, writes: writeCount })
    await stop()
  }
  let ok = true
  for (const row of matrix) {
    const v = variants.find((x) => x.id === row.id)
    const expOffice = v.office && !v.missing && !v.corrupt
    const expCampus = v.campus && !v.missing && !v.corrupt
    const flagOk = row.flag && row.flag.officeV2 === expOffice && row.flag.campus === expCampus
    const campusOk = Boolean(row.campus.campus) === expCampus
    const officeOk = row.layout2.officeV2 === expOffice
    if (!flagOk || !campusOk || !officeOk || row.writes !== 0) { ok = false; break }
  }
  addCheck(checks, 'flags-fail-closed-matrix', ok, JSON.stringify(matrix.map((r) => ({ id: r.id, flag: r.flag, campus: Boolean(r.campus.campus), layout2officeV2: r.layout2.officeV2, writes: r.writes }))), true)
  addCheck(checks, 'flags-disabled-baseline', Boolean(matrix.find((r) => r.id === 'missing')?.campus.campus) === false && Boolean(matrix.find((r) => r.id === 'both-false')?.campus.campus) === false, '缺失/关闭时 campus 关闭', true)
  addCheck(checks, 'flags-no-writes', matrix.every((r) => r.writes === 0), '0 写请求', true)
  return { checks, matrix }
}

  for (const sceneName of SCENES) {
    if (sceneName === 'dr') { let boot; try { boot = await bootIsolated({ repo: REPO, office: false, campus: true, outDir: OUT }); report.scenes.dr = await sceneDr(browser, boot.base); report.scenes.dr.mockWrites = boot.mock.requests.filter((r) => r.method !== 'GET').length; report.scenes.dr.cleanupErrors = boot.cleanupErrors } finally { await boot?.stop() } }
    if (sceneName === 'office') { let boot; try { boot = await bootIsolated({ repo: REPO, office: true, campus: false, outDir: OUT }); report.scenes.office = await sceneOffice(browser, boot.base); report.scenes.office.mockWrites = boot.mock.requests.filter((r) => r.method !== 'GET').length; report.scenes.office.cleanupErrors = boot.cleanupErrors } finally { await boot?.stop() } }
    if (sceneName === 'dashboard') { let boot; try { boot = await bootIsolated({ repo: REPO, office: false, campus: false, outDir: OUT }); report.scenes.dashboard = await sceneDashboard(browser, boot.base); report.scenes.dashboard.mockWrites = boot.mock.requests.filter((r) => r.method !== 'GET').length; report.scenes.dashboard.cleanupErrors = boot.cleanupErrors } finally { await boot?.stop() } }
    if (sceneName === 'flags') { report.scenes.flags = await sceneFlags(browser, REPO) }
  }
} catch (error) {
  if (error instanceof InfraError) { console.error('INFRA_ERROR ' + error.message); process.exitCode = 2 } else { console.error('RUN_ERROR ' + (error?.stack || error)); process.exitCode = 2 }
}
// P-08：所有场景强制 mockWrites===0
for (const [name, sc] of Object.entries(report.scenes)) {
  if (name === 'flags') continue
  if (sc && typeof sc.mockWrites === 'number' && sc.mockWrites !== 0) { M.total++; M.fail++; (sc.checks || (sc.checks = [])).push({ id: name + '-mock-writes-zero', ok: false, detail: 'mockWrites=' + sc.mockWrites, mandatory: true }) }
}
report.blockedNetwork = fs.existsSync(NETLOG) ? fs.readFileSync(NETLOG, 'utf8').trim().split('\n').filter(Boolean).length : 0
report.mandatory = { pass: M.pass, fail: M.fail, total: M.total }
report.filesystemIsolation = compareRepoClean(REPO, repoCleanBefore)
for (const [name, scene] of Object.entries(report.scenes)) scene.pass = (scene.checks || []).filter((c) => c.mandatory).every((c) => c.ok)
report.exit = (process.exitCode && process.exitCode !== 0) ? process.exitCode : (M.fail > 0 ? 1 : (M.total === 0 || SCENES.some((s) => !report.scenes[s]) ? 2 : 0))
json('report.json', report)
console.log(JSON.stringify({ sha: SHA.slice(0, 12), exit: report.exit, mandatory: report.mandatory, filesystemIsolation: report.filesystemIsolation, scenes: Object.fromEntries(Object.entries(report.scenes).map(([k, v]) => [k, { pass: v.pass, checks: v.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.id}`) }])) }, null, 2))
await browser.close()
process.exit(report.exit)
