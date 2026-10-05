import type { ExecutionHandle, ExecutionResult, ExecutionSpec, ExecutorAdapter, ExecutorCapabilities, ToolGrant } from '../contract.js'
import type { ExecutorEvent, ExecutionActivity } from '../activity.js'
import { validateExecutionSpec } from '../contract.js'
import { commandActivity } from '../activity.js'
import { BaseWorker } from '../../runtime/index.js'

type LegacyWorker = BaseWorker & {
  run(options: Record<string, unknown>): Promise<Record<string, any>>
}

type LegacyWorkerCtor = new (group: Record<string, any>, context: Record<string, any>) => LegacyWorker

export function mapLegacyActivities(value: any): ExecutorEvent[] {
  const raw = value?.activity
  if (raw == null) return []
  const at = new Date().toISOString()
  const toEvent = (activity: ExecutionActivity) => ({ kind: 'activity' as const, at, activity })
  if (Array.isArray(raw)) return raw.map(toEvent)
  return [toEvent(raw as ExecutionActivity)]
}

export function mapLegacyResult(value: any, started = Date.now()): ExecutionResult {
  const usage = value?.usage || {}
  const input = usage.in ?? usage.input_tokens
  const output = usage.out ?? usage.output_tokens
  const explicit = value?.outcome
  const outcome: ExecutionResult['outcome'] = explicit &&
    ['succeeded', 'failed', 'timed_out', 'cancelled'].includes(explicit)
      ? explicit
      : (value?.ok ? 'succeeded' : 'failed')
  return {
    outcome,
    summary: String(value?.text || ''),
    ...(value?.error ? { error: String(value.error) } : {}),
    ...(value?.sessionId ? { sessionRef: String(value.sessionId) } : {}),
    ...(value?.cost != null ? { costUsd: Number(value.cost) } : {}),
    ...(input != null ? { tokensIn: Number(input) } : {}),
    ...(output != null ? { tokensOut: Number(output) } : {}),
    durationMs: Number(value?.durationMs || Date.now() - started),
  }
}

class EventQueue implements AsyncIterable<ExecutorEvent> {
  private values: ExecutorEvent[] = []
  private waiters: Array<(value: IteratorResult<ExecutorEvent>) => void> = []
  private ended = false

  push(value: ExecutorEvent) {
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.values.push(value)
  }

  end() {
    this.ended = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as never, done: true })
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.values.length) return Promise.resolve({ value: this.values.shift()!, done: false })
        if (this.ended) return Promise.resolve({ value: undefined as never, done: true })
        return new Promise<IteratorResult<ExecutorEvent>>((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

function toolConfig(grants: readonly ToolGrant[], resolveTool?: (grant: ToolGrant) => Record<string, any> | undefined) {
  if (!grants.length) return []
  if (!resolveTool) throw new Error(`required tool grant could not be resolved: ${grants[0]!.id}`)
  return grants.map((grant) => {
    const resolved = resolveTool(grant)
    if (!resolved) throw new Error(`required tool grant could not be resolved: ${grant.id}`)
    return resolved
  })
}

export interface LegacyAdapterOptions {
  readonly group?: Record<string, any>
  readonly resolveTool?: (grant: ToolGrant) => Record<string, any> | undefined
  readonly logDir?: string
  readonly workdir?: string
}

export class LegacyBackedAdapter implements ExecutorAdapter {
  private readonly controllers = new Map<string, any>()
  private readonly worker: LegacyWorker
  private readonly caps: ExecutorCapabilities

  constructor(private readonly adapterId: string, Worker: LegacyWorkerCtor, options: LegacyAdapterOptions = {}, caps: ExecutorCapabilities) {
    this.worker = new Worker(options.group || {}, { workdir: options.workdir ?? '.', logDir: options.logDir || '', autonomy: 'full' })
    this.caps = caps
    this.resolveTool = options.resolveTool
  }

  private resolveTool: ((grant: ToolGrant) => Record<string, any> | undefined) | undefined

  id() { return this.adapterId }
  capabilities() { return this.caps }

  async start(spec: ExecutionSpec): Promise<ExecutionHandle> {
    const problems = validateExecutionSpec(spec, this.caps)
    if (problems.length) throw new Error(problems.join('; '))
    const tools = toolConfig(spec.tools, this.resolveTool)
    const queue = new EventQueue()
    const controller: any = new (globalThis as any).AbortController()
    this.controllers.set(spec.executionId, controller)
    const started = Date.now()
    const result = Promise.resolve().then(() => this.worker.run({
      prompt: spec.instructions,
      model: spec.modelHint || '',
      readOnly: spec.access === 'read_only',
      workdir: spec.workdir,
      timeoutMs: spec.budget.maxDurationMs,
      signal: controller.signal,
      tools,
      onActivity: (value: any) => {
        for (const event of mapLegacyActivities(value)) queue.push(event)
      },
    })).then((value) => mapLegacyResult(value, started)).catch((error) => ({ outcome: 'failed' as const, summary: '', error: String(error?.message || error), durationMs: Date.now() - started })).finally(() => {
      this.controllers.delete(spec.executionId)
      queue.end()
    })
    return { executionId: spec.executionId, events: queue, result }
  }

  async cancel(executionId: string) {
    this.controllers.get(executionId)?.abort()
  }
}

export function legacyCommandActivity(command: string): ExecutorEvent {
  return { kind: 'activity', at: new Date().toISOString(), activity: commandActivity(command) }
}
