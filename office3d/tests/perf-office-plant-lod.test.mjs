import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../office-vis2/r1-tropical.js', import.meta.url), 'utf8')
test('low plant tier uses the reduced leaf counts without removing the plant rows', () => {
  assert.match(source, /const count=low\?3:12/)
  assert.match(source, /low\?3:11/)
  assert.match(source, /low\?3:8/)
})
