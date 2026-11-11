import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('R1 zone inspector has one accessible close path for button, Escape and blank scene clicks', () => {
  assert.match(app, /function closeOfficeR1Inspect\(\)/)
  assert.match(app, /aria-label="关闭区域卡片"[^>]+min-width:24px;min-height:24px/)
  assert.match(app, /office-r1-inspector-close[^\n]+addEventListener\('click', closeOfficeR1Inspect\)/)
  assert.match(app, /e\.key === 'Escape'[^\n]+closeOfficeR1Inspect\(\)/)
  assert.match(app, /else \{\s*closeOfficeR1Inspect\(\)/)
  assert.match(app, /getElementById\('office-r1-inspector-panel'\)/)
})
