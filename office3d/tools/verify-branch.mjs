#!/usr/bin/env node
// DS-6：分支验收工具（只读、零依赖、Windows / macOS 通用）。
// 把「范围检查 → 保护文件 → 跑测试 → 变异自检 → 敏感信息扫描」这套人工验收流程自动化。
// 安全边界：不 commit / 不 push / 不 checkout / 不改任何已跟踪文件；只在系统临时目录写文件并在 finally 清理。
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXIT = Object.freeze({ ok: 0, range: 1, tests: 2, survived: 3, scan: 4, args: 5 })
const DEFAULT_TEST_ARGS = ['--max-old-space-size=2048', '--test', '--test-timeout=60000', '--test-concurrency=2']

class VerifyError extends Error {
  constructor(message, code = EXIT.args) {
    super(message)
    this.code = code
  }
}

function parseArgs(argv) {
  const out = { repo: process.cwd(), base: null, head: 'HEAD', config: null, json: null }
  const takes = { '--repo': 'repo', '--base': 'base', '--head': 'head', '--config': 'config', '--json': 'json' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const key = takes[flag]
    if (!key) throw new VerifyError(`未知参数：${flag}`)
    const value = argv[++i]
    if (value === undefined || value.startsWith('--')) throw new VerifyError(`参数 ${flag} 缺少值`)
    out[key] = value
  }
  if (!out.base) throw new VerifyError('缺少 --base')
  if (!out.config) throw new VerifyError('缺少 --config')
  out.repo = path.resolve(out.repo)
  out.config = path.resolve(out.repo, out.config)
  if (out.json) out.json = path.resolve(out.repo, out.json)
  return out
}

function git(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw new VerifyError(`git 无法运行：${result.error.message}`, EXIT.args)
  if (result.status !== 0) {
    throw new VerifyError(`git ${args.join(' ')} 失败：${String(result.stderr || '').trim().slice(0, 400)}`, EXIT.args)
  }
  return result.stdout
}

function gitMaybe(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return result.status === 0 ? result.stdout : null
}

function gitShowBuffer(repo, spec) {
  // 不传 encoding：拿到的是 git 对象库里的原始字节，不受工作区 / core.autocrlf 换行转换影响。
  const result = spawnSync('git', ['-C', repo, 'show', spec], { maxBuffer: 64 * 1024 * 1024 })
  if (result.error || result.status !== 0) return null
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '')
}

function normalizeCrlf(buffer) {
  const out = Buffer.allocUnsafe(buffer.length)
  let length = 0
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 13 && buffer[i + 1] === 10) continue
    out[length++] = buffer[i]
  }
  return out.subarray(0, length)
}

// 按 ref 从对象库读文本（不读工作区），保证变异 find 的字符串与提交内容逐字节一致。
function readBlobText(repo, ref, relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  const blob = gitShowBuffer(repo, `${ref}:${normalized}`)
  return blob === null ? null : blob.toString('utf8')
}

function resolveRef(repo, ref) {
  if (gitMaybe(repo, ['rev-parse', '--verify', '--quiet', ref]) !== null) return ref
  const remote = `origin/${ref}`
  if (gitMaybe(repo, ['rev-parse', '--verify', '--quiet', remote]) !== null) return remote
  throw new VerifyError(`无法解析 ref：${ref}（也不存在 ${remote}）`, EXIT.args)
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')

function readConfig(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (error) {
    throw new VerifyError(`读取配置失败：${error.message}`)
  }
  let config
  try {
    config = JSON.parse(raw)
  } catch (error) {
    throw new VerifyError(`配置不是合法 JSON：${error.message}`)
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new VerifyError('配置必须是对象')
  const strings = (value, name) => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item === '')) {
      throw new VerifyError(`${name} 必须是非空字符串数组`)
    }
    return [...value]
  }
  const cfg = {
    allowedChanges: strings(config.allowedChanges || [], 'allowedChanges'),
    protectedFiles: strings(config.protectedFiles || [], 'protectedFiles'),
    tests: null,
    module: null,
    mutations: [],
    scan: { forbiddenApis: [], extraTerms: [], allowValuePattern: '^fixture-[A-Za-z0-9_-]+$', allowValueRegex: null },
  }
  if (!config.tests || typeof config.tests !== 'object') throw new VerifyError('缺少 tests 配置')
  cfg.tests = { cwd: String(config.tests.cwd || '.'), files: strings(config.tests.files || [], 'tests.files') }
  if (!cfg.tests.files.length) throw new VerifyError('tests.files 不能为空')
  if (config.module !== undefined) {
    if (!config.module || typeof config.module.path !== 'string' || !config.module.path) throw new VerifyError('module.path 必须是非空字符串')
    if (typeof config.module.envVar !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.module.envVar)) {
      throw new VerifyError('module.envVar 必须是合法的环境变量名')
    }
    cfg.module = {
      path: config.module.path,
      envVar: config.module.envVar,
      companions: strings(config.module.companions || [], 'module.companions'),
      mirrorTests: config.module.mirrorTests === true,
    }
  }
  if (Array.isArray(config.mutations)) {
    for (const [index, mutation] of config.mutations.entries()) {
      if (!mutation || typeof mutation !== 'object') throw new VerifyError(`mutations[${index}] 必须是对象`)
      if (typeof mutation.find !== 'string' || mutation.find === '') throw new VerifyError(`mutations[${index}].find 必须是非空字符串`)
      if (typeof mutation.replace !== 'string') throw new VerifyError(`mutations[${index}].replace 必须是字符串`)
      cfg.mutations.push({ name: String(mutation.name || `mutation-${index + 1}`), find: mutation.find, replace: mutation.replace })
    }
  }
  if (cfg.mutations.length && !cfg.module) throw new VerifyError('配置了 mutations 时必须提供 module')
  if (config.scan && typeof config.scan === 'object') {
    cfg.scan.forbiddenApis = strings(config.scan.forbiddenApis || [], 'scan.forbiddenApis')
    cfg.scan.extraTerms = strings(config.scan.extraTerms || [], 'scan.extraTerms')
    if (config.scan.allowValuePattern !== undefined) {
      if (typeof config.scan.allowValuePattern !== 'string' || config.scan.allowValuePattern === '') {
        throw new VerifyError('scan.allowValuePattern 必须是非空字符串')
      }
      cfg.scan.allowValuePattern = config.scan.allowValuePattern
    }
    try {
      cfg.scan.allowValueRegex = new RegExp(cfg.scan.allowValuePattern)
    } catch (error) {
      throw new VerifyError(`scan.allowValuePattern 不是合法正则：${error.message}`)
    }
  }
  return cfg
}

function stepRange(repo, base, head, config) {
  const raw = git(repo, ['diff', '--name-status', `${base}...${head}`])
  const changed = []
  for (const line of raw.split('\n').filter(Boolean)) {
    const parts = line.split('\t')
    const status = parts[0]
    if (status.startsWith('R') || status.startsWith('C')) changed.push(parts[1], parts[2])
    else changed.push(parts[1] || parts[0])
  }
  const unique = [...new Set(changed.filter(Boolean))]
  const allowed = new Set(config.allowedChanges)
  const extra = unique.filter((file) => !allowed.has(file))
  return { pass: extra.length === 0, changed: unique, extra }
}

function stepProtected(repo, base, head, config) {
  const changed = []
  const missing = []
  const failed = []
  const lineEndingOnly = []
  for (const file of config.protectedFiles) {
    // 直接比较 git 对象库里的原始字节；不经过工作区，也不受 core.autocrlf 影响。
    const before = gitShowBuffer(repo, `${base}:${file}`)
    const after = gitShowBuffer(repo, `${head}:${file}`)
    if (before === null || after === null) {
      missing.push(file)
      continue
    }
    if (before.equals(after)) continue
    if (normalizeCrlf(before).equals(normalizeCrlf(after))) {
      lineEndingOnly.push(file)
      continue
    }
    failed.push(file)
    changed.push(file)
  }
  return { pass: missing.length === 0 && failed.length === 0, changed, missing, failed, lineEndingOnly }
}

function parseCounts(output) {
  const grab = (label) => {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:(?:ℹ|#)\\s*)?${label}\\s+(\\d+)`)
    const match = String(output).match(pattern)
    return match ? Number(match[1]) : null
  }
  return { tests: grab('tests'), pass: grab('pass'), fail: grab('fail') }
}

function testEnv(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  // 父进程若本身就是 node --test 的子测试，会带这两个变量；传给子 runner 会让它不输出摘要。
  delete env.NODE_TEST_CONTEXT
  delete env.NODE_OPTIONS
  return env
}

function runTests(cwd, files, extraEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [...DEFAULT_TEST_ARGS, ...files],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: testEnv(extraEnv),
    },
  )
  const output = `${result.stdout || ''}${result.stderr || ''}`
  return { status: result.status, output, ...parseCounts(output) }
}

function summarizeTests(result) {
  if (result.tests === null || result.pass === null || result.fail === null) {
    return { ...result, ok: false, reason: `无法解析测试结果（退出码 ${result.status}）` }
  }
  return { ...result, ok: result.fail === 0, reason: result.fail === 0 ? 'ok' : `${result.fail} 个测试失败` }
}

function copyFilePreserving(sourceRoot, relativePath, targetRoot, { forceMjs = false, content = null } = {}) {
  const normalized = relativePath.replace(/\\/g, '/')
  const targetRelative = forceMjs ? normalized.replace(/\.[^.\/]+$/, '.mjs') : normalized
  const source = path.join(sourceRoot, normalized)
  const target = path.join(targetRoot, targetRelative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (content === null) fs.copyFileSync(source, target)
  else fs.writeFileSync(target, content)
  return target
}

function copyTree(source, target, { skip = new Set(['node_modules', '.git']) } = {}) {
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) copyTree(from, to, { skip })
    else if (entry.isFile()) fs.copyFileSync(from, to)
  }
}

function prepareMirror({ sourceRoot, caseDir, config, readSource = (rel) => fs.readFileSync(path.join(sourceRoot, rel), 'utf8') }) {
  // 只镜像测试目录与被测模块（含 companions），避免复制整个大型资源目录。
  const mirrorRoot = path.join(caseDir, 'mirror')
  const sourceCwd = path.join(sourceRoot, config.tests.cwd)
  const targetCwd = path.join(mirrorRoot, config.tests.cwd)
  const testsDir = path.join(sourceCwd, 'tests')
  if (fs.existsSync(testsDir) && fs.statSync(testsDir).isDirectory()) copyTree(testsDir, path.join(targetCwd, 'tests'))
  for (const file of config.tests.files) {
    const from = path.join(sourceCwd, file)
    const to = path.join(targetCwd, file)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  const moduleCopy = copyFilePreserving(sourceRoot, config.module.path, mirrorRoot, { forceMjs: true, content: readSource(config.module.path) })
  for (const companion of config.module.companions) copyFilePreserving(sourceRoot, companion, mirrorRoot, { forceMjs: true, content: readSource(companion) })
  return { cwd: targetCwd, moduleCopy }
}

function stepMutations({ repo, head, config, tempRoot, testsCwd }) {
  const mutations = []
  const tempDir = tempRoot
  // Windows 上工作区可能因 core.autocrlf 被换成 CRLF；变异必须基于提交里的原始字节，
  // 否则 find 会一个都匹配不到（NOT_APPLIED）。取不到 blob（如未跟踪文件）才回退工作区。
  const readSource = (relativePath) => {
    const blob = readBlobText(repo, head, relativePath)
    if (blob !== null) return blob
    return fs.readFileSync(path.join(repo, relativePath.replace(/\\/g, '/')), 'utf8')
  }
  try {
    for (const [index, mutation] of config.mutations.entries()) {
      const caseDir = path.join(tempDir, `case-${index + 1}`)
      let mirror = null
      try {
        fs.mkdirSync(caseDir, { recursive: true })
        const sourceRoot = config.module.mirrorTests ? path.resolve(repo) : path.resolve(repo)
        let moduleCopy
        let cwd
        if (config.module.mirrorTests) {
          mirror = prepareMirror({ sourceRoot, caseDir, config, readSource })
          moduleCopy = mirror.moduleCopy
          cwd = mirror.cwd
        } else {
          moduleCopy = copyFilePreserving(sourceRoot, config.module.path, caseDir, { forceMjs: true, content: readSource(config.module.path) })
          for (const companion of config.module.companions) copyFilePreserving(sourceRoot, companion, caseDir, { forceMjs: true, content: readSource(companion) })
          cwd = testsCwd
        }
        const original = fs.readFileSync(moduleCopy, 'utf8')
        const occurrences = original.split(mutation.find).length - 1
        if (occurrences !== 1) {
          mutations.push({ name: mutation.name, result: 'NOT_APPLIED', reason: `find 出现 ${occurrences} 次（必须恰好 1 次）` })
          continue
        }
        const replaced = original.replace(mutation.find, mutation.replace)
        if (replaced === original) {
          mutations.push({ name: mutation.name, result: 'NOT_APPLIED', reason: '替换前后内容相同' })
          continue
        }
        const beforeHash = sha256(original)
        const afterHash = sha256(replaced)
        if (beforeHash === afterHash) {
          mutations.push({ name: mutation.name, result: 'NOT_APPLIED', reason: '替换前后 SHA-256 相同' })
          continue
        }
        fs.writeFileSync(moduleCopy, replaced)
        const run = runTests(cwd, config.tests.files, { [config.module.envVar]: moduleCopy })
        if (run.tests === null) {
          mutations.push({ name: mutation.name, result: 'NOT_APPLIED', reason: `变异副本无法运行测试（退出码 ${run.status}）` })
          continue
        }
        mutations.push({
          name: mutation.name,
          result: run.fail > 0 ? 'KILLED' : 'SURVIVED',
          fail: run.fail,
          shaBefore: beforeHash,
          shaAfter: afterHash,
        })
      } finally {
        fs.rmSync(caseDir, { recursive: true, force: true })
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  const killed = mutations.filter((item) => item.result === 'KILLED').length
  const survived = mutations.filter((item) => item.result === 'SURVIVED').length
  const notApplied = mutations.filter((item) => item.result === 'NOT_APPLIED').length
  return { pass: survived === 0, mutations, killed, survived, notApplied }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildScanRules(config) {
  const rules = [
    ['private_key_header', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['openai_sk_token', /\bsk-[A-Za-z0-9_-]{16,}/],
    ['github_ghp_token', new RegExp('\\bghp_' + '[A-Za-z0-9]{30,}')],
    ['github_pat_token', new RegExp('\\bgithub_pat_' + '[A-Za-z0-9_]{40,}')],
    ['aws_access_key', new RegExp('\\bAKIA' + '[0-9A-Z]{16}\\b')],
    ['slack_token', new RegExp('\\bxox' + '[abposr]-[A-Za-z0-9-]{10,}')],
    ['bearer_token', new RegExp('\\bBearer\\s+' + '[A-Za-z0-9._~+/=-]{12,}')],
    ['credential_assignment', new RegExp('\\b(?:password|secret|api[_-]?key|access[_-]?token)\\b\\s*[:=]\\s*["\']' + '([^"\']{8,})["\']', 'i')],
    ['ipv4_address', new RegExp('\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b')],
    ['windows_drive_path', new RegExp('[A-Za-z]:' + '\\\\')],
    ['mac_user_path', new RegExp('/' + 'Users' + '/')],
  ]
  for (const api of config.scan.forbiddenApis) rules.push([`forbidden_api:${api}`, new RegExp(escapeRegExp(api))])
  for (const term of config.scan.extraTerms) rules.push([`extra_term:${term}`, new RegExp(escapeRegExp(term))])
  return rules
}

// 只有「赋值右侧字符串」这一类命中可以被测试夹具白名单降级；令牌 / 私钥等规则永远不放行。
const VALUE_RULES = new Set(['credential_assignment'])

function stepScan({ repo, base, head, config, changedFiles }) {
  const rules = buildScanRules(config)
  const hits = []
  const allowedFixtures = []
  const deleted = new Set()
  const statusRaw = git(repo, ['diff', '--name-status', `${base}...${head}`])
  for (const line of statusRaw.split('\n').filter(Boolean)) {
    const [status, file] = line.split('\t')
    if (status === 'D') deleted.add(file)
  }
  for (const file of changedFiles) {
    if (deleted.has(file)) continue
    const content = gitMaybe(repo, ['show', `${head}:${file}`])
    if (content === null) continue
    if (content.includes('\u0000')) continue
    const lines = content.split('\n')
    for (const [index, line] of lines.entries()) {
      for (const [rule, pattern] of rules) {
        if (VALUE_RULES.has(rule)) {
          const match = pattern.exec(line)
          if (!match) continue
          const value = match[1] || ''
          if (config.scan.allowValueRegex.test(value)) allowedFixtures.push({ file, line: index + 1, rule })
          else hits.push({ file, line: index + 1, rule })
          continue
        }
        if (pattern.test(line)) hits.push({ file, line: index + 1, rule })
      }
    }
  }
  return { pass: hits.length === 0, hits, allowedFixtures }
}

function main(argv) {
  const args = parseArgs(argv)
  const config = readConfig(args.config)
  const base = resolveRef(args.repo, args.base)
  const head = resolveRef(args.repo, args.head)
  const result = {
    ok: false,
    exitCode: EXIT.ok,
    repo: args.repo,
    base,
    head,
    config: args.config,
    steps: {},
    warnings: [],
  }
  const print = (message) => console.log(message)
  let worktree = null
  let worktreeRoot = null

  try {
    // 1. 范围
    result.steps.range = stepRange(args.repo, base, head, config)
    if (result.steps.range.pass) print(`[1/5] 范围检查 PASS（${result.steps.range.changed.length} 个变更文件）`)
    else {
      print(`[1/5] 范围检查 FAIL：${result.steps.range.extra.length} 个文件不在 allowedChanges`)
      for (const file of result.steps.range.extra) print(`      - ${file}`)
    }

    // 2. 受保护文件
    result.steps.protected = stepProtected(args.repo, base, head, config)
    if (result.steps.protected.pass) {
      print(`[2/5] 受保护文件 PASS（${config.protectedFiles.length} 个）`)
      if (result.steps.protected.lineEndingOnly.length) {
        print(`      WARN 仅换行符不同：${result.steps.protected.lineEndingOnly.join(', ')}`)
        result.warnings.push(`line-ending-only:${result.steps.protected.lineEndingOnly.join(',')}`)
      }
    } else {
      print('[2/5] 受保护文件 FAIL')
      for (const file of result.steps.protected.missing) print(`      - 缺失：${file}`)
      for (const file of result.steps.protected.failed) print(`      - 内容改变：${file}`)
    }

    // 3. 测试（head 不是当前检出时用 worktree）
    let testRoot = args.repo
    const headCommit = git(args.repo, ['rev-parse', head]).trim()
    const currentCommit = git(args.repo, ['rev-parse', 'HEAD']).trim()
    if (headCommit !== currentCommit) {
      worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-branch-wt-'))
      worktree = path.join(worktreeRoot, 'tree')
      git(args.repo, ['worktree', 'add', '--detach', worktree, headCommit])
      testRoot = worktree
    }
    const testsCwd = path.join(testRoot, config.tests.cwd)
    const baseline = summarizeTests(runTests(testsCwd, config.tests.files))
    result.steps.tests = baseline
    if (baseline.ok) print(`[3/5] 测试 PASS（${baseline.pass}/${baseline.tests}）`)
    else print(`[3/5] 测试 FAIL：${baseline.reason}（tests=${baseline.tests} pass=${baseline.pass} fail=${baseline.fail}）`)

    // 4. 变异
    if (!config.mutations.length) {
      result.steps.mutations = { pass: true, mutations: [], killed: 0, survived: 0, notApplied: 0 }
      print('[4/5] 变异自检 SKIP（配置未提供 mutations）')
    } else {
      const mutationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-branch-mut-'))
      try {
        result.steps.mutations = stepMutations({
          repo: path.resolve(repoForSources(args.repo, worktree, headCommit)),
          head: headCommit,
          config,
          tempRoot: mutationRoot,
          testsCwd,
        })
      } finally {
        fs.rmSync(mutationRoot, { recursive: true, force: true })
      }
      const summary = result.steps.mutations
      for (const mutation of summary.mutations) {
        if (mutation.result === 'NOT_APPLIED') print(`      WARN ${mutation.name}: NOT_APPLIED（${mutation.reason}）`)
        else print(`      ${mutation.result === 'KILLED' ? 'PASS' : 'FAIL'} ${mutation.name}: ${mutation.result}`)
      }
      if (summary.survived > 0) print(`[4/5] 变异自检 FAIL：${summary.survived} 个 SURVIVED`)
      else print(`[4/5] 变异自检 PASS（killed=${summary.killed} notApplied=${summary.notApplied}）`)
    }

    // 5. 敏感信息与禁用 API 扫描
    result.steps.scan = stepScan({ repo: args.repo, base, head, config, changedFiles: result.steps.range.changed })
    if (result.steps.scan.allowedFixtures.length) {
      print(`      放行测试夹具假值 ${result.steps.scan.allowedFixtures.length} 处（ALLOWED_FIXTURE，不判失败）`)
      for (const fixture of result.steps.scan.allowedFixtures) print(`      - ${fixture.file}:${fixture.line} [${fixture.rule}]`)
      result.warnings.push(`allowed-fixtures:${result.steps.scan.allowedFixtures.length}`)
    }
    if (result.steps.scan.pass) print('[5/5] 扫描 PASS')
    else {
      print(`[5/5] 扫描 FAIL：${result.steps.scan.hits.length} 处命中`)
      for (const hit of result.steps.scan.hits) print(`      - ${hit.file}:${hit.line} [${hit.rule}]`)
    }

    if (!result.steps.range.pass || !result.steps.protected.pass) result.exitCode = EXIT.range
    else if (!result.steps.tests.ok) result.exitCode = EXIT.tests
    else if (result.steps.mutations.survived > 0) result.exitCode = EXIT.survived
    else if (!result.steps.scan.pass) result.exitCode = EXIT.scan
    else result.exitCode = EXIT.ok
    result.ok = result.exitCode === EXIT.ok
    print(`RESULT ${result.ok ? 'PASS' : 'FAIL'} exit=${result.exitCode}`)
  } finally {
    if (worktree) {
      gitMaybe(args.repo, ['worktree', 'remove', '--force', worktree])
      worktree = null
    }
    if (worktreeRoot) fs.rmSync(worktreeRoot, { recursive: true, force: true })
  }

  if (args.json) {
    fs.writeFileSync(args.json, `${JSON.stringify(result, null, 2)}\n`)
  }
  return result.exitCode
}

function repoForSources(repo, worktree, _commit) {
  return worktree || repo
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  if (error instanceof VerifyError) {
    console.error(`ERROR ${error.message}`)
    process.exitCode = error.code
  } else {
    console.error(`ERROR ${error && error.message ? error.message : error}`)
    process.exitCode = EXIT.args
  }
}
