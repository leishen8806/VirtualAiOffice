import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const merge = readFileSync(fileURLToPath(new URL('../merge.js', import.meta.url)), 'utf8')
const quality = readFileSync(fileURLToPath(new URL('../quality.js', import.meta.url)), 'utf8')

test('PERF-OFFICE C2 merges equivalent opaque materials by visible signature', () => {
  assert.match(merge, /function materialSignature\(mat\)/)
  assert.match(merge, /materialSignature\(mat\)/)
  assert.doesNotMatch(merge, /const key = \[mat\.uuid, signature\(o\.geometry\)/)
})

test('PERF-OFFICE C3 caps high-tier character shadow agents and keeps low shadow maps off', () => {
  assert.match(quality, /HIGH_CHARACTER_SHADOW_AGENTS\s*=\s*2/)
  assert.match(quality, /renderer\.shadowMap\.enabled=q!==\'low\'/)
  assert.match(quality, /agentId\s*=\s*mesh\.userData\.agentId/)
  assert.match(quality, /mesh\.castShadow=q===\'high\'&&\(shadow\.cast&&!!mesh\.userData\.agentId\)/)
})
