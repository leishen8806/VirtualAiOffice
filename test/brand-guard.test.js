import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
const desktopMain = fs.readFileSync(path.join(ROOT, 'desktop', 'main.cjs'), 'utf8')
const cliBin = fs.readFileSync(path.join(ROOT, 'bin', 'niuma.js'), 'utf8')

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
    '办公室协调器',
  ]
  for (const s of required) {
    assert.ok(
      indexHtml.includes(s),
      `public/index.html MUST contain official brand string: ${JSON.stringify(s)}`
    )
  }
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
