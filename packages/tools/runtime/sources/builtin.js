import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FUTURE_NEUTRAL, LEGACY_COMPATIBILITY_IDENTIFIER } from '../definitions.js'
import { isWin } from '../../../executors/runtime/process.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * D4 固定 Playwright MCP 版本：共享定义中不再出现浮动 @latest。
 * 这个版本号是 Stage 1B-A 实施时选定并验证的（至少 initialize + tools/list）。
 * 升级需要显式改这里 + CI / 回归测试。
 */
export const PLAYWRIGHT_MCP_PINNED_VERSION = '1.49.0'
export const PLAYWRIGHT_MCP_PINNED_SPEC = `@playwright/mcp@${PLAYWRIGHT_MCP_PINNED_VERSION}`

export const LEGACY_COMPAT_OUT = () => path.join(os.homedir(), '.niuma', 'browser')

const _packageJsonCache = new Map()
function packageJson(dir) {
  if (!dir) return {}
  if (_packageJsonCache.has(dir)) return _packageJsonCache.get(dir)
  const p = path.join(dir, 'package.json')
  let o = {}
  try {
    o = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {}
  _packageJsonCache.set(dir, o)
  return o
}
function _rootFromHere() {
  let cur = HERE
  for (let up = 0; up < 6; up++) {
    const pkg = packageJson(cur)
    if (pkg?.workspaces?.includes('packages/*') && pkg?.name && fs.existsSync(path.join(cur, 'src'))) return cur
    cur = path.dirname(cur)
    if (!cur || cur === path.dirname(cur)) return path.resolve(HERE, '..', '..', '..', '..')
  }
  return cur
}
const ROOT = _rootFromHere()
const DESKTOP_SHIM_RELPATH = ['src', 'mcp', 'desktop.js']

export function playwrightNpx(pkg, extra = []) {
  return isWin ? { command: 'cmd', args: ['/c', 'npx', '-y', pkg, ...extra] } : { command: 'npx', args: ['-y', pkg, ...extra] }
}

/**
 * 未来中性的核心定义：logical id browser / desktop-control，server vao_browser / vao_desktop。
 * readOnlySafe 都显式 false (D2)。requires vision / takesOver / exclusive 在 desktop-control 上。
 */
export function coreBuiltins(options = {}) {
  const headless = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
  const outputDir = options.outputDir || LEGACY_COMPAT_OUT()
  const desktopScript = options.desktopScript || path.resolve(ROOT, ...DESKTOP_SHIM_RELPATH)
  const electronEnv = process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}
  return {
    [FUTURE_NEUTRAL.ids.browser]: Object.freeze({
      id: FUTURE_NEUTRAL.ids.browser,
      title: 'Browser',
      name: 'Browser',
      description:
        'Launch a real browser via Playwright MCP: navigate, click, fill forms, read DOM, capture screenshots, submit forms, log in, and otherwise interact with the web exactly as a human would.',
      keywords: Object.freeze([]),
      server: FUTURE_NEUTRAL.servers.vao_browser,
      ...playwrightNpx(PLAYWRIGHT_MCP_PINNED_SPEC, [
        '--output-dir',
        outputDir,
        '--allow-unrestricted-file-access',
        ...(headless ? ['--headless'] : []),
      ]),
      env: {},
      requires: Object.freeze([]),
      readOnlySafe: false,
      takesOver: false,
      exclusive: false,
      origin: Object.freeze({ kind: 'builtin' }),
      hostBound: Object.freeze([]),
      portable: true,
      vision: false,
      enabled: true,
      source: 'builtin',
    }),
    [FUTURE_NEUTRAL.ids.desktopControl]: Object.freeze({
      id: FUTURE_NEUTRAL.ids.desktopControl,
      title: 'Desktop Control',
      name: 'Desktop Control',
      description:
        'Look at screenshots of the host desktop, move the mouse, click, type, press keyboard shortcuts, and launch apps. Takes over the physical mouse and keyboard.',
      keywords: Object.freeze([]),
      server: FUTURE_NEUTRAL.servers.vao_desktop,
      command: process.execPath,
      args: Object.freeze([desktopScript]),
      env: Object.freeze(electronEnv),
      requires: Object.freeze(['vision']),
      readOnlySafe: false,
      takesOver: true,
      exclusive: true,
      origin: Object.freeze({ kind: 'builtin' }),
      hostBound: Object.freeze([]),
      portable: true,
      vision: true,
      enabled: true,
      source: 'builtin',
    }),
  }
}

/**
 * Legacy 兼容内置：注入中文 name/description/keywords、服务器名 niuma_browser / niuma_desktop、
 * 旧 logical id desktop（= LEGACY_COMPATIBILITY_IDENTIFIER.ids.desktop）。
 * 单事实来源：仍使用 PLAYWRIGHT_MCP_PINNED_SPEC（D4）。
 */
export function legacyBuiltins(options = {}) {
  const core = coreBuiltins(options)
  return {
    browser: Object.freeze({
      id: 'browser',
      name: '浏览器',
      description:
        '真的打开一个浏览器：打开网址、点按钮、填表单、读网页内容、截图。适合测试自己做的网页、在网站上查资料或办事、网页自动化。',
      keywords: Object.freeze(['浏览器', '网页', '网站', '网址', 'http', '打开网', '点击', '表单', '登录', '截图', '爬', 'browser']),
      server: LEGACY_COMPATIBILITY_IDENTIFIER.servers.niuma_browser,
      command: core[FUTURE_NEUTRAL.ids.browser].command,
      args: Object.freeze([...core[FUTURE_NEUTRAL.ids.browser].args]),
      env: Object.freeze({}),
      native: Object.freeze([]),
      types: Object.freeze(['claude-cli', 'codex-cli', 'openai-api']),
      vision: false,
      takesOver: false,
      enabled: true,
      source: 'builtin',
    }),
    [LEGACY_COMPATIBILITY_IDENTIFIER.ids.desktop]: Object.freeze({
      id: LEGACY_COMPATIBILITY_IDENTIFIER.ids.desktop,
      name: '电脑操作',
      description:
        '看电脑屏幕截图、移动鼠标、点击、打字、按快捷键、打开软件。适合操作没有命令行的桌面软件（办公软件、聊天软件、设计软件等）。会接管主人的鼠标键盘，能用命令行或浏览器解决的就不要用它。',
      keywords: Object.freeze(['桌面', '电脑', '屏幕', '鼠标', '键盘', '软件', '微信', 'excel', 'word', 'ppt', '剪映', 'photoshop', '记事本', '窗口']),
      server: LEGACY_COMPATIBILITY_IDENTIFIER.servers.niuma_desktop,
      command: core[FUTURE_NEUTRAL.ids.desktopControl].command,
      args: Object.freeze([...core[FUTURE_NEUTRAL.ids.desktopControl].args]),
      env: Object.freeze({ ...core[FUTURE_NEUTRAL.ids.desktopControl].env }),
      native: Object.freeze([]),
      types: Object.freeze(['claude-cli', 'codex-cli', 'openai-api']),
      vision: true,
      takesOver: true,
      enabled: true,
      source: 'builtin',
    }),
  }
}
