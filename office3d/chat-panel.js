const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const countChatText = text => `${String(text || '').length}/600`
export const chatQuotaText = q => `本小时 ${Number(q?.hour || 0)}/${Number(q?.hourLimit || 6)} · 今日 ${Number(q?.day || 0)}/${Number(q?.dayLimit || 60)}`
export function chatStatusText(agent, dutyOn) {
  if (agent?.status === 'terminated') return '已离职，不能对话'
  if (agent?.status === 'paused' || !dutyOn) return '下班了，明天 8:30 后回复'
  return agent?.status === 'running' ? '运行中' : '空闲'
}
export function panelSuggestion(text) {
  const m = String(text || '').match(/(?:^|\n)建议任务\s*[：:]\s*([^|｜\n]{1,80})(?:\s*[|｜]\s*([^\n]{1,300}))?/)
  return m ? { title: m[1].trim(), note: (m[2] || '').trim() } : null
}
const status = { queued: '排队中', sent: '已发送 · 思考中', replying: '还在回复…', replied: '已回复', timeout: '超时', created: '已创建任务' }
export function chatPanelHtml(data, dutyOn = true) {
  if (!data?.enabled) return `<h2>💬 与 ${esc(data?.agent?.name || '同事')} 对话</h2><p class="note">对话功能未开启</p>`
  const messages = (data.messages || []).map(m => {
    const suggestion = m.status === 'replying' ? null : m.suggestion || panelSuggestion(m.text)
    return `<div class="chat-msg chat-${esc(m.role || 'system')}" data-message-id="${esc(m.id)}"><div class="chat-meta">${m.role === 'user' ? '你' : m.role === 'agent' ? esc(data.agent.name) : '系统'} · ${esc(status[m.status] || m.status || '–')} · ${esc(new Date(m.at).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }))}</div><div>${esc(m.text)}</div>${m.format === 'loose' ? '<div class="note">TA 没有按对话格式回复</div>' : ''}${suggestion ? `<div class="chat-suggest"><b>建议任务：${esc(suggestion.title)}</b><button class="btn" data-chat-task="${esc(m.id)}" data-title="${esc(suggestion.title)}" data-note="${esc(suggestion.note)}">转成任务</button></div>` : ''}</div>`
  }).join('') || '<p class="note">还没有消息</p>'
  return `<h2>💬 与 ${esc(data.agent.name)} 对话</h2><div class="chat-head"><span>${esc(chatStatusText(data.agent, dutyOn))}</span><span>${esc(chatQuotaText(data.quota))}</span></div><p class="note">同事的回复由 AI 生成，仅供参考，不代表已执行；对话不会改动任何任务。</p><div class="chat-task-box"><input id="chatTaskTitle" maxlength="80" placeholder="任务标题（必填）"><input id="chatTaskNote" maxlength="300" placeholder="补充说明（选填）"><button class="btn" id="chatTaskAll">把这段对话转成任务</button></div><div class="chat-messages">${messages}</div><textarea id="chatInput" maxlength="600" placeholder="输入消息；Enter 发送，Shift+Enter 换行" ${data.pending ? 'disabled' : ''}></textarea><div class="chat-compose"><span id="chatCount">0/600</span><button class="btn gold" id="chatSend" ${data.pending ? 'disabled' : ''}>${data.pending ? '等 TA 回复后再说' : '发送'}</button></div>`
}
