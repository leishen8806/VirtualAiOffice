import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  sha256File, parseChecksums, verifyChecksumFile, checkCardStatus, checkRequirementHash, checkCardChecksums,
  checkPushed, checkEvidence, checkTestFlags, checkNotRun, checkReceiptFields,
} from '../check.mjs'

// 每个测试自建一个卡片目录，结束后只删除自己建的这一个目录。
function makeCard(t, { status = 'ACTIVE' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-check-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, '卡片.md'), `# 卡\n\n\`\`\`text\n卡号：X-1\n状态：${status}\n\`\`\`\n`)
  fs.writeFileSync(path.join(dir, '参考.json'), '{"a":1}\n')
  writeSums(dir)
  return dir
}
function writeSums(dir, { crlf = false } = {}) {
  const files = fs.readdirSync(dir).filter((f) => f !== 'SHA256SUMS.txt' && fs.statSync(path.join(dir, f)).isFile()).sort()
  const lines = files.map((f) => `${sha256File(path.join(dir, f))} *${f}`)
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), lines.join(crlf ? '\r\n' : '\n') + (crlf ? '\r\n' : '\n'))
}
const goodReceipt = (dir, extra = '') => `卡号 / 修订：X-1 / R1\n代码：feat/x @ ${'a'.repeat(40)}\n需求哈希：${sha256File(path.join(dir, 'SHA256SUMS.txt'))}\n执行方：Codex\n验收逐条：A1 通过\n测试：node --max-old-space-size=1024 --test --test-concurrency=1 tests/*.test.mjs\n范围自查：是\n${extra}`

test('parseChecksums 兼容 CRLF、* 标记、空行与注释', () => {
  const h = 'b'.repeat(64)
  assert.deepEqual(parseChecksums(`# 注释\r\n${h} *a.md\r\n\r\n${h}  证据/b.png\n`), [{ hash: h, name: 'a.md' }, { hash: h, name: '证据/b.png' }])
})

test('C1：ACTIVE 通过；PAUSED、WITHDRAWN 失败；没有状态行给警告', (t) => {
  assert.equal(checkCardStatus(makeCard(t)).status, 'PASS')
  assert.equal(checkCardStatus(makeCard(t, { status: 'PAUSED（17:00）' })).status, 'FAIL')
  assert.equal(checkCardStatus(makeCard(t, { status: 'WITHDRAWN' })).status, 'FAIL')
  const dir = makeCard(t); fs.writeFileSync(path.join(dir, '卡片.md'), '# 卡\n没有状态\n')
  assert.equal(checkCardStatus(dir).status, 'WARN')
})

test('C2：写 SHA256SUMS.txt 本身的哈希才通过；写成卡文件哈希给出明确提示', (t) => {
  const dir = makeCard(t)
  assert.equal(checkRequirementHash(dir, goodReceipt(dir)).status, 'PASS')
  const wrong = checkRequirementHash(dir, `需求哈希：${sha256File(path.join(dir, '卡片.md'))}`)
  assert.equal(wrong.status, 'FAIL')
  assert.match(wrong.detail, /只写了卡文件 卡片\.md/)
  assert.equal(checkRequirementHash(dir, '需求哈希：无').status, 'FAIL')
})

test('C3：CRLF 校验单可通过；文件被改或缺失时失败', (t) => {
  const dir = makeCard(t); writeSums(dir, { crlf: true })
  assert.equal(checkCardChecksums(dir).status, 'PASS')
  fs.appendFileSync(path.join(dir, '参考.json'), ' ')
  assert.equal(checkCardChecksums(dir).status, 'FAIL')
  fs.rmSync(path.join(dir, '参考.json'))
  assert.match(checkCardChecksums(dir).detail, /缺文件 参考\.json/)
})

test('C4：没有仓库参数记为 NOT_RUN；回执 SHA 与远端一致才通过', (t) => {
  assert.equal(checkPushed('代码：x').status, 'NOT_RUN')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-check-git-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const remote = path.join(root, 'remote.git'), work = path.join(root, 'work')
  execFileSync('git', ['init', '-q', '--bare', remote]); execFileSync('git', ['init', '-q', work])
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x')
  git(work, 'remote', 'add', 'origin', remote); git(work, 'push', '-q', 'origin', 'HEAD:refs/heads/feat/x')
  const head = git(work, 'rev-parse', 'HEAD')
  assert.equal(checkPushed(`代码：feat/x @ ${head}`, { repo: work, branch: 'feat/x' }).status, 'PASS')
  assert.equal(checkPushed(`代码：feat/x @ ${'c'.repeat(40)}`, { repo: work, branch: 'feat/x' }).status, 'FAIL')
  assert.equal(checkPushed(`代码：${head}`, { repo: work, branch: 'feat/none' }).status, 'FAIL')
})

test('C5：证据校验单路径相对证据目录或相对卡片目录都能核对', (t) => {
  const dir = makeCard(t), ev = path.join(dir, 'R1-证据')
  fs.mkdirSync(ev); fs.writeFileSync(path.join(ev, 'a.png'), 'png')
  fs.writeFileSync(path.join(dir, '批准版.json'), '{}')
  fs.writeFileSync(path.join(ev, 'SHA256SUMS-R1.txt'), `${sha256File(path.join(ev, 'a.png'))} *a.png\r\n${sha256File(path.join(dir, '批准版.json'))} *批准版.json\r\n`)
  assert.equal(checkEvidence(dir).status, 'PASS')
  fs.writeFileSync(path.join(ev, 'a.png'), 'changed')
  assert.equal(checkEvidence(dir).status, 'FAIL')
})

test('C5：没有证据子目录时给警告', (t) => {
  assert.equal(checkEvidence(makeCard(t)).status, 'WARN')
})

test('C5：--evidence 指定卡片目录以外的证据目录；目录不存在或没有校验单时失败', (t) => {
  const dir = makeCard(t), ev = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-check-ev-'))
  t.after(() => fs.rmSync(ev, { recursive: true, force: true }))
  fs.writeFileSync(path.join(ev, 'b.png'), 'png')
  assert.equal(checkEvidence(dir, [ev]).status, 'FAIL')
  fs.writeFileSync(path.join(ev, 'SHA256SUMS.txt'), `${sha256File(path.join(ev, 'b.png'))} *b.png\n`)
  assert.equal(checkEvidence(dir, [ev]).status, 'PASS')
  assert.equal(checkEvidence(dir, [path.join(ev, '不存在')]).status, 'FAIL')
})

test('C5：支持 evidence-manifest.json（{ files: [{ file, sha256 }] }）', (t) => {
  const dir = makeCard(t), ev = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-check-mf-'))
  t.after(() => fs.rmSync(ev, { recursive: true, force: true }))
  fs.mkdirSync(path.join(ev, 'after')); fs.writeFileSync(path.join(ev, 'after', 'c.png'), 'png')
  fs.writeFileSync(path.join(ev, 'evidence-manifest.json'), JSON.stringify({ sourceSha: 'x', files: [{ file: 'after/c.png', bytes: 3, sha256: sha256File(path.join(ev, 'after', 'c.png')) }] }))
  assert.equal(checkEvidence(dir, [ev]).status, 'PASS')
  fs.writeFileSync(path.join(ev, 'after', 'c.png'), 'changed')
  assert.equal(checkEvidence(dir, [ev]).status, 'FAIL')
})

test('C2：交付后卡片目录加了修订时，提示可能是正常现象', (t) => {
  const dir = makeCard(t), old = sha256File(path.join(dir, 'SHA256SUMS.txt'))
  fs.writeFileSync(path.join(dir, '修订R2.md'), '状态：ACTIVE\n'); writeSums(dir)
  const r = checkRequirementHash(dir, `需求哈希：${old}`)
  assert.equal(r.status, 'FAIL')
  assert.match(r.detail, /又加了修订/)
})

test('C6：1024 MB 串行通过；2048 MB 或缺串行参数失败', () => {
  assert.equal(checkTestFlags('node --max-old-space-size=1024 --test --test-concurrency=1 x').status, 'PASS')
  assert.equal(checkTestFlags('node --max-old-space-size=2048 --test --test-concurrency=1 x').status, 'FAIL')
  assert.equal(checkTestFlags('node --max-old-space-size=1024 --test x').status, 'FAIL')
  assert.equal(checkTestFlags('测试：NOT_RUN（只交方案）').status, 'WARN')
})

test('C7：提到未运行却没写 NOT_RUN 时失败', () => {
  assert.equal(checkNotRun('全部通过').status, 'PASS')
  assert.equal(checkNotRun('浏览器测试未运行').status, 'FAIL')
  assert.equal(checkNotRun('浏览器测试未运行，记为 NOT_RUN').status, 'PASS')
})

test('C8：回执缺必填项时列出缺什么', (t) => {
  const dir = makeCard(t)
  assert.equal(checkReceiptFields(goodReceipt(dir)).status, 'PASS')
  const r = checkReceiptFields('卡号：X\n测试：略')
  assert.equal(r.status, 'FAIL')
  assert.match(r.detail, /代码/)
  assert.doesNotMatch(checkReceiptFields(goodReceipt(dir).replace('测试：', '执行：')).detail, /测试/, '写了 --test 命令也算有测试')
})

test('verifyChecksumFile 区分哈希不符与缺文件', (t) => {
  const dir = makeCard(t)
  fs.writeFileSync(path.join(dir, 'S.txt'), `${'0'.repeat(64)} *卡片.md\n${'0'.repeat(64)} *不存在.md\n`)
  const v = verifyChecksumFile(path.join(dir, 'S.txt'), dir)
  assert.deepEqual([v.total, v.bad, v.missing], [2, ['卡片.md'], ['不存在.md']])
})
