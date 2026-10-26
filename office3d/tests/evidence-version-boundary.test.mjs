// PR #51 返修（F1–F4）：路径边界、受保护目标、Git 错误分类、检查顺序。
// 所有数据都是临时目录里的公开合成内容；不读真实配置、不联网。
// 真实执行 vs 错误注入：
//   - 用 `realGit()` 的用例，Git 命令真实执行（只是包了一层计数）；
//   - 标注"注入"的用例，用假的 runGit 返回指定错误，只用来证明错误分类，不当作真实网络 / 磁盘行为。
// 读文件探针：包住 fs.readFileSync / fs.openSync，断言受保护或越界目标的读取次数为 0（不只看返回文案）。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { createEvidenceVersion, insideRoots, windowsAmbiguousName } from '../evidence-version.mjs'

const WIN = process.platform === 'win32'
const PUBLIC = 'PUBLIC TEST FIXTURE, NOT A SECRET'
const H = crypto.createHash('sha256').update(PUBLIC).digest('hex')
const ID = 'review/demo'
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'evb-')); try { return fs.realpathSync.native(d) } catch { return d } }
const git = (cwd, args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=NUL', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const identity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid']
const initRepo = (repo, files = ['normal.txt']) => { fs.mkdirSync(repo, { recursive: true }); for (const f of files) fs.writeFileSync(path.join(repo, f), PUBLIC); git(repo, ['init', '-q']); git(repo, ['add', ...files]); git(repo, [...identity, 'commit', '-qm', 'fixture']); return git(repo, ['rev-parse', 'HEAD']) }

// 真实 Git，外加调用计数（不改变行为）。
function realGit() {
  const calls = []
  const runGit = (cmd, args, opts = {}) => new Promise((resolve) => {
    calls.push(args.join(' '))
    execFile(cmd, args, { timeout: opts.timeout || 5000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => resolve({ err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }))
  })
  return { calls, runGit }
}
const fake = (impl) => { const calls = []; return { calls, runGit: async (cmd, args) => { calls.push(args.join(' ')); return impl(args) } } }
const ok = (stdout = '') => ({ err: null, code: 0, stdout, stderr: '' })

// 读取探针：记录对"含 needle 的路径"的读取（readFileSync / openSync）。
function probeReads(needles) {
  const hits = []
  const match = (p) => typeof p === 'string' && needles.some((n) => p.toLowerCase().includes(n.toLowerCase()))
  const rfs = fs.readFileSync, ofs = fs.openSync
  fs.readFileSync = function (p, ...a) { if (match(p)) hits.push(String(p)); return rfs.call(this, p, ...a) }
  fs.openSync = function (p, ...a) { if (match(p)) hits.push(String(p)); return ofs.call(this, p, ...a) }
  return { hits, stop: () => { fs.readFileSync = rfs; fs.openSync = ofs } }
}

function world(t) {
  const dir = tmp(), root = path.join(dir, 'roots'), repo = path.join(root, 'repo'), outside = path.join(dir, 'outside')
  for (const p of [repo, outside]) fs.mkdirSync(p, { recursive: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(repo, 'normal.txt'), PUBLIC)
  fs.writeFileSync(path.join(repo, 'config.json'), PUBLIC) // 公开测试内容，名字命中受保护规则
  const cfg = (repos = { [ID]: repo }) => fs.writeFileSync(path.join(dir, 'evidence-version.json'), JSON.stringify({ enabled: true, roots: [root], repos }))
  cfg()
  let n = 0
  const check = (entry, runGit) => {
    const id = 'i' + ++n
    const get = async (p) => (p.includes('/comments') ? [{ id: 'c' + n, authorAgentId: 'a', createdAt: '2026-10-26T00:00:00Z', body: '【验收证据】对象版本：' + entry }] : [{ id, identifier: 'T' + n, updatedAt: '' }])
    return createEvidenceVersion({ dir, company: 'C', get, ...(runGit ? { runGit } : {}) }).checkByIdent(id)
  }
  const link = (target, file, type) => { try { fs.symlinkSync(target, file, type); return true } catch { return false } }
  return { dir, root, repo, outside, cfg, check, link }
}
const shown = (r) => JSON.stringify({ result: r.result, note: r.note, items: r.items }) // version 字段原样回显输入行，不在泄露断言之内（旧写法同约定）

// ───── 纯函数：Windows 不明确写法（所有平台都能跑）─────
test('windowsAmbiguousName：末尾点 / 空格 / 数据流 / 保留名 / 设备前缀 → 不明确；盘符、8.3 短名、普通路径 → 正常', () => {
  for (const p of ['C:/a/escape.', 'C:/a/escape ', 'C:\\a\\b.\\c', 'C:/a/config.json::$DATA', 'C:/a/f.txt:stream', 'C:/a/NUL', 'C:/a/con.txt', 'C:/a/LPT1', '\\\\?\\C:\\a', '\\\\.\\C:\\a', 'a/b../c', 'a/...'])
    assert.equal(windowsAmbiguousName(p), true, p)
  for (const p of ['C:/a/b/c.txt', 'C:\\Users\\RUNNER~1\\AppData', 'a/b/.hidden', 'a/./b/../c', '//server/share/x.txt', 'E:/VirtualAIOffice/repo', 'a/console.txt', 'a/nullable'])
    assert.equal(windowsAmbiguousName(p), false, p)
})

// ───── F1：roots 绕过（末尾点 / 空格 / 根外联接 / 根外登记 / 缺失子文件）─────
test('F1 末尾点：登记目录写成 escape.（真实是 escape 目录联接 → 根外 Git 仓库）→ 拒绝，且不执行 Git', { skip: !WIN && '仅 Windows 的末尾点语义' }, async (t) => {
  const w = world(t)
  const head = initRepo(w.outside)
  if (!w.link(w.outside, path.join(w.repo, 'escape'), 'junction')) return t.skip('不能创建目录联接')
  for (const alias of [path.join(w.repo, 'escape.'), path.join(w.repo, 'escape '), path.join(w.repo, 'escape..')]) {
    w.cfg({ [ID]: alias })
    const g = realGit(), p = probeReads([w.outside])
    let portable, abs
    try { portable = await w.check(`git:${ID}@${head}`, g.runGit); abs = await w.check(`git:${alias}@${head}`, g.runGit) } finally { p.stop() }
    assert.match(portable.result, /路径不在允许范围|不明确/, JSON.stringify(alias))
    assert.match(abs.result, /路径不在允许范围|不明确/, JSON.stringify(alias))
    assert.deepEqual(g.calls, [], '越界时 Git 一次也不能被调用')
    assert.deepEqual(p.hits, [])
  }
})

test('F1 根外联接：已存在 / 缺失的子文件、登记在根外、旧绝对路径写法 → 拒绝，Git 与读文件次数为 0', async (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.outside, 'normal.txt'), PUBLIC)
  const head = initRepo(w.outside)
  if (!w.link(w.outside, path.join(w.repo, 'escape'), WIN ? 'junction' : 'dir')) return t.skip('不能创建目录联接 / 符号链接')
  const g = realGit(), p = probeReads([w.outside])
  try {
    for (const rel of ['escape/normal.txt', 'escape/missing.txt', 'escape/missing/deeper/child.txt'])
      assert.match((await w.check(`sha256:${ID}:${rel}=${H}`, g.runGit)).result, /路径不在允许范围/, rel)
    assert.match((await w.check(`sha256:${path.join(w.repo, 'escape', 'normal.txt')}=${H}`, g.runGit)).result, /路径不在允许范围/)
    w.cfg({ [ID]: w.outside }) // 登记目录本身在 roots 之外
    assert.match((await w.check(`git:${ID}@${head}`, g.runGit)).result, /路径不在允许范围/)
    assert.match((await w.check(`sha256:${ID}:normal.txt=${H}`, g.runGit)).result, /路径不在允许范围/)
    w.cfg({ [ID]: path.join(w.repo, 'escape') }) // 登记的是根内的联接 → 真实目标在根外
    assert.match((await w.check(`git:${ID}@${head}`, g.runGit)).result, /路径不在允许范围/)
    assert.match((await w.check(`git:${path.join(w.repo, 'escape')}@${head}`, g.runGit)).result, /路径不在允许范围/)
  } finally { p.stop() }
  assert.deepEqual(g.calls, [], 'Git 调用：' + g.calls.join(' | '))
  assert.deepEqual(p.hits, [], '读取：' + p.hits.join(' | '))
})

test('F1 登记目录必须真实存在：不存在的目录不会被当作有效仓库去执行 Git', async (t) => {
  const w = world(t)
  w.cfg({ [ID]: path.join(w.root, 'no-such-repo') })
  const g = realGit()
  const r = await w.check(`git:${ID}@${'a'.repeat(40)}`, g.runGit)
  assert.match(r.result, /^无法核对/)
  assert.doesNotMatch(r.result, /版本一致|版本已变/)
  assert.deepEqual(g.calls, [])
  const legacy = await w.check(`git:${path.join(w.root, 'no-such-repo')}@${'a'.repeat(40)}`, g.runGit)
  assert.match(legacy.result, /^无法核对/); assert.deepEqual(g.calls, [])
})

test('F1 回归：普通缺失文件（含 Windows 8.3 短名目录下）仍是"文件不存在"，不是"路径越界"', async (t) => {
  const w = world(t)
  const r = await w.check(`sha256:${ID}:missing/deeper.txt=${H}`)
  assert.equal(r.result, '版本已变'); assert.match(r.note, /文件不存在/)
  if (WIN) {
    const long = path.join(w.repo, 'a-rather-long-directory-name'); fs.mkdirSync(long)
    let short = ''
    try { short = execFileSync('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${long.replace(/'/g, "''")}').ShortPath`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* 没有 */ }
    if (short && short !== long) {
      const s = await w.check(`sha256:${path.join(short, 'missing.txt')}=${H}`)
      assert.equal(s.result, '版本已变'); assert.match(s.note, /文件不存在/)
    }
  }
})

test('F1 回归：.. / 混合斜杠 / 绝对路径 / 盘符 / UNC / %2e%2e 都不会读到根外文件', async (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.outside, 'normal.txt'), PUBLIC)
  const p = probeReads([w.outside, 'outside'])
  try {
    for (const rel of ['../outside/normal.txt', '..\\outside/normal.txt', 'a/..\\../outside/normal.txt', 'C:/normal.txt', 'C:normal.txt', '/normal.txt', '\\normal.txt', '//server/share/normal.txt', '\\\\server\\share\\normal.txt', '%2e%2e/outside/normal.txt'])
      assert.notEqual((await w.check(`sha256:${ID}:${rel}=${H}`)).result, '版本一致', rel)
  } finally { p.stop() }
  assert.deepEqual(p.hits, [])
  { const r = await w.check(`sha256:${ID}:%6eormal.txt=${H}`); assert.equal(r.result, '版本已变'); assert.match(r.note, /文件不存在/, '%6e 不得被解码成 n') }
})

// ───── F2：受保护文件的别名 ─────
for (const variant of ['ADS', '8.3', 'symlink']) {
  test(`F2 受保护别名 ${variant}：受保护内容读取次数为 0，输出不含受保护名字；新旧写法共用`, async (t) => {
    const w = world(t)
    let rel
    if (variant === 'ADS') { if (!WIN) return t.skip('NTFS 数据流仅 Windows'); rel = 'config.json::$DATA' }
    else if (variant === '8.3') {
      if (!WIN) return t.skip('8.3 短名仅 Windows')
      let short = ''
      try { short = execFileSync('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject Scripting.FileSystemObject).GetFile('${path.join(w.repo, 'config.json').replace(/'/g, "''")}').ShortPath`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* 没有 */ }
      if (!short || path.basename(short).toLowerCase() === 'config.json') return t.skip('本机卷没有为 config.json 生成 8.3 短名')
      rel = path.basename(short)
    } else {
      rel = 'innocent.txt'
      if (!w.link(path.join(w.repo, 'config.json'), path.join(w.repo, rel), 'file')) return t.skip('本机不能创建文件符号链接')
    }
    for (const entry of [`sha256:${ID}:${rel}=${H}`, `sha256:${path.join(w.repo, rel)}=${H}`]) {
      const p = probeReads(['config.json', rel])
      let r
      try { r = await w.check(entry) } finally { p.stop() }
      assert.deepEqual(p.hits, [], `受保护目标被读取：${p.hits}`)
      assert.match(r.result, /受保护|路径不在允许范围/, r.result)
      const out = shown(r)
      assert.ok(!/config|innocent|CONFIG~/i.test(out), `输出泄露名字：${out}`)
    }
  })
}
test('F2 对照：直接写 config.json 仍被拒', async (t) => {
  const w = world(t)
  assert.match((await w.check(`sha256:${ID}:config.json=${H}`)).result, /受保护/)
})

test('F2 回归：正常文件、大小写、合法短路径仍可核对', async (t) => {
  const w = world(t)
  assert.equal((await w.check(`sha256:${ID}:normal.txt=${H}`)).result, '版本一致')
  assert.equal((await w.check(`sha256:${path.join(w.repo, 'normal.txt')}=${H}`)).result, '版本一致')
  if (WIN) {
    assert.equal((await w.check(`sha256:${ID}:NORMAL.TXT=${H}`)).result, '版本一致', '大小写')
    assert.equal((await w.check(`sha256:${path.join(w.repo, 'normal.txt').toUpperCase()}=${H}`)).result, '版本一致')
  }
  fs.mkdirSync(path.join(w.repo, 'sub')); fs.writeFileSync(path.join(w.repo, 'sub', 'ok.txt'), PUBLIC)
  assert.equal((await w.check(`sha256:${ID}:sub/ok.txt=${H}`)).result, '版本一致')
  assert.equal((await w.check(`sha256:${ID}:sub\\ok.txt=${H}`)).result === '版本一致', WIN) // 反斜杠仅在 Windows 是分隔符
})

// ───── F3：缺失 vs 查询失败 ─────
test('F3 真实 Git：真实缺失提交 → 先 fetch；已有提交 → 一致；非祖先 → 已变（新旧写法都是）', async (t) => {
  const w = world(t)
  const head = initRepo(w.repo)
  assert.equal((await w.check(`git:${ID}@${head.slice(0, 7)}`)).result, '版本一致')
  const missing = await w.check(`git:${ID}@${'f'.repeat(40)}`)
  assert.match(missing.result, /^无法核对/); assert.match(missing.note, /fetch/)
  // 与旧绝对路径写法的现有语义差异（刻意保留）：同一个不存在的提交，旧写法 = 已变，新写法 = 无法核对（先 fetch）
  assert.equal((await w.check(`git:${w.repo}@${'f'.repeat(40)}`)).result, '版本已变')
  git(w.repo, ['checkout', '-qb', 'side']); git(w.repo, [...identity, 'commit', '--allow-empty', '-qm', 'side']); const side = git(w.repo, ['rev-parse', 'HEAD']); git(w.repo, ['checkout', '-q', head])
  for (const name of [ID, w.repo]) assert.equal((await w.check(`git:${name}@${side}`)).result, '版本已变', name)
  // 任一已知哈希变化不能被另一个"先 fetch"掩盖
  const mixed = await w.check(`git:${ID}@${'f'.repeat(40)};sha256:${path.join(w.repo, 'normal.txt')}=${'0'.repeat(64)}`)
  assert.equal(mixed.result, '版本已变')
})

test('F3 真实 Git：登记的目录不是 Git 仓库 → 无法核对，且不说"先 fetch"', async (t) => {
  const w = world(t) // repo 目录存在但没有 git init
  const r = await w.check(`git:${ID}@${'a'.repeat(40)}`)
  assert.match(r.result, /^无法核对/)
  assert.doesNotMatch(shown(r), /fetch|没有该提交/)
})

test('F3 注入：已有提交上的 ETIMEDOUT / ENOENT / 被杀 → 无法核对（查询失败），不断言提交不存在', async (t) => {
  const w = world(t)
  const head = initRepo(w.repo)
  const cases = [
    ['validity ETIMEDOUT', () => ({ err: { code: 'ETIMEDOUT', message: 'timed out' }, code: 'ETIMEDOUT', stdout: '', stderr: '' })],
    ['git not executable ENOENT', () => ({ err: { code: 'ENOENT', message: 'spawn git ENOENT' }, code: 'ENOENT', stdout: '', stderr: '' })],
    ['killed', () => ({ err: { killed: true, code: null, message: 'killed' }, code: null, stdout: '', stderr: '' })],
  ]
  for (const [name, bad] of cases) {
    const g = fake(bad)
    const r = await w.check(`git:${ID}@${head}`, g.runGit)
    assert.match(r.result, /^无法核对/, name)
    assert.doesNotMatch(shown(r), /fetch|本机仓库没有/, name)
  }
  // 仓库有效，但对象查询那一步失败（注入）
  const g2 = fake((args) => (args.includes('--git-dir') ? ok('.git') : { err: { code: 'ETIMEDOUT', message: 'x' }, code: 'ETIMEDOUT', stdout: '', stderr: '' }))
  const r2 = await w.check(`git:${ID}@${head}`, g2.runGit)
  assert.match(r2.result, /^无法核对/); assert.doesNotMatch(shown(r2), /fetch|本机仓库没有/)
  // 退出码 128（对象库损坏等）也不是"提交缺失"
  const g3 = fake((args) => (args.includes('--git-dir') ? ok('.git') : { err: { code: 128, message: 'fatal: bad object' }, code: 128, stdout: '', stderr: 'fatal: bad object store' }))
  const r3 = await w.check(`git:${ID}@${head}`, g3.runGit)
  assert.match(r3.result, /^无法核对/); assert.doesNotMatch(shown(r3), /fetch|本机仓库没有/)
  // 比较阶段的 merge-base 超时：不能被当成"已变"
  const g4 = fake((args) => (args[args.length - 2] === '--is-ancestor' || args.includes('--is-ancestor') ? { err: { code: 'ETIMEDOUT', message: 'x' }, code: 'ETIMEDOUT', stdout: '', stderr: '' } : args.includes('HEAD') && args.includes('rev-parse') ? ok('b'.repeat(40)) : ok('.git')))
  for (const entry of [`git:${ID}@${head}`, `git:${w.repo}@${head}`]) {
    const r4 = await w.check(entry, g4.runGit)
    assert.match(r4.result, /^无法核对/, entry); assert.notEqual(r4.result, '版本已变')
  }
})

// ───── F4：受保护检查先于任何 Git ─────
test('F4 登记目录命中受保护规则（.env-fixture）→ 拒绝，Git 调用次数为 0', async (t) => {
  const w = world(t)
  const bad = path.join(w.root, '.env-fixture'); fs.mkdirSync(bad); initRepo(bad)
  w.cfg({ [ID]: bad })
  const g = realGit()
  const r = await w.check(`git:${ID}@${'a'.repeat(7)}`, g.runGit)
  assert.match(r.result, /受保护/)
  assert.deepEqual(g.calls, [])
  assert.ok(!shown(r).includes('.env'), shown(r))
  const s = await w.check(`sha256:${ID}:normal.txt=${H}`, g.runGit)
  assert.match(s.result, /受保护/); assert.deepEqual(g.calls, [])
})

// ───── 其它回归 ─────
test('回归：未登记的仓库标识不访问磁盘目标、不执行 Git', async (t) => {
  const w = world(t)
  const g = realGit(), p = probeReads(['normal.txt'])
  try {
    assert.match((await w.check(`git:other/repo@${'a'.repeat(7)}`, g.runGit)).note, /没有登记仓库/)
    assert.match((await w.check(`sha256:other/repo:normal.txt=${H}`, g.runGit)).note, /没有登记仓库/)
  } finally { p.stop() }
  assert.deepEqual(g.calls, []); assert.deepEqual(p.hits, [])
})

test('回归：新旧写法混写；已知哈希变化压过"先 fetch / 无法核对"', async (t) => {
  const w = world(t)
  const head = initRepo(w.repo)
  assert.equal((await w.check(`git:${w.repo}@${head};sha256:${ID}:normal.txt=${H}`)).result, '版本一致')
  assert.equal((await w.check(`git:${ID}@${'e'.repeat(40)};sha256:${ID}:normal.txt=${'0'.repeat(64)};sha256:other/x:y=${H}`)).result, '版本已变')
})

// ───── 大小写：POSIX 大小写敏感目录不得被认作同一目录 ─────
test('insideRoots：大小写敏感的文件系统上，仅大小写不同的兄弟目录不在根内（Windows 上改测大小写不敏感）', (t) => {
  const dir = tmp()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const upper = path.join(dir, 'Roots'), lower = path.join(dir, 'roots')
  if (WIN) {
    fs.mkdirSync(upper)
    assert.equal(insideRoots(path.join(dir, 'ROOTS', 'x.txt'), [upper]), true, 'Windows 大小写不敏感')
    return
  }
  fs.mkdirSync(upper); fs.mkdirSync(lower)
  if (fs.statSync(upper).ino === fs.statSync(lower).ino) return t.skip('这个卷大小写不敏感（macOS 默认）：Roots 与 roots 就是同一目录')
  assert.equal(insideRoots(path.join(lower, 'x.txt'), [upper]), false, '大小写敏感：roots 不是 Roots')
  assert.equal(insideRoots(path.join(upper, 'x.txt'), [upper]), true)
})
