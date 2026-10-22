import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  announcementPanel,
  attendancePanel,
  milestonePanel,
  panelAccess,
  pendingPanel,
  selectWaitingPeople,
  standupPanel,
  visitorPanel,
  wrapAnnouncement,
} from '../foyer-panels.js'

const safe = (value) => {
  const text = JSON.stringify(value)
  assert.doesNotMatch(text, /undefined|NaN|Infinity/)
  assert.doesNotMatch(text, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/)
}

test('attendance follows duty state and separates paused and errors', () => {
  const agents = [{ status: 'idle' }, { status: 'running' }, { status: 'paused' }, { status: 'error' }]
  assert.deepEqual(attendancePanel({ at: '2026-10-20T08:00:00Z', world: { duty: { on: true } }, agents }), {
    empty: false, at: '2026-10-20T08:00:00Z', onDuty: true, on: 2, off: 0, paused: 1, error: 1,
    lines: ['在岗 2 人', '暂停 1 · 异常 1'],
  })
  assert.deepEqual(attendancePanel({ world: { duty: { on: false } }, agents }), {
    empty: false, at: '', onDuty: false, on: 0, off: 2, paused: 1, error: 1,
    lines: ['已下班 2 人', '暂停 1 · 异常 1'],
  })
  assert.equal(attendancePanel({ agents }).text, '出勤数据同步中')
  assert.equal(attendancePanel({ world: { duty: { on: true } } }).text, '出勤数据同步中')
  safe(attendancePanel({ world: { duty: { on: true } }, agents: [{ status: null }, { status: 'wat' }] }))
})

test('pending and standup panels use counts and safe short text only', () => {
  assert.deepEqual(pendingPanel({ waiting: [{ kind: 'question' }, { kind: 'review' }, { kind: 'question' }], pendingApprovals: 3 }).counts, { question: 2, review: 1, approval: 3 })
  assert.equal(pendingPanel({}).text, '当前没有待处理事项')
  const stand = standupPanel({ standup: { state: 'done', candidates: [{ outcome: 'DISPATCHED', title: '<secret>' }, { outcome: 'SKIPPED' }], dropped: ['x'], note: '<b>完成</b>\u0000' } })
  assert.deepEqual(stand.counts, { passed: 1, dropped: 2 })
  assert.equal(stand.note, '<b>完成</b>')
  assert.doesNotMatch(JSON.stringify(stand), /secret/)
  assert.equal(standupPanel({}).text, '今天还没有晨会结果')
  safe(pendingPanel({ waiting: null, pendingApprovals: NaN })); safe(standupPanel({ standup: { state: null, candidates: null, dropped: null, note: null } }))
})

test('milestones return a bounded safe summary or the fixed empty state', () => {
  const view = milestonePanel({ milestones: [{ name: '<项目>', percent: .5, next: { name: '闸门\u0000A', due: '2026-10-24T17:00:00+07:00' } }, { name: 'x'.repeat(300), percent: NaN, next: null }] })
  assert.equal(view.empty, false)
  assert.equal(view.items.length, 2)
  assert.deepEqual(view.items[0], { project: '<项目>', next: '闸门A', due: '2026-10-24', percent: 50 })
  assert.ok(view.items[1].project.length <= 48)
  assert.equal(view.items[1].percent, 0)
  assert.equal(milestonePanel({ milestones: null }).text, '尚未配置里程碑')
  safe(view)
})

test('announcement validates code points and wraps without leaking controls', () => {
  assert.equal(announcementPanel({ enabled: false }).text, '今天还没有公告')
  assert.equal(announcementPanel({ enabled: true, announcement: null }).text, '今天还没有公告')
  const emoji = '🙂'.repeat(120)
  assert.equal(announcementPanel({ announcement: { text: emoji } }).count, 120)
  assert.deepEqual(wrapAnnouncement('一二三四五六七八九十', 4, 2), ['一二三四', '五六七…'])
  const dirty = announcementPanel({ announcement: { text: '<b>公告</b>\u0000\n第二行' } })
  assert.equal(dirty.text, '<b>公告</b>\n第二行')
  assert.equal(announcementPanel({ announcement: { text: 'x'.repeat(121) } }).count, 120)
  safe(dirty)
})

test('visitor summary uses visits and Phnom Penh relative-time boundaries', () => {
  const now = Date.parse('2026-10-20T12:00:00+07:00')
  assert.equal(visitorPanel({ enabled: false, visitors: { lan: { visits: 9, lastAt: new Date(now).toISOString() } } }, now).text, '尚无访客记录')
  assert.equal(visitorPanel({ visitors: null }, now).text, '尚无访客记录')
  const foyer = { enabled: true, visitors: { lan: { visits: 2, lastAt: new Date(now - 20_000).toISOString() }, wall: { visits: 3, lastAt: new Date(now - 59 * 60_000).toISOString() } } }
  assert.deepEqual(visitorPanel(foyer, now).lines, ['局域网访问 2 次 · 刚刚', '大屏访问 3 次 · 59 分钟前'])
  assert.match(visitorPanel({ visitors: { lan: { visits: 1, lastAt: new Date(now - 3 * 3600_000).toISOString() } } }, now).lines[0], /3 小时前/)
  assert.match(visitorPanel({ visitors: { wall: { visits: 1, lastAt: new Date(now - 25 * 3600_000).toISOString() } } }, now).lines[0], /昨天/)
  safe(visitorPanel({ visitors: { lan: { visits: NaN, lastAt: '<x>' } } }, now))
})

test('waiting selection is real, deduplicated and capped by seats', () => {
  const waiting = [
    { kind: 'question', agentId: 'a', title: 'secret' }, { kind: 'review', agentId: 'b' },
    { kind: 'question', agentId: 'a' }, { kind: 'question', agentId: '' },
    { kind: 'question', agentId: 'c' }, { kind: 'question', agentId: 'd' }, { kind: 'question', agentId: 'e' },
  ]
  assert.deepEqual(selectWaitingPeople(waiting), ['a', 'c', 'd', 'e'])
  assert.deepEqual(selectWaitingPeople(waiting, 2), ['a', 'c'])
  assert.deepEqual(selectWaitingPeople(waiting, 0), [])
  assert.deepEqual(selectWaitingPeople([], 4), [])
  assert.deepEqual(selectWaitingPeople(null, NaN), [])
  assert.equal(pendingPanel({ waiting }).waitingText, '等候中 4 人')
})

test('panel access distinguishes local, LAN and wall modes', () => {
  assert.deepEqual(panelAccess('local'), { announce: true, handoff: true, taskPanel: true })
  assert.deepEqual(panelAccess('lan'), { announce: false, handoff: false, taskPanel: false })
  assert.deepEqual(panelAccess('wall'), { announce: false, handoff: false, taskPanel: false })
})

test('pure module and integration source keep the static safety contract', async () => {
  const pure = await readFile(new URL('../foyer-panels.js', import.meta.url), 'utf8')
  assert.doesNotMatch(pure, /innerHTML|fetch\s*\(|\beval\b|\bTHREE\b|\bdocument\b/)
  const all = pure.toLowerCase()
  assert.doesNotMatch(all, /\bbuy\b|\bpay\b|\bbalance\b|\bprice\b/)

  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const ui = await readFile(new URL('../ui.js', import.meta.url), 'utf8')
  assert.equal((app.match(/setInterval\(pollFoyer, 30_000\)/g) || []).length, 1)
  assert.equal((app.match(/setInterval\(pollMilestones, 30_000\)/g) || []).length, 1)
  assert.doesNotMatch(`${app}\n${ui}`, /innerHTML\s*=.*(?:announcement|foyerData|waitingText)/)
  assert.match(app, /selectWaitingPeople\(latestState\?\.waiting, WAITING_CAPACITY\)/)
  assert.match(app, /director\.visitConsumer\(v, plan, \{[\s\S]{0,180}mode: 'waiting'/)
})
