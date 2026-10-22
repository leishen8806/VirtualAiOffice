import { buildSnapshot, deriveKpis, inventoryDisplay } from './dr-console-data.js'
import { campusMapSvg } from './dr-console-map.js'

const snapshot = buildSnapshot({ seed: 2808, timeSlice: 5 })
let zone = 'ALL'
const labels = ['总览', 'W1 智慧云仓', 'W2 订单周转中心', 'W3 集货物流中心', '运单管理', '库存管理', '作业监控', '设备管理', '数据报表']
const $ = (selector) => document.querySelector(selector)
const el = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node }
const appendRow = (target, title, detail, status, progress) => { const row = el('div', '', 'row'); const top = el('div', '', 'rowTop'); top.append(el('strong', title), el('span', status, 'status')); row.append(top, el('div', detail, 'unit')); if (progress != null) { const bar = el('div', '', 'bar'); const fill = el('i', ''); fill.style.width = `${progress}%`; bar.append(fill); row.append(bar) } target.append(row) }

function renderNav() {
  for (const name of labels) { const button = el('button', name); button.type = 'button'; button.addEventListener('click', () => setZone((name.match(/^(W\d)/) || [])[1] || 'ALL')); $('#topNav').append(button) }
  for (const name of ['园区总览', ...labels.slice(1)]) { const button = el('button', name); button.type = 'button'; button.addEventListener('click', () => setZone((name.match(/^(W\d)/) || [])[1] || 'ALL')); $('#sideNav').append(button) }
}

function renderKpis() {
  const kpi = deriveKpis(snapshot)
  const entries = [
    ['总库存', `${kpi.totalPallets.toLocaleString()} 托盘`, '分类托盘数推导'], ['今日入库', `${kpi.inbound} 托盘`, '托盘上架事件推导'],
    ['今日出库', `${kpi.outbound} 托盘`, '仅出库发运事件'], ['在库车辆', `${kpi.vehiclesInYard} 辆`, '车辆列表推导'],
    ['作业任务', `${kpi.activeTasks} / ${kpi.pendingTasks}`, '进行中 / 待处理'], ['准时交付率', `${kpi.onTimeRate}%`, '运单状态推导'],
    ['仓库利用率', `${kpi.utilization}%`, '已用库位 / 总库位', kpi.utilization], ['异常预警', `${kpi.alerts} 项`, '设备 / 库存 / 运单'],
  ]
  for (const [label, value, detail, percent] of entries) { const card = el('article', '', 'card'); card.append(el('div', label, 'label'), el('div', value, 'value'), el('div', detail, 'sub'), el('span', '演示数据 · 模拟', 'demo')); if (percent != null) { const bar = el('div', '', 'progress'); const fill = el('i', ''); fill.style.width = `${percent}%`; bar.append(fill); card.append(bar) } $('#kpis').append(card) }
}

function renderPanels() {
  const current = (item) => zone === 'ALL' || item.zone === zone
  const targets = ['waybills', 'inventory', 'events', 'devices']; targets.forEach((id) => { $(`#${id}`).replaceChildren() })
  snapshot.waybills.filter(current).forEach((item) => appendRow($('#waybills'), item.id, `${item.from} → ${item.to} · ${item.pallets} 托盘 · ${item.eta}`, item.status, item.progress))
  inventoryDisplay(snapshot).forEach((item) => appendRow($('#inventory'), item.name, `${item.pallets} 托盘 · ${item.sku} SKU · ${item.unit}独立展示`, `${item.share}%`, item.share))
  const eventZone = $('#eventFilter').value
  snapshot.events.filter((item) => (zone === 'ALL' || item.zone === zone) && (eventZone === 'ALL' || item.zone === eventZone)).forEach((item) => appendRow($('#events'), item.kind, `T+${item.at} · ${item.zone} · ${item.detail}`, '模拟'))
  snapshot.devices.forEach((item) => appendRow($('#devices'), item.name, `${item.normal} / ${item.total} · 仅展示数字`, '模拟'))
}

function setZone(next) {
  zone = next; $('#selected').textContent = next === 'ALL' ? '全部园区' : `${next} 已筛选`;
  document.querySelectorAll('[data-zone]').forEach((button) => button.classList.toggle('active', button.dataset.zone === zone)); $('#network').replaceChildren(); $('#network').insertAdjacentHTML('afterbegin', campusMapSvg(zone)); renderPanels()
}

function updateClock() { $('#clock').textContent = `金边 · ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Phnom_Penh' }).format(new Date())} · 示意天气` }
function setTheme(theme) { document.documentElement.dataset.theme = theme; $('#theme').textContent = theme === 'light' ? '深色' : '浅色' }

renderNav(); renderKpis(); document.querySelectorAll('.warehouse').forEach((button) => button.addEventListener('click', () => setZone(button.dataset.zone))); $('#eventFilter').addEventListener('change', renderPanels); $('#theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light')); document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden)); updateClock(); setInterval(() => { if (!document.hidden) updateClock() }, 5000); setZone('ALL')
