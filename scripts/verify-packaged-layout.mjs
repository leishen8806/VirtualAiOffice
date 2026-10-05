import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'))
const resources = desktop.build?.extraResources || []
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-packaged-'))
const core = path.join(temp, 'core')

function copyResource(entry) {
  if (!entry.from || !entry.to?.startsWith('core/')) return
  const source = path.resolve(root, 'desktop', entry.from)
  const target = path.join(temp, entry.to)
  if (!fs.existsSync(source)) throw new Error(`resource source is missing: ${entry.from}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true, filter: (name) => {
    if (!entry.filter) return true
    if (fs.statSync(name).isDirectory()) return true
    const rel = path.relative(source, name).replaceAll('\\', '/')
    return entry.filter.some((pattern) => pattern === '**/*' || (pattern === '**/*.js' && rel.endsWith('.js')) || (pattern === '**/*.d.ts' && rel.endsWith('.d.ts')))
  } })
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`fake rehearsal exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status === 200) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`fake rehearsal did not respond: ${url}`)
}

try {
  for (const entry of resources) copyResource(entry)
  for (const required of ['src', 'bin', 'fake', 'packages/executors/runtime']) {
    if (!fs.existsSync(path.join(core, required))) throw new Error(`packaged core is missing ${required}`)
  }
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({ type: 'module' }))

  const runtime = path.join(core, 'packages', 'executors', 'runtime', 'index.js')
  await import(pathToFileURL(runtime).href)
  const shims = ['base.js', 'cli.js', 'openai.js'].map((name) => fs.readFileSync(path.join(core, 'src', 'workers', name), 'utf8'))
  if (shims.some((text) => !text.includes('../../packages/executors/runtime/index.js'))) throw new Error('legacy shims do not resolve the packaged runtime')
  const implementations = fs.readdirSync(path.join(core, 'src', 'workers')).filter((name) => !['base.js', 'cli.js', 'openai.js'].includes(name) && name.endsWith('.js'))
  if (implementations.length) throw new Error(`duplicate legacy worker implementations: ${implementations.join(', ')}`)

  const port = await freePort()
  const child = spawn(process.execPath, ['bin/niuma.js', '--fake', '--port', String(port)], { cwd: core, stdio: 'ignore' })
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`, child)
  } finally {
    if (child.exitCode == null) child.kill()
    await new Promise((resolve) => child.once('close', resolve))
  }
  console.log('packaged layout ok: reconstructed core starts fake NiuMa and returns HTTP 200')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
