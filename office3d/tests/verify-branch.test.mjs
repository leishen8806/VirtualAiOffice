// DS-6：tools/verify-branch.mjs 的自身测试。
// 在系统临时目录里用 git init 建最小仓库夹具，不依赖网络或本仓库以外的文件。
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'verify-branch.mjs')

const fixtures = []
after(() => { for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true }) })

const tmpPrefixes = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('verify-branch-'))

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return result
}

function git(cwd, args) {
  const result = run(cwd, 'git', ['-C', cwd, ...args])
  assert.equal(result.status, 0, `git ${args.join(' ')} 失败：${result.stderr}`)
  return result.stdout
}

function write(root, relative, content) {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

const MOD_SOURCE = `export function grade(x, limit) { return x >= limit ? 'pass' : 'fail' }
export function label(n) { return n > 0 ? 'pos' : 'neg' }
`
const MOD_TEST = `import test from 'node:test'
import assert from 'node:assert/strict'
import { grade, label } from '../mod.mjs'
test('grade boundary', () => { assert.equal(grade(2, 2), 'pass'); assert.equal(grade(1, 2), 'fail') })
test('label positive and negative', () => { assert.equal(label(1), 'pos'); assert.equal(label(-1), 'neg') })
`

/** 建一个最小夹具仓库：base 提交 + 若干 head 分支。 */
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-branch-fixture-'))
  fixtures.push(root)
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'fixture@example.invalid'])
  git(root, ['config', 'user.name', 'fixture'])
  write(root, 'mod.mjs', MOD_SOURCE)
  write(root, 'tests/mod.test.mjs', MOD_TEST)
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'base'])
  const base = git(root, ['rev-parse', 'HEAD']).trim()
  git(root, ['tag', 'base', base])

  const branch = (name, change) => {
    git(root, ['checkout', '-q', '-b', name, 'base'])
    change(root)
    git(root, ['add', '-A'])
    git(root, ['commit', '-q', '-m', name])
    git(root, ['checkout', '-q', 'base'])
  }

  branch('head-good', (r) => {
    write(r, 'tests/extra.test.mjs', "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('extra', () => { assert.equal(1, 1) })\n")
  })
  branch('head-range', (r) => {
    write(r, 'mod.mjs', `${MOD_SOURCE}// 越界改动\n`)
  })
  branch('head-testfail', (r) => {
    write(r, 'tests/fail.test.mjs', "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('broken', () => { assert.equal(1, 2) })\n")
  })
  branch('head-newline', (r) => {
    write(r, 'mod.mjs', MOD_SOURCE.replace(/\n/g, '\r\n'))
  })
  branch('head-scan', (r) => {
    const token = 'ghp_' + 'x'.repeat(40)
    const ip = '10.' + '0.0.7'
    write(r, 'tests/scan.test.mjs', `export const token = '${token}'\nexport const host = '${ip}'\n`)
  })
  return { root, base }
}

function writeConfig(root, config) {
  write(root, 'verify.json', `${JSON.stringify(config, null, 2)}\n`)
}

function verify(root, args) {
  const result = run(root, process.execPath, [TOOL, '--repo', root, ...args])
  return { code: result.status, stdout: `${result.stdout || ''}`, stderr: `${result.stderr || ''}` }
}

const BASE_CONFIG = (overrides = {}) => ({
  allowedChanges: [],
  protectedFiles: [],
  tests: { cwd: '.', files: ['tests/mod.test.mjs'] },
  scan: { forbiddenApis: [], extraTerms: [] },
  ...overrides,
})

test('越界改动判失败（退出码 1）并列出文件', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({ allowedChanges: ['tests/extra.test.mjs'] }))
  const result = verify(root, ['--base', 'base', '--head', 'head-range', '--config', 'verify.json'])
  assert.equal(result.code, 1, result.stdout + result.stderr)
  assert.match(result.stdout, /范围检查 FAIL/)
  assert.match(result.stdout, /mod\.mjs/)
})

test('受保护文件只改换行符时通过并给出 WARN', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({ allowedChanges: ['mod.mjs'], protectedFiles: ['mod.mjs'] }))
  const result = verify(root, ['--base', 'base', '--head', 'head-newline', '--config', 'verify.json'])
  assert.equal(result.code, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /受保护文件 PASS/)
  assert.match(result.stdout, /WARN 仅换行符不同/)
})

test('测试失败时退出码 2', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({
    allowedChanges: ['tests/fail.test.mjs'],
    tests: { cwd: '.', files: ['tests/mod.test.mjs', 'tests/fail.test.mjs'] },
  }))
  const result = verify(root, ['--base', 'base', '--head', 'head-testfail', '--config', 'verify.json'])
  assert.equal(result.code, 2, result.stdout + result.stderr)
  assert.match(result.stdout, /测试 FAIL/)
})

test('有效变异 KILLED，整体通过', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({
    allowedChanges: ['tests/extra.test.mjs'],
    module: { path: 'mod.mjs', envVar: 'MOD_MODULE', companions: [], mirrorTests: true },
    mutations: [{ name: 'boundary', find: 'x >= limit', replace: 'x > limit' }],
  }))
  const result = verify(root, ['--base', 'base', '--head', 'head-good', '--config', 'verify.json'])
  assert.equal(result.code, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /boundary: KILLED/)
  assert.match(result.stdout, /变异自检 PASS/)
})

test('测试抓不到的变异得到 SURVIVED 与退出码 3', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({
    allowedChanges: ['tests/extra.test.mjs'],
    module: { path: 'mod.mjs', envVar: 'MOD_MODULE', companions: [], mirrorTests: true },
    mutations: [{ name: 'survivor', find: "n > 0 ? 'pos'", replace: "n >= 0 ? 'pos'" }],
  }))
  const result = verify(root, ['--base', 'base', '--head', 'head-good', '--config', 'verify.json'])
  assert.equal(result.code, 3, result.stdout + result.stderr)
  assert.match(result.stdout, /survivor: SURVIVED/)
  assert.match(result.stdout, /变异自检 FAIL/)
})

test('find 出现 0 次 / 2 次 / 替换后不变 都得到 NOT_APPLIED 且不影响通过', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({
    allowedChanges: ['tests/extra.test.mjs'],
    module: { path: 'mod.mjs', envVar: 'MOD_MODULE', companions: [], mirrorTests: true },
    mutations: [
      { name: 'absent', find: 'this string is absent', replace: 'x' },
      { name: 'ambiguous', find: 'export function', replace: 'export const' },
      { name: 'same', find: 'x >= limit', replace: 'x >= limit' },
    ],
  }))
  const result = verify(root, ['--base', 'base', '--head', 'head-good', '--config', 'verify.json'])
  assert.equal(result.code, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /absent: NOT_APPLIED（find 出现 0 次/)
  assert.match(result.stdout, /ambiguous: NOT_APPLIED（find 出现 2 次/)
  assert.match(result.stdout, /same: NOT_APPLIED（替换前后内容相同/)
  assert.match(result.stdout, /killed=0 notApplied=3/)
})

test('扫描命中退出码 4，输出只含文件名/行号/规则名、不含命中原文', () => {
  const { root } = makeFixture()
  const token = 'ghp_' + 'x'.repeat(40)
  const ip = '10.' + '0.0.7'
  writeConfig(root, BASE_CONFIG({ allowedChanges: ['tests/scan.test.mjs'] }))
  const result = verify(root, ['--base', 'base', '--head', 'head-scan', '--config', 'verify.json'])
  assert.equal(result.code, 4, result.stdout + result.stderr)
  assert.match(result.stdout, /扫描 FAIL/)
  assert.match(result.stdout, /github_ghp_token/)
  assert.match(result.stdout, /ipv4_address/)
  assert.equal(result.stdout.includes(token), false, '输出不得包含命中令牌原文')
  assert.equal(result.stdout.includes(ip), false, '输出不得包含命中 IP 原文')
})

test('成功与异常路径都会清理临时目录与 worktree', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({
    allowedChanges: ['tests/extra.test.mjs'],
    module: { path: 'mod.mjs', envVar: 'MOD_MODULE', companions: [], mirrorTests: true },
    mutations: [{ name: 'boundary', find: 'x >= limit', replace: 'x > limit' }],
  }))
  const before = tmpPrefixes()
  const ok = verify(root, ['--base', 'base', '--head', 'head-good', '--config', 'verify.json'])
  assert.equal(ok.code, 0, ok.stdout + ok.stderr)
  assert.deepEqual(tmpPrefixes(), before, '成功路径不应残留临时目录')
  assert.equal(git(root, ['worktree', 'list']).trim().split('\n').length, 1, 'worktree 应被移除')

  const badRef = verify(root, ['--base', 'base', '--head', 'no-such-ref', '--config', 'verify.json'])
  assert.equal(badRef.code, 5, badRef.stdout + badRef.stderr)
  assert.deepEqual(tmpPrefixes(), before, '异常路径不应残留临时目录')
})

test('参数与配置错误返回退出码 5', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG())
  assert.equal(verify(root, ['--head', 'head-good', '--config', 'verify.json']).code, 5, '缺少 --base')
  write(root, 'broken.json', '{ not json')
  assert.equal(verify(root, ['--base', 'base', '--head', 'head-good', '--config', 'broken.json']).code, 5, '坏配置')
})

test('--json 写出结构化结果', () => {
  const { root } = makeFixture()
  writeConfig(root, BASE_CONFIG({
    allowedChanges: ['tests/extra.test.mjs'],
    module: { path: 'mod.mjs', envVar: 'MOD_MODULE', companions: [], mirrorTests: true },
    mutations: [{ name: 'boundary', find: 'x >= limit', replace: 'x > limit' }],
  }))
  const result = verify(root, ['--base', 'base', '--head', 'head-good', '--config', 'verify.json', '--json', 'out.json'])
  assert.equal(result.code, 0, result.stdout + result.stderr)
  const json = JSON.parse(fs.readFileSync(path.join(root, 'out.json'), 'utf8'))
  assert.equal(json.exitCode, 0)
  assert.equal(json.steps.mutations.killed, 1)
  assert.equal(json.steps.scan.pass, true)
})
