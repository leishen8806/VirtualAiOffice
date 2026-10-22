import { projectCommandView } from './command-view-data.mjs'
import { validateCommandView } from './command-view-validate.mjs'

const FROM = '2026-10-21T04:00:00.000Z'
const known = (value) => ({ value, reason: null })
const missing = (reason) => ({ value: null, reason })
const copy = (value) => structuredClone(value)
const atSlice = (slice) => new Date(Date.parse(FROM) + slice * 60000).toISOString()
const table = [
  {
    id: 'demo-journey', name: '合成演示：任务完整经历',
    steps: [
      { id: 'demo-created', name: '创建（未核验授权）', type: 'issue.created' },
      { id: 'demo-claimed', name: '领取（模拟执行锁）', type: 'task.started' },
      { id: 'demo-executing', name: '执行（模拟运行）', type: 'execution.activity' },
      { id: 'demo-verifying', name: '验证（合成证据，不算通过）', type: 'evidence.test_simulated' },
      { id: 'demo-rework', name: '一次返工（模拟验证失败）', type: 'task.rework_simulated' },
      { id: 'demo-acceptance', name: '模拟验收（不是真实验收）', type: 'evidence.acceptance_simulated' },
    ],
  },
  {
    id: 'demo-focus', name: '合成演示：阻塞与督办焦点',
    steps: [{ id: 'demo-focus-snapshot', name: '授权、依赖、预算、执行器、已交付待验收', type: 'task.focus_simulated' }],
  },
  {
    id: 'demo-quality', name: '合成演示：数据质量',
    steps: [
      { id: 'demo-missing-usage', name: '未知成本与缺失用量', type: 'execution.quality_simulated' },
      { id: 'demo-stale', name: '过期：更新中断', type: 'execution.quality_simulated' },
      { id: 'demo-partial', name: '部分集合，计数未知', type: 'execution.quality_simulated' },
    ],
  },
]

// 场景元数据返回副本，界面操作不能改变下一次加载的演示。
export function listDemoScenarios() {
  return table.map((scenario) => ({ id: scenario.id, name: scenario.name, timeSlices: scenario.steps.length, synthetic: true }))
}

export function describeScenario(id) {
  const scenario = table.find((row) => row.id === id)
  return scenario ? { ...copy(scenario), timeSlices: scenario.steps.length, synthetic: true } : null
}

function context(slice) {
  const at = atSlice(slice)
  const snap = (items = []) => ({ items, at, complete: true })
  return {
    now: at, mode: 'demo',
    company: { id: 'demo-company', name: '合成演示公司' },
    scope: { project: 'demo-project', range: { from: FROM, to: at } },
    sources: {
      tasks: snap(), runs: snap(), activity: snap(),
      agents: snap([{ id: 'demo-agent', companyId: 'demo-company' }]),
      generatedAt: at,
    },
  }
}

function task(id = 'demo-task') {
  return {
    id, companyId: 'demo-company', projectId: 'demo-project', title: '合成任务：整理示意交付物',
    status: 'todo', createdAt: FROM, subjectVersion: 'demo-version',
    assigneeAgentId: 'demo-agent', blockedBy: [], dependencyKnown: true,
    reviewerId: 'demo-reviewer', projectOwnerId: 'demo-owner', boardActorId: 'demo-board',
    budgetActorId: 'demo-board', maintenanceActorId: 'demo-maintainer',
  }
}

function run(input, more = {}) {
  return {
    id: 'demo-run', taskId: 'demo-task', companyId: 'demo-company', agentId: 'demo-agent',
    startedAt: atSlice(2), status: 'running', ...more,
  }
}

function journey(slice) {
  const input = context(slice)
  const item = task()
  input.sources.tasks.items.push(item)
  if (slice === 1) item.checkout = { taskId: item.id, agentId: 'demo-agent', runId: 'demo-run' }
  if (slice >= 2) input.sources.runs.items.push(run(input, slice >= 3 ? { status: 'succeeded', finishedAt: atSlice(3) } : {}))
  if (slice >= 3) {
    item.status = slice === 4 ? 'blocked' : slice === 5 ? 'done' : 'in_review'
    item.verificationFailed = slice === 4
    const kinds = slice === 5 ? ['execution', 'test', 'review', 'acceptance'] : ['execution', 'test']
    input.sources.evidence = {
      at: input.now, complete: false, reason: 'SYNTHETIC_DEMO',
      items: [{
        taskId: item.id, synthetic: true, subjectVersion: 'demo-version',
        protectedTestsHash: 'demo-test-version', executorActor: 'demo-agent', boardActors: ['demo-board'],
        // 故意不设真实生效边界；模拟记录不能建立真实版本验收。
        records: kinds.map((kind) => ({
          kind, synthetic: true, ok: slice !== 4, ref: `demo-evidence-${kind}`,
          actor: kind === 'acceptance' ? 'demo-board' : kind === 'review' ? 'demo-reviewer' : 'demo-agent',
          subjectVersion: 'demo-version', protectedTestsHash: 'demo-test-version',
        })),
      }],
    }
  }
  return input
}

function focus() {
  const input = context(0)
  input.sources.tasks.items = [
    { ...task('demo-task-approval'), title: '合成任务：等待授权', awaitingBoard: true },
    { ...task('demo-task-dependency'), title: '合成任务：等待依赖', blockedBy: [{ id: 'demo-task-upstream', status: 'todo', assigneeAgentId: 'demo-owner' }] },
    { ...task('demo-task-budget'), title: '合成任务：资金操作示意' },
    { ...task('demo-task-executor'), title: '合成任务：执行环境待处理', executorBlocked: true },
    { ...task('demo-task-delivered'), title: '合成任务：交付等待验收', status: 'done' },
  ]
  return input
}

function quality(slice) {
  const input = context(slice)
  input.sources.tasks.items.push(task())
  input.sources.runs.items.push(run(input, { startedAt: FROM, status: 'succeeded', finishedAt: FROM }))
  if (slice >= 1) {
    input.now = '2026-10-21T04:05:00.000Z'
    input.scope.range.to = input.now
    input.sources.generatedAt = FROM
    for (const value of Object.values(input.sources)) {
      if (value && typeof value === 'object' && 'at' in value) value.at = FROM
    }
  }
  if (slice === 2) {
    for (const name of ['tasks', 'runs', 'activity']) {
      input.sources[name].complete = false
      input.sources[name].reason = 'PARTIAL_PAGE'
    }
  }
  return input
}

function project(input) {
  const data = projectCommandView(input)
  if (data.ok === false) throw new Error(`Demo projection rejected: ${data.code}`)
  // C2 的白名单投影会丢弃来源记录的 synthetic，输出后重新明确标记每份合成证据。
  for (const row of data.queue) {
    row.evidence.synthetic = true
    if (row.evidence.value) {
      row.evidence.value.synthetic = true
      for (const record of row.evidence.value.records) record.synthetic = true
    }
  }
  return data
}

/** timeSlice 是场景步骤的零基整数，不是实时钟或业务命令。 */
export function buildDemoCommandView({ scenario = 'demo-journey', timeSlice = 0 } = {}) {
  const definition = table.find((row) => row.id === scenario)
  if (!definition || !Number.isInteger(timeSlice) || timeSlice < 0 || timeSlice >= definition.steps.length) {
    throw new RangeError('Unknown demo scenario or timeSlice')
  }
  const data = project(scenario === 'demo-journey' ? journey(timeSlice) : scenario === 'demo-focus' ? focus() : quality(timeSlice))
  if (scenario === 'demo-journey') {
    data.timeline.items = definition.steps.slice(0, timeSlice + 1).map((step, index) => {
      const snapshot = project(journey(index))
      return {
        id: `demo-event-${step.id.slice(5)}`, taskId: 'demo-task',
        runId: index >= 1 ? known('demo-run') : missing('NOT_APPLICABLE'),
        at: atSlice(index), type: step.type, operator: index === 0 || index === 5 ? 'board' : 'agent',
        source: 'synthetic', synthetic: true,
        stage: snapshot.queue[0].stage, stageReason: snapshot.queue[0].stageReason,
        evidence: copy(snapshot.queue[0].evidence),
      }
    })
    data.timeline.complete = false
    data.timeline.reason = 'SYNTHETIC_DEMO'
    const source = data.quality.sources.find((row) => row.source === 'timeline')
    source.complete = false
    source.reason = 'SYNTHETIC_DEMO'
  }
  data.quality.gaps = [...new Set([...data.quality.gaps, 'SYNTHETIC_DEMO'])].sort()
  const checked = validateCommandView(data)
  if (!checked.ok) throw new Error(`Demo validation rejected: ${checked.errors.map((error) => error.code).join(',')}`)
  return data
}

// C7 不读取 live，也不自授权限。空状态不是带虚构公司范围的 CommandViewData。
// 调用方只有显式选择 demo 才取得演示；live 加载应由后续授权适配器负责。
export function defaultCommandView(options = {}) {
  if (options?.mode === 'demo') return buildDemoCommandView({ scenario: options.scenario, timeSlice: options.timeSlice })
  return { kind: 'empty', data: null, reason: 'NO_AUTHORIZED_LIVE_SCOPE' }
}
