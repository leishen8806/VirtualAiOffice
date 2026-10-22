// 大屏数据与脱敏自检：node --test tests/wall.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { redactText, redactState, buildWall, milestoneView, projectProgress } from '../wall.mjs'

test('脱敏：金额、IP、邮箱、链接、长令牌打码，UUID 和任务编号不动', () => {
  const t = redactText('服务器 159.223.77.134 费用 $1,200 和 300 美元，联系 a.b@x.com，见 https://khmerx.org/a，密钥 abcdef0123456789abcdef0123456789abcd。CMP-123 id 2e0fe3ea-df3a-480c-be0a-d50a00b6a62a')
  assert.ok(!/159\.223/.test(t) && !/\$1,200/.test(t) && !/300 美元/.test(t) && !/a\.b@x\.com/.test(t) && !/khmerx\.org/.test(t) && !/abcdef0123456789abcdef/.test(t))
  assert.ok(t.includes('CMP-123') && t.includes('2e0fe3ea-df3a-480c-be0a-d50a00b6a62a'))
})
test('redactState：去掉花费 / Telegram / 令牌 / 待审内容，并对其余字符串脱敏', () => {
  const s = redactState({ telegram: { x: 1 }, costs: { monthSpendCents: 5 }, actToken: 'abc', committee: { pending: [{ title: 't' }], batches: [{ id: 1 }], members: [] }, events: [{ text: '付款 $50 到 10.0.0.1' }] })
  assert.equal(s.telegram, undefined); assert.equal(s.costs, undefined); assert.equal(s.actToken, undefined)
  assert.deepEqual(s.committee.pending, []); assert.ok(!/\$50|10\.0\.0\.1/.test(s.events[0].text))
})
test('里程碑：过期未完成算过期，完成的不算；计划上线日 = 最后一个里程碑', () => {
  const rm = { products: [{ id: 'p', name: 'P', milestones: [{ id: 'A', name: 'a', due: '2026-10-10T17:00:00+07:00', status: 'done' }, { id: 'B', name: 'b', due: '2026-10-17T17:00:00+07:00', status: 'planned' }, { id: 'C', name: 'c', due: '2026-11-02T17:00:00+07:00', status: 'planned' }] }] }
  const v = milestoneView(rm, new Date('2026-10-18T03:00:00Z'))[0]
  assert.equal(v.milestones[0].overdue, false); assert.equal(v.milestones[1].overdue, true); assert.equal(v.finished, 1)
  assert.equal(v.plannedLaunch, '2026-11-02T17:00:00+07:00'); assert.equal(v.next.id, 'B')
})
test('项目进度按全部任务算，取消的不计入', () => {
  const r = projectProgress([{ projectId: 'a', status: 'done' }, { projectId: 'a', status: 'blocked' }, { projectId: 'a', status: 'cancelled' }, { projectId: 'a', status: 'backlog' }], [{ id: 'a', name: 'A' }])
  assert.equal(r[0].total, 3); assert.equal(r[0].done, 1); assert.equal(r[0].blocked, 1); assert.ok(Math.abs(r[0].percent - 1 / 3) < 1e-9)
})
test('风险灯：红 / 黄 / 绿的判据，空数据不抛异常', () => {
  const now = new Date('2026-10-18T03:00:00Z')
  assert.equal(buildWall({ now }).riskLevel, 'green')
  assert.equal(buildWall({ now, state: { today: { open: { blocked: 3 } } } }).riskLevel, 'yellow')
  assert.equal(buildWall({ now, state: { today: { open: { blocked: 8 } } } }).riskLevel, 'red')
  assert.equal(buildWall({ now, health: { level: 'bad', text: 'x' } }).riskLevel, 'red')
  const od = buildWall({ now, roadmap: { products: [{ id: 'p', name: 'P', milestones: [{ id: 'A', name: 'a', due: '2026-10-17T17:00:00+07:00', status: 'planned' }] }] } })
  assert.equal(od.riskLevel, 'red')
  const wait = (since) => buildWall({ now, state: { waiting: [{ kind: 'review', id: 'CMP-1', title: '付款 $99', since }] } })
  assert.equal(wait('2026-10-18T00:00:00Z').riskLevel, 'green') // 等了 3 小时：还不算
  assert.equal(wait('2026-10-17T22:00:00Z').riskLevel, 'yellow') // 5 小时
  assert.equal(wait('2026-10-16T22:00:00Z').riskLevel, 'red') // 29 小时
  assert.ok(!/\$99/.test(wait('2026-10-17T22:00:00Z').decisions[0].title)) // 标题里的金额已脱敏
})

test('待董事会提供的事项进入「需要领导决定」，并参与等待时长风险判断', () => {
  const now = new Date('2026-10-19T08:00:00Z')
  const w = buildWall({ now, state: { today: {}, waiting: [] }, boardItems: [
    { kind: 'board', ident: 'CMP-285', title: '提供新窗口', since: '2026-10-19T07:00:00Z' },
    { kind: 'board_blocked', ident: 'CMP-9', title: '等授权', since: '2026-10-19T01:00:00Z' },
  ] })
  assert.deepEqual(w.decisions.map((d) => d.ident), ['CMP-9', 'CMP-285'])
  assert.equal(w.decisions[0].kind, 'board_blocked')
  assert.equal(w.headline.decisionsPending, 2)
  assert.ok(w.risks.some((r) => r.level === 'yellow' && /等领导决定超过 4 小时/.test(r.title)))
  assert.equal(buildWall({ now, state: { today: {} } }).decisions.length, 0)
})
