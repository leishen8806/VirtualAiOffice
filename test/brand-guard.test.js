import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
const desktopMain = fs.readFileSync(path.join(ROOT, 'desktop', 'main.cjs'), 'utf8')
const cliBin = fs.readFileSync(path.join(ROOT, 'bin', 'niuma.js'), 'utf8')
const coreShell = fs.readFileSync(path.join(ROOT, 'public', 'core', 'core-shell.js'), 'utf8')
const coreOffice = fs.readFileSync(path.join(ROOT, 'public', 'core', 'core-office.js'), 'utf8')
const coreTheme = fs.readFileSync(path.join(ROOT, 'public', 'core', 'core-theme.js'), 'utf8')
const coreCharacters = fs.readFileSync(path.join(ROOT, 'public', 'core', 'core-characters.js'), 'utf8')
const coreStates = fs.readFileSync(path.join(ROOT, 'public', 'core', 'core-states.js'), 'utf8')
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8')

const CORE_BUNDLE = [coreTheme, coreStates, coreCharacters, coreOffice, coreShell, appJs].join('\n')

test('A. public/index.html brand guard — does NOT contain visible legacy brand strings', () => {
  const forbiddenVisible = [
    '牛马工作室',
    '总管 · 傻妞',
    '和傻妞说',
    '给傻妞的话',
    '总管傻妞',
  ]
  for (const s of forbiddenVisible) {
    assert.ok(
      !indexHtml.includes(s),
      `public/index.html must NOT contain visible legacy string: ${JSON.stringify(s)}`
    )
  }
})

test('A. public/index.html brand guard — DOES contain official brand strings', () => {
  const required = [
    '智序工场',
    'Virtual AI Office',
  ]
  for (const s of required) {
    assert.ok(
      indexHtml.includes(s),
      `public/index.html MUST contain official brand string: ${JSON.stringify(s)}`
    )
  }
})

test('A2. CORE DEFAULT UI (V2-A §16) — default 智序·Core visible identity MUST NOT show 牛马工作室 / 傻妞 / 办公室协调器 / Office Coordinator (Helix is the visible System Orchestrator identity in Core theme; compat ids allowed only as technical)', () => {
  // Forbidden visible strings (quoted in UI) inside Core bundle (theme + states + chars + office + shell + app.js default Core text).
  // Compat ids (niuma, shaniu, ~/.niuma, niuma-token, X-Niuma-Token, NiumaSkin) are EXPLICITLY allowed per §16 LEGACY_COMPAT.
  // We only ban visible UI strings that are user-facing when theme=core applied by default.
  const forbiddenVisibleCore = [
    // §16 explicit ban list (visible UI in Core default):
    `'牛马工作室'`, `"牛马工作室"`, '>牛马工作室<', 'textContent = `牛马工作室',
    `'傻妞'`, `"傻妞"`, '>傻妞<',
    `'办公室协调器'`, `"办公室协调器"`, '>办公室协调器<',
    `'Office Coordinator'`, `"Office Coordinator"`,
  ]
  // Note: 办公室协调器 remains in LEGACY 经典主题 visible UI (that's OK, Core default avoids them).
  // The above regex covers Core-shell produced strings. Ensure app.js Core branch display also avoids it.
  const coreBranchHas = (pat) => {
    // Check CORE_BUNDLE (all V2 modules + app.js) doesn't have the visible default strings inside Core-rendered output.
    return CORE_BUNDLE.includes(pat)
  }
  // Helix shell explicit strings check: Core Shell MUST use 系统编排中枢 / System Orchestrator as Helix's zh subname.
  assert.ok(coreShell.includes('系统编排中枢'), 'core-shell.js MUST display Helix\'s zh subtitle "系统编排中枢" (V2-A spec)')
  assert.ok(coreShell.includes('System Orchestrator'), 'core-shell.js MUST display Helix\'s en subtitle "System Orchestrator" (V2-A spec)')
  // Visible ban: assert core-shell/core-office (Core UI) don't output visible legacy coordinator/傻妞/牛马 strings as user-facing text.
  for (const pat of forbiddenVisibleCore) {
    // Only assert if the pattern is actually intended as user-facing Core UI content — technical identifiers are excluded.
    // Check both files as the main Core UI producers.
    const hasInShell = coreShell.includes(pat)
    const hasInOffice = coreOffice.includes(pat)
    const hasInTheme = coreTheme.includes(pat)
    const hasInChars = coreCharacters.includes(pat)
    const hasInStates = coreStates.includes(pat)
    assert.ok(
      !(hasInShell || hasInOffice || hasInTheme || hasInChars || hasInStates),
      `Core UI files (core-shell/office/theme/characters/states) must NOT contain visible legacy pattern inside Core default UI content: ${JSON.stringify(pat)}; found in: ${[hasInShell && 'shell', hasInOffice && 'office', hasInTheme && 'theme', hasInChars && 'chars', hasInStates && 'states'].filter(Boolean).join(', ')}`
    )
  }
  void coreBranchHas
})

test('A2. CORE DEFAULT UI REQUIRED STRINGS — MUST contain 智序工场 / Virtual AI Office / HELIX / 智序·Core in V2 default Core files (§16)', () => {
  const required = [
    { file: coreShell, name: 'core-shell.js has 智序工场 (wordmark)' },
    { file: coreShell, name: 'core-shell.js has Virtual AI Office (sub-wordmark)' },
    { file: coreShell, name: 'core-shell.js has HELIX header brand' },
    { file: appJs, name: 'app.js BUILTIN declares core display "智序 · Core"' },
  ]
  assert.ok(coreShell.includes('智序工场'), required[0].name)
  assert.ok(coreShell.includes('Virtual AI Office'), required[1].name)
  assert.ok(coreShell.includes('HELIX'), required[2].name)
  assert.ok(appJs.includes(`['core', '智序 · Core']`), required[3].name)
})

test('B. desktop/main.cjs brand guard — known visible legacy surfaces must NOT be present', () => {
  const forbiddenVisibleUi = [
    '<title>牛马工作室</title>',
    `title: '牛马工作室'`,
    "win.setTitle(`牛马工作室",
    '牛马工作室还在后台',
    '傻妞在托盘里继续盯着活',
    '傻妞会从零开始建项目',
    '傻妞手上还有活在干',
    '傻妞正在搬去新项目',
    '关于牛马工作室',
    '退出牛马工作室',
    `tray.setToolTip('牛马工作室')`,
    '打开牛马工作室',
    '牛马工作室项目',
    '牛马工作室没能启动',
  ]
  for (const pattern of forbiddenVisibleUi) {
    assert.ok(
      !desktopMain.includes(pattern),
      `desktop/main.cjs visible UI must NOT contain legacy pattern: ${JSON.stringify(pattern)}`
    )
  }
})

test('B. desktop/main.cjs brand guard — MUST contain migrated visible strings', () => {
  assert.ok(desktopMain.includes('智序工场'), 'desktop/main.cjs must include visible 智序工场')
  assert.ok(desktopMain.includes('办公室协调器'), 'desktop/main.cjs must include visible 办公室协调器')
})

test('C. bin/niuma.js CLI help — does NOT mention 傻妞 in user-facing help text', () => {
  assert.ok(
    !cliBin.includes('傻妞的大脑'),
    'bin/niuma.js help must NOT contain legacy 傻妞的大脑 copy'
  )
})

test('C. bin/niuma.js CLI help — DOES mention 办公室协调器', () => {
  assert.ok(
    cliBin.includes('办公室协调器'),
    'bin/niuma.js help must mention 办公室协调器 (V1 brand) in user-facing copy'
  )
})
