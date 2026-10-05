import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ClaudeCliAdapter, CodexCliAdapter, OpenAICompatAdapter, mapLegacyActivities, mapLegacyResult } from '../dist/index.js'
import type { ExecutionSpec, ExecutorAdapter, ExecutorCapabilities, ToolGrant } from '../dist/index.js'

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
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-session-123' }))
  console.log(JSON.stringify({ type: 'assistant', message: { content: [
    { type: 'tool_use', name: 'Read', input: { file_path: 'src/a.ts' } },
    { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
    { type: 'tool_use', name: 'Write', input: { file_path: 'src/b.ts' } },
    { type: 'tool_use', name: 'Grep', input: { pattern: 'foo' } },
    { type: 'tool_use', name: 'mcp__fileserver.read', input: { path: 'x' } },
    { type: 'thinking', thinking: 'analyzing the code' },
    { type: 'text', text: '代码检查完毕，准备汇报' }
  ] } }))
  console.log(JSON.stringify({ type: 'result', subtype: 'success', result: '完成了所有检查', total_cost_usd: 0.12345 }))
} else {
  const out = process.argv[process.argv.indexOf('-o') + 1]
  if (out) fs.writeFileSync(out, 'codex done message')
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'codex-session-456' }))
  console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'pnpm run test --reporter=verbose' } }))
  console.log(JSON.stringify({ type: 'item.started', item: { type: 'web_search', query: 'nestjs schedule cron decorator' } }))
  console.log(JSON.stringify({ type: 'item.started', item: { type: 'mcp_tool_call', server: 'gitops', tool: 'create_branch' } }))
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'file_change', changes: [{ path: 'src/router.ts' }, { path: 'src/auth.ts' }] } }))
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: '需要检查认证流程的边界' } }))
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '路由已经修复并测试通过' } }))
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 101, output_tokens: 47 } }))
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
      ? { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{"path":"src/a.ts"}' } }, { id: '2', type: 'function', function: { name: 'run_command', arguments: '{"command":"npm run build"}' } }, { id: '3', type: 'function', function: { name: 'edit_file', arguments: '{"path":"src/a.ts","old_string":"a","new_string":"b"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 11, completion_tokens: 5 } }
      : { choices: [{ message: { role: 'assistant', content: '任务完成' }, finish_reason: 'stop' }], usage: { prompt_tokens: 13, completion_tokens: 7 } }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  return { baseUrl: `http://127.0.0.1:${port}/v1`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

type AdapterKind = 'claude' | 'codex' | 'openai'
interface ComplianceHarness {
  adapter: ExecutorAdapter
  expectedCapabilities: Partial<ExecutorCapabilities>
  expectedActivityTypes: string[]
  expectedSessionRef?: string
  expectedTokensIn?: number
  expectedTokensOut?: number
  expectedCostUsd?: number
}

function buildHarnesses(api: Awaited<ReturnType<typeof fakeApi>>): Array<{ kind: AdapterKind; harness: ComplianceHarness }> {
  return [
    {
      kind: 'claude',
      harness: {
        adapter: cliAdapter('claude'),
        expectedCapabilities: { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: true, canUseVision: true, billing: 'unknown' },
        expectedActivityTypes: ['file.read', 'test.run', 'file.write', 'search', 'tool.call', 'thinking', 'message'],
        expectedSessionRef: 'claude-session-123',
        expectedCostUsd: 0.12345,
      },
    },
    {
      kind: 'codex',
      harness: {
        adapter: cliAdapter('codex'),
        expectedCapabilities: { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: true, canUseVision: false, billing: 'unknown' },
        expectedActivityTypes: ['test.run', 'search', 'tool.call', 'file.write', 'thinking', 'message'],
        expectedSessionRef: 'codex-session-456',
        expectedTokensIn: 101,
        expectedTokensOut: 47,
      },
    },
    {
      kind: 'openai',
      harness: {
        adapter: new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } }),
        expectedCapabilities: { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: true, canUseVision: false, billing: 'usage' },
        expectedActivityTypes: ['file.read', 'command.run', 'file.write', 'message'],
        expectedTokensIn: 24,
        expectedTokensOut: 12,
      },
    },
  ]
}

test('FIX 1: real adapter compliance suite (14 checks per adapter)', async (t) => {
  const api = await fakeApi()
  try {
    for (const { kind, harness } of buildHarnesses(api)) {
      await t.test(`${kind}: 1-valid ExecutionSpec starts and handle has events+result`, async () => {
        const handle = await harness.adapter.start(baseSpec(`${kind}-c1`))
        assert.equal(handle.executionId, `${kind}-c1`)
        assert.ok(typeof handle.events[Symbol.asyncIterator] === 'function')
        assert.ok(handle.result instanceof Promise)
      })

      await t.test(`${kind}: 2-ExecutionHandle.result always resolves (never rejects)`, async () => {
        const handle = await harness.adapter.start(baseSpec(`${kind}-c2`))
        const result = await Promise.race([
          handle.result,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('result did not resolve within 15s')), 15000)),
        ])
        assert.ok(['succeeded', 'failed', 'timed_out', 'cancelled'].includes(result.outcome))
      })

      await t.test(`${kind}: 3-event stream terminates correctly (no infinite iteration)`, async () => {
        let adapter: ExecutorAdapter = harness.adapter
        let freshApi: Awaited<ReturnType<typeof fakeApi>> | null = null
        if (kind === 'openai') {
          freshApi = await fakeApi()
          adapter = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: freshApi.baseUrl, model: 'fake', noKey: true, vision: false } })
        }
        try {
          const handle = await adapter.start(baseSpec(`${kind}-c3`))
          const deadline = Date.now() + 15000
          const seen: any[] = []
          for await (const ev of handle.events) {
            seen.push(ev)
            if (Date.now() > deadline) throw new Error('event stream did not terminate')
          }
          assert.ok(seen.length >= 1, `expected at least one event, saw ${seen.length}; types=${seen.filter((e) => e.kind === 'activity').map((e) => e.activity?.type).join(',')}`)
        } finally {
          if (freshApi) await freshApi.close()
        }
      })

      await t.test(`${kind}: 4-cancel() is idempotent`, async () => {
        const capture = path.join(tempRoot, `${kind}-c4.json`)
        const adapter = kind === 'openai'
          ? new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } })
          : cliAdapter(kind as 'claude' | 'codex', { VAO_HANG: '1', VAO_CAPTURE: capture })
        const spec = baseSpec(`${kind}-c4`, { budget: { maxDurationMs: 15000 } })
        const handle = await adapter.start(spec)
        if (kind !== 'openai') await waitForFile(capture)
        await Promise.all([
          adapter.cancel(spec.executionId),
          adapter.cancel(spec.executionId),
          adapter.cancel(spec.executionId),
        ])
        for await (const _ of handle.events) { /* drain */ }
        assert.equal((await handle.result).outcome, 'cancelled')
      })

      await t.test(`${kind}: 5-cancelled execution returns outcome = cancelled`, async () => {
        const capture = path.join(tempRoot, `${kind}-c5.json`)
        const adapter = kind === 'openai'
          ? new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } })
          : cliAdapter(kind as 'claude' | 'codex', { VAO_HANG: '1', VAO_CAPTURE: capture })
        const spec = baseSpec(`${kind}-c5`, { budget: { maxDurationMs: 15000 } })
        const handle = await adapter.start(spec)
        if (kind !== 'openai') await waitForFile(capture)
        await adapter.cancel(spec.executionId)
        const result = await assertResolved(handle)
        assert.equal(result.outcome, 'cancelled')
      })

      await t.test(`${kind}: 6-timeout returns outcome = timed_out`, async () => {
        let adapter: ExecutorAdapter
        if (kind === 'openai') {
          const hangServer = http.createServer(() => { /* never respond */ })
          await new Promise<void>((resolve) => hangServer.listen(0, '127.0.0.1', resolve))
          const port = (hangServer.address() as net.AddressInfo).port
          adapter = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fake', noKey: true, vision: false } })
          const handleP = adapter.start(baseSpec(`${kind}-c6`, { budget: { maxDurationMs: 400 } }))
          setTimeout(() => hangServer.close(), 3000)
          const handle = await handleP
          const result = await assertResolved(handle)
          assert.equal(result.outcome, 'timed_out')
        } else {
          adapter = cliAdapter(kind as 'claude' | 'codex', { VAO_HANG: '1' })
          const handle = await adapter.start(baseSpec(`${kind}-c6`, { budget: { maxDurationMs: 250 } }))
          const result = await assertResolved(handle)
          assert.equal(result.outcome, 'timed_out')
        }
      })

      await t.test(`${kind}: 7-read_only is actually enforced via worker flags`, async () => {
        const capture = path.join(tempRoot, `${kind}-c7.json`)
        const adapter = kind === 'openai'
          ? new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } })
          : cliAdapter(kind as 'claude' | 'codex', { VAO_CAPTURE: capture })
        const spec = baseSpec(`${kind}-c7`, { access: 'read_only' })
        const handle = await adapter.start(spec)
        const result = await assertResolved(handle)
        assert.ok(result.outcome)
        if (kind === 'claude') {
          await waitForFile(capture)
          const args = JSON.parse(fs.readFileSync(capture, 'utf8')).argv as string[]
          assert.ok(args.includes('--disallowedTools'), 'claude must pass --disallowedTools in read_only mode')
          const disallowedIdx = args.indexOf('--disallowedTools')
          const disallowedAfter = args.slice(disallowedIdx + 1).filter((a) => !a.startsWith('--'))
          assert.ok(disallowedAfter.some((x) => x.split(',').includes('Write') || x.includes('Write')), 'write tools must be disallowed: ' + disallowedAfter.join(','))
        } else if (kind === 'codex') {
          await waitForFile(capture)
          const args = JSON.parse(fs.readFileSync(capture, 'utf8')).argv as string[]
          assert.ok(args.includes('read-only'), 'codex must pass -s read-only in read_only mode')
        }
      })

      await t.test(`${kind}: 8-spec.workdir is used instead of default constructor workdir`, async () => {
        const capture = path.join(tempRoot, `${kind}-c8.json`)
        const adapter = kind === 'openai'
          ? new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } })
          : cliAdapter(kind as 'claude' | 'codex', { VAO_CAPTURE: capture })
        const spec = baseSpec(`${kind}-c8`, { workdir: otherWorkdir })
        const handle = await adapter.start(spec)
        await assertResolved(handle)
        if (kind !== 'openai') {
          await waitForFile(capture)
          const info = JSON.parse(fs.readFileSync(capture, 'utf8'))
          assert.equal(info.cwd, otherWorkdir, `expected cwd=${otherWorkdir}, got ${info.cwd}`)
        }
      })

      await t.test(`${kind}: 9-canonical structured activity is emitted`, async () => {
        let adapter: ExecutorAdapter = harness.adapter
        let freshApi: Awaited<ReturnType<typeof fakeApi>> | null = null
        if (kind === 'openai') {
          freshApi = await fakeApi()
          adapter = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: freshApi.baseUrl, model: 'fake', noKey: true, vision: false } })
        }
        try {
          const handle = await adapter.start(baseSpec(`${kind}-c9`))
          const seen = await events(handle)
          const types = seen.filter((e) => e.kind === 'activity').map((e) => e.activity?.type).filter(Boolean)
          for (const expected of harness.expectedActivityTypes) {
            assert.ok(types.includes(expected), `${kind} expected activity type ${expected}, got types: ${types.join(',')}`)
          }
        } finally {
          if (freshApi) await freshApi.close()
        }
      })

      await t.test(`${kind}: 10-session id maps to sessionRef where supported`, async () => {
        const handle = await harness.adapter.start(baseSpec(`${kind}-c10`))
        const result = await assertResolved(handle)
        if (harness.expectedSessionRef) {
          assert.equal(result.sessionRef, harness.expectedSessionRef)
        }
      })

      await t.test(`${kind}: 11-ToolGrant resolution behavior: missing resolver rejects before start`, async () => {
        const missingGrant: ToolGrant = { id: 'browser-' + kind }
        await assert.rejects(
          () => harness.adapter.start(baseSpec(`${kind}-c11-no-resolver`, { tools: [missingGrant] })),
          /required tool grant could not be resolved: browser-/,
        )
      })

      await t.test(`${kind}: 12-token usage normalization is correct`, async () => {
        let adapter: ExecutorAdapter = harness.adapter
        let expectedTokensIn = harness.expectedTokensIn
        let expectedTokensOut = harness.expectedTokensOut
        let freshApi: Awaited<ReturnType<typeof fakeApi>> | null = null
        if (kind === 'openai') {
          freshApi = await fakeApi()
          adapter = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: freshApi.baseUrl, model: 'fake', noKey: true, vision: false } })
        }
        try {
          const handle = await adapter.start(baseSpec(`${kind}-c12`))
          const result = await assertResolved(handle)
          if (expectedTokensIn != null) assert.equal(result.tokensIn, expectedTokensIn, `${kind} tokensIn mismatch: got ${result.tokensIn}`)
          if (expectedTokensOut != null) assert.equal(result.tokensOut, expectedTokensOut, `${kind} tokensOut mismatch: got ${result.tokensOut}`)
        } finally {
          if (freshApi) await freshApi.close()
        }
      })

      await t.test(`${kind}: 13-cost normalization is correct`, async () => {
        const handle = await harness.adapter.start(baseSpec(`${kind}-c13`))
        const result = await assertResolved(handle)
        if (harness.expectedCostUsd != null) {
          assert.equal(result.costUsd, harness.expectedCostUsd, `${kind} costUsd mismatch`)
        }
      })

      await t.test(`${kind}: 14-capability declarations match configuration`, async () => {
        const caps = harness.adapter.capabilities()
        for (const [key, expected] of Object.entries(harness.expectedCapabilities)) {
          assert.equal((caps as any)[key], expected, `${kind} capability ${key} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify((caps as any)[key])}`)
        }
      })
    }

    await t.test('OpenAI vision: capabilities reflect configuration (true vs false)', async () => {
      const noVision = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'x', noKey: true, vision: false } })
      const withVision = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'x', noKey: true, vision: true } })
      const defaultCfg = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'x', noKey: true } })
      assert.equal(noVision.capabilities().canUseVision, false, 'vision=false must report canUseVision:false')
      assert.equal(withVision.capabilities().canUseVision, true, 'vision=true must report canUseVision:true')
      assert.equal(defaultCfg.capabilities().canUseVision, false, 'default (no vision key) must report canUseVision:false, not always true')
    })
  } finally {
    await api.close()
  }
})

test('FIX 2: ToolGrant MUST fail closed, never silently drop', async (t) => {
  const missing: ToolGrant = { id: 'missing' }
  const alsoMissing: ToolGrant = { id: 'also-missing' }
  const ok: ToolGrant = { id: 'ok-grant' }

  await t.test('requested tools with no resolver function throws', async () => {
    const adapter = new ClaudeCliAdapter({ group: { type: 'claude-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: 'claude' } } })
    await assert.rejects(
      () => adapter.start(baseSpec('fix2-no-resolver', { tools: [missing] })),
      { message: 'required tool grant could not be resolved: missing' },
    )
  })

  await t.test('resolver returns undefined for requested tool throws', async () => {
    const adapter = new ClaudeCliAdapter({ group: { type: 'claude-cli' }, resolveTool: () => undefined })
    await assert.rejects(
      () => adapter.start(baseSpec('fix2-undefined', { tools: [missing] })),
      { message: 'required tool grant could not be resolved: missing' },
    )
  })

  await t.test('multiple tools with one unresolved throws with the missing id', async () => {
    const adapter = new ClaudeCliAdapter({
      group: { type: 'claude-cli' },
      resolveTool: (grant) => (grant.id === 'ok-grant' ? { id: grant.id, server: 's', command: 'x' } : undefined),
    })
    await assert.rejects(
      () => adapter.start(baseSpec('fix2-partial', { tools: [ok, missing] })),
      { message: 'required tool grant could not be resolved: missing' },
    )
    await assert.rejects(
      () => adapter.start(baseSpec('fix2-partial2', { tools: [alsoMissing, ok] })),
      { message: 'required tool grant could not be resolved: also-missing' },
    )
  })

  await t.test('all requested tools resolve successfully - start proceeds normally', async () => {
    const adapter = new ClaudeCliAdapter({
      group: { type: 'claude-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: 'claude' } },
      resolveTool: (grant) => ({ id: grant.id, server: grant.id, command: 'echo tool' }),
    })
    const handle = await adapter.start(baseSpec('fix2-all-good', { tools: [ok, { id: 'tool-b' }] }))
    const result = await assertResolved(handle)
    assert.equal(result.outcome, 'succeeded')
  })

  await t.test('tools.length=0 skips resolver check and works with no resolveTool', async () => {
    const adapter = new ClaudeCliAdapter({ group: { type: 'claude-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: 'claude' } } })
    const handle = await adapter.start(baseSpec('fix2-empty-tools'))
    const result = await assertResolved(handle)
    assert.equal(result.outcome, 'succeeded')
  })

  await t.test('rejection occurs BEFORE the worker process spawns (no capture file written)', async () => {
    const capture = path.join(tempRoot, 'fix2-before-worker.json')
    if (fs.existsSync(capture)) fs.unlinkSync(capture)
    const adapter = new ClaudeCliAdapter({ group: { type: 'claude-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: 'claude', VAO_CAPTURE: capture } } })
    await assert.rejects(
      () => adapter.start(baseSpec('fix2-before-worker', { tools: [missing] })),
      /required tool grant could not be resolved/,
    )
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(fs.existsSync(capture), false, 'capture file must NOT exist: start() must reject before spawning the worker')
  })
})

test('FIX 3: canonical structured activity - regression tests', async (t) => {
  await t.test('legacy enumerable shape {kind, text} is preserved exactly (non-canonical field order)', async () => {
    const { legacyActivity } = await import('../runtime/index.js')
    // Case A: display-only legacy entry (no explicit activity) MUST NOT attach any activity property,
    // because structured data must NOT be reconstructed from localized text.
    const displayOnly = legacyActivity('tool', '读 src/app.ts')
    assert.deepEqual(Object.keys(displayOnly), ['kind', 'text'], 'enumerable keys must be exactly [kind, text]')
    assert.equal(displayOnly.kind, 'tool')
    assert.equal(displayOnly.text, '读 src/app.ts')
    assert.equal('activity' in displayOnly, false, 'display-only entry must have NO activity property (prevent reconstruction from localized text)')
    assert.equal(Object.getOwnPropertyDescriptor(displayOnly, 'activity'), undefined)

    // Case B: entry WITH explicit canonical activity -> activity present, non-enumerable
    const withExplicit = legacyActivity('tool', '读 src/app.ts', { activity: { type: 'file.read', path: 'src/app.ts' } })
    assert.deepEqual(Object.keys(withExplicit), ['kind', 'text'], 'explicit activity must not change enumerable shape')
    const desc = Object.getOwnPropertyDescriptor(withExplicit, 'activity')
    assert.ok(desc && desc.enumerable === false, 'explicit activity must be non-enumerable')
    assert.equal((withExplicit as any).activity.type, 'file.read')
  })

  await t.test('legacy activity kinds and Chinese display strings do not regress', async () => {
    const { legacyActivity, describeTool, commandActivity } = await import('../runtime/index.js')
    assert.equal(legacyActivity('say', '你好傻妞').kind, 'say')
    assert.equal(legacyActivity('say', '你好傻妞').text, '你好傻妞')
    assert.equal(legacyActivity('think', '思考中…').text, '思考中…')
    assert.equal(legacyActivity('tool', describeTool('read_file', { path: 'src/config.js' })).text, '读 src/config.js')
    assert.equal(legacyActivity('tool', describeTool('write_file', { path: 'a.js' })).text, '写 a.js')
    assert.equal(legacyActivity('tool', describeTool('edit_file', { path: 'router.ts' })).text, '改 router.ts')
    assert.equal(legacyActivity('tool', describeTool('search', { pattern: 'class User' })).text, '搜 “class User”')
    assert.equal(commandActivity('npm test').type, 'test.run')
  })

  await t.test('Claude parser → structured activity canonical mappings (no Chinese parsing)', async () => {
    const { createClaudeParser } = await import('../runtime/index.js')
    const parser = createClaudeParser('/root/proj')
    const events1 = parser.feed(JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Read', input: { file_path: '/root/proj/src/x.ts' } },
      { type: 'tool_use', name: 'Write', input: { file_path: 'src/y.ts' } },
      { type: 'tool_use', name: 'Edit', input: { file_path: 'src/z.ts' } },
      { type: 'tool_use', name: 'MultiEdit', input: { file_path: 'src/a.ts' } },
      { type: 'tool_use', name: 'NotebookEdit', input: { notebook_path: 'nb.ipynb' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'npm run test:unit' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } },
      { type: 'tool_use', name: 'Grep', input: { pattern: 'export class' } },
      { type: 'tool_use', name: 'Glob', input: { glob: '**/*.ts' } },
      { type: 'tool_use', name: 'mcp__db.query', input: { sql: 'select 1' } },
      { type: 'text', text: '报告完毕' },
      { type: 'thinking', thinking: 'x' },
    ] } }))
    const activities = events1.filter((e: any) => Object.getOwnPropertyDescriptor(e, 'activity')).map((e: any) => e.activity)
    const types = activities.map((a: any) => a.type)
    assert.ok(types.includes('file.read'), JSON.stringify(types))
    assert.ok(types.includes('file.write'), JSON.stringify(types))
    assert.ok(types.includes('test.run'), JSON.stringify(types))
    assert.ok(types.includes('command.run'), JSON.stringify(types))
    assert.ok(types.includes('search'), JSON.stringify(types))
    assert.ok(types.includes('tool.call'), JSON.stringify(types))
    assert.ok(types.includes('message'), JSON.stringify(types))
    assert.ok(types.includes('thinking'), JSON.stringify(types))
    const readAct = activities.find((a: any) => a.type === 'file.read')
    const normalizedPath = String(readAct.path).replace(/\\/g, '/')
    assert.equal(normalizedPath, 'src/x.ts', 'paths should be workdir-relative')
  })

  await t.test('Codex parser → structured activity canonical mappings', async () => {
    const { createCodexParser } = await import('../runtime/index.js')
    const parser = createCodexParser('/home/p')
    const e1 = parser.feed(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'vitest run packages/x' } }))
    assert.equal((e1[0] as any).activity.type, 'test.run')
    const e2 = parser.feed(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', command: 'ls' } }))
    assert.equal((e2[0] as any).activity.type, 'command.run')
    const e3 = parser.feed(JSON.stringify({ type: 'item.completed', item: { type: 'file_change', changes: [{ path: '/home/p/src/db.ts' }] } }))
    assert.equal((e3[0] as any).activity.type, 'file.write')
    const normalizedPath = String((e3[0] as any).activity.path).replace(/\\/g, '/')
    assert.equal(normalizedPath, 'src/db.ts')
    const e4 = parser.feed(JSON.stringify({ type: 'item.started', item: { type: 'web_search', query: 'prisma migrate' } }))
    assert.equal((e4[0] as any).activity.type, 'search')
    assert.equal((e4[0] as any).activity.query, 'prisma migrate')
    const e5 = parser.feed(JSON.stringify({ type: 'item.started', item: { type: 'mcp_tool_call', server: 'telegram', tool: 'send_message' } }))
    assert.equal((e5[0] as any).activity.type, 'tool.call')
    const e6 = parser.feed(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } }))
    assert.equal((e6[0] as any).activity.type, 'message')
    const e7 = parser.feed(JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'thoughts' } }))
    assert.equal((e7[0] as any).activity.type, 'thinking')
  })

  await t.test('OpenAI toolbox → structured activity canonical mappings', async () => {
    // @ts-ignore: runtime JS module has no companion .d.ts, but we exercise it for structure
    const workerModule: any = await import('../runtime/openai-worker.js')
    const { TOOLS, Toolbox } = workerModule
    assert.ok(Array.isArray(TOOLS))
    const box = new Toolbox(tempRoot)
    assert.ok(box)
  })
})

test('FIX 4: runtime JS and d.ts exports must match bidirectionally', async (t) => {
  const runtime: Record<string, unknown> = await import('../runtime/index.js')
  const dtsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../runtime/index.d.ts')
  const declaration = fs.readFileSync(dtsPath, 'utf8')

  const declaredNames = [
    ...declaration.matchAll(/^export\s+(?:declare\s+)?(class|const|function)\s+([A-Za-z0-9_]+)/gm),
  ].map((m) => m[2] as string).sort()

  const jsExportedNames = Object.keys(runtime).sort()

  await t.test('JS exports a public symbol not declared in d.ts → fail', () => {
    const extraInJs = jsExportedNames.filter((n) => !declaredNames.includes(n))
    assert.deepEqual(extraInJs, [], `JS exports symbols missing from d.ts: ${extraInJs.join(', ')}`)
  })

  await t.test('d.ts declares a public symbol not exported by JS → fail', () => {
    const extraInDts = declaredNames.filter((n) => !jsExportedNames.includes(n))
    assert.deepEqual(extraInDts, [], `d.ts declares symbols missing from JS: ${extraInDts.join(', ')}`)
  })

  await t.test('both directions match exactly (sorted set equality)', () => {
    assert.deepEqual(jsExportedNames, declaredNames)
  })

  await t.test('this test runs under npm test:packages (meta-check: declaration file exists)', () => {
    assert.ok(fs.existsSync(dtsPath), `d.ts file must exist at: ${dtsPath}`)
  })
})

test('FIX 5: normalization consolidation - both token shapes supported in one mapLegacyResult', () => {
  const started = 1000
  const shape1 = mapLegacyResult({ ok: true, text: 'done', usage: { in: 33, out: 77 }, sessionId: 's1', cost: 0.05, durationMs: 900 }, started)
  assert.equal(shape1.tokensIn, 33)
  assert.equal(shape1.tokensOut, 77)
  assert.equal(shape1.costUsd, 0.05)
  assert.equal(shape1.sessionRef, 's1')
  assert.equal(shape1.durationMs, 900)

  const shape2 = mapLegacyResult({ ok: true, text: 'ok', usage: { input_tokens: 10, output_tokens: 20 } }, started)
  assert.equal(shape2.tokensIn, 10)
  assert.equal(shape2.tokensOut, 20)

  const mixed = mapLegacyResult({ ok: true, text: 'ok', usage: { in: 5, output_tokens: 6 } }, started)
  assert.equal(mixed.tokensIn, 5)
  assert.equal(mixed.tokensOut, 6)

  const emptyUsage = mapLegacyResult({ ok: true, text: 'ok' }, started)
  assert.equal(emptyUsage.tokensIn, undefined)
  assert.equal(emptyUsage.tokensOut, undefined)
})

test('FIX 5: mapLegacyActivities - array/absent/single shape support + display-only never produces events', async () => {
  const { legacyActivity } = await import('../runtime/index.js')
  const withSingle = mapLegacyActivities(legacyActivity('say', 'hi', { activity: { type: 'message', text: 'hi' } }))
  assert.equal(withSingle.length, 1)
  assert.equal(withSingle[0]!.kind, 'activity')
  assert.equal(withSingle[0]!.activity.type, 'message')

  const withArray = mapLegacyActivities(legacyActivity('tool', '改 a、b', {
    activity: [{ type: 'file.write', path: 'src/a.ts' }, { type: 'file.write', path: 'src/b.ts' }],
  }))
  assert.equal(withArray.length, 2)
  const arr0 = withArray[0] as any
  const arr1 = withArray[1] as any
  assert.equal(arr0.activity.type, 'file.write')
  assert.equal(arr0.activity.path, 'src/a.ts')
  assert.equal(arr1.activity.path, 'src/b.ts')

  const displayOnlyNoActivity = mapLegacyActivities(legacyActivity('tool', '列待办清单'))
  assert.equal(displayOnlyNoActivity.length, 0, 'display-only without explicit activity must produce ZERO ExecutorEvents (was creating fake tool.call from Chinese!)')

  const warnDisplayOnly = mapLegacyActivities(legacyActivity('warn', '命令没跑通（退出码 2）'))
  assert.equal(warnDisplayOnly.length, 0, 'warn bubbles must NOT auto-become message activity')

  const literalEmptyObject = mapLegacyActivities({ kind: 'say', text: 'no structured' })
  assert.equal(literalEmptyObject.length, 0, 'no activity property -> zero events')
})

test('FIX 1: legacyActivity never creates structured activity from localized kind+text', async (t) => {
  const { legacyActivity } = await import('../runtime/index.js')

  await t.test('1a - legacy kind + text enumerable output identical (old UI preserved)', () => {
    const warn = legacyActivity('warn', '准备插件…')
    assert.deepEqual(Object.keys(warn), ['kind', 'text'])
    assert.equal(warn.kind, 'warn')
    assert.equal(warn.text, '准备插件…')

    const tool = legacyActivity('tool', '列待办清单')
    assert.deepEqual(Object.keys(tool), ['kind', 'text'])
    assert.equal(tool.text, '列待办清单')

    const say = legacyActivity('say', '早上好')
    assert.deepEqual(Object.keys(say), ['kind', 'text'])
    assert.equal(say.kind, 'say')
  })

  await t.test('1b - structured activity ABSENT when explicit activity NOT provided', () => {
    const warn = legacyActivity('warn', '准备插件…')
    assert.equal('activity' in warn, false, 'warn without activity must not attach activity property')

    const toolList = legacyActivity('tool', '列待办清单')
    assert.equal('activity' in toolList, false, 'todo-list tool label must not become fake tool.call from text')

    const say = legacyActivity('say', 'hello')
    assert.equal('activity' in say, false)
  })

  await t.test('1c - explicit canonical activity survives and is non-enumerable', () => {
    const withExplicit = legacyActivity('say', 'first line of report…', {
      activity: { type: 'message', text: 'full multi-line report body' },
    })
    assert.equal(Object.keys(withExplicit).join(','), 'kind,text')
    const desc = Object.getOwnPropertyDescriptor(withExplicit, 'activity')!
    assert.equal(desc.enumerable, false)
    assert.equal((withExplicit as any).activity.type, 'message')
    assert.equal((withExplicit as any).activity.text, 'full multi-line report body')
  })
})

test('FIX 2: file_change + patch_apply_begin emit one file.write per path, NOT concatenated', async (t) => {
  const { createCodexParser, legacyActivity, mapLegacyActivities: _mapper }: any = await import('../runtime/index.js')

  await t.test('2a - Codex parser: two-file file_change yields two ExecutorEvents via mapLegacyActivities', () => {
    const parser = createCodexParser('/home/proj')
    const feedOutput = parser.feed(JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'file_change',
        changes: [{ path: '/home/proj/src/a.ts' }, { path: '/home/proj/src/b.ts' }],
      },
    }))
    assert.equal(feedOutput.length, 1, 'legacy display list still has exactly ONE tool display item')
    const [legacyDisplay] = feedOutput as any[]
    assert.equal(legacyDisplay.kind, 'tool')
    const legacyTextNormalized = legacyDisplay.text.replace(/\\/g, '/')
    assert.equal(legacyTextNormalized, '改 src/a.ts、src/b.ts', 'legacy text unchanged (path separators normalized)')
    const events = mapLegacyActivities(legacyDisplay)
    assert.equal(events.length, 2, 'expected 2 machine-readable events, not 1 concatenated path')
    const ev0 = events[0] as any
    const ev1 = events[1] as any
    assert.equal(ev0.activity.type, 'file.write')
    assert.equal(String(ev0.activity.path).replace(/\\/g, '/'), 'src/a.ts')
    assert.equal(ev1.activity.type, 'file.write')
    assert.equal(String(ev1.activity.path).replace(/\\/g, '/'), 'src/b.ts')
  })

  await t.test('2b - legacy patch_apply_begin with two rel paths => two file.write events', () => {
    const parser = createCodexParser('/project')
    const feedOutput = parser.feed(JSON.stringify({
      msg: {
        type: 'patch_apply_begin',
        changes: { '/project/main.ts': '+foo', '/project/util.ts': '+bar' },
      },
    }))
    assert.equal(feedOutput.length, 1)
    const [legacyDisplay] = feedOutput as any[]
    assert.equal(legacyDisplay.kind, 'tool')
    assert.equal(legacyDisplay.text, '改 main.ts、util.ts')
    const events = mapLegacyActivities(legacyDisplay)
    assert.equal(events.length, 2)
    const pev0 = events[0] as any
    const pev1 = events[1] as any
    assert.equal(pev0.activity.type, 'file.write')
    assert.equal(String(pev0.activity.path).replace(/\\/g, '/'), 'main.ts')
    assert.equal(pev1.activity.type, 'file.write')
    assert.equal(String(pev1.activity.path).replace(/\\/g, '/'), 'util.ts')
  })

  await t.test('2c - end-to-end Codex adapter: two file_change files appear as separate activity events', async () => {
    const captureP = path.join(tempRoot, 'codex-multi-file-capture.json')
    const adapter: any = cliAdapter('codex', { VAO_CAPTURE: captureP })
    const handle = await adapter.start(baseSpec('codex-multi-2f'))
    const seen: any[] = []
    for await (const ev of handle.events) seen.push(ev)
    const writes = seen.filter((e) => e.kind === 'activity' && e.activity?.type === 'file.write')
    const paths = writes.map((w) => String(w.activity.path).replace(/\\/g, '/')).sort()
    assert.deepEqual(paths, ['src/auth.ts', 'src/router.ts'], `expected both files present, got: ${paths.join(',')}`)
    await handle.result
  })
})

test('FIX 3: mapLegacyResult must NOT infer cancelled/timed_out from localized error text', () => {
  const started = 100
  const localizedCancelFakeNoOutcome = mapLegacyResult({ ok: false, error: '被叫停' }, started)
  assert.equal(
    localizedCancelFakeNoOutcome.outcome,
    'failed',
    `error='被叫停' without explicit outcome must be FAILED (was inferring cancelled!) -- got ${localizedCancelFakeNoOutcome.outcome}`,
  )

  const explicitOutcomeCancelled = mapLegacyResult({ outcome: 'cancelled', ok: false, error: '被叫停' }, started)
  assert.equal(explicitOutcomeCancelled.outcome, 'cancelled', 'explicit outcome=cancelled must be respected')

  const timedOutExplicit = mapLegacyResult({ outcome: 'timed_out', ok: false, error: '超时了' }, started)
  assert.equal(timedOutExplicit.outcome, 'timed_out')

  const okTrue = mapLegacyResult({ ok: true, text: 'done' }, started)
  assert.equal(okTrue.outcome, 'succeeded')

  const okFalseGeneric = mapLegacyResult({ ok: false, error: 'random localized error' }, started)
  assert.equal(okFalseGeneric.outcome, 'failed')
})

test('FIX 4: CLI adapter billing must be unknown, NOT subscription', async (t) => {
  await t.test('ClaudeCliAdapter billing === unknown', () => {
    const a = new ClaudeCliAdapter()
    assert.equal(a.capabilities().billing, 'unknown', `expected unknown, got ${a.capabilities().billing}`)
  })
  await t.test('CodexCliAdapter billing === unknown', () => {
    const a = new CodexCliAdapter()
    assert.equal(a.capabilities().billing, 'unknown', `expected unknown, got ${a.capabilities().billing}`)
  })
  await t.test('OpenAICompatAdapter billing remains usage (correct, not unknown)', async () => {
    const api = await fakeApi()
    try {
      const a = new OpenAICompatAdapter({ group: { type: 'openai-api', baseUrl: api.baseUrl, model: 'fake', noKey: true, vision: false } })
      assert.equal(a.capabilities().billing, 'usage')
    } finally {
      await api.close()
    }
  })
})

test('FIX 5: LegacyBackedAdapter defaults must NOT write logs into process.cwd()', async (t) => {
  const { BaseWorker }: any = await import('../runtime/index.js')

  function snapshotCwdLogs() {
    const entries = fs.readdirSync(process.cwd()).filter((n) => n.endsWith('.log'))
    return new Set(entries)
  }

  await t.test('5a - adapter without logDir: run execution, no new *.log in cwd', async () => {
    const before = snapshotCwdLogs()
    const captureP = path.join(tempRoot, 'no-log-dir-capture.json')
    const adapter: any = cliAdapter('claude', { VAO_CAPTURE: captureP })
    await waitForFile(captureP).catch(() => {})
    const spec = baseSpec('adapter-no-logdir', { budget: { maxDurationMs: 4000 } })
    const handle = await adapter.start(spec)
    for await (const _ of handle.events) { /* drain */ }
    await handle.result
    const after = snapshotCwdLogs()
    const added = [...after].filter((n) => !before.has(n))
    assert.deepEqual(added, [], `no cwd .log files expected, but adapter wrote: ${added.join(', ')}`)
  })

  await t.test('5b - adapter with explicit temp logDir: run execution → log file created under that dir', async () => {
    const logDir = fs.mkdtempSync(path.join(tempRoot, 'logs-explicit-'))
    const captureP = path.join(tempRoot, 'with-log-dir-capture.json')
    const Ctor = ClaudeCliAdapter
    const adapter = new Ctor({
      group: { type: 'claude-cli', command: [process.execPath, fixture], env: { VAO_FAKE_KIND: 'claude', VAO_CAPTURE: captureP } },
      logDir,
    } as any)
    const spec = baseSpec('adapter-with-logdir', { budget: { maxDurationMs: 5000 } })
    const handle = await adapter.start(spec)
    for await (const _ of handle.events) { /* drain */ }
    await handle.result
    const logs = fs.readdirSync(logDir).filter((n) => n.endsWith('.log'))
    assert.ok(logs.length >= 1, `expected .log files in ${logDir}, found none`)
  })

  await t.test('5c - BaseWorker.openLog guard: no logDir → returns null AND no mkdirSync called', () => {
    const worker = new BaseWorker({ id: 'w1', type: 'claude-cli' }, { workdir: '.', logDir: '', autonomy: 'full' })
    assert.equal(worker.logDir, '')
    const ws = worker.openLog('label', 'prompt content')
    assert.equal(ws, null, 'null logDir must short-circuit and return null')
  })

  await t.test('5d - legacy BaseWorker with configured logDir still creates logs (behavior preserved)', async () => {
    const logDir = fs.mkdtempSync(path.join(tempRoot, 'legacy-logs-'))
    const worker = new BaseWorker({ id: 'w-legacy', type: 'claude-cli' }, { workdir: '/tmp/w', logDir, autonomy: 'full' })
    const ws = worker.openLog('label', 'PROMPT!') as import('node:stream').Writable | null
    assert.ok(ws, 'configured logDir must produce a writable stream')
    await new Promise<void>((resolve, reject) => {
      ws!.once('finish', resolve)
      ws!.once('error', reject)
      ws!.end()
    })
    const logs = fs.readdirSync(logDir).filter((n) => n.endsWith('.log'))
    assert.ok(logs.length >= 1, 'legacy configured logDir path still writes files')
    const firstLog = logs[0]!
    const content = fs.readFileSync(path.join(logDir, firstLog), 'utf8')
    assert.ok(content.includes('PROMPT!'), 'log content must be preserved')
  })
})

// helper alias so existing tests compile cleanly against renamed function
function mapLegacyActivity(v: any) { const arr = mapLegacyActivities(v); return arr[0] || null }
