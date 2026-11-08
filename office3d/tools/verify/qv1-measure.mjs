// Q-V1 独立测量：静态服务 + 合成 25 人夹具（沿用 PERF 阶段 A 的 /state 夹具），稳定后采样
// 用法：node qv1-measure.mjs <office3d目录> <标签> <place，可带 &whr1=1> [输出目录]
// 说明：不连 3100/3200，自带 25 人合成 /state；SwiftShader 软件渲染，等 25 人完成替换、可见且在座位附近最多 300 秒，再采 15 帧取中位数。
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const [root, label, place = 'drlife-office', out = './qv1-measure-out'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const names = ['OpsLead','OpsEngineer','QAAutomation','Reviewer1','Reviewer2','SecurityReviewer','Lead','PM','Architect','UIUX','FrontendSenior','Frontend1','Frontend2','BackendSenior','Backend1','Backend2','DBEngineer','GoSenior','Go1','Go2','ReactSenior','React1','React2','Localizer','KnowledgeKeeper']
const state = { agents: names.map((name, i) => ({ id: `synthetic-${i}`, name, status: 'idle', title: '性能合成夹具', model: 'synthetic' })), names: {}, meetings: [], voteSessions: [], waiting: [], issues: [] }
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.glb':'model/gltf-binary', '.gz':'application/octet-stream', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.wasm':'application/wasm' }
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost')
  if (u.pathname === '/state') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state))
  if (['/daily', '/foyer'].includes(u.pathname)) return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  if (u.pathname === '/wall/data') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"milestones":[]}')
  const file = path.resolve(root, `.${decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)}`)
  if (!file.startsWith(path.resolve(root) + path.sep)) return res.writeHead(403).end()
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(data))
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const launchOptions = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
if (!fs.existsSync(chromium.executablePath()) && process.env.VERIFY_CHROME) launchOptions.executablePath = process.env.VERIFY_CHROME
const browser = await chromium.launch(launchOptions)
const result = { label, root, place, tiers: {}, errors: [] }
for (const tier of ['high', 'low']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  page.on('pageerror', e => result.errors.push(`${tier}:page:${e.message}`))
  const url = place === 'drlife-office'
    ? `http://127.0.0.1:${port}/?place=drlife-office&layout=3&align=1&officeSample=1&r1=1&q=${tier}`
    : `http://127.0.0.1:${port}/?place=${place}&q=${tier}`
  await page.goto(url, { waitUntil: 'load', timeout: 180000 })
  const t0 = Date.now(); let ready = false, lastState = null
  while (Date.now() - t0 < 300000) {
    lastState = await page.evaluate(() => {
      const office = window.__office
      const rows = office?.views ? [...office.views.values()] : []
      const people = {
        views: rows.length,
        replaced: rows.filter(v => !!v.char?.avatar).length,
        visible: rows.filter(v => !!v.char?.group?.visible && (v.lodProxy?.visible || v.r1PersonDetailed === true)).length,
        atSeat: rows.filter(v => {
          const p = v.char?.group?.position, h = v.home
          return p && h && Math.hypot(p.x - h.x, p.z - h.z) <= 1
        }).length,
      }
      return { people, rendered: Number(office?.quality?.metrics?.rendered) || 0, calls: Number(office?.quality?.metrics?.calls) || 0 }
    })
    const peopleReady = place !== 'drlife-office' || (lastState.people.views >= 25 && lastState.people.replaced >= 25 && lastState.people.visible >= 25 && lastState.people.atSeat >= 25)
    if (lastState.rendered > 5 && lastState.calls > 0 && peopleReady) { ready = true; break }
    await sleep(2000)
  }
  const blockedOn = ready ? [] : [
    ...(place === 'drlife-office' && lastState?.people?.views < 25 ? ['views'] : []),
    ...(place === 'drlife-office' && lastState?.people?.replaced < 25 ? ['replaced'] : []),
    ...(place === 'drlife-office' && lastState?.people?.visible < 25 ? ['visible'] : []),
    ...(place === 'drlife-office' && lastState?.people?.atSeat < 25 ? ['atSeat'] : []),
    ...(lastState?.rendered <= 5 ? ['rendered'] : []),
    ...(lastState?.calls <= 0 ? ['calls'] : []),
  ]
  const people = lastState?.people || { views: 0, replaced: 0, visible: 0, atSeat: 0 }
  if (!ready) {
    result.tiers[tier] = { ready, people, blockedOn, waitedMs: Date.now() - t0 }
    continue
  }
  await sleep(8000)
  const rows = []
  for (let i = 0; i < 15; i++) { await sleep(700); rows.push(await page.evaluate(() => ({ calls: window.__office.quality.metrics.calls, triangles: window.__office.quality.metrics.triangles }))) }
  const sorted = k => rows.map(r => Number(r[k]) || 0).sort((a, b) => a - b)
  result.tiers[tier] = { ready, people, waitedMs: Date.now() - t0, median: { calls: sorted('calls')[7], triangles: sorted('triangles')[7] }, max: { calls: sorted('calls')[14], triangles: sorted('triangles')[14] }, min: { calls: sorted('calls')[0], triangles: sorted('triangles')[0] } }
  console.log(tier, JSON.stringify(result.tiers[tier]))
  try { await page.screenshot({ path: path.join(out, `${label}-${tier}.png`), timeout: 120000 }) } catch (e) { result.errors.push(`${tier}:screenshot-timeout`) }
  await page.close()
}
await browser.close(); server.close()
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(result, null, 2))
console.log(JSON.stringify({ label, tiers: result.tiers, errors: result.errors.slice(0, 3) }))
if (Object.values(result.tiers).some(tier => !tier.ready)) process.exitCode = 2
