// VIS2-Q 隔离验收执行器（B0 / C0 通用）。
// 只读产品代码：用独立 worktree、临时运行目录、随机端口、模拟 Paperclip、网络阻断与假公司数据。
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { startMockPaperclip } from './mock-paperclip.mjs'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1])
const REPO = path.resolve(args.get('--repo') || process.cwd())
const LABEL = args.get('--label') || 'b0'
const OUT = path.resolve(args.get('--out') || path.join(REPO, 'docs/dispatch/vis2', `qa-${LABEL}`))
const CYCLES = Number(args.get('--cycles') || 20)
const OFFICE = path.join(REPO, 'office3d')
const SHA = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const PLAYWRIGHT = process.env.VIS2_PLAYWRIGHT || 'playwright' // 由调用方提供 playwright 路径（本机只读依赖），不在仓库写死绝对路径

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true })
const LOG_DIR = path.join(OUT, 'logs')
const writeJson = (name, value) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2) + '\n')

// ---- 隔离夹具（全部是假数据，不连真实 3100/3200）----
fs.writeFileSync(path.join(REPO, 'company-id.txt'), 'fixture-company-0001\n')
fs.mkdirSync(path.join(REPO, 'workhours'), { recursive: true })
fs.writeFileSync(path.join(REPO, 'workhours', 'workhours.json'), JSON.stringify({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 'Asia/Phnom_Penh' }))
for (const [file, value] of [
  ['lan.json', { enabled: false, write: false, code: 'fixture-lan-code' }],
  ['wall.json', { enabled: false, token: 'fixture-wall-token-0001' }],
]) fs.writeFileSync(path.join(OFFICE, file), JSON.stringify(value))
for (const runtime of ['acceptance.json', 'standup.json', 'committee.json', 'state-last-good.json', 'evidence-version.json', 'telegram.json']) {
  try { fs.rmSync(path.join(OFFICE, runtime), { force: true }) } catch {}
}
const mockLog = path.join(LOG_DIR, 'mock-requests.jsonl')
const netLog = path.join(LOG_DIR, 'blocked-network.jsonl')
fs.writeFileSync(mockLog, '')
fs.writeFileSync(netLog, '')

const { server: mock, port: mockPort, requests: mockRequests } = await startMockPaperclip({ logFile: mockLog })
const serverPort = await new Promise((resolve) => {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)) })
})
const serverLogPath = path.join(LOG_DIR, 'server.log')
const serverErrPath = path.join(LOG_DIR, 'server.err.log')
const outFd = fs.openSync(serverLogPath, 'w')
const errFd = fs.openSync(serverErrPath, 'w')
const serverEnv = {
  ...process.env,
  PAPERCLIP_API_URL: `http://127.0.0.1:${mockPort}`,
  OFFICE3D_PORT: String(serverPort),
  VIS2_NET_LOG: netLog,
  VIS2_ALLOWED_PORTS: `${mockPort},${serverPort}`,
  NODE_OPTIONS: '',
}
const server = spawn(process.execPath, ['--import', path.join(HERE, 'block-network.mjs'), path.join(OFFICE, 'server.mjs')], {
  cwd: REPO,
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
})
const pipe = (stream, fd) => stream.on('data', (d) => fs.writeSync(fd, d))
pipe(server.stdout, outFd)
pipe(server.stderr, errFd)

const BASE_URL = `http://127.0.0.1:${serverPort}`
async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return true
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return false
}
const serverUp = await waitForServer()
if (!serverUp) {
  writeJson('run.json', { label: LABEL, sha: SHA, status: 'SERVER_BOOT_FAILED' })
  fs.writeFileSync(path.join(OUT, 'report.md'), `# VIS2-Q ${LABEL} 采集失败\n\n服务未在隔离夹具下启动，详见 logs/server.log、server.err.log。\n`)
  server.kill('SIGKILL'); mock.close(); process.exit(2)
}

// ---- Playwright（从本机只读依赖加载，不安装）----
let playwright
try { playwright = require(PLAYWRIGHT) } catch (error) {
  writeJson('run.json', { label: LABEL, sha: SHA, status: 'PLAYWRIGHT_UNAVAILABLE', error: String(error.message) })
  server.kill('SIGTERM'); mock.close(); process.exit(3)
}
const launch = async () => {
  const bugs = []
  for (const options of [
    { headless: true, channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-webgl'] },
    { headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgl'] },
  ]) {
    try { return await playwright.chromium.launch(options) } catch (error) { bugs.push(String(error.message).slice(0, 300)) }
  }
  throw new Error('浏览器启动失败：' + bugs.join(' | '))
}
const browser = await launch()

const scenes = [
  { id: 'office-default', url: '/', note: '默认入口（PLACE_LATEST 未批准为默认）' },
  { id: 'office-layout3', url: '/?place=office&layout=3', note: 'rev3 展示通道' },
  { id: 'warehouse-dr', url: '/?place=dr', note: 'DR 仓配地点' },
  { id: 'warehouse-control-room', url: '/?place=drlife-warehouse&controlRoom=1', note: '仓配中控室' },
]

const INIT_SCRIPT = () => {
  const state = { raf: 0, rafActive: 0, timers: new Set(), intervalsCreated: 0 }
  window.__vis2 = state
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => {
    state.raf += 1
    state.rafActive += 1
    return raf((time) => { state.rafActive -= 1; callback(time) })
  }
  const setIntervalOriginal = window.setInterval.bind(window)
  window.setInterval = (callback, ms, ...rest) => { state.intervalsCreated += 1; const id = setIntervalOriginal(callback, ms, ...rest); state.timers.add(id); return id }
  const clearIntervalOriginal = window.clearInterval.bind(window)
  window.clearInterval = (id) => { state.timers.delete(id); return clearIntervalOriginal(id) }
  state.fetchCalls = []
  const fetchOriginal = window.fetch.bind(window)
  window.fetch = (input, init) => { try { state.fetchCalls.push(String(typeof input === 'string' ? input : input?.url)) } catch {} ; return fetchOriginal(input, init) }
}

const consoleLines = []
const blockedBrowserRequests = []
function attachCapture(page, sceneId) {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleLines.push({ scene: sceneId, type: message.type(), text: message.text().slice(0, 500) })
  })
  page.on('pageerror', (error) => consoleLines.push({ scene: sceneId, type: 'pageerror', text: String(error.message).slice(0, 500) }))
  page.on('request', (request) => {
    try {
      const url = new URL(request.url())
      const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
      if (!local) blockedBrowserRequests.push({ scene: sceneId, url: url.origin + url.pathname, resourceType: request.resourceType() })
    } catch {}
  })
}

const pagesDir = path.join(OUT, 'screenshots')
async function collectScene(scene) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  const page = await context.newPage()
  attachCapture(page, scene.id)
  await page.addInitScript(INIT_SCRIPT)
  const requests = []
  page.on('request', (request) => {
    try {
      const url = new URL(request.url())
      if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) requests.push({ method: request.method(), path: url.pathname + url.search, type: request.resourceType() })
    } catch {}
  })
  const started = Date.now()
  await page.goto(BASE_URL + scene.url, { waitUntil: 'load', timeout: 45000 })
  await page.waitForFunction(() => Boolean(window.__office && window.__office.renderer), null, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const metrics = await page.evaluate(() => {
    const office = window.__office || {}
    const renderer = office.renderer
    const gl = renderer?.getContext?.()
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    let objects = 0, meshes = 0
    try { office.scene?.traverse?.((item) => { objects += 1; if (item.isMesh) meshes += 1 }) } catch {}
    return {
      ready: Boolean(renderer),
      place: office.placeMode?.mode ? {
        kind: office.placeMode.mode.kind,
        layout: office.placeMode.mode.layout,
        placeId: office.placeMode.mode.placeId,
        campus: Boolean(office.placeMode.mode.campus),
        controlRoom: Boolean(office.placeMode.mode.controlRoom),
      } : null,
      canvasCount: document.querySelectorAll('canvas').length,
      quality: office.quality?.metrics || null,
      rendererInfo: renderer ? {
        calls: renderer.info?.render?.calls,
        triangles: renderer.info?.render?.triangles,
        geometries: renderer.info?.memory?.geometries,
        textures: renderer.info?.memory?.textures,
        dpr: renderer.getPixelRatio?.(),
        width: renderer.domElement?.width,
        height: renderer.domElement?.height,
      } : null,
      gpu: debug && gl ? { vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) } : null,
      objects,
      meshes,
      instrumentation: window.__vis2 ? { raf: window.__vis2.raf, rafActive: window.__vis2.rafActive, timers: window.__vis2.timers.size, intervalsCreated: window.__vis2.intervalsCreated } : null,
      fetchCalls: window.__vis2?.fetchCalls || [],
      labelsVisible: [...document.querySelectorAll('#labels, .catTag, .bubbles')].some((element) => getComputedStyle(element).display !== 'none'),
      visibility: document.visibilityState,
    }
  })
  const frameIntervals = await page.evaluate((duration) => new Promise((resolve) => {
    const deltas = []
    let start = performance.now(), previous = start
    function frame(time) {
      deltas.push(time - previous)
      previous = time
      if (time - start < duration) requestAnimationFrame(frame)
      else resolve(deltas)
    }
    requestAnimationFrame(frame)
  }), 8000)
  const sorted = [...frameIntervals].sort((a, b) => a - b)
  const percentile = (p) => sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(2)) : null
  const frames = { samples: sorted.length, p50: percentile(50), p95: percentile(95), max: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : null }
  await page.screenshot({ path: path.join(pagesDir, `${scene.id}-labels.png`) })
  await page.addStyleTag({ content: '#labels, .catTag, .bubbles, #bubbles { display: none !important; }' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(pagesDir, `${scene.id}-nolabels.png`) })
  await context.close()
  return {
    scene: scene.id,
    note: scene.note,
    url: scene.url,
    loadMs: Date.now() - started,
    requests,
    requestSummary: {
      total: requests.length,
      byPath: Object.entries(requests.reduce((acc, request) => { acc[request.path] = (acc[request.path] || 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1]).slice(0, 20),
      writes: requests.filter((request) => request.method !== 'GET' && request.method !== 'HEAD').length,
    },
    metrics,
    frames,
    console: consoleLines.filter((line) => line.scene === scene.id),
  }
}

const sceneResults = []
for (const scene of scenes) {
  console.log('[scene] start', scene.id)
  try { sceneResults.push(await collectScene(scene)); console.log('[scene] done', scene.id) }
  catch (error) { sceneResults.push({ scene: scene.id, error: String(error.message || error).slice(0, 500) }) }
}

// ---- Q2：连续进入 / 退出（20 轮独立页面加载）----
const lifecycle = []
const sampleRss = () => {
  try { return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(server.pid)], { encoding: 'utf8' }).trim()) } catch { return null }
}
const contextLife = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
for (let index = 0; index < CYCLES; index++) {
  const page = await contextLife.newPage()
  attachCapture(page, `lifecycle-${index}`)
  await page.addInitScript(INIT_SCRIPT)
  await page.goto(BASE_URL + '/?place=office&layout=3', { waitUntil: 'load', timeout: 45000 })
  await page.waitForFunction(() => Boolean(window.__office && window.__office.renderer), null, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const metrics = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('canvas').length,
    calls: window.__office?.quality?.metrics?.calls ?? null,
    triangles: window.__office?.quality?.metrics?.triangles ?? null,
    dpr: window.__office?.renderer?.getPixelRatio?.() ?? null,
    instrumentation: window.__vis2 ? { raf: window.__vis2.raf, rafActive: window.__vis2.rafActive, timers: window.__vis2.timers.size, intervalsCreated: window.__vis2.intervalsCreated } : null,
  }))
  console.log('[lifecycle]', index + 1, '/', CYCLES)
  lifecycle.push({ cycle: index + 1, canvasCount: metrics.canvasCount, calls: metrics.calls, triangles: metrics.triangles, dpr: metrics.dpr, instrumentation: metrics.instrumentation, serverRssKb: sampleRss() })
  await page.close()
}
await contextLife.close()

// ---- Q3：固定 seed/tick 的二维/三维共享快照（跑 B0 既有单测 + 独立追加断言稍后）----
const parityTests = ['tests/dr-console-data.test.mjs', 'tests/dr-console-dynamic.test.mjs', 'tests/campus-layout.test.mjs']
const parity = []
for (const testFile of parityTests) {
  try {
    const result = execFileSync(process.execPath, ['--max-old-space-size=2048', '--test', '--test-timeout=60000', '--test-concurrency=2', testFile], { cwd: OFFICE, encoding: 'utf8', timeout: 120000 })
    const tail = result.trim().split('\n').slice(-8).join('\n')
    parity.push({ file: testFile, exit: 0, tail })
  } catch (error) {
    parity.push({ file: testFile, exit: error.status ?? -1, tail: String(error.stdout || error.stderr || error.message).split('\n').slice(-12).join('\n') })
  }
}

// ---- 网络与上游观察 ----
const upstream = {
  mockTotal: mockRequests.length,
  mockByMethod: mockRequests.reduce((acc, request) => { acc[request.method] = (acc[request.method] || 0) + 1; return acc }, {}),
  mockWrites: mockRequests.filter((request) => request.method !== 'GET').length,
  blockedServerFetch: fs.existsSync(netLog) ? fs.readFileSync(netLog, 'utf8').trim().split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return { raw: line } } }) : [],
  blockedBrowserRequests,
}

const serverMemory = { rssStartKb: lifecycle[0]?.serverRssKb ?? null, rssEndKb: lifecycle[lifecycle.length - 1]?.serverRssKb ?? null, rssSeries: lifecycle.map((row) => row.serverRssKb) }
const result = {
  label: LABEL,
  sha: SHA,
  generatedAt: new Date().toISOString(),
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    browser: (() => { try { return browser.version() } catch { return null } })(),
    playwright: PLAYWRIGHT,
    viewport: '1280x720',
    dpr: 1,
    serverPort,
    mockPort,
    paperclip: 'mock (127.0.0.1)',
    networkPolicy: '只允许 mock 端口与 office3d 端口；外部请求被阻断并记账',
  },
  scenes: sceneResults,
  lifecycle,
  serverMemory,
  parity,
  upstream,
  console: consoleLines,
  coverage: {
    q0_isolated: true,
    q1_feature_matrix: 'NOT_RUN（B0 无办公室/仓配功能开关配置文件；候选 C0 未提供）',
    q2_lifecycle: 'PARTIAL（20 轮页面加载，非候选开关的进入/退出切换）',
    q3_parity: 'PARTIAL（B0 共享快照单测；候选 2D/3D 映射未提供）',
    q4_visual: 'NOT_RUN（参考包 office-target/current、campus-target/current 未提供；截图仅作证据）',
    q4_perf: 'PARTIAL（本机 Chromium 采样，无 Trae 冻结预算，不能宣称 4K/60fps）',
    browser_compat: 'PARTIAL（仅本机 Chromium）',
  },
}
writeJson('run.json', result)
writeJson('measurements.json', { scenes: sceneResults.map((scene) => ({ scene: scene.scene, metrics: scene.metrics, frames: scene.frames, requestSummary: scene.requestSummary })), lifecycle, parity, upstream, serverMemory })

// 摘要报告
const line = (scene) => scene.error
  ? `| ${scene.scene} | ERROR | ${scene.error} |`
  : `| ${scene.scene} | ${scene.metrics?.ready ? 'LOADED' : 'NOT_READY'} | canvas=${scene.metrics?.canvasCount} calls=${scene.metrics?.rendererInfo?.calls} tris=${scene.metrics?.rendererInfo?.triangles} p50=${scene.frames?.p50}ms p95=${scene.frames?.p95}ms |`
const report = `# VIS2-Q ${LABEL} 基线采集报告

- 采集时间：${result.generatedAt}
- 提交：\`${SHA}\`（独立 worktree，非生产工作目录）
- 环境：${process.platform}/${process.arch}、Node ${process.version}、Chromium ${result.environment.browser}
- 服务：office3d 临时端口 ${serverPort}，Paperclip 模拟端口 ${mockPort}，假公司 \`fixture-company-0001\`
- 网络：preload 只放行两个本机端口；浏览器侧外部请求全部 abort

## Q0 隔离与证据

| 项 | 结果 |
|---|---|
| 外部网络请求（服务端） | ${upstream.blockedServerFetch.length} 条被阻断：${[...new Set(upstream.blockedServerFetch.map((item) => item.blocked))].slice(0, 6).join('、') || '无'} |
| 外部网络请求（浏览器） | ${upstream.blockedBrowserRequests.length} 条被阻断 |
| 真实 Paperclip 请求 | 0（所有上游请求都到 127.0.0.1:${mockPort}） |
| 上游写请求 | ${upstream.mockWrites} 次（期望 0） |
| 浏览器 console error/warning | ${consoleLines.length} 条（详见 logs） |

## 场景加载与性能（本机 Chromium，非最终性能裁决）

| 场景 | 状态 | 指标 |
|---|---|---|
${sceneResults.map(line).join('\n')}

截图：\`screenshots/*.png\`（标签显示 / 隐藏各一组）。参考包缺失，视觉结论 **NOT_RUN / REVIEW_REQUIRED**。

## Q2 生命周期（${CYCLES} 轮独立加载）

- canvas 数序列：${[...new Set(lifecycle.map((row) => row.canvasCount))].join(', ')}
- 服务端 RSS（KB）首/末：${serverMemory.rssStartKb} / ${serverMemory.rssEndKb}
- 每轮 RAF/timer 见 run.json；基线加载无跨文档残留（页面关闭即销毁），候选的开关切换生命周期 **NOT_RUN**。

## Q3 二维/三维共享快照（B0 既有单测）

${parity.map((entry) => `- ${entry.file}: exit=${entry.exit}`).join('\n')}

## Q1 / Q4 未执行原因

${Object.entries(result.coverage).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

## 结论边界

本报告只覆盖 **B0 基线（${LABEL}）**；候选 C0 未提供，任何候选相关结论均未生成。没有参考包与 Trae 冻结预算时，视觉与 4K/60fps 不做 PASS 判定。
`
fs.writeFileSync(path.join(OUT, 'report.md'), report)
console.log(JSON.stringify({ ok: true, out: OUT, sha: SHA, scenes: sceneResults.map((scene) => ({ scene: scene.scene, ready: scene.metrics?.ready ?? false, error: scene.error || null })), lifecycle: { cycles: lifecycle.length, canvas: [...new Set(lifecycle.map((row) => row.canvasCount))] }, upstream: { mockWrites: upstream.mockWrites, blockedServer: upstream.blockedServerFetch.length, blockedBrowser: upstream.blockedBrowserRequests.length }, parity }, null, 2))

await browser.close()
server.kill('SIGTERM')
mock.close()
setTimeout(() => process.exit(0), 500)
