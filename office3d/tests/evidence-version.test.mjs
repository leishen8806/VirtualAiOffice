// T15 审核绑定版本：解析【验收证据】里的对象版本，并把 git / sha256 条目与当前实际版本只读核对。
// 纯解析 + 真实 git（临时仓库）+ 安全边界（路径逃逸 / 受保护文件 / 关闭开关）。
// 运行：node --test tests/evidence-version.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parseEvidenceVersion, insideRoots, isProtected, createEvidenceVersion } from '../evidence-version.mjs'

const H = 'a'.repeat(64)
const tmp = (p = 'ev-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); try { return fs.realpathSync(d) } catch { return d } }
const git = (cwd, args) => { const out = execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return out.trim() }
// 在 roots 下建一个真实 git 仓库，返回 { repo, head, file }
function makeRepo(root, files = { 'a.txt': 'one' }) {
  const repo = path.join(root, 'repo-' + Math.random().toString(36).slice(2))
  fs.mkdirSync(repo, { recursive: true })
  for (const [f, content] of Object.entries(files)) fs.writeFileSync(path.join(repo, f), content)
  git(repo, ['init', '-q', '-b', 'main'])
  const cfg = ['-c', 'user.email=t@t', '-c', 'user.name=t']
  git(repo, [...cfg, 'add', '-A'])
  git(repo, [...cfg, 'commit', '-q', '-m', 'c1'])
  const head = git(repo, ['rev-parse', 'HEAD'])
  return { repo, head, file: path.join(repo, Object.keys(files)[0]) }
}
function ev2(repo, commit) { return `【验收证据】对象版本：git:${repo}@${commit}` }
function shaLine(file, hash) { return `【验收证据】对象版本：sha256:${file}=${hash}` }

// ── 测试世界：模拟 Paperclip 的 get，配置里自定义 roots ──
function world(t, { enabled = true, roots } = {}) {
  const dir = tmp('evcfg-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const cfgFile = path.join(dir, 'evidence-version.json')
  const root = roots || path.join(dir, 'roots')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(cfgFile, JSON.stringify({ enabled, roots: [root] }))
  const issues = {}
  let n = 0
  const add = (ident, body, extra = {}) => { const id = 'is-' + ident; issues[id] = { id, identifier: ident, title: '任务', status: 'in_review', updatedAt: '2026-10-18T00:00:00Z', comments: [{ id: 'c' + ++n, authorAgentId: 'agent', body, createdAt: '2026-10-18T01:00:00Z' }], ...extra }; return id }
  const get = async (p) => {
    if (p.startsWith('/api/companies/C/issues')) return Object.values(issues)
    const m = p.match(/^\/api\/issues\/([^/]+)\/comments$/)
    if (m) { const i = issues[m[1]]; assert.ok(i, '未找到任务 ' + p); return i.comments }
    throw new Error('未模拟 GET ' + p)
  }
  const ev = createEvidenceVersion({ dir, company: 'C', get })
  return { dir, cfgFile, root, issues, add, ev, get }
}

// ───── 纯函数：解析 ─────
test('解析：全角冒号 / 全角分号 / Windows 反斜杠路径 / git 与 sha256 多条目', () => {
  const body = `【验收证据】对象版本：git：E:\\work\\repo@abc1234；sha256：E:\\data\\file.txt＝${H}`
  const p = parseEvidenceVersion(body)
  assert.equal(p.machineReadable, true)
  assert.equal(p.version, `git：E:\\work\\repo@abc1234；sha256：E:\\data\\file.txt＝${H}`)
  assert.equal(p.entries.length, 2)
  assert.deepEqual(p.entries[0], { kind: 'git', repo: 'E:\\work\\repo', commit: 'abc1234' })
  assert.equal(p.entries[1].kind, 'sha256')
  assert.equal(p.entries[1].file, 'E:\\data\\file.txt')
  assert.equal(p.entries[1].hash, H)
})

test('解析：Git 提交号补零对齐（6 位补到 7 位不匹配则拒绝）与正斜杠路径', () => {
  const p = parseEvidenceVersion(`【验收证据】：对象版本：git:E:/work/repo@a1b2c3d4`)
  assert.equal(p.machineReadable, true)
  assert.equal(p.entries[0].repo, 'E:/work/repo')
  assert.equal(p.entries[0].commit, 'a1b2c3d4')

  const short = parseEvidenceVersion('【验收证据】对象版本：git:E:/r@abcdef') // 6 位不够 7 位
  assert.equal(short.machineReadable, false)
  assert.match(short.reason, /无法解析|只认/)
})

test('解析：旧写法（没有「对象版本」行）与没有证据块 → 无法核对', () => {
  const old = parseEvidenceVersion('【验收证据】验证版本 v1.2\n已在本地跑过')
  assert.equal(old.machineReadable, false)
  assert.match(old.reason, /对象版本|证据缺版本/)
  const none = parseEvidenceVersion('完成了，见提交 abc1234')
  assert.equal(none.machineReadable, false)
  assert.match(none.reason, /对象版本/)
})

test('解析：提交号含非十六进制 / 含空格 / 含分号 → 条目不可解析', () => {
  const bad1 = parseEvidenceVersion('【验收证据】对象版本：git:E:/r@zzzz1234') // 含 z
  assert.equal(bad1.machineReadable, false)
  assert.equal(bad1.entries.some((e) => e.kind === 'unk'), true)
  const bad2 = parseEvidenceVersion('【验收证据】对象版本：git:E:/r@abcd 12ef') // 含空格
  assert.equal(bad2.machineReadable, false)
  const bad3 = parseEvidenceVersion('【验收证据】对象版本：git:E:/r@abcd12ef;x=1') // 分号拆出无效段
  assert.equal(bad3.machineReadable, true) // 前面一段仍可解析
  assert.equal(bad3.entries.some((e) => e.kind === 'unk'), true)
  const bad4 = parseEvidenceVersion('【验收证据】对象版本：sha256:E:/file.txt=zz' + H.slice(2)) // hash 含 z
  assert.equal(bad4.machineReadable, false)
})

// ───── 纯函数：路径安全 ─────
test('路径安全：insideRoots 拒绝 .. 逃逸 / 前缀混淆，盘符大小写不敏感', () => {
  if (process.platform === 'win32') {
    // Windows：盘符大小写不敏感 + 反斜杠 + 前缀混淆 + .. 逃逸
    const roots = ['E:/VirtualAIOffice', 'E:/pc-worktrees']
    assert.equal(insideRoots('E:/VirtualAIOffice/paperclip-ops', roots), true)
    assert.equal(insideRoots('e:/virtualaioffice/paperclip-ops', roots), true)
    assert.equal(insideRoots('E:/VirtualAIOffice/../outside/x', roots), false)
    assert.equal(insideRoots('E:/VirtualAIOffice2/x', roots), false)
    assert.equal(insideRoots('E:/something', roots), false)
    assert.equal(insideRoots('E:\\VirtualAIOffice\\backslash', roots), true)
  } else {
    // POSIX：无盘符，前缀混淆 + .. 逃逸（等价语义）
    const roots = ['/srv/virtual-office', '/srv/pc-worktrees']
    assert.equal(insideRoots('/srv/virtual-office/paperclip-ops', roots), true)
    assert.equal(insideRoots('/srv/virtual-office/../outside/x', roots), false)
    assert.equal(insideRoots('/srv/virtual-office2/x', roots), false)
    assert.equal(insideRoots('/srv/something', roots), false)
  }
})

test('路径安全：符号链接指向根外 → 规范化后被拒', (t) => {
  const base = tmp('evlink-')
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, 'root'); fs.mkdirSync(root)
  const outside = path.join(base, 'outside'); fs.writeFileSync(outside, 'x')
  let link = path.join(root, 'link')
  try {
    fs.symlinkSync(outside, link)
  } catch {
    t.skip('当前环境不允许创建符号链接') // Windows 非管理员/未开开发者模式
    return
  }
  assert.equal(insideRoots(link, [root]), false)
  assert.equal(insideRoots(outside, [root]), false)
})

// ───── 受保护文件 ─────
test('受保护文件：lan/wall/config/telegram/dpapi/env/ed25519/pem/key 一律拒绝且不落日志', () => {
  for (const f of ['lan.json', 'wall.json', 'config.json', 'telegram.json', 'a.dpapi', '.env', '.env.local', 'id_ed25519', 'k.pem', 's.key'])
    assert.equal(isProtected('E:/x/' + f), true, f)
  assert.equal(isProtected('E:/x/record.json'), false)
  assert.equal(isProtected('evidences/telegram.json'), true) // 子目录也要命中
})

test('受保护文件在核对时被拒且 note 不含路径（不进日志）', async (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.root, 'lan.json'), '{"api":"x"}')
  w.add('CMP-1', shaLine(path.join(w.root, 'lan.json'), H))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '无法核对（受保护文件）')
  assert.ok(!r.items[0].label.includes('lan.json'), '受保护路径不得进入 label')
})

// ───── git 核对：真实临时仓库 ─────
test('git 一致：HEAD 以证据提交号开头 → 版本一致', async (t) => {
  const w = world(t)
  const { repo, head, file } = makeRepo(w.root)
  w.add('CMP-1', ev2(repo, head.slice(0, 7)))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本一致')
  assert.equal(r.note, '')
})

test('git 一致但工作区有未提交改动 → 版本一致，另标 N 项未提交', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  fs.appendFileSync(path.join(repo, 'a.txt'), 'dirty')
  w.add('CMP-1', ev2(repo, head))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本一致')
  assert.match(r.note, /未提交改动（1 项）/)
})

test('git 之后多一个提交 → 版本已变（给出数量与文件名）', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  git(repo, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'c2'])
  w.add('CMP-1', ev2(repo, head))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本已变')
  assert.match(r.note, /之后新增 1 个提交/)
})

test('git 证据提交已不在当前历史 → 版本已变（非祖先即视为不在历史）', async (t) => {
  const w = world(t)
  const { repo } = makeRepo(w.root)
  const bogus = 'f'.repeat(40) // 不存在的提交
  w.add('CMP-1', ev2(repo, bogus))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本已变')
  assert.match(r.note, /已不在当前历史/)
})

test('git 证据提交在别的分支（对象存在但不是当前历史祖先）→ 也判已变且不在历史', async (t) => {
  const w = world(t)
  const { repo } = makeRepo(w.root)
  const cfg = ['-c', 'user.email=t@t', '-c', 'user.name=t']
  git(repo, ['checkout', '-q', '-b', 'elsewhere'])
  fs.writeFileSync(path.join(repo, 'side.txt'), 'side work')
  git(repo, ['add', '-A'])
  git(repo, [...cfg, 'commit', '-q', '-m', 'side work'])
  const side = git(repo, ['rev-parse', 'HEAD'])
  git(repo, ['checkout', '-q', 'main']) // HEAD 回到 main；side 提交对象存在但不属于当前历史
  w.add('CMP-1', ev2(repo, side))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本已变')
  assert.match(r.note, /已不在当前历史/)
})

test('git 路径逃逸（.. 指到根外）→ 无法核对（路径不在允许范围），且不执行 git', async (t) => {
  const w = world(t)
  const outside = path.join(w.root, '..', 'outside-' + Math.random().toString(36).slice(2))
  fs.mkdirSync(outside, { recursive: true })
  const repo = path.join(outside, 'r'); fs.mkdirSync(repo) // 在 roots 目录之外
  let ran = 0
  const ev2f = createEvidenceVersion({ dir: w.dir, company: 'C', get: w.get, runGit: async () => { ran++; throw new Error('不应执行') } })
  w.add('CMP-1', ev2(repo, 'a'.repeat(40)))
  const r = await ev2f.checkByIdent('CMP-1')
  assert.equal(r.result, '无法核对（路径不在允许范围）')
  assert.equal(ran, 0)
})

test('git 命令失败（超时/非 git 仓库）→ 无法核对（git 命令失败），不抛异常', async (t) => {
  const w = world(t)
  const repo = path.join(w.root, 'pool'); fs.mkdirSync(repo, { recursive: true })
  const comments = [{ authorAgentId: 'a', body: ev2(repo, 'a'.repeat(40)), createdAt: '' }]
  const get = async (p) => {
    if (p.endsWith('/companies/C/issues')) return [{ id: 'is-C', identifier: 'CMP-1', title: 't', status: 'in_review', updatedAt: '', comments }]
    if (p.endsWith('/issues/is-C/comments')) return comments
    throw new Error('unmocked ' + p)
  }
  const evf = createEvidenceVersion({ dir: w.dir, company: 'C', get, runGit: async () => ({ err: { message: 'timeout' }, stdout: '', stderr: 'fatal: 卡住' }) })
  const r = await evf.checkByIdent('CMP-1')
  assert.match(r.result, /无法核对（fatal/)
})

// ───── sha256 核对 ─────
test('sha256 一致 / 已变 / 缺失', async (t) => {
  const w = world(t)
  const f = path.join(w.root, 'data.txt')
  for (const round of [1, 2]) fs.writeFileSync(f, 'v' + round)
  const hashMatch = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  w.add('CMP-1', shaLine(f, hashMatch))
  w.add('CMP-2', shaLine(f, 'f'.repeat(64)))
  w.add('CMP-3', shaLine(path.join(w.root, '缺席.txt'), H))
  assert.equal((await w.ev.checkByIdent('CMP-1')).result, '版本一致')
  const changed = await w.ev.checkByIdent('CMP-2')
  assert.equal(changed.result, '版本已变')
  assert.match(changed.note, /哈希与证据不同/)
  const missing = await w.ev.checkByIdent('CMP-3')
  assert.equal(missing.result, '版本已变')
  assert.match(missing.note, /文件不存在/)
})

test('sha256 文件过大（超过上限）→ 无法核对（文件过大）', async (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.dir, 'evidence-version.json'), JSON.stringify({ enabled: true, roots: [w.root], maxFileBytes: 10 }))
  const f = path.join(w.root, 'big.txt'); fs.writeFileSync(f, '1234567890' + '1234567890')
  w.add('CMP-1', shaLine(f, H))
  const r = await w.ev.checkByIdent('CMP-1')
  assert.match(r.result, /无法核对（文件/, r.result)
  assert.match(r.items[0].state, /文件过大/)
})

// ───── git + sha256 混合多条目 ─────
test('混合多条目：git 一致 + sha256 已变 → 版本已变（任一已变即已变）', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  const f = path.join(w.root, 'mix.txt'); fs.writeFileSync(f, 'x1')
  w.add('CMP-1', `【验收证据】对象版本：git:${repo}@${head}；sha256:${f}=${'f'.repeat(64)}`)
  const r = await w.ev.checkByIdent('CMP-1')
  assert.equal(r.result, '版本已变')
  assert.equal(r.items[0].state, '一致')
  assert.equal(r.items[1].state, '已变')
})

// ───── 开关与总览 ─────
test('enabled:false（配置不存在 / 显式关闭 / 损坏）→ 一律返回 disabled:true', async (t) => {
  // 配置不存在
  const w0 = world(t)
  fs.rmSync(w0.cfgFile)
  assert.equal((await w0.ev.checkByIdent('CMP-1')).disabled, true)
  // 显式关闭
  const w1 = world(t, { enabled: false })
  w1.add('CMP-1', ev2('E:/repo', 'a'.repeat(40)))
  assert.equal((await w1.ev.checkByIdent('CMP-1')).disabled, true)
  assert.equal((await w1.ev.batch()).disabled, true)
  // 损坏
  fs.writeFileSync(w1.cfgFile, '{ 坏 json')
  const corrupt = await w1.ev.checkByIdent('CMP-1')
  assert.equal(corrupt.disabled, true)
  assert.equal(w1.ev.view().corrupt, true)
})

test('view() 暴露 enabled / recent（最近核对结果）', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  w.add('CMP-1', ev2(repo, head))
  await w.ev.checkByIdent('CMP-1')
  const v = w.ev.view()
  assert.equal(v.enabled, true)
  assert.equal(v.recent.length, 1)
  assert.equal(v.recent[0].result, '版本一致')
})

test('batch()：批量核对 in_review 任务，逐个返回结果', async (t) => {
  const w = world(t)
  const { repo, head } = makeRepo(w.root)
  w.add('CMP-1', ev2(repo, head))
  w.add('CMP-2', '完成，见提交 abc123') // 旧写法
  const b = await w.ev.batch()
  assert.equal(b.items.length, 2)
  assert.equal(b.items[0].result, '版本一致')
  assert.equal(b.items[1].result, '证据缺版本（无法核对）')
})