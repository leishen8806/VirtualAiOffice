// Q-V1 独立测量：静态服务 + 合成 25 人夹具（沿用 PERF 阶段 A 的 /state 夹具），稳定后采样
// 用法：node measure.mjs <office3d目录> <标签> <place> [out目录]
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
  const t0 = Date.now(); let ready = false, views = 0
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => ({ views: window.__office?.views?.size || 0, rendered: Number(window.__office?.quality?.metrics?.rendered) || 0, calls: Number(window.__office?.quality?.metrics?.calls) || 0 }))
    views = s.views
    if (s.rendered > 5 && s.calls > 0 && (place !== 'drlife-office' || s.views >= 25)) { ready = true; break }
    await sleep(2000)
  }
  await sleep(8000)
  const table = await page.evaluate(() => {
    const o = window.__office, T = o.THREE, cam = o.camera, fr = new T.Frustum(); cam.updateMatrixWorld(); fr.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
    const visible = n => { for (let p = n; p; p = p.parent) if (!p.visible) return false; return true }
    const agentRoots = new Set(); for (const v of (o.views?.values?.() || [])) { const g = v.group || v.root || v.char?.group || v.mesh; if (g) agentRoots.add(g) }
    const bucketOf = n => { for (let p = n; p; p = p.parent) { if (agentRoots.has(p)) return 'AGENTS(25人)'; } let p = n, names = []; while (p && names.length < 6) { if (p.name) names.push(p.name); p = p.parent } return names.reverse().slice(0, 3).join(' / ') || '(unnamed)' }
    const agg = new Map(), byMesh = []
    o.scene.traverse(n => { if (!(n.isMesh || n.isInstancedMesh || n.isSkinnedMesh) || !visible(n)) return; if (n.frustumCulled !== false && n.geometry) { if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere(); if (!n.isInstancedMesh && !fr.intersectsObject(n)) return }
      const g = n.geometry; if (!g) return; const idx = g.index ? g.index.count : (g.attributes.position?.count || 0); const inst = n.isInstancedMesh ? n.count : 1; const tris = Math.round(idx / 3) * inst; const calls = Array.isArray(n.material) ? Math.max(1, g.groups.length) : 1
      const b = bucketOf(n); const a = agg.get(b) || { calls: 0, tris: 0 }; a.calls += calls; a.tris += tris; agg.set(b, a); byMesh.push([n.name || '(m)', tris, calls]) })
    const rows = [...agg.entries()].map(([k, v]) => ({ bucket: k, ...v })); const tot = rows.reduce((s, r) => ({ calls: s.calls + r.calls, tris: s.tris + r.tris }), { calls: 0, tris: 0 })
    return { total: tot, renderer: { calls: o.quality.metrics.calls, tris: o.quality.metrics.triangles }, byTris: rows.sort((a, b) => b.tris - a.tris).slice(0, 30), byCalls: [...rows].sort((a, b) => b.calls - a.calls).slice(0, 30), shadows: o.renderer.shadowMap.enabled }
  })
  result.tiers[tier] = table; console.log(tier, JSON.stringify({ total: table.total, renderer: table.renderer, shadows: table.shadows }))
  try { await page.screenshot({ path: path.join(out, `${label}-${tier}.png`), timeout: 120000 }) } catch (e) { result.errors.push(`${tier}:screenshot-timeout`) }
  await page.close()
}
await browser.close(); server.close()
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(result, null, 2))
console.log('done')
