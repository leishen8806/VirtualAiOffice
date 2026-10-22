import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleRadar, rainLevel } from '../weather-radar.mjs'

test('附近两公里有雨，定位点无回波时不得显示本地下雨', () => {
  const png = { pixel: (x, y) => x === 98 && y === 98 ? [136, 221, 238, 255] : [0, 0, 0, 0] }
  const result = sampleRadar(png, 100, 100)
  assert.equal(result.level, 0); assert.ok(result.nearby > 0)
})
test('定位像素自身有回波才报告其强度，不升级到附近最强回波', () => {
  const png = { pixel: (x, y) => x === 100 && y === 100 ? [136, 221, 238, 255] : [255, 0, 0, 255] }
  assert.equal(sampleRadar(png, 100, 100).level, 2)
})
test('定位点无回波时，周边弱回波也不能推断本地毛毛雨', () => {
  const png = { pixel: (x, y) => x === 100 && y === 100 ? [0, 0, 0, 0] : [100, 150, 200, 100] }
  assert.equal(sampleRadar(png, 100, 100).level, 0)
})
test('瓦片边界不越界；全透明无雨，原强度分级保持', () => {
  const png = { pixel: (x, y) => { assert.ok(x >= 0 && y >= 0 && x <= 255 && y <= 255); return [0, 0, 0, 0] } }
  assert.deepEqual(sampleRadar(png, 0, 0), { level: 0, nearby: 0 })
  assert.equal(rainLevel([255, 0, 0, 255]), 5); assert.equal(rainLevel([100, 150, 200, 100]), 1)
})
