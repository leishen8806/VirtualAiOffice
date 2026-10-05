// Stage 0 regression tests: verification fails closed (ADR-001).
// Unknown, malformed, failed or unparseable verification must never mark work as complete.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { rehearsalConfig } from '../fake/rehearsal.mjs'
import { loadConfig } from '../src/config.js'
import { Coordinator, extractVerdict, parseVerdict } from '../src/coordinator.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niuma-verify-'))

// Keep hired skills and stats out of the real home directory.
process.env.HOME = tmp()
process.env.USERPROFILE = process.env.HOME

// ---- parsing -------------------------------------------------------------------------------

test('review verdict: valid APPROVE and CHANGES_REQUESTED are recognised', () => {
  assert.equal(parseVerdict('改动清晰。\n\nVERDICT: APPROVE'), 'approve')
  assert.equal(parseVerdict('发现 2 个问题\n\nVERDICT: CHANGES_REQUESTED'), 'changes')
})

test('review verdict: a missing VERDICT line is unknown, not approve', () => {
  assert.equal(parseVerdict('看起来不错，应该没问题'), 'unknown')
  assert.equal(parseVerdict(''), 'unknown')
  assert.equal(parseVerdict(undefined), 'unknown')
  assert.equal(parseVerdict('VERDICT: LGTM'), 'unknown')
})

test('acceptance verdict: valid pass and valid fail are parsed', () => {
  assert.deepEqual(extractVerdict('都满足。\n```json\n{"done": true, "problems": [], "tasks": []}\n```'), { done: true, problems: [], tasks: [] })
  const v = extractVerdict('```json\n{"done": false, "problems": ["统计没刷新"], "tasks": [{"id": "f1"}]}\n```')
  assert.equal(v.done, false)
  assert.deepEqual(v.problems, ['统计没刷新'])
})

test('acceptance verdict: malformed output never produces a pass', () => {
  const cases = {
    'missing JSON': '我检查过了，整体没什么问题。',
    'invalid JSON': '结论：\n```json\n{"done": true, "problems": [\n```',
    'empty output': '',
    'null output': null,
    'missing verdict field': '```json\n{"problems": [], "tasks": []}\n```',
    'verdict is not a boolean': '```json\n{"done": "yes"}\n```',
    'verdict is null': '```json\n{"done": null}\n```',
  }
  for (const [name, text] of Object.entries(cases)) {
    const v = extractVerdict(text)
    assert.equal(v.done, false, `${name} must not count as done`)
  }
  assert.equal(extractVerdict('看不懂').unparsed, true, 'unparseable output is flagged so the caller can ask a human')
})

// ---- coordinator behaviour ----------------------------------------------------------------

async function rehearsal(t, overrides = {}) {
  process.env.NIUMA_FAKE_SPEED = '0.02'
  const r = await rehearsalConfig(loadConfig({ workdir: root }), root)
  const c = new Coordinator({ ...r.config, workdir: root, dispatchDelayMs: 0, ...overrides }, { mode: 'fake', root })
  t.after(() => {
    c.stopAll()
    r.close()
  })
  await c.init()
  return c
}

const idle = (c) =>
  new Promise((resolve) => {
    c.on('event', function on(ev) {
      if (ev.type === 'busy' && !ev.busy) {
        c.off('event', on)
        resolve()
      }
    })
  })

async function say(c, text) {
  const done = idle(c)
  c.post(text)
  await done
}

/** Make only the acceptance step behave as given; everything else runs the real rehearsal. */
function stubVerify(c, behave) {
  const real = c.runTask.bind(c)
  c.runTask = async (t) => {
    if (t.kind !== 'verify') return real(t)
    Object.assign(t, { status: 'running', startedAt: Date.now() })
    Object.assign(t, behave, { endedAt: Date.now() })
  }
}

test('verify(): a verification execution error is not done and needs a human', async (t) => {
  const c = await rehearsal(t)
  c.request = '做一个记账小网站'
  stubVerify(c, { status: 'failed', error: 'claude 退出码 1', result: '' })
  const v = await c.verify(null)
  assert.equal(v.done, false)
  assert.equal(v.needsHuman, true)
  assert.match(v.problems.join(), /验收没跑成/)
})

test('verify(): unparseable verifier output is not done; the check is marked failed', async (t) => {
  const c = await rehearsal(t)
  c.request = '做一个记账小网站'
  stubVerify(c, { status: 'done', result: '我看了一下，应该差不多了。' })
  const v = await c.verify(null)
  assert.equal(v.done, false)
  assert.equal(v.needsHuman, true)
  const check = c.tasks.find((x) => x.kind === 'verify')
  assert.equal(check.status, 'failed')
  assert.notEqual(check.verdict, 'approve')
  assert.ok(c.messages.some((m) => /不敢算它通过/.test(m.text)))
})

test('verify(): no available verifier is not done', async (t) => {
  const c = await rehearsal(t)
  c.verifier = () => null
  const v = await c.verify(null)
  assert.equal(v.done, false)
  assert.equal(v.needsHuman, true)
})

test('a full round with an unparseable acceptance stops without claiming success', async (t) => {
  const c = await rehearsal(t)
  stubVerify(c, { status: 'done', result: '没问题吧（没有 JSON）' })
  await say(c, '帮我做一个记账小网站')
  const check = c.task('v1')
  assert.equal(check.status, 'failed', 'the acceptance task itself is not done')
  assert.equal(c.iteration, 1, 'no follow-up round was planned from an unknown verdict')
  assert.ok(!c.tasks.some((x) => x.id.startsWith('i2-')))
  assert.ok(c.messages.some((m) => /请主人检查/.test(m.text)))
})

test('a full round with a crashed acceptance stops without claiming success', async (t) => {
  const c = await rehearsal(t)
  stubVerify(c, { status: 'failed', error: '超时了，被傻妞叫停', result: '' })
  await say(c, '帮我做一个记账小网站')
  assert.equal(c.task('v1').status, 'failed')
  assert.ok(c.messages.some((m) => /这一轮不算通过/.test(m.text)))
})

function reviewTask(c) {
  return {
    id: 'r1', title: '审查登录', kind: 'review', agent: 'reviewer', who: c.team.employee('reviewer').name,
    difficulty: 'medium', why: '', iter: 1, deps: [], prompt: '审查改动', tools: [],
    status: 'pending', activity: [], result: '', error: '', attempts: [], fixRound: 0, verdict: null, cost: null,
  }
}

test('a review without a VERDICT line is a failed review and goes to another reviewer', async (t) => {
  const c = await rehearsal(t)
  const t1 = reviewTask(c)
  c.tasks = [t1]
  c.request = '做一个登录页'
  const group = c.team.groupOf('reviewer')
  group.run = async () => ({ ok: true, text: '看起来不错，应该没问题。' })
  await c.runTask(t1)
  assert.equal(t1.attempts.length, 1, 'handed to someone else')
  assert.match(t1.attempts[0].error, /VERDICT/)
  assert.notEqual(t1.agent, 'reviewer')
  assert.equal(t1.status, 'pending', 'waiting for the next reviewer, not done')
})

test('with no retries left, a review without a VERDICT line stays failed', async (t) => {
  const c = await rehearsal(t, { maxRetries: 0 })
  const t1 = reviewTask(c)
  c.tasks = [t1]
  c.request = '做一个登录页'
  c.team.groupOf('reviewer').run = async () => ({ ok: true, text: '' })
  await c.runTask(t1)
  assert.equal(t1.status, 'failed')
  assert.equal(t1.verdict, 'unknown')
})

test('valid review verdicts keep their old behaviour', async (t) => {
  const c = await rehearsal(t)
  const t1 = reviewTask(c)
  c.tasks = [t1]
  c.request = '做一个登录页'
  c.team.groupOf('reviewer').run = async () => ({ ok: true, text: '没发现问题。\n\nVERDICT: APPROVE' })
  await c.runTask(t1)
  assert.equal(t1.status, 'done')
  assert.equal(t1.verdict, 'approve')
})
