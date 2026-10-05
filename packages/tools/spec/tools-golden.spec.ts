import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ToolCatalog,
  builtinTools,
  claudeServers,
  codexServers,
  parseKeys,
  winVk,
  describeMcpCall,
  splitMcpName,
  createDesktopServer,
  desktopToolsList,
} from '../runtime/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vao-tools-'))
const group = (type: string, cfg: Record<string, any> = {}) => ({ type, cfg })

test('@vao/tools: ToolCatalog 7-method freeze (list/get/resolve/supports/guess/spec/constructor)', () => {
  const home = tmp()
  const cat = new ToolCatalog({ tools: { discover: false } }, { workdir: tmp(), home })
  const ids = cat.list().map((t) => t.id)
  assert.deepEqual(ids, ['browser', 'desktop'], JSON.stringify(ids))
  const browser = cat.get('browser')
  assert.ok(browser)
  assert.equal(browser?.server, 'niuma_browser')
  assert.equal(browser?.source, 'builtin')
  assert.equal(cat.get('no-such'), null)
  assert.deepEqual(cat.resolve(['浏览器', 'niuma_desktop', 'nope', 'browser']), ['browser', 'desktop'])
  assert.deepEqual(cat.guess('@frontend 打开网页看看首页'), ['browser'])
  assert.deepEqual(cat.guess('帮我在微信里发个消息'), ['desktop'])
  assert.equal(cat.supports(group('claude-cli'), 'browser'), true)
  assert.equal(cat.supports(group('codex-cli'), 'browser'), true)
  assert.equal(cat.supports(group('openai-api'), 'browser'), true)
  assert.equal(cat.supports(group('claude-cli'), 'desktop'), true)
  assert.equal(cat.supports(group('openai-api'), 'desktop'), false)
  assert.equal(cat.supports(group('openai-api', { vision: true }), 'desktop'), true)
  assert.equal(cat.supports(group('codex-cli'), 'desktop'), false)
  const DESKTOP = path.join(root, 'src', 'mcp', 'desktop.js')
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
  delete process.env.NIUMA_T
})

test('@vao/tools: builtins freeze (browser/desktop keywords, server names, vision/takesOver)', () => {
  const bt = builtinTools()
  assert.ok(bt.browser)
  assert.ok(bt.desktop)
  assert.ok(bt.browser.keywords.includes('browser'))
  assert.ok(bt.browser.keywords.includes('截图'))
  assert.ok(bt.desktop.keywords.includes('微信'))
  assert.ok(bt.desktop.keywords.includes('窗口'))
  assert.equal(bt.browser.server, 'niuma_browser')
  assert.equal(bt.desktop.server, 'niuma_desktop')
  assert.equal(bt.desktop.vision, true)
  assert.equal(bt.desktop.takesOver, true)
  const DESKTOP = path.join(root, 'src', 'mcp', 'desktop.js')
  assert.equal(bt.desktop.args?.[0], DESKTOP)
  assert.equal(typeof bt.browser.command, 'string')
})

test('@vao/tools: Claude and Codex MCP discovery freeze', () => {
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
    `model = "gpt-5"\n\n[mcp_servers.notes]\ncommand = "node"\nargs = ["notes.js"]\n\n[mcp_servers.search]\ncommand = "npx"\nargs = ["-y", "search-mcp"] # web search\n\n[mcp_servers.search.env]\nAPI_KEY = "k1"\n\n[profiles.x]\nmodel = "o3"\n`,
  )
  assert.deepEqual(codexServers(path.join(home, '.codex')).search, { command: 'npx', args: ['-y', 'search-mcp'], env: { API_KEY: 'k1' } })
  const cat = new ToolCatalog({}, { workdir: work, home })
  const ids = cat.list().map((t) => t.id)
  assert.ok(['github', 'notes', 'local_db', 'search'].every((id) => ids.includes(id)), ids.join(','))
  assert.equal(cat.supports(group('claude-cli'), 'github'), true)
  assert.equal(cat.supports(group('codex-cli'), 'github'), false)
  assert.equal(cat.supports(group('openai-api'), 'notes'), true)
  assert.deepEqual(cat.get('notes')?.native.slice().sort(), ['claude-cli', 'codex-cli'])
  assert.deepEqual(cat.get('search')?.native, ['codex-cli'])
})

test('@vao/tools: key name parser / windows vk freeze', () => {
  assert.deepEqual(parseKeys('Ctrl+Shift+T'), { mods: ['ctrl', 'shift'], key: 't' })
  assert.deepEqual(parseKeys('command + return'), { mods: ['cmd'], key: 'enter' })
  assert.throws(() => parseKeys('a+b'), /一次只能按一个主键/)
  assert.equal(winVk('s'), 0x53)
  assert.equal(winVk('f5'), 0x74)
  assert.equal(winVk('enter'), 0x0d)
})

test('@vao/tools: mcp format helpers freeze', () => {
  assert.deepEqual(splitMcpName('mcp__niuma_browser__browser_navigate'), { server: 'niuma_browser', tool: 'browser_navigate' })
  assert.equal(describeMcpCall('niuma_desktop', 'click', { x: 3, y: 4, double: true }), '双击屏幕 (3, 4)')
  assert.equal(describeMcpCall('other', 'run', {}), '用插件 other.run')
})

test('@vao/tools: desktop MCP server protocol freeze (initialize, tools/list, tools/call missing)', async () => {
  const server = await createDesktopServer({ platformOpts: { envPlatform: 'plan9' } })
  const writes: any[] = []
  const writeJson = (obj: any) => writes.push(obj)
  await server.handle(writeJson, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
  assert.equal(writes.length, 1)
  const init = writes.pop()
  assert.equal(init.result.protocolVersion, '2025-06-18')
  assert.equal(init.result.capabilities.tools && Object.keys(init.result.capabilities).includes('tools'), true)
  assert.equal(init.result.serverInfo.name, 'niuma-desktop')
  await server.handle(writeJson, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
  assert.equal(writes.length, 1)
  const list = writes.pop()
  assert.deepEqual(list.result.tools.map((t: any) => t.name), ['screenshot', 'click', 'move', 'drag', 'scroll', 'type', 'key', 'open', 'wait'])
  const names = desktopToolsList().map((t) => t.name)
  assert.deepEqual(names, list.result.tools.map((t: any) => t.name))
  await server.handle(writeJson, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'click', arguments: { x: 1, y: 2 } } })
  const click = writes.pop()
  assert.equal(click.result.isError, true)
  assert.match(String(click.result.content[0]?.text), /暂不支持这个系统：plan9/)
  await server.handle(writeJson, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } })
  const nope = writes.pop()
  assert.equal(nope?.error?.code, -32602)
  assert.match(String(nope?.error?.message), /没有叫 nope/)
})

test('@vao/tools: desktop mcp stdio executable starts, initialize + tools/list via child', async (t) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const script = path.join(root, 'src', 'mcp', 'desktop.js')
  const child = spawn(process.execPath, [script], { env: { ...process.env, NIUMA_DESKTOP_PLATFORM: 'plan9' }, stdio: ['pipe', 'pipe', 'ignore'] })
  t.after(() => { try { child.kill('SIGKILL') } catch {} })
  let buf = ''
  const replies: any[] = []
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 10000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        replies.push(JSON.parse(line))
        if (replies.length >= 2) {
          clearTimeout(timer)
          resolve()
        }
      }
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n')
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
  })
  assert.equal(replies.length, 2)
  assert.equal(replies[0]?.id, 1)
  assert.equal(replies[0]?.result?.serverInfo?.name, 'niuma-desktop')
  assert.equal(replies[1]?.id, 2)
  assert.deepEqual(replies[1]?.result?.tools?.map((x: any) => x.name), desktopToolsList().map((t) => t.name))
})
