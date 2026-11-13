import assert from 'node:assert/strict'
import test from 'node:test'
import { createGovernanceFileReader } from '../governance-file-cache.mjs'

test('reuses a governance file until its modification time changes', () => {
  let mtimeMs = 1
  let reads = 0
  const fsModule = {
    statSync: () => ({ mtimeMs }),
    readFileSync: () => { reads += 1; return JSON.stringify({ reads }) },
  }
  const read = createGovernanceFileReader({ dir: 'unused', fsModule })

  assert.deepEqual(read('standup.json'), { reads: 1 })
  assert.deepEqual(read('standup.json'), { reads: 1 })
  assert.equal(reads, 1)

  mtimeMs = 2
  assert.deepEqual(read('standup.json'), { reads: 2 })
  assert.equal(reads, 2)
})
