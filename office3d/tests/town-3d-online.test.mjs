import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
const town = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')

test('3d town uses authenticated data routes instead of static json paths', () => {
  assert.match(town, /fetch\('\/town\/3d-data\/town-3d-data\.json'\)/)
  assert.match(town, /fetch\('\/town\/map'\)/)
  assert.doesNotMatch(town, /fetch\('\/town-map\.json'\)/)
})

test('3d data route keeps a fixed filename allowlist and method gate', () => {
  assert.match(server, /API_PATHS\.add\('\/town\/3d-data'\)/)
  assert.match(server, /const allowed = new Set\(\['town-3d-data\.json', 'pp-core\.json', 'pp-peripheral\.json', 'pp-riverfront\.json', 'pp-warehouse\.json'\]\)/)
  assert.match(server, /if \(!allowed\.has\(name\) \|\| name\.includes\('\/'\) \|\| name\.includes\('\\\\'\) \|\| name\.includes\('\.\.'\)\) return json\(404/)
  assert.match(server, /if \(req\.method !== 'GET'\) return json\(405/)
})
