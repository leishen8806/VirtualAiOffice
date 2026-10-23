import { buildSnapshot, deriveKpis, inventoryDisplay } from './dr-console-data.js'
import { campusMapSvg } from './dr-console-map.js'
import { createDemoPageLifecycle } from './dr-console-demo.js'
import { renderKpiCards } from './dr-console-render.js'

const baseSnapshot = buildSnapshot({ seed: 2808, timeSlice: 5 })
let snapshot = baseSnapshot
let zone = 'ALL'
let taskFilter = '全部'
let activeView = '总览'
const $ = selector => document.querySelector(selector)
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node }
const navLabels = ['总览', 'W1 智慧云仓', 'W2 订单周转中心', 'W3 集货物流中心', '运单管理', '库存管理', '作业监控', '设备管理', '数据报表']
const paths = {
  warehouse: 'M3 9 12 3l9 6v12H3zM7 21v-9h10v9M7 15h10M7 18h10',
  truck: 'M2 6h12v12H2zM14 10h5l3 4v4h-8M5 18a2 2 0 1 0 4 0M16 18a2 2 0 1 0 4 0',
  box: 'm12 2 10 5v10l-10 5-10-5V7zM2 7l10 5 10-5M12 12v10M7 4.5l10 5',
  task: 'M4 4h16v18H4zM8 2h8v4H8zM8 11l2 2 5-5M8 17h8',
  chart: 'M3 3v18h19M7 17v-5h3v5M13 17V8h3v9M19 17V5h2v12',
  alert: 'm12 2 11 20H1zM12 9v5M12 18h.01',
  forklift: 'M3 5h7v11H3zM11 2h3v17h8M6 16a3 3 0 1 0 0 6M15 19a2 2 0 1 0 0 4',
  monitor: 'M2 3h20v14H2zM12 17v5M7 22h10M6 12l3-3 4 3 5-6',
}
function icon(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('class', 'icon'); node.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(node.namespaceURI, 'path')
  path.setAttribute('d', paths[name] || paths.warehouse); node.append(path); return node
}
function progress(value) { const bar = el('div', '', 'bar'); const fill = el('i'); fill.style.width = Math.max(0, Math.min(100, value)) + '%'; bar.append(fill); return bar }
function empty(target, text) { if (!target.children.length) target.append(el('p', text, 'empty')) }

function renderNav() {
  const sideLabels = ['园区总览', 'W1 智慧云仓', 'W2 订单周转', 'W3 物流配送', '运单管理', '库存管理', '设备监控', '作业流水', '数据报表', '告警中心']
  for (const [target, labels] of [[$('#topNav'), navLabels], [$('#sideNav'), sideLabels]]) {
    labels.forEach((name, index) => {
      const button = el('button'); button.type = 'button'; button.dataset.view = name
      if (target.id === 'sideNav') button.append(icon(['warehouse', 'warehouse', 'box', 'truck', 'truck', 'box', 'monitor', 'task', 'chart', 'alert'][index]))
      button.append(el('span', name))
      button.addEventListener('click', () => selectView(name))
      target.append(button)
    })
  }
  for (const label of ['全部', '进行中', '已完成', '异常']) {
    const button = el('button', label); button.type = 'button'
    button.addEventListener('click', () => { taskFilter = label; renderPanels() })
    $('#waybillFilters').append(button)
  }
}
function renderKpis() {
  const k = deriveKpis(snapshot)
  const entries = [
    ['总库存', k.totalPallets.toLocaleString('zh-CN'), '托盘', '分类托盘数汇总', 'box'],
    ['今日入库', k.inbound, '托盘', '托盘上架事件', 'warehouse'],
    ['今日出库', k.outbound, '托盘', '出库发运事件', 'truck'],
    ['在库车辆', k.vehiclesInYard, '辆', '园区内车辆', 'truck'],
    ['作业任务', k.activeTasks + k.pendingTasks, '单', '进行中 ' + k.activeTasks + ' | 待处理 ' + k.pendingTasks, 'task'],
    ['准时交付率', k.onTimeRate + '%', '', '由模拟运单推导', 'chart'],
    ['仓库利用率', k.utilization + '%', '', '已用库位 / 总库位', 'warehouse', k.utilization],
    ['异常预警', k.alerts, '项', snapshot.alerts.map(a => a.type + a.count).join(' | '), 'alert'],
  ]
  renderKpiCards($('#kpis'), entries, ([label, value, unit, detail, symbol, percent]) => {
    const card = el('article', '', 'card' + (symbol === 'alert' ? ' alert' : ''))
    const mark = el('span', '', 'kpiIcon'); mark.append(icon(symbol))
    const content = el('div'); const number = el('div', String(value), 'value'); number.append(el('small', unit))
    content.append(el('div', label, 'label'), number, el('div', detail, 'sub'))
    if (percent != null) content.append(progress(percent))
    card.append(mark, content); return card
  })
}
function renderPanels() {
  const current = item => zone === 'ALL' || item.zone === zone
  for (const id of ['waybills', 'inventory', 'events', 'devices']) $('#' + id).replaceChildren()
  const waybills = snapshot.waybills.filter(current).filter(item => taskFilter === '全部' || (taskFilter === '已完成' ? item.status === '已完成' : taskFilter === '异常' ? item.status === '异常' : item.status !== '已完成' && item.status !== '异常'))
  waybills.forEach(item => {
    const row = el('div', '', 'row'); const content = el('div', '', 'rowInfo'); const top = el('div', '', 'rowTop')
    top.append(el('strong', item.id.replace('DEMO-WB-', 'TRK-')), el('span', item.status, 'status' + (item.status === '已完成' ? ' done' : '')))
    content.append(top, el('div', item.from + ' → ' + item.to + '　' + item.progress + '% · ' + item.pallets + ' 托盘', 'unit'))
    row.append(icon('truck'), content, el('span', item.eta.replace('示意 ', ''), 'eta')); $('#waybills').append(row)
  })
  empty($('#waybills'), '当前筛选没有模拟运单')
  inventoryDisplay(snapshot).forEach(item => {
    const row = el('div', '', 'inventoryRow'); const name = el('span', item.name); name.prepend(el('span', '⬡', 'cube'))
    const bar = progress(item.share)
    row.append(name, el('strong', item.pallets.toLocaleString('zh-CN') + ' 托盘'), bar)
    row.title = item.sku + ' SKU；原计量单位：' + item.unit + '，不混合相加'; $('#inventory').append(row)
  })
  const eventZone = $('#eventFilter').value
  const events = snapshot.events.filter(item => current(item) && (eventZone === 'ALL' || item.zone === eventZone)).toReversed()
  events.forEach(item => {
    const row = el('tr')
    const minute = (18 + item.at * 2) % 60; for (const text of ['14:' + String(minute).padStart(2, '0'), item.kind, item.zone, item.pallets ? item.pallets + ' 托盘 · 模拟' : '演示事件']) row.append(el('td', text))
    $('#events').append(row)
  })
  if (!events.length) { const row = el('tr'); const cell = el('td', '当前筛选没有模拟事件', 'empty'); cell.colSpan = 4; row.append(cell); $('#events').append(row) }
  snapshot.devices.forEach((item, index) => {
    const device = el('div', '', 'device'); const details = el('div')
    details.append(el('small', item.name), el('strong', item.normal + '/' + item.total), el('p', item.normal === item.total ? '正常' : '部分占用', item.normal < item.total ? 'warning' : ''))
    device.append(icon(['box', 'forklift', 'box', 'warehouse', 'chart', 'monitor'][index]), details); $('#devices').append(device)
  })
  $('#waybillFilters').querySelectorAll('button').forEach(button => { button.classList.toggle('active', button.textContent === taskFilter); button.setAttribute('aria-pressed', String(button.textContent === taskFilter)) })
}
function selectView(name) {
  activeView = name
  setZone((name.match(/^(W\d)/) || [])[1] || 'ALL')
  const targets = { '运单管理': 'waybills', '库存管理': 'inventory', '作业监控': 'events', '作业流水': 'events', '设备管理': 'devices', '设备监控': 'devices', '数据报表': 'kpis', '告警中心': 'kpis' }
  if (targets[name]) $('#' + targets[name]).closest('.panel, .kpis').scrollIntoView({ block: 'nearest' })
}
function setZone(next) {
  zone = next
  $('#selected').textContent = next === 'ALL' ? (activeView === '总览' || activeView === '园区总览' ? '全部园区' : activeView + ' · 全部园区') : next + ' 已筛选'
  document.querySelectorAll('[data-zone]').forEach(button => { button.classList.toggle('active', button.dataset.zone === zone); button.setAttribute('aria-pressed', String(button.dataset.zone === zone)) })
  document.querySelectorAll('[data-view]').forEach(button => {
    const name = button.dataset.view
    const active = zone === 'ALL' ? name === activeView || (activeView === '总览' && name === '园区总览') : name.startsWith(zone)
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active))
  })
  $('#network').replaceChildren()
  $('#network').insertAdjacentHTML('afterbegin', campusMapSvg(zone))
  renderPanels()
}
function updateClock() {
  const now = new Date()
  $('#clock').replaceChildren(el('small', new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now)), el('strong', new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Phnom_Penh' }).format(now)))
}
function setTheme(theme) { document.documentElement.dataset.theme = theme; $('#theme').textContent = theme === 'light' ? '深色' : '浅色'; $('#theme').setAttribute('aria-pressed', String(theme === 'light')) }

// shortcut: 园区主体使用 W1/W2/W3 园区全景（dr-cam-overview）；需要自由机位时再接独立三维模型。
const plate = new Image()
plate.addEventListener('error', () => $('#campus').classList.add('imageFailed'))
plate.src = '/assets/demo/dr-cam-overview.webp'
renderNav(); renderKpis()
document.querySelectorAll('.warehouse').forEach(button => button.addEventListener('click', () => { activeView = button.dataset.zone; setZone(button.dataset.zone) }))
$('#eventFilter').addEventListener('change', renderPanels)
$('#theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'))
let timer
const demoDisplay = createDemoPageLifecycle({ root: document, baseSnapshot, onSnapshot: next => { snapshot = next; renderKpis(); renderPanels() } })
function syncClock() {
  clearInterval(timer)
  document.body.classList.toggle('paused', document.hidden)
  if (!document.hidden) { updateClock(); timer = setInterval(updateClock, 5000) }
}
document.addEventListener('visibilitychange', syncClock)
window.addEventListener('pagehide', () => { clearInterval(timer) })
window.addEventListener('pageshow', syncClock)
setZone('ALL'); syncClock()
