import { trayModel } from './home-editor-logic.js'
import { getHomeItem, starterInventory } from './home-room.js'

export const INVENTORY_CATEGORIES = Object.freeze({
  furniture: '家具', decor: '装饰', plant: '植物', light: '灯', wall_art: '挂画', rug: '地毯',
})
const DEFINITIONS = Object.freeze([
  ['bed_single', '单人床', 'furniture'], ['sofa_two', '双人沙发', 'furniture'],
  ['table_dining', '餐桌', 'furniture'], ['chair_wood', '木椅', 'furniture'],
  ['desk_work', '书桌', 'furniture'], ['wardrobe', '衣柜', 'furniture'],
  ['bookshelf', '书架', 'furniture'], ['tv_stand', '电视柜', 'furniture'],
  ['plant_pot', '盆栽', 'plant'], ['lamp_floor', '落地灯', 'light'],
  ['rug_round', '圆形地毯', 'rug'], ['frame_art', '挂画', 'wall_art'],
].map(([id, name, category]) => Object.freeze({ id, name, category, footprint: getHomeItem(id).footprint })))

export function canShowHomeEntry({ fullAccess = false, lan = false, wall = false } = {}) {
  return fullAccess === true && lan === false && wall === false
}

export function inventoryRows(inventory = [], layout = {}) {
  const entries = Array.isArray(inventory) ? inventory : []
  const counts = new Map(trayModel(entries, layout).map((entry) => [entry.itemId, entry]))
  return DEFINITIONS.map((item) => ({
    ...item,
    ...counts.get(item.id),
    source: entries.some((entry) => entry.itemId === item.id && entry.source && entry.source !== 'starter') ? '来源暂无' : '初始赠送',
  }))
}

export function inventorySummary(rows) {
  return rows.reduce((summary, row) => ({
    types: summary.types + Number(row.owned > 0),
    owned: summary.owned + row.owned,
    placed: summary.placed + row.placed,
    remaining: summary.remaining + row.remaining,
  }), { types: 0, owned: 0, placed: 0, remaining: 0 })
}

export function filterInventory(rows, { query = '', category = '' } = {}) {
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => (!category || row.category === category) &&
    words.every((word) => `${row.name} ${row.id} ${INVENTORY_CATEGORIES[row.category]}`.toLowerCase().includes(word)))
    .slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

async function mountInventory(root) {
  const notice = root.querySelector('#inventoryNotice')
  const summary = root.querySelector('#inventorySummary')
  const list = root.querySelector('#inventoryList')
  const search = root.querySelector('#inventorySearch')
  const category = root.querySelector('#inventoryCategory')
  let rows = []
  const element = (tag, text, className = '') => {
    const node = document.createElement(tag)
    node.textContent = text
    node.className = className
    return node
  }
  for (const [value, label] of Object.entries(INVENTORY_CATEGORIES)) {
    const option = element('option', label)
    option.value = value
    category.append(option)
  }
  const draw = () => {
    const total = inventorySummary(rows)
    summary.textContent = `${total.types} 种 · 拥有 ${total.owned} 件 · 已摆放 ${total.placed} 件 · 剩余 ${total.remaining} 件`
    list.replaceChildren()
    const groups = new Map()
    for (const row of filterInventory(rows, { query: search.value, category: category.value })) {
      if (!groups.has(row.category)) groups.set(row.category, [])
      groups.get(row.category).push(row)
    }
    for (const [key, label] of Object.entries(INVENTORY_CATEGORIES)) {
      if (!groups.has(key)) continue
      const section = element('section', '', 'inventory-group')
      section.append(element('h2', label))
      const grid = element('div', '', 'inventory-grid')
      for (const row of groups.get(key)) {
        const card = element('article', '', 'inventory-card glass')
        card.dataset.itemId = row.id
        const thumbnail = element('div', '', 'footprint')
        thumbnail.setAttribute('role', 'img')
        thumbnail.setAttribute('aria-label', `${row.name}占用 ${row.footprint.w} 乘 ${row.footprint.d} 格示意`)
        thumbnail.style.gridTemplateColumns = `repeat(${row.footprint.w}, 16px)`
        for (let cell = 0; cell < row.footprint.w * row.footprint.d; cell++) thumbnail.append(element('span', ''))
        const heading = element('h3', row.name)
        const count = element('p', `拥有 ${row.owned} · 已摆放 ${row.placed} · 剩余 ${row.remaining}`)
        const link = element('a', '去布置', 'button')
        link.href = `/home.html?item=${encodeURIComponent(row.id)}`
        link.setAttribute('aria-label', `${row.name}去布置`)
        card.append(thumbnail, heading, element('p', `占用格 ${row.footprint.w}×${row.footprint.d}`),
          count, element('p', row.source, 'source'), link)
        grid.append(card)
      }
      section.append(grid)
      list.append(section)
    }
    if (!groups.size) list.append(element('p', '没有匹配的物品', 'empty'))
  }
  search.addEventListener('input', draw)
  category.addEventListener('change', draw)
  root.querySelector('#inventoryTheme').addEventListener('click', () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
  })
  const load = async () => {
    notice.textContent = '正在读取本机库存…'
    try {
      const response = await fetch('/town/home/layout', { method: 'GET', cache: 'no-store', redirect: 'error' })
      if (response.status === 404 || response.status === 403) {
        rows = inventoryRows(starterInventory(), { placements: [] })
        notice.textContent = `${response.status === 403 ? '仅本机可读取保存的库存' : '个人空间保存未开启'} · 演示库存，未读取本机布置`
      } else if (response.ok) {
        const data = await response.json()
        if (!Array.isArray(data.inventory) || !Array.isArray(data.layout?.placements)) throw new Error('invalid')
        rows = inventoryRows(data.inventory, data.layout)
        notice.textContent = data.status === 'corrupt' ? '已读取本机库存；布置文件损坏，使用默认布置' : '已读取本机库存与布置'
      } else throw new Error('unavailable')
    } catch {
      rows = []
      notice.textContent = '库存暂不可用，点击重新读取重试'
    }
    draw()
  }
  root.querySelector('#inventoryReload').addEventListener('click', load)
  await load()
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#homeInventory')
  if (root) mountInventory(root).catch(() => {
    root.querySelector('#inventoryNotice').textContent = '库存面板暂不可用'
  })
}
