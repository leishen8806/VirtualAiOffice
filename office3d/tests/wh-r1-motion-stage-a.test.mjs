import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

test('MOTION stage A polygon distance handles separated, rotated, overlapping and degenerate shapes', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'wh-r1-motion-stage-a.mjs')
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, MOTION_TEST_ONLY: '1' }, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
