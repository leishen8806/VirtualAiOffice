import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, REGION_FOCUS, regionFocusOf } from '../office-layout.js'

const toolbarIds = ['product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'meet', 'board']
const v3Ids = [...toolbarIds, 'review', 'plan', 'plaza', 'foyer']
const inside = (point, rect) => point[0] >= rect.x0 && point[0] <= rect.x1 && point[2] >= rect.z0 && point[2] <= rect.z1

test('layout3 supplies all toolbar and wall focus ids from its own focus map', () => {
  for (const id of v3Ids) {
    const focus = regionFocusOf(LAYOUT_V3, id)
    assert.equal(focus, LAYOUT_V3.regionFocus[id], id)
    assert.ok(Number.isFinite(focus?.r) && focus.r > 0, id)
    assert.ok(inside(focus.t, LAYOUT_V3.site), `${id} target stays inside the V3 site`)
  }
  const plaza = regionFocusOf(LAYOUT_V3, 'plaza')
  assert.ok(Math.hypot(plaza.t[0] - LAYOUT_V3.plaza.center.x, plaza.t[2] - LAYOUT_V3.plaza.center.z) <= LAYOUT_V3.plaza.radius, 'plaza target stays inside the circular plaza')
})

test('layout3 maps meet to the review room focus for wall and toolbar camera use', () => {
  assert.deepEqual(LAYOUT_V3.regionFocus.meet, {
    label: '会议室',
    t: LAYOUT_V3.regionFocus.review.t,
    r: LAYOUT_V3.regionFocus.review.r,
  })
})

test('layout1 and layout2 preserve their pre-F1 focus choices', () => {
  for (const id of [...toolbarIds, 'review', 'plan', 'plaza']) {
    assert.equal(regionFocusOf(LAYOUT_V1, id), REGION_FOCUS[id], `V1 ${id}`)
    assert.equal(regionFocusOf(LAYOUT_V2, id), LAYOUT_V2.regionFocus[id] || REGION_FOCUS[id], `V2 ${id}`)
  }
})
