import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../quality.js', import.meta.url), 'utf8')

test('low and medium variants do not duplicate full agent GLBs', () => {
  assert.match(source, /if \(q !== 'high' && o\.userData\.agentId\) continue/)
assert.match(source, /if\(q===tier\)apply\(q\)/)
})
