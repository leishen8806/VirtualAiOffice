import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const current = readFileSync(new URL('../env.js', import.meta.url), 'utf8')
const before = readFileSync(new URL('../../office3d-backup-s2-1/env.js', import.meta.url), 'utf8')
const count = (source, pattern) => [...source.matchAll(pattern)].length

test('the three campus palms are removed only after palm generation', () => {
  const loop = current.slice(current.indexOf('for (const [x, z] of [[-28, 18]'), current.indexOf('// 远处地平线'))
  assert.match(loop, /const tree = palm\(x \+ rnd\(\), z \+ rnd\(\), 8 \+ rnd\(\) \* 4\)/)
  assert.match(loop, /\[-46, -12, 12\]\.includes\(x\)/)
  assert.match(loop, /scene\.remove\(tree\)/)
})

test('the palm and random-call sequences are unchanged', () => {
  assert.equal(count(current, /\bpalm\s*\(/g), count(before, /\bpalm\s*\(/g))
  assert.equal(count(current, /\brnd\s*\(/g), count(before, /\brnd\s*\(/g))
})

test('env change is one condition line and introduces no unsafe APIs', () => {
  const oldLines = before.split(/\r?\n/), newLines = current.split(/\r?\n/)
  const changed = newLines.map((line, i) => ({ before: oldLines[i], after: line })).filter(row => row.before !== row.after)
  assert.equal(changed.length, 1)
  assert.match(changed[0].before, /\[-12, 12\]/)
  assert.match(changed[0].after, /\[-46, -12, 12\]/)
  for (const pattern of [/Math\.random\s*\(/g, /\bfetch\s*\(/g, /\.innerHTML\b/g]) assert.equal(count(current, pattern), count(before, pattern))
})
