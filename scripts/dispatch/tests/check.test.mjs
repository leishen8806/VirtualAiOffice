import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  sha256File, parseChecksums, verifyChecksumFile, checkCardStatus, checkRequirementHash, checkCardChecksums,
  checkPushed, checkEvidence, checkTestFlags, checkNotRun, checkReceiptFields, isCheckerOutputLine,
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
  assert.deepEqual(parseChecksums(`# 注释\r\n${h} *a.md\r\n\r\n${h}  证据/b.png\n`), { entries: [{ hash: h, name: 'a.md' }, { hash: h, name: '证据/b.png' }], malformed: [] })
})

// ---- PR #50 审查（Codex）复现的 5 类误放行 ----

test('审查 P1-1：损坏或空的校验单不能 PASS（卡片与证据都一样）', (t) => {
  const dir = makeCard(t)
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), 'garbage line\nnot a checksum\n')
  const c3 = checkCardChecksums(dir)
  assert.equal(c3.status, 'FAIL'); assert.match(c3.detail, /没有任何有效条目|格式错误/)
  const ev = path.join(dir, 'R1-证据'); fs.mkdirSync(ev)
  fs.writeFileSync(path.join(ev, 'SHA256SUMS.txt'), '')
  assert.equal(checkEvidence(dir).status, 'FAIL')
  fs.writeFileSync(path.join(ev, 'SHA256SUMS.txt'), `${sha256File(path.join(dir, '参考.json'))} *参考.json\n这一行坏了\n`)
  assert.equal(checkEvidence(dir).status, 'FAIL', '一行有效 + 一行损坏也不能通过')
  fs.rmSync(path.join(ev, 'SHA256SUMS.txt')); fs.writeFileSync(path.join(ev, 'evidence-manifest.json'), '{ 不是 json')
  assert.equal(checkEvidence(dir).status, 'FAIL', '无法解析的 evidence-manifest.json 也要 FAIL，而不是让程序崩溃')
})

test('审查 P1-2：C4 只认"代码："字段的提交，基线 SHA 不能冒充候选', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-check-git2-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const remote = path.join(root, 'remote.git'), work = path.join(root, 'work')
  execFileSync('git', ['init', '-q', '--bare', remote]); execFileSync('git', ['init', '-q', work])
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'base')
  git(work, 'remote', 'add', 'origin', remote); git(work, 'push', '-q', 'origin', 'HEAD:refs/heads/feat/x')
  const base = git(work, 'rev-parse', 'HEAD')
  git(work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'candidate, not pushed')
  const candidate = git(work, 'rev-parse', 'HEAD')
  const receipt = `代码：feat/x @ ${candidate}\n基线：${base}\n`
  const r = checkPushed(receipt, { repo: work, branch: 'feat/x' })
  assert.equal(r.status, 'FAIL', '远端仍是基线，候选没推送，不能因为回执里出现了基线 SHA 就通过')
  assert.equal(checkPushed(`代码：feat/x @ ${candidate} / ${base}\n`, { repo: work, branch: 'feat/x' }).status, 'FAIL', '"代码："写两个提交要判失败')
  assert.equal(checkPushed(`基线：${base}\n`, { repo: work, branch: 'feat/x' }).status, 'FAIL', '没有"代码："字段要判失败')
})

test('审查 P2-3：C2 只认"需求哈希"字段，附件里出现正确哈希不能掩盖错误声明', (t) => {
  const dir = makeCard(t), right = sha256File(path.join(dir, 'SHA256SUMS.txt'))
  const receipt = `需求哈希：${'d'.repeat(64)}\n\n证据清单：\n- SHA256SUMS.txt — ${right}\n`
  assert.equal(checkRequirementHash(dir, receipt).status, 'FAIL')
  assert.equal(checkRequirementHash(dir, `证据：${right}\n`).status, 'FAIL', '没有需求哈希字段要判失败')
  assert.equal(checkRequirementHash(dir, `需求哈希：\`${right}\`（SHA256SUMS.txt 本身）。卡文件 SHA-256：\`${'e'.repeat(64)}\`\n`).status, 'PASS', '同一行先写需求哈希、后写卡文件哈希，取关键词后的第一个')
})

test('审查 P2-4：C6 逐条检查测试命令，一条合规不能掩盖另一条无上限的全量测试', () => {
  const receipt = '定向：node --max-old-space-size=1024 --test --test-concurrency=1 tests/a.test.mjs\n全量：node --test tests/*.test.mjs\n'
  const r = checkTestFlags(receipt)
  assert.equal(r.status, 'FAIL'); assert.match(r.detail, /1 条/)
  assert.equal(checkTestFlags('`node --max-old-space-size=1024 --test \\\n  --test-concurrency=1 tests/*.test.mjs`').status, 'PASS', '续行拼接后再判断')
  assert.equal(checkTestFlags('测试：略，全部通过').status, 'FAIL', '没有命令也没有 NOT_RUN 要判失败')
})

// ---- PR #50 第二轮审查（Codex @ b07e609）新增的 3 个边界输入 ----

test('复审 C6-a：同一行用 ; 连写的第二条测试命令缺少资源上限要判失败', () => {
  const r = checkTestFlags('node --max-old-space-size=1024 --test --test-concurrency=1 tests/a.test.mjs; node --test tests/*.test.mjs')
  assert.equal(r.status, 'FAIL')
  assert.equal(checkTestFlags('node --max-old-space-size=1024 --test --test-concurrency=1 a.mjs && node --max-old-space-size=1024 --test --test-concurrency=1 b.mjs').status, 'PASS')
})

test('复审 C6-b：同一参数出现冲突取值（并发 1 与 8）要判失败', () => {
  assert.equal(checkTestFlags('node --max-old-space-size=1024 --test --test-concurrency=1 --test-concurrency=8 tests/*.test.mjs').status, 'FAIL')
  assert.equal(checkTestFlags('node --max-old-space-size=1024 --max-old-space-size=4096 --test --test-concurrency=1 x').status, 'FAIL')
})

test('复审 C7：同一行"通过"与"未运行 / NOT_RUN"并存判失败；"未通过 / 不计为通过"不误判', () => {
  assert.equal(checkNotRun('A1 浏览器验收：通过（未运行，NOT_RUN）').status, 'FAIL')
  assert.equal(checkNotRun('A2：PASS（NOT_RUN）').status, 'FAIL')
  assert.equal(checkNotRun('跳过项（NOT_RUN），不计为通过').status, 'PASS')
  assert.equal(checkNotRun('A3：未通过；端到端未运行，NOT_RUN').status, 'PASS')
  assert.equal(checkNotRun('A4 浏览器：NOT_RUN（缺少 Playwright）').status, 'PASS')
})

// ---- PR #50 第三轮审查（Codex @ f8c7fdd / a42ec51） ----

test('三审 C7：验收编号 "A1 通过" 不是计数，与 NOT_RUN 同句判失败；"不仅通过" 不是否定', () => {
  assert.equal(checkNotRun('A1 通过（未运行，NOT_RUN）').status, 'FAIL')
  assert.equal(checkNotRun('B10 通过（NOT_RUN）').status, 'FAIL')
  assert.equal(checkNotRun('A2 不仅通过，还有 NOT_RUN 项').status, 'FAIL')
  assert.equal(checkNotRun('全量 1443 项、1439 通过；4 项 NOT_RUN').status, 'PASS', '真正的计数仍不算宣称')
})

test('四审 C7：只有 "C7 NOT_RUN标识" 这个检查项名被豁免；状态描述里的 "NOT_RUN 标记 / 标识" 仍参与矛盾判断', () => {
  assert.equal(checkNotRun('A1 浏览器验收：PASS（执行状态以 NOT_RUN 标记，缺少浏览器）').status, 'FAIL')
  assert.equal(checkNotRun('| A1 浏览器 | PASS | 执行状态使用 NOT_RUN 标识，原因：缺少 Playwright |').status, 'FAIL')
  assert.equal(checkNotRun('A1：未运行，NOT_RUN，不久前通过').status, 'FAIL')
  assert.equal(checkNotRun('A1：未运行，NOT_RUN，不影响通过').status, 'FAIL')
  assert.equal(checkNotRun('| C7 NOT_RUN标识 | PASS；4个既有跳过已另外明确列为NOT_RUN |').status, 'PASS', 'DR-B4 R2 回执原句仍不误判')
})

test('五审 C7：名称豁免只认整个单元格就是检查项名，不跨列、不进正文', () => {
  assert.equal(checkNotRun('| C7 | NOT_RUN 标记（缺少浏览器） | PASS |').status, 'FAIL')
  assert.equal(checkNotRun('| A1 浏览器 | PASS | 关联检查 C7 | NOT_RUN 标识（缺少 Playwright） |').status, 'FAIL')
  assert.equal(checkNotRun('A1 浏览器 PASS，关联检查 C7 NOT_RUN 标识（缺少 Playwright）').status, 'FAIL', '正文里不再豁免')
  assert.equal(checkNotRun('| **C7 NOT_RUN标识** | PASS |').status, 'PASS', '加粗的检查项名单元格仍豁免')
})

test('三审 C6：参数与取值之间多个空格也要识别', () => {
  assert.equal(checkTestFlags('node --max-old-space-size=1024 --test --test-concurrency=1 --test-concurrency  8 tests/*.test.mjs').status, 'FAIL')
  assert.equal(checkTestFlags('node --max-old-space-size  1024 --test --test-concurrency  1 tests/*.test.mjs').status, 'PASS')
})

test('复审 C7 不误判：通过计数、以及同一行另一小句里的 NOT_RUN（取自真实回执）', () => {
  assert.equal(checkNotRun('相对 R6 已交日志（1476 总项、1473 通过、0 失败、3 跳过），无新增失败；没有重跑 R6 全量。原三个 NOT_RUN：D-V1-R5 几何验收').status, 'PASS')
  assert.equal(checkNotRun('- **A5 通过**：全量测试退出 0、无新增失败；实际计数见下文。跳过项单独列为 NOT_RUN，不算通过。').status, 'PASS')
  assert.equal(checkNotRun('A6 浏览器：已通过（未运行 NOT_RUN）；A7 另行说明').status, 'FAIL', '同一小句里的矛盾仍要拒绝')
  // DR-B4 R2 回执原句：此前被误判为矛盾。
  assert.equal(checkNotRun('- A4 通过：专项9/9；全量1443项、1439通过、0失败、4跳过。4项既有跳过为 NOT_RUN，逐项列在下文，不计入通过。').status, 'PASS')
  assert.equal(checkNotRun('浏览器 NOT_RUN，不代表通过').status, 'PASS')
  // 回执引用本工具检查项名（C7 NOT_RUN标识）时，"NOT_RUN" 是名称不是状态。
  assert.equal(checkNotRun('| C7 NOT_RUN标识 | PASS；4个既有跳过已另外明确列为NOT_RUN |').status, 'PASS')
  assert.equal(checkNotRun('| A5 浏览器 | PASS（NOT_RUN） |').status, 'FAIL', '名称以外的 NOT_RUN 与 PASS 同句仍是矛盾')
})

test('审查 P2-5：C7 逐行判断，别处的 NOT_RUN 不能替"未运行却报通过"的那一行作证', () => {
  const receipt = 'A6 浏览器：未运行，已通过\nA7 端到端：NOT_RUN（缺少 Playwright）\n'
  const r = checkNotRun(receipt)
  assert.equal(r.status, 'FAIL'); assert.match(r.detail, /A6/)
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
  assert.match(wrong.detail, /声明的是卡文件 卡片\.md/)
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

// ───── 自指：回执内嵌本工具自己的输出 ─────
// 取自 OFFICE-L2 R6-01 回执草稿：内嵌的 "PASS    C7 未运行要写明  2 项状态均为 NOT_RUN" 被判成"未运行却写通过"。
const EMBEDDED = [
  'PASS    C1 卡片状态     R2、R3、R4、R5、R6 与 R1 卡片为 ACTIVE',
  'PASS    C2 需求哈希     声明的需求哈希 = SHA256SUMS.txt 本身的哈希 2b957c142db6…',
  'PASS    C3 卡片校验单    9 项全部一致',
  'NOT_RUN C4 推送一致     没有给 --repo 和 --branch，未核对远端',
  'WARN    C5 证据校验单    没有找到证据校验单；证据不在卡片目录里时用 --evidence 指定',
  'PASS    C6 测试参数     2 条测试命令都带 --max-old-space-size=1024 与 --test-concurrency=1',
  'PASS    C7 未运行要写明   2 项状态均为 NOT_RUN',
  'PASS    C7 未运行要写明   回执没有提到未运行的项',
  'PASS    C7 未运行要写明   6 行未运行项都写了 NOT_RUN，且没有同时宣称通过',
  'FAIL    C7 未运行要写明   1 行同时写了未运行和"通过"，状态矛盾，如：A5 通过（NOT_RUN）',
  'PASS    C8 回执必填项    必填项齐全',
].join('\n')

test('自指：内嵌的本工具输出行（含 C7 自己那一行）不参与 C7 判断', () => {
  assert.equal(checkNotRun(EMBEDDED).status, 'PASS')
  assert.equal(checkNotRun('## 检查器输出\n\n```text\n' + EMBEDDED + '\n```\n\nA5 性能：NOT_RUN（本机没有 Playwright）').status, 'PASS', '内嵌输出之外的 NOT_RUN 行仍然正常判断')
  for (const line of EMBEDDED.split('\n')) assert.equal(isCheckerOutputLine(line), true, line)
})

test('自指：不是严格输出格式的行仍逐行判断，不能借此洗白', () => {
  // 编号与名称对不上、没有状态词、不是检查项名称：全部照常判断
  assert.equal(checkNotRun('PASS    C7 浏览器 通过 NOT_RUN').status, 'FAIL')
  assert.equal(checkNotRun('PASS    C3 未运行要写明   A5 通过（NOT_RUN）').status, 'FAIL', 'C3 对应的名称不是"未运行要写明"')
  assert.equal(checkNotRun('PASS    A5 性能   未运行').status, 'FAIL')
  assert.equal(checkNotRun('PASS A5 性能 通过（NOT_RUN）').status, 'FAIL')
  assert.equal(checkNotRun('A5 PASS    C7 未运行要写明  NOT_RUN').status, 'FAIL', '行首不是状态词')
  assert.equal(checkNotRun('结论：PASS    C7 未运行要写明   2 项均为 NOT_RUN').status, 'FAIL', '正文前缀里夹带')
  assert.equal(checkNotRun('| A5 浏览器 | PASS（NOT_RUN） |').status, 'FAIL')
  for (const line of ['PASS    C7 浏览器 通过 NOT_RUN', 'PASS    A5 性能   未运行', 'C7 未运行要写明 NOT_RUN']) assert.equal(isCheckerOutputLine(line), false, line)
})

test('自指：回执 + 本工具对它自己的输出，再次运行结论不变（往返）', (t) => {
  const dir = makeCard(t)
  const base = goodReceipt(dir)
  const first = checkNotRun(base)
  const out = ['PASS    C7 未运行要写明   ' + first.detail, 'NOT_RUN C4 推送一致     没有给 --repo 和 --branch，未核对远端'].join('\n')
  assert.equal(checkNotRun(base + '\n\n```text\n' + out + '\n```\n').status, first.status)
})
