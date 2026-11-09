import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../merge.js', import.meta.url)), 'utf8')

test('PERF-OFFICE C2 independently guards equivalent-material merge keys', () => {
  assert.match(source, /function materialSignature\(mat\)/)
  const mergeStart = source.indexOf('export function mergeStatic')
  assert.ok(mergeStart >= 0)
  const body = source.slice(mergeStart)
  assert.match(body, /materialSignature\(mat\)/)
  assert.doesNotMatch(body, /\[mat\.uuid, signature\(o\.geometry\)/)
  assert.match(source, /mat\.map\?\.uuid/)
})
