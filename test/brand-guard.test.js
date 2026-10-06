import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')

test('public/index.html brand guard — does NOT contain visible legacy brand strings', () => {
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

test('public/index.html brand guard — DOES contain official brand strings', () => {
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

test('brand guard — legacy identifiers niuma/shaniu are allowed (compat tokens)', () => {
  const compatTokens = ['niuma-token', 'niuma.skin', 'shaniu', 'X-Niuma-Token', 'window.Niuma']
  for (const t of compatTokens) {
    assert.ok(t, 'legacy compat identifiers are intentionally allowed and must never be globally banned')
  }
})
