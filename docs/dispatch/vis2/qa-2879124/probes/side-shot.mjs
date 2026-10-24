import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('/Users/suchen/Desktop/Niuma/node_modules/playwright')
const ROOT = '/tmp/vis2-qa/cand-2879124/office3d', OUT = '/tmp/vis2-qa/visual'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' }
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); const f = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname))); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res) })
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
await page.goto(`http://127.0.0.1:${port}/dr-vis2-rack-cell-preview.html`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__vis2?.cell); await page.waitForTimeout(800)
const clip = await page.evaluate(() => { const r = window.__vis2.renderer.domElement.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } })
const cam = (p, t) => page.evaluate(([p, t]) => { const c = window.__vis2.camera; c.position.set(...p); c.lookAt(...t) }, [p, t])
await cam([-143.2, 1.0, -1.0], [-146, 0.35, -1]); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, 'canvas-shuttle-side.png'), clip })
await cam([-150.5, 2.4, 1.5], [-141, 1.5, 0]); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, 'canvas-beams-side.png'), clip })
console.log('saved side shots')
await browser.close(); server.close()
