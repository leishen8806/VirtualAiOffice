// DS-4：office3d/scheduler-core.mjs 的性质测试。
// 固定种子的伪随机任务集 + 不变式；只加测试，不改被测代码。
// 默认读 ../scheduler-core.mjs；变异自检时可用 SCHEDULER_CORE_MODULE 指向系统临时目录的副本
// （副本所在目录需同时有 standup.mjs，因为 scheduler-core.mjs 会相对导入它）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { MONEY_RE } from '../standup.mjs'

const coreUrl = process.env.SCHEDULER_CORE_MODULE
  ? pathToFileURL(process.env.SCHEDULER_CORE_MODULE)
  : new URL('../scheduler-core.mjs', import.meta.url)
const core = await import(coreUrl)
const {
  DEFAULT_OPEN_LIMIT,
  ELIGIBLE_STATUSES,
  PRIORITY_ORDER,
  REASON_CODES,
  evaluateTask,
  pickNext,
  revalidate,
} = core

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1)
const AGENT_IDS = ['a1', 'a2', 'a3']
const PRIORITIES = ['critical', 'high', 'medium', 'low']
const BAD_STATUSES = ['in_review', 'done', 'cancelled', 'blocked']

// ---- 固定种子伪随机（mulberry32） -------------------------------------------------

function mulberry32(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pickOne = (rng, list) => list[Math.floor(rng() * list.length)]
const intBetween = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
const shuffled = (rng, list) => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const contractText = (task) => {
  const contract = task.contract
  if (!contract || typeof contract !== 'object') return ''
  return ['项目', '目标', '交付物', '允许修改']
    .flatMap((key) => (Array.isArray(contract[key]) ? contract[key] : [contract[key]]))
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => String(value))
    .join('\n')
}

/** 与源码 moneyText 同口径的独立判断，用来断言「永不选金额类」。 */
const looksLikeMoney = (task) => MONEY_RE.test([task.title, contractText(task)].filter(Boolean).join('\n'))

function cleanTask(rng, id, overrides = {}) {
  const assigneeAgentId = pickOne(rng, AGENT_IDS)
  return {
    id,
    identifier: `CMP-${id}`,
    title: pickOne(rng, ['面板优化', '接口联调', '列表筛选', '文案整理', '样式调整']),
    description: '普通研发任务',
    status: pickOne(rng, [...ELIGIBLE_STATUSES]),
    priority: pickOne(rng, PRIORITIES),
    assigneeAgentId,
    projectId: 'p1',
    createdAt: intBetween(rng, 1, 500),
    updatedAt: intBetween(rng, 501, 900),
    blockedBy: [],
    hasContract: rng() > 0.2,
    awaitingBoard: false,
    leasedByRunId: null,
    dependencyKnown: true,
    riskClass: '低',
    ...overrides,
  }
}

/** 每个种子一组任务；强制混入各类「不该被选中」的任务，以及配额/排序所需的干净任务。 */
function makeCase(seed) {
  const rng = mulberry32(seed)
  const tasks = []
  let n = 0
  const add = (overrides) => { n += 1; tasks.push(cleanTask(rng, `t${n}`, overrides)) }

  // 干净任务：足够触发 limit、配额与排序不变式
  for (let i = 0; i < intBetween(rng, 6, 9); i++) add({ assigneeAgentId: rng() > 0.5 ? 'a1' : pickOne(rng, AGENT_IDS) })
  // 同负责人超额：a1 已有 1 个并行，配额 2 - 1 = 1
  for (let i = 0; i < 3; i++) add({ assigneeAgentId: 'a1' })
  // 金额类
  add({ title: pickOne(rng, ['提现审批', '资金对账', '账务迁移', '密钥轮换']), assigneeAgentId: 'a1' })
  if (rng() > 0.5) add({ title: '普通任务', contract: { '交付物': '迁移脚本' }, assigneeAgentId: 'a2' })
  // 依赖未完成 / 已取消
  add({ blockedBy: [{ id: 'dep-1', status: 'todo' }] })
  add({ blockedBy: [{ id: 'dep-2', status: 'cancelled' }] })
  add({ blockedBy: [{ id: 'dep-3', status: 'done' }] })
  add({ dependencyKnown: false })
  // 状态不对 / 无负责人 / 已锁 / 等董事会
  add({ status: pickOne(rng, BAD_STATUSES) })
  add({ assigneeAgentId: null })
  add({ leasedByRunId: `run-${seed}` })
  add({ awaitingBoard: true })
  // 父任务未进行中
  add({ parentId: 'p', parentStatus: pickOne(rng, ['todo', 'done']) })

  const openCountByAgent = new Map()
  const agents = AGENT_IDS.map((id) => {
    const openCount = id === 'a1' ? 1 : intBetween(rng, 0, 1)
    openCountByAgent.set(id, openCount)
    return {
      id,
      status: rng() > 0.85 ? pickOne(rng, ['paused', 'error']) : 'idle',
      openCount,
      budgetRemaining: rng() > 0.9 ? pickOne(rng, [0, null]) : intBetween(rng, 1, 9),
      permissions: [],
    }
  })

  const ctx = {
    now: 100000 + seed * 1000,
    dataAt: 100000 + seed * 1000,
    agents,
    policy: { requireContract: false, moneyNeedsBoard: true },
    openLimitPerAgent: 2,
    dailyDispatchLimit: 5,
    dispatchedToday: intBetween(rng, 0, 2),
    maxDataAgeMs: 120000,
  }
  return { seed, tasks: shuffled(rng, tasks), ctx, limit: intBetween(rng, 2, 5), openCountByAgent }
}

const CASES = SEEDS.map(makeCase)

// ---- 辅助 ------------------------------------------------------------------------

const taskByIdentifier = (testCase, taskId) => testCase.tasks.find((task) => task.identifier === taskId)

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

function assertNoUndefinedOrNaN(value, path = 'result') {
  if (value === undefined) assert.fail(`${path} 含 undefined`)
  if (typeof value === 'number' && Number.isNaN(value)) assert.fail(`${path} 含 NaN`)
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) assertNoUndefinedOrNaN(child, `${path}.${key}`)
}

const codesOf = (result) => (result.reasons || []).map((entry) => entry.code)

const quotaOf = (testCase, agentId) => {
  const agent = testCase.ctx.agents.find((item) => item.id === agentId)
  if (!agent || !Number.isInteger(agent.openCount)) return 0
  return Math.max(0, testCase.ctx.openLimitPerAgent - agent.openCount)
}

const priorityScore = (task) => PRIORITY_ORDER[String(task.priority || '').toLowerCase()] || 0

// ---- 性质 1：选中项一定合格 --------------------------------------------------------

test('性质：pickNext 选中的每个任务单独 evaluateTask 都判定为可选', () => {
  for (const testCase of CASES) {
    const result = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    for (const pick of result.picks) {
      const task = taskByIdentifier(testCase, pick.taskId)
      assert.ok(task, `种子 ${testCase.seed}：选中的 ${pick.taskId} 必须存在`)
      const evaluation = evaluateTask(task, testCase.ctx)
      assert.equal(evaluation.eligible, true, `种子 ${testCase.seed}：${pick.taskId} 应可选，实际 ${JSON.stringify(codesOf(evaluation))}`)
      const blocking = (evaluation.reasons || []).filter((entry) => entry.severity === 'block').map((entry) => entry.code)
      assert.deepEqual(blocking, [], `种子 ${testCase.seed}：可选任务不应带拦截原因`)
    }
  }
})

// ---- 性质 2：永不选不该选的任务 ----------------------------------------------------

test('性质：永不选金额类、依赖未完成/已取消、状态不对、无负责人、已锁、等董事会的任务', () => {
  for (const testCase of CASES) {
    const result = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    for (const pick of result.picks) {
      const task = taskByIdentifier(testCase, pick.taskId)
      assert.equal(looksLikeMoney(task), false, `种子 ${testCase.seed}：不能选金额类 ${pick.taskId}`)
      assert.equal((task.blockedBy || []).some((entry) => ['todo', 'backlog'].includes(String(entry?.status).toLowerCase())), false, `种子 ${testCase.seed}：不能选依赖未完成的 ${pick.taskId}`)
      assert.equal((task.blockedBy || []).some((entry) => ['cancelled', 'canceled'].includes(String(entry?.status).toLowerCase())), false, `种子 ${testCase.seed}：不能选依赖已取消的 ${pick.taskId}`)
      assert.equal(ELIGIBLE_STATUSES.includes(String(task.status).toLowerCase()), true, `种子 ${testCase.seed}：状态必须可领取 ${pick.taskId}`)
      assert.ok(task.assigneeAgentId, `种子 ${testCase.seed}：必须有负责人 ${pick.taskId}`)
      assert.equal(task.leasedByRunId ?? null, null, `种子 ${testCase.seed}：不能选已锁任务 ${pick.taskId}`)
      assert.equal(task.awaitingBoard === true, false, `种子 ${testCase.seed}：不能选等董事会任务 ${pick.taskId}`)
    }
  }
})

// ---- 性质 3：数量上限与每负责人配额 ------------------------------------------------

test('性质：选中数不超过 limit，且每个负责人不超过本次配额', () => {
  for (const testCase of CASES) {
    const result = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    assert.ok(result.picks.length <= testCase.limit, `种子 ${testCase.seed}：选中 ${result.picks.length} > limit ${testCase.limit}`)
    const perAgent = new Map()
    for (const pick of result.picks) {
      const task = taskByIdentifier(testCase, pick.taskId)
      const agentId = String(task.assigneeAgentId)
      perAgent.set(agentId, (perAgent.get(agentId) || 0) + 1)
    }
    for (const [agentId, count] of perAgent) {
      assert.ok(count <= quotaOf(testCase, agentId), `种子 ${testCase.seed}：负责人 ${agentId} 选中 ${count} 超过配额 ${quotaOf(testCase, agentId)}`)
    }
  }
})

// ---- 性质 4：顺序不变性 ------------------------------------------------------------

test('性质：同一任务集随机打乱后 pickNext 结果完全一致（确定性排序）', () => {
  for (const testCase of CASES) {
    const first = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    const rng = mulberry32(testCase.seed * 7919 + 3)
    const scrambled = pickNext(shuffled(rng, testCase.tasks), testCase.ctx, { limit: testCase.limit })
    assert.deepEqual(scrambled.picks, first.picks, `种子 ${testCase.seed}：打乱后选择必须一致`)
  }
})

test('性质：选中顺序按优先级分数不升序（排序方向不变）', () => {
  let compared = 0
  for (const testCase of CASES) {
    const result = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    for (let i = 1; i < result.picks.length; i++) {
      const previous = taskByIdentifier(testCase, result.picks[i - 1].taskId)
      const current = taskByIdentifier(testCase, result.picks[i].taskId)
      assert.ok(priorityScore(previous) >= priorityScore(current), `种子 ${testCase.seed}：第 ${i} 个选中项的优先级不应高于前一个`)
      compared += 1
    }
  }
  assert.ok(compared > 0, '随机集里应至少出现一次可比较的相邻选中项')
})

// ---- 性质 5：纯度 ----------------------------------------------------------------

test('性质：深度冻结入参不抛错，重复调用结果逐字段相等，结果无 undefined/NaN', () => {
  for (const testCase of CASES) {
    const frozenTasks = deepFreeze(JSON.parse(JSON.stringify(testCase.tasks)))
    const frozenCtx = deepFreeze(JSON.parse(JSON.stringify(testCase.ctx)))
    let first
    assert.doesNotThrow(() => { first = pickNext(frozenTasks, frozenCtx, { limit: testCase.limit }) }, `种子 ${testCase.seed}：冻结输入不应抛错`)
    let second
    assert.doesNotThrow(() => { second = pickNext(frozenTasks, frozenCtx, { limit: testCase.limit }) }, `种子 ${testCase.seed}：第二次调用不应抛错`)
    assert.deepEqual(second, first, `种子 ${testCase.seed}：重复调用结果应逐字段相等`)
    assertNoUndefinedOrNaN(first, `seed ${testCase.seed}`)
  }
})

// ---- 性质 6：revalidate 一致性 ----------------------------------------------------

test('性质：刚选出的决策在新鲜数据下通过，依赖/负责人/预算变化后拦下且原因码合法', () => {
  for (const testCase of CASES) {
    const result = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    for (const pick of result.picks.slice(0, 3)) {
      const task = taskByIdentifier(testCase, pick.taskId)
      const decision = evaluateTask(task, testCase.ctx)
      const unchanged = revalidate(decision, task, testCase.ctx)
      assert.equal(unchanged.stillEligible, true, `种子 ${testCase.seed}：未变化应仍然可选`)
      assert.deepEqual(unchanged.changed, [], `种子 ${testCase.seed}：未变化不应有 changed`)

      const pending = { ...task, blockedBy: [{ id: 'dep-x', status: 'todo' }] }
      const pendingResult = revalidate(decision, pending, testCase.ctx)
      assert.equal(pendingResult.stillEligible, false, `种子 ${testCase.seed}：依赖未完成必须拦下`)
      assert.ok(pendingResult.changed.includes('DEP_PENDING'), `种子 ${testCase.seed}：应报告 DEP_PENDING`)

      const pausedCtx = { ...testCase.ctx, agents: testCase.ctx.agents.map((agent) => agent.id === task.assigneeAgentId ? { ...agent, status: 'paused' } : agent) }
      const pausedResult = revalidate(decision, task, pausedCtx)
      assert.equal(pausedResult.stillEligible, false, `种子 ${testCase.seed}：负责人不可用必须拦下`)
      assert.ok(pausedResult.changed.includes('AGENT_UNAVAILABLE'), `种子 ${testCase.seed}：应报告 AGENT_UNAVAILABLE`)

      const brokeCtx = { ...testCase.ctx, agents: testCase.ctx.agents.map((agent) => agent.id === task.assigneeAgentId ? { ...agent, budgetRemaining: 0 } : agent) }
      const brokeResult = revalidate(decision, task, brokeCtx)
      assert.equal(brokeResult.stillEligible, false, `种子 ${testCase.seed}：预算耗尽必须拦下`)
      assert.ok(brokeResult.changed.includes('BUDGET_EXHAUSTED'), `种子 ${testCase.seed}：应报告 BUDGET_EXHAUSTED`)

      for (const code of [...pendingResult.changed, ...pausedResult.changed, ...brokeResult.changed]) {
        assert.ok(REASON_CODES.includes(code), `种子 ${testCase.seed}：原因码 ${code} 必须已登记`)
      }
    }
  }
})

// ---- 性质 7：原因码合法 ------------------------------------------------------------

test('性质：所有被拒任务与评估结果的原因码都属于 REASON_CODES', () => {
  for (const testCase of CASES) {
    const result = pickNext(testCase.tasks, testCase.ctx, { limit: testCase.limit })
    for (const skipped of result.skipped) {
      for (const reason of skipped.reasons) {
        assert.ok(REASON_CODES.includes(reason.code), `种子 ${testCase.seed}：跳过原因码 ${reason.code} 未登记`)
      }
    }
    for (const task of testCase.tasks) {
      const evaluation = evaluateTask(task, testCase.ctx)
      for (const reason of evaluation.reasons) {
        assert.ok(REASON_CODES.includes(reason.code), `种子 ${testCase.seed}：评估原因码 ${reason.code} 未登记`)
      }
    }
  }
})
