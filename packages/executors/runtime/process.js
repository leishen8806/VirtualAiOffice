import { spawn } from 'node:child_process'

export const isWin = process.platform === 'win32'

function winQuote(a) {
  a = String(a)
  if (/^[\w\-.:\\/=,@+]+$/.test(a)) return a
  return '"' + a.replace(/"/g, '\\"') + '"'
}

export function spawnCmd(command, args, opts = {}) {
  const { cwd, env, input, onLine, collect = false, timeoutMs, signal } = opts
  const [cmd, ...pre] = Array.isArray(command) ? command : [command]
  const argv = [...pre, ...args]
  const childEnv = { ...process.env, ...env }
  delete childEnv.CLAUDECODE
  let child
  try {
    child = isWin ? spawn([cmd, ...argv].map(winQuote).join(' '), { cwd, env: childEnv, shell: true, windowsHide: true }) : spawn(cmd, argv, { cwd, env: childEnv, detached: true })
  } catch (e) {
    return { child: null, kill() {}, done: Promise.resolve({ code: -1, stdout: '', stderr: e.message, error: e }) }
  }
  let stdout = '', stderr = '', buf = '', timedOut = false, killed = false
  const kill = () => {
    if (killed || child.exitCode !== null) return
    killed = true
    killTree(child)
  }
  const done = new Promise((resolve) => {
    let timer
    if (timeoutMs) { timer = setTimeout(() => { timedOut = true; kill() }, timeoutMs); timer.unref?.() }
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (collect) stdout += chunk
      if (!onLine) return
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) !== -1) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); if (line.trim()) onLine(line) }
    })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-6000) })
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + e.message, error: e, timedOut, killed }) })
    child.on('close', (code, signal) => { clearTimeout(timer); if (onLine && buf.trim()) onLine(buf.trim()); resolve({ code: code ?? -1, signal, stdout, stderr, timedOut, killed }) })
  })
  child.stdin.on('error', () => {})
  if (signal) {
    if (signal.aborted) kill()
    else signal.addEventListener('abort', kill, { once: true })
  }
  if (input != null) child.stdin.end(input); else child.stdin.end()
  return { child, kill, done }
}

export function killTree(child) {
  try { if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); else process.kill(-child.pid, 'SIGTERM') }
  catch { try { child.kill('SIGTERM') } catch {} }
  if (!isWin) setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 3000).unref()
}

export function runShell(command, { cwd, timeoutMs = 120000, onSpawn } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env }; delete env.CLAUDECODE
    let child
    try { child = spawn(command, { cwd, env, shell: true, detached: !isWin, windowsHide: true }) }
    catch (e) { resolve({ code: -1, out: e.message, timedOut: false }); return }
    onSpawn?.(child)
    let out = '', timedOut = false
    const add = (d) => { out += d.toString(); if (out.length > 400000) out = out.slice(-400000) }
    child.stdout.on('data', add); child.stderr.on('data', add); child.stdin.on('error', () => {}); child.stdin.end()
    const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeoutMs)
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: out + e.message, timedOut }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, timedOut }) })
  })
}
