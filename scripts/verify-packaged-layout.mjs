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
    } catch {}
  } else {
    try { child.kill('SIGTERM') } catch {}
  }
  const remaining = Math.max(500, 5000 - (Date.now() - started))
  const closed = await waitForClose(child, remaining)
  return closed !== false
}

/**
 * Run an actual JSON-RPC handshake by spawning the EXACT command returned by
 * ToolCatalog.spec('desktop'). This proves the full packaged Legacy path
 * (core/src/tools.js → shared runtime → legacy spec → core/src/mcp/desktop.js
 * shim → shared desktop-server implementation).
 */
async function spawnDesktopViaCatalogSpec(desktopSpec) {
  if (!desktopSpec || !desktopSpec.command) throw new Error('catalog.spec("desktop") returned empty spec')
  if (!desktopSpec.args || !desktopSpec.args.length) throw new Error('catalog.spec("desktop") returned empty args')
  const env = { ...process.env, NIUMA_DESKTOP_PLATFORM: 'plan9', ...(desktopSpec.env || {}) }
  const server = spawn(desktopSpec.command, desktopSpec.args, { cwd: core, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let closed = false
  let buf = ''
  let errbuf = ''
  const replies = []
  const done = new Promise((resolve) => {
    server.stdout.setEncoding('utf8')
    server.stdout.on('data', (chunk) => { buf += chunk; let i; while ((i = buf.indexOf('\n')) !== -1) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { replies.push(JSON.parse(line)) } catch {} } })
    server.stderr.setEncoding('utf8')
    server.stderr.on('data', (c) => { errbuf += c })
    server.once('exit', () => { closed = true; resolve() })
  })
  try {
    server.stdin.setEncoding('utf8')
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n')
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
    const deadline = Date.now() + 8000
    while (replies.length < 2 && Date.now() < deadline) {
      if (closed) break
      await new Promise((r) => setTimeout(r, 30))
    }
    if (replies.length < 2) {
      throw new Error(`catalog spawned desktop MCP handshake timed out; got replies=${replies.length}, stderr=${errbuf.slice(-500)}`)
    }
    if (replies[0]?.id !== 1) throw new Error(`desktop initialize reply id mismatch: ${replies[0]?.id}`)
    if (replies[0]?.result?.serverInfo?.name !== 'niuma-desktop') throw new Error(`desktop serverInfo wrong: ${String(replies[0]?.result?.serverInfo?.name)}`)
    const list = replies[1]?.result?.tools || []
    if (list.length !== 9) throw new Error(`desktop tools/list count wrong: ${list.length}`)
    const expected = ['screenshot','click','move','drag','scroll','type','key','open','wait']
    if (!expected.every((n, i) => list[i]?.name === n)) throw new Error(`desktop tools/list names wrong: ${list.map((t) => t.name).join(',')}`)
    return { serverInfo: replies[0].result.serverInfo, tools: list.map((t) => t.name) }
  } finally {
    try { server.stdin.end() } catch {}
    await stopChildTree(server)
    await done
  }
}

let validationOk = false
try {
  for (const entry of resources) copyResource(entry)
  for (const required of ['src', 'bin', 'fake', 'packages/executors/runtime', 'packages/tools/runtime']) {
    if (!fs.existsSync(path.join(core, required))) throw new Error(`packaged core is missing ${required}`)
  }

  // ================== FIX 3: PACKAGED PACKAGE.JSON MUST BE PRESERVED (NOT OVERWRITTEN) ==================
  const corePackageJsonPath = path.join(core, 'package.json')
  if (!fs.existsSync(corePackageJsonPath)) {
    throw new Error('desktop package.json extraResources did not copy root package.json to core/; add it to desktop/package.json build.extraResources')
  }
  const corePackageJson = JSON.parse(fs.readFileSync(corePackageJsonPath, 'utf8'))
  if (!corePackageJson.type || corePackageJson.type !== 'module') {
    throw new Error(`packaged core/package.json exists but type=module is missing or wrong: type=${String(corePackageJson.type)}`)
  }
  if (!Array.isArray(corePackageJson.workspaces) || !corePackageJson.workspaces.includes('packages/*')) {
    throw new Error(`packaged core/package.json exists but workspaces metadata not retained: workspaces=${JSON.stringify(corePackageJson.workspaces)}`)
  }

  const runtime = path.join(core, 'packages', 'executors', 'runtime', 'index.js')
  await import(pathToFileURL(runtime).href)

  // ================== FIX 3: IMPORT REAL LEGACY FACADE core/src/tools.js + instantiate ToolCatalog ==================
  const legacyFacadePath = path.join(core, 'src', 'tools.js')
  const legacyFacade = await import(pathToFileURL(legacyFacadePath).href)
  if (!legacyFacade.ToolCatalog) throw new Error('packaged core/src/tools.js Legacy facade does not export ToolCatalog')
  // describeMcpCall / splitMcpName are executor-owned, re-exported ONLY through the Legacy facade
  if (!legacyFacade.describeMcpCall) throw new Error('Legacy facade src/tools.js missing executor compatibility re-export describeMcpCall')
  if (!legacyFacade.splitMcpName) throw new Error('Legacy facade src/tools.js missing executor compatibility re-export splitMcpName')

  // Shared tools runtime imported to verify 12 shared-only symbols
  const toolsRuntime = path.join(core, 'packages', 'tools', 'runtime', 'index.js')
  const toolsExports = await import(pathToFileURL(toolsRuntime).href)
  // describeMcpCall / splitMcpName MUST NOT be in shared runtime exports (Stage 1B boundary)
  if (toolsExports.describeMcpCall) throw new Error('shared packages/tools runtime MUST NOT export describeMcpCall (executor-owned; only Legacy facade may re-export)')
  if (toolsExports.splitMcpName) throw new Error('shared packages/tools runtime MUST NOT export splitMcpName (executor-owned; only Legacy facade may re-export)')
  // Shared-only required symbols:
  const requiredSharedSymbols = ['ToolCatalog','builtinTools','coreBuiltins','LEGACY_COMPAT_OUT','claudeServers','codexServers','parseKeys','winVk','createDesktopServer','startDesktopServer','PLAYWRIGHT_MCP_PINNED_SPEC','ToolRegistry','expandEnv','capabilitySupportsTool']
  for (const sym of requiredSharedSymbols) if (!toolsExports[sym]) throw new Error(`packaged shared tools runtime missing export: ${sym}`)

  const shims = ['base.js', 'cli.js', 'openai.js'].map((name) => fs.readFileSync(path.join(core, 'src', 'workers', name), 'utf8'))
  if (shims.some((text) => !text.includes('../../packages/executors/runtime/index.js'))) throw new Error('legacy shims do not resolve the packaged runtime')
  const implementations = fs.readdirSync(path.join(core, 'src', 'workers')).filter((name) => !['base.js', 'cli.js', 'openai.js'].includes(name) && name.endsWith('.js'))
  if (implementations.length) throw new Error(`duplicate legacy worker implementations: ${implementations.join(', ')}`)

  const facadeSrc = fs.readFileSync(legacyFacadePath, 'utf8')
  if (!facadeSrc.includes('packages/tools/runtime/index.js')) throw new Error('src/tools.js compatibility facade does not route into packages/tools/runtime/index.js')
  if (!facadeSrc.includes('packages/executors/runtime/format.js')) throw new Error('src/tools.js Legacy facade must separately re-export executor format helpers from packages/executors/runtime/format.js')
  const mcpShim = path.join(core, 'src', 'mcp', 'desktop.js')
  const mcpSrc = fs.readFileSync(mcpShim, 'utf8')
  if (!mcpSrc.includes('packages/tools/runtime/mcp/desktop-server.js')) throw new Error('src/mcp/desktop.js shim does not route into packages/tools/runtime/mcp/desktop-server.js')

  const desktopServerShared = path.join(core, 'packages', 'tools', 'runtime', 'mcp', 'desktop-server.js')
  if (!fs.existsSync(desktopServerShared)) throw new Error('shared desktop-server.js implementation missing')
  const sharedBody = fs.readFileSync(desktopServerShared, 'utf8')
  if (!sharedBody.includes("serverInfo: { name: 'niuma-desktop'")) throw new Error('shared desktop MCP implementation body does not contain the protocol source of truth (serverInfo)')

  // ================== NEW: Verify package-local desktop-entry.js exists AND is only a launcher ==================
  const desktopEntryLocal = path.join(core, 'packages', 'tools', 'runtime', 'mcp', 'desktop-entry.js')
  if (!fs.existsSync(desktopEntryLocal)) throw new Error('package-local new-core desktop-entry.js is missing from packaged layout (Fix 1)')
  const entryBody = fs.readFileSync(desktopEntryLocal, 'utf8')
  const entryForbidden = ['const TOOLS_RUNNERS = [', "serverInfo: { name:", '暂不支持这个系统', '没有叫 ', 'WIN_PRELUDE']
  for (const pat of entryForbidden) {
    if (entryBody.includes(pat)) throw new Error(`packages/tools/runtime/mcp/desktop-entry.js is a SECOND implementation body (it must be a minimal launcher only); contains: "${pat}"`)
  }
  if (!entryBody.includes('startDesktopServer')) throw new Error('desktop-entry.js must call startDesktopServer from desktop-server')

  // Duplicate-body single-implementation checks (shims/facades must be thin; one body total per feature)
  const duplicateDesktopBodyPatterns = ['const TOOLS_RUNNERS = [', "serverInfo: { name: 'niuma-desktop'"]
  for (const pat of duplicateDesktopBodyPatterns) if (mcpSrc.includes(pat)) throw new Error(`src/mcp/desktop.js must be a thin shim, but still contains implementation body pattern: ${pat}`)
  const toolsFacadeBodyPatterns = ['class ToolCatalog {', 'claudeServers(', 'codexServers(']
  for (const pat of toolsFacadeBodyPatterns) if (facadeSrc.includes(pat)) throw new Error(`src/tools.js must be a thin facade, but still contains implementation body pattern: ${pat}`)

  // ================== FIX 3: Instantiate Legacy ToolCatalog from packaged facade, run spec('desktop'), then SPAWN IT ====================================
  const homePackaged = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-packaged-home-'))
  const workPackaged = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-packaged-work-'))
  const packagedCatalog = new legacyFacade.ToolCatalog(
    { tools: { discover: false } },
    { workdir: workPackaged, home: homePackaged },
  )
  const ids = packagedCatalog.list().map((t) => t.id).sort()
  if (!ids.includes('browser') || !ids.includes('desktop')) throw new Error(`packaged Legacy ToolCatalog after discover=false should have browser + desktop; got ids=${ids.join(',')}`)
  const desktopSpec = packagedCatalog.spec('desktop')
  if (!desktopSpec?.command) throw new Error('packaged catalog.spec("desktop") returned without command')
  if (!Array.isArray(desktopSpec.args) || !desktopSpec.args[0]) throw new Error('packaged catalog.spec("desktop") args[0] empty')
  const packagedDesktopScript = desktopSpec.args[0]
  if (!fs.existsSync(packagedDesktopScript)) {
    throw new Error(`catalog.spec('desktop').args[0]=${packagedDesktopScript} does not exist inside reconstructed core; core dir=${core}`)
  }
  // Desktop spec must point to the LEGACY shim (core/src/mcp/desktop.js), NOT the new-core local desktop-entry. That's the Legacy/neutral split.
  const expectedLegacyShim = path.resolve(core, 'src', 'mcp', 'desktop.js')
  if (path.resolve(packagedDesktopScript) !== path.resolve(expectedLegacyShim)) {
    throw new Error(`Legacy ToolCatalog.spec('desktop').args[0] must point to Legacy shim (${expectedLegacyShim}), got: ${packagedDesktopScript}`)
  }
  // Now spawn the EXACT command the catalog returned and run the real JSON-RPC initialize + tools/list handshake:
  const mcpResult = await spawnDesktopViaCatalogSpec(desktopSpec)
  if (mcpResult.tools.length !== 9) throw new Error(`spawned catalog desktop MCP tool count wrong: ${mcpResult.tools.length}`)

  // Legacy desktop MCP self-check via shim still works as path-verification smoke:
  // (we already did the catalog.spec spawn; this line remains for continuity with earlier script output)

  const port = await freePort()
  const child = spawn(process.execPath, ['bin/niuma.js', '--fake', '--port', String(port)], { cwd: core, stdio: 'ignore' })
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`, child)
  } finally {
    await stopChildTree(child)
  }
  validationOk = true
  console.log(`packaged layout ok: shared tools + executors present, single implementation for desktop MCP (desktop-entry launcher verified thin), Legacy ToolCatalog loaded from core/src/tools.js, catalog.spec("desktop") spawned real JSON-RPC handshake (serverInfo=${mcpResult.serverInfo.name} tools=${mcpResult.tools.length}), and reconstructed fake NiuMa returns HTTP 200`)
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
