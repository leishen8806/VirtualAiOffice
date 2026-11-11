import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('server handles PM2 disconnect with bounded shutdown and EADDRINUSE logging', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(source, /process\.once\('disconnect', shutdown\)/)
  assert.match(source, /setTimeout\(\(\) => process\.exit\(0\), 4000\)/)
  assert.match(source, /EADDRINUSE: port/)
})
