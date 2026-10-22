// 页面里的「任务栏」与弹窗：在本页直接批准 / 回答 / 验收 / 评论，不用跳到 Paperclip。
// 所有写操作都经由本机服务的 POST /act（带 /state 下发的令牌），由董事会本人点击触发。
import { searchGroups, recentGroups } from './search.js'
import { REGION_FOCUS } from './office-layout.js'
import { createCollabGraph } from './collab-graph.js' // T12 协作关系图（弹窗里的 2D 图，浏览器模块）
import { chatPanelHtml, countChatText } from './chat-panel.js'
import { formatContract } from './contract-format.js'
import { canShowHomeEntry } from './home-inventory.js'

const $ = (id) => document.getElementById(id)
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return `${s} 秒`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} 分钟`
  const h = Math.floor(m / 60)
  return `${h} 小时${m % 60 ? ` ${m % 60} 分` : ''}`
}

// 极简 Markdown：标题、粗体、行内代码、代码块、列表、表格行（按原样显示）
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n')
  let html = '', inCode = false, inList = false
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
  for (const l of lines) {
    if (l.trim().startsWith('```')) { html += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue }
    if (inCode) { html += esc(l) + '\n'; continue }
    const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)
    if (li) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${inline(li[1])}</li>`; continue }
    if (inList) { html += '</ul>'; inList = false }
    const h = l.match(/^#{1,6}\s+(.*)$/)
    if (h) { html += `<h4>${inline(h[1])}</h4>`; continue }
    if (/^\s*\|?\s*-{3,}/.test(l)) continue
    if (l.trim()) html += `<p>${inline(l)}</p>`
  }
  if (inCode) html += '</pre>'
  if (inList) html += '</ul>'
  return html
}

const KIND = {
  approval: { icon: '🛡️', label: '待你审批', go: '审批' },
  question: { icon: '❓', label: '待你回答', go: '回答' },
  review: { icon: '✅', label: '待你验收', go: '验收' },
  undelivered: { icon: '📮', label: '回答没送到', go: '处理' },
  task: { icon: '🛠️', label: '', go: '查看' },
}
const STATUS = { todo: '待开始', in_progress: '进行中', in_review: '待验收', blocked: '阻塞', done: '已完成', backlog: '待排期', cancelled: '已取消' }

export function createUI({ refresh, refreshFoyer, focusAgent, setGoal }) {
  let token = null
  let state = null
  let busy = false
  // T15：验收证据版本核对（只读）：待验收卡片徽标与「版本已变」二次确认用的数据。
  // 页面按需拉一次 /evidence-version（批量），服务端缓存 60 秒；客户端同样 60 秒内不重拉，避免每次轮询都跑 git。
  let verCache = { at: 0, byIssue: new Map() }
  let schedulerCache = { at: 0, data: null }
  async function loadVer() {
    try {
      const r = await fetch('/evidence-version', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      verCache = { at: Date.now(), byIssue: new Map(Array.isArray(j.items) ? j.items.map((x) => [String(x.issueId), x]) : []) }
    } catch { verCache = { at: Date.now(), byIssue: new Map() } }
  }
  const verBadgeText = (v) => { // 徽标短文案：绿 版本一致 / 红 版本已变（N 提交 / M 文件）/ 灰 证据缺版本 / 无法核对
    if (v.result === '版本一致') return '版本一致'
    if (v.result.startsWith('版本已变')) {
      const m = String(v.note || '').match(/之后新增 (\d+) 个提交、改了 (\d+) 个文件/)
      return m ? `版本已变（${m[1]} 提交 / ${m[2]} 文件）` : v.result
    }
    return v.result.startsWith('无法核对（') ? '无法核对' : '证据缺版本'
  }
  const verBadge = (issueId) => {
    const v = verCache.byIssue.get(String(issueId))
    if (!v || !v.result) return ''
    const tip = [`${v.result}${v.note ? `（${v.note}）` : ''}`].concat((v.items || []).map((i) => `${i.label} → ${i.state}${i.note ? `（${i.note}）` : ''}`)).slice(0, 21).join('\n')
    const style = v.result === '版本一致'
      ? 'color:#b8f5c8;background:rgba(60,200,120,.14);border:1px solid rgba(80,220,140,.4)'
      : v.result.startsWith('版本已变')
        ? 'color:#ffd2d2;background:rgba(255,60,60,.16);border:1px solid rgba(255,110,110,.45)'
        : 'color:#c8cdd4;background:rgba(150,160,175,.12);border:1px solid rgba(160,170,185,.3)'
    return `<span class="ver-badge" title="${esc(tip)}" style="display:inline-block;margin-top:4px;padding:1px 8px;border-radius:999px;font-size:10.5px;line-height:1.6;overflow-wrap:anywhere;${style}">${esc(verBadgeText(v))}</span>`
  }

  function toast(msg, ok = true) {
    const t = $('toast')
    t.textContent = msg
    t.className = 'glass ' + (ok ? 'ok' : 'bad')
    clearTimeout(toast.h)
    toast.h = setTimeout(() => { t.className = '' }, 3200)
  }
  let lastResult = null
  async function post(body, errors = {}) {
    if (state?.lan) { toast('局域网只读，请在运行服务的电脑上操作', false); return false }
    if (busy) return false
    busy = true
    try {
      const send = () => fetch('/act', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Office-Token': token || '' }, body: JSON.stringify(body) })
      let r = await send()
      let j = await r.json().catch(() => ({}))
      if (r.status === 403 && /令牌/.test(j.error || '')) { // 服务重启后页面里缓存的操作令牌过期：重新取一次令牌再发一次（被拒的请求没有产生任何效果，重发不会重复操作）
        try {
          const fresh = await (await fetch('/state', { cache: 'no-store' })).json()
          if (fresh.actToken && fresh.actToken !== token) { token = fresh.actToken; r = await send(); j = await r.json().catch(() => ({})) }
        } catch {}
      }
      if (!r.ok) throw new Error(errors[r.status] || j.error || `HTTP ${r.status}`)
      lastResult = j.result || null
      return true
    } catch (e) {
      toast('没有成功：' + e.message, false)
      return false
    } finally {
      busy = false
    }
  }
  const modal = $('modal'), wrap = $('modalWrap')
  let chatPoll = null
  function open(html) {
    modal.innerHTML = `<button class="close" data-x>×</button>${html}`
    wrap.classList.add('show')
    modal.querySelector('[data-x]').onclick = close
    if (state?.lan) modal.querySelectorAll('.actions .btn, #nameSave').forEach((b) => { if (!['mView', 'govHistory'].includes(b.id)) { b.disabled = true; b.title = '局域网只读，请在运行服务的电脑上操作' } })
  }
  function close() { if (chatPoll) clearTimeout(chatPoll); chatPoll = null; wrap.classList.remove('show'); modal.innerHTML = '' }
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close() })
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })
  const agentName = (id) => (state && state.names && state.names[id]) || (state && state.agents.find((a) => a.id === id) || {}).name || ''
  async function done(msg) {
    toast(msg)
    close()
    await refresh()
  }

  async function openChat(agentId) {
    if (chatPoll) clearTimeout(chatPoll)
    let data
    try { const r = await fetch('/chat?agent=' + encodeURIComponent(agentId), { cache: 'no-store' }); data = await r.json(); if (!r.ok) throw new Error(data.error || r.status) }
    catch (e) { open(`<h2>💬 对话</h2><p class="bad">读取失败：${esc(e.message)}</p>`); return }
    open(chatPanelHtml(data, Boolean(state?.world?.duty?.on)))
    const input = modal.querySelector('#chatInput'), send = modal.querySelector('#chatSend'), count = modal.querySelector('#chatCount')
    const reload = async () => { await refresh(); await openChat(agentId) }
    if (input) {
      const update = () => { count.textContent = countChatText(input.value) }; input.oninput = update
      input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click() } }
      send.onclick = async () => { if (await post({ type: 'chat_send', agentId, text: input.value })) { toast(lastResult?.status === 'queued' ? '已排队，上班后发送' : '已发送，等待回复'); await reload() } }
    }
    const convert = async (ids, suggested = null) => {
      const title = suggested?.title || modal.querySelector('#chatTaskTitle')?.value.trim(), note = suggested?.note || modal.querySelector('#chatTaskNote')?.value.trim()
      if (await post({ type: 'chat_to_task', chatAgentId: agentId, title, note, messageIds: ids })) { toast(`已建任务 ${lastResult?.identifier || ''}，交给 Lead`); await reload() }
    }
    const ids = (data.messages || []).filter(m => m.role !== 'system').map(m => m.id)
    const all = modal.querySelector('#chatTaskAll'); if (all) all.onclick = () => convert(ids)
    modal.querySelectorAll('[data-chat-task]').forEach(b => { b.onclick = () => convert([b.dataset.chatTask], { title: b.dataset.title, note: b.dataset.note }) })
    if (data.enabled && data.pending) chatPoll = setTimeout(() => openChat(agentId), 5000)
  }

  function openHandoff() {
    open('<h2>📥 交办箱</h2><p class="note">先与同事对话，再把选中的内容交给 Lead。</p>')
    if (!state?.chat?.enabled) {
      const note = document.createElement('p'); note.className = 'warnbox'; note.textContent = '对话功能未开启'; modal.appendChild(note); return
    }
    const list = document.createElement('div'); list.className = 'bl foyer-handoff-list'
    for (const agent of state.agents || []) {
      if (agent?.status === 'terminated') continue
      const button = document.createElement('button'); button.className = 'bli foyer-handoff-person'; button.type = 'button'
      button.textContent = `${agentName(agent.id) || agent.name || '未命名同事'} · ${agent.title || '同事'}`
      button.onclick = () => openChat(agent.id)
      list.appendChild(button)
    }
    if (!list.childElementCount) { const note = document.createElement('p'); note.className = 'note'; note.textContent = '当前没有可对话的同事'; list.appendChild(note) }
    modal.appendChild(list)
  }

  function openAnnounce(foyer) {
    open('<h2>📣 董事会公告</h2>')
    if (!foyer) { const note = document.createElement('p'); note.className = 'warnbox'; note.textContent = '前厅数据尚未同步'; modal.appendChild(note); return }
    if (foyer.enabled === false) { const note = document.createElement('p'); note.className = 'warnbox'; note.textContent = '公告功能未开启'; modal.appendChild(note); return }
    const label = document.createElement('label'); label.className = 'fl'; label.textContent = '公告内容（1–120 字）'
    const input = document.createElement('textarea'); input.id = 'announceText'; input.maxLength = 240; input.value = String(foyer.announcement?.text || '')
    const counter = document.createElement('div'); counter.className = 'note foyer-announce-count'
    const actions = document.createElement('div'); actions.className = 'actions'
    const clear = document.createElement('button'); clear.className = 'btn bad'; clear.type = 'button'; clear.textContent = '清空公告'
    const save = document.createElement('button'); save.className = 'btn gold'; save.type = 'button'; save.textContent = '保存公告'
    const update = () => { const n = [...input.value.trim()].length; counter.textContent = `${n} / 120`; save.disabled = n < 1 || n > 120 }
    input.oninput = update; update(); actions.append(clear, save); modal.append(label, input, counter, actions)
    const errors = { 403: '公告功能未开启', 429: '今天保存次数已达上限' }
    save.onclick = async () => { if (await post({ type: 'foyer_announce', text: input.value.trim() }, errors)) { toast('公告已保存'); close(); await refreshFoyer?.() } }
    clear.onclick = async () => { if (await post({ type: 'foyer_announce_clear' }, errors)) { toast('公告已清空'); close(); await refreshFoyer?.() } }
  }

  // ── 任务详情：描述 + 评论 + （按场景）验收 / 评论 / 唤醒 ──
  async function openIssue(issueId, mode = 'view') {
    open('<div class="note">加载中…</div>')
    let d
    try {
      const r = await fetch('/issue?id=' + encodeURIComponent(issueId))
      d = await r.json()
      if (!r.ok) throw new Error(d.error || r.status)
    } catch (e) { open(`<div class="note">读取失败：${esc(e.message)}</div>`); return }
    // T15：验收视图里按需核对【验收证据】对象版本（只读；服务端缓存 60 秒），用于显示核对结果和「版本已变」时的二次确认
    let vv = null
    if (mode === 'review') {
      try { const r = await fetch('/evidence-version?issue=' + encodeURIComponent(d.identifier), { cache: 'no-store' }); const j = await r.json().catch(() => ({})); if (r.ok && j && j.result) vv = j } catch {}
    }
    const comments = d.comments.map((c) => `<div class="cm"><div class="who">${esc(c.who)} · ${esc(new Date(c.at).toLocaleString())}</div><div class="md">${md(c.body)}</div></div>`).join('') || '<div class="note">还没有评论</div>'
    let actions = ''
    if (mode === 'review') {
      const vLine = vv ? `<div class="note" style="${vv.result === '版本一致' ? 'color:#b8f5c8' : vv.result.startsWith('版本已变') ? 'color:#ffd2d2' : 'color:#c8cdd4'}">版本核对：${esc(vv.result)}${vv.note ? `（${esc(vv.note)}）` : ''}</div>` : ''
      actions = `<div class="sec">验收</div>${vLine}
        <textarea id="mNote" placeholder="意见（选填；要求修改时必填）"></textarea>
        <div class="actions"><button class="btn bad" id="mChanges">要求修改</button><button class="btn ok" id="mAccept">验收通过</button></div>
        <div class="note">验收通过 = 任务标记为已完成；要求修改 = 退回进行中，并把你的意见作为评论发给 ${esc(d.assignee || '负责人')}。</div>`
    } else if (mode === 'undelivered') {
      actions = `<div class="sec">你的回答没送到 ${esc(d.assignee || 'agent')}</div>
        <div class="note">当时它没有在运行，所以没收到。点下面的按钮会发一条评论把它叫醒，它会读到上面的回答并继续。</div>
        <div class="actions"><button class="btn gold" id="mWake">叫醒它继续</button></div>`
    }
    actions += `<div class="sec">发评论</div><textarea id="mBody" placeholder="写给 ${esc(d.assignee || '负责人')} 的话…"></textarea><div class="actions"><button class="btn" id="mSend">发送评论</button></div>`
    if (!['done', 'cancelled'].includes(d.status)) {
      actions += `<div class="sec">取消任务</div><input type="text" id="mWhy" class="one" maxlength="500" placeholder="取消原因（选填，会作为评论发给 ${esc(d.assignee || '负责人')}）">
        <div class="actions"><button class="btn bad" id="mCancel">取消这个任务</button></div>
        <div class="note">取消后任务标为「已取消」；${esc(d.assignee || '负责人')}如果正在做，会立刻停下这次运行。需要恢复时可以在 Paperclip 里重新打开。</div>`
    }
    open(`<h2>${esc(d.identifier)} ${esc(d.title)}</h2>
      <div class="meta">${projTag(d.projectId)}${esc(STATUS[d.status] || d.status)}${d.assignee ? ' · 负责人 ' + esc(d.assignee) : ''}</div>
      <div class="sec">任务说明</div><div class="fold md">${md(d.description) || '<span class="note">无</span>'}</div>
      <div class="sec">最近的评论</div>${comments}${actions}`)
    const val = (id) => (modal.querySelector('#' + id) || {}).value || ''
    const bind = (id, fn) => { const b = modal.querySelector('#' + id); if (b) b.onclick = fn }
    bind('mAccept', async () => {
      const b = modal.querySelector('#mAccept')
      if (!b.dataset.sure) { // 第一次点只提示后果，再点一次才真的关闭任务
        b.dataset.sure = '1'
        b.textContent = '确认：标为已完成'
        toast(`验收通过会把 ${d.identifier} 标为「已完成」，${d.assignee || '负责人'} 不会再继续做。确认无误再点一次。`, true)
        return
      }
      if (!b.dataset.verOk && vv && vv.result === '版本已变') {
        // T15：证据对应的版本已经变了，多一次确认（二选一，默认焦点在「取消」；不禁用按钮），确认后照常走现有流程
        b.dataset.verOk = '1'
        const actions = b.parentElement
        const row = document.createElement('div')
        row.className = 'row'
        row.innerHTML = `<span>⚠ 版本已变</span><span class="note">证据对应的版本已经变了（${esc(vv.note || vv.result)}），确定仍要通过吗？</span>`
        const ok = document.createElement('button'); ok.className = 'btn ok'; ok.textContent = '仍要通过'
        const no = document.createElement('button'); no.className = 'btn'; no.textContent = '取消'
        actions.insertBefore(row, b); actions.appendChild(ok); actions.appendChild(no)
        no.focus() // 默认焦点在「取消」
        ok.onclick = async () => { if (await post({ type: 'review', issueId, decision: 'accept', note: val('mNote') })) done(`${d.identifier} 已验收通过`) }
        no.onclick = () => { row.remove(); ok.remove(); no.remove(); b.style.display = ''; delete b.dataset.verOk }
        b.style.display = 'none'
        return
      }
      if (await post({ type: 'review', issueId, decision: 'accept', note: val('mNote') })) done(`${d.identifier} 已验收通过`)
    })
    bind('mChanges', async () => {
      if (!val('mNote').trim()) { toast('要求修改时请写明要改什么', false); return }
      if (await post({ type: 'review', issueId, decision: 'changes', note: val('mNote') })) done(`${d.identifier} 已退回修改`)
    })
    bind('mCancel', async () => {
      const b = modal.querySelector('#mCancel')
      if (!b.dataset.sure) {
        b.dataset.sure = '1'
        b.textContent = '确认取消'
        toast(`取消后 ${d.identifier} 会标为「已取消」，正在进行的运行会停下。确认再点一次。`, true)
        return
      }
      if (await post({ type: 'cancel_issue', issueId, note: val('mWhy') })) done(`${d.identifier} 已取消`)
    })
    bind('mWake', async () => { if (await post({ type: 'comment', issueId, body: '董事会：上面的回答已经提交，请读取后继续。' })) done('已叫醒，它会继续处理') })
    bind('mSend', async () => {
      if (!val('mBody').trim()) { toast('评论不能为空', false); return }
      if (await post({ type: 'comment', issueId, body: val('mBody') })) done('评论已发送')
    })
  }

  // ── 回答问题卡 ──
  // ── 疑似卡住：列出是谁、卡在哪，给「定位 / 看任务 / 取消这次运行」──
  function openStalled(list) {
    if (!list.length) { open('<h2>没有卡住的运行</h2><div class="note">刚才那条可能已经恢复了。</div>'); return }
    const rows = list.map((s, i) => `<div class="q"><div class="prompt">${esc(s.name)} <span class="note">· ${esc(s.title || '')}</span></div>
      <div class="row"><span>任务</span><span>${s.task ? projTag(s.task.projectId) + esc(s.task.id + ' ' + s.task.title) : '无'}</span></div>
      <div class="row"><span>情况</span><span>${esc(s.chip)}</span></div>
      <div class="note" style="margin:6px 0">${esc(s.why)}</div>
      <div class="actions" style="margin-top:6px"><button class="btn" data-loc="${i}">定位到 TA</button>${s.task ? `<button class="btn" data-task="${i}">看任务</button>` : ''}${s.runId ? `<button class="btn bad" data-cancel="${i}">取消这次运行</button>` : ''}</div></div>`).join('')
    open(`<h2>⚠ 疑似卡住（${list.length}）</h2><div class="meta">「运行记录残留」= Paperclip 还记着在运行，但进程已经退出；「疑似卡住」= 进程还在，超过 5 分钟没有输出。取消这次运行不会删除任务，只是结束这次运行记录，agent 之后会按任务状态重新被唤醒。</div>${rows}`)
    modal.querySelectorAll('[data-loc]').forEach((b) => (b.onclick = () => { close(); focusAgent(list[+b.dataset.loc].agentId) }))
    modal.querySelectorAll('[data-task]').forEach((b) => (b.onclick = () => openIssue(list[+b.dataset.task].task.issueId)))
    modal.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
      const s = list[+b.dataset.cancel]
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '确认取消'; toast(`确认要结束 ${s.name} 的这次运行吗？再点一次执行。`, true); return }
      if (await post({ type: 'cancel_run', runId: s.runId })) done(`已取消 ${s.name} 的这次运行`)
    }))
  }

  // ── 确认类卡片：勾选要批准的条目，再点「同意」；或「不同意」并写原因 ──
  function openConfirm(w) {
    const c = w.confirm
    const checks = c.options.map((o) => `<label class="opt"><input type="checkbox" name="cf" value="${esc(o.id)}"${c.selected.includes(o.id) ? ' checked' : ''}><div><div>${esc(o.label)}</div>${o.description ? `<div class="d">${esc(o.description)}</div>` : ''}</div></label>`).join('')
    open(`<h2>${esc(w.id)} ${esc(w.title)}</h2><div class="meta">${projTag(w.projectId)}${esc(agentName(w.agentId) || 'agent')} 在等你确认 · 已等 ${ago(Date.now() - Date.parse(w.since))}</div>
      ${c.title ? `<div class="sec">${esc(c.title)}</div>` : ''}<div class="prompt" style="font-weight:600;margin-bottom:8px">${esc(c.prompt)}</div>
      ${c.details ? `<div class="fold md" style="max-height:260px">${md(c.details)}</div>` : ''}
      ${checks ? `<div class="sec">勾选你同意的条目</div>${checks}` : ''}
      <div class="sec">${esc(c.rejectReasonLabel)}${c.rejectRequiresReason ? '（不同意时必填）' : '（选填）'}</div><textarea id="mReason" placeholder="不同意时写原因；同意时可不写"></textarea>
      <div class="actions"><button class="btn" id="mView">看任务详情</button><button class="btn bad" id="mNo">${esc(c.rejectLabel)}</button><button class="btn ok" id="mYes">${esc(c.acceptLabel)}</button></div>`)
    modal.querySelector('#mView').onclick = () => openIssue(w.issueId)
    modal.querySelector('#mYes').onclick = async () => {
      const ids = [...modal.querySelectorAll('input[name="cf"]:checked')].map((x) => x.value)
      if (ids.length < c.min) { toast(`至少要勾选 ${c.min} 项`, false); return }
      if (c.max !== null && ids.length > c.max) { toast(`最多只能勾选 ${c.max} 项`, false); return }
      if (await post({ type: 'confirm', issueId: w.issueId, interactionId: w.interactionId, decision: 'accept', selectedOptionIds: c.options.length ? ids : undefined })) done(`已同意${c.options.length ? `（勾选 ${ids.length} 项）` : ''}，agent 会被唤醒继续`)
    }
    modal.querySelector('#mNo').onclick = async () => {
      const reason = modal.querySelector('#mReason').value.trim()
      if (c.rejectRequiresReason && !reason) { toast('不同意时请写明原因', false); return }
      if (await post({ type: 'confirm', issueId: w.issueId, interactionId: w.interactionId, decision: 'reject', reason })) done('已回复：不同意，agent 会被唤醒继续')
    }
  }
  function openQuestion(w) {
    if (w.confirm) { openConfirm(w); return }
    const ask = w.ask
    if (!ask || !ask.questions.length) { openIssue(w.issueId); return }
    const qs = ask.questions.map((q, qi) => {
      const type = q.multi ? 'checkbox' : 'radio'
      const opts = q.options.map((o) => `<label class="opt"><input type="${type}" name="q${qi}" value="${esc(o.id)}"><div><div>${esc(o.label)}</div>${o.description ? `<div class="d">${esc(o.description)}</div>` : ''}</div></label>`).join('')
      const other = q.text || q.allowOther ? `<input type="text" id="o${qi}" placeholder="${q.text ? '你的回答' : '其他（自己写）'}" style="min-height:0">` : ''
      const garbled = /\?{4,}/.test(q.prompt)
      return `<div class="q"><div class="prompt">${esc(q.prompt)}</div>${garbled ? '<div class="note">⚠ 这道题的文字在 agent 发出时已经被编码损坏（显示成 ?），选项顺序没变。</div>' : ''}${opts}${other}</div>`
    }).join('')
    open(`<h2>${esc(w.id)} ${esc(w.title)}</h2><div class="meta">${projTag(w.projectId)}${esc(agentName(w.agentId) || 'agent')} 在等你的回答 · 已等 ${ago(Date.now() - Date.parse(w.since))}</div>
      ${ask.title ? `<div class="sec">${esc(ask.title)}</div>` : ''}${qs}
      <div class="sec">附言（选填）</div><textarea id="mNote" placeholder="补充说明，会一起交给 agent"></textarea>
      <div class="actions"><button class="btn" id="mView">看任务详情</button><button class="btn gold" id="mSubmit">提交回答</button></div>`)
    modal.querySelector('#mView').onclick = () => openIssue(w.issueId)
    // 单选题：选项和「自己写的回答」只能二选一（Paperclip 会以 422 拒收同时提交）——选了选项就清空文字框，开始写字就取消选项
    ask.questions.forEach((q, qi) => {
      const o = modal.querySelector('#o' + qi)
      if (q.multi || !o) return
      const radios = [...modal.querySelectorAll(`input[name="q${qi}"]`)]
      radios.forEach((r) => (r.onchange = () => { if (r.checked) o.value = '' }))
      o.oninput = () => { if (o.value.trim()) radios.forEach((r) => (r.checked = false)) }
      if (radios.length) o.placeholder = `${o.placeholder}（和上面的选项二选一）`
    })
    modal.querySelector('#mSubmit').onclick = async () => {
      const answers = ask.questions.map((q, qi) => {
        const optionIds = [...modal.querySelectorAll(`input[name="q${qi}"]:checked`)].map((x) => x.value)
        const o = modal.querySelector('#o' + qi)
        return { questionId: q.id, optionIds, otherText: o && o.value.trim() ? o.value.trim() : undefined }
      })
      if (answers.some((a) => !a.optionIds.length && !a.otherText)) { toast('每道题都要选一个（或写上回答）', false); return }
      if (ask.questions.some((q, qi) => !q.multi && answers[qi].optionIds.length && answers[qi].otherText)) { toast('这道题是单选：选项和自己写的回答只能二选一', false); return }
      if (await post({ type: 'answer', issueId: w.issueId, interactionId: w.interactionId, answers, note: modal.querySelector('#mNote').value })) done('回答已提交，agent 会被唤醒继续')
    }
  }

  // ── 审批 ──
  function openApproval(a) {
    open(`<h2>${esc(a.title)}</h2><div class="meta">${esc(agentName(a.agentId) || '系统')} 发起 · ${esc(a.type)} · 已等 ${ago(Date.now() - Date.parse(a.at))}</div>
      <div class="sec">说明</div><div class="fold md">${md(a.summary) || '<span class="note">没有附说明</span>'}</div>
      <div class="sec">审批意见（选填）</div><textarea id="mNote" placeholder="写给发起人的话"></textarea>
      <div class="actions"><button class="btn bad" id="mReject">拒绝</button><button class="btn ok" id="mApprove">批准</button></div>`)
    const note = () => modal.querySelector('#mNote').value
    modal.querySelector('#mApprove').onclick = async () => { if (await post({ type: 'approval', id: a.id, decision: 'approve', note: note() })) done('已批准') }
    modal.querySelector('#mReject').onclick = async () => { if (await post({ type: 'approval', id: a.id, decision: 'reject', note: note() })) done('已拒绝') }
  }

  // ── 派发任务：新建任务 / 把「待排期」的任务指派给某位同事 ──
  const MONEY_OK = ['GoSenior', 'DBEngineer']
  const PRIO = [['medium', '普通'], ['high', '高'], ['critical', '紧急'], ['low', '低']]
  function agentOptions({ money = false, lead = false, pick = '' } = {}) {
    const offDuty = state.world && state.world.duty && state.world.duty.on === false
    const list = state.agents.filter((a) => !money || MONEY_OK.includes(a.name)).slice().sort((a, b) => a.name.localeCompare(b.name))
    const tag = (a) => a.liveRun ? '执行中' : a.status === 'paused' ? (offDuty ? '已下班，上班后开始' : '已暂停') : a.status === 'error' ? '出错' : a.task ? '手上有任务' : '空闲'
    const lead0 = state.agents.find((a) => a.name === 'Lead')
    return (lead && lead0 && !money ? `<option value="lead:${lead0.id}">交给 Lead 拆解后派发（推荐）</option>` : '')
      + (lead ? '<option value="">先放「待排期」，不指派</option>' : '')
      + list.map((a) => `<option value="${a.id}"${a.id === pick ? ' selected' : ''}>${esc(agentName(a.id))}${agentName(a.id) !== a.name ? ' / ' + esc(a.name) : ''} · ${esc(a.title || '')} · ${tag(a)}</option>`).join('')
  }
  function openDispatch(agentId = '', tab = 'new') {
    const projects = state.projects || []
    open(`<h2>派发任务</h2>
      <div class="meta">新建一个任务，或把「待排期」的任务交给某位同事。指派后它会在工作时间（金边 ${esc(state.world?.duty?.start || '8:30')}–${esc(state.world?.duty?.end || '17:30')}）开始；资金类只能交给 GoSenior / DBEngineer。</div>
      <div class="tabs"><button class="tab" data-t="new">＋ 新建任务</button><button class="tab" data-t="bl">📋 指派待排期</button></div>
      <label class="fl">项目</label><select id="dProj">${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <div id="dPane"></div>`)
    const proj = modal.querySelector('#dProj')
    const pane = modal.querySelector('#dPane')
    const tabs = [...modal.querySelectorAll('.tab')]
    const show = (t) => { tab = t; tabs.forEach((b) => b.classList.toggle('on', b.dataset.t === t)); t === 'new' ? paneNew() : paneBacklog() }
    tabs.forEach((b) => (b.onclick = () => show(b.dataset.t)))
    proj.onchange = () => show(tab)

    function paneNew() {
      pane.innerHTML = `<label class="fl">标题</label><input type="text" id="dTitle" class="one" maxlength="200" placeholder="一句话说清要做什么">
        <label class="fl">说明</label><textarea id="dDesc" placeholder="背景、要交付什么、怎么算做完（验收标准）……"></textarea>
        <details class="contract-draft"><summary class="sec">任务契约（建议填写）</summary><div class="contract-grid">
          <label class="fl">项目<input data-contract-field="项目" value="${esc((projects.find((project) => String(project.id) === String(proj.value)) || {}).name || 'Virtual AI Office')}" readonly></label>
          <label class="fl">目标<input data-contract-field="目标" placeholder="填写可观察目标"></label>
          <label class="fl">允许修改<input data-contract-field="允许修改" placeholder="填写允许修改的文件"></label>
          <label class="fl">禁止<input data-contract-field="禁止" placeholder="填写禁止的文件或行为"></label>
          <label class="fl">依赖<input data-contract-field="依赖" placeholder="无或任务编号"></label>
          <label class="fl">输入版本<input data-contract-field="输入版本" placeholder="填写对象版本"></label>
          <label class="fl">验收标准<textarea data-contract-field="验收标准" placeholder="每行一条可检查条件"></textarea></label>
          <label class="fl">工具权限<input data-contract-field="工具权限" placeholder="填写工具边界"></label>
          <label class="fl">预算上限<input data-contract-field="预算上限" placeholder="次数 / 分钟 / token 上限"></label>
          <label class="fl">交付物<input data-contract-field="交付物" placeholder="填写文件或证据"></label>
          <label class="fl">审核责任人<input data-contract-field="审核责任人" placeholder="填写独立审核者"></label>
          <label class="fl">风险等级<select data-contract-field="风险等级"><option value="">选择风险等级</option><option>低</option><option>中</option><option>高</option><option>资金</option></select></label>
        </div></details>
        <div class="row2"><div><label class="fl">优先级</label><select id="dPrio">${PRIO.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
        <div><label class="fl">负责人</label><select id="dWho">${agentOptions({ lead: !agentId, pick: agentId })}</select></div></div>
        <label class="chk"><input type="checkbox" id="dMoney"> 资金类（账务 / 提现 / 鉴权 / IAM / 迁移 / 密钥 / 入账队列）——只能交给 GoSenior / DBEngineer，PR 要过三道审查再由董事会过目</label>
        <div class="actions"><button class="btn gold" id="dCreate">派发</button></div>`
      const money = pane.querySelector('#dMoney'), who = pane.querySelector('#dWho')
      const risk = pane.querySelector('[data-contract-field="风险等级"]')
      const projectName = () => (projects.find((project) => String(project.id) === String(proj.value)) || {}).name || 'Virtual AI Office'
      money.onchange = () => {
        who.innerHTML = agentOptions({ money: money.checked, lead: true, pick: agentId })
        risk.value = money.checked ? '资金' : ''
        risk.disabled = money.checked
      }
      pane.querySelector('#dCreate').onclick = async () => {
        const title = pane.querySelector('#dTitle').value.trim()
        if (!title) { toast('请填写任务标题', false); return }
        let desc = pane.querySelector('#dDesc').value.trim()
        const contractValues = { 项目: projectName() }
        pane.querySelectorAll('[data-contract-field]').forEach((field) => { contractValues[field.dataset.contractField] = field.value })
        const contractText = formatContract(contractValues)
        if (contractText && !desc.includes('【任务契约】')) desc = desc ? `${desc}\n\n${contractText}` : contractText
        let assigneeAgentId = who.value
        const toLead = assigneeAgentId.startsWith('lead:')
        if (toLead) { assigneeAgentId = assigneeAgentId.slice(5); desc = '董事会派发：请 Lead 拆解成可执行的子任务，按岗位规则派给合适的同事，并在本任务里回报拆解结果。' + (desc ? '\n\n' + desc : '') }
        const ok = await post({ type: 'create_issue', projectId: proj.value, title, description: desc, priority: pane.querySelector('#dPrio').value, money: money.checked, assigneeAgentId: assigneeAgentId || undefined })
        if (ok) {
          const check = lastResult?.contractCheck
          const suffix = check?.state === 'complete'
            ? '；契约完整'
            : check?.state === 'incomplete'
              ? `；契约缺 ${check.errors?.length || 0} 项：${(check.errors || []).slice(0, 4).map((item) => item.field).join('、') || '请查看提示'}`
              : ''
          await done((assigneeAgentId ? `已派发给 ${agentName(assigneeAgentId)}` : '已建好，放在「待排期」') + suffix)
        }
      }
    }

    async function paneBacklog() {
      pane.innerHTML = '<div class="note">加载待排期任务…</div>'
      let list
      try {
        const r = await fetch('/backlog?projectId=' + encodeURIComponent(proj.value))
        list = await r.json()
        if (!r.ok) throw new Error(list.error || r.status)
      } catch (e) { pane.innerHTML = `<div class="note">读取失败：${esc(e.message)}</div>`; return }
      list.sort((a, b) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true }))
      pane.innerHTML = `<input type="text" id="dFind" class="one" placeholder="搜索编号或标题（共 ${list.length} 个待排期）">
        <div class="bl" id="dList"></div><div id="dPick"></div>`
      const box = pane.querySelector('#dList')
      const draw = () => {
        const q = pane.querySelector('#dFind').value.trim().toLowerCase()
        const rows = list.filter((i) => !q || (i.identifier + ' ' + i.title).toLowerCase().includes(q))
        box.innerHTML = rows.map((i) => `<div class="bli" data-id="${i.id}"><b>${esc(i.identifier)}</b> ${esc(i.title)}${i.money ? ' <span class="tagm">资金类</span>' : ''}</div>`).join('') || '<div class="note">没有匹配的任务</div>'
        box.querySelectorAll('.bli').forEach((el) => (el.onclick = () => { box.querySelectorAll('.bli').forEach((x) => x.classList.toggle('on', x === el)); pick(el.dataset.id) }))
      }
      pane.querySelector('#dFind').oninput = draw
      draw()
    }

    async function pick(issueId) {
      const out = pane.querySelector('#dPick')
      out.innerHTML = '<div class="note">加载任务详情…</div>'
      let d
      try {
        const r = await fetch('/issue?id=' + encodeURIComponent(issueId))
        d = await r.json()
        if (!r.ok) throw new Error(d.error || r.status)
      } catch (e) { out.innerHTML = `<div class="note">读取失败：${esc(e.message)}</div>`; return }
      const openDeps = d.blockedBy.filter((b) => b.status !== 'done' && b.status !== 'cancelled')
      const pre = d.description.indexOf('开工前必须满足')
      out.innerHTML = `<div class="sec">${esc(d.identifier)} ${esc(d.title)}${d.money ? ' <span class="tagm">资金类</span>' : ''}</div>
        ${d.blockedBy.length ? `<div class="note">依赖：${d.blockedBy.map((b) => `${esc(b.identifier)} ${esc(b.title)}（${esc(STATUS[b.status] || b.status)}）`).join('；')}</div>` : ''}
        ${openDeps.length ? `<div class="warnbox">⚠️ 依赖还没完成：${openDeps.map((b) => esc(b.identifier)).join('、')}。现在派发，负责人很可能会卡住。</div>` : ''}
        ${pre >= 0 ? `<div class="warnbox md">${md(d.description.slice(pre, pre + 1200))}</div>` : ''}
        <details><summary class="note">看完整任务说明</summary><div class="fold md">${md(d.description)}</div></details>
        <label class="fl">交给</label><select id="dWho2">${agentOptions({ money: d.money, pick: agentId })}</select>
        ${d.money ? '<div class="note">资金类：只列出 GoSenior / DBEngineer。</div>' : ''}
        <div class="actions"><button class="btn gold" id="dAssign">${openDeps.length ? '依赖未完成，仍然派发' : '指派并开始'}</button></div>`
      const b = out.querySelector('#dAssign')
      b.onclick = async () => {
        if ((openDeps.length || pre >= 0) && !b.dataset.sure) { // 有依赖或开工前提时，先提示一次，再点才派发
          b.dataset.sure = '1'
          b.textContent = '确认派发'
          toast(openDeps.length ? `依赖 ${openDeps.map((x) => x.identifier).join('、')} 还没完成，确认要现在派发就再点一次` : '这张卡有「开工前必须满足」的条件，确认已满足再点一次', true)
          return
        }
        const who = out.querySelector('#dWho2').value
        if (await post({ type: 'assign', issueId, assigneeAgentId: who, force: openDeps.length > 0 })) done(`${d.identifier} 已交给 ${agentName(who)}`)
      }
    }
    show(tab)
  }

  // 归属项目标签：颜色按项目固定（同一个项目永远同一个颜色），到处都带上，项目多了也分得清
  const projName = (id) => ((state && state.projects) || []).find((x) => x.id === id)?.name || ''
  const projHue = (id) => { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
  const projTag = (id) => { const n = projName(id); return n ? `<span class="ptag" style="--ph:${projHue(id)}">${esc(n)}</span>` : '' }
  let todayCollapsed = (() => {
    if (innerWidth <= 900) return true
    try {
      const saved = localStorage.getItem('office3d.todayCollapsed')
      if (saved === '1') return true
      if (saved === '0') return false
    } catch {}
    return innerWidth <= 900
  })()
  const todayPanel = $('todayPanel')
  todayPanel.onclick = (event) => {
    if (!event.target.closest('.today-head')) return
    todayCollapsed = !todayCollapsed
    todayPanel.classList.toggle('collapsed', todayCollapsed)
    const toggle = todayPanel.querySelector('.today-toggle')
    if (toggle) toggle.textContent = todayCollapsed ? '展开' : '收起'
    try { localStorage.setItem('office3d.todayCollapsed', todayCollapsed ? '1' : '0') } catch {}
  }
  const safeCount = (value) => Number.isFinite(Number(value)) ? String(Math.max(0, Number(value))) : '–'
  const safePercent = (value) => Number.isFinite(Number(value)) ? `${Math.round(Math.max(0, Math.min(1, Number(value))) * 100)}%` : '–'
  function renderToday(today) {
    if (!today || typeof today !== 'object') {
      todayPanel.classList.toggle('collapsed', todayCollapsed)
      todayPanel.innerHTML = `<div class="today-head"><h2>日期 –</h2><span class="today-summary">进度 –</span><span class="today-duty">同步中</span><span class="today-toggle">${todayCollapsed ? '展开' : '收起'}</span></div>
        <div class="today-body"><div class="today-foot">等待服务同步今日数据；暂不显示统计。</div></div>`
      return
    }
    const d = today || {}
    const status = d.dayOff ? '今日休息' : d.onDuty ? '上班中' : '已下班'
    const statusClass = d.dayOff || !d.onDuty ? 'off' : 'on'
    const date = String(d.date || '')
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 ${esc(d.weekday || '')}` : '日期 –'
    const total = Number.isFinite(Number(d.total)) ? Math.max(0, Number(d.total)) : 0
    const projects = Array.isArray(d.byProject) ? d.byProject : []
    const projectRows = projects.slice(0, 6).map((p) => {
      const n = Number.isFinite(Number(p.total)) ? Math.max(0, Number(p.total)) : 0
      const done = Number.isFinite(Number(p.done)) ? Math.max(0, Number(p.done)) : 0
      const ratio = n ? Math.min(100, Math.round(done / n * 100)) : 0
      return `<div class="today-project" data-project-id="${esc(p.projectId || p.name || '')}"><span class="ptag" style="--ph:${projHue(p.projectId)}">${esc(p.name || '未归类')}</span><span class="today-project-count" title="该项目今日完成数 / 今日完成数加当前已派发未结束任务">${safeCount(done)} / ${safeCount(n)}</span><div class="today-project-bar"><i style="width:${ratio}%"></i></div></div>`
    }).join('')
    const extra = projects.length > 6 ? `<div class="today-foot">另有 ${safeCount(projects.length - 6)} 个项目</div>` : ''
    const since = d.since ? `；账本统计自 ${esc(String(d.since).slice(0, 10))}` : ''
    todayPanel.classList.toggle('collapsed', todayCollapsed)
    todayPanel.innerHTML = `<div class="today-head"><h2>${dateLabel}</h2><span class="today-summary" title="今日完成 / 全部任务">${safeCount(d.done)} / ${safeCount(d.total)} · ${safePercent(d.percent)}</span><span class="today-duty ${statusClass}">${status}</span><span class="today-toggle">${todayCollapsed ? '展开' : '收起'}</span></div>
      <div class="today-body">
        <div class="today-main"><b title="完成数 / 今日全部任务数">完成 ${safeCount(d.done)} / 全部 ${safeCount(d.total)}</b><span class="today-percent" title="完成数 ÷ 今日全部任务数">${safePercent(d.percent)}</span></div>
        <div class="today-bar"><i style="width:${safePercent(d.percent)}"></i></div>
        <div class="today-split"><span title="当前已派发、状态为进行中的任务">进行中 ${safeCount(d.open?.inProgress)}</span><span title="当前已派发、等待验收的任务">待验收 ${safeCount(d.open?.inReview)}</span><span title="当前已派发、被阻塞的任务">阻塞 ${safeCount(d.open?.blocked)}</span><span title="当前已派发、尚未开始的任务">待开始 ${safeCount(d.open?.todo)}</span></div>
        <div class="today-backlog" title="尚未派发的 backlog，不计入全部任务">待排期（未派发）${safeCount(d.backlog)} 个</div>
        <div class="today-stats" title="来自 Paperclip 今日战报：运行、评论和审批">运行 ${safeCount(d.runs?.total)} 次（成功 ${safeCount(d.runs?.succeeded)} · 失败 ${safeCount(d.runs?.failed)}） · 评论 ${safeCount(d.comments)} · 审批 批准 ${safeCount(d.decisions?.approved)} / 拒绝 ${safeCount(d.decisions?.rejected)}</div>
        ${projectRows ? `<div class="today-projects">${projectRows}</div>` : '<div class="today-foot">暂无项目任务</div>'}
        ${extra}
        <div class="today-foot">数据来自 Paperclip 实时记录；金边时间${since}</div>
      </div>`
  }
  function card(kind, head, title, meta, onClick, projectId, badge) {
    const k = KIND[kind]
    const el = document.createElement('div')
    el.className = `card ${kind}`
    el.innerHTML = `<div class="ic">${k.icon}</div><div class="t"><div class="k">${projTag(projectId)}${esc(head)}</div><div class="ti">${esc(title)}</div><div class="m">${esc(meta)}</div>${badge || ''}</div><div class="go">${k.go}</div>`
    el.onclick = onClick
    return el
  }

  const quest = $('quest')
  let questCollapsed = innerWidth <= 900
  quest.classList.toggle('collapsed', questCollapsed)
  $('questFold').textContent = questCollapsed ? '展开' : '收起'
  $('questHead').onclick = () => {
    questCollapsed = !questCollapsed
    quest.classList.toggle('collapsed', questCollapsed)
    $('questFold').textContent = questCollapsed ? '展开' : '收起'
  }
  $('todoChip').onclick = () => { questCollapsed = false; quest.classList.remove('collapsed'); $('questFold').textContent = '收起' }
  $('healthChip').onclick = () => openHealth()

  const HEALTH_LABEL = { quota: '额度', login: '登录失效', upstream: '上游抖动', worktree_lock: '工作树抢锁', environment: '环境', other: '其他' }
  function healthTime(value) {
    if (!value) return '未知'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false })
  }
  function updateHealth(level) {
    const item = level || { level: 'ok', text: '健康' }
    const chip = $('healthChip')
    chip.classList.toggle('warn', item.level === 'warn')
    chip.classList.toggle('bad', item.level === 'bad')
    $('healthText').textContent = item.text || '健康'
    $('healthDot').textContent = item.level === 'bad' ? '●' : item.level === 'warn' ? '▲' : '●'
  }
  async function openHealth() {
    open('<div class="note">健康数据读取中…</div>')
    try {
      const r = await fetch('/health')
      const h = await r.json()
      if (!r.ok) throw new Error(h.error || r.status)
      const incidents = (h.incidents || []).map((x) => `<div class="q ${x.category === 'worktree_lock' ? 'bad' : 'warn'}"><b>${esc(x.label || HEALTH_LABEL[x.category] || x.category)}</b><div>${esc(x.impact || '—')}</div><div class="note">恢复：${esc(x.recoveryText || '未知')} · ${esc(x.advice || '')}</div></div>`).join('') || '<div class="note">近 2 小时没有未恢复的额度、登录或工作树风险。</div>'
      const families = (h.families || []).map((x) => `<div class="row"><span>${esc(x.family)} · ${x.runs} 次</span><span>失败 ${x.failed}（${Math.round((x.failureRate || 0) * 100)}%）</span></div>`).join('') || '<div class="note">暂无运行记录</div>'
      const agents = (h.agents || []).filter((x) => x.failed || x.runs24h).map((x) => `<div class="row"><span>${esc(x.name)} · ${esc(x.family)}</span><span>${x.runs24h} 次，失败 ${x.failed}${x.lastFailure ? ` · ${esc(HEALTH_LABEL[x.lastFailure.category] || x.lastFailure.category)}` : ''}</span></div>`).join('') || '<div class="note">暂无同事运行记录</div>'
      const warning = h.nextStandup?.warning ? `<div class="warnbox">${esc(h.nextStandup.warningText || '可能影响晨会')}</div>` : ''
      open(`<h2>🩺 额度与运行健康</h2><div class="meta">${esc(h.text || '运行健康')} · 更新时间 ${esc(healthTime(h.at))} · 金边时间</div>${warning}<div class="sec">当前事件</div>${incidents}<div class="sec">模型家族 · 最近 24 小时</div>${families}<div class="sec">同事影响</div>${agents}<div class="note">下一次晨会：${esc(h.nextStandup?.label || '未知')}</div>`)
    } catch (e) { open(`<div class="note">读取失败：${esc(e.message)}</div>`) }
  }

  // ── 今日战报：全部是 Paperclip 里的真实统计（服务器记账，见 stats.mjs）──
  async function openDaily() {
    open('<div class="note">统计中…</div>')
    let d
    try {
      const r = await fetch('/daily')
      d = await r.json()
      if (!r.ok) throw new Error(d.error || r.status)
    } catch (e) { open(`<div class="note">读取失败：${esc(e.message)}</div>`); return }
    const who = (x) => (x ? `${agentName(x.agentId) || '—'}（${x.n}）` : '—')
    const doneList = d.done.length ? d.done.map((x) => `<div class="cm"><b>${esc(x.ident)}</b> ${esc(x.title)} <span class="note">· ${esc(agentName(x.agentId) || '董事会')}</span></div>`).join('') : '<div class="note">今天还没有完成的任务</div>'
    open(`<h2>📊 今日战报 · ${esc(d.date)}</h2>
      <div class="meta">金边时间；数据来自 Paperclip 的运行记录、活动流和已完成任务${d.since ? `（本地账本统计自 ${esc(String(d.since).slice(0, 10))}）` : ''}</div>
      <div class="daily">
        <div class="st"><b>${d.done.length}</b><span>完成的任务</span></div>
        <div class="st"><b>${d.runs.total}</b><span>次运行（成功 ${d.runs.succeeded} · 失败 ${d.runs.failed}）</span></div>
        <div class="st"><b>${d.comments}</b><span>条任务评论</span></div>
        <div class="st"><b>${d.decisions.approved + d.decisions.rejected}</b><span>项董事会审批（批准 ${d.decisions.approved}）</span></div>
      </div>
      <div class="sec">今日之最</div>
      <div class="row"><span>跑得最多</span><span>${esc(who(d.busiest))}</span></div>
      <div class="row"><span>完成最多</span><span>${esc(who(d.doer))}</span></div>
      <div class="row"><span>评论最多</span><span>${esc(who(d.talker))}</span></div>
      <div class="sec">今天完成的任务</div>${doneList}
      <div class="actions"><button class="btn gold" id="dSave">保存成图片</button></div>`)
    modal.querySelector('#dSave').onclick = () => saveDaily(d, who)
  }
  function saveDaily(d, who) {
    const c = document.createElement('canvas')
    const rows = Math.min(8, d.done.length)
    c.width = 900; c.height = 470 + rows * 34
    const g = c.getContext('2d')
    g.fillStyle = '#202326'; g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = '#b69a64'; g.lineWidth = 4; g.strokeRect(14, 14, c.width - 28, c.height - 28)
    g.fillStyle = '#e0c88f'; g.font = 'bold 40px sans-serif'; g.fillText(`智序工场 · 今日战报  ${d.date}`, 44, 80)
    const stat = [[d.done.length, '完成任务'], [d.runs.total, `运行（失败 ${d.runs.failed}）`], [d.comments, '任务评论'], [d.decisions.approved + d.decisions.rejected, '董事会审批']]
    stat.forEach(([n, l], i) => {
      const x = 44 + i * 210
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, 110, 190, 110)
      g.fillStyle = '#e0c88f'; g.font = 'bold 44px sans-serif'; g.fillText(String(n), x + 18, 170)
      g.fillStyle = '#a9adb3'; g.font = '18px sans-serif'; g.fillText(l, x + 18, 204)
    })
    g.fillStyle = '#f4f1eb'; g.font = '22px sans-serif'
    g.fillText(`跑得最多：${who(d.busiest)}    完成最多：${who(d.doer)}`, 44, 270)
    g.fillText(`评论最多：${who(d.talker)}`, 44, 306)
    g.fillStyle = '#e0c88f'; g.font = 'bold 22px sans-serif'; g.fillText('今天完成的任务', 44, 356)
    g.fillStyle = '#f4f1eb'; g.font = '19px sans-serif'
    d.done.slice(0, rows).forEach((x, i) => g.fillText(`${x.ident}  ${x.title}`.slice(0, 44), 44, 392 + i * 34))
    g.fillStyle = '#6f747b'; g.font = '15px sans-serif'; g.fillText('数据来自 Paperclip 真实记录（金边时间）', 44, c.height - 36)
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `战报-${d.date}.png`
    a.click()
  }
  $('daily').onclick = () => openDaily()

  // ── Telegram bot 接入向导 + 人员绑定：创建 bot 仍要在 BotFather 里做；令牌粘贴在这里，只经过本机服务器 ──
  const TG_HELP = { office: '办公室通知：待审批、待回答、待验收、回答没送到、运行出错，下班时发每日战报。', paperclip: 'Paperclip 通知：任务完成、派发、董事会决定。', support: '将来的客服 bot：现在只接入并配好名字，不收也不回任何客户消息，等客服角色和已审核问答准备好再启用。' }
  function openTelegram() {
    const tg = (state && state.telegram) || { bots: {}, people: [], cats: {}, catLabel: {} }
    const bots = tg.bots || {}, people = tg.people || [], CL = tg.catLabel || {}
    const pname = (id) => (people.find((x) => x.id === id) || {}).name || ''
    const connected = ['office', 'paperclip'].filter((p) => bots[p] && bots[p].connected)
    // 待确认的绑定申请（放最上面）
    const pend = connected.flatMap((p) => bots[p].pending.map((x) => ({ ...x, p })))
    const pendHtml = pend.length ? `<div class="warnbox"><b>有人申请绑定，请确认是不是本人：</b>${pend.map((x) => `<div class="row"><span>${esc(x.name)}${x.username ? ' (@' + esc(x.username) + ')' : ''} → <b>${esc(pname(x.personId))}</b> · ${esc(bots[x.p].label)}</span><span><button class="btn ok" data-ok="${x.p}:${x.chatId}" style="padding:3px 10px">确认</button> <button class="btn bad" data-no="${x.p}:${x.chatId}" style="padding:3px 10px">拒绝</button></span></div>`).join('')}</div>` : ''
    const botCard = (p) => {
      const b = bots[p] || { label: p, connected: false, chats: [], pending: [], links: {} }
      if (!b.connected) return `<div class="q"><div class="prompt">${esc(b.label)} <span class="note">· 未接入</span></div><div class="note" style="margin-bottom:8px">${esc(TG_HELP[p])}</div>
        <div class="note">① <a href="https://t.me/BotFather" target="_blank" rel="noopener" style="color:var(--gold2)">打开 BotFather</a> → 发 <b>/newbot</b> → 起一个显示名 → 起一个用户名（必须以 <b>bot</b> 结尾）→ 它会给你一串令牌。<br>② 把令牌粘贴到下面（只经过本机服务器，Claude 和 agent 都看不到）。</div>
        <input type="password" id="tk-${p}" class="one" autocomplete="off" spellcheck="false" placeholder="123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style="margin-top:8px">
        <label class="chk"><input type="checkbox" id="tko-${p}"> 如果这个 bot 已经被别的服务在用（设了 webhook），我确认接管：会清掉它的 webhook，并把它的名字、简介、命令菜单改成这里的设置</label>
        <div class="actions" style="margin-top:6px"><button class="btn gold" data-conn="${p}">验证并接入</button></div></div>`
      const sup = p === 'support'
      const chats = b.chats.map((c) => `<div class="row"><span>${esc(c.name)}${c.username ? ' (@' + esc(c.username) + ')' : ''}</span><span>${c.personId ? `<b>${esc(pname(c.personId))}</b>` : `<select data-assign="${p}:${c.id}" style="width:auto;height:30px"><option value="">未指定 → 归给…</option>${people.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>`} <button class="btn" data-unbind="${p}:${c.id}" style="padding:3px 10px">移除</button></span></div>`).join('')
      return `<div class="q"><div class="prompt">${esc(b.label)} <span class="note">· ✅ @${esc(b.username)} · ${sup ? '停用中（客服角色上线前不启用）' : b.enabled ? '运行中' : '已停用'} · 令牌保存在${esc(b.storedIn || '—')}</span></div>
        <div class="note" style="margin-bottom:6px">${esc(TG_HELP[p])}</div>
        ${sup ? '' : `<div class="note">已绑定的账号：</div>${chats || '<div class="note" style="margin:4px 0">还没有。到下面「人员」里给某个人生成绑定链接。</div>'}
        <div class="actions" style="margin-top:6px"><button class="btn" data-test="${p}">发测试消息</button>${p === 'office' ? '<button class="btn" data-resend="1">重发当前待处理通知</button>' : ''}<button class="btn" data-onoff="${p}:${b.enabled ? 0 : 1}">${b.enabled ? '停用' : '启用'}</button><button class="btn bad" data-rm="${p}">解除接入</button></div>`}
        ${sup ? `<div class="actions"><button class="btn bad" data-rm="${p}">解除接入</button></div>` : ''}</div>`
    }
    const personRow = (pe) => {
      const slots = connected.map((p) => {
        const b = bots[p], c = b.chats.find((x) => x.personId === pe.id), link = b.links[pe.id]
        return `<div class="row"><span>${esc(b.label)}</span><span>${c ? `✅ ${esc(c.name)} ` : '未绑定 '}${link ? `<a href="${esc(link)}" target="_blank" rel="noopener" style="color:var(--gold2)">打开链接（15 分钟，用一次）</a> ` : ''}<button class="btn" data-bind="${p}:${esc(pe.id)}" style="padding:3px 10px">${link ? '重新生成链接' : c ? '换账号：生成新链接' : '生成绑定链接'}</button></span></div>`
      }).join('')
      const cats = connected.flatMap((p) => tg.cats[p] || []).map((c) => `<label style="display:inline-flex;gap:4px;align-items:center;margin:2px 10px 2px 0;font-size:12px"><input type="checkbox" data-notify="${esc(pe.id)}:${c}" ${pe.notify[c] ? 'checked' : ''}>${esc(CL[c] || c)}</label>`).join('')
      return `<div class="q"><div class="prompt">${esc(pe.name)} <span class="note">· ${esc(pe.role)}${pe.board ? '' : ''}</span>${pe.board ? '' : ` <button class="btn bad" data-pdel="${esc(pe.id)}" style="padding:2px 10px;float:right">删除</button>`}</div>
        ${slots || '<div class="note">先接入至少一个通知 bot。</div>'}
        ${cats ? `<div class="note" style="margin-top:6px">要收哪些通知：</div><div>${cats}</div>` : ''}
        <div class="note" style="margin-top:6px">静音（金边时间；静音期间不推，结束时补一条汇总）：<input type="time" data-qf="${esc(pe.id)}" value="${pe.quiet ? pe.quiet.from : '22:00'}" style="width:auto"> – <input type="time" data-qt="${esc(pe.id)}" value="${pe.quiet ? pe.quiet.to : '07:00'}" style="width:auto"> <button class="btn" data-qsave="${esc(pe.id)}" style="padding:3px 10px">${pe.quiet ? '更新' : '开启静音'}</button>${pe.quiet ? ` <button class="btn" data-qclear="${esc(pe.id)}" style="padding:3px 10px">关闭静音</button>` : ''}</div>
        ${pe.board ? `<div class="note" style="margin-top:6px">快捷操作：<b>${pe.quick ? '已开启' : '关闭'}</b> <button class="btn ${pe.quick ? '' : 'gold'}" data-quick="${esc(pe.id)}:${pe.quick ? 0 : 1}" style="padding:3px 10px">${pe.quick ? '关闭' : '开启…'}</button>　<span>开启后，这个人在 Telegram 里的通知会带按钮：「已读」「叫醒任务」「验收非资金类任务（要二次确认）」。审批、回答问题、取消任务、资金类任务一律不能经 Telegram。</span></div>` : ''}</div>`
    }
    open(`<h2>📨 Telegram bot 与人员绑定</h2><div class="meta">创建 bot 只能在 BotFather 里做；其余——验证、改名字和命令菜单、绑定到具体的人、测试、停用——都在这里。</div>
      ${pendHtml}
      <div class="sec">Bot（一个 bot 一个用途）</div>${['office', 'paperclip', 'support'].map(botCard).join('')}
      <div class="sec">人员（给每个人绑定他自己的 Telegram 账号）</div>
      <div class="note" style="margin-bottom:6px">做法：给某个人点「生成绑定链接」→ 把链接发给他本人 → 他在手机上打开并点 Start → 这里会弹出「有人申请绑定」，你确认是本人再点「确认」。链接 15 分钟有效、只能用一次。</div>
      ${people.map(personRow).join('')}
      <div class="q"><div class="prompt">新增人员</div><div class="row2" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px"><input type="text" id="pnName" class="one" placeholder="名字" maxlength="20"><input type="text" id="pnRole" class="one" placeholder="角色（如 人工客服、设计师）" maxlength="20"><button class="btn gold" id="pnAdd">添加</button></div></div>
      <div class="note">令牌保存：办公室 / Paperclip 通知 bot 的令牌用 Windows 账户加密存在本机（只有当前 Windows 账户能解开，不进 Git、不写日志）；客服 bot 的令牌只存进 Paperclip 密钥库。Telegram 里的每次快捷操作都写审计记录（本目录 telegram-audit.log），并在 Paperclip 评论里注明是谁经 Telegram 做的。</div>`)
    const again = async () => { await refresh(); openTelegram() }
    const on = (sel, fn) => modal.querySelectorAll(sel).forEach((el) => fn(el))
    on('[data-conn]', (b) => (b.onclick = async () => {
      const p = b.dataset.conn, input = modal.querySelector('#tk-' + p)
      const token = input.value.trim()
      if (!token) { toast('请先粘贴令牌', false); return }
      b.disabled = true; b.textContent = '验证中…'
      const ok = await post({ type: 'tg_connect', purpose: p, token, takeover: modal.querySelector('#tko-' + p).checked })
      input.value = ''
      if (ok) { const w = (lastResult && lastResult.warns) || []; toast(`已接入 @${(lastResult && lastResult.username) || ''}${w.length ? '（部分设置没成功：' + w.join('；') + '）' : ''}`, !w.length); await again() } else { b.disabled = false; b.textContent = '验证并接入' }
    }))
    on('[data-bind]', (b) => (b.onclick = async () => { const [p, id] = b.dataset.bind.split(':'); if (await post({ type: 'tg_bind', purpose: p, personId: id })) await again() }))
    on('[data-ok]', (b) => (b.onclick = async () => { const [p, id] = b.dataset.ok.split(':'); if (await post({ type: 'tg_confirm', purpose: p, chatId: Number(id), accept: true })) { toast('已确认绑定'); await again() } }))
    on('[data-no]', (b) => (b.onclick = async () => { const [p, id] = b.dataset.no.split(':'); if (await post({ type: 'tg_confirm', purpose: p, chatId: Number(id), accept: false })) await again() }))
    on('[data-assign]', (s) => (s.onchange = async () => { if (!s.value) return; const [p, id] = s.dataset.assign.split(':'); if (await post({ type: 'tg_assign', purpose: p, chatId: Number(id), personId: s.value })) await again() }))
    on('[data-unbind]', (b) => (b.onclick = async () => { const [p, id] = b.dataset.unbind.split(':'); if (await post({ type: 'tg_unbind', purpose: p, chatId: Number(id) })) await again() }))
    on('[data-resend]', (b) => (b.onclick = async () => { if (await post({ type: 'tg_resend' })) toast('几秒钟后，手机上会收到当前所有待处理的通知（新格式）') }))
    on('[data-test]', (b) => (b.onclick = async () => { if (await post({ type: 'tg_test', purpose: b.dataset.test })) toast('测试消息已发出，看看手机') }))
    on('[data-onoff]', (b) => (b.onclick = async () => { const [p, v] = b.dataset.onoff.split(':'); if (await post({ type: 'tg_enable', purpose: p, on: v === '1' })) await again() }))
    on('[data-rm]', (b) => (b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '确认解除'; toast('解除后绑定和本机保存的令牌都会删除，确认再点一次。', true); return }
      if (await post({ type: 'tg_remove', purpose: b.dataset.rm })) await again()
    }))
    on('[data-notify]', (c) => (c.onchange = async () => { const [id, cat] = c.dataset.notify.split(':'); if (!(await post({ type: 'tg_person_set', id, notify: { [cat]: c.checked } }))) c.checked = !c.checked }))
    on('[data-qsave]', (b) => (b.onclick = async () => { const id = b.dataset.qsave; if (await post({ type: 'tg_person_set', id, quiet: { from: modal.querySelector(`[data-qf="${id}"]`).value, to: modal.querySelector(`[data-qt="${id}"]`).value } })) { toast('静音时段已保存'); await again() } }))
    on('[data-qclear]', (b) => (b.onclick = async () => { if (await post({ type: 'tg_person_set', id: b.dataset.qclear, quiet: null })) await again() }))
    on('[data-quick]', (b) => (b.onclick = async () => {
      const [id, v] = b.dataset.quick.split(':')
      if (v === '1' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '确认开启'; toast(`开启后，${pname(id)} 在 Telegram 里可以「已读」「叫醒任务」「验收非资金类任务」。手机丢失或 Telegram 账号被盗时，别人也能做这三件事。确认要开就再点一次。`, true); return }
      if (await post({ type: 'tg_person_set', id, quick: v === '1' })) await again()
    }))
    on('[data-pdel]', (b) => (b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '确认删除'; toast('删除后他的绑定一并取消，确认再点一次。', true); return }
      if (await post({ type: 'tg_person_del', id: b.dataset.pdel })) await again()
    }))
    modal.querySelector('#pnAdd').onclick = async () => {
      const name = modal.querySelector('#pnName').value.trim(), role = modal.querySelector('#pnRole').value.trim()
      if (!name) { toast('请填名字', false); return }
      if (await post({ type: 'tg_person_add', name, role })) await again()
    }
  }
  $('tgBtn').onclick = () => { if (state) openTelegram() }

  // ── 内容审批委员会：成员、待审内容、各批次的投票和结果；可以立即开票、撤销已通过的决议 ──
  const VOTE_CN = { APPROVE: '通过', CHANGES: '要修改', ESCALATE: '升级', MISSING: '缺票' }
  const OUT_CN = { PASS: '✅ 通过（已标为已审核）', CONFIRM: '🛡️ 红线内容：委员会建议通过，等你确认', ESCALATE: '⚠️ 有委员升级：等你决定', CHANGES: '✏️ 要修改（已退回作者）' }
  const FINAL_CN = { verified: '已审核', changes: '已退回修改', 'rejected-by-board': '董事会未通过', revoked: '已撤销' }
  function openCommittee() {
    const c = (state && state.committee) || { members: [], pending: [], batches: [] }
    const bp = state && state.blockedPatrol
    const bt = (at) => at && Number.isFinite(new Date(at).getTime()) ? new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '–'
    const stages = { remind: '提醒', voting: '委员会投票中', committee: '委员会已处理', awaiting: '待董事会审批', board: '待业务决定', human: '交还人工' }
    const blocked = bp ? `<div style="overflow-wrap:anywhere"><div class="note">${esc(bp.enabled ? '总开关：开启' : '总开关：关闭（不做任何写操作）')} · 上次 ${esc(bt(bp.lastAt))}<br>下次 ${esc(bt(bp.nextAt))} · 批次 ${esc(bp.batch ? bp.batch.state : '–')}</div>
      <div class="note">${esc(Object.entries(bp.counts || {}).map(([s, n]) => `${stages[s] || s} ${n}`).join(' · '))}</div>
      ${(bp.tasks || []).map((x) => `<div class="q"><b>${esc(x.ident)}</b> ${esc(x.title)}<br><span class="note">${esc(x.owner)} · ${esc(x.type)} · ${esc(stages[x.stage] || x.stage)} · 已等 ${esc(x.since && Number.isFinite(Date.parse(x.since)) ? ago(Date.now() - Date.parse(x.since)) : '–')}</span></div>`).join('') || '<div class="note">尚无巡检记录。</div>'}
      ${(bp.records || []).map((x) => `<div class="note">${esc(bt(x.at))} · ${esc(x.ident)} · ${esc(x.action)}</div>`).join('')}</div>` : '<div class="note">服务尚未加载阻塞巡检，请由管理员重启现有服务。</div>'
    const sd = state && state.standup
    const ST = { proposing: 'Lead 提议中', voting: '委员投票中（在评审室）', awaiting: '有项目等你批准', done: '已完成', void: '已作废' }
    const OUT = { DISPATCHED: '✅ 已派发', BOARD: '🛎️ 等你批准', NOT_TODAY: '今天不做', SKIPPED: '没派（人手 / 状态）', FULL: '没派（名额满）', REJECTED: '你没批准' }
    const stand = sd
      ? `<div class="q"><div class="prompt">晨会 ${esc(sd.id)} <span class="note">· ${esc(ST[sd.state] || sd.state)}${sd.note ? '：' + esc(sd.note) : ''}</span></div>${(sd.candidates || []).map((x) => `<div class="row" style="align-items:flex-start"><span><b>${esc(x.ident)}</b> ${esc(x.title)}${x.money ? ' <span class="note">🛡️资金类</span>' : ''}<br><span class="note">${esc(x.assignee)} · ${esc(x.why)}</span></span><span class="note">${esc(OUT[x.outcome] || (x.tally ? '' : '待投票'))}${x.tally ? '<br>' + x.tally.approve + '通过/' + x.tally.changes + '不做/' + x.tally.escalate + '升级' : ''}</span></div>`).join('') || '<div class="note">还没有候选。</div>'}</div>`
      : '<div class="note">今天还没开晨会。</div>'
    const ac = state && state.acceptance
    const AO = { ACCEPTED: '✅ 已验收通过', CHANGES: '↩️ 已退回修改', BOARD: '🛎️ 留给你', SKIP: '已被处理' }
    const AS = { voting: '委员投票中（在评审室）', done: '已统计', void: '已作废' }
    const accept = ac
      ? `<div class="q"><div class="prompt">批次 ${esc(ac.id)} <span class="note">· ${esc(AS[ac.state] || ac.state)}${ac.note ? '：' + esc(ac.note) : ''}</span></div>${ac.items.map((x) => `<div class="row" style="align-items:flex-start"><span><b>${esc(x.ident)}</b> ${esc(x.title)}<br><span class="note">负责人 ${esc(x.owner)}${x.note ? ' · ' + esc(x.note) : ''}</span></span><span class="note">${esc(AO[x.outcome] || '待投票')}${x.tally ? '<br>' + x.tally.approve + '通过/' + x.tally.changes + '修改/' + x.tally.escalate + '升级' : ''}</span></div>`).join('')}</div>`
      : '<div class="note">还没有发生过超时验收投票。</div>'
    const members = c.members.map((m) => `<span class="ptag" style="--ph:${projHue(m.name)}">${esc(m.name)}</span><span class="note">${esc(m.angle)}　</span>`).join('')
    const pend = c.pending.length ? c.pending.map((p) => `<div class="row"><span>${esc(p.title)} <span class="note">${esc(p.path)}</span></span><span class="note">${p.redline ? '🛡️ 红线：' + esc(p.redlineWhy) : '普通'} · 作者 ${esc(p.author)}</span></div>`).join('') : '<div class="note">现在没有待审内容。文章头部写 <b>submit: committee</b>（且 status: draft）就会进入下一批。</div>'
    const batches = c.batches.map((b) => `<div class="q"><div class="prompt">批次 ${esc(b.id)} <span class="note">· ${b.state === 'done' ? '已结束' : b.tallyReason ? '已统计，等你确认' : '投票中'}${b.tallyReason ? '（' + esc(b.tallyReason) + '）' : ''} · 投票任务：${b.votes.map((v) => esc(v.name) + (v.status === 'done' ? '✔' : '…')).join(' ')}</span></div>
      ${b.items.map((i) => `<div class="row" style="align-items:flex-start"><span><b>${esc(i.title)}</b>${i.redline ? ' <span class="note">🛡️红线</span>' : ''}<br><span class="note">${i.voters.map((n) => esc(n) + '=' + esc(VOTE_CN[i.votes[n] || 'MISSING'] || i.votes[n])).join(' · ')}</span></span><span style="text-align:right">${esc(i.outcome ? OUT_CN[i.outcome] : '投票中')}${i.tally ? `<br><span class="note">${i.tally.approve} 通过 / ${i.tally.changes} 修改 / ${i.tally.escalate} 升级 / ${i.tally.missing} 缺票</span>` : ''}${i.final ? `<br><span class="note">${esc(FINAL_CN[i.final] || i.final)}</span>` : ''}${i.followUp ? `<br><span class="note">修改任务 ${esc(i.followUp)}</span>` : ''}${i.final === 'verified' ? `<br><button class="btn bad" data-revoke="${esc(i.path)}" style="padding:2px 10px;margin-top:4px">撤销审核</button>` : ''}</span></div>`).join('')}</div>`).join('') || '<div class="note">还没有开过票。</div>'
    open(`<h2>⚖️ 内容审批委员会</h2><div class="actions"><button class="btn" id="govHistory">查看历史 →</button></div><div class="meta">管对外内容（客服问答、对外文章、三语文案、通知模板）能不能「用」；通过 = 知识库里标为已审核，<b>发布仍走原审批</b>。规则：每项 5 票里至少 3 票通过且没人「升级」才通过；任何一票升级转给你；红线内容（价格定价、法律条款和隐私政策、赔付退款承诺、资金账务的对外说明、个人信息）委员会先投票，你最后确认。每个工作日 11:00 开票、16:00 统计。</div>
      <div class="sec">委员（5 票）</div><div>${members}</div><div class="note" style="margin-top:4px">作者回避，由 ${esc(c.backup || '')} 顶替；秘书 ${esc(c.secretary || '')} 不投票。</div>
      <div class="sec">今日晨会（8:35：Lead 提议 → 委员投票 → 通过的才派发）</div>${stand}
      <div class="actions"><button class="btn" id="sdOpen">现在开晨会</button></div>
      <div class="sec">超时验收（待验收超过 1 小时没人处理 → 委员投票；资金类只能你验收）</div>${accept}
      <div class="actions"><button class="btn" id="acOpen">现在就投票（不等 1 小时）</button></div>
      <div class="sec">阻塞巡检（每3小时；连续两轮提醒无效才进委员会）</div>${blocked}
      <div class="actions"><button class="btn" id="blockedRun" ${!bp || !bp.enabled ? 'disabled' : ''}>现在巡检一次</button></div>
      <div class="sec">待审内容（下一批）</div>${pend}
      <div class="actions"><button class="btn gold" id="cmOpen">现在就开票（不等 11:00）</button></div>
      <div class="sec">最近的批次</div>${batches}`)
    const again = async () => { await refresh(); openCommittee() }
    modal.querySelector('#blockedRun').onclick = async () => { if (await post({ type: 'blocked_run' })) { toast(lastResult?.reason || `巡检完成，处理 ${lastResult?.processed ?? 0} 项`); await again() } }
    modal.querySelector('#govHistory').onclick = () => openGovernance()
    modal.querySelector('#acOpen').onclick = async () => { if (await post({ type: 'acceptance_open' })) { const r = lastResult || {}; toast(r.opened ? `验收投票开始：${r.items} 项` : r.reason || '没有开成'); await again() } }
    modal.querySelector('#sdOpen').onclick = async () => { if (await post({ type: 'standup_open' })) { const r = lastResult || {}; toast(r.opened ? `晨会 ${r.id} 开始了，Lead 正在提议` : r.reason || '没有开成'); await again() } }
    modal.querySelector('#cmOpen').onclick = async () => { if (await post({ type: 'committee_open' })) { const r = lastResult || {}; toast(r.opened ? `已开票：批次 ${r.batch}，${r.items} 项` : r.reason || '没有待审内容', !!r.opened); await again() } }
    modal.querySelectorAll('[data-revoke]').forEach((b) => (b.onclick = async () => {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '确认撤销'; toast('撤销后这篇改回草稿（不能再给客服用），确认再点一次。', true); return }
      if (await post({ type: 'committee_revoke', path: b.dataset.revoke })) { toast('已撤销，改回草稿'); await again() }
    }))
  }
  $('cmBtn').onclick = () => { if (state) openCommittee() }

  async function openGovernance() {
    open('<div class="note">读取治理历史…</div>')
    try {
      const r = await fetch('/governance?days=30')
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || r.status)
      let scheduler = schedulerCache.data
      let category = 'all', outcome = 'all', page = 0, expanded = null
      const kindLabel = { standup: '晨会', content: '内容审批', acceptance: '超时验收' }
      const render = () => {
        const events = (data.timeline || []).filter((x) => (category === 'all' || x.kind === category) && (outcome === 'all' || x.outcome === outcome))
        const pageCount = Math.max(1, Math.ceil(events.length / 20)); page = Math.min(page, pageCount - 1)
        const shown = events.slice(page * 20, page * 20 + 20)
        const cards = [['批次', data.summary?.total || 0], ['作废', data.summary?.void || 0], ['平均统计耗时', `${data.summary?.averageMinutes || 0} 分钟`]].map(([a, b]) => `<div class="st"><b>${esc(b)}</b><span>${esc(a)}</span></div>`).join('')
        const members = (data.members || []).slice().sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active))).map((m) => { const cls = m.missingRate > .4 ? 'bad' : m.missingRate > .2 ? 'warn' : ''; const bar = (n) => `<div class="gov-meter"><i style="width:${Math.round(Math.min(1, n || 0) * 100)}%"></i></div>`; const missingRate = m.votes ? `${Math.round(m.missingRate * 100)}%` : '–'; return `<div class="gov-member ${cls}" title="缺票多半是没额度或没有按格式投票"><b>${esc(m.name)} <span class="note">${esc(m.status || (m.active ? '现任' : '已卸任'))}</span></b><span>通过 ${m.approve}${bar(m.votes ? m.approve / m.votes : 0)}</span><span>修改 ${m.changes}${bar(m.votes ? m.changes / m.votes : 0)}</span><span>升级 ${m.escalate}${bar(m.escalateRate)}</span><span>缺票 ${m.missing}（${missingRate}）${bar(m.missingRate)}</span></div>` }).join('') || '<div class="note">暂无委员统计</div>'
        const rows = shown.map((e) => { const open = expanded === e.id; const details = open ? `<div class="gov-detail">${(e.items || []).map((i) => `<div><b>${esc(i.title)}</b> · ${esc(i.result)}<br>${(i.votes || []).map((v) => `<span class="note">${esc(v.name)}=${esc(v.v)}${v.why ? `（${esc(v.why)}）` : ''}</span>`).join(' · ')}</div>`).join('<hr>') || '<span class="note">没有明细</span>'}</div>` : ''; const kind = kindLabel[e.kind] || e.kind; const title = String(e.title || '').replace(new RegExp(`^${kind}(?:\\s*[·：:]|\\s+)\\s*`), ''); const when = e.at ? new Date(e.at).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '时间未知'; return `<div class="row gov-event" data-gov-id="${esc(e.id)}"><span><b>${esc(kind)}</b> · ${esc(title)} <span class="note">· ${esc(e.outcome)} · ${esc(when)}</span></span></div>${details}` }).join('') || '<div class="note">这段时间没有治理批次。</div>'
        open(`<h2>🏛 治理中心</h2><div class="meta">晨会、内容审批、超时验收的只读历史与委员统计；金边时间</div><div class="daily">${cards}</div><div class="tabs"><button class="tab ${category === 'all' ? 'on' : ''}" data-gov-cat="all">全部</button><button class="tab ${category === 'standup' ? 'on' : ''}" data-gov-cat="standup">晨会</button><button class="tab ${category === 'content' ? 'on' : ''}" data-gov-cat="content">内容审批</button><button class="tab ${category === 'acceptance' ? 'on' : ''}" data-gov-cat="acceptance">超时验收</button><select id="govOutcome" style="max-width:150px"><option value="all">全部结果</option><option value="PASS">通过</option><option value="CHANGES">要修改</option><option value="ESCALATE">升级</option><option value="VOID">作废</option></select></div><div class="sec">委员 × 票型</div><div class="gov-members">${members}</div><div class="sec">时间线（${events.length} 批）</div>${rows}<div class="actions"><button class="btn" id="govPrev" ${page <= 0 ? 'disabled' : ''}>上一页</button><span class="note">第 ${page + 1} / ${pageCount} 页</span><button class="btn" id="govNext" ${page >= pageCount - 1 ? 'disabled' : ''}>下一页</button></div>`)
        const section = document.createElement('details')
        if (canShowHomeEntry({ fullAccess: Boolean(state?.actToken), lan: Boolean(state?.lan), wall: new URLSearchParams(location.search).has('wall') })) {
          const commandEntry = document.createElement('button')
          commandEntry.id = 'commandEntry'; commandEntry.type = 'button'; commandEntry.className = 'btn'; commandEntry.textContent = '指挥视图'
          commandEntry.setAttribute('aria-label', '在新页面打开指挥视图')
          commandEntry.onclick = () => { if (canShowHomeEntry({ fullAccess: Boolean(state?.actToken), lan: Boolean(state?.lan), wall: new URLSearchParams(location.search).has('wall') })) window.open('/command-view.html', '_blank', 'noopener') }
          modal.querySelector('h2').after(commandEntry)
        }
        section.id = 'schedulerSection'
        section.innerHTML = '<summary class="sec" style="cursor:pointer">调度建议（只读）</summary><div class="note" data-scheduler-body>展开后读取；页面隐藏时不会请求。</div>'
        modal.querySelector('.daily').after(section)
        const renderScheduler = () => {
          if (!scheduler) return
          const counts = Object.entries((scheduler.skipped || []).flatMap((item) => item.reasonCodes || []).reduce((m, code) => ({ ...m, [code]: (m[code] || 0) + 1 }), {})).map(([code, count]) => `${esc(code)} × ${esc(count)}`).join('、') || '无'
          const names = (scheduler.pendingAssignments || []).slice(0, 3).map((item) => `<span class="ptag">${esc(item.identifier)} · 建议负责人 ${(item.suggestedAgentIds || []).map((id) => esc(agentName(id) || id)).join('、') || '暂无'} · ${(item.reasonCodes || []).map(esc).join('、') || '可评估'}</span>`).join(' ') || '暂无待分配建议'
          section.querySelector('[data-scheduler-body]').innerHTML = `<p class="note">仅供董事会参考，系统不会自动分配。数据年龄：${esc(scheduler.dataAgeMs ?? '–')} ms${scheduler.cached ? ' · 缓存命中' : ''}</p>${scheduler.idleReason ? `<p class="note">当前没有可立即执行建议：${esc(scheduler.idleReason)}</p>` : ''}<p><b>可立即执行（已分配）</b><br>${(scheduler.picks || []).slice(0, 3).map((item) => `<span class="ptag">${esc(item.identifier)} · ${(item.reasonsForPick || []).map(esc).join('、') || '通过校验'}</span>`).join(' ') || '暂无建议'}</p><p><b>待分配（建议负责人）</b><br>${names}</p><p class="note">被跳过原因：${counts}</p>`
          section.querySelector('summary').innerHTML = `调度建议（只读） <span class="note">· 规则版本 ${esc(scheduler.ruleVersion || '–')}</span>`
        }
        section.ontoggle = async () => {
          if (!section.open || document.hidden || Date.now() - schedulerCache.at < 60 * 1000) return
          section.querySelector('[data-scheduler-body]').textContent = '读取调度建议…'
          try {
            const sr = await fetch('/scheduler/suggest', { cache: 'no-store' })
            if (!sr.ok) throw new Error(sr.status)
            scheduler = await sr.json()
            schedulerCache = { at: Date.now(), data: scheduler }
            renderScheduler()
          } catch { section.querySelector('[data-scheduler-body]').textContent = '调度建议暂不可用' }
        }
        if (scheduler) renderScheduler()
        const workloadSection = document.createElement('details')
        workloadSection.id = 'workloadSection'
        workloadSection.innerHTML = '<summary class="sec" style="cursor:pointer">编制与工作量</summary><div id="workloadPanel" style="min-width:0;overflow-wrap:anywhere"></div>'
        modal.querySelector('.daily').after(workloadSection)
        workloadSection.ontoggle = () => { if (workloadSection.open && !workloadSection.dataset.loaded) { workloadSection.dataset.loaded = '1'; loadWorkload() } }
        // 「返工」分区（T13）：超限（红）置顶、预警（黄）、格式不全 / 同项重复（灰）；点任务编号沿用现有跳转；局域网只读时「立即扫描」置灰
        const rwt = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '–'
        const rwStay = (t) => { const at = Date.parse(t.since || t.parsedAt || ''); return at && Number.isFinite(at) ? ago(Date.now() - at) : '–' }
        const rwNotified = (t) => t.sentAt ? '已通知' : (t.notifiedAt ? '已通知（资金）' : '未通知')
        const reworkSection = document.createElement('details')
        reworkSection.id = 'reworkSection'
        const rwHead = data.rework || {}
        reworkSection.innerHTML = `<summary class="sec" style="cursor:pointer">返工 <span class="note">· 超限 ${esc(rwHead.cappedCount ?? 0)} · 预警 ${esc(rwHead.warnCount ?? 0)} · ${rwHead.corrupt ? '配置文件损坏，已按关闭处理' : esc(rwHead.enabled ? '已开启' : '总开关关闭')}</span></summary><div id="reworkPanel" style="min-width:0;overflow-wrap:anywhere"></div>`
        workloadSection.after(reworkSection)
        const renderRework = () => {
          const panel = $('reworkPanel')
          if (!panel) return
          const rw = data.rework || {}
          const groups = [['capped', rw.capped, '超限', 'color:#ff9d9d', 'rgba(255,60,60,.14)', 'rgba(255,90,90,.4)'], ['warned', rw.warned, '预警', 'color:#ffd27e', 'rgba(255,176,32,.1)', 'rgba(255,176,32,.35)'], ['info', rw.info, '格式 / 重复', '', 'rgba(255,255,255,.04)', 'var(--line)']]
          const rrows = groups.flatMap(([g, list, gLabel, fg, bg, bd]) => (list || []).map((t) => ({ g, t, gLabel, fg, bg, bd })))
          panel.innerHTML = `<p class="note">阈值：${esc(rw.thresholds?.capRound ?? 3)} 轮超限 · ${esc(rw.thresholds?.warnRound ?? 2)} 轮预警 · 同一 R 项 ${esc(rw.thresholds?.repeatItemRounds ?? 2)} 轮复验未通过算重复 · 每轮最多扫描 ${esc(rw.thresholds?.maxPerScan ?? 6)} 个任务 · 上次 ${esc(rwt(rw.lastAt))} · 下次 ${esc(rwt(rw.nextAt))}</p>
            <div class="actions"><button class="btn" id="rwScan" ${state?.lan ? 'disabled' : ''} ${state?.lan ? 'title="局域网只读"' : ''}>立即扫描</button></div><div class="note">「立即扫描」= 手动跑一次巡检，只在超限时发一条巡检评论并通知董事会一次；其余情况只在这里显示，不打扰任务负责人。</div>
            ${rrows.length ? rrows.map(({ g, t, gLabel, fg, bg, bd }) => {
              const fmt = [t.repeatedItems && t.repeatedItems.length ? '重复未通过：' + t.repeatedItems.join('、') : '', (t.formatIssues || []).slice(0, 3).join('、')].filter(Boolean).join('；')
              const line = [`第 ${t.rounds || '?'} 轮`, `未关 R 项 ${t.openItems ?? 0}`, `已等 ${rwStay(t)}`, rwNotified(t), t.money ? '🛡️资金类' : '', fmt ? '格式问题：' + fmt : ''].filter(Boolean).join(' · ')
              return `<div class="q" style="padding:8px 10px;margin-bottom:6px;background:${bg};border:1px solid ${bd}"><button class="btn" style="padding:0;border:0;background:none;color:var(--gold2);font-weight:700" data-rw-issue="${esc(t.issueId || t.ident)}">${esc(t.ident || t.issueId)}</button> ${esc(t.title)}<br><span class="note" style="${fg}">${esc(gLabel)} · ${esc(line)}</span>${g === 'capped' ? '<br><span class="note" style="color:#ff9d9d">按流程应先由 Lead 与董事会决定；决定前请不要再自行提交验收。</span>' : ''}</div>`
            }).join('') : '<div class="note">暂无返工记录（评论里出现过「退回」才会被识别）。</div>'}`
          const scan = $('rwScan')
          if (scan) scan.onclick = async () => { if (await post({ type: 'rework_run' })) { toast(lastResult?.reason || `巡检完成，处理 ${lastResult?.processed ?? 0} 项`); await refresh(); openGovernance() } }
          modal.querySelectorAll('[data-rw-issue]').forEach((b) => (b.onclick = () => openIssue(b.dataset.rwIssue, 'view')))
        }
        renderRework()
        // 「版本核对」分区（T15）：近期待验收任务的核对结果列表（编号、标题、结果、证据评论时间）；只读，数据来自 /governance 的 version 段
        const versionSection = document.createElement('details')
        versionSection.id = 'versionSection'
        const versionHead = data.version || {}
        versionSection.innerHTML = `<summary class="sec" style="cursor:pointer">版本核对 <span class="note">· ${versionHead.corrupt ? '配置文件损坏，已按关闭处理' : esc(versionHead.enabled ? '已开启' : '总开关关闭')} · 已核对 ${esc((versionHead.recent || []).length)} 项</span></summary><div id="versionPanel" style="min-width:0;overflow-wrap:anywhere"></div>`
        reworkSection.after(versionSection)
        const renderVersion = () => {
          const panel = $('versionPanel')
          if (!panel) return
          const rv = data.version || {}
          const list = rv.recent || []
          panel.innerHTML = list.length
            ? list.map((v) => { const when = v.evAt ? new Date(v.evAt).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '证据评论时间未知'; return `<div class="q" style="padding:8px 10px;margin-bottom:6px"><button class="btn" style="padding:0;border:0;background:none;color:var(--gold2);font-weight:700" data-ver-issue="${esc(v.issueId || v.ident)}">${esc(v.ident || v.issueId)}</button> ${esc(v.title)}<br><span class="note">${esc(v.result)}${v.note ? `（${esc(v.note)}）` : ''} · ${esc(when)}</span></div>` }).join('')
            : `<div class="note">${rv.enabled ? '还没有版本核对记录（查某张待验收卡片或超时验收组装批次时会核对，并在这里留痕）。' : '总开关关闭（evidence-version.json 的 enabled:false）：不算版本、页面不显示徽标、超时验收的版本过滤也不生效。'}</div>`
          modal.querySelectorAll('[data-ver-issue]').forEach((b) => (b.onclick = () => openIssue(b.dataset.verIssue, 'view')))
        }
        renderVersion()
        // 「交接」分区（T14）：缺交接包任务置顶（按触发后经过的时间排）。每行编号、标题、负责人、触发类型与时间、经过多久、缺哪些字段、是否已提醒；
        // 已转交显示转交时间；可能过期灰标；局域网只读时「立即扫描」置灰。数据来自 /governance 的 handoff 段（createHandoff.view() 只读摘要）
        const handoffSection = document.createElement('details')
        handoffSection.id = 'handoffSection'
        const hfHead = data.handoff || {}
        handoffSection.innerHTML = `<summary class="sec" style="cursor:pointer">交接 <span class="note">· 缺交接包 ${esc(hfHead.missingCount ?? 0)} · 已转交 ${esc(hfHead.forwardedCount ?? 0)} · ${hfHead.corrupt ? '配置文件损坏，已按关闭处理' : esc(hfHead.enabled ? '已开启' : '总开关关闭')}</span></summary><div id="handoffPanel" style="min-width:0;overflow-wrap:anywhere"></div>`
        versionSection.after(handoffSection)
        const renderHandoff = () => {
          const panel = $('handoffPanel')
          if (!panel) return
          const hf = data.handoff || {}
          const fmt = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '–'
          const hfStay = (t) => { const at = Date.parse(t.triggers?.[0]?.at || t.parsedAt || t.handoff?.at || ''); return at && Number.isFinite(at) ? ago(Date.now() - at) : '–' }
          const rows = (hf.missing || []).map((t) => {
            const trig = (t.triggers || []).map((x) => `${esc(x.label)}${x.at ? ' · ' + esc(fmt(x.at)) : ''}`).join('；')
            const missed = (t.handoff?.missing || []).join('、')
            const remind = t.remindedAt ? `已提醒（${esc(fmt(t.remindedAt))}）` : (t.notifiedAt ? `已通知董事会（${esc(fmt(t.notifiedAt))}）` : '未提醒')
            const extra = [t.forwardedAt ? `已转交：${esc(fmt(t.forwardedAt))}` : '', t.stale ? '交接包版本可能已过期' : ''].filter(Boolean)
            return `<div class="q" style="padding:8px 10px;margin-bottom:6px;background:${t.stale ? 'rgba(255,255,255,.03)' : 'rgba(255,176,32,.08)'};border:1px solid ${t.stale ? 'var(--line)' : 'rgba(255,176,32,.3)'}"><button class="btn" style="padding:0;border:0;background:none;color:var(--gold2);font-weight:700" data-hf-issue="${esc(t.issueId || t.ident)}">${esc(t.ident || t.issueId)}</button> ${esc(t.title)}${t.money ? ' <span class="note">🛡️资金类</span>' : ''}<br><span class="note">${esc(t.owner || t.ownerId || '–')} · ${trig || '待触发'} · 已等 ${hfStay(t)}${missed ? ` · 缺：${esc(missed)}` : ''} · ${esc(remind)}${extra.length ? ' · ' + esc(extra.join(' · ')) : ''}</span></div>`
          }).join('') || `<div class="note">${hf.enabled ? '任务都有完整交接包，无需提醒。' : '总开关关闭（handoff.json 的 enabled:false）：不算触发、不提醒、不转交。'}</div>`
          panel.innerHTML = `<div class="actions"><button class="btn" id="hfScan" ${state?.lan ? 'disabled' : ''} ${state?.lan ? 'title="局域网只读"' : ''}>立即扫描</button></div><div class="note">「立即扫描」= 手动跑一次巡检：缺交接包（T1 中断 / T2 转阻塞 / T4 长停留）发一条【交接巡检】提醒，换人（T3）转交前任交接包；资金类只通知董事会不评论。</div>${rows}${(hf.records || []).length ? `<div class="sec">最近处理记录</div>${hf.records.map((r) => `<div class="note">${esc(fmt(r.at))} · ${esc(r.ident)} · ${esc(r.action)}</div>`).join('')}` : ''}`
          const scan = $('hfScan')
          if (scan) scan.onclick = async () => { if (await post({ type: 'handoff_run' })) { toast(lastResult?.reason || `巡检完成，处理 ${lastResult?.processed ?? 0} 项`); await refresh(); openGovernance() } }
          modal.querySelectorAll('[data-hf-issue]').forEach((b) => (b.onclick = () => openIssue(b.dataset.hfIssue, 'view')))
        }
        renderHandoff()
        modal.querySelectorAll('[data-gov-cat]').forEach((b) => b.onclick = () => { category = b.dataset.govCat; page = 0; render() })
        modal.querySelector('#govOutcome').value = outcome
        modal.querySelector('#govOutcome').onchange = (e) => { outcome = e.target.value; page = 0; render() }
        modal.querySelector('#govPrev').onclick = () => { page--; render() }
        modal.querySelector('#govNext').onclick = () => { page++; render() }
        modal.querySelectorAll('[data-gov-id]').forEach((b) => b.onclick = () => { expanded = expanded === b.dataset.govId ? null : b.dataset.govId; render() })
      }
      render()
    } catch (e) { open(`<div class="note">读取失败：${esc(e.message)}</div>`) }
  }
  $('govBtn').onclick = () => openGovernance()

  // ── 协作关系图（T12）：用真实事件账本画「谁和谁在配合」，只读；打开才请求、关闭即释放 ──
  const collabGraph = createCollabGraph({
    esc,
    load: async (query) => {
      const r = await fetch('/collab?' + query, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      return j
    },
  })
  async function openCollab() {
    open('<h2>🕸 协作关系</h2><div class="note">派单、汇报、互动组成的「谁和谁在配合」；数据只来自事件账本，不推断关系和情感</div><div class="collab" id="collabRoot"></div>')
    collabGraph.attach($('collabRoot'))
  }
  $('collabBtn').onclick = () => openCollab()

  async function loadWorkload(days = 14) {
    const panel = $('workloadPanel')
    if (!panel) return
    panel.textContent = '读取编制与工作量…'
    try {
      if (!state?.workload) throw new Error('现有服务尚未加载T9，请维护者重启原唯一实例后刷新页面')
      const response = await fetch('/workload?days=' + days, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(response.status === 404 ? '现有服务尚未加载T9，请维护者重启原唯一实例' : data.error || `HTTP ${response.status}`)
      if (!panel.isConnected) return
      let order = 'observedDays', ascending = false
      const pct = v => Number.isFinite(v) ? Math.round(v * 100) + '%' : '未知'
      const value = v => v === null || v === undefined ? '未知' : v
      const labels = { observedDays: '可信度 / 观察天', availableDays: '出勤', utilization: '利用率', runs: '运行', successRate: '成功率', done: '完成', queue: '队列' }
      const render = () => {
        const rows = [...(data.roles || [])].sort((a, b) => { const av = a[order], bv = b[order]; if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1; if (bv === null || bv === undefined) return -1; return (ascending ? 1 : -1) * (av - bv) })
        panel.innerHTML = `<p>${esc(data.notice)}</p><p class="note">${esc(data.enabled ? '已开启' : '默认关闭：不聚合、不报告、不通知')} · ${esc(data.window?.[0])} — ${esc(data.window?.at(-1))}（已结束上班日，金边时间）</p>${data.error ? `<p class="bad">${esc(data.error)}</p>` : ''}<div class="actions"><label>窗口 <select id="workloadDays"><option value="14">14个上班日</option><option value="7">7个上班日</option></select></label><label>排序 <select id="workloadSort">${Object.entries(labels).map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join('')}</select></label><button class="btn" id="workloadOrder">${ascending ? '升序 ↑' : '降序 ↓'}</button><button class="btn" id="workloadReport" ${state?.lan || !data.enabled ? 'disabled' : ''} title="${esc(state?.lan ? '局域网只读' : !data.enabled ? '功能关闭，不能生成报告' : '仅生成本地报告并通知董事会，不修改岗位')} ">现在生成周报</button></div><div style="overflow-x:auto;max-width:100%;scrollbar-gutter:stable" tabindex="0" aria-label="岗位指标表，可横向滚动"><table style="border-collapse:collapse;min-width:1120px;width:100%"><thead><tr>${['岗位 / 可信度','出勤 / 不可用','有产出日','运行 / 成功 / 失败 / 超时 / 取消','成功率','利用率中位数','完成 / 评论 / 返工','队列 / 快照天','等待中位数','阻塞占比'].map(s => `<th style="padding:8px;text-align:left">${esc(s)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr style="${r.confidence === '不足以判断' ? 'color:var(--muted);' : ''}border-top:1px solid var(--line)"><td style="padding:8px;max-width:220px;overflow-wrap:anywhere"><b>${esc(r.name)}</b><br><span class="ptag">${esc(r.confidence)} · ${esc(r.observedDays)}天</span>${r.money ? '<br>资金类：保留审查链' : ''}<details><summary>数据缺口</summary>${(r.gaps || []).map(g => `<p>${esc(g)}</p>`).join('')}</details></td>${[r.attendanceObservedDays ? `${r.availableDays} / ${r.unavailableDays}` : '未知',r.productiveDays,`${r.runs} / ${r.succeeded} / ${r.failed} / ${r.timedOut} / ${r.cancelled}`,pct(r.successRate),pct(r.utilization),`${r.done} / ${r.comments} / ${r.reworks}`,`${value(r.queue)} / ${r.snapshotDays}天`,r.waitMs === null ? '未知' : `${Math.round(r.waitMs / 60000)}分钟`,pct(r.blockedShare)].map(v => `<td style="padding:8px">${esc(v)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="10">尚无岗位观察数据</td></tr>'}</tbody></table></div><div class="sec">建议与证据</div>${(data.suggestions || []).map(s => `<details><summary>${esc(s.name)} · ${esc(s.type)} · ${esc(s.confidence)}${s.boardApproval ? ' · 需董事会审批' : ''}</summary><p>${esc(s.conditions.join('；'))}</p><p>承接候选：${esc(s.candidates.join('、') || '–')}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify({ window:s.window, measured:s.facts, thresholds:s.thresholds, gaps:s.gaps },null,2))}</pre></details>`).join('') || '<p class="note">未命中建议；数据不足不得给出增减结论。</p>'}<details><summary>本次使用的可调阈值</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(data.thresholds,null,2))}</pre></details><p class="note">${esc((data.gaps || []).join('；'))}</p><p class="note">最近报告：${esc(data.lastReport?.path || '暂无')}</p>`
        $('workloadDays').value = String(days)
        $('workloadDays').onchange = e => loadWorkload(Number(e.target.value))
        $('workloadSort').value = order
        $('workloadSort').onchange = e => { order = e.target.value; render() }
        $('workloadOrder').onclick = () => { ascending = !ascending; render() }
        $('workloadReport').onclick = async () => {
          const button = $('workloadReport'); button.disabled = true
          if (await post({ type: 'workload_report' })) { toast(lastResult?.error || lastResult?.skip || '本地周报已生成', !lastResult?.error && !lastResult?.skip); await loadWorkload(days) }
          else if (button.isConnected) button.disabled = !!state?.lan || !data.enabled
        }
      }
      render()
    } catch (e) {
      if (!panel.isConnected) return
      panel.innerHTML = `<p class="note">读取失败：${esc(e.message)}</p><button class="btn" id="workloadRetry">重试读取</button>`
      $('workloadRetry').onclick = () => loadWorkload(days)
    }
  }

  async function openMemory() {
    const m = state?.memory
    if (!m) { open('<h2>记忆库</h2><div class="note">等待服务加载记忆库模块；请由维护者重启现有实例。</div>'); return }
    const counts = m.counts || {}
    const history = (m.injections || []).map(r => `<div class="row">${esc(r.ident)} · ${esc(r.count)} 条 · ${esc(r.status)} · ${esc(r.at)}</div>`).join('') || '<div class="note">暂无注入</div>'
    const rejected = (m.rejected || []).map(r => `<div class="row">${esc((r.categories || []).join('、'))} · ${esc(r.at)}</div>`).join('') || '<div class="note">暂无拒收</div>'
    open(`<h2>🧠 记忆库</h2><div class="meta">${m.enabled ? '已开启' : '已关闭（默认）'} · 首次启用须董事会确认；评论可能唤醒负责人</div><p>待审 ${esc(counts.pending ?? 0)} · 项目 ${esc(counts.project ?? 0)} · 流程 ${esc(counts.process ?? 0)} · 个人 ${esc(counts.personal ?? 0)} · 已驳回 ${esc(counts.rejected ?? 0)}</p><p>最久积压：${esc(ago(m.oldestPendingMs || 0))} · ${esc(m.reviewConfigured ? '已配置审核任务' : '未配置审核任务')}</p><p class="note">${esc(m.error || '')}</p><div class="sec">检查提示</div>${(m.duplicates || []).map(d => `<p>${esc(d.category)} · ${esc(d.paths.join(' / '))}</p>`).join('')}${(m.invalid || []).map(d => `<p>${esc(d.path)} · ${esc(d.errors.join('、'))}</p>`).join('')}<div class="actions"><button class="btn" id="memoryRescan" ${state?.lan ? 'disabled' : ''}>重建索引</button></div><div class="sec">任务干跑（只读）</div><input id="memoryIssue" placeholder="CMP-285" maxlength="30" style="max-width:100%;box-sizing:border-box"><button class="btn" id="memoryPreview">查看干跑</button><pre id="memoryResult" style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%"></pre><div class="sec">最近注入</div>${history}<div class="sec">最近扫描拒收（仅类别）</div>${rejected}`)
    $('memoryRescan').onclick = async () => { if (await post({ type: 'memory_rescan' })) { await refresh(); openMemory() } }
    const growth = document.createElement('section'), metrics = m.metrics || {}, active = metrics.active || {}, month = metrics.monthly || {}
    growth.style.overflowWrap = 'anywhere'
    const share = Number.isFinite(metrics.everInjectedShare) ? Math.round(metrics.everInjectedShare * 100) + '%' : '–'
    growth.innerHTML = `<div class="sec">增长控制</div><p>有效：项目 ${esc(active.project ?? '–')} / 200 · 流程 ${esc(active.process ?? '–')} / 80 · 个人 ${esc(active.personal ?? '–')}（每岗位30）</p><p>归档 ${esc(metrics.archived ?? '–')} · stale ${esc(metrics.staleCount ?? '–')} · 过期 ${esc(metrics.expiredCount ?? '–')} · 超限组 ${esc((m.limitWarnings || []).length)}</p><p>本月 ${esc(month.month || '–')}：新增 ${esc(month.new ?? '–')} / 通过 ${esc(month.approved ?? '–')} / 驳回 ${esc(month.rejected ?? '–')} / 归档 ${esc(month.archived ?? '–')}</p><p>本月注入 ${esc(month.injections ?? '–')} 次 · 有效条目曾注入占比 ${esc(share)} · 已驳回超过30天 ${esc(metrics.cleanupRejectedCount ?? '–')} 条（只提示清理）</p><p class="note">月度状态按程序首次观察及后续变更记账，不回溯推测历史。条目归档由 KnowledgeKeeper 操作，程序不自动归档。</p>${(m.limitWarnings || []).map(g => `<p>${esc(g.type)} ${esc(g.author || '')}：${esc(g.count)} / ${esc(g.limit)}，超出 ${esc(g.excess)}；建议检查 ${esc((g.paths || []).join('、'))}</p>`).join('')}${(m.duplicates || []).map(d => `<p>${esc(d.suggestion || '')}</p>`).join('')}${(m.monthlyLists || []).map(r => `<p>${esc(r.path)} · ${esc(r.count)} 项 · ${esc(r.notified ? '已记录提醒尝试' : '待提醒 / 未配置审核任务')}</p>`).join('')}`
    $('memoryRescan').closest('.actions').before(growth)
    const monthly = document.createElement('button')
    monthly.id = 'memoryMonthly'; monthly.className = 'btn'; monthly.textContent = '生成月度整理清单'; monthly.disabled = !!state?.lan || !m.enabled
    $('memoryRescan').after(monthly)
    monthly.onclick = async () => { if (await post({ type: 'memory_monthly' })) { if (lastResult?.error || lastResult?.skip) toast(lastResult.error || lastResult.skip, false); await refresh(); openMemory() } }
    $('memoryPreview').onclick = async () => {
      const input = $('memoryIssue').value.trim(), target = $('memoryResult')
      if (!/^CMP-\d+$/.test(input)) { target.textContent = '请输入 CMP-数字'; return }
      try { const r = await fetch('/memory/preview?issue=' + encodeURIComponent(input)); const j = await r.json(); target.textContent = JSON.stringify(j, null, 2); if (!r.ok) throw new Error(j.error || r.status) }
      catch (e) { target.textContent = '读取失败：' + e.message }
    }
  }
  const memoryBtn = document.createElement('button')
  memoryBtn.id = 'memoryBtn'; memoryBtn.textContent = '🧠 记忆库'; memoryBtn.onclick = () => openMemory()
  $('govBtn').after(memoryBtn)

  // ── 企业知识库（只读）：E:\VirtualAIOffice\knowledge；confidential 只显示标题 ──
  const AUD = { public: '对外', internal: '内部', confidential: '机密' }
  async function openKB(start) {
    open('<div class="note">读取知识库…</div>')
    let kb
    try { kb = await (await fetch('/kb')).json() } catch (e) { open(`<div class="note">读取失败：${esc(e.message)}</div>`); return }
    if (!kb.ok) { open('<div class="note">知识库目录不存在（E:\\VirtualAIOffice\\knowledge）</div>'); return }
    const total = kb.docs.length, verified = kb.docs.filter((d) => d.status === 'verified').length
    open(`<h2>📚 企业知识库</h2>
      <div class="meta">共 ${total} 篇（已审核 ${verified}）· 本地 Git 仓库 E:\\VirtualAIOffice\\knowledge · 知识库管理员 KnowledgeKeeper 每天 17:00 沉淀；查不到的问题记在「缺口/待补充问题」</div>
      <input type="text" id="kFind" class="one" placeholder="搜索标题或路径">
      <div class="bl" id="kList" style="max-height:200px"></div>
      <div id="kDoc"></div>`)
    const box = modal.querySelector('#kList')
    const draw = () => {
      const q = modal.querySelector('#kFind').value.trim().toLowerCase()
      const rows = kb.docs.filter((d) => !q || (d.title + d.path).toLowerCase().includes(q))
      box.innerHTML = rows.map((d) => `<div class="bli" data-p="${esc(d.path)}"><b>${esc(d.title)}</b> <span class="note">${esc(d.path)} · ${AUD[d.audience] || d.audience} · ${d.status === 'verified' ? '已审核' : d.status === 'deprecated' ? '已过时' : '草稿'}${d.updated ? ' · ' + esc(d.updated) : ''}</span></div>`).join('') || '<div class="note">没有匹配的文章</div>'
      box.querySelectorAll('.bli').forEach((el) => (el.onclick = () => { box.querySelectorAll('.bli').forEach((x) => x.classList.toggle('on', x === el)); read(el.dataset.p) }))
    }
    async function read(p) {
      const out = modal.querySelector('#kDoc')
      out.innerHTML = '<div class="note">加载中…</div>'
      try {
        const r = await fetch('/kb/doc?path=' + encodeURIComponent(p))
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || r.status)
        out.innerHTML = `<div class="sec">${esc(d.meta.title || p)}</div><div class="note">来源：${esc(d.meta.sources || '—')}</div><div class="fold md">${md(d.body)}</div>`
      } catch (e) { out.innerHTML = `<div class="note">读取失败：${esc(e.message)}</div>` }
    }
    modal.querySelector('#kFind').oninput = draw
    draw()
    read(start || '公司/目标与优先级.md')
  }
  $('kbBtn').onclick = () => openKB()
  const homeEntry = document.createElement('button')
  homeEntry.id = 'homeEntry'; homeEntry.type = 'button'; homeEntry.textContent = '仓库 · 个人空间'; homeEntry.style.display = 'none'
  $('kbBtn').after(homeEntry)
  homeEntry.onclick = () => { try { if (canShowHomeEntry({ fullAccess: Boolean(state?.actToken), lan: Boolean(state?.lan), wall: new URLSearchParams(location.search).has('wall') })) window.open('/home-inventory.html', '_blank', 'noopener') } catch { toast('个人空间暂不可用', false) } }

  // 全局快速跳转只过滤页面已有状态；知识库首次打开时才读取并短缓存。
  const searchPanel = $('searchPanel'), searchInput = $('searchInput'), searchResults = $('searchResults')
  let searchOpen = false, selected = 0, flatResults = [], kbCache = null
  const regionItems = Object.values(REGION_FOCUS).map(({ label, t, r }) => ({ kind: 'region', id: label, label, title: label, search: '区域', focus: { az: 6, el: 36, r, t } }))
  const typeLabel = { person: '同事', task: '任务', project: '项目', region: '区域', kb: '知识库' }
  const modeLabel = { run: '在跑', idle: '空闲', err: '出错', pause: '暂停', running: '在跑', paused: '暂停', error: '出错', in_progress: '进行中', in_review: '待验收', blocked: '阻塞', todo: '待开始', done: '已完成' }
  const recentRead = () => { try { return JSON.parse(localStorage.getItem('office3d.searchRecent') || '[]') } catch { return [] } }
  const remember = (item) => { try { const old = recentRead().filter((x) => !(x.kind === item.kind && x.id === item.id)); localStorage.setItem('office3d.searchRecent', JSON.stringify([{ kind: item.kind, id: item.id }, ...old].slice(0, 6))) } catch {} }
  const allGroups = () => {
    const agents = (state?.agents || []).map((a) => { const name = agentName(a.id) || a.name || a.id; return { kind: 'person', id: a.id, label: name, title: a.title || '', search: [name, a.name, state?.names?.[a.id], a.title, a.model, a.adapter].filter(Boolean).join(' '), meta: modeLabel[a.status] || '空闲', action: () => focusAgent(a.id) } })
    const projectName = (id) => (state?.projects || []).find((p) => p.id === id)?.name || (state?.today?.byProject || []).find((p) => p.projectId === id)?.name || ''
    const taskItems = [...(state?.assigned || []), ...(state?.waiting || []), ...(state?.today?.doneTasks || state?.today?.doneList || [])].map((t) => ({ kind: 'task', id: t.identifier || t.id, label: t.identifier || t.id, title: t.title || '', search: [t.identifier, t.id, t.title, t.assignee, projectName(t.projectId), agentName(t.agentId)].filter(Boolean).join(' '), meta: modeLabel[t.status] || t.status || '任务', issueId: t.issueId || t.id, action: () => openIssue(t.issueId || t.id, t.status === 'in_review' ? 'review' : 'view') }))
    const projects = (state?.today?.byProject || []).filter((x) => x.projectId || x.name).map((p) => ({ kind: 'project', id: p.projectId || p.name, label: p.name || p.projectId, title: p.name || p.projectId, search: `${p.name || ''} ${p.projectId || ''}`, action: () => { const el = [...document.querySelectorAll('.today-project')].find((x) => x.dataset.projectId === (p.projectId || p.name)); if (el) { el.scrollIntoView({ block: 'nearest' }); el.classList.add('search-hit'); setTimeout(() => el.classList.remove('search-hit'), 1800) } } }))
    const kb = kbCache?.docs?.map((d) => ({ kind: 'kb', id: d.path, label: d.title, title: d.title, search: `${d.title} ${d.path}`, path: d.path, meta: d.status === 'verified' ? '已审核' : '文章', action: () => openKB(d.path) })) || []
    return [{ key: 'people', label: '同事', items: agents }, { key: 'tasks', label: '任务', items: taskItems }, { key: 'projects', label: '项目', items: projects }, { key: 'regions', label: '区域', items: regionItems }, { key: 'kb', label: '知识库', items: kb }]
  }
  function drawSearch() {
    const groups = allGroups(), q = searchInput.value.trim(), shown = q ? searchGroups(q, groups) : recentGroups(groups, recentRead(), { maxPerGroup: 6, maxTotal: 6 })
    flatResults = shown.flatMap((g) => g.items); selected = Math.min(selected, Math.max(0, flatResults.length - 1))
    searchResults.innerHTML = shown.length ? shown.map((g) => `<div class="search-group">${esc(g.label)}</div>${g.items.map((x) => `<button class="search-item ${flatResults[selected] === x ? 'on' : ''}" data-search-id="${esc(x.kind + ':' + x.id)}"><span class="search-main"><b>${esc(x.label)}</b>${x.title && x.title !== x.label ? `<span class="search-meta">${esc(x.title)}</span>` : ''}</span><span class="search-tag">${esc(typeLabel[x.kind] || x.kind)}</span>${x.meta ? `<span class="search-tag">${esc(x.meta)}</span>` : ''}</button>`).join('')}`).join('') : '<div class="search-empty">没有匹配项</div>'
    searchResults.querySelectorAll('[data-search-id]').forEach((el) => { el.onmouseenter = () => { selected = flatResults.findIndex((x) => `${x.kind}:${x.id}` === el.dataset.searchId); drawSearch() }; el.onclick = () => { const item = flatResults.find((x) => `${x.kind}:${x.id}` === el.dataset.searchId); if (item) runSearch(item) } })
  }
  function runSearch(item) { remember(item); closeSearch(); if (item.kind === 'region') setGoal?.(item.focus); else item.action?.() }
  function closeSearch() { searchOpen = false; searchPanel.classList.remove('show'); searchInput.value = ''; searchResults.innerHTML = '' }
  async function openSearch() { searchOpen = true; selected = 0; searchPanel.classList.add('show'); searchInput.focus(); drawSearch(); if (!kbCache || Date.now() - kbCache.at > 60000) { try { const j = await (await fetch('/kb')).json(); if (j.ok) kbCache = { at: Date.now(), docs: j.docs || [] }; drawSearch() } catch {} } }
  $('searchBtn').onclick = () => searchOpen ? closeSearch() : openSearch()
  searchInput.oninput = () => { selected = 0; drawSearch() }
  addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '')
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return }
    if (e.key === '/' && !typing) { e.preventDefault(); openSearch(); return }
    if (!searchOpen) return
    if (e.key === 'Escape') { e.preventDefault(); closeSearch() } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); selected = flatResults.length ? (selected + 1) % flatResults.length : 0; drawSearch() } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); selected = flatResults.length ? (selected + flatResults.length - 1) % flatResults.length : 0; drawSearch() } else if (e.key === 'Enter' && flatResults[selected]) { e.preventDefault(); runSearch(flatResults[selected]) } else if (typing) drawSearch()
  })

  $('dispatchBtn').onclick = (e) => { e.stopPropagation(); if (state) openDispatch() }

  return {
    toast,
    openQuality(options) {
      const names={low:'低：省电与低配',medium:'中：均衡',high:'高：完整效果'}
      open(`<h2>画质</h2><p id="qualityStats" role="status" style="overflow-wrap:anywhere">${esc(options.status)}</p><div class="tabs">${Object.entries(names).map(([key,name])=>`<button class="btn ${options.tier===key?'gold':''}" data-quality="${esc(key)}" aria-pressed="${options.tier===key}" ${options.forced?'disabled':''}>${esc(name)}</button>`).join('')}</div><p class="note">${esc(options.forced?'URL参数锁定档位；移除q参数后可手动切换。':'选择保存在本机。持续低帧时只自动降档，不自动升回。低档关闭实时阴影、环境光遮蔽、雨丝和闪电，远处空闲人物动画降频。')}</p>`)
      modal.querySelectorAll('[data-quality]').forEach(b=>b.onclick=()=>{options.tier=b.dataset.quality;options.select(options.tier);modal.querySelectorAll('[data-quality]').forEach(el=>{const on=el===b;el.classList.toggle('gold',on);el.setAttribute('aria-pressed',String(on))})})
    },
    openIssue,
    openChat,
    openHandoff,
    openAnnounce,
    openTasks() { questCollapsed = false; quest.classList.remove('collapsed'); $('questFold').textContent = '收起' },
    openDispatch: (agentId) => state && openDispatch(agentId),
    openDaily,
    openKB,
    openStalled,
    async rename(agentId, name) {
      if (await post({ type: 'rename', agentId, name })) { toast(name ? `已改名为「${name}」` : '已恢复原名'); await refresh() }
    },
    render(s) {
      state = s
      homeEntry.style.display = canShowHomeEntry({ fullAccess: Boolean(s.actToken), lan: Boolean(s.lan), wall: new URLSearchParams(location.search).has('wall') }) ? '' : 'none'
      if ($('commandEntry')) $('commandEntry').hidden = !canShowHomeEntry({ fullAccess: Boolean(s.actToken), lan: Boolean(s.lan), wall: new URLSearchParams(location.search).has('wall') })
      token = s.actToken || token
      updateHealth(s.healthLevel)
      renderToday(s.today)
      const now = Date.now()
      const wl = $('waitList')
      wl.innerHTML = ''
      const items = []
      // T13：待验收卡片上，有返工记录的任务加徽标（超限红色并写明按流程先由 Lead 与董事会决定；不禁用通过按钮）
      const rwBadge = (issueId) => {
        const t = (s.rework?.tasks || []).find((x) => String(x.issueId) === String(issueId))
        if (!t || !t.rounds) return ''
        const capped = Boolean(t.capped)
        const style = capped ? 'color:#ffd2d2;background:rgba(255,60,60,.18);border:1px solid rgba(255,110,110,.45)' : 'color:#ffd98a;background:rgba(255,176,32,.1);border:1px solid rgba(255,176,32,.35)'
        const note = capped ? ' · 按流程应先由 Lead 与董事会决定' : ''
        return `<span class="rw-badge" style="display:inline-block;margin-top:4px;padding:1px 8px;border-radius:999px;font-size:10.5px;line-height:1.6;overflow-wrap:anywhere;${style}">返工 第 ${esc(t.rounds)} 轮 · 未关 R 项 ${esc(t.openItems)}${note}</span>`
      }
      for (const a of s.approvals || []) items.push(card('approval', KIND.approval.label, a.title, `${agentName(a.agentId) || '系统'} · 已等 ${ago(now - Date.parse(a.at))}`, () => openApproval(a)))
      // T15：有「待验收」项且版本核对缓存超过 60 秒才重拉（服务端也缓存 60 秒），避免每次轮询都跑 git
      if (Date.now() - verCache.at > 60000 && (s.waiting || []).some((w) => w.kind === 'review')) loadVer()
      for (const w of s.waiting || []) {
        const who = agentName(w.agentId)
        const meta = `${w.id}${who ? ' · ' + who : ''} · 已等 ${ago(now - Date.parse(w.since))}`
        if (w.kind === 'question') items.push(card('question', KIND.question.label, w.title, meta, () => openQuestion(w), w.projectId))
        else if (w.kind === 'review') items.push(card('review', KIND.review.label, w.title, meta, () => openIssue(w.issueId, 'review'), w.projectId, (rwBadge(w.issueId) || '') + verBadge(w.issueId)))
        else if (w.kind === 'undelivered') items.push(card('undelivered', KIND.undelivered.label, w.title, meta, () => openIssue(w.issueId, 'undelivered'), w.projectId))
      }
      if (items.length) items.forEach((x) => wl.appendChild(x))
      else wl.innerHTML = '<div class="empty">🎉 没有需要你处理的事</div>'
      const n = items.length
      $('sTodo').textContent = n
      $('questCount').textContent = n
      $('questCount').classList.toggle('zero', n === 0)
      $('todoChip').classList.toggle('pulse', n > 0)
      $('dispatchBtn').disabled = !!s.lan
      $('dispatchBtn').title = s.lan ? '局域网只读，请在运行服务的电脑上操作' : '新建任务，或把待排期的任务派给某位同事'
      const tl = $('taskList')
      tl.innerHTML = ''
      // 所有已派发、还没结束的任务（进行中 / 阻塞 / 待开始 / 待验收），点开可以看详情、发评论、取消
      const order = { in_progress: 0, blocked: 1, todo: 2, in_review: 3 }
      const tasks = (s.assigned || []).slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.id.localeCompare(b.id, undefined, { numeric: true }))
      const cv = s.contractView
      $('taskHead').textContent = `已派发的任务（${tasks.length}）${cv ? ` · 契约完整 ${cv.complete} / 缺项 ${cv.incomplete} / 无 ${cv.none}` : ''}`
      if (!tasks.length) tl.innerHTML = '<div class="empty">当前没有已派发的任务</div>'
      const contractBadge = (identifier) => { const v = (s.contractView?.items || []).find((x) => String(x.identifier) === String(identifier)); if (!v) return ''; const label = v.state === 'complete' ? '契约：完整' : v.state === 'incomplete' ? `契约：缺 ${v.errors.length} 项` : '契约：无'; const tip = v.errors.map((x) => `${x.field} / ${x.code}`).join('\n') || label; return `<span class="contract-badge" title="${esc(tip)}" style="display:inline-block;margin-top:4px;padding:1px 8px;border-radius:999px;font-size:10.5px;line-height:1.6;color:var(--muted);border:1px solid var(--line)">${esc(label)}</span>` }
      for (const t of tasks) {
        tl.appendChild(card('task', `${t.id} · ${STATUS[t.status] || t.status}`, t.title, agentName(t.agentId), () => { focusAgent(t.agentId); openIssue(t.issueId, t.status === 'in_review' ? 'review' : 'view') }, t.projectId, contractBadge(t.id)))
      }
    },
  }
}

