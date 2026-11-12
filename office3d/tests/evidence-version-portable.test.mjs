// D2：证据版本核对的两处改进。
//  1) Windows 8.3 短路径：不存在的文件在短名目录下，不得被误报成「路径不在允许范围」。
//  2) 跨机证据：用「仓库标识 + 提交 / 相对路径 + 哈希」写证据，不依赖本机绝对路径；
//     本机用配置里的 repos 表把标识对应到本机仓库目录。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parseEvidenceVersion, insideRoots, createEvidenceVersion } from '../evidence-version.mjs'

const H = 'a'.repeat(64)
const REPO_ID = 'leishen8806/VirtualAiOffice'
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const tmp = (p = 'evp-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); try { return fs.realpathSync.native(d) } catch { return d } }
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const identity = ['-c', 'user.email=t@t', '-c', 'user.name=t']

function makeRepo(root, files = { 'a.txt': 'one' }) {
  const repo = path.join(root, 'repo-' + Math.random().toString(36).slice(2))
  fs.mkdirSync(repo, { recursive: true })
  for (const [f, content] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), content) }
  git(repo, ['init', '-q', '-b', 'main'])
  git(repo, [...identity, 'add', '-A'])
  git(repo, [...identity, 'commit', '-q', '-m', 'c1'])
  return { repo, head: git(repo, ['rev-parse', 'HEAD']) }
}

// 一个测试世界：roots 与 repos 都写进配置；repos 可以在建好仓库之后再补。
function world(t) {
  const dir = tmp('evpcfg-'), root = path.join(dir, 'roots')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(root, { recursive: true })
  const cfgFile = path.join(dir, 'evidence-version.json')
  const writeCfg = (repos = {}) => fs.writeFileSync(cfgFile, JSON.stringify({ enabled: true, roots: [root], repos }))
  writeCfg()
  const issues = {}
  let n = 0
  const add = (ident, body) => { const id = 'is-' + ident; issues[id] = { id, identifier: ident, title: '任务', status: 'in_review', updatedAt: '2026-10-26T00:00:00Z', comments: [{ id: 'c' + ++n, authorAgentId: 'ag', createdAt: '2026-10-26T01:00:00Z', body }] } }
  const get = async (p) => {
    if (p.startsWith('/api/companies/C/issues')) return Object.values(issues)
    const m = p.match(/^\/api\/issues\/([^/]+)\/comments$/)
    if (m) return issues[m[1]].comments
    throw new Error('未模拟 GET ' + p)
  }
  return { dir, root, writeCfg, add, ev: createEvidenceVersion({ dir, company: 'C', get }) }
}
const line = (v) => `【验收证据】对象版本：${v}`

// ───── 1) Windows 8.3 短路径 ─────
function shortPathOf(dir) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${dir.replace(/'/g, "''")}').ShortPath`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out && out !== dir ? out : null
  } catch { return null }
}

test('8.3 短路径：短名目录下不存在的文件，仍判定在允许范围内（不再误报）', { skip: process.platform !== 'win32' && '仅 Windows 有 8.3 短名' }, (t) => {
  const base = tmp('evp83-')
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const longDir = path.join(base, 'a-rather-long-directory-name')
  fs.mkdirSync(longDir)
  const short = shortPathOf(longDir)
  if (!short) return t.skip('本机卷没有为该目录生成 8.3 短名')
  assert.ok(short.length < longDir.length, '前提：短路径确实不同于长路径')
  assert.equal(insideRoots(path.join(short, 'missing.txt'), [longDir]), true, '不存在的文件')
  assert.equal(insideRoots(path.join(short, 'sub', 'deeper', 'missing.txt'), [longDir]), true, '多级不存在')
  fs.writeFileSync(path.join(longDir, 'present.txt'), 'x')
  assert.equal(insideRoots(path.join(short, 'present.txt'), [longDir]), true, '存在的文件（原本就通过）')
  assert.equal(insideRoots(path.join(short, '..', 'outside.txt'), [longDir]), false, '.. 逃逸仍被拒')
  assert.equal(insideRoots(path.join(base, 'elsewhere', 'missing.txt'), [longDir]), false, '根外的不存在文件仍被拒')
})

test('8.3 短路径：sha256 证据指向短名目录下缺失的文件 → 版本已变（文件不存在），不是"路径不在允许范围"', { skip: process.platform !== 'win32' && '仅 Windows 有 8.3 短名' }, async (t) => {
  const w = world(t)
  const longDir = path.join(w.root, 'a-rather-long-directory-name')
  fs.mkdirSync(longDir)
  const short = shortPathOf(longDir)
  if (!short) return t.skip('本机卷没有为该目录生成 8.3 短名')
  w.add('CMP-1', line(`sha256:${path.join(short, 'missing.txt')}=${H}`))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本已变')
  assert.match(r.note, /文件不存在/)
})

test('不存在的路径：最近的已存在祖先若是指向根外的符号链接，仍被拒', (t) => {
  const base = tmp('evpln-'), root = path.join(base, 'root'), outside = path.join(base, 'outside')
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  fs.mkdirSync(root); fs.mkdirSync(outside)
  try { fs.symlinkSync(outside, path.join(root, 'link'), 'junction') } catch { return t.skip('本机不能创建符号链接 / 目录联接') }
  assert.equal(insideRoots(path.join(root, 'link', 'missing.txt'), [root]), false)
})

// ───── 2) 跨机证据：解析 ─────
test('解析：仓库标识 + 提交，以及仓库标识 + 相对路径 + 哈希', () => {
  const p = parseEvidenceVersion(line(`git:${REPO_ID}@abc1234；sha256:${REPO_ID}:office3d/app.js=${H}`))
  assert.equal(p.machineReadable, true)
  assert.deepEqual(p.entries[0], { kind: 'git', repo: REPO_ID, commit: 'abc1234', portable: true })
  assert.equal(p.entries[1].kind, 'sha256')
  assert.equal(p.entries[1].portable, true)
  assert.equal(p.entries[1].repo, REPO_ID)
  assert.equal(p.entries[1].rel, 'office3d/app.js')
  assert.equal(p.entries[1].hash, H)
})

test('解析：绝对路径写法不受影响，也不会被当成仓库标识', () => {
  const p = parseEvidenceVersion(line(`git:E:/work/repo@abc1234；sha256:E:/data/f.txt=${H}；sha256:/srv/data/f.txt=${H}`))
  assert.equal(p.entries[0].portable, undefined)
  assert.equal(p.entries[1].portable, undefined)
  assert.equal(p.entries[1].file, 'E:/data/f.txt')
  assert.equal(p.entries[2].portable, undefined, '以 / 开头的是绝对路径')
})

// ───── 2) 跨机证据：核对 git ─────
test('跨机 git：配置的 repos 表把标识对应到本机仓库，一致 / 已变都能判，标签只显示标识不泄露本机路径', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`git:${REPO_ID}@${head.slice(0, 7)}`))
  const ok = await w.ev.checkByIdent('CMP-1')
  assert.equal(ok.result, '版本一致')
  assert.ok(ok.items[0].label.includes(REPO_ID) && !ok.items[0].label.includes(repo), `标签：${ok.items[0].label}`)
  fs.writeFileSync(path.join(repo, 'b.txt'), 'two'); git(repo, ['add', '-A']); git(repo, [...identity, 'commit', '-q', '-m', 'c2'])
  w.add('CMP-2', line(`git:${REPO_ID}@${head.slice(0, 7)}`))
  const changed = await w.ev.checkByIdent('CMP-2')
  assert.equal(changed.result, '版本已变')
  assert.match(changed.note, /之后新增 1 个提交/)
})

test('跨机 git：标识大小写不敏感；本机没有登记该仓库 → 无法核对（说明要登记）', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`git:${REPO_ID.toLowerCase()}@${head.slice(0, 7)}`))
  assert.equal((await w.ev.checkByIdent('CMP-1')).result, '版本一致')
  w.add('CMP-2', line(`git:someone/else@${head.slice(0, 7)}`))
  const r = await w.ev.checkByIdent('CMP-2')
  assert.match(r.result, /^无法核对/)
  assert.match(r.note, /没有登记仓库 someone\/else/)
})

test('跨机 git：本机仓库里没有该提交（别的机器刚推送）→ 无法核对（先 fetch），不判成"已变"', async (t) => {
  const w = world(t)
  const { repo } = makeRepo(w.root)
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`git:${REPO_ID}@${'f'.repeat(40)}`))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.match(r.result, /^无法核对/)
  assert.match(r.note, /fetch/)
})

test('跨机 git：登记的本机目录在 roots 之外 → 无法核对（路径不在允许范围），且不执行 git', async (t) => {
  const w = world(t)
  const outside = tmp('evpout-')
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const { repo, head } = makeRepo(outside)
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`git:${REPO_ID}@${head.slice(0, 7)}`))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.match(r.result, /路径不在允许范围/)
})

// ───── 2) 跨机证据：核对 sha256 ─────
test('跨机 sha256：仓库标识 + 相对路径，一致 / 已变 / 缺失', async (t) => {
  const w = world(t)
  const { repo } = makeRepo(w.root, { 'office3d/app.js': 'v1' })
  w.writeCfg({ [REPO_ID]: repo })
  const f = path.join(repo, 'office3d', 'app.js')
  w.add('CMP-1', line(`sha256:${REPO_ID}:office3d/app.js=${sha256(f)}`))
  w.add('CMP-2', line(`sha256:${REPO_ID}:office3d/app.js=${'f'.repeat(64)}`))
  w.add('CMP-3', line(`sha256:${REPO_ID}:office3d/missing.js=${H}`))
  assert.equal((await w.ev.checkByIdent('CMP-1')).result, '版本一致')
  const changed = await w.ev.checkByIdent('CMP-2')
  assert.equal(changed.result, '版本已变'); assert.match(changed.note, /哈希与证据不同/)
  const missing = await w.ev.checkByIdent('CMP-3')
  assert.equal(missing.result, '版本已变'); assert.match(missing.note, /文件不存在/)
})

test('跨机 sha256：相对路径不得含 .. 、不得是绝对路径；登记仓库之外的文件一律拒绝', async (t) => {
  const w = world(t)
  const { repo } = makeRepo(w.root)
  fs.writeFileSync(path.join(w.root, 'sibling.txt'), 'x') // 在 roots 内、但在登记仓库之外
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`sha256:${REPO_ID}:../sibling.txt=${H}`))
  w.add('CMP-2', line(`sha256:${REPO_ID}:a/../../sibling.txt=${H}`))
  w.add('CMP-3', line(`sha256:${REPO_ID}:${path.join(w.root, 'sibling.txt').replace(/\\/g, '/')}=${H}`))
  for (const id of ['CMP-1', 'CMP-2', 'CMP-3']) {
    const r = await w.ev.checkByIdent(id)
    assert.match(r.result, /^无法核对/, `${id}：${r.result}`)
    assert.doesNotMatch(r.result, /版本已变|版本一致/)
  }
})

test('跨机 sha256：受保护文件（config.json / .env）不读不求哈希，路径不进输出', async (t) => {
  const w = world(t)
  const { repo } = makeRepo(w.root, { 'config.json': '{"k":1}', '.env': 'A=1' })
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`sha256:${REPO_ID}:config.json=${sha256(path.join(repo, 'config.json'))}`))
  w.add('CMP-2', line(`sha256:${REPO_ID}:.env=${H}`))
  for (const id of ['CMP-1', 'CMP-2']) {
    const r = await w.ev.checkByIdent(id)
    assert.match(r.result, /受保护/)
    // 与旧写法同一约定：结论、备注、条目标签与条目备注不含受保护文件名（version 字段原样回显任务评论里的那行证据文字，不在此列）。
    const shown = JSON.stringify({ result: r.result, note: r.note, items: r.items })
    assert.ok(!shown.includes('config.json') && !shown.includes('.env'), '输出不含受保护文件名：' + shown)
  }
})

test('旧写法（绝对路径）仍可用，与新写法可混写在同一行', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root, { 'x.txt': 'x' })
  w.writeCfg({ [REPO_ID]: repo })
  w.add('CMP-1', line(`git:${repo}@${head.slice(0, 7)}；sha256:${REPO_ID}:x.txt=${sha256(path.join(repo, 'x.txt'))}`))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本一致')
  assert.equal(r.items.length, 2)
})
