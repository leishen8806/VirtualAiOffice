import type { ExecutionHandle, ExecutionResult, ExecutionSpec, ExecutorAdapter, ExecutorCapabilities, ToolGrant } from '../contract.js'
import type { ExecutorEvent } from '../activity.js'
import { validateExecutionSpec } from '../contract.js'
import { commandActivity } from '../activity.js'
import { BaseWorker } from '../../runtime/index.js'

type LegacyWorker = BaseWorker & {
  run(options: Record<string, unknown>): Promise<Record<string, any>>
}

type LegacyWorkerCtor = new (group: Record<string, any>, context: Record<string, any>) => LegacyWorker

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

function eventFromLegacy(value: any): ExecutorEvent | null {
  const activity = value?.activity
  if (!activity) return null
  return { kind: 'activity', at: new Date().toISOString(), activity }
}

function toolConfig(grants: readonly ToolGrant[], resolveTool?: (grant: ToolGrant) => Record<string, any> | undefined) {
  return grants.map((grant) => resolveTool?.(grant)).filter(Boolean)
}

function resultFromLegacy(value: any, started: number): ExecutionResult {
  const usage = value?.usage || {}
  const outcome = value?.outcome || (value?.ok ? 'succeeded' : value?.error === '被叫停' ? 'cancelled' : 'failed')
  return {
    outcome,
    summary: String(value?.text || ''),
    ...(value?.error ? { error: String(value.error) } : {}),
    ...(value?.sessionId ? { sessionRef: String(value.sessionId) } : {}),
    ...(value?.cost != null ? { costUsd: Number(value.cost) } : {}),
    ...(usage.in != null || usage.input_tokens != null ? { tokensIn: Number(usage.in ?? usage.input_tokens ?? 0) } : {}),
    ...(usage.out != null || usage.output_tokens != null ? { tokensOut: Number(usage.out ?? usage.output_tokens ?? 0) } : {}),
    durationMs: Number(value?.durationMs || Date.now() - started),
  }
}

export interface LegacyAdapterOptions {
  readonly group?: Record<string, any>
  readonly resolveTool?: (grant: ToolGrant) => Record<string, any> | undefined
}

export class LegacyBackedAdapter implements ExecutorAdapter {
  private readonly controllers = new Map<string, any>()
  private readonly worker: LegacyWorker
  private readonly caps: ExecutorCapabilities

  constructor(private readonly adapterId: string, Worker: LegacyWorkerCtor, options: LegacyAdapterOptions = {}, caps: ExecutorCapabilities) {
    this.worker = new Worker(options.group || {}, { workdir: '.', logDir: '.', autonomy: 'full' })
    this.caps = caps
    this.resolveTool = options.resolveTool
  }

  private resolveTool: ((grant: ToolGrant) => Record<string, any> | undefined) | undefined

  id() { return this.adapterId }
  capabilities() { return this.caps }

  async start(spec: ExecutionSpec): Promise<ExecutionHandle> {
    const problems = validateExecutionSpec(spec, this.caps)
    if (problems.length) throw new Error(problems.join('; '))
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
      tools: toolConfig(spec.tools, this.resolveTool),
      onActivity: (value: any) => {
        const event = eventFromLegacy(value)
        if (event) queue.push(event)
      },
    })).then((value) => resultFromLegacy(value, started)).catch((error) => ({ outcome: 'failed' as const, summary: '', error: String(error?.message || error), durationMs: Date.now() - started })).finally(() => {
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
