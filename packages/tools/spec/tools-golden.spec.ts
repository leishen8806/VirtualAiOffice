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
  describeMcpCall,
  splitMcpName,
  parseKeys,
  winVk,
  createDesktopServer,
  desktopToolsList,
  coreBuiltins,
  PLAYWRIGHT_MCP_PINNED_VERSION,
  PLAYWRIGHT_MCP_PINNED_SPEC,
  LEGACY_COMPATIBILITY_IDENTIFIER,
  FUTURE_NEUTRAL,
  ToolRegistry,
  normalizeToolDefinition,
  capabilitySupportsTool,
} from '../runtime/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DESKTOP = path.join(root, 'src', 'mcp', 'desktop.js')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vao-tools-golden-'))
type ToolGroup = { readonly type: string; readonly cfg?: Readonly<Record<string, unknown>> }
const group = (type: string, cfg: Readonly<Record<string, unknown>> = {}): ToolGroup => ({ type, cfg })

test('catalog golden: list/get/resolve/supports/guess/spec preserve legacy behavior exactly', () => {
  const home = tmp()
  const cat = new ToolCatalog({ tools: { discover: false } }, { workdir: tmp(), home })
  const ids = cat.list().map((t) => t.id)
  assert.deepEqual(ids, ['browser', 'desktop'])
  assert.equal(cat.get('no-such'), null)
  // Legacy 中文 + 旧 server name niuma_desktop 都能通过 resolve 找到
  assert.deepEqual(cat.resolve(['浏览器', 'niuma_desktop', 'nope', 'browser']), ['browser', 'desktop'])
  // Claude-cli 自带视觉；Codex 不带视觉；OpenAI 需要 cfg.vision
  assert.equal(cat.supports(group('claude-cli'), 'browser'), true)
  assert.equal(cat.supports(group('codex-cli'), 'browser'), true)
  assert.equal(cat.supports(group('openai-api'), 'browser'), true)
  assert.equal(cat.supports(group('claude-cli'), 'desktop'), true)
  assert.equal(cat.supports(group('codex-cli'), 'desktop'), false)
  assert.equal(cat.supports(group('openai-api'), 'desktop'), false)
  assert.equal(cat.supports(group('openai-api', { vision: true }), 'desktop'), true)
  // guess() 用中文关键词
  assert.deepEqual(cat.guess('@frontend 打开网页看看首页'), ['browser'])
  assert.deepEqual(cat.guess('帮我在微信里发个消息'), ['desktop'])
  // spec() 环境展开 + args[0] 精确匹配 DESKTOP 绝对路径（path.resolve 归一化）
  assert.equal(cat.spec('desktop')?.args[0], DESKTOP)
  // safe 模式下 desktop 不提供
  const safe = new ToolCatalog({ autonomy: 'safe', tools: { discover: false } }, { workdir: tmp(), home })
  assert.equal(safe.get('desktop'), null)
  // 用户自定义工具：disable 浏览器、新加 mydb（使用 NIUMA_T 变量）
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
  // Legacy 兼容性标识符（门面输出）仍然是 niuma_browser / niuma_desktop
  assert.equal(bt.browser.server, LEGACY_COMPATIBILITY_IDENTIFIER.servers.niuma_browser)
  assert.equal(bt.desktop.server, LEGACY_COMPATIBILITY_IDENTIFIER.servers.niuma_desktop)
  assert.equal(bt.desktop.id, LEGACY_COMPATIBILITY_IDENTIFIER.ids.desktop)
  // 中文关键词 / 中文名 保留
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
  // 桌面定义保留 vision / takesOver
  assert.equal(bt.desktop.vision, true)
  assert.equal(bt.desktop.takesOver, true)
  // 未来中性核心定义：logical id browser / desktop-control，server vao_browser / vao_desktop
  const core = coreBuiltins()
  assert.equal(core[FUTURE_NEUTRAL.ids.browser].id, FUTURE_NEUTRAL.ids.browser)
  assert.equal(core[FUTURE_NEUTRAL.ids.browser].server, FUTURE_NEUTRAL.servers.vao_browser)
  assert.equal(core[FUTURE_NEUTRAL.ids.desktopControl].id, FUTURE_NEUTRAL.ids.desktopControl)
  assert.equal(core[FUTURE_NEUTRAL.ids.desktopControl].server, FUTURE_NEUTRAL.servers.vao_desktop)
  // 核心定义 readOnlySafe 都是显式 false (D2)
  assert.equal(core[FUTURE_NEUTRAL.ids.browser].readOnlySafe, false)
  assert.equal(core[FUTURE_NEUTRAL.ids.desktopControl].readOnlySafe, false)
})

test('Playwright MCP pinned version: no @latest anywhere; spec uses semver pin', () => {
  // D4：共享定义中不得出现 @latest；这条测试防回退
  const bt = builtinTools()
  // Cross-platform: locate the package semantically (never use positional index).
  // Windows playwrightNpx prefixes: cmd /c npx -y pkg ……
  // POSIX playwrightNpx prefixes: npx -y pkg ……
  // Find the ONLY arg starting with the package scope.
  const pkgCandidates = bt.browser.args.filter((a: unknown) => String(a).startsWith('@playwright/mcp@'))
  assert.equal(pkgCandidates.length, 1, `args must contain exactly one @playwright/mcp@ entry, got ${pkgCandidates.length}: ${JSON.stringify(bt.browser.args)}`)
  const pkg = String(pkgCandidates[0])
  assert.ok(!pkg.endsWith('@latest'), `browser package must not be floating @latest: ${pkg}`)
  assert.ok(pkg.startsWith('@playwright/mcp@'), `browser pkg must start with @playwright/mcp@: ${pkg}`)
  // 常量与 args 必须一致（单一来源）
  assert.equal(`@playwright/mcp@${PLAYWRIGHT_MCP_PINNED_VERSION}`, PLAYWRIGHT_MCP_PINNED_SPEC)
  assert.equal(pkg, PLAYWRIGHT_MCP_PINNED_SPEC)
  assert.ok(/^\d+\.\d+\.\d+$/.test(PLAYWRIGHT_MCP_PINNED_VERSION), `pinned version must be exact semver: ${PLAYWRIGHT_MCP_PINNED_VERSION}`)
  // 对整个 runtime 源码做二次 grep 防意外
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
  // 远程插件只在它安装的那个 cli 能用；本地插件 portable 可借给其它组
  assert.equal(cat.supports(group('claude-cli'), 'github'), true)
  assert.equal(cat.supports(group('codex-cli'), 'github'), false)
  assert.equal(cat.supports(group('openai-api'), 'notes'), true)
  // notes 在 Claude 和 Codex 都装了 → native 两者都
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
  assert.equal(describeMcpCall('niuma_desktop', 'click', { x: 3, y: 4, double: true }), '双击屏幕 (3, 4)')
  assert.equal(splitMcpName('mcp__niuma_browser__browser_navigate').server, 'niuma_browser')
  assert.equal(splitMcpName('mcp__niuma_browser__browser_navigate').tool, 'browser_navigate')
})

test('concept separation: ToolDefinition/ToolDiscovery/ToolGrant/ResolvedToolSpec exist as distinct exports', () => {
  // 概念分离的最低限度证据：每个概念都有独立符号、职责不混在一起
  const def = normalizeToolDefinition({ id: 'custom', name: 'C', command: 'node', args: ['c.js'], readOnlySafe: true, origin: { kind: 'builtin' } })
  assert.equal(def?.readOnlySafe, true)
  assert.equal(def?.id, 'custom')
  assert.equal(def?.origin?.kind, 'builtin')
  // ToolRegistry 单独可实例化、可 list/get/add；没有 discovery 逻辑
  const reg = new ToolRegistry({ aliases: { desktop: 'desktop-control' } })
  reg.add({ id: 'desktop-control', name: 'Desktop', server: 'vao_desktop', command: 'node', args: ['d.js'], vision: true, takesOver: true })
  assert.equal(reg.list().length, 1)
  assert.equal(reg.get('desktop-control')?.id, 'desktop-control')
  // 旧别名 desktop 能通过宿主提供的 aliases（不内置进共享包）被 registry.get 解析
  assert.equal(reg.get('desktop')?.id, 'desktop-control')
  // capabilitySupportsTool 单独函数，与 registry/catalog 解耦
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
