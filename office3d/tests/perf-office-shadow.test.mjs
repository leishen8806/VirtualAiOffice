import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../assets3d.js', import.meta.url), 'utf8')

test('static plant foliage never casts a shadow in the office quality path', () => {
  assert.match(source, /const plant\s*=\s*\/plant\|foliage\|leaf\|crown\/i.test/)
  assert.match(source, /o\.castShadow\s*=\s*!plant/)
})

const quality = fs.readFileSync(new URL('../quality.js', import.meta.url), 'utf8')
test('high quality keeps shadows for dynamic characters only', () => {
  assert.match(quality, /mesh\.castShadow=q==='high'&&\(shadow\.cast&&!!mesh\.userData\.agentId\)/)
})
