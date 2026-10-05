import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
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

function waitForClose(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(false)
    }, timeoutMs)
    const done = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(code)
    }
    if (child.exitCode != null) {
      done(child.exitCode)
    } else {
      child.once('exit', done)
      child.once('close', done)
    }
  })
}

async function stopChildTree(child) {
  if (!child || child.exitCode != null) return true
  const started = Date.now()
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 })
    } catch {
      // tolerate: taskkill itself can throw if the process already vanished
    }
  } else {
    try { child.kill('SIGTERM') } catch {}
  }
  const remaining = Math.max(500, 5000 - (Date.now() - started))
  const closed = await waitForClose(child, remaining)
  return closed !== false
}

async function desktopMcpSelfCheck(scriptPath) {
  const child = spawn(process.execPath, [scriptPath], {
    env: { ...process.env, NIUMA_DESKTOP_PLATFORM: 'plan9' },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  try {
    const replies = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('desktop mcp timeout')), 8000)
      const replies = []
      let buf = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        buf += chunk
        let i
        while ((i = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (!line) continue
          try { replies.push(JSON.parse(line)) } catch {}
          if (replies.length >= 2) {
            clearTimeout(timer)
            resolve(replies)
          }
        }
      })
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n')
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
    })
    if (replies[0]?.id !== 1 || replies[0]?.result?.serverInfo?.name !== 'niuma-desktop') {
      throw new Error('desktop mcp initialize response mismatch')
    }
    if (replies[1]?.id !== 2) throw new Error('desktop mcp tools/list id mismatch')
    const names = replies[1]?.result?.tools?.map((t) => t.name) || []
    const expected = ['screenshot', 'click', 'move', 'drag', 'scroll', 'type', 'key', 'open', 'wait']
    if (names.join(',') !== expected.join(',')) throw new Error(`desktop mcp tool names mismatch: ${names.join(',')}`)
    return true
  } finally {
    await stopChildTree(child)
  }
}

let validationOk = false
try {
  for (const entry of resources) copyResource(entry)
  for (const required of ['src', 'bin', 'fake', 'packages/executors/runtime', 'packages/tools/runtime']) {
    if (!fs.existsSync(path.join(core, required))) throw new Error(`packaged core is missing ${required}`)
  }
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({ type: 'module' }))

  const runtime = path.join(core, 'packages', 'executors', 'runtime', 'index.js')
  await import(pathToFileURL(runtime).href)
  const shims = ['base.js', 'cli.js', 'openai.js'].map((name) => fs.readFileSync(path.join(core, 'src', 'workers', name), 'utf8'))
  if (shims.some((text) => !text.includes('../../packages/executors/runtime/index.js'))) throw new Error('legacy shims do not resolve the packaged runtime')
  const implementations = fs.readdirSync(path.join(core, 'src', 'workers')).filter((name) => !['base.js', 'cli.js', 'openai.js'].includes(name) && name.endsWith('.js'))
  if (implementations.length) throw new Error(`duplicate legacy worker implementations: ${implementations.join(', ')}`)

  // NEW: Stage 1B-A shared tools package integrity
  const toolsRuntime = path.join(core, 'packages', 'tools', 'runtime', 'index.js')
  const toolsExports = await import(pathToFileURL(toolsRuntime).href)
  for (const sym of ['ToolCatalog', 'builtinTools', 'claudeServers', 'codexServers', 'parseKeys', 'winVk', 'createDesktopServer', 'startDesktopServer', 'describeMcpCall', 'splitMcpName']) {
    if (!toolsExports[sym]) throw new Error(`@vao/tools packaged runtime missing export: ${sym}`)
  }
  const facade = path.join(core, 'src', 'tools.js')
  const facadeSrc = fs.readFileSync(facade, 'utf8')
  if (!facadeSrc.includes('packages/tools/runtime/index.js')) throw new Error('src/tools.js compatibility facade does not re-export the shared @vao/tools runtime')
  const mcpShim = path.join(core, 'src', 'mcp', 'desktop.js')
  const mcpSrc = fs.readFileSync(mcpShim, 'utf8')
  if (!mcpSrc.includes('packages/tools/runtime/mcp/desktop-server.js')) throw new Error('src/mcp/desktop.js compatibility shim does not route through shared @vao/tools desktop server')

  // NEW: desktop MCP actually boots, initialize + tools/list succeed
  await desktopMcpSelfCheck(mcpShim)

  const port = await freePort()
  const child = spawn(process.execPath, ['bin/niuma.js', '--fake', '--port', String(port)], { cwd: core, stdio: 'ignore' })
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`, child)
  } finally {
    await stopChildTree(child)
  }
  validationOk = true
  console.log('packaged layout ok: reconstructed core starts fake NiuMa and returns HTTP 200')
} finally {
  try {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (error) {
    if (validationOk) {
      console.warn(`warning: unable to remove packaged-layout temp directory: ${temp}: ${error.message}`)
    } else {
      throw error
    }
  }
}
