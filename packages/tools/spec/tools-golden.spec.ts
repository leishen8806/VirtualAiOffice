import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ToolCatalog,
  builtinTools,
  claudeServers,
  codexServers,
  parseKeys,
  winVk,
  createDesktopServer,
  desktopToolsList,
  coreBuiltins,
  PLAYWRIGHT_MCP_PINNED_VERSION,
  PLAYWRIGHT_MCP_PINNED_SPEC,
  LEGACY_COMPATIBILITY_IDENTIFIER,
  FUTURE_NEUTRAL,
  LEGACY_COMPAT_OUT,
  ToolRegistry,
  normalizeToolDefinition,
  capabilitySupportsTool,
} from '../runtime/index.js'
/**
 * Legacy-formatting helpers: describeMcpCall / splitMcpName are EXECUTOR-OWNED
 * and are re-exported from the Legacy facade only — they must NOT come from
 * the shared @vao/tools runtime.
 *
 * No type declarations exist for the src/tools.js compatibility shim; suppress
 * the implicit-any lookup since this is an intentionally LEGACY shim path.
 */
// @ts-ignore: src/tools.js is a bare compatibility facade without accompanying d.ts
import { describeMcpCall, splitMcpName } from '../../../src/tools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DESKTOP = path.join(root, 'src', 'mcp', 'desktop.js')
const DESKTOP_PACKAGE_LOCAL = path.resolve(root, 'packages', 'tools', 'runtime', 'mcp')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vao-tools-golden-'))
type ToolGroup = { readonly type: string; readonly cfg?: Readonly<Record<string, unknown>> }
const group = (type: string, cfg: Readonly<Record<string, unknown>> = {}): ToolGroup => ({ type, cfg })

test('catalog golden: list/get/resolve/supports/guess/spec preserve legacy behavior exactly', () => {
  const home = tmp()
  const cat = new ToolCatalog({ tools: { discover: false } }, { workdir: tmp(), home })
  const ids = cat.list().map((t) => t.id)
  assert.deepEqual(ids, ['browser', 'desktop'])
  assert.equal(cat.get('no-such'), null)
  assert.deepEqual(cat.resolve(['浏览器', 'niuma_desktop', 'nope', 'browser']), ['browser', 'desktop'])
  assert.equal(cat.supports(group('claude-cli'), 'browser'), true)
  assert.equal(cat.supports(group('codex-cli'), 'browser'), true)
  assert.equal(cat.supports(group('openai-api'), 'browser'), true)
  assert.equal(cat.supports(group('claude-cli'), 'desktop'), true)
  assert.equal(cat.supports(group('codex-cli'), 'desktop'), false)
  assert.equal(cat.supports(group('openai-api'), 'desktop'), false)
  assert.equal(cat.supports(group('openai-api', { vision: true }), 'desktop'), true)
  assert.deepEqual(cat.guess('@frontend 打开网页看看首页'), ['browser'])
  assert.deepEqual(cat.guess('帮我在微信里发个消息'), ['desktop'])
  // Legacy spec('desktop').args[0] must equal the Legacy shim src/mcp/desktop.js path
  assert.equal(cat.spec('desktop')?.args[0], DESKTOP)
  const safe = new ToolCatalog({ autonomy: 'safe', tools: { discover: false } }, { workdir: tmp(), home })
  assert.equal(safe.get('desktop'), null)
  process.env.NIUMA_T = 'secret'
  const custom = new ToolCatalog(
    { tools: { discover: false, browser: { enabled: false }, mydb: { name: '数据库', description: '查库', command: 'node', args: ['db.js'], env: { TOKEN: '${NIUMA_T}' } } } },
    { workdir: tmp(), home },
  )
  assert.deepEqual(custom.list().map((t) => t.id), ['desktop', 'mydb'])
  assert.deepEqual(custom.spec('mydb'), { command: 'node', args: ['db.js'], env: { TOKEN: 'secret' } })
})

test('builtins: legacy niuma_* identifiers + future-neutral vao_* coexist without mixing', () => {
  const bt = builtinTools()
  assert.equal(bt.browser.server, LEGACY_COMPATIBILITY_IDENTIFIER.servers.niuma_browser)
  assert.equal(bt.desktop.server, LEGACY_COMPATIBILITY_IDENTIFIER.servers.niuma_desktop)
  assert.equal(bt.desktop.id, LEGACY_COMPATIBILITY_IDENTIFIER.ids.desktop)
  assert.ok(bt.browser.keywords.includes('浏览器'))
  assert.ok(bt.browser.keywords.includes('截图'))
  assert.ok(bt.desktop.name === '电脑操作')
  assert.ok(bt.desktop.keywords.includes('微信'))
  assert.ok(bt.browser.args.includes('--allow-unrestricted-file-access'), 'browser args must carry --allow-unrestricted-file-access for Playwright MCP')
  assert.ok(bt.browser.args.includes('--output-dir'), 'browser args must carry --output-dir flag')
  const pkgIdx = bt.browser.args.findIndex((a) => String(a).startsWith('@playwright/mcp@'))
  assert.ok(pkgIdx !== -1, 'browser args should include the pinned Playwright MCP package')
  const allowIdx = bt.browser.args.indexOf('--allow-unrestricted-file-access')
  const outDirFlagIdx = bt.browser.args.indexOf('--output-dir')
  assert.ok(pkgIdx < outDirFlagIdx && outDirFlagIdx < allowIdx, 'browser args order: [npx -y] pkg --output-dir OUT --allow-unrestricted-file-access')
  assert.equal(bt.desktop.vision, true)
  assert.equal(bt.desktop.takesOver, true)
  const core = coreBuiltins()
  assert.equal(core[FUTURE_NEUTRAL.ids.browser].id, FUTURE_NEUTRAL.ids.browser)
  assert.equal(core[FUTURE_NEUTRAL.ids.browser].server, FUTURE_NEUTRAL.servers.vao_browser)
  assert.equal(core[FUTURE_NEUTRAL.ids.desktopControl].id, FUTURE_NEUTRAL.ids.desktopControl)
  assert.equal(core[FUTURE_NEUTRAL.ids.desktopControl].server, FUTURE_NEUTRAL.servers.vao_desktop)
  assert.equal(core[FUTURE_NEUTRAL.ids.browser].readOnlySafe, false)
  assert.equal(core[FUTURE_NEUTRAL.ids.desktopControl].readOnlySafe, false)
  // ======== NEW FIX 1 TEST: core desktop-control args[0] points INSIDE packages/tools/runtime/mcp/, NOT src/mcp/desktop.js ========
  const coreDesktopArg0 = String(core[FUTURE_NEUTRAL.ids.desktopControl].args[0] || '')
  assert.ok(
    coreDesktopArg0.includes(path.join('packages', 'tools', 'runtime', 'mcp')),
    `new-core desktop-control args[0] must live under packages/tools/runtime/mcp/; actual: ${coreDesktopArg0}`,
  )
  assert.ok(!coreDesktopArg0.includes(path.join('src', 'mcp', 'desktop.js')), `new-core desktop-control must NOT depend on Legacy src/mcp/desktop.js; actual: ${coreDesktopArg0}`)
  assert.ok(fs.existsSync(coreDesktopArg0), `new-core desktop entry file must exist on disk: ${coreDesktopArg0}`)
  // ======== NEW FIX 2 TESTS: core browser outputDir is EXPLICIT, no ~/.niuma default; Legacy injects ~/.niuma ========
  const coreBrowserNoArgs = coreBuiltins()
  const coreBrowserOutDir = String((coreBrowserNoArgs[FUTURE_NEUTRAL.ids.browser]._core as { outputDir: string | null })?.outputDir || '')
  assert.ok(!coreBrowserOutDir.includes('.niuma'), `new-core browser default outputDir must not silently use ~/.niuma; actual _core.outputDir='${coreBrowserOutDir}'`)
  const explicitDir = path.join(os.tmpdir(), `browser-out-${Date.now()}`)
  const coreBrowserExplicit = coreBuiltins({ outputDir: explicitDir })
  const explicitCoreBrowserArgs = coreBrowserExplicit[FUTURE_NEUTRAL.ids.browser].args.map(String)
  assert.ok(explicitCoreBrowserArgs.includes(explicitDir), `when outputDir provided, new-core browser args MUST include it: ${explicitCoreBrowserArgs.join(',')}`)
  // Legacy browser: always defaults to LEGACY_COMPAT_OUT() (~/.niuma/browser) even when caller passes none
  const legacyBrowserNoArgs = builtinTools()
  const legacyBrowserOutDir = String((legacyBrowserNoArgs.browser._legacy as { outputDir?: string })?.outputDir || '')
  assert.ok(
    legacyBrowserOutDir === LEGACY_COMPAT_OUT(),
    `legacy browser outputDir default is ~/.niuma/browser via LEGACY_COMPAT_OUT; actual='${legacyBrowserOutDir}' expected='${LEGACY_COMPAT_OUT()}'`,
  )
  const legacyBrowserArgs = legacyBrowserNoArgs.browser.args.map(String)
  assert.ok(
    legacyBrowserArgs.includes(LEGACY_COMPAT_OUT()),
    `legacy browser args MUST carry the Legacy compat outputDir; args=${legacyBrowserArgs.join(',')}`,
  )
})

test('Playwright MCP pinned version: no @latest anywhere; spec uses semver pin', () => {
  const bt = builtinTools()
  const pkgCandidates = bt.browser.args.filter((a: unknown) => String(a).startsWith('@playwright/mcp@'))
  assert.equal(pkgCandidates.length, 1, `args must contain exactly one @playwright/mcp@ entry, got ${pkgCandidates.length}: ${JSON.stringify(bt.browser.args)}`)
  const pkg = String(pkgCandidates[0])
  assert.ok(!pkg.endsWith('@latest'), `browser package must not be floating @latest: ${pkg}`)
  assert.ok(pkg.startsWith('@playwright/mcp@'), `browser pkg must start with @playwright/mcp@: ${pkg}`)
  assert.equal(`@playwright/mcp@${PLAYWRIGHT_MCP_PINNED_VERSION}`, PLAYWRIGHT_MCP_PINNED_SPEC)
  assert.equal(pkg, PLAYWRIGHT_MCP_PINNED_SPEC)
  assert.ok(/^\d+\.\d+\.\d+$/.test(PLAYWRIGHT_MCP_PINNED_VERSION), `pinned version must be exact semver: ${PLAYWRIGHT_MCP_PINNED_VERSION}`)
  const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'runtime')
  for (const name of ['sources/builtin.js', 'index.js']) {
    const full = path.join(runtimeDir, name)
    if (!fs.existsSync(full)) continue
    const text = fs.readFileSync(full, 'utf8')
    assert.ok(!text.includes('@playwright/mcp@latest'), `${name} must not reference @playwright/mcp@latest`)
  }
})

test('discovery: Claude Code + Codex discovery preserve legacy output', () => {
  const home = tmp()
  const work = tmp()
  fs.writeFileSync(
    path.join(home, '.claude.json'),
    JSON.stringify({
      mcpServers: { github: { type: 'http', url: 'https://example.com/mcp' }, notes: { command: 'node', args: ['notes.js'] } },
      projects: { [work]: { mcpServers: { local_db: { command: 'db-mcp' } } } },
    }),
  )
  fs.mkdirSync(path.join(home, '.codex'))
  fs.writeFileSync(
    path.join(home, '.codex', 'config.toml'),
    `model = "gpt-5"\n\n[mcp_servers.notes]\ncommand = "node"\nargs = ["notes.js"]\n\n[mcp_servers.search]\ncommand = "npx"\nargs = ["-y", "search-mcp"]\n\n[mcp_servers.search.env]\nAPI_KEY = "k1"\n\n[profiles.x]\nmodel = "o3"\n`,
  )
  assert.deepEqual(codexServers(path.join(home, '.codex')).search, { command: 'npx', args: ['-y', 'search-mcp'], env: { API_KEY: 'k1' } })
  const cat = new ToolCatalog({}, { workdir: work, home })
  const ids = cat.list().map((t) => t.id)
  assert.ok(['github', 'notes', 'local_db', 'search'].every((id) => ids.includes(id)), ids.join(','))
  assert.equal(cat.supports(group('claude-cli'), 'github'), true)
  assert.equal(cat.supports(group('codex-cli'), 'github'), false)
  assert.equal(cat.supports(group('openai-api'), 'notes'), true)
  const notesDef = cat.get('notes')
  assert.ok(notesDef, 'notes should exist')
  assert.deepEqual([...notesDef.native].sort(), ['claude-cli', 'codex-cli'])
  const searchDef = cat.get('search')
  assert.ok(searchDef, 'search should exist')
  assert.deepEqual(searchDef.native, ['codex-cli'])
})

test('parseKeys/winVk + format helpers parity', () => {
  assert.deepEqual(parseKeys('Ctrl+Shift+T'), { mods: ['ctrl', 'shift'], key: 't' })
  assert.deepEqual(parseKeys('command + return'), { mods: ['cmd'], key: 'enter' })
  assert.throws(() => parseKeys('a+b'), /一次只能按一个主键/)
  assert.equal(winVk('s'), 0x53)
  assert.equal(winVk('f5'), 0x74)
  assert.equal(winVk('enter'), 0x0d)
  // describeMcpCall / splitMcpName come from Legacy facade src/tools.js —
  // not from shared @vao/tools runtime (per Stage 1B architecture boundary).
  assert.equal(describeMcpCall('niuma_desktop', 'click', { x: 3, y: 4, double: true }), '双击屏幕 (3, 4)')
  assert.equal(splitMcpName('mcp__niuma_browser__browser_navigate').server, 'niuma_browser')
  assert.equal(splitMcpName('mcp__niuma_browser__browser_navigate').tool, 'browser_navigate')
})

test('concept separation: ToolDefinition/ToolDiscovery/ToolGrant/ResolvedToolSpec exist as distinct exports', () => {
  const def = normalizeToolDefinition({ id: 'custom', name: 'C', command: 'node', args: ['c.js'], readOnlySafe: true, origin: { kind: 'builtin' } })
  assert.equal(def?.readOnlySafe, true)
  assert.equal(def?.id, 'custom')
  assert.equal(def?.origin?.kind, 'builtin')
  const reg = new ToolRegistry({ aliases: { desktop: 'desktop-control' } })
  reg.add({ id: 'desktop-control', name: 'Desktop', server: 'vao_desktop', command: 'node', args: ['d.js'], vision: true, takesOver: true })
  assert.equal(reg.list().length, 1)
  assert.equal(reg.get('desktop-control')?.id, 'desktop-control')
  assert.equal(reg.get('desktop')?.id, 'desktop-control')
  const legacy = builtinTools().desktop
  assert.equal(capabilitySupportsTool(group('claude-cli'), legacy), true)
  assert.equal(capabilitySupportsTool(group('codex-cli'), legacy), false)
})

type McpToolName = { readonly name: string }
test('desktop MCP protocol: initialize/serverInfo/tools/list + unknown tool error + unsupported platform text', async (_t: unknown) => {
  const server = createDesktopServer({ envPlatform: 'plan9' })
  assert.equal(server.platform, 'plan9')
  assert.equal(server.osZh, 'plan9')
  const lines: string[] = []
  const mockStdout = {
    write(s: string) {
      lines.push(String(s))
      return true
    },
  } as unknown as NodeJS.WritableStream
  await server.handleRequest({ id: 1, method: 'initialize' }, mockStdout)
  const initReply = JSON.parse(lines[0]!.trimEnd())
  assert.equal(initReply.id, 1)
  assert.equal(initReply.result?.serverInfo?.name, 'niuma-desktop')
  assert.equal(initReply.result?.protocolVersion, '2025-06-18')
  assert.deepEqual(Object.keys(initReply.result?.capabilities || {}), ['tools'])
  lines.length = 0
  await server.handleRequest({ id: 2, method: 'tools/list' }, mockStdout)
  const listReply = JSON.parse(lines[0]!.trimEnd())
  const want = desktopToolsList().map((x: McpToolName) => x.name)
  assert.deepEqual(listReply.result?.tools?.map((x: McpToolName) => x.name), want)
  assert.equal(want.length, 9)
  lines.length = 0
  await server.handleRequest({ id: 3, method: 'tools/call', params: { name: 'nope', arguments: {} } }, mockStdout)
  const nope = JSON.parse(lines[0]!.trimEnd())
  assert.equal(nope.error?.code, -32602)
  assert.match(String(nope.error?.message || ''), /没有叫 nope/)
  lines.length = 0
  await server.handleRequest({ id: 4, method: 'tools/call', params: { name: 'click', arguments: { x: 1, y: 2 } } }, mockStdout)
  const bad = JSON.parse(lines[0]!.trimEnd())
  assert.equal(bad.result?.isError, true)
  assert.match(String(bad.result?.content?.[0]?.text || ''), /暂不支持这个系统：plan9/)
})

/**
 * ============================================================
 * STATIC DEPENDENCY AUDIT (new with the package boundary fix):
 * packages/tools/runtime/** /*.js MUST NOT import packages/executors /
 * @vao/executors / ../../executors / ../../../executors at runtime.
 * ============================================================
 */
test('packages/tools runtime has zero imports of executors (Stage 1B architecture boundary)', () => {
  const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'runtime')
  if (!fs.existsSync(runtimeRoot)) throw new Error(`runtime root does not exist: ${runtimeRoot}`)
  const forbiddenPatterns = [
    // Matches: import "X" where X contains: packages/executors or @vao/executors or (.. or ../..) leading into executors/
    (() => {
      const p = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"](?:[^'"]*packages\/executors|@vao\/executors|(?:\.\.\/){1,3}executors\/)[^'"]*['"]/
      ;(p as unknown as { display: string }).display = '/imports packages/executors or @vao/executors or ../executors'
      return p as RegExp & { display: string }
    })(),
  ]
  const violations: string[] = []
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) {
        const lines = fs.readFileSync(full, 'utf8').split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!
          for (const pat of forbiddenPatterns) {
            if (pat.test(line)) {
              violations.push(`${path.relative(root, full)}:${i + 1} ${pat.display ?? String(pat)} — line: ${line.trim().slice(0, 160)}`)
            }
          }
        }
      }
    }
  }
  walk(runtimeRoot)
  assert.deepEqual(violations, [], `packages/tools runtime JS files must not import executors via import/from; violations count=${violations.length}. scanned root=${runtimeRoot}`)
})

/**
 * New: desktop-entry.js is only a MINIMAL launcher — must NOT be a second
 * desktop MCP implementation body.
 */
test('package-local desktop-entry.js is only a launcher (single-implementation check)', () => {
  const entryFile = path.resolve(DESKTOP_PACKAGE_LOCAL, 'desktop-entry.js')
  assert.ok(fs.existsSync(entryFile), `desktop-entry.js must exist: ${entryFile}`)
  const text = fs.readFileSync(entryFile, 'utf8')
  const forbidden = [
    'TOOLS_RUNNERS',
    'serverInfo: { name:',
    '暂不支持这个系统',
    '没有叫 ',
    'WIN_PRELUDE',
    'class DesktopServer',
  ]
  for (const needle of forbidden) {
    assert.ok(!text.includes(needle), `desktop-entry.js must be a launcher only, must NOT contain implementation body marker "${needle}". File size=${text.length} chars`)
  }
  assert.ok(text.includes('startDesktopServer'), `desktop-entry.js must import/call startDesktopServer: ${entryFile}`)
})
