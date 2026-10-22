// 内容审批委员会（董事会 2026-10-17 设立）。固定逻辑由这里的程序完成（不花额度、不会被 agent 误判），投票本身由 5 位同事完成。
//
// 管什么：对外的内容（客服标准问答、要对外使用的知识库文章、三语文案 / 翻译 / 欢迎语、对外通知模板）能不能「用」。
//   通过 = 知识库里这条内容标为已审核（status: verified）；真正发布 / 部署仍走原来的审批，不由委员会决定。
// 成员（5 票）：Lead（整体把关）、PM（说得对不对）、Architect（架构与边界）、Backend2（技术准确性）、Frontend2（展示与可用性）。
//   作者回避：谁起草的内容，谁不投那一项，由后备 Reviewer2 顶上。秘书 KnowledgeKeeper 不投票。
// 规则：每项 5 票里 ≥3 票「通过」且没有「升级」→ 通过；任何一票「升级」→ 转给董事会；否则「要修改」退回作者。缺票按未通过算。
//   红线内容（价格定价、法律条款与隐私政策、赔付退款承诺、资金账务的对外说明、个人信息）：委员会先投票，**董事会最后确认**才生效（附委员会建议）。
// 节奏：工作日（金边时间）11:00 开一批（有待审内容才开），16:00 统计（5 票到齐会提前统计）。
// 提交方式：知识库文章的头部写 `submit: committee`（且 status: draft）；可选 `redline: price|legal|promise|money|pii`、`author: 名字`。
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

export const MEMBERS = [
  // angle / ask：内容审批；standup：晨会（今天做不做）；accept：超时验收（验收过不过）。昵称见 names.json：Lead = Helix，Architect = Arc，Backend2 = B2，Frontend2 = F2
  { name: 'Lead', angle: '整体把关', ask: '与公司目标和对外口径一致吗？有没有夸大、自相矛盾、或承诺了做不到的事？', standup: '整体优先级：和公司目标、当前里程碑对得上吗？今天做它的机会成本是什么？', accept: '交付对得上任务目标和验收标准吗？有没有遗漏的范围、该补的测试或文档？' },
  { name: 'PM', angle: '说得对不对', ask: '与产品的真实功能和范围是否一致？有没有夸大、承诺了做不到的事？', standup: '优先级与价值：今天做它值不值？依赖满足了吗？有没有更该先做的？', accept: '做到了任务要求的吗？交付和验收标准对得上吗？' },
  { name: 'Architect', angle: '架构与边界', ask: '说法是否暴露内部架构、接口、服务器细节？有没有对系统能力的承诺超出了现有设计？', standup: '架构与依赖：它依赖的东西就绪了吗？会不会和别的在途任务冲突或造成返工？', accept: '设计是否合理、稳定、可维护？有没有隐患（并发、边界、回退、对既有模块的影响）？' },
  { name: 'Backend2', angle: '技术准确性', ask: '涉及系统行为、接口、限制、时效的说法与真实实现一致吗？有没有技术上不成立的说法？', standup: '后端可行性：改动范围多大、风险在哪、今天能收尾吗？', accept: '后端实现是否正确？测试、错误处理、幂等和回退是否到位？有没有自述与实际不符？' },
  { name: 'Frontend2', angle: '展示与可用性', ask: '在 Telegram Mini App / 网页里能怎么展示？长度、格式、按钮和链接可行吗？用户看得懂吗？', standup: '前端与体验：用户或同事能感觉到吗？会不会打断正在进行的界面改动？', accept: '界面是否可用、不重叠、窄屏正常？交互和文案有没有明显问题？' },
]
export const BACKUP = 'Reviewer2'
const SECRETARY = 'KnowledgeKeeper'
const PROJECT_NAME = '运营与知识库'
// 「承诺 / 保证」在客服文档的免责声明里到处都是，不算红线字眼；标题命中，或正文出现 5 次以上才自动判红线
const REDLINE_SRC = '价格|定价|收费|费率|佣金|退款|赔付|赔偿|隐私|个人信息|用户协议|条款|法律|合规|身份证|护照|银行卡|price|refund|privacy|legal|compensat'
const redlineHit = (title, body) => new RegExp(REDLINE_SRC, 'i').test(title) || (String(body).match(new RegExp(REDLINE_SRC, 'gi')) || []).length >= 5
const REDLINE_KIND = { price: '价格定价', legal: '法律条款 / 隐私政策', promise: '赔付退款等承诺', money: '资金账务的对外说明', pii: '个人信息' }
const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }

function parseMeta(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const meta = {}
  if (m) for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/); if (k) meta[k[1]] = k[2] }
  return { meta, body: m ? text.slice(m[0].length) : text, hasFront: Boolean(m) }
}
function setMeta(text, key, value) { // 只改头部里的一个字段（没有就插入到头部结尾前），不碰正文
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return text
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = m[1].split(/\r?\n/)
  const i = lines.findIndex((l) => new RegExp(`^${key}:`).test(l))
  if (i >= 0) lines[i] = `${key}: ${value}`
  else lines.push(`${key}: ${value}`)
  return `---${nl}${lines.join(nl)}${nl}---` + text.slice(m[0].length)
}
const phnom = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), dow: p.weekday }
}

export function createCommittee({ dir, kbDir, company, get, send, notify, log = console.log }) {
  const FILE = path.join(dir, 'committee.json')
  const workDays = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, '..', 'workhours', 'workhours.json'), 'utf8')).days || [1, 2, 3, 4, 5, 6] } catch { return [1, 2, 3, 4, 5, 6] } }
  let db = { batches: [] }
  try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch {}
  const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1))
  let busy = false

  const git = (...args) => new Promise((resolve, reject) => execFile('git', ['-C', kbDir, '-c', 'user.name=内容审批委员会', '-c', 'user.email=committee@local', ...args], { windowsHide: true, timeout: 30000 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).slice(0, 200))) : resolve(String(out).trim()))))
  async function commitFile(rel, msg) {
    try { await git('add', '--', rel); await git('commit', '-q', '-m', `${msg}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, '--', rel) } catch (e) { log(`[committee] 提交 ${rel} 失败：${e.message}`) }
  }
  const absOf = (rel) => { const a = path.resolve(kbDir, ...String(rel).split('/')); if (!a.startsWith(path.resolve(kbDir) + path.sep) || !a.endsWith('.md')) throw Object.assign(new Error('路径不对'), { status: 400 }); return a }
  const readItem = (rel) => parseMeta(fs.readFileSync(absOf(rel), 'utf8'))
  const writeMeta = (rel, patch) => { let t = fs.readFileSync(absOf(rel), 'utf8'); for (const [k, v] of Object.entries(patch)) t = setMeta(t, k, v); fs.writeFileSync(absOf(rel), t) }

  // ───── 扫描待审内容 ─────
  function scan() {
    const inBatch = new Set(db.batches.filter((b) => b.state === 'voting').flatMap((b) => b.items.filter((i) => !i.final).map((i) => i.path)))
    const out = []
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === '_templates') continue
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.md')) {
          const rel = path.relative(kbDir, p).split(path.sep).join('/')
          const { meta, body } = parseMeta(fs.readFileSync(p, 'utf8'))
          if (meta.submit !== 'committee' || meta.status !== 'draft' || inBatch.has(rel)) continue
          const declared = meta.redline && meta.redline !== 'no' ? REDLINE_KIND[meta.redline] || meta.redline : ''
          const auto = !declared && redlineHit(meta.title || '', body) ? '自动识别：标题或正文多处涉及价格 / 条款 / 退款 / 隐私 / 个人信息等字眼' : ''
          out.push({ path: rel, title: meta.title || e.name, author: meta.author || meta.owner || SECRETARY, redline: Boolean(declared || auto), redlineWhy: declared || auto })
        }
      }
    }
    try { walk(kbDir) } catch {}
    return out
  }

  // ───── 开票 ─────
  async function open(manual = false) {
    const items = scan()
    if (!items.length) return { opened: false, reason: '没有待审内容（文章头部写 submit: committee 且 status: draft 才会进来）' }
    const agents = (await get(`/api/companies/${company}/agents`)).filter((a) => a.status !== 'terminated')
    const byName = new Map(agents.map((a) => [a.name, a]))
    const projects = await get(`/api/companies/${company}/projects`)
    const proj = (Array.isArray(projects) ? projects : projects.projects || []).find((p) => p.name === PROJECT_NAME)
    if (!proj) throw new Error(`找不到项目「${PROJECT_NAME}」`)
    const { date } = phnom()
    const batchId = `${date}${db.batches.some((b) => b.id.startsWith(date)) ? '-' + (db.batches.filter((b) => b.id.startsWith(date)).length + 1) : ''}`
    // 每一项的投票人：5 位成员；作者本人回避，由后备顶上
    for (const it of items) {
      it.voters = MEMBERS.map((m) => m.name).filter((n) => n !== it.author)
      if (it.voters.length < MEMBERS.length) it.voters.push(BACKUP)
      it.votes = {}
    }
    const voteNames = [...new Set(items.flatMap((i) => i.voters))]
    // 统计时间：当天 16:00（金边时间 = 09:00 UTC）；手动开票若已过 16:00 或离 16:00 不足 3 小时，则给满 3 小时，避免一开票就「到了统计时间」
    const dueAt = new Date(Math.max(Date.parse(`${date}T09:00:00Z`), Date.now() + 3 * 3600 * 1000)).toISOString()
    const deadline = `${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dueAt))}（金边时间）`
    const parent = await send('POST', `/api/companies/${company}/issues`, { title: `内容审批委员会批次 ${batchId}（${items.length} 项）`, description: `委员会批次 ${batchId} 的汇总记录（程序自动维护）。待审：\n${items.map((it, k) => `${k + 1}. ${it.title}（${it.path}）${it.redline ? ' 【红线：' + it.redlineWhy + '，需董事会最后确认】' : ''}`).join('\n')}`.slice(0, 3000), projectId: proj.id, status: 'backlog', priority: 'medium' }) // 汇总记录没有负责人：Paperclip 不允许「进行中」的任务没有负责人，所以放在待排期，结束时标为完成
    const voteIssues = []
    for (const name of voteNames) {
      const a = byName.get(name)
      if (!a) { log(`[committee] 找不到成员 ${name}，这一票按缺票算`); continue }
      const mine = items.map((it, k) => ({ it, k })).filter(({ it }) => it.voters.includes(name))
      const m = MEMBERS.find((x) => x.name === name)
      const angle = m ? `${m.angle}：${m.ask}` : '后备委员：顶替回避的作者，按「说得对不对 / 好不好读 / 有没有泄露 / 钱和承诺」综合把关。'
      const desc = `你是内容审批委员会的委员（${name}）。请对下面每一项内容独立投票，**不要去看其他委员的投票任务**，也不要改任何文件。你的角度——${angle}\n\n【待审内容（用你的文件读取能力读原文：${kbDir.replace(/\\/g, '/')} 下的路径）】\n${mine.map(({ it, k }) => `${k + 1}. ${clip(it.title, 60)} —— ${it.path}${it.redline ? '（红线：' + it.redlineWhy + '）' : ''}`).join('\n')}\n\n【投票规则】每项三选一：APPROVE（通过）/ CHANGES（要修改，写出具体要改什么）/ ESCALATE（升级给董事会：发现安全、隐私、未经批准的承诺、法律或资金风险时用，不要用来逃避判断）。\n【交付格式（程序按这个格式统计，格式不对会按缺票算）】在本任务里发**一条评论**，每项一行，行首严格写：\nVOTE <项目序号>: APPROVE|CHANGES|ESCALATE | 一句话理由\n例如：VOTE 1: CHANGES | 高棉语第二段把「到账」译成了「提现」\n然后把本任务标为已完成。截止：${deadline}，没投的按缺票算。\n【规则】只读；不得 push、不得读取任何密钥；对不确定的事如实写不确定，不要编造依据。`
      const r = await send('POST', `/api/companies/${company}/issues`, { title: `委员会投票 ${batchId}：${name}（${mine.length} 项）`, description: desc.slice(0, 3600), projectId: proj.id, assigneeAgentId: a.id, status: 'todo', priority: 'high', parentId: parent.id })
      voteIssues.push({ name, issueId: r.id, ident: r.identifier, items: mine.map(({ k }) => k) })
      await new Promise((ok) => setTimeout(ok, 15000)) // 错开分派：几位委员同时建 git 工作树会抢 .git/config 锁（setup_failed）
    }
    db.batches.push({ id: batchId, createdAt: new Date().toISOString(), dueAt, manual, parentId: parent.id, parentIdent: parent.identifier, state: 'voting', voteIssues, items: items.map((it, k) => ({ idx: k, ...it })) })
    save()
    log(`[committee] 批次 ${batchId} 已开票：${items.length} 项，${voteIssues.length} 个投票任务`)
    notify && notify(`⚖️ 内容审批委员会开票：批次 ${batchId}，${items.length} 项待审${items.some((i) => i.redline) ? '（含红线内容，最后需要你确认）' : ''}。今天 16:00 统计。`)
    return { opened: true, batch: batchId, items: items.length }
  }

  // ───── 统计 ─────
  function parseVotes(comments) { // 每位委员：取最新一条里的 VOTE 行（每项取最后一次）
    const votes = {}
    for (const c of comments) {
      for (const m of String(c.body || '').matchAll(/^\s*VOTE\s*(\d+)\s*[:：]\s*(APPROVE|CHANGES|ESCALATE)\b\s*[|｜]?\s*(.*)$/gim)) votes[Number(m[1]) - 1] = { v: m[2].toUpperCase(), why: clip(m[3], 200) }
    }
    return votes
  }
  async function collect(batch) {
    let allDone = true
    for (const vi of batch.voteIssues) {
      const iss = await get(`/api/issues/${vi.issueId}`)
      vi.status = iss.status
      if (!['done', 'cancelled'].includes(iss.status)) allDone = false
      const cs = await get(`/api/issues/${vi.issueId}/comments`)
      const votes = parseVotes((Array.isArray(cs) ? cs : cs.comments || []).filter((c) => c.authorAgentId))
      for (const k of vi.items) if (votes[k]) batch.items[k].votes[vi.name] = votes[k]
    }
    return allDone
  }
  const tallyOne = (it) => {
    const vs = it.voters.map((n) => ({ n, ...(it.votes[n] || { v: 'MISSING', why: '没有按格式投票（缺票）' }) }))
    const c = { approve: vs.filter((x) => x.v === 'APPROVE').length, changes: vs.filter((x) => x.v === 'CHANGES').length, escalate: vs.filter((x) => x.v === 'ESCALATE').length, missing: vs.filter((x) => x.v === 'MISSING').length }
    const outcome = c.escalate > 0 ? 'ESCALATE' : c.approve >= 3 ? (it.redline ? 'CONFIRM' : 'PASS') : 'CHANGES'
    return { vs, c, outcome }
  }
  const reasons = (vs, kinds) => vs.filter((x) => kinds.includes(x.v)).map((x) => `${x.n}：${x.why}`).join('；')

  async function finalizeItem(batch, it) {
    const t = tallyOne(it)
    it.tally = t.c; it.outcome = t.outcome
    const line = `${t.c.approve} 通过 / ${t.c.changes} 要修改 / ${t.c.escalate} 升级 / ${t.c.missing} 缺票`
    if (t.outcome === 'PASS') {
      writeMeta(it.path, { status: 'verified', submit: 'done', approved_by: `内容审批委员会 ${batch.id}（${t.c.approve}/5）`, updated: phnom().date })
      await commitFile(it.path, `kb: 委员会通过「${clip(it.title, 40)}」（${t.c.approve}/5，批次 ${batch.id}）`)
      it.final = 'verified'
    } else if (t.outcome === 'CHANGES') {
      writeMeta(it.path, { submit: 'changes' })
      await commitFile(it.path, `kb: 委员会要求修改「${clip(it.title, 40)}」（批次 ${batch.id}）`)
      const agents = await get(`/api/companies/${company}/agents`)
      const sec = agents.find((a) => a.name === SECRETARY), auth = agents.find((a) => a.name === it.author) || sec
      const projects = await get(`/api/companies/${company}/projects`)
      const proj = (Array.isArray(projects) ? projects : projects.projects || []).find((p) => p.name === PROJECT_NAME)
      const r = await send('POST', `/api/companies/${company}/issues`, { title: `按委员会意见修改：${clip(it.title, 50)}`, description: `内容审批委员会批次 ${batch.id} 对「${it.title}」（${it.path}）的结论：要修改（${line}）。\n\n委员意见：${reasons(t.vs, ['CHANGES', 'ESCALATE', 'MISSING']) || '见各投票任务'}\n\n请按意见修改后，把文章头部的 submit 改回 committee（status 保持 draft），下一批次会重新投票。不要改动其他文章。`.slice(0, 3000), projectId: proj && proj.id, assigneeAgentId: auth && auth.id, status: 'todo', priority: 'medium' })
      it.final = 'changes'; it.followUp = r.identifier
    } else { // CONFIRM（红线内容通过）/ ESCALATE：委员会建议 + 董事会最后确认
      const rec = t.outcome === 'ESCALATE' ? `委员会建议：有委员升级，需要你决定（升级理由：${reasons(t.vs, ['ESCALATE']) || '见投票任务'}）` : `委员会建议：通过（${line}）；这是红线内容（${it.redlineWhy}），需要你最后确认`
      const agents = await get(`/api/companies/${company}/agents`)
      const sec = agents.find((a) => a.name === SECRETARY)
      const ap = await send('POST', `/api/companies/${company}/approvals`, { type: 'request_board_approval', requestedByAgentId: sec.id, issueIds: [batch.parentId], payload: { title: `内容审批：${clip(it.title, 60)}`, summary: `${rec}\n\n文件：${it.path}\n投票：${t.vs.map((x) => `${x.n}=${x.v}${x.v === 'MISSING' ? '' : '（' + x.why + '）'}`).join('；')}\n\n批准 = 这条内容标为已审核（可以使用，但发布仍走原审批）；拒绝 = 保持草稿。`.slice(0, 2500), recommendedAction: t.outcome === 'CONFIRM' ? '批准' : '见升级理由', risks: [it.redlineWhy || '委员会升级'] } })
      it.approvalId = ap.id; it.final = null; it.awaiting = 'board'
    }
    return line
  }
  async function tally(batch, reason) {
    await collect(batch)
    // 一票都没有收到：多半是委员没能开工（报错、没额度），不能当成「5 票缺票 → 全部要修改」。先延期一次，再报警，文章原样保留
    if (!batch.items.some((it) => Object.keys(it.votes || {}).length)) {
      if (!batch.extended) {
        batch.extended = true; batch.dueAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString(); save()
        notify && notify(`⚠️ 委员会批次 ${batch.id} 到了统计时间，但一张有效票都没收到，已延期 2 小时。请看看委员（PM、UIUX、Localizer、SecurityReviewer、LedgerAuditor）是不是报错或没额度。`)
        log(`[committee] 批次 ${batch.id} 无票，延期 2 小时`)
      } else {
        batch.state = 'void'; batch.tallyReason = '延期后仍无票，作废'; save()
        notify && notify(`⚠️ 委员会批次 ${batch.id} 延期后仍没有任何投票，已作废；文章保持待审，没有被判「要修改」。修好委员后点「现在就开票」重开。`)
        log(`[committee] 批次 ${batch.id} 作废（无票）`)
      }
      return
    }
    const lines = []
    for (const it of batch.items) if (!it.final && !it.awaiting && !it.outcome) { const l = await finalizeItem(batch, it); lines.push(`${it.title}：${it.outcome}（${l}）`) }
    batch.tallyAt = new Date().toISOString(); batch.tallyReason = reason
    save()
    const counts = (o) => batch.items.filter((i) => i.outcome === o).length
    notify && notify(`⚖️ 委员会批次 ${batch.id} 统计完成（${reason}）：通过 ${counts('PASS')}，红线待你确认 ${counts('CONFIRM')}，升级待你决定 ${counts('ESCALATE')}，要修改 ${counts('CHANGES')}。${counts('CONFIRM') + counts('ESCALATE') ? '请到办公室页面「等你处理」里确认。' : ''}`)
    log(`[committee] 批次 ${batch.id} 统计完成：${lines.join(' | ')}`)
  }
  async function followBoard(batch) { // 董事会批准 / 拒绝之后收尾
    for (const it of batch.items) {
      if (it.awaiting !== 'board' || !it.approvalId) continue
      const ap = await get(`/api/approvals/${it.approvalId}`).catch(() => null)
      if (!ap || ap.status === 'pending') continue
      if (ap.status === 'approved') {
        writeMeta(it.path, { status: 'verified', submit: 'done', approved_by: `内容审批委员会 ${batch.id} + 董事会确认`, updated: phnom().date })
        await commitFile(it.path, `kb: 董事会确认「${clip(it.title, 40)}」（委员会批次 ${batch.id}）`)
        it.final = 'verified'
      } else { writeMeta(it.path, { submit: 'rejected' }); await commitFile(it.path, `kb: 董事会未通过「${clip(it.title, 40)}」（批次 ${batch.id}）`); it.final = 'rejected-by-board' }
      it.awaiting = null
      save()
    }
    if (batch.items.every((i) => i.final)) {
      batch.state = 'done'; save()
      await send('PATCH', `/api/issues/${batch.parentId}`, { status: 'done' }).catch(() => {})
    }
  }

  // ───── 每分钟一次的巡检 ─────
  async function tick() {
    if (busy) return
    busy = true
    try {
      const n = phnom()
      const workday = workDays().includes({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[n.dow]) // 上班日以作息配置为准
      const todayDone = db.batches.some((b) => b.id.startsWith(n.date) && !b.manual)
      if (workday && n.min >= 11 * 60 && n.min < 16 * 60 && !todayDone && scan().length) await open(false)
      for (const b of db.batches.filter((x) => x.state === 'voting')) {
        const tallied = b.items.every((i) => i.outcome)
        if (!tallied) {
          const due = b.dueAt ? Date.now() >= Date.parse(b.dueAt) : n.date > b.id.slice(0, 10) || n.min >= 16 * 60
          const allDone = await collect(b).catch(() => false)
          if (allDone) await tally(b, '5 票到齐')
          else if (due) await tally(b, '到了统计时间')
          else save()
        } else await followBoard(b)
      }
    } catch (e) { log(`[committee] 巡检出错：${e.message}`) } finally { busy = false }
  }

  return {
    start() { setInterval(tick, 60 * 1000); setTimeout(tick, 15000) },
    tick, // 供自检使用
    open: () => open(true),
    async revoke(rel) { // 董事会撤销一项已通过的决议：改回草稿
      const { meta } = readItem(rel)
      if (meta.status !== 'verified') throw Object.assign(new Error('这篇现在不是已审核状态'), { status: 400 })
      writeMeta(rel, { status: 'draft', submit: 'revoked', revoked: `董事会 ${phnom().date}` })
      await commitFile(rel, `kb: 董事会撤销「${clip(meta.title || rel, 40)}」的审核`)
      for (const b of db.batches) for (const i of b.items) if (i.path === rel && i.final === 'verified') i.final = 'revoked'
      save()
    },
    view() {
      return { members: MEMBERS.map((m) => ({ name: m.name, angle: m.angle })), backup: BACKUP, secretary: SECRETARY, pending: (() => { try { return scan() } catch { return [] } })().map((i) => ({ path: i.path, title: i.title, author: i.author, redline: i.redline, redlineWhy: i.redlineWhy })),
        batches: db.batches.slice(-6).reverse().map((b) => ({ id: b.id, state: b.state, createdAt: b.createdAt, tallyReason: b.tallyReason || null, votes: b.voteIssues.map((v) => ({ name: v.name, ident: v.ident, status: v.status || 'todo' })),
          items: b.items.map((i) => ({ path: i.path, title: i.title, redline: i.redline, outcome: i.outcome || null, final: i.final || null, awaiting: i.awaiting || null, tally: i.tally || null, voters: i.voters, votes: Object.fromEntries(Object.entries(i.votes || {}).map(([n, x]) => [n, x.v])), followUp: i.followUp || null })) })) }
    },
  }
}
