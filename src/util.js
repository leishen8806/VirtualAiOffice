import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isWin, killTree, runShell, spawnCmd } from '../packages/executors/runtime/process.js'
import { fillEnv, firstLine, sleep, truncate } from '../packages/executors/runtime/text.js'
import { SKIP_DIRS } from '../packages/executors/runtime/policy.js'
export { isWin, killTree, runShell, spawnCmd, fillEnv, firstLine, sleep, truncate, SKIP_DIRS }

export function expandHome(p) {
  if (!p) return p
  return p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(os.homedir(), p.slice(1)) : p
}

/** Pull the first JSON object out of model output (bare, fenced, or embedded in prose). */
export function extractJson(text) {
  if (!text) return null
  const s = String(text).trim()
  try {
    return JSON.parse(s)
  } catch {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi
  let m
  while ((m = fence.exec(s))) {
    try {
      return JSON.parse(m[1])
    } catch {}
  }
  for (let i = s.indexOf('{'); i !== -1; i = s.indexOf('{', i + 1)) {
    const end = matchBrace(s, i)
    if (end === -1) continue
    try {
      return JSON.parse(s.slice(i, end + 1))
    } catch {}
  }
  return null
}

function matchBrace(s, start) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

/** Small git/filesystem snapshot so the planner knows what project it is looking at. */
export async function projectContext(workdir) {
  const git = async (...a) => {
    const r = await spawnCmd('git', a, { cwd: workdir, collect: true, timeoutMs: 15000 }).done
    return r.code === 0 ? r.stdout : null
  }
  const inside = (await git('rev-parse', '--is-inside-work-tree'))?.trim() === 'true'
  let files = []
  let status = ''
  let branch = ''
  if (inside) {
    files = ((await git('ls-files')) || '').split('\n').filter(Boolean)
    status = (await git('status', '--short')) || ''
    branch = ((await git('branch', '--show-current')) || '').trim()
  } else {
    files = walk(workdir, 3)
  }
  const keyFiles = []
  for (const name of ['README.md', 'readme.md', 'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml']) {
    if (keyFiles.length >= 3) break
    try {
      const text = fs.readFileSync(path.join(workdir, name), 'utf8')
      keyFiles.push({ name, text: truncate(text, 1500) })
    } catch {}
  }
  return {
    workdir,
    keyFiles,
    isGit: inside,
    branch,
    fileCount: files.length,
    files: files.slice(0, 150).join('\n') + (files.length > 150 ? `\n…（共 ${files.length} 个文件）` : ''),
    status: truncate(status.trim(), 1500),
  }
}

function walk(root, depth, rel = '', out = []) {
  if (depth < 0 || out.length > 300) return out
  let entries = []
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
    const p = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(root, depth - 1, p, out)
    else out.push(p)
  }
  return out
}

export async function gitChanges(workdir) {
  const r = await spawnCmd('git', ['status', '--short'], { cwd: workdir, collect: true, timeoutMs: 15000 }).done
  return r.code === 0 ? r.stdout.trim() : ''
}
