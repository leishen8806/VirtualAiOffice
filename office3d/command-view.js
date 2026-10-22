import { costCards, duration, measurement, playbackAllowed, reasonLabel, relationRows, responseKind, stageLabel, taskRows, timestamp } from './command-view-render.js'

const $ = (id) => document.getElementById(id)
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
let data = null, scenarios = [], slice = 0, selected = '', page = 0, timelinePage = 0, relation = 'organization'
let epoch = 0, controller = null, timer = null, busy = false, unavailable = false
const node = (tag, text, className = '') => {
  const element = document.createElement(tag)
  element.textContent = text
  element.className = className
  return element
}
function badge(stage) {
  const value = stageLabel(stage)
  const element = node('span', `${value.icon} ${value.label}`, 'badge')
  element.dataset.tone = value.tone
  return element
}
function record(parent, title, lines) {
  const element = node('article', '', 'record')
  element.append(node('h3', title))
  for (const line of lines) element.append(node('p', line))
  parent.append(element)
  return element
}
function stop() {
  clearTimeout(timer)
  timer = null
  $('play').textContent = '自动播放'
}
function controls() {
  const definition = scenarios.find((row) => row.id === $('scenario').value)
  const demo = $('mode').value === 'demo'
  const slices = definition?.timeSlices ?? 0
  $('scenario').disabled = !demo || busy || unavailable
  $('previous').disabled = !demo || busy || !data || slice <= 0
  $('next').disabled = !demo || busy || !data || slice >= slices - 1
  $('play').disabled = !data || !playbackAllowed({
    mode: $('mode').value, hidden: document.hidden, reduced: reduced.matches,
    stale: data?.quality.freshness.stale, animationAllowed: data?.quality.freshness.animationAllowed,
    busy, slice, slices,
  })
  $('sliceLabel').textContent = demo && definition ? `时间片 ${slice + 1} / ${slices}` : '时间片不适用'
}
function clear(message) {
  data = null
  selected = ''
  $('content').hidden = true
  $('notice').textContent = message
  document.body.dataset.stale = 'true'
  for (const id of ['queue', 'details', 'relations', 'timeline', 'metrics', 'scope', 'summary', 'quality']) $(id).replaceChildren()
}
function render() {
  if (!data) return
  const live = data.mode === 'live'
  const stale = data.quality.freshness.stale || (!live && data.quality.freshness.animationAllowed === false)
  document.body.dataset.stale = String(stale)
  if (stale) stop()
  $('content').hidden = false
  $('notice').textContent = live ? '只读真实数据 · 证据未接线，任务均为待验证（无证据）' : '只读合成快照 · 证据标 synthetic，不能作为真实验收'
  if (live) $('modeBanner').textContent = `live · KhmerX · 近 ${Math.round((Date.parse(data.scope.range.to) - Date.parse(data.scope.range.from)) / 86400000)} 天 · 本机 · 数据年龄：${duration(data.dataAgeMs)}`
  $('scope').textContent = `${data.company.name} · ${measurement(data.scope.project)} · ${timestamp(data.scope.range.from)} 至 ${timestamp(data.scope.range.to)}`
  $('quality').textContent = stale ? `? 更新中断 · ${reasonLabel(data.quality.freshness.reason)}` : live ? '真实数据 · 当前范围只读' : '→ 数据源时间有效 · 合成演示'
  $('summary').textContent = `任务：${measurement(data.summary.tasks)} ｜ 执行中：${measurement(data.summary.running)} ｜ 已验收：${measurement(data.summary.accepted)} ｜ 数据年龄：${duration(data.dataAgeMs)}`
  $('metrics').replaceChildren()
  for (const card of costCards(data.summary.cost)) {
    const element = node('section', '', 'metric')
    element.append(node('p', card.label, 'muted'), node('strong', card.value), node('small', card.note))
    $('metrics').append(element)
  }
  renderQueue()
  renderDetails()
  renderRelations()
  renderTimeline()
  controls()
}
function renderQueue() {
  const view = taskRows(data, { filter: $('filter').value, page })
  if (page >= view.pages) { page = view.pages - 1; return renderQueue() }
  $('queue').replaceChildren()
  for (const row of view.items) {
    const button = node('button', '', 'task')
    button.type = 'button'
    button.setAttribute('aria-pressed', String(selected === row.taskId))
    button.setAttribute('aria-label', `查看任务 ${row.title}`)
    button.append(node('strong', row.title), badge(row.stage),
      node('small', `原始状态：${row.rawStatus} · ${row.taskId}`),
      node('span', `${row.blockerText} · 下一处理人：${row.handlerText}`),
      node('small', `等待：${row.waitingText}${row.reasonText ? ` · ${row.reasonText}` : ''}`))
    button.onclick = () => {
      selected = row.taskId; timelinePage = 0; renderQueue(); renderDetails(); renderTimeline()
      if ($('mode').value === 'live') load({ taskId: row.taskId })
    }
    $('queue').append(button)
  }
  if (!view.items.length) $('queue').append(node('p', '暂无符合筛选的任务', 'muted'))
  $('queuePage').textContent = `${page + 1} / ${view.pages}`
  $('queuePrevious').disabled = page <= 0
  $('queueNext').disabled = page >= view.pages - 1
}
function renderDetails() {
  $('details').replaceChildren()
  const task = data.queue.find((row) => row.taskId === selected)
  if (!task) { $('details').append(node('p', '请选择任务', 'muted')); return }
  const heading = record($('details'), task.title, [
    `任务：${task.taskId}`, `原始状态：${task.rawStatus}`,
    `下一处理人：${measurement(task.nextHandler)}`, `等待：${duration(task.waitingMs)}`,
    task.stageReason ? reasonLabel(task.stageReason) : '阶段来自服务端证据投影',
  ])
  const failedDetail = data.quality.sources?.find(row => row.source === 'detail' && row.complete === false)
  if (data.mode === 'live' && failedDetail) heading.append(node('p', `详情读取失败 · ${reasonLabel(failedDetail.reason)}`, 'muted'))
  heading.append(badge(task.stage))
  for (const blocker of task.blockers || []) {
    if (blocker.blocker === 'none') continue
    const element = node('p', `${blocker.blocker === 'verification_failed' ? '! 明确失败' : '◇ 等待处理'} · ${blocker.blocker} · ${measurement(blocker.nextHandler)}`, 'badge')
    element.dataset.tone = blocker.blocker === 'verification_failed' ? 'failure' : 'waiting'
    heading.append(element)
  }
  const evidence = task.evidence?.value
  if (!evidence) record($('details'), '版本证据', [measurement(task.evidence), '待验证（无证据）'])
  else record($('details'), data.mode === 'demo' ? '版本证据 · synthetic' : '版本证据', [
    `产出版本：${evidence.subjectVersion}`, `保护测试：${evidence.protectedTestsHash ?? '未知'}`,
    data.mode === 'demo' ? '合成证据，不是真实验收' : '以服务端版本证据为准',
    ...evidence.records.map((row) => `${row.kind} · ${row.ok ? '记录通过（模拟）' : '记录失败（模拟）'} · ${row.actor} · ${row.ref}`),
  ])
  const runs = data.execution.items.filter((row) => row.taskId === selected)
  for (const run of runs) record($('details'), `运行 ${run.runId}`, [
    `状态：${run.status} · 执行者：${run.agentId}`,
    `模型：${measurement(run.model)} · 来源：${run.modelSource}`,
    `用量：${measurement(run.usage)} · 成本：${measurement(run.cost)}`,
    `开始：${measurement(run.startedAt, timestamp)} · 结束：${measurement(run.finishedAt, timestamp)}`,
  ])
  if (!runs.length) record($('details'), '运行', ['暂无运行记录'])
  if (!data.execution.complete) $('details').append(node('p', `未知 · ${reasonLabel(data.execution.reason)}`, 'muted'))
}
function renderRelations() {
  $('relations').replaceChildren()
  const view = relationRows(data.relations[relation], relation)
  if (view.notice) $('relations').append(node('p', view.notice, 'muted'))
  if (view.gap) $('relations').append(node('p', view.gap, 'muted'))
  for (const row of view.items) record($('relations'), `${row.from} → ${row.to}`, [`${row.type} · 来源 ${row.source} · ${row.confidence}`])
}
function renderTimeline() {
  $('timeline').replaceChildren()
  const items = data.timeline.items.filter((row) => !selected || row.taskId === selected)
  const pages = Math.max(1, Math.ceil(items.length / 20))
  timelinePage = Math.min(timelinePage, pages - 1)
  for (const row of items.slice(timelinePage * 20, timelinePage * 20 + 20)) {
    const element = record($('timeline'), row.type, [
      timestamp(row.at), `${row.operator} · ${row.source}`, row.stageReason ? reasonLabel(row.stageReason) : '阶段由服务端提供',
    ])
    element.append(badge(row.stage))
  }
  $('timelineGap').textContent = data.timeline.complete ? '已加载范围内事件' : `未知步骤 · ${reasonLabel(data.timeline.reason)}；未返回的步骤不补造`
  $('timelinePage').textContent = `${timelinePage + 1} / ${pages}`
  $('timelinePrevious').disabled = timelinePage <= 0
  $('timelineNext').disabled = timelinePage >= pages - 1
}
async function read(path, signal) {
  const response = await fetch(path, { cache: 'no-store', signal })
  if (!response.ok) {
    const error = new Error('read failed')
    error.status = response.status
    throw error
  }
  return response.json()
}
async function load({ metadata = false, taskId = null } = {}) {
  controller?.abort()
  const ticket = ++epoch
  controller = new AbortController()
  const active = controller
  const mode = $('mode').value
  busy = true
  unavailable = false
  if (taskId && mode === 'live') {
    $('details').replaceChildren(node('p', '正在读取详情…', 'muted'))
    $('notice').textContent = '正在读取详情…'
  } else clear('正在读取指挥视图…')
  controls()
  const timeout = setTimeout(() => active.abort(), 5000)
  try {
    if (mode === 'demo' && (metadata || !scenarios.length)) {
      const rows = await read('/command-view/scenarios', active.signal)
      if (ticket !== epoch) return
      if (!Array.isArray(rows) || !rows.length || rows.some((row) => !/^demo-[a-z0-9-]+$/.test(row.id) ||
          !Number.isInteger(row.timeSlices) || row.timeSlices < 1 || row.timeSlices > 200 || row.synthetic !== true)) throw new Error('invalid metadata')
      const previous = $('scenario').value
      scenarios = rows
      $('scenario').replaceChildren(...rows.map((row) => {
        const option = node('option', row.name)
        option.value = row.id
        return option
      }))
      if (rows.some((row) => row.id === previous)) $('scenario').value = previous
    }
    const query = mode === 'demo' ? new URLSearchParams({ mode, scenario: $('scenario').value, timeSlice: String(slice) }) : new URLSearchParams({ mode: 'live' })
    if (mode === 'live' && taskId) query.set('taskId', taskId)
    const body = await read(`/command-view?${query}`, active.signal)
    if (ticket !== epoch || document.hidden) return
    const kind = responseKind(body, mode)
    if (kind === 'empty') clear(body.reason === 'NO_AUTHORIZED_LIVE_SCOPE' ? '尚未授权 live 数据范围' : `真实数据暂无 · ${reasonLabel(body.reason)}`)
    else if (kind === 'data') {
      data = body
      selected = taskId && body.queue.some(row => row.taskId === taskId) ? taskId : mode === 'live' ? '' : body.queue[0]?.taskId ?? ''
      render()
    } else throw new Error('invalid data')
  } catch (error) {
    if (ticket !== epoch) return
    stop()
    unavailable = error.status === 404
    const message = error.status === 404 ? '指挥视图未开启（本机管理员可在服务端开启）'
      : error.status === 403 ? '当前访问权限不可读取指挥视图'
        : error.status === 429 ? '读取过于频繁，请稍后手动重试' : '指挥数据暂不可用，请手动重新读取'
    if (taskId && data?.mode === 'live' && ![403, 404].includes(error.status)) {
      $('details').replaceChildren(node('p', `详情读取失败 · ${message}`, 'muted'))
      $('notice').textContent = `更新中断 · ${message}`
      $('quality').textContent = `? 更新中断 · ${message}`
      document.body.dataset.stale = 'true'
    } else clear(message)
  } finally {
    clearTimeout(timeout)
    if (ticket === epoch) { busy = false; controls() }
  }
}
function schedule() {
  timer = setTimeout(async () => {
    if ($('play').disabled || document.hidden || reduced.matches) { stop(); return }
    slice++
    await load()
    if (timer && !$('play').disabled) schedule()
    else stop()
  }, 1800)
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme
  $('theme').textContent = theme === 'light' ? '切换深色' : '切换浅色'
  try { localStorage.setItem('vao.command.theme', theme) } catch {}
}
$('theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light')
$('mode').querySelector('option[value="live"]').textContent = '真实数据 · 本机授权'
$('mode').onchange = () => {
  stop(); slice = 0; page = 0; timelinePage = 0
  $('modeBanner').textContent = $('mode').value === 'demo' ? '合成演示 · 非真实数据' : 'live · 仅显示授权范围，当前无授权数据'
  load()
}
$('scenario').onchange = () => { stop(); slice = 0; page = 0; timelinePage = 0; load() }
$('previous').onclick = () => { stop(); slice--; load() }
$('next').onclick = () => { stop(); slice++; load() }
$('play').onclick = () => { if (timer) stop(); else { $('play').textContent = '暂停播放'; schedule() } }
$('reload').onclick = () => { stop(); load({ metadata: true }) }
$('filter').onchange = () => { page = 0; if (data) renderQueue() }
for (const stage of ['requirement_confirmed', 'claimed', 'executing', 'verifying', 'awaiting_acceptance', 'accepted', 'pending_verification']) {
  const option = node('option', stageLabel(stage).label)
  option.value = stage
  $('filter').append(option)
}
for (const [id, step, timeline] of [['queuePrevious', -1, false], ['queueNext', 1, false], ['timelinePrevious', -1, true], ['timelineNext', 1, true]]) {
  $(id).onclick = () => { if (timeline) { timelinePage += step; renderTimeline() } else { page += step; renderQueue() } }
}
for (const button of document.querySelectorAll('[data-relation]')) {
  button.onclick = () => {
    relation = button.dataset.relation
    for (const tab of document.querySelectorAll('[data-relation]')) tab.setAttribute('aria-selected', String(tab === button))
    if (data) renderRelations()
  }
}
for (const button of document.querySelectorAll('button[data-tab]')) {
  button.onclick = () => {
    document.body.dataset.tab = button.dataset.tab
    for (const tab of document.querySelectorAll('button[data-tab]')) tab.setAttribute('aria-selected', String(tab === button))
  }
}
for (const list of document.querySelectorAll('[role="tablist"]')) {
  list.addEventListener('keydown', (event) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    const tabs = [...list.querySelectorAll('[role="tab"]')]
    const current = tabs.indexOf(document.activeElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    event.preventDefault(); tabs[index].focus(); tabs[index].click()
  })
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { stop(); $('play').focus() } })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop(); epoch++; controller?.abort(); busy = false; controls()
  }
})
reduced.addEventListener('change', () => { if (reduced.matches) stop(); controls() })
addEventListener('pagehide', () => { stop(); epoch++; controller?.abort() })
try { setTheme(localStorage.getItem('vao.command.theme') === 'dark' ? 'dark' : 'light') } catch { setTheme('light') }
load({ metadata: true })
