import fs from 'node:fs'
import { CLAUDE_DENY, SAFE_COMMANDS } from './policy.js'
import { describeClaudeTool, describeMcpCall, shortPath, splitMcpName } from './format.js'
import { firstLine, truncate } from './text.js'
import { spawnCmd } from './process.js'
import { legacyActivity } from './activity.js'
import { BaseWorker } from './base-worker.js'

function cleanCmd(cmd) {
  if (Array.isArray(cmd)) cmd = cmd.join(' ')
  cmd = String(cmd || '').trim()
  const sh = cmd.match(/^(?:\S*\/)?(?:bash|zsh|sh)\s+-l?c\s+(['"])([\s\S]*)\1$/)
  if (sh) return sh[2]
  const ps = cmd.match(/-Command\s+(['"]?)([\s\S]*)\1$/i)
  if (ps) return ps[2]
  return cmd
}

/** Parser for `claude -p --output-format stream-json --verbose`. */
export function createClaudeParser(workdir) {
  let result = null
  let lastText = ''
  let sessionId = ''
  return {
    feed(line) {
      let ev
      try {
        ev = JSON.parse(line)
      } catch {
        return []
      }
      const out = []
      if (ev.type === 'system' && ev.subtype === 'init') sessionId = ev.session_id || ''
      else if (ev.type === 'assistant') {
        for (const b of ev.message?.content || []) {
          if (b.type === 'tool_use') out.push(legacyActivity('tool', describeClaudeTool(b.name, b.input || {}, workdir)))
          else if (b.type === 'text' && b.text?.trim()) {
            lastText = b.text
            out.push(legacyActivity('say', firstLine(b.text)))
          } else if (b.type === 'thinking') out.push(legacyActivity('think', '思考中…'))
        }
      } else if (ev.type === 'result') result = ev
      return out
    },
    finish({ code, stderr }) {
      const ok = !!result && !result.is_error && (result.subtype ?? 'success') === 'success'
      const text = (typeof result?.result === 'string' && result.result) || lastText
      let error = ''
      if (!ok) {
        error = result?.subtype && result.subtype !== 'success' ? `Claude 结束状态：${result.subtype}` : ''
        if (!error && result?.is_error) error = firstLine(result.result, 200)
        if (!error) error = firstLine(stderr, 200) || `claude 退出码 ${code}`
      }
      return { ok, text, error, cost: result?.total_cost_usd ?? null, sessionId }
    },
  }
}

function parseArgs(a) {
  if (a && typeof a === 'object') return a
  try {
    return JSON.parse(a)
  } catch {
    return {}
  }
}

/** Parser for `codex exec --json` (thread/turn/item events, plus the older {msg:{…}} shape). */
export function createCodexParser(workdir) {
  let lastMessage = ''
  let failed = ''
  let lastError = ''
  let usage = null
  let sessionId = ''
  return {
    feed(line) {
      let ev
      try {
        ev = JSON.parse(line)
      } catch {
        return []
      }
      const out = []
      const it = ev.item || {}
      switch (ev.type) {
        case 'thread.started':
          sessionId = ev.thread_id || ''
          break
        case 'item.started':
          if (it.type === 'command_execution') out.push(legacyActivity('tool', `跑 ${truncate(cleanCmd(it.command).split('\n')[0], 60)}`))
          else if (it.type === 'mcp_tool_call') out.push(legacyActivity('tool', describeMcpCall(it.server, it.tool, parseArgs(it.arguments))))
          else if (it.type === 'web_search') out.push(legacyActivity('tool', `上网查 ${truncate(it.query, 40)}`))
          break
        case 'item.completed':
          if (it.type === 'agent_message') {
            lastMessage = it.text || lastMessage
            out.push(legacyActivity('say', firstLine(it.text)))
          } else if (it.type === 'file_change') {
            const files = (it.changes || []).map((c) => shortPath(c.path, workdir)).join('、')
            out.push(legacyActivity('tool', `改 ${truncate(files, 60)}`))
          } else if (it.type === 'reasoning') out.push(legacyActivity('think', firstLine(it.text, 50) || '思考中…'))
          else if (it.type === 'command_execution' && it.exit_code != null && it.exit_code !== 0)
            out.push(legacyActivity('warn', `命令没跑通（退出码 ${it.exit_code}）`))
          else if (it.type === 'todo_list') out.push(legacyActivity('tool', '列待办清单'))
          else if (it.type === 'error') out.push(legacyActivity('warn', truncate(it.message, 80)))
          break
        case 'turn.completed':
          usage = ev.usage || null
          break
        case 'turn.failed':
          failed = ev.error?.message || '这一轮失败了'
          break
        case 'error':
          lastError = ev.message || ''
          out.push(legacyActivity('warn', truncate(lastError, 80)))
          break
        default:
          if (ev.msg) {
            const m = ev.msg
            if (m.type === 'agent_message') {
              lastMessage = m.message || lastMessage
              out.push(legacyActivity('say', firstLine(m.message)))
            } else if (m.type === 'exec_command_begin') out.push(legacyActivity('tool', `跑 ${truncate(cleanCmd(m.command), 60)}`))
            else if (m.type === 'patch_apply_begin') out.push(legacyActivity('tool', `改 ${Object.keys(m.changes || {}).map((p) => shortPath(p, workdir)).join('、')}`))
            else if (m.type === 'error') failed = m.message || 'error'
          }
      }
      return out
    },
    finish({ code, stderr }, lastMessageFile) {
      let text = ''
      try {
        text = fs.readFileSync(lastMessageFile, 'utf8').trim()
      } catch {}
      text = text || lastMessage
      const ok = code === 0 && !failed
      const error = ok ? '' : failed || lastError || firstLine(stderr, 200) || `codex 退出码 ${code}`
      return { ok, text, error, usage, sessionId }
    },
  }
}

/** Common run/ask flow for CLI-based workers; subclasses supply the arguments and parser. */
class CliWorker extends BaseWorker {
  command() {
    return this.cfg.command || (this.type === 'claude-cli' ? 'claude' : 'codex')
  }

  async check() {
    const r = await spawnCmd(this.command(), ['--version'], { cwd: this.workdir, env: this.env(), collect: true, timeoutMs: 20000 }).done
    this.available = r.code === 0
    this.version = this.available ? firstLine(r.stdout, 40) : ''
    this.note = this.available ? '' : `没找到 ${Array.isArray(this.command()) ? 'CLI' : this.command()} 命令`
    return this.available
  }

  async run({ prompt, model = '', readOnly = false, onActivity = () => {}, timeoutMs, label = 'task', tools = [], workdir = this.workdir, signal }) {
    const log = this.openLog(label, prompt)
    const started = Date.now()
    const { args, parser, outFile, cleanup = [] } = this.runArgs({ readOnly, label, model, tools, workdir })
    const proc = this.track(
      spawnCmd(this.command(), args, {
        cwd: workdir,
        env: this.env(),
        input: prompt,
        timeoutMs,
        signal,
        onLine: (line) => {
          log?.write(line + '\n')
          for (const a of parser.feed(line)) onActivity(a)
        },
      }),
    )
    const r = await proc.done
    const res = parser.finish(r, outFile)
    for (const f of [outFile, ...cleanup]) if (f) fs.rm(f, { force: true }, () => {})
    if (r.timedOut) Object.assign(res, { ok: false, error: '超时了，被傻妞叫停' })
    else if (r.killed) Object.assign(res, { ok: false, error: '被叫停' })
    else if (r.error?.code === 'ENOENT') Object.assign(res, { ok: false, error: `找不到命令 ${this.command()}` })
    res.outcome = res.ok ? 'succeeded' : r.timedOut ? 'timed_out' : r.killed ? 'cancelled' : 'failed'
    res.durationMs = Date.now() - started
    log?.end(`\n## stderr\n${r.stderr}\n\n## result (${res.durationMs}ms)\n${JSON.stringify(res, null, 2)}\n`)
    return res
  }
}

export class ClaudeCliWorker extends CliWorker {
  permissionArgs(readOnly, tools = []) {
    const c = this.cfg
    const args = ['--permission-mode', c.permissionMode || 'acceptEdits']
    let allow = c.allowedTools
    if (!allow) {
      allow =
        this.autonomy === 'safe'
          ? SAFE_COMMANDS.map((p) => `Bash(${p}:*)`)
          : ['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task']
    }
    // Plugins handed out for this task: `mcp__<server>` allows every tool of that server.
    allow = [...allow, ...tools.map((t) => `mcp__${t.server}`)]
    if (allow.length) args.push('--allowedTools', ...allow)
    const deny = [...(c.disallowedTools || CLAUDE_DENY)]
    if (readOnly) deny.push('Edit', 'Write', 'MultiEdit', 'NotebookEdit')
    if (deny.length) args.push('--disallowedTools', ...deny)
    return args
  }

  modelArgs(model) {
    if (!model) return []
    // If the chosen model isn't available on this account (or is overloaded), Claude Code falls back.
    const fallback = this.cfg.fallbackModel ?? 'sonnet'
    return fallback && fallback !== model ? ['--model', model, '--fallback-model', fallback] : ['--model', model]
  }

  runArgs({ readOnly, model, label, tools = [], workdir = this.workdir }) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose']
    const cleanup = []
    const inject = this.injected(tools)
    if (inject.length) {
      // Start the plugins for this run only; Claude Code's own settings stay untouched.
      const file = `${this.tmpFile(label)}.mcp.json`
      const servers = Object.fromEntries(inject.map((t) => [t.server, { type: 'stdio', command: t.command, args: t.args || [], env: t.env || {} }]))
      fs.writeFileSync(file, JSON.stringify({ mcpServers: servers }, null, 2))
      args.push('--mcp-config', file)
      cleanup.push(file)
    }
    args.push(...this.permissionArgs(readOnly, tools), ...this.modelArgs(model))
    args.push(...(this.cfg.extraArgs || []))
    return { args, parser: createClaudeParser(workdir), cleanup }
  }

  /** One-shot question with no edits: planning, acceptance notes, reports. Read-only tools stay available. */
  async ask(prompt, { model, timeoutMs = 5 * 60 * 1000, label = 'ask' } = {}) {
    const log = this.openLog(label, prompt)
    const args = ['-p', '--output-format', 'json', '--disallowedTools', 'Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task,Agent']
    args.push(...this.modelArgs(model || this.modelFor('medium')))
    const proc = this.track(spawnCmd(this.command(), args, { cwd: this.workdir, env: this.env(), input: prompt, collect: true, timeoutMs }))
    const r = await proc.done
    log?.end(`${r.stdout}\n\n## stderr\n${r.stderr}\n`)
    if (r.killed || r.timedOut) throw new Error(r.timedOut ? '想太久超时了' : '被叫停')
    let obj = null
    try {
      obj = JSON.parse(r.stdout)
    } catch {}
    if (Array.isArray(obj)) obj = obj.findLast?.((e) => e.type === 'result') || obj[obj.length - 1]
    if (!obj) throw new Error(firstLine(r.stderr, 200) || `claude 退出码 ${r.code}`)
    if (obj.is_error) throw new Error(firstLine(obj.result, 200) || 'claude 返回了错误')
    return String(obj.result ?? '')
  }
}

export class CodexCliWorker extends CliWorker {
  sandboxArgs(readOnly) {
    if (readOnly) return ['-s', 'read-only']
    const sandbox = this.cfg.sandbox || 'workspace-write'
    const args = ['-s', sandbox]
    // Full autonomy lets Codex install packages; its sandbox still keeps writes inside the project.
    if (sandbox === 'workspace-write' && this.autonomy !== 'safe' && this.cfg.network !== false) {
      args.push('-c', 'sandbox_workspace_write.network_access=true')
    }
    return args
  }

  runArgs({ readOnly, label, model, tools = [], workdir = this.workdir }) {
    const outFile = this.tmpFile(label)
    const args = ['exec', '--json', '--skip-git-repo-check', '-C', workdir, '-o', outFile, ...this.sandboxArgs(readOnly)]
    if (model) args.push('-m', model)
    // Plugins for this run only, as -c overrides (TOML values); ~/.codex/config.toml stays untouched.
    for (const t of this.injected(tools)) {
      const k = `mcp_servers.${t.server}`
      args.push('-c', `${k}.command=${JSON.stringify(t.command)}`, '-c', `${k}.args=${JSON.stringify(t.args || [])}`)
      const env = Object.entries(t.env || {})
      if (env.length) args.push('-c', `${k}.env={${env.map(([a, b]) => `${JSON.stringify(a)}=${JSON.stringify(String(b))}`).join(',')}}`)
      args.push('-c', `${k}.startup_timeout_sec=120`)
    }
    args.push(...(this.cfg.extraArgs || []), '-')
    return { args, parser: createCodexParser(workdir), outFile }
  }

  async ask(prompt, { model, timeoutMs = 5 * 60 * 1000, label = 'ask' } = {}) {
    const log = this.openLog(label, prompt)
    const outFile = this.tmpFile(label)
    const args = ['exec', '--skip-git-repo-check', '-C', this.workdir, '-s', 'read-only', '-o', outFile]
    if (model || this.modelFor('medium')) args.push('-m', model || this.modelFor('medium'))
    args.push(...(this.cfg.extraArgs || []), '-')
    const proc = this.track(spawnCmd(this.command(), args, { cwd: this.workdir, env: this.env(), input: prompt, collect: true, timeoutMs }))
    const r = await proc.done
    log?.end(`${r.stdout}\n\n## stderr\n${r.stderr}\n`)
    if (r.killed || r.timedOut) throw new Error(r.timedOut ? '想太久超时了' : '被叫停')
    let text = ''
    try {
      text = fs.readFileSync(outFile, 'utf8')
    } catch {}
    fs.rm(outFile, { force: true }, () => {})
    if (r.code !== 0 && !text) throw new Error(firstLine(r.stderr, 200) || `codex 退出码 ${r.code}`)
    return text || r.stdout
  }
}
