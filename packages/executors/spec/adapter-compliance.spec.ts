import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ClaudeCliAdapter, CodexCliAdapter, OpenAICompatAdapter } from '../dist/index.js'
import type { ExecutionSpec, ExecutorAdapter, ToolGrant } from '../dist/index.js'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-adapter-'))
const workdir = path.join(tempRoot, 'workdir')
const otherWorkdir = path.join(tempRoot, 'other')
fs.mkdirSync(workdir, { recursive: true })
fs.mkdirSync(otherWorkdir, { recursive: true })
const fixture = path.join(tempRoot, 'fake-executor.mjs')
fs.writeFileSync(fixture, `
import fs from 'node:fs'
const kind = process.env.VAO_FAKE_KIND
const capture = process.env.VAO_CAPTURE
if (capture) fs.writeFileSync(capture, JSON.stringify({ cwd: process.cwd(), argv: process.argv }))
if (process.env.VAO_HANG === '1') await new Promise(() => setInterval(() => {}, 1000))
if (kind === 'claude') {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-session' }))
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/a.ts' } }, { type: 'text', text: 'done' }] } }))
  console.log(JSON.stringify({ type: 'result', subtype: 'success', result: 'done', total_cost_usd: 0.12 }))
} else {
  const out = process.argv[process.argv.indexOf('-o') + 1]
  if (out) fs.writeFileSync(out, 'codex done')
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'codex-session' }))
  console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'npm test' } }))
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }))
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 7, output_tokens: 3 } }))
}
`)

const baseSpec = (id: string, overrides: Partial<ExecutionSpec> = {}): ExecutionSpec => ({
  workspaceId: 'workspace', projectId: 'project', taskId: 'task', executionId: id,
  workdir, instructions: 'inspect the project', role: { id: 'engineer', name: 'Engineer', instructions: 'work carefully' },
  risk: 'L1', access: 'read_write', tools: [], budget: { maxDurationMs: 5000 }, metadata: {}, ...overrides,
})

function cliAdapter(kind: 'claude' | 'codex', extra: Record<string, unknown> = {}) {
  const Ctor = kind === 'claude' ? ClaudeCliAdapter : CodexCliAdapter
  return new Ctor({ group: { type: kind === 'claude' ? 'claude-cli' : 'codex-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: kind, ...extra } } })
}

async function events(handle: Awaited<ReturnType<ExecutorAdapter['start']>>) {
  const seen = [] as any[]
  for await (const event of handle.events) seen.push(event)
  return seen
}

function assertResolved(handle: Awaited<ReturnType<ExecutorAdapter['start']>>) {
  return handle.result.then((result) => { assert.ok(result.outcome); return result })
}

async function waitForFile(file: string) {
  const deadline = Date.now() + 3000
  while (!fs.existsSync(file) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  assert.ok(fs.existsSync(file), `fixture did not start: ${file}`)
}

async function fakeApi() {
  let calls = 0
  const server = http.createServer(async (req, res) => {
    if (req.url?.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":[]}'); return }
    let body = ''
    for await (const chunk of req) body += chunk
    calls++
    if (process.env.VAO_API_HANG === '1') return
    const response = calls === 1 && JSON.parse(body).tools
      ? { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/a.ts"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 11, completion_tokens: 5 } }
      : { choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 13, completion_tokens: 7 } }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  return { baseUrl: `http://127.0.0.1:${port}/v1`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

test('real adapters share the execution contract without paid API calls', async (t) => {
  for (const kind of ['claude', 'codex'] as const) {
    await t.test(`${kind} starts, emits canonical activity, maps session and resolves`, async () => {
      const adapter = cliAdapter(kind)
      const handle = await adapter.start(baseSpec(`${kind}-success`))
      const seen = await events(handle)
      const result = await assertResolved(handle)
      assert.equal(result.outcome, 'succeeded')
      assert.ok(result.sessionRef)
      assert.ok(seen.some((e) => e.kind === 'activity'))
      assert.ok(seen.some((e) => e.activity?.type === (kind === 'claude' ? 'file.read' : 'test.run')))
    })
    await t.test(`${kind} cancellation is idempotent and enforced`, async () => {
      const capture = path.join(tempRoot, `${kind}-cancel.json`)
      const adapter = cliAdapter(kind, { VAO_HANG: '1', VAO_CAPTURE: capture })
      const spec = baseSpec(`${kind}-cancel`, { access: 'read_only', workdir: otherWorkdir, budget: { maxDurationMs: 3000 } })
      const handle = await adapter.start(spec)
      await waitForFile(capture)
      await adapter.cancel(spec.executionId); await adapter.cancel(spec.executionId)
      const result = await assertResolved(handle)
      assert.equal(result.outcome, 'cancelled')
      const args = JSON.parse(fs.readFileSync(capture, 'utf8'))
      assert.equal(args.cwd, otherWorkdir)
      assert.ok(kind === 'claude' ? args.argv.includes('--disallowedTools') : args.argv.includes('read-only'))
    })
    await t.test(`${kind} timeout resolves as timed_out`, async () => {
      const adapter = cliAdapter(kind, { VAO_HANG: '1' })
      const handle = await adapter.start(baseSpec(`${kind}-timeout`, { budget: { maxDurationMs: 250 } }))
      assert.equal((await assertResolved(handle)).outcome, 'timed_out')
    })
  }

  await t.test('OpenAI-compatible adapter maps tools, usage and configured vision', async () => {
    const api = await fakeApi()
    try {
      const adapter = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } })
      assert.equal(adapter.capabilities().canUseVision, false)
      const handle = await adapter.start(baseSpec('openai-success'))
      const seen = await events(handle)
      const result = await assertResolved(handle)
      assert.equal(result.outcome, 'succeeded')
      assert.equal(result.tokensIn, 24)
      assert.equal(result.tokensOut, 12)
      assert.ok(seen.some((e) => e.activity?.type === 'file.read'))
    } finally { await api.close() }
  })
})

test('ToolGrant resolution fails closed before worker execution', async () => {
  const missing: ToolGrant = { id: 'missing' }
  await assert.rejects(() => cliAdapter('claude').start(baseSpec('no-resolver', { tools: [missing] })), /required tool grant could not be resolved: missing/)
  await assert.rejects(() => new ClaudeCliAdapter({ group: { type: 'claude-cli' }, resolveTool: () => undefined }).start(baseSpec('undefined', { tools: [missing] })), /required tool grant could not be resolved: missing/)
  await assert.rejects(() => new ClaudeCliAdapter({ group: { type: 'claude-cli' }, resolveTool: (grant) => grant.id === 'ok' ? { id: grant.id } : undefined }).start(baseSpec('partial', { tools: [{ id: 'ok' }, missing] })), /required tool grant could not be resolved: missing/)
  const adapter = new ClaudeCliAdapter({ group: { type: 'claude-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: 'claude' } }, resolveTool: (grant) => ({ id: grant.id }) })
  const handle = await adapter.start(baseSpec('resolved', { tools: [{ id: 'ok' }] }))
  assert.equal((await handle.result).outcome, 'succeeded')
})

test('runtime JS and declaration exports stay in sync', async () => {
  const runtime = await import('../runtime/index.js')
  const declaration = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../runtime/index.d.ts'), 'utf8')
  const declared = [...declaration.matchAll(/^export (?:class|const|function) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]).sort()
  assert.deepEqual(Object.keys(runtime).sort(), declared)
})
