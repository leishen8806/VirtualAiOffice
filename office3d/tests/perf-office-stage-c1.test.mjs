import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8')

test('PERF-OFFICE C1 independently guards person LOD thresholds and proxy toggle', () => {
  const start = source.indexOf('function syncR1PersonLod')
  const end = source.indexOf('function syncAllR1PersonLod', start)
  assert.ok(start >= 0 && end > start, 'person LOD function exists')
  const body = source.slice(start, end)
  assert.match(body, /R1_PERSON_LOD_REDUCE_M/)
  assert.match(body, /R1_PERSON_LOD_RESTORE_M/)
  assert.match(body, /distance\s*<=\s*R1_PERSON_LOD_REDUCE_M/)
  assert.match(body, /distance\s*<\s*R1_PERSON_LOD_RESTORE_M/)
  assert.match(body, /view\.lodProxy\.visible\s*=\s*!detailed/)
})
