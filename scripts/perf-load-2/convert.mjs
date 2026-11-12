import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
const { chromium } = await import(pathToFileURL(process.argv[2] || 'C:/Users/Administrator/node_modules/playwright/index.mjs').href)
const mode = process.argv[3] || 'all', selected = process.argv[4]
const output = path.join(repo, 'office3d/assets/compact')
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<script type="importmap">{"imports":{"three":"/office3d/vendor/three/three.module.js"}}</script>')
  const file = path.resolve(repo, '.' + decodeURIComponent(url.pathname))
  if (!file.startsWith(repo + path.sep)) return res.writeHead(403).end()
  try { const bytes = await fs.readFile(file); res.writeHead(200, { 'content-type': /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream' }).end(bytes) } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage(), results = []
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const jobs = []
  if (['all', 'animation'].includes(mode)) {
    for (const name of (await fs.readdir(path.join(repo, 'office3d/assets/models/people/anim'))).filter(n => n.endsWith('.fbx')).sort()) jobs.push({ kind: 'animation', file: `office3d/assets/models/people/anim/${name}`, target: `anim/${name.replace('.fbx', '.anim')}` })
    jobs.push({ kind: 'animation', cartoon: true, file: 'office3d/assets/models/anim/UAL1_Standard.glb', target: 'anim/UAL1_Standard.anim' })
  }
  if (['all', 'model'].includes(mode)) for (const dir of await fs.readdir(path.join(repo, 'office3d/assets/models/people'), { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'anim') continue
    const files = await fs.readdir(path.join(repo, 'office3d/assets/models/people', dir.name))
    const name = files.includes(`${dir.name}_facial.fbx`) ? `${dir.name}_facial.fbx` : `${dir.name}.fbx`
    jobs.push({ kind: 'model', file: `office3d/assets/models/people/${dir.name}/${name}`, target: `people/${dir.name}.glb` })
  }
  for (const job of jobs.filter(j => !selected || j.file.includes(selected))) {
    const result = await page.evaluate(async job => {
      const convert = await import('/scripts/perf-load-2/convert-browser.js')
      return convert[job.kind]('/' + job.file, job.cartoon)
    }, job)
    job.target += '.gz'
    const bytes = gzipSync(Buffer.from(result.binary, 'base64'), { level: 9 }), target = path.join(output, job.target)
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes)
    const source = await fs.readFile(path.join(repo, job.file))
    const row = { ...job, sourceBytes: source.length, sourceSha256: createHash('sha256').update(source).digest('hex'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), proof: result.proof }
    results.push(row); console.log(JSON.stringify(row))
  }
  await fs.mkdir(output, { recursive: true })
  for (const kind of ['model', 'animation']) {
    let rows = results.filter(row => row.kind === kind)
    if (!rows.length) continue
    const manifest = path.join(output, `conversion-${kind}.json`)
    if (selected) {
      const previous = await fs.readFile(manifest, 'utf8').then(JSON.parse).catch(e => { if (e.code === 'ENOENT') return []; throw e })
      rows = [...previous.filter(row => !rows.some(r => r.file === row.file)), ...rows]
    }
    rows.sort((a, b) => a.file.localeCompare(b.file, 'en'))
    await fs.writeFile(manifest, JSON.stringify(rows, null, 2) + '\n')
  }
} finally { await browser.close(); await new Promise(r => server.close(r)) }
