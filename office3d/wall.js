import { keepFullscreenAwake, awakeMessage } from './screen-awake.js'
const $ = (id) => document.getElementById(id)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const pctText = (value) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`
export const daysText = (m, overdue = false) => m == null ? '日期未知' : overdue && m >= 0 ? '刚过期' : m < 0 ? `超期 ${-m} 天` : m === 0 ? '今天到期' : `还有 ${m} 天`
export const isStale = (now, lastSuccess, limit = 600000) => !lastSuccess || now - lastSuccess > limit
export const carouselPage = (index, count) => count ? ((index % count) + count) % count : 0
export const paginate = (items, size = 4) => { const n = Math.max(1, Math.floor(size)); const out = []; for (let i = 0; i < (items || []).length; i += n) out.push(items.slice(i, i + n)); return out.length ? out : [[]] }
export const shouldShowBrief = (key, state, storage = globalThis.localStorage) => {
  if (!state || !['done', 'awaiting'].includes(state.state)) return false
  try { if (storage.getItem(`office3d.wall.brief.${key}`) === '1') return false } catch {}
  return true
}

const KIND = { review: '待验收', question: '待回答', undelivered: '回答未送达', approval: '待审批', board: '待董事会提供', board_blocked: '待董事会决定' }
const SHOTS = [['tour', '全景巡航'], ['product', '产品与设计'], ['eng', '工程'], ['quality', '质量与安全'], ['drlife', 'Dr.life+ 工作室'], ['ops', '运维'], ['kb', '知识库'], ['review', '评审室'], ['board', '董事会']]
let data = null, lastSuccess = 0, failures = 0, slide = 0, shot = 0, briefTimer = null
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function fmtDate(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Phnom_Penh', month: 'numeric', day: 'numeric' }) }
function age(value) { return value == null ? '' : value < 60 ? `${value} 分钟` : value < 1440 ? `${Math.round(value / 60)} 小时` : `${Math.round(value / 1440)} 天` }
function setClock() { $('clock').textContent = `${new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false })} · 金边` }
function renderRisk(d) {
  const level = ['green', 'yellow', 'red'].includes(d.riskLevel) ? d.riskLevel : 'yellow'
  const text = { green: '运行正常', yellow: '需要关注', red: '有风险' }[level]
  const reason = d.risks?.[0]?.title || ({ green: '没有触发风险规则', yellow: '存在需要跟进的运行信号', red: '存在需要领导关注的风险' }[level])
  $('lightText').textContent = text; $('light').className = `light ${level}`
  $('riskText').textContent = text; $('riskCard').style.setProperty('--risk', `var(--${level})`); $('riskReason').textContent = reason
  $('light').title = (d.rules || []).join('\n')
}
function renderLaunch(d) {
  const projects = d.milestones || []
  $('launchBody').innerHTML = projects.length ? projects.map((p) => {
    const next = p.next
    return `<div class="launch-row"><b>${esc(p.name)}</b><span>${p.finished}/${p.total} 闸门 · 计划上线 ${esc(fmtDate(p.plannedLaunch))}</span></div><div class="bar"><i style="width:${pctText(p.percent)}"></i></div>${next ? `<div class="next ${next.overdue ? 'over' : ''}">${next.overdue ? '⚠ ' : '下一步：'}${esc(next.name)} · ${esc(daysText(next.daysLeft, next.overdue))}</div>` : '<div class="next">✓ 全部里程碑已完成</div>'}`
  }).join('') : '<span class="muted">还没有配置里程碑（roadmap.json）</span>'
}
function renderDecisions(d) {
  const items = d.decisions || []
  const el = $('decisions'); el.classList.toggle('empty', !items.length)
  $('decBody').innerHTML = items.length ? items.slice(0, 4).map((x) => `<div class="item ${x.ageMinutes > 1440 ? 'red' : x.ageMinutes > 240 ? 'yellow' : ''}"><b>${esc(KIND[x.kind] || x.kind || '待处理')}</b> ${esc(x.ident)} ${esc(x.title).slice(0, 90)} <span class="muted small">· 已等 ${esc(age(x.ageMinutes))}</span></div>`).join('') + (items.length > 4 ? `<div class="muted small">另有 ${items.length - 4} 项</div>` : '') : '<span class="muted">没有需要领导决定的事 ✓</span>'
}
function row(name, value, total) { return `<div class="row"><span class="name">${esc(name)}</span><span class="mini-bar"><i style="width:${pctText(total ? value / total : 0)}"></i></span><span class="num">${value}/${total}</span></div>` }
function renderSlide(d) {
  const narrow = typeof innerWidth === 'number' && innerWidth <= 1100
  const rowsPerPage = narrow ? 2 : 4
  const projectPages = paginate((d.projects || []).slice(0, 7), rowsPerPage).map((items, i, all) => `<div class="slide"><h3>项目进度${all.length > 1 ? ` · ${i + 1}/${all.length}` : ''}</h3><div class="rows">${items.map((p) => row(p.name, p.done, p.total)).join('') || '<span class="muted">暂无项目数据</span>'}</div></div>`)
  const standupItems = d.highlights?.standup?.items || []
  const standupPages = paginate(standupItems, narrow ? 1 : 3).map((items, i, all) => `<div class="slide"><h3>今日晨会 · ${esc(d.highlights?.standup?.state || '未开始')}${all.length > 1 ? ` · ${i + 1}/${all.length}` : ''}</h3><div class="rows">${items.map((x) => `<div class="standup-item"><b>${esc(x.ident)} ${esc(x.title)}</b><br><span class="muted">负责人：${esc(x.assignee || '–')} · ${esc(x.outcome || '–')}</span></div>`).join('') || '<span class="muted">今天没有晨会项目</span>'}</div><span class="muted small">内容审批：${esc(d.highlights?.committee ? `${d.highlights.committee.state || '–'} · ${d.highlights.committee.items ?? 0} 项` : '–')} · 超时验收：${esc(d.highlights?.acceptance?.state || '暂无批次')}</span></div>`)
  const recentPages = paginate((d.highlights?.recentDone || []).slice(0, 5), narrow ? 1 : 3).map((items, i, all) => `<div class="slide"><h3>近期完成${all.length > 1 ? ` · ${i + 1}/${all.length}` : ''}</h3><div class="rows">${items.map((x) => `<div class="recent-item">${esc(x.text)}<br><span class="muted small">${esc(fmtDate(x.at))}</span></div>`).join('') || '<span class="muted">暂无近期完成记录</span>'}</div></div>`)
  const milestoneRows = (d.milestones || []).flatMap((p) => (p.milestones || []).map((m) => `<div class="row"><span class="name">${esc(m.id)} · ${esc(m.name)}</span><span class="badge ${m.status === 'done' || m.status === 'waived' ? 'ok' : m.overdue ? 'warn' : ''}">${m.status === 'done' || m.status === 'waived' ? '完成' : m.overdue ? daysText(m.daysLeft, true) : daysText(m.daysLeft)}</span></div>`))
  const milestonePages = paginate(milestoneRows, rowsPerPage).map((rows, i, all) => `<div class="slide"><h3>里程碑明细${all.length > 1 ? ` · ${i + 1}/${all.length}` : ''}</h3><div class="rows">${rows.join('') || '<span class="muted">暂无里程碑明细</span>'}</div></div>`)
  const pages = [
    ...projectPages,
    ...standupPages,
    ...recentPages,
    ...milestonePages
  ]
  slide = carouselPage(slide, pages.length); $('carouselBody').innerHTML = pages[slide]; $('dots').innerHTML = pages.map((_, i) => '<i class="' + (i === slide ? 'on' : '') + '" aria-label="第 ' + (i + 1) + ' 页"></i>').join('')
}
function render(d) {
  data = d; renderRisk(d); renderLaunch(d); renderDecisions(d); renderSlide(d)
  const h = d.headline || {}; $('todayBig').textContent = `${h.doneToday ?? '–'} / ${h.totalToday ?? '–'}`; $('duty').textContent = `${esc(h.weekday || '')} ${h.onDuty ? '上班中' : '已下班'} · 完成 ${h.doneToday ?? '–'} / 全部 ${h.totalToday ?? '–'}`
  $('stageTime').textContent = `数据 ${new Date(d.at || Date.now()).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false })}`
  const standup = d.highlights?.standup
  const key = h.date || d.at?.slice(0, 10)
  if (shouldShowBrief(key, standup)) {
    $('briefItems').innerHTML = (standup.items || []).map((x) => `<div>• ${esc(x.ident)} ${esc(x.title)} <span class="muted">（${esc(x.assignee || '–')}）</span></div>`).join('') || '<div>今天没有需要派发的项目</div>'
    $('brief').classList.add('show')
    try { localStorage.setItem(`office3d.wall.brief.${key}`, '1') } catch {}
    clearTimeout(briefTimer); briefTimer = setTimeout(() => $('brief').classList.remove('show'), 20000)
  }
}
function markFresh() { lastSuccess = Date.now(); failures = 0; $('cut').classList.remove('show'); $('lastAt').textContent = new Date(lastSuccess).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }); document.body.classList.remove('stale'); if (data) render(data) }
async function pull() { try { const r = await fetch('/wall/data', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); const d = await r.json(); lastSuccess = Date.now(); failures = 0; $('cut').classList.remove('show'); $('lastAt').textContent = new Date(lastSuccess).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }); render(d) } catch { failures++; if (data) render(data); if (failures >= 3) $('cut').classList.add('show') } }
function checkStale() { if (isStale(Date.now(), lastSuccess)) document.body.classList.add('stale') }
function nextShot() { const [key, label] = SHOTS[shot++ % SHOTS.length]; $('stageTag').textContent = label; try { const o = $('office').contentWindow.__office; if (o?.wallGo) o.wallGo(key) } catch {} }
if (typeof document !== 'undefined') {
  const fsButton = $('wallFullscreen')
  fsButton.onclick = () => {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    action.catch(() => { fsButton.title = '浏览器拒绝全屏，请重试'; fsButton.setAttribute('aria-label', fsButton.title) })
  }
  keepFullscreenAwake({ onStatus: status => { fsButton.title = '全屏 / 退出全屏 · ' + awakeMessage(status); fsButton.setAttribute('aria-label', fsButton.title); fsButton.style.borderColor = ['unsupported', 'denied', 'released'].includes(status) ? 'var(--red)' : 'var(--line)' } })
  const office = $('office'); office.addEventListener('error', () => $('fallback').classList.add('show')); office.addEventListener('load', () => $('fallback').classList.remove('show'))
  function shift() { if (reduceMotion) return; document.documentElement.style.setProperty('--shift-x', `${Math.sin(Date.now() / 60000) * 2}px`); document.documentElement.style.setProperty('--shift-y', `${Math.cos(Date.now() / 60000) * 2}px`); document.body.classList.add('shift') }
  setClock(); setInterval(setClock, 1000); pull(); setInterval(pull, 10000); setInterval(checkStale, 15000); setInterval(() => { slide++; if (data) renderSlide(data) }, 18000); setInterval(nextShot, 20000); setTimeout(nextShot, 12000); setInterval(shift, 60000); setTimeout(shift, 60000); setTimeout(() => location.reload(), 6 * 3600 * 1000)
}
