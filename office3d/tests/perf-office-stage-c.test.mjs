import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const app = readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8')
const merge = readFileSync(fileURLToPath(new URL('../merge.js', import.meta.url)), 'utf8')
const quality = readFileSync(fileURLToPath(new URL('../quality.js', import.meta.url)), 'utf8')

test('PERF-OFFICE C1 uses 12/15m hysteresis and a quality-excluded person proxy', () => {
  assert.match(app, /R1_PERSON_LOD_RESTORE_M\s*=\s*12/)
  assert.match(app, /R1_PERSON_LOD_REDUCE_M\s*=\s*15/)
  assert.match(app, /userData\.qualityProxy\s*=\s*true/)
  assert.match(app, /r1PersonDetailed/)
})

test('PERF-OFFICE C1b builds a per-person colored low-poly proxy', () => {
  assert.match(app, /function makeR1PersonProxy\(ch, agentId\)/)
  assert.match(app, /vertexColors:\s*true/)
  assert.match(app, /slice\(0, 24\)/)
  assert.match(app, /r1-person-proxy-mesh/)
  assert.doesNotMatch(app, /new THREE\.CylinderGeometry\(0\.2, 0\.24, 1\.55, 8\)/)
})

test('PERF-OFFICE C1c keeps overview decorations in high and medium tiers', () => {
  const registry = readFileSync(fileURLToPath(new URL('../office-v2-registry.js', import.meta.url)), 'utf8')
  assert.match(registry, /lowTier\s*=\s*quality\?\.tier\s*===\s*'low'/)
  assert.match(registry, /far\s*=\s*lowTier\s*\?\s*0\s*:\s*Infinity/)
  assert.match(registry, /near\s*=\s*lowTier\s*\?\s*0\s*:\s*Infinity/)
})

test('PERF-OFFICE C2 merges equivalent opaque materials by visible signature', () => {
  assert.match(merge, /function materialSignature\(mat\)/)
  assert.match(merge, /materialSignature\(mat\)/)
  assert.doesNotMatch(merge, /const key = \[mat\.uuid, signature\(o\.geometry\)/)
})

test('PERF-OFFICE C3 caps high-tier character shadow agents and keeps low shadow maps off', () => {
  assert.match(quality, /HIGH_CHARACTER_SHADOW_AGENTS\s*=\s*2/)
  assert.match(quality, /renderer\.shadowMap\.enabled=q!==\'low\'/)
  assert.match(quality, /agentId\s*=\s*mesh\.userData\.agentId/)
  assert.match(quality, /largeStatic:!o\.userData\.agentId/)
  assert.match(quality, /shadow\.largeStatic/)
})
