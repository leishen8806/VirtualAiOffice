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

// §16 LEGACY_COMPAT allowlist (must remain untouched):
const COMPAT_ALLOWLIST = ['niuma', 'shaniu', 'NiumaSkin', '~/.niuma', 'niuma-token']

test('A. public/index.html brand guard — does NOT contain visible legacy brand strings', () => {
  const forbiddenVisible = [
    '牛马工作室',
    '总管 · 傻妞',
    '和傻妞说',
    '给傻妞的话',
    '总管傻妞',
    '办公室协调器',
    'Office Coordinator',
  ]
  for (const s of forbiddenVisible) {
    assert.ok(
      !indexHtml.includes(s),
      `public/index.html must NOT contain visible legacy string: ${JSON.stringify(s)}`
    )
  }
})

test('A. public/index.html brand guard — DOES contain official brand strings (Helix visible orchestrator identity, per Fix 5)', () => {
  const required = [
    '智序工场',
    'Virtual AI Office',
    'Helix',
  ]
  for (const s of required) {
    assert.ok(
      indexHtml.includes(s),
      `public/index.html MUST contain official brand string: ${JSON.stringify(s)}`
    )
  }
})

test('A1. public/index.html Fix 6 — NO Google Fonts / remote font loading', () => {
  assert.ok(!indexHtml.includes('fonts.googleapis.com'), 'public/index.html must NOT load fonts.googleapis.com')
  assert.ok(!indexHtml.includes('fonts.gstatic.com'), 'public/index.html must NOT load fonts.gstatic.com')
  assert.ok(!indexHtml.includes('Google Fonts'), 'public/index.html must NOT reference Google Fonts')
  assert.ok(!indexHtml.includes('Silkscreen'), 'public/index.html must NOT load Silkscreen font')
  assert.ok(!indexHtml.includes('JetBrains Mono'), 'public/index.html must NOT load JetBrains Mono font externally')
  assert.ok(!indexHtml.includes('ZCOOL KuaiLe'), 'public/index.html must NOT load ZCOOL KuaiLe font externally')
})

test('A2. CORE DEFAULT UI (V2-A §16 / Fix 10 touched files) — default 智序·Core visible identity MUST NOT show 牛马工作室 / 傻妞 / 办公室协调器 / Office Coordinator (Helix is visible System Orchestrator; compat ids allowed only as technical)', () => {
  const ALL_TOUCHED_CORE = [
    { name: 'index.html', src: indexHtml },
    { name: 'app.js', src: appJs },
    { name: 'core-shell.js', src: coreShell },
    { name: 'core-office.js', src: coreOffice },
    { name: 'core-theme.js', src: coreTheme },
    { name: 'core-characters.js', src: coreCharacters },
    { name: 'core-states.js', src: coreStates },
    { name: 'bin/niuma.js', src: cliBin },
  ]
  const forbiddenVisible = ['牛马工作室', '傻妞', '办公室协调器', 'Office Coordinator']
  for (const { name, src } of ALL_TOUCHED_CORE) {
    // Strip comments explicitly describing Legacy (those are allowed per Fix 10 rule).
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
    // Strip compat-id allowlist so we don't false-positive ban them (per §16 LEGACY_COMPAT allowlist untouched, allowlist COMPAT_ALLOWLIST).
    const allowlistStrip = (s) => s.split(/[\s\-.'":`{}()[\]=,;]/g).filter((tok) => !COMPAT_ALLOWLIST.includes(tok)).join(' ')
    const clean = allowlistStrip(stripComments(src))
    for (const tok of forbiddenVisible) {
      assert.ok(
        !clean.includes(tok),
        `Touched file ${name} must NOT contain visible legacy string ${JSON.stringify(tok)} in non-comment, non-compat-id code/user-facing copy`
      )
    }
  }
  void CORE_BUNDLE
  assert.ok(coreShell.includes('系统编排中枢'), 'core-shell.js MUST display Helix zh subtitle "系统编排中枢" (V2-A spec)')
  assert.ok(coreShell.includes('System Orchestrator'), 'core-shell.js MUST display Helix en subtitle "System Orchestrator" (V2-A spec)')
})

test('A2b. CORE DEFAULT UI REQUIRED STRINGS (Fix 5 + §16) — MUST contain 智序工场 / Virtual AI Office / HELIX / 智序·Core in V2 default Core files', () => {
  assert.ok(coreShell.includes('智序工场'), 'core-shell.js must have 智序工场 (wordmark)')
  assert.ok(coreShell.includes('Virtual AI Office'), 'core-shell.js must have Virtual AI Office (sub-wordmark)')
  assert.ok(coreShell.includes('HELIX'), 'core-shell.js must have HELIX header brand')
  assert.ok(appJs.includes(`['core', '智序 · Core']`), 'app.js BUILTIN must declare core display "智序 · Core"')
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
  assert.ok(desktopMain.includes('办公室协调器'), 'desktop/main.cjs must include visible 办公室协调器 (NOT in V2-A scope to migrate desktop; unchanged per forbidden scope)')
})

test('C. bin/niuma.js CLI help — does NOT mention 傻妞 in user-facing help text', () => {
  assert.ok(
    !cliBin.includes('傻妞的大脑'),
    'bin/niuma.js help must NOT contain legacy 傻妞的大脑 copy'
  )
})

test('C. bin/niuma.js CLI (Fix 7 + Fix 10) — DOES mention Helix brand, NO 办公室协调器 visible brand text', () => {
  // --brain flag still works, but its user-facing description now uses Helix
  assert.ok(cliBin.includes('--brain'), 'bin/niuma.js must preserve --brain compat flag')
  assert.ok(cliBin.includes('Helix'), 'bin/niuma.js user-facing copy MUST use Helix brand')
  assert.ok(cliBin.includes('智序工场 · Helix'), 'bin/niuma.js banner MUST print 智序工场 · Helix (per Fix 7 rehearsal banner rule)')
  // Comments and compat ids (niuma, shaniu) remain untouched by spec
})
