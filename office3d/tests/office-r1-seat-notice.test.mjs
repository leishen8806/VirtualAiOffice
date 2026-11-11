import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const notice = app.slice(app.indexOf('function updateR1AutomaticSeats'), app.indexOf('function applyState'))

test('R1 automatic-seat notice stays compact, dismissible and starts its five-second timer after seat refresh', () => {
  assert.match(notice, /位新同事暂用自动座位/)
  assert.match(notice, /document\.createElement\('details'\)/)
  assert.match(notice, /aria-label', '关闭提示'/)
  assert.ok(notice.indexOf("officeV3.get('furniture3'); furniture.refresh()") < notice.indexOf('r1SeatNoticeTimer = setTimeout'), 'the timer must not expire before the refreshed scene can paint the notice')
  assert.match(notice, /requestAnimationFrame\(\(\) => \{[\s\S]+r1SeatNoticeTimer = setTimeout/, 'the hide timer must start on the first paint opportunity')
  assert.match(notice, /MutationObserver[\s\S]+classList\.contains\('done'\)/, 'the visible five seconds must start after the loading cover leaves')
})
