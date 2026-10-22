import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { SCREEN_REFRESH_MS, screenFrame, screenSliceAt } from '../dr-campus-screen.mjs'
import { DISPATCH_SCREEN_STYLE } from '../dr-campus-interior.js'

test('dispatch screen is deterministic, simulated and rate-bounded', () => {
  assert.deepEqual(screenFrame(2808, 4), screenFrame(2808, 4))
  assert.notDeepEqual(screenFrame(2808, 4), screenFrame(2808, 5))
  const frame = screenFrame(2808, 4)
  assert.equal(frame.watermark, '模拟数据 · 示意')
  assert.ok(frame.nodes.length >= 7); assert.equal(frame.bars.length, 4); assert.equal(frame.links.length, frame.nodes.length - 1)
  assert.equal(frame.nodes.find(item => item.id === 'phnom-penh').name, '金边')
  assert.ok(frame.nodes.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && !/^SIM-/.test(item.id)))
  assert.deepEqual(frame.nodes.map(({ id, x, y }) => ({ id, x, y })), screenFrame(9999, 18).nodes.map(({ id, x, y }) => ({ id, x, y })))
  assert.equal(screenSliceAt(SCREEN_REFRESH_MS - 1), 0); assert.equal(screenSliceAt(SCREEN_REFRESH_MS), 1)
})

test('S2-11b dispatch screen uses the readable restrained blue and gold palette', () => {
  assert.deepEqual(DISPATCH_SCREEN_STYLE, {
    panel: '#24485c', mapFill: '#183847', outline: '#8fb4c1', outlineWidth: 4,
    route: '#b7d4e0', routeWidth: 3, label: '#f4f1eb', labelSize: 30,
    node: '#b7d4e0', phnomPenh: '#d5af62', phnomPenhRadius: 14, cityRadius: 7,
  })
})

test('dispatch screen has no external data or unsafe runtime inputs', async () => {
  const source = await Promise.all(['../dr-campus-screen.mjs', '../dr-campus-interior.js', '../dr-cambodia-outline.js'].map(file => readFile(new URL(file, import.meta.url), 'utf8')))
  assert.doesNotMatch(source.join('\n'), /fetch\s*\(|Math\.random|Date\.now|innerHTML|\b(?:buy|purchase|price|balance|wallet)\b|\b(?:address|customer|order|inventory)\b/i)
  assert.match(source.join('\n'), /Path2D\(CAMBODIA_OUTLINE_D\)/)
  assert.doesNotMatch(source.join('\n'), /office-/)
})
