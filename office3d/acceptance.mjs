// 超时验收（董事会 2026-10-18）：「待验收」的任务超过 1 小时没人操作，由委员会投票决定是否验收通过。
//
// 范围：「等你处理」里的 review 类（agent 做完了、没有 agent 审查链、等董事会验收的任务）。不碰审批、问答、确认类卡片。
// 流程：上班时间里每分钟看一次；有任务等了 ≥60 分钟 → 开一批（最多 6 项）→ 5 位委员（同内容审批委员会）各一张投票任务
//   （作者回避，Architect 顶替）→ 5 票到齐或 30 分钟到点统计：
//   ≥3 票 APPROVE 且没有 ESCALATE → 验收通过（任务标为完成，和董事会点「验收通过」一样）；
//   ≥3 票 CHANGES → 退回作者修改（写明意见）；其余（含任何一票 ESCALATE）→ 留给董事会，附委员会意见。
// 不会自动验收的（只能董事会）：资金类（账务 / 入账 / 提现 / 鉴权 / IAM / 迁移 / 密钥 …，或负责人是 GoSenior / DBEngineer）。
// 董事会在投票期间自己验收了，这一项就跳过。一票都没收到不会当成「通过」或「退回」：作废并报警。
import fs from 'node:fs'
import path from 'node:path'
import { MEMBERS, BACKUP } from './committee.mjs'
import { parseVotes } from './standup.mjs'
import { isChatSessionTask } from './chat.mjs'

const PROJECT_NAME = '运营与知识库'
const WAIT_MS = 60 * 60 * 1000
const MAX_ITEMS = 6
const MONEY_ROLES = ['GoSenior', 'DBEngineer']
const MONEY_RE = /资金|账务|入账|提现|鉴权|IAM|迁移|密钥|ledger|withdraw|payout|migration|secret/i
const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const BACKUP_ANGLE = '顶替回避的作者，综合把关：做到了吗、稳不稳、有没有隐患。'
const angleOf = (name) => (MEMBERS.find((m) => m.name === name) || {}).accept || BACKUP_ANGLE
// T15：批次里若有「版本未核对」的项（证据缺版本 / 无法核对），规则最前面加这一句，防止委员只凭自述就投过
const VERSION_WARN = '【版本核对（必做）】本批有任务的验收证据版本未能与当前实际版本核对成功（证据缺版本或无法核对）。**缺失版本或版本无法核对的项，不得仅凭执行者自述投 APPROVE**——必须实际复核改动文件或说清原因。\n\n'

export function createAcceptance({ dir, company, get, send, notify, rework = () => false, versionCheck = async () => null, log = console.log, staggerMs = 15000 }) {
  const FILE = path.join(dir, 'acceptance.json')
  let db = { batches: [], decided: {} } // decided: `${issueId}@${since}` -> 结果，避免同一次等待反复投票
  try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch {}
  const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1))
  let snap = { waiting: [], on: false }, busy = false
  const asList = (r) => (Array.isArray(r) ? r : r.issues || r.comments || [])
  const agentComments = async (id) => asList(await get(`/api/issues/${id}/comments`)).filter((c) => c.authorAgentId)

  async function open(manual = false) {
    const active = db.batches.find((b) => b.state === 'voting')
    if (active) return { opened: false, reason: '已经有一批在投票' }
    const last = db.batches[db.batches.length - 1]
    if (!manual && last && last.tallyAt && Date.now() - Date.parse(last.tallyAt) < 15 * 60000) return { opened: false, reason: '刚统计过' }
    const agents = (await get(`/api/companies/${company}/agents`)).filter((a) => a.status !== 'terminated')
    const byName = new Map(agents.map((a) => [a.name, a])), byId = new Map(agents.map((a) => [a.id, a]))
    const due = snap.waiting.filter((w) => w.kind === 'review' && (manual || Date.now() - Date.parse(w.since) >= WAIT_MS) && !db.decided[`${w.issueId}@${w.since}`])
    const items = []
    for (const w of due) {
      if (items.length >= MAX_ITEMS) break
      const iss = await get(`/api/issues/${w.issueId}`)
      if (iss.status !== 'in_review') continue
      if (isChatSessionTask(iss)) continue
      const owner = byId.get(iss.assigneeAgentId)
      const money = MONEY_RE.test(`${iss.title}\n${iss.description || ''}`) || (owner && MONEY_ROLES.includes(owner.name))
      if (money) { db.decided[`${w.issueId}@${w.since}`] = { outcome: 'BOARD_ONLY', at: new Date().toISOString() }; save(); continue } // 资金类：只能董事会验收
      let capped = false
      try { capped = rework(w.issueId) } catch (e) { log(`[acceptance] 读返工状态失败，按未超限处理：${e.message}`) }
      if (capped) { db.decided[`${w.issueId}@${w.since}`] = { outcome: 'BOARD_ONLY', note: '返工超限', at: new Date().toISOString() }; save(); continue } // 返工超限：不进入委员会批次，等同交董事会
      // T15：验收尸核版本。版本已变 → 不入委员会批次（等同交董事会）；核对失败 / 接口异常 → 按「无法核对」处理，不得卡死验收
      let ver = null
      try { ver = await versionCheck(w.issueId) } catch (e) { log(`[acceptance] 版本核对失败，按无法核对处理：${e.message}`); ver = { result: '无法核对（核对接口失败）' } }
      const vr = ver && ver.result
      if (vr === '版本已变') { db.decided[`${w.issueId}@${w.since}`] = { outcome: 'BOARD_ONLY', note: '版本已变', at: new Date().toISOString() }; save(); continue }
      const vVerified = vr === '版本一致' ? true : vr === '证据缺版本（无法核对）' || (vr && vr.startsWith('无法核对（')) ? false : null
      const cs = await agentComments(w.issueId)
      const lastReport = cs.length ? clip(cs[cs.length - 1].body, 900) : '（没有找到执行者的回报评论）'
      items.push({ idx: items.length, issueId: w.issueId, ident: w.id, title: clip(iss.title, 80), since: w.since, owner: owner ? owner.name : '—', report: lastReport, votes: {}, version: vVerified })
    }
    if (!items.length) { if (manual) return { opened: false, reason: '没有符合条件的待验收任务（超过 1 小时、且不是资金类）' }; return { opened: false, reason: '没有可投的' } }
    const projects = asList(await get(`/api/companies/${company}/projects`))
    const proj = projects.find((p) => p.name === PROJECT_NAME)
    if (!proj) throw new Error(`找不到项目「${PROJECT_NAME}」`)
    const id = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const dueAt = new Date(Date.now() + 30 * 60000).toISOString()
    const deadline = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(dueAt))
    const batch = { id, createdAt: new Date().toISOString(), dueAt, manual, state: 'voting', items, voteIssues: [] }
    db.batches.push(batch); save()
    // 每位委员的投票项：作者回避，由后备顶上
    const voters = MEMBERS.map((m) => m.name)
    for (const name of voters) {
      const a = byName.get(name)
      if (!a) { log(`[acceptance] 找不到委员 ${name}，这一票按缺票算`); continue }
      const mine = items.filter((it) => it.owner !== name)
      if (!mine.length) continue
      mine.forEach((it) => { (it.voters = it.voters || []).push(name) })
      await spawn(batch, proj, a, name, mine, deadline)
    }
    const backup = byName.get(BACKUP)
    const need = items.filter((it) => (it.voters || []).length < MEMBERS.length) // 作者回避的项，由后备顶上
    if (backup && need.length) { need.forEach((it) => it.voters.push(BACKUP)); await spawn(batch, proj, backup, BACKUP, need, deadline) }
    save()
    log(`[acceptance] 批次 ${id}：${items.length} 项超时待验收，${batch.voteIssues.length} 张投票任务`)
    notify && notify(`🗳️ 有 ${items.length} 项「待验收」超过 1 小时没人处理，委员会开始投票（${deadline} 前）：${items.map((i) => i.ident).join('、')}。`)
    return { opened: true, batch: id, items: items.length }
  }
  async function spawn(batch, proj, agent, name, mine, deadline) {
    // T15：本批里有「版本未核对」的项（证据缺版本 / 无法核对），所有投票任务规则最前面都加警告，防止委员只凭自述投 APPROVE
    const warn = batch.items.some((it) => it.version === false) ? VERSION_WARN : ''
    const rules = `${warn}你是委员会的委员（${name}）。下面这些任务做完后进入「待验收」，超过 1 小时没人验收，现在由委员会投票决定验收是否通过。请对每一项**独立**投票，**不要去看其他委员的投票任务**，也不要改任何任务。你的角度——${angleOf(name)}\n\n\n\n【先核对证据（必做）】该任务的最后一次回报里必须有【验收证据】块（每个验收项的结果、验证版本、命令和真实输出；UI 任务要有浏览器实测并写明窗口尺寸）。**必需证据缺失、未通过或没验证的，不得投 APPROVE，投 CHANGES 并写出缺哪一项。**不要只信回报里的自述，自己复跑命令或打开页面核对。\n【怎么核对】可以读该任务的描述和全部评论（Paperclip 里按编号找），需要时到仓库里看对应分支的提交；不要只凭回报里的自述。\n【投票规则】每项三选一：APPROVE（验收通过）/ CHANGES（要修改，写出具体要改什么）/ ESCALATE（要董事会亲自定：钱、安全、对外发布、不可逆、拿不准）。资金类不在本次投票范围。\n【交付格式（程序按这个格式统计，格式不对按缺票算）】在本任务里发**一条评论**，每项一行，行首严格写：\nVOTE <序号>: APPROVE|CHANGES|ESCALATE | 一句话理由\n序号用上面【】里的数字。然后把本任务标为已完成。截止 ${deadline}（金边时间）。只读；不得 push、不得读取任何密钥；不确定就如实写不确定。`
    // 规则和投票格式放最前面；各项回报摘要按预算压缩，保证整段不超过 3600 字、不会把规则砍掉（回报完整内容让委员到任务评论里看）
    const budget = Math.max(300, 3400 - rules.length)
    const per = Math.max(80, Math.min(900, Math.floor(budget / mine.length) - 150))
    const itemsText = mine.map((it) => `【${it.idx + 1}】${it.ident} ${it.title}\n负责人：${it.owner}\n执行者最后一次回报（节选，完整内容请到该任务的评论里看）：${clip(it.report, per)}`).join('\n\n')
    const desc = `${rules}\n\n【待验收的任务】\n${itemsText}`
    const r = await send('POST', `/api/companies/${company}/issues`, { title: `验收投票 ${batch.id}：${name}（${mine.length} 项）`, description: desc.slice(0, 3600), projectId: proj.id, assigneeAgentId: agent.id, status: 'todo', priority: 'high' })
    batch.voteIssues.push({ name, issueId: r.id, ident: r.identifier, items: mine.map((it) => it.idx) })
    save()
    await new Promise((ok) => setTimeout(ok, staggerMs)) // 错开分派：同时建 git 工作树会抢锁
  }

  async function collect(batch) {
    let allDone = true
    for (const vi of batch.voteIssues) {
      const iss = await get(`/api/issues/${vi.issueId}`)
      vi.status = iss.status
      if (!['done', 'cancelled'].includes(iss.status)) allDone = false
      const votes = parseVotes(await agentComments(vi.issueId))
      for (const [k, v] of Object.entries(votes)) if (batch.items[k]) batch.items[k].votes[vi.name] = v
    }
    return allDone && batch.voteIssues.length > 0
  }
  async function tally(batch, reason, allFinished) {
    if (!batch.items.some((it) => Object.keys(it.votes).length)) {
      if (!batch.extended && !allFinished) { batch.extended = true; batch.dueAt = new Date(Date.now() + 30 * 60000).toISOString(); save(); notify && notify(`⚠️ 超时验收投票 ${batch.id} 到了统计时间，但一张有效票都没收到，已延期 30 分钟。请看看委员是不是报错或没额度。`); return }
      batch.state = 'void'; batch.tallyAt = new Date().toISOString(); batch.note = allFinished ? '投票任务都交了，但没有一张有效票' : '延期后仍无票'; save()
      notify && notify(`⚠️ 超时验收投票 ${batch.id} 作废（${batch.note}）：这些任务仍在「等你处理」，没有被验收也没有被退回。`)
      return
    }
    const out = { done: [], back: [], board: [], skip: [] }
    for (const it of batch.items) {
      const iss = await get(`/api/issues/${it.issueId}`)
      const vs = (it.voters || []).map((n) => ({ n, ...(it.votes[n] || { v: 'MISSING', why: '没有按格式投票（缺票）' }) }))
      const c = (k) => vs.filter((x) => x.v === k).length
      it.tally = { approve: c('APPROVE'), changes: c('CHANGES'), escalate: c('ESCALATE'), missing: c('MISSING') }
      const line = `${it.tally.approve} 通过 / ${it.tally.changes} 要修改 / ${it.tally.escalate} 升级 / ${it.tally.missing} 缺票`
      const why = (kinds) => vs.filter((x) => kinds.includes(x.v)).map((x) => `${x.n}：${x.why}`).join('；')
      db.decided[`${it.issueId}@${it.since}`] = { outcome: null, at: new Date().toISOString() }
      if (iss.status !== 'in_review') { it.outcome = 'SKIP'; it.note = `状态已变成 ${iss.status}（董事会或别人已经处理）`; out.skip.push(it); continue }
      if (it.tally.escalate === 0 && it.tally.approve >= 3) {
        await send('POST', `/api/issues/${it.issueId}/comments`, { body: `**委员会验收通过**（${line}）。原因：待验收超过 1 小时没人处理，按董事会规则由委员会投票。\n${why(['APPROVE'])}` })
        await send('PATCH', `/api/issues/${it.issueId}`, { status: 'done' })
        it.outcome = 'ACCEPTED'; out.done.push(it)
      } else if (it.tally.escalate === 0 && it.tally.changes >= 3) {
        await send('POST', `/api/issues/${it.issueId}/comments`, { body: `**委员会要求修改**（${line}）。请按下面的意见修改后重新提交验收：\n${why(['CHANGES'])}` })
        await send('PATCH', `/api/issues/${it.issueId}`, { status: 'in_progress' })
        it.outcome = 'CHANGES'; out.back.push(it)
      } else {
        await send('POST', `/api/issues/${it.issueId}/comments`, { body: `委员会投票没有形成多数，留给董事会验收（${line}）。\n${why(['ESCALATE', 'CHANGES', 'APPROVE'])}`.slice(0, 3000) })
        it.outcome = 'BOARD'; it.note = it.tally.escalate ? '有委员升级' : '没有形成多数'; out.board.push(it)
      }
      db.decided[`${it.issueId}@${it.since}`].outcome = it.outcome
    }
    batch.state = 'done'; batch.tallyAt = new Date().toISOString(); batch.tallyReason = reason; save()
    const ids = (l) => l.map((i) => i.ident).join('、')
    notify && notify(`✅ 超时验收投票 ${batch.id} 结果（${reason}）：${out.done.length ? `通过 ${ids(out.done)}；` : ''}${out.back.length ? `退回修改 ${ids(out.back)}；` : ''}${out.board.length ? `留给你 ${ids(out.board)}（在「等你处理」里）；` : ''}${out.skip.length ? `已被处理 ${ids(out.skip)}` : ''}`)
    log(`[acceptance] 批次 ${batch.id} 统计：${batch.items.map((i) => `${i.ident} ${i.outcome}`).join(' | ')}`)
  }

  async function tick() {
    if (busy) return
    busy = true
    try {
      const b = db.batches.find((x) => x.state === 'voting')
      if (b) {
        const allDone = await collect(b).catch(() => false)
        if (allDone) await tally(b, '5 票到齐', true)
        else if (Date.now() >= Date.parse(b.dueAt)) await tally(b, '到了统计时间', false)
        else save()
      } else if (snap.on && snap.waiting.some((w) => w.kind === 'review' && Date.now() - Date.parse(w.since) >= WAIT_MS && !db.decided[`${w.issueId}@${w.since}`])) await open(false)
    } catch (e) { log(`[acceptance] 巡检出错：${e.message}`) } finally { busy = false }
  }

  return {
    start() { setInterval(tick, 60 * 1000); setTimeout(tick, 30000) },
    tick,
    onState(waiting, dutyOn) { snap = { waiting: waiting || [], on: Boolean(dutyOn) } },
    open: () => open(true),
    view() {
      const b = db.batches[db.batches.length - 1]
      return b ? { id: b.id, state: b.state, note: b.note || '', members: (b.voteIssues || []).map((v) => ({ name: v.name, ident: v.ident, status: v.status || 'todo' })), items: b.items.map((i) => ({ ident: i.ident, title: i.title, owner: i.owner, outcome: i.outcome || null, tally: i.tally || null, note: i.note || '', version: i.version ?? null, votes: Object.fromEntries(Object.entries(i.votes || {}).map(([n, x]) => [n, x.v])) })) } : null
    },
  }
}
