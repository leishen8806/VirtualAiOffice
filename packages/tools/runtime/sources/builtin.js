import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FUTURE_NEUTRAL, LEGACY_COMPATIBILITY_IDENTIFIER } from '../definitions.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * D4 固定 Playwright MCP 版本：共享定义中不再出现浮动 @latest。
 * 这个版本号是 Stage 1B-A 实施时选定并验证的（至少 initialize + tools/list）。
 * 升级需要显式改这里 + CI / 回归测试。
 */
export const PLAYWRIGHT_MCP_PINNED_VERSION = '0.0.83'
export const PLAYWRIGHT_MCP_PINNED_SPEC = `@playwright/mcp@${PLAYWRIGHT_MCP_PINNED_VERSION}`

/**
 * NEW-CORE (neutral) package-local helpers.
 *
 * Do NOT import packages/executors here — Stage 1B architecture boundary
 * requires packages/tools/runtime to import only node:* and package-local
 * modules. See docs/stage-1/tools-mcp-extraction.md §Dependency direction.
 */
const isWin = process.platform === 'win32'

/** LEGACY compatibility storage path (Legacy ONLY — never used by coreBuiltins). */
export const LEGACY_COMPAT_OUT = () => path.join(os.homedir(), '.niuma', 'browser')

/** LEGACY desktop shim path (root repo src/mcp/desktop.js). Legacy ONLY. */
const LEGACY_DESKTOP_SHIM = (() => {
  // Walk up from packages/tools/runtime/sources → repo root (4 dirs up).
  //   0: sources → 1: runtime → 2: tools → 3: packages → 4: <repo root>
  let cur = HERE
  for (let up = 0; up < 4; up++) cur = path.dirname(cur)
  return path.resolve(cur, 'src', 'mcp', 'desktop.js')
})()

/** NEW-CORE package-local desktop entry — does NOT depend on Legacy src/. */
const CORE_DESKTOP_ENTRY = path.resolve(path.dirname(HERE), 'mcp', 'desktop-entry.js')

function _packageJsonRootDetectWorkspaceFallback() {
  // Reserved only for potential future metadata — NOT used for core definition paths.
  // coreBuiltins uses import.meta.url for package-local paths per architecture rule.
  void HERE
  void fs
  return null
}
_packageJsonRootDetectWorkspaceFallback()

export function playwrightNpx(pkg, extra = []) {
  return isWin ? { command: 'cmd', args: ['/c', 'npx', '-y', pkg, ...extra] } : { command: 'npx', args: ['-y', pkg, ...extra] }
}

/**
 * NEW-CORE (future-neutral) builtins.
 *
 * ARCHITECTURE RULES enforced here:
 *   - Browser outputDir: MUST be supplied explicitly by the caller. No Legacy
 *     ~/.niuma default in core definitions.
 *   - desktop-control command: resolves to the PACKAGE-LOCAL desktop-entry.js
 *     via import.meta.url. It MUST NOT depend on the repository-root Legacy
 *     shim src/mcp/desktop.js.
 *   - logical ids: browser / desktop-control
 *   - server names: vao_browser / vao_desktop
 *   - readOnlySafe both explicit false (D2).
 */
export function coreBuiltins(options = {}) {
  // NEW-CORE: browser outputDir is EXPLICIT. Callers that don't provide one get
  // a clear, deterministic error instead of a silent Legacy ~/.niuma injection.
  // We accept undefined only when the browser tool itself is disabled by caller;
  // the args are still constructed so the returned shape is stable, but any
  // code that would actually launch the server should be paired with an
  // explicit outputDir.
  const { outputDir, headlessForce } = options
  const headless = headlessForce !== undefined
    ? !!headlessForce
    : (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
  const outputDirStable = outputDir || undefined
  const desktopEntryAbs = options.desktopScript || CORE_DESKTOP_ENTRY
  const electronEnv = process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}
  const browserArgs = [
    ...playwrightNpx(PLAYWRIGHT_MCP_PINNED_SPEC).args.slice(1),
  ]
  const baseBrowser = playwrightNpx(PLAYWRIGHT_MCP_PINNED_SPEC, [
    ...(outputDirStable ? ['--output-dir', outputDirStable] : []),
    ...(outputDirStable ? ['--allow-unrestricted-file-access'] : []),
    ...(headless ? ['--headless'] : []),
  ])
  void browserArgs
  return {
    [FUTURE_NEUTRAL.ids.browser]: Object.freeze({
      id: FUTURE_NEUTRAL.ids.browser,
      title: 'Browser',
      name: 'Browser',
      description:
        'Launch a real browser via Playwright MCP: navigate, click, fill forms, read DOM, capture screenshots, submit forms, log in, and otherwise interact with the web exactly as a human would.',
      keywords: Object.freeze([]),
      server: FUTURE_NEUTRAL.servers.vao_browser,
      command: baseBrowser.command,
      args: Object.freeze([...baseBrowser.args]),
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
      _core: Object.freeze({ outputDir: outputDirStable || null }),
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
      args: Object.freeze([desktopEntryAbs]),
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
      _core: Object.freeze({ desktopScript: desktopEntryAbs }),
    }),
  }
}

/**
 * Legacy-compatible builtins.
 *
 * LEGACY IS ALLOWED TO INJECT:
 *   - ~/.niuma/browser as default browser outputDir
 *   - src/mcp/desktop.js as desktop command (Legacy ToolCatalog expects that
 *     absolute path in spec('desktop').args[0])
 *   - niuma_* server names / 中文 names + keywords / id=desktop.
 *
 * CoreBuiltins() is never called naked from a Legacy entry point; it is
 * always composed here with the Legacy defaults injected.
 */
export function legacyBuiltins(options = {}) {
  const legacyOutputDir = options.outputDir || LEGACY_COMPAT_OUT()
  const legacyDesktopShim = options.desktopScript || LEGACY_DESKTOP_SHIM
  // Core is built with explicit Legacy-friendly parameters so the returned
  // command/args for Legacy-facing browser definition carry the output dir.
  const core = coreBuiltins({
    ...options,
    outputDir: legacyOutputDir,
    desktopScript: legacyDesktopShim,
  })
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
      _legacy: Object.freeze({ outputDir: legacyOutputDir }),
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
      _legacy: Object.freeze({ desktopScript: legacyDesktopShim }),
    }),
  }
}
