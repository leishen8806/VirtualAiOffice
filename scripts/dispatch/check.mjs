// 派单与交付自动检查（PROCESS-1 "能力蒸馏" D1，2026-10-26）。
// 把复核时反复手工核对的几项写成一条命令。执行方交付前跑一遍，Q-V1 复核时再跑一遍。
//
// 用法：
//   node scripts/dispatch/check.mjs --card <卡片目录> --receipt <交付回执.md> [--repo <git 仓库目录>] [--branch <分支名>] [--remote origin]
//                                   [--evidence <证据目录>]... [--json]
//   证据放在卡片目录以外时（例如 review-artifacts 下），用 --evidence 指定，可以重复多次。
//
// 检查项（每项结果为 PASS / FAIL / WARN / NOT_RUN；有 FAIL 时退出码为 1）：
//   C1 卡片状态       卡片目录里的版本头没有 PAUSED / WITHDRAWN
//   C2 需求哈希       回执写的是 SHA256SUMS.txt 本身的 SHA-256（不是某张卡文件的哈希）
//   C3 卡片校验单     SHA256SUMS.txt 列出的每个文件都存在且哈希一致
//   C4 推送一致       回执里的提交 SHA 等于远端分支当前 SHA（需要 --repo 和 --branch）
//   C5 证据校验单     卡片目录的证据子目录、以及 --evidence 指定目录里的 SHA256SUMS*.txt / evidence-manifest.json 全部能对上
//   C6 测试参数       回执里的测试命令带 --max-old-space-size=1024 和 --test-concurrency=1
//   C7 未运行要写明   回执提到"未运行 / 没跑 / 未执行"时，必须同时写 NOT_RUN
//   C8 回执必填项     卡号、代码、需求哈希、执行方、验收、测试、范围自查
//
// 校验单兼容 CRLF 行尾、`*` 二进制标记、以及路径相对卡片目录或相对校验单所在目录两种写法。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HEX64 = /\b[0-9a-f]{64}\b/gi
const HEX40 = /\b[0-9a-f]{40}\b/gi

export const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const result = (id, name, status, detail) => ({ id, name, status, detail })
const read = (file) => fs.readFileSync(file, 'utf8')

// 解析 sha256sum 格式的校验单：每行"<64 位哈希> [ *]<文件名>"，忽略空行与 # 注释。
// 其余任何行都记为"格式错误"——损坏的校验单不能因为解析不出条目而被当成"0 项全部一致"。
export function parseChecksums(text) {
  const entries = [], malformed = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/)
    if (m) entries.push({ hash: m[1].toLowerCase(), name: m[2].trim() })
    else malformed.push(line.slice(0, 80))
  }
  return { entries, malformed }
}

// 解析 evidence-manifest.json：{ files: [{ file, sha256, bytes? }] }（Codex 的证据清单格式）。缺字段或哈希不合法的条目记为格式错误。
export function parseManifest(text) {
  let j
  try { j = JSON.parse(text) } catch (e) { return { entries: [], malformed: [`JSON 解析失败：${e.message.slice(0, 60)}`] } }
  const list = Array.isArray(j) ? j : j?.files
  if (!Array.isArray(list)) return { entries: [], malformed: ['没有 files 数组'] }
  const entries = [], malformed = []
  for (const e of list) {
    if (e && typeof e.file === 'string' && e.file && /^[0-9a-f]{64}$/i.test(e.sha256 || '')) entries.push({ hash: e.sha256.toLowerCase(), name: e.file })
    else malformed.push(JSON.stringify(e).slice(0, 80))
  }
  return { entries, malformed }
}

// 核对一份校验单（sha256sum 文本或 evidence-manifest.json）。文件名先按校验单所在目录解析，找不到再按 fallbackDir（卡片目录）解析。
// ok 仅在：至少 1 项、没有格式错误、没有缺文件、没有哈希不符。
export function verifyChecksumFile(sumFile, fallbackDir) {
  const { entries, malformed } = sumFile.endsWith('.json') ? parseManifest(read(sumFile)) : parseChecksums(read(sumFile))
  const bad = [], missing = []
  for (const e of entries) {
    const candidates = [path.resolve(path.dirname(sumFile), e.name), fallbackDir && path.resolve(fallbackDir, e.name)].filter(Boolean)
    const found = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile())
    if (!found) { missing.push(e.name); continue }
    if (sha256File(found) !== e.hash) bad.push(e.name)
  }
  const ok = entries.length > 0 && !malformed.length && !bad.length && !missing.length
  return { total: entries.length, bad, missing, malformed, ok }
}

const describe = (v) => [!v.total && '没有任何有效条目', v.malformed.length && `格式错误 ${v.malformed.length} 行（如：${v.malformed[0]}）`,
  v.bad.length && `哈希不符 ${v.bad.join('、')}`, v.missing.length && `缺文件 ${v.missing.join('、')}`].filter(Boolean).join('；')

// 回执里"某字段"所在的行：允许前面有 Markdown 的列表、引用、加粗、表格符号。
const fieldLines = (text, re) => text.split(/\r?\n/).filter((line) => re.test(line.replace(/^[\s>*\-|`#]+/, '')))

const cardMarkdown = (cardDir) => fs.readdirSync(cardDir)
  .filter((f) => f.endsWith('.md') && !/^交付/.test(f))
  .map((f) => path.join(cardDir, f))

export function checkCardStatus(cardDir) {
  const stopped = [], active = []
  for (const file of cardMarkdown(cardDir)) {
    for (const m of read(file).matchAll(/^\s*状态[：:]\s*([A-Z_]+)/gm)) (/(PAUSED|WITHDRAWN)/.test(m[1]) ? stopped : active).push(`${path.basename(file)}：${m[1]}`)
  }
  if (stopped.length) return result('C1', '卡片状态', 'FAIL', `卡片已暂停或撤回：${stopped.join('；')}`)
  if (!active.length) return result('C1', '卡片状态', 'WARN', '卡片版本头里没有找到"状态："行')
  return result('C1', '卡片状态', 'PASS', active.join('；'))
}

export function checkRequirementHash(cardDir, receiptText) {
  const sums = path.join(cardDir, 'SHA256SUMS.txt')
  if (!fs.existsSync(sums)) return result('C2', '需求哈希', 'FAIL', '卡片目录里没有 SHA256SUMS.txt')
  const expected = sha256File(sums)
  // 只认"需求哈希 / 按哪一版"字段里紧跟关键词的第一个 64 位哈希；回执别处（证据清单、附件）出现的哈希不算声明。
  const declared = [...new Set(fieldLines(receiptText, /^(需求哈希|按哪一版)/).map((line) => {
    const after = line.slice(line.search(/需求哈希|按哪一版/))
    return (after.match(HEX64) || [])[0]?.toLowerCase()
  }).filter(Boolean))]
  if (!declared.length) return result('C2', '需求哈希', 'FAIL', `回执没有"需求哈希："字段，或该字段里没有 64 位哈希（当前应为 ${expected}）`)
  if (declared.length > 1) return result('C2', '需求哈希', 'FAIL', `回执声明了多个不同的需求哈希：${declared.map((h) => h.slice(0, 12)).join('、')}`)
  if (declared[0] === expected) return result('C2', '需求哈希', 'PASS', `声明的需求哈希 = SHA256SUMS.txt 本身的哈希 ${expected.slice(0, 12)}…`)
  const cardHashes = new Map(cardMarkdown(cardDir).map((f) => [sha256File(f), path.basename(f)]))
  const detail = cardHashes.has(declared[0]) ? `声明的是卡文件 ${cardHashes.get(declared[0])} 的哈希，应写 SHA256SUMS.txt 本身的哈希`
    : `声明的 ${declared[0].slice(0, 12)}… 不等于当前 SHA256SUMS.txt 的哈希；如果交付之后卡片目录又加了修订，这是正常的，否则说明没按最新版做`
  return result('C2', '需求哈希', 'FAIL', `${detail}（当前应为 ${expected}）`)
}

export function checkCardChecksums(cardDir) {
  const sums = path.join(cardDir, 'SHA256SUMS.txt')
  if (!fs.existsSync(sums)) return result('C3', '卡片校验单', 'FAIL', '没有 SHA256SUMS.txt')
  const v = verifyChecksumFile(sums, cardDir)
  return v.ok ? result('C3', '卡片校验单', 'PASS', `${v.total} 项全部一致`) : result('C3', '卡片校验单', 'FAIL', describe(v))
}

// 候选提交只从"代码："字段取（排除写着基线的行），不能用回执里随便出现的基线 SHA 冒充。
export function declaredCommits(receiptText) {
  return [...new Set(fieldLines(receiptText, /^代码[^：:\n]{0,6}[：:]/).filter((line) => !/基线|baseline/i.test(line))
    .flatMap((line) => line.match(HEX40) || []).map((s) => s.toLowerCase()))]
}

export function checkPushed(receiptText, { repo, branch, remote = 'origin' } = {}) {
  const shas = declaredCommits(receiptText)
  if (!repo || !branch) return result('C4', '推送一致', 'NOT_RUN', '没有给 --repo 和 --branch，未核对远端')
  if (!shas.length) return result('C4', '推送一致', 'FAIL', '回执的"代码："字段里没有完整 40 位提交 SHA')
  if (shas.length > 1) return result('C4', '推送一致', 'FAIL', `回执的"代码："字段写了多个提交：${shas.map((s) => s.slice(0, 12)).join('、')}；候选提交只能有一个，基线请写在"基线："行`)
  let remoteSha = ''
  try { remoteSha = execFileSync('git', ['-C', repo, 'ls-remote', remote, `refs/heads/${branch}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split(/\s+/)[0].toLowerCase() } catch (e) { return result('C4', '推送一致', 'FAIL', `读取远端失败：${e.message.split('\n')[0]}`) }
  if (!remoteSha) return result('C4', '推送一致', 'FAIL', `远端没有分支 ${branch}`)
  if (shas[0] === remoteSha) return result('C4', '推送一致', 'PASS', `${branch} @ ${remoteSha}`)
  return result('C4', '推送一致', 'FAIL', `远端 ${branch} 为 ${remoteSha}，回执"代码："写的是 ${shas[0]}（未推送，或推送后又有新提交）`)
}

const SUM_FILE = /^(SHA256SUMS.*\.txt|evidence-manifest\.json)$/i
export function checkEvidence(cardDir, extraDirs = []) {
  const sums = []
  for (const entry of fs.readdirSync(cardDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const f of fs.readdirSync(path.join(cardDir, entry.name))) if (SUM_FILE.test(f)) sums.push(path.join(cardDir, entry.name, f))
  }
  for (const dir of extraDirs) {
    if (!fs.existsSync(dir)) return result('C5', '证据校验单', 'FAIL', `证据目录不存在：${dir}`)
    const found = fs.readdirSync(dir).filter((f) => SUM_FILE.test(f)).map((f) => path.join(dir, f))
    if (!found.length) return result('C5', '证据校验单', 'FAIL', `证据目录里没有 SHA256SUMS*.txt 或 evidence-manifest.json：${dir}`)
    sums.push(...found)
  }
  if (!sums.length) return result('C5', '证据校验单', 'WARN', '没有找到证据校验单；证据不在卡片目录里时用 --evidence 指定')
  const problems = [], ok = []
  for (const s of sums) {
    const v = verifyChecksumFile(s, cardDir), label = s.startsWith(cardDir) ? path.relative(cardDir, s) : s
    if (v.ok) ok.push(`${label}（${v.total} 项）`)
    else problems.push(`${label}：${describe(v)}`)
  }
  return problems.length ? result('C5', '证据校验单', 'FAIL', problems.join('；')) : result('C5', '证据校验单', 'PASS', ok.join('；'))
}

// 回执里每一条 `node … --test …` 命令都要单独满足资源上限；续行（行尾 \ 或 ^）先拼成一条。
export function testCommands(receiptText) {
  const joined = receiptText.replace(/[\\^]\r?\n\s*/g, ' ')
  return joined.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\bnode(\.exe)?\b[^\n]*\s--test(?=\s|$|`)/.test(l))
}

export function checkTestFlags(receiptText) {
  const cmds = testCommands(receiptText)
  if (!cmds.length) return /NOT_RUN/.test(receiptText) ? result('C6', '测试参数', 'WARN', '回执没有 node --test 命令，且标了 NOT_RUN')
    : result('C6', '测试参数', 'FAIL', '回执没有写实际运行的 node --test 命令')
  const bad = cmds.filter((c) => !/--max-old-space-size=1024\b/.test(c) || /--max-old-space-size=(?!1024\b)\d+/.test(c) || !/--test-concurrency[= ]1\b/.test(c))
  if (bad.length) return result('C6', '测试参数', 'FAIL', `${bad.length} 条测试命令缺少 1024 MB 上限或串行参数，如：${bad[0].slice(0, 120)}`)
  return result('C6', '测试参数', 'PASS', `${cmds.length} 条测试命令都带 --max-old-space-size=1024 与 --test-concurrency=1`)
}

// 逐行判断：凡是提到"未运行 / 没跑 / 未执行 / 没有运行 / 未测"的那一行，本行必须写 NOT_RUN；
// 别处出现的 NOT_RUN 不能替这一行作证。
export function checkNotRun(receiptText) {
  const lines = receiptText.split(/\r?\n/).filter((l) => /未运行|没跑|未执行|没有运行|未测/.test(l))
  if (!lines.length) return result('C7', '未运行要写明', 'PASS', '回执没有提到未运行的项')
  const bad = lines.filter((l) => !/NOT_RUN/.test(l))
  if (bad.length) return result('C7', '未运行要写明', 'FAIL', `${bad.length} 行提到未运行却没在本行写 NOT_RUN，如：${bad[0].trim().slice(0, 120)}`)
  return result('C7', '未运行要写明', 'PASS', `${lines.length} 行未运行项都写了 NOT_RUN`)
}

const REQUIRED = [['卡号', /卡号/], ['代码', /代码[：:]/], ['需求哈希', /需求哈希|按哪一版/], ['执行方', /执行方/], ['验收', /验收|A1\b/], ['测试', /测试|--test\b/], ['范围自查', /范围自查|范围/]]
export function checkReceiptFields(receiptText) {
  const missing = REQUIRED.filter(([, re]) => !re.test(receiptText)).map(([n]) => n)
  return missing.length ? result('C8', '回执必填项', 'FAIL', `缺少：${missing.join('、')}`) : result('C8', '回执必填项', 'PASS', '必填项齐全')
}

export function runChecks({ card, receipt, repo, branch, remote, evidence = [] }) {
  if (!card || !fs.existsSync(card)) throw new Error(`卡片目录不存在：${card}`)
  if (!receipt || !fs.existsSync(receipt)) throw new Error(`回执不存在：${receipt}`)
  const text = read(receipt)
  return [checkCardStatus(card), checkRequirementHash(card, text), checkCardChecksums(card), checkPushed(text, { repo, branch, remote }),
    checkEvidence(card, evidence), checkTestFlags(text), checkNotRun(text), checkReceiptFields(text)]
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
  const opts = (n) => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]] : []))
  try {
    const results = runChecks({ card: opt('--card'), receipt: opt('--receipt'), repo: opt('--repo'), branch: opt('--branch'), remote: opt('--remote') || 'origin', evidence: opts('--evidence') })
    if (argv.includes('--json')) console.log(JSON.stringify(results, null, 2))
    else for (const r of results) console.log(`${r.status.padEnd(7)} ${r.id} ${r.name.padEnd(8)} ${r.detail}`)
    process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0)
  } catch (e) { console.error('出错：' + e.message); process.exit(2) }
}
