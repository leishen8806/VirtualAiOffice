import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SCREEN_REFRESH_MS, screenFrame, screenSliceAt } from '../dr-campus-screen.mjs'

test('dispatch screen is deterministic, simulated and rate-bounded', () => {
  assert.deepEqual(screenFrame(2808, 4), screenFrame(2808, 4))
  assert.notDeepEqual(screenFrame(2808, 4), screenFrame(2808, 5))
  const frame = screenFrame(2808, 4)
  assert.equal(frame.watermark, '模拟数据 · 示意')
  assert.equal(frame.nodes.length, 5); assert.equal(frame.bars.length, 4); assert.equal(frame.links.length, 4)
  assert.equal(screenSliceAt(SCREEN_REFRESH_MS - 1), 0); assert.equal(screenSliceAt(SCREEN_REFRESH_MS), 1)
})

test('dispatch screen has no external data or unsafe runtime inputs', async () => {
  const source = await Promise.all(['../dr-campus-screen.mjs', '../dr-campus-interior.js'].map(file => readFile(new URL(file, import.meta.url), 'utf8')))
  assert.doesNotMatch(source.join('\n'), /fetch\s*\(|Math\.random|Date\.now|innerHTML|\b(?:buy|purchase|price|balance|wallet)\b|\b(?:address|customer|order|inventory)\b/i)
})