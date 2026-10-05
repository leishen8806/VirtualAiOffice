import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { transitionExecution } from '@vao/domain'
import { commandActivity, toExecutionEvent, validateExecutionSpec } from '../dist/index.js'
import type { ExecutionHandle, ExecutionResult, ExecutionSpec, ExecutorAdapter, ExecutorCapabilities, ExecutorEvent } from '../dist/index.js'

const spec: ExecutionSpec = {
  workspaceId: 'w1',
  projectId: 'p1',
  taskId: 't1',
  executionId: 'x1',
  workdir: '/tmp/worktrees/p1/t1',
  instructions: '实现 POST /login，并补充单元测试',
  role: { id: 'primary-engineer', name: 'Primary Engineer', instructions: '只改和任务有关的文件' },
  risk: 'L2',
  access: 'read_write',
  tools: [],
  budget: { maxDurationMs: 60_000 },
  metadata: {},
}

/** A scripted adapter: proves the contract can be implemented without any vendor concept. */
class ScriptedAdapter implements ExecutorAdapter {
  readonly #cancelled = new Set<string>()
  constructor(readonly script: ExecutorEvent[], readonly finalOutcome: ExecutionResult['outcome'] = 'succeeded') {}
  id() {
    return 'scripted'
  }
  capabilities(): ExecutorCapabilities {
    return { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: false, canUseVision: false, billing: 'usage', maxConcurrency: 2 }
  }
  async start(s: ExecutionSpec): Promise<ExecutionHandle> {
    const problems = validateExecutionSpec(s, this.capabilities())
    if (problems.length) throw new Error(problems.join('; '))
    const script = this.script
    const cancelled = this.#cancelled
    let release: () => void = () => {}
    const finished = new Promise<void>((r) => (release = r))
    const events = (async function* () {
      for (const e of script) {
        if (cancelled.has(s.executionId)) break
        yield e
        await Promise.resolve()
      }
      release()
    })()
    const result = finished.then<ExecutionResult>(() => ({
      outcome: cancelled.has(s.executionId) ? 'cancelled' : this.finalOutcome,
      summary: 'done',
      changedFiles: ['src/login.ts'],
      durationMs: 5,
    }))
    return { executionId: s.executionId, events, result }
  }
  async cancel(executionId: string) {
    this.#cancelled.add(executionId)
  }
}

const at = '2026-10-05T12:00:00.000Z'

test('executor contract: an adapter streams structured activity and resolves a result', async () => {
  const adapter = new ScriptedAdapter([
    { kind: 'activity', at, activity: { type: 'file.read', path: 'src/app.ts' } },
    { kind: 'activity', at, activity: { type: 'file.write', path: 'src/login.ts' } },
    { kind: 'activity', at, activity: commandActivity('npm test -- login') },
    { kind: 'usage', at, tokensIn: 1200, tokensOut: 300 },
  ])
  const handle = await adapter.start(spec)
  const seen: string[] = []
  for await (const e of handle.events) seen.push(e.kind === 'activity' ? e.activity.type : e.kind)
  assert.deepEqual(seen, ['file.read', 'file.write', 'test.run', 'usage'])
  const result = await handle.result
  assert.equal(result.outcome, 'succeeded')
  assert.equal(transitionExecution('RUNNING', toExecutionEvent(result)), 'SUCCEEDED')
})

test('executor contract: outcomes map onto the Execution state machine', () => {
  const r = (outcome: ExecutionResult['outcome'], extra: Partial<ExecutionResult> = {}): ExecutionResult => ({ outcome, summary: '', durationMs: 1, ...extra })
  assert.deepEqual(toExecutionEvent(r('failed', { error: 'exit 1' })), { type: 'FAIL', error: 'exit 1' })
  assert.equal(transitionExecution('RUNNING', toExecutionEvent(r('timed_out'))), 'TIMED_OUT')
  assert.equal(transitionExecution('RUNNING', toExecutionEvent(r('cancelled'))), 'CANCELLED')
  assert.deepEqual(toExecutionEvent(r('failed')), { type: 'FAIL', error: 'failed' })
})

test('executor contract: cancel is honoured and reported as an outcome', async () => {
  const adapter = new ScriptedAdapter(Array.from({ length: 50 }, () => ({ kind: 'heartbeat' as const, at })))
  const handle = await adapter.start(spec)
  await adapter.cancel(spec.executionId)
  await adapter.cancel(spec.executionId) // idempotent
  for await (const _ of handle.events) {
    // drain
  }
  assert.equal((await handle.result).outcome, 'cancelled')
})

test('executor contract: specs are validated against capabilities', () => {
  assert.deepEqual(validateExecutionSpec(spec), [])
  assert.deepEqual(validateExecutionSpec({ ...spec, workdir: 'C:\\work\\p1' }), [], 'Windows absolute paths are fine')
  const problems = validateExecutionSpec({ ...spec, workdir: 'relative/dir', instructions: '  ', budget: { maxDurationMs: 0 } })
  assert.equal(problems.length, 3, problems.join('; '))
  const readOnlyExecutor: ExecutorCapabilities = { interactive: true, canReadFiles: true, canWriteFiles: false, canRunShell: false, canUseMcp: false, canUseVision: false, billing: 'subscription' }
  assert.match(validateExecutionSpec(spec, readOnlyExecutor).join(), /cannot write files/)
  assert.deepEqual(validateExecutionSpec({ ...spec, access: 'read_only' }, readOnlyExecutor), [])
  assert.match(validateExecutionSpec({ ...spec, access: 'read_only', tools: [{ id: 'browser' }] }, readOnlyExecutor).join(), /cannot use tools/)
})

test('executor contract: test commands are classified for the QA Lab', () => {
  for (const c of ['npm test', 'pnpm run test', 'pytest -q', 'go test ./...', 'node --test', 'npx vitest run']) {
    assert.equal(commandActivity(c).type, 'test.run', c)
  }
  for (const c of ['npm run build', 'ls -la', 'git diff --stat']) assert.equal(commandActivity(c).type, 'command.run', c)
})

test('executor contract: the generic interface names no vendor', () => {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
  const text = fs.readdirSync(dist).filter((f) => f.endsWith('.d.ts')).map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('\n')
  assert.ok(text.includes('interface ExecutorAdapter'))
  assert.doesNotMatch(text, /claude|codex|trae|deepseek|openai|anthropic|gemini|qwen/i)
})
