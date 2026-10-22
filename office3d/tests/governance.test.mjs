import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGovernance } from '../governance.mjs'

const vote = (v, why = '') => ({ v, why })
const batch = (extra = {}) => ({ id: 'b1', createdAt: '2026-10-10T01:00:00Z', tallyAt: '2026-10-10T02:00:00Z', state: 'done', items: [{ ident: 'CMP-1', title: 'Safe item', voters: ['PM', 'UIUX'], votes: { PM: vote('APPROVE', 'ok'), UIUX: vote('MISSING') }, ...extra }] })

test('empty and old formats are safe', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), standup: {}, committee: {}, acceptance: {} })
  assert.deepEqual(out.timeline, [])
  assert.equal(out.summary.total, 0)
  const old = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), committee: { batches: [{ id: 'old', state: 'void', items: [{ title: '<script>alert(1)</script>' }] }] } })
  assert.equal(old.timeline[0].outcome, 'VOID')
  assert.match(old.timeline[0].items[0].title, /<script>/)
})

test('counts missing and escalation rates without throwing on omitted fields', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), currentMembers: ['Lead', 'PM'], committee: { batches: [batch({ voters: ['PM', 'UIUX', 'SecurityReviewer'], votes: { PM: vote('ESCALATE', 'needs review'), UIUX: vote('CHANGES') } })] } })
  assert.deepEqual(out.members.slice(0, 2).map((x) => [x.name, x.status]), [['Lead', '现任'], ['PM', '现任']])
  const pm = out.members.find((x) => x.name === 'PM')
  const sec = out.members.find((x) => x.name === 'SecurityReviewer')
  assert.equal(pm.escalateRate, 1)
  assert.equal(sec.missingRate, 1)
  assert.equal(out.members.find((x) => x.name === 'UIUX').status, '已卸任')
  assert.equal(out.summary.noVotes, 0)
})

test('keeps zero-vote current members first and marks historical members retired', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), currentMembers: ['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'], committee: { batches: [batch({ voters: ['UIUX'], votes: { UIUX: vote('APPROVE') } })] } })
  assert.deepEqual(out.members.slice(0, 5).map((x) => x.name), ['Lead', 'PM', 'Architect', 'Backend2', 'Frontend2'])
  assert.deepEqual(out.members.slice(0, 5).map((x) => [x.active, x.votes]), [[true, 0], [true, 0], [true, 0], [true, 0], [true, 0]])
  assert.equal(out.members.find((x) => x.name === 'UIUX').active, false)
  assert.equal(out.members.find((x) => x.name === 'UIUX').status, '已卸任')
})

test('filters by days, counts void and no-vote batches, and computes duration', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), days: 30, standup: { days: [{ id: 'new', state: 'void', createdAt: '2026-10-17T01:00:00Z', tallyAt: '2026-10-17T02:00:00Z', items: [] }, { id: 'old', createdAt: '2026-08-01T00:00:00Z', items: [] }] } })
  assert.equal(out.summary.void, 1)
  assert.equal(out.summary.noVotes, 1)
  assert.equal(out.summary.averageMinutes, 60)
  assert.deepEqual(out.timeline.map((x) => x.id), ['new'])
})

test('rework section: groups capped / warned / info and keeps existing output', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), rework: { enabled: true, corrupt: false, thresholds: { capRound: 3, warnRound: 2 }, lastAt: '2026-10-18T01:00:00Z', tasks: [{ issueId: 'is-a', ident: 'CMP-1', title: '超限任务', rounds: 3, openItems: 2, capped: true, warned: false, sentAt: '2026-10-18T01:00:00Z', formatIssues: [] }, { issueId: 'is-b', ident: 'CMP-2', title: '预警任务', rounds: 2, openItems: 1, capped: false, warned: true, sentAt: null, formatIssues: [] }, { issueId: 'is-c', ident: 'CMP-3', title: '格式不全', rounds: 1, openItems: 0, capped: false, warned: false, formatIssues: ['缺「对应 AC」'] }] } })
  assert.equal(out.rework.cappedCount, 1)
  assert.equal(out.rework.warnCount, 1)
  assert.deepEqual(out.rework.capped.map((x) => x.ident), ['CMP-1'])
  assert.deepEqual(out.rework.warned.map((x) => x.ident), ['CMP-2'])
  assert.deepEqual(out.rework.info.map((x) => x.ident), ['CMP-3'])
  assert.equal(out.rework.capped[0].formatIssues.length, 0)
  assert.equal(out.rework.info[0].formatIssues[0], '缺「对应 AC」')
  assert.equal(out.summary.total, 0, '既有输出不变')
})

test('version section (T15): passes through enabled / corrupt / recent checks and keeps existing output', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), version: { enabled: true, corrupt: false, recent: [
    { issueId: 'is-a', ident: 'CMP-1', title: '一致任务', result: '版本一致', note: '', evAt: '2026-10-18T01:00:00Z' },
    { issueId: 'is-b', ident: 'CMP-2', title: '已变任务', result: '版本已变', note: '之后新增 1 个提交、改了 2 个文件：a.txt、b.txt', evAt: '2026-10-18T01:00:00Z' },
    { issueId: 'is-c', ident: 'CMP-3', title: '<script>alert(1)</script>', result: '证据缺版本（无法核对）', note: '', evAt: null },
  ] } })
  assert.equal(out.version.enabled, true)
  assert.equal(out.version.corrupt, false)
  assert.deepEqual(out.version.recent.map((x) => x.ident), ['CMP-1', 'CMP-2', 'CMP-3'])
  assert.equal(out.version.recent[0].result, '版本一致')
  assert.equal(out.version.recent[1].note.startsWith('之后新增 1 个提交'), true)
  assert.equal(out.version.recent[2].evAt, null)
  assert.equal(out.summary.total, 0, '既有输出不变')
  // 不传 version 也不报错、分区为空
  const bare = buildGovernance({ now: new Date('2026-10-18T00:00:00Z') })
  assert.deepEqual(bare.version, { enabled: false, corrupt: false, recent: [] })
})

test('handoff section (T14): missing first / forwarded / stale / records and keeps existing output', () => {
  const out = buildGovernance({ now: new Date('2026-10-18T00:00:00Z'), handoff: {
    enabled: true, corrupt: false, lastAt: '2026-10-18T01:00:00Z', nextAt: '2026-10-18T01:30:00Z',
    missingCount: 1, forwardedCount: 1,
    items: [
      { issueId: 'is-a', ident: 'CMP-1', title: '缺交接包任务', status: 'blocked', owner: '前端', ownerId: 12, money: false, triggers: [{ type: 'blocked', label: '转阻塞', at: '2026-10-18T01:00:00Z', detail: '任务刚进入阻塞' }], handoff: { has: true, complete: false, missing: ['已完成', '下一步'], version: 'a1b2', at: '2026-10-18T01:00:00Z' }, stale: false, remindedAt: null, notifiedAt: null, forwardedAt: null, handedFrom: null, parsedAt: '2026-10-18T01:00:00Z' },
      { issueId: 'is-b', ident: 'CMP-2', title: '<script>alert(1)</script>', status: 'todo', owner: '后端', ownerId: 13, money: true, triggers: [{ type: 'handed', label: '换人', at: '2026-10-18T01:00:00Z', detail: '任务换了负责人' }], handoff: { has: true, complete: true, missing: [], version: 'a1b2', at: '2026-10-18T01:00:00Z' }, stale: true, remindedAt: null, notifiedAt: '2026-10-18T01:00:00Z', forwardedAt: '2026-10-18T02:00:00Z', handedFrom: 11, parsedAt: '2026-10-18T01:00:00Z' },
    ],
    records: [{ at: '2026-10-18T01:00:00Z', ident: 'CMP-1', action: '转阻塞：已提醒补写交接包' }],
  } })
  assert.equal(out.handoff.enabled, true)
  assert.equal(out.handoff.corrupt, false)
  assert.equal(out.handoff.missingCount, 1)
  assert.equal(out.handoff.forwardedCount, 1)
  assert.deepEqual(out.handoff.missing.map((x) => x.ident), ['CMP-1'])
  assert.deepEqual(out.handoff.missing[0].handoff.missing, ['已完成', '下一步'])
  assert.deepEqual(out.handoff.missing[0].triggers[0].label, '转阻塞')
  assert.equal(out.handoff.missing[0].money, false)
  assert.deepEqual(out.handoff.forwarded.map((x) => x.ident), ['CMP-2'])
  assert.equal(out.handoff.forwarded[0].forwardedAt, '2026-10-18T02:00:00Z')
  assert.equal(out.handoff.forwarded[0].stale, true)
  assert.equal(out.handoff.forwarded[0].money, true)
  assert.equal(out.handoff.records.length, 1)
  assert.equal(out.handoff.records[0].action, '转阻塞：已提醒补写交接包')
  assert.equal(out.summary.total, 0, '既有输出不变')
  // 不传 handoff 也不报错、分区为空
  const bare = buildGovernance({ now: new Date('2026-10-18T00:00:00Z') })
  assert.deepEqual(bare.handoff, { enabled: false, corrupt: false, lastAt: null, nextAt: null, missingCount: 0, forwardedCount: 0, missing: [], forwarded: [], records: [] })
})
