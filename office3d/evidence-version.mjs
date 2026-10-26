// T15：审核绑定版本 —— 在验收的那一刻，把【验收证据】里的对象版本与当前实际版本做只读核对。
// 只认机器可读写法：证据块首行 `【验收证据】对象版本：` 之后，分号分隔条目；旧写法、缺版本一律「无法核对」，不报错。
//   本机写法：git:<仓库绝对路径>@<提交号> / sha256:<文件绝对路径>=<64 位十六进制>
//   跨机写法（不依赖任何一台机器的路径）：git:<owner/name>@<提交号> / sha256:<owner/name>:<仓库内相对路径>=<64 位十六进制>
//     owner/name 是仓库标识（GitHub 仓库名，大小写不敏感）；每台机器在 evidence-version.json 的 repos 表里
//     把标识对应到本机目录：{ "repos": { "leishen8806/VirtualAiOffice": "E:/VirtualAIOffice/some-checkout" } }。
//     相对路径不得含 .. 、不得是绝对路径，登记目录本身仍必须落在 roots 内。
//     本机仓库里没有该提交时（别的机器刚推送）判「无法核对（先 fetch）」，不判成「已变」。
// git 条目：当前版本 = 该仓库当前检出分支的 HEAD（git rev-parse HEAD），只读、不经过 shell、5 秒超时。
// sha256 条目：对每个文件重新算哈希比较；单文件上限 50 MB。
// 安全边界（硬规则）：路径必须落在白名单 roots 内（规范化后，防 .. / 符号链接 / 盘符大小写）；
//   受保护文件（lan.json / wall.json / telegram* / *.dpapi / .env* / *ed25519* / *.pem / *.key / config.json）
//   一律不读不求哈希，命中即「无法核对（受保护文件）」，也不把这些路径写进日志。
// 不输出任何文件内容；git diff 只取文件名；所有输出走 redactText 脱敏。
// 默认关闭：evidence-version.json 的 enabled:false 为总开关，缺省 / 损坏按关闭处理。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

export const DEFAULT_CFG = Object.freeze({
  enabled: false,
  roots: ['E:/VirtualAIOffice', 'E:/Dr.life+', 'E:/KhmerX', 'E:/pc-worktrees', 'E:/VirtualAIOffice/pc-worktrees'],
  repos: {}, // 仓库标识（owner/name）→ 本机目录；跨机证据用
  maxEntries: 10,
  maxFileBytes: 50 * 1024 * 1024,
  gitTimeoutMs: 5000,
  diffFileLimit: 20,
})
const PROTECTED = /(^|[\\/])(lan\.json|wall\.json|config\.json|telegram[^\\/]*|\.env[^\\/]*|[^\\/]*\.dpapi|[^\\/]*ed25519[^\\/]*|[^\\/]*\.pem|[^\\/]*\.key)$/i
const EV_LINE = /【验收证据】[：:]*\s*对象版本[：:]*\s*([^\n\r]+)/ // 证据块首行：对象版本：git:…;sha256:…
const GIT_ENTRY = /^git[：:]\s*(.+)[@＠]([0-9a-fA-F]{7,40})$/ // 提交号只许 7–40 位十六进制，含空格 / 分号 / 其它符号一律不认
const SHA_ENTRY = /^sha256[：:]\s*(.+)[=＝]([0-9a-fA-F]{64})$/
const REPO_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/ // owner/name；含盘符、反斜杠、以 / 开头的都是路径，不是标识
const PORTABLE_FILE = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)[：:](?![\\/])(.+)$/ // owner/name:相对路径（冒号后不能直接是 / 或 \）
const asList = (r) => (Array.isArray(r) ? r : r?.issues || r?.comments || [])
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

// ── 纯函数：解析证据块首行 → 机器可读条目（可单测）──
// 返回 { machineReadable, version, entries:[{kind:'git',repo,commit}|{kind:'sha256',file,hash}], reason }
export function parseEvidenceVersion(body) {
  const m = String(body || '').match(EV_LINE)
  if (!m) return { machineReadable: false, version: null, entries: [], reason: '证据块里没有「对象版本」行（旧写法，无法核对）' }
  const version = m[1].trim()
  const entries = []
  for (const raw of version.split(/[;；]/)) {
    const t = raw.trim()
    if (!t) continue
    const g = t.match(GIT_ENTRY)
    if (g) {
      const repo = g[1].trim()
      entries.push(REPO_ID.test(repo) ? { kind: 'git', repo, commit: g[2].toLowerCase(), portable: true } : { kind: 'git', repo, commit: g[2].toLowerCase() })
      continue
    }
    const s = t.match(SHA_ENTRY)
    if (s) {
      const file = s[1].trim(), pf = file.match(PORTABLE_FILE)
      entries.push(pf ? { kind: 'sha256', file, repo: pf[1], rel: pf[2].trim(), hash: s[2].toLowerCase(), portable: true } : { kind: 'sha256', file, hash: s[2].toLowerCase() })
      continue
    }
    entries.push({ kind: 'unk', raw: clip(t, 60) }) // 写法不可解析的条目也记下来，汇总按「无法核对」处理
  }
  if (!entries.length) return { machineReadable: false, version, entries: [], reason: '对象版本一行没有可解析的条目' }
  if (!entries.some((e) => e.kind !== 'unk')) return { machineReadable: false, version, entries, reason: '对象版本写法无法解析（只认 git:路径@提交号 / sha256:路径=64 位哈希）' }
  return { machineReadable: true, version, entries, reason: null }
}

// ── 路径安全：规范化后必须落在 roots 内（防 .. / 符号链接 / 盘符大小写）──
// 已存在：realpath.native（展开符号链接与 Windows 8.3 短名）。
// 不存在：从最近的已存在祖先开始 realpath.native，再把剩下的部分接回去——
//   这样短名目录（C:\Users\RUNNER~1\…）下缺失的文件不会被误判成"在根外"，
//   指向根外的符号链接 / 目录联接下的缺失文件也不会被误判成"在根内"。
function realOrResolve(p) {
  const abs = path.resolve(String(p))
  try { return fs.realpathSync.native(abs) } catch { /* 往上找已存在的祖先 */ }
  const rest = []
  for (let cur = abs; ;) {
    const parent = path.dirname(cur)
    if (parent === cur) return abs // 一路到根都不存在 / 无权访问：退回规范化路径
    rest.unshift(path.basename(cur)); cur = parent
    try { return path.join(fs.realpathSync.native(cur), ...rest) } catch { /* 继续往上 */ }
  }
}
export function insideRoots(p, roots) {
  const rp = realOrResolve(p).toLowerCase()
  return (roots || []).some((r) => {
    const rr = realOrResolve(r).toLowerCase()
    return rp === rr || rp.startsWith(rr + path.sep)
  })
}
export function isProtected(p) { return PROTECTED.test(String(p || '')) }

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: opts.timeout || 5000, windowsHide: true, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      resolve({ err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

// ── 工厂：接线用（server.mjs 里只读 GET /evidence-version）──
export function createEvidenceVersion({ dir, company, get = async () => { throw new Error('no get') }, now = Date.now, redactText = (s) => s, runGit = run }) {
  const FILE = path.join(dir, 'evidence-version.json')
  const readCfg = () => { try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch { return { ...DEFAULT_CFG, corrupt: true } } } // 缺省 / 损坏都按关闭；损坏置 corrupt 供面板提示
  const cache = new Map() // `${issueId}@${updatedAt}@${commentAt}` -> { at, result }；结果缓存 60 秒，git HEAD 因此也最多过期 60 秒

  const git = async (repo, args) => runGit('git', ['-C', repo, '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=NUL', ...args], { timeout: readCfg().gitTimeoutMs })
  const sha256Of = (file, cfg) => {
    const st = fs.statSync(file, { throwIfNoEntry: false })
    if (!st) return { state: '缺失', note: '文件不存在' }
    if (st.size > cfg.maxFileBytes) return { state: '无法核对（文件过大）', note: '文件超过 ' + (cfg.maxFileBytes >= 1048576 ? Math.round(cfg.maxFileBytes / 1024 / 1024) + ' MB' : cfg.maxFileBytes + ' B') + ' 上限' }
    return { digest: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
  }

  // 仓库标识 → 本机目录（大小写不敏感）；没登记返回 null。
  const localRepo = (id, cfg) => {
    const key = Object.keys(cfg.repos || {}).find((k) => k.toLowerCase() === String(id).toLowerCase())
    return key ? String(cfg.repos[key]) : null
  }
  const notRegistered = (id) => ({ state: '无法核对（本机没有登记仓库 ' + id + '）', note: '本机没有登记仓库 ' + id + '，请在 evidence-version.json 的 repos 里加上它的本机目录' })

  async function gitCheck(e, cfg) {
    if (e.portable) {
      const local = localRepo(e.repo, cfg)
      if (!local) return notRegistered(e.repo)
      if (!insideRoots(local, cfg.roots)) return { state: '无法核对（路径不在允许范围）', note: '路径不在允许范围' }
      const has = await git(local, ['cat-file', '-e', e.commit + '^{commit}'])
      if (has.err) return { state: '无法核对（本机仓库没有该提交，先 git fetch）', note: '本机仓库没有提交 ' + e.commit.slice(0, 7) + '，先 git fetch 再核对' }
      return gitCheck({ kind: 'git', repo: local, commit: e.commit }, cfg)
    }
    if (!insideRoots(e.repo, cfg.roots)) return { state: '无法核对（路径不在允许范围）', note: '路径不在允许范围' }
    if (isProtected(e.repo)) return { state: '无法核对（受保护文件）', note: '受保护文件' }
    const head = await git(e.repo, ['rev-parse', 'HEAD'])
    if (head.err) return { state: '无法核对（' + (head.stderr || head.err.message || 'git 命令失败').slice(0, 60) + '）', note: clip(head.stderr || 'git 失败', 120) }
    const cur = head.stdout.trim().toLowerCase()
    if (cur.startsWith(e.commit)) {
      const dirty = await git(e.repo, ['status', '--porcelain'])
      const n = (dirty.stdout || '').split('\n').filter((l) => l.trim()).length
      return { state: '一致', note: n ? `工作区有未提交改动（${n} 项）` : '' }
    }
    // 先判祖先关系：证据提交不在当前历史（非祖先 / 对象不存在）→ 不能算「之后新增 N 个提交」
    const anc = await git(e.repo, ['merge-base', '--is-ancestor', e.commit, 'HEAD'])
    if (anc.code !== 0) return { state: '已变', note: '证据提交已不在当前历史中' }
    const cnt = await git(e.repo, ['rev-list', '--count', `${e.commit}..HEAD`])
    if (cnt.err) return { state: '无法核对（git 命令失败）', note: clip(cnt.stderr || 'git 失败', 120) }
    const advanced = Number((cnt.stdout || '').trim()) || 0
    const diff = await git(e.repo, ['diff', '--name-only', e.commit, 'HEAD'])
    const limit = cfg.diffFileLimit || 20
    const files = (diff.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, limit)
    return { state: '已变', note: `之后新增 ${advanced} 个提交、改了 ${files.length} 个文件${files.length ? '：' + redactText(files.join('、')) : ''}` }
  }

  async function shaCheck(e, cfg) {
    if (e.portable) {
      const local = localRepo(e.repo, cfg)
      if (!local) return notRegistered(e.repo)
      const rel = String(e.rel || ''), segments = rel.split(/[\\/]+/)
      if (!rel || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || segments.includes('..')) return { state: '无法核对（路径不在允许范围）', note: '相对路径不合法' }
      const file = path.resolve(local, ...segments)
      if (!insideRoots(local, cfg.roots) || !insideRoots(file, [local])) return { state: '无法核对（路径不在允许范围）', note: '路径不在允许范围' }
      return shaCheck({ kind: 'sha256', file, hash: e.hash }, cfg)
    }
    if (!insideRoots(e.file, cfg.roots)) return { state: '无法核对（路径不在允许范围）', note: '路径不在允许范围' }
    if (isProtected(e.file)) return { state: '无法核对（受保护文件）', note: '受保护文件' } // 不写路径进日志
    try {
      const got = sha256Of(e.file, cfg)
      if (got.digest) return got.digest === e.hash ? { state: '一致', note: '' } : { state: '已变', note: '文件哈希与证据不同' }
      return { state: got.state, note: got.note }
    } catch (err) {
      return { state: '无法核对（读取失败）', note: clip(String(err && err.message || err), 80) }
    }
  }

  function summarize(results) {
    if (!results.length) return { result: '无法核对（没有可核对的条目）', note: '' }
    if (results.every((r) => r.state === '一致')) {
      // 全部一致也带上条目备注（如「工作区有未提交改动（N 项）」）
      const notes = results.map((r) => r.note).filter(Boolean)
      return { result: '版本一致', note: notes.join('；') }
    }
    if (results.some((r) => r.state === '已变' || r.state === '缺失')) {
      const bad = results.filter((r) => r.state === '已变' || r.state === '缺失')
      return { result: '版本已变', note: bad.map((r) => r.note).filter(Boolean).join('；') || bad.map((r) => r.state).join('；') }
    }
    const notes = results.map((r) => r.note).filter(Boolean)
    return { result: '无法核对（' + (notes.slice(0, 2).join('；') || '原因未知') + '）', note: notes.slice(0, 2).join('；') }
  }

  async function check(issue) {
    const cfg = readCfg()
    const cs = asList(await get(`/api/issues/${issue.id}/comments`))
    const ev = cs.filter((c) => (c.authorAgentId || c.authorUserId) && /【验收证据】/.test(String(c.body || '')))
    const last = ev[ev.length - 1] // 最近一条含【验收证据】的 agent 评论
    const key = `${issue.id}@${issue.updatedAt || ''}@${last ? (last.id || last.createdAt) : 'none'}`
    if (last) {
      const hit = cache.get(key)
      if (hit && now() - hit.at < 60000) return hit.result // 结果缓存 60 秒；git HEAD 每次核对现取（不缓存超过 60 秒）
    }
    const base = { issueId: issue.id, ident: issue.identifier || issue.id, title: clip(issue.title, 120), status: issue.status, evAt: last ? last.createdAt : null }
    if (!last) { const r = { ...base, version: null, result: '证据缺版本（无法核对）', note: '没有找到带【验收证据】的评论' }; cache.set(key, { at: now(), result: r }); return r }
    const parsed = parseEvidenceVersion(last.body)
    if (!parsed.machineReadable) { const r = { ...base, version: clip(parsed.version || '', 200), result: '证据缺版本（无法核对）', note: parsed.reason }; cache.set(key, { at: now(), result: r }); return r }
    const results = []
    for (const e of parsed.entries.slice(0, cfg.maxEntries)) {
      const r = e.kind === 'git' ? await gitCheck(e, cfg) : e.kind === 'sha256' ? await shaCheck(e, cfg) : { state: '无法核对', note: '条目写法不可解析' }
      // 受保护文件的路径不得进入输出（label 不暴露路径；note 是固定文案「受保护文件」，保留给汇总）
      const hidden = r.state.includes('受保护')
      const label = hidden ? '受保护文件' : e.kind === 'git' ? `git:${redactText(e.repo)}@${e.commit.slice(0, 7)}` : e.portable ? `sha256:${redactText(e.repo)}:${redactText(e.rel)}` : `sha256:${redactText(e.file)}`
      results.push({ ...r, label })
    }
    const { result, note } = summarize(results)
    const r = { ...base, version: clip(parsed.version, 300), result, note: redactText(note), items: results.map((x) => ({ state: x.state, label: redactText(x.label), note: x.note ? redactText(x.note) : '' })) }
    cache.set(key, { at: now(), result: r })
    return r
  }

  return {
    parse: parseEvidenceVersion,
    checkByIdent: async (ident) => {
      const cfg = readCfg()
      if (!cfg.enabled) return { disabled: true }
      const raw = await get(`/api/companies/${company}/issues`)
      const all = asList(raw)
      const i = all.find((x) => x.identifier === ident || x.id === ident)
      if (!i) return null
      return check(i)
    },
    batch: async (max = 20) => {
      const cfg = readCfg()
      if (!cfg.enabled) return { disabled: true }
      const raw = await get(`/api/companies/${company}/issues?status=in_review`)
      const list = asList(raw).slice(0, max)
      const items = []
      for (const i of list) {
        try { items.push(await check(i)) } catch (e) { items.push({ issueId: i.id, ident: i.identifier, title: clip(i.title, 120), status: i.status, result: '无法核对（读取失败）', note: String((e && e.message) || e).slice(0, 120) }) }
      }
      return { items }
    },
    view() {
      const cfg = readCfg()
      const recent = [...cache.values()].slice(-20).map((x) => x.result)
      return { enabled: Boolean(cfg.enabled), corrupt: Boolean(cfg.corrupt), recent }
    },
  }
}