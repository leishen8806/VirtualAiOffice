import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('R1 overview uses a hysteresis band that keeps people visible without loading full GLBs', () => {
  assert.match(source, /R1_PERSON_LOD_RESTORE_M\s*=\s*6/)
  assert.match(source, /R1_PERSON_LOD_REDUCE_M\s*=\s*8/)
  assert.match(source, /lodProxy\.visible\s*=\s*!detailed/)
  assert.match(source, /mesh\.renderOrder\s*=\s*2/)
  assert.match(source, /v\.lodProxy\s*=\s*makeR1PersonProxy\(ch, v\.id\)/)
})
