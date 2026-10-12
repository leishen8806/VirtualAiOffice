// Automatic save points, so fully autonomous rounds can always be undone.
import fs from 'node:fs'
import path from 'node:path'
import { spawnCmd } from './util.js'

// Never swept into an automatic commit: dependencies, caches, secrets and 傻妞's own config.
const EXCLUDES = [
  ':(glob,exclude)**/node_modules/**',
  ':(glob,exclude)**/.venv/**',
  ':(glob,exclude)**/venv/**',
  ':(glob,exclude)**/__pycache__/**',
  ':(glob,exclude)**/.env',
  ':(glob,exclude)**/.env.*',
  ':(glob,exclude)**/niuma.config.json',
  // Browser plugin scratch output, in case a plugin writes it into the project anyway.
  ':(glob,exclude)**/.playwright-mcp/**',
]

const DEFAULT_IGNORE = ['node_modules/', '.venv/', 'venv/', '__pycache__/', '.env', '.env.*', 'niuma.config.json', '.playwright-mcp/', '.DS_Store', '*.log', ''].join('\n')

export function git(dir, ...args) {
  return spawnCmd('git', args, { cwd: dir, collect: true, timeoutMs: 60000 }).done.then((r) => ({ ...r, out: r.stdout.trim() }))
}

export async function isRepo(dir) {
  return (await git(dir, 'rev-parse', '--is-inside-work-tree')).out === 'true'
}

export async function initRepo(dir) {
  const r = await git(dir, 'init')
  if (r.code !== 0) return false
  const ignore = path.join(dir, '.gitignore')
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, DEFAULT_IGNORE)
  return true
}

export async function head(dir) {
  const r = await git(dir, 'rev-parse', 'HEAD')
  return r.code === 0 ? r.out : null
}

export async function isDirty(dir) {
  return (await git(dir, 'status', '--porcelain')).out.length > 0
}

async function identity(dir) {
  const email = (await git(dir, 'config', 'user.email')).out
  return email ? [] : ['-c', 'user.name=智序工场', '-c', 'user.email=office-coordinator@localhost']
}

/**
 * Stage everything (minus the excludes) and commit, reporting exactly what happened so the
 * caller can tell "nothing to do" apart from a real failure.
 * Returns { ok, hash, reason: 'committed' | 'nothing' | 'add-failed' | 'commit-failed', error }.
 */
export async function commitAllDetailed(dir, message) {
  const add = await git(dir, 'add', '-A', '--', '.', ...EXCLUDES)
  if (add.code !== 0) return { ok: false, hash: null, reason: 'add-failed', error: (add.stderr || add.stdout).trim().split('\n')[0] }
  const staged = await git(dir, 'diff', '--cached', '--quiet')
  if (staged.code === 0) return { ok: true, hash: null, reason: 'nothing', error: '' }
  const r = await git(dir, ...(await identity(dir)), 'commit', '-q', '--no-verify', '-m', message)
  if (r.code !== 0) return { ok: false, hash: null, reason: 'commit-failed', error: (r.stderr || r.stdout).trim().split('\n')[0] }
  return { ok: true, hash: await head(dir), reason: 'committed', error: '' }
}

/** Stage everything and commit; returns the new commit hash, or null if nothing changed or it failed. */
export async function commitAll(dir, message) {
  const r = await commitAllDetailed(dir, message)
  return r.ok ? r.hash : null
}

/** How many working-tree files are changed, plus up to 10 of their porcelain paths. */
export async function pendingChanges(dir) {
  const r = await git(dir, 'status', '--porcelain')
  const lines = r.stdout.split(/\r?\n/).filter(Boolean)
  return { count: lines.length, files: lines.slice(0, 10) }
}

/** Undo a commit with a new "revert" commit (history is kept, nothing is lost). */
export async function revertCommit(dir, hash) {
  if (await isDirty(dir)) await commitAll(dir, '智序工场：撤销前存档')
  const r = await git(dir, ...(await identity(dir)), 'revert', '--no-edit', hash)
  if (r.code === 0) return { ok: true, hash: await head(dir) }
  await git(dir, 'revert', '--abort')
  return { ok: false, error: (r.stderr || r.stdout).trim().split('\n')[0] || '撤销失败' }
}

export async function changedFiles(dir, base) {
  const r = base ? await git(dir, 'diff', '--stat', base, 'HEAD') : await git(dir, 'show', '--stat', '--format=', 'HEAD')
  return r.code === 0 ? r.out : ''
}
