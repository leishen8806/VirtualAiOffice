// collab-graph.js — 「协作关系图」：在弹窗里用真实事件账本画 2D 有向图（浏览器模块，无依赖）。
// 硬规则：只画 GET /collab 给出的真实计数；不推断情感、不生成「好感/友情」；边上只有数字；
//         没有数据就写没有数据。不展示事件正文（text），只展示岗位名、次数与任务编号。
// 模块顶层不做任何 DOM / 全局访问，纯函数可以像 replay.js 那样在 Node 里以 data URL import 直接测试；
// 浏览器运行期入口是 createCollabGraph（由 ui.js 挂钩「治理 → 协作关系」）。
export const COLLAB_KINDS = ['dispatch', 'report', 'speak']
export const KIND_LABEL = { dispatch: '派单', report: '汇报', speak: '互动' }
export const EMPTY_NOTE = '账本里还没有足够的协作记录'
export const DISCLAIMER = '仅反映有记录的协作事件，不代表工作量或贡献'
export const NOT_ENOUGH_NOTE = '数据不足，仅供参考'
export const EDGE_WIDTH_MIN = 1.5 // 最小边宽
export const EDGE_WIDTH_MAX = 9 // 对数缩放的宽度上限，不再加粗

// ── T12b：窗口「含今天」说明与派生指标标题（纯函数，可测；文案从接口返回的数据生成，不另写死两处）──
// 金边当前时刻 hh:mm（+07，用浏览器本地时钟换算，与服务器端账本日期口径一致）
export const pnhHHMM = (ms = Date.now()) => {
  const t = new Date(Number(ms) + 7 * 3600000)
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
}
// 窗口含未完成的今天时的说明 pill（clock 形如 09:40，由 pnhHHMM 生成）
export const partialTodayPill = (clock) => `含今天（截至 ${clock}）`
// 一对一依赖的标题：阈值从接口返回的 thresholds 读，接口未给时退化为不含数字的通用标题
export const oneToOneLabel = (th) => {
  if (th && Number.isFinite(th.minOutForOneToOne) && Number.isFinite(th.oneToOneShare) && th.oneToOneShare >= 0 && th.oneToOneShare <= 1) {
    return `一对一依赖（出边 ≥${th.minOutForOneToOne} 次且 ≥${Math.round(th.oneToOneShare * 100)}% 指向同一对象）`
  }
  return '一对一依赖'
}

// ── 布局分组（与 collab.mjs / office-layout.js 的房间分组与颜色保持一致，改时三处同步）──
export const GROUP_ORDER = ['product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'board']
export const GROUP_LABEL = { product: '产品与设计', eng: '工程', quality: '质量与安全', drlife: 'Dr.life+', ops: '运维', kb: '知识库', board: '董事会' }
export const GROUP_COLOR = { product: '#8b6cff', eng: '#28b4d6', quality: '#e8963a', drlife: '#b69a64', ops: '#3fbf8f', kb: '#6c8cff', board: '#ffb020' }
export const LAYOUT_CELL = { w: 280, h: 240, cols: 4 } // 每格一个房间；4 列 × 2 行

// 有向边的键（一对岗位的双向互动是两个独立键）
export const edgeKey = (e) => `${e.from}\u2192${e.to}`

// 布局：按职能分组摆进网格，格内均匀撒在圆环上（确定、可测；不为窗口尺寸变化而跳动）。
export function layoutGroups(nodes, cell = LAYOUT_CELL) {
  const grid = { product: [0, 0], eng: [1, 0], quality: [2, 0], drlife: [3, 0], ops: [0, 1], kb: [1, 1], board: [2, 1] }
  const W = cell.cols * cell.w
  const H = 2 * cell.h
  const out = []
  const byGroup = new Map()
  for (const n of nodes || []) {
    if (!n || typeof n.id !== 'string') continue
    const g = GROUP_ORDER.includes(n.group) ? n.group : 'board' // 未知分组兜底居中（服务端已按 SEAT_GROUPS 分组，一般不会出现）
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g).push(n)
  }
  for (const [g, list] of byGroup) {
    const [c, r] = grid[g] || [1, 1]
    const cx = c * cell.w + cell.w / 2
    const cy = r * cell.h + cell.h / 2
    const radius = Math.min(cell.w, cell.h) / 2 - 26 // 留出节点半径与姓名标签
    list.forEach((n, i) => {
      const a = list.length === 1 ? -Math.PI / 2 : -Math.PI / 2 + (i / list.length) * 2 * Math.PI
      out.push({ id: n.id, group: g, x: Math.round((cx + Math.cos(a) * radius) * 10) / 10, y: Math.round((cy + Math.sin(a) * radius) * 10) / 10 })
    })
  }
  return { points: out, width: W, height: H }
}

// 边宽：count 的 2 为底对数，下限 EDGE_WIDTH_MIN、上限 EDGE_WIDTH_MAX。
export function edgeWidth(count, { min = EDGE_WIDTH_MIN, max = EDGE_WIDTH_MAX } = {}) {
  if (!(count > 0)) return min
  const w = min + 2 * Math.log2(count)
  return Math.max(min, Math.min(max, w))
}

// 悬停文字：A → B：派单 x · 汇报 y · 互动 z（只显示数字）
export function edgeTitle(e, names = {}) {
  const a = (names[e.from] || e.from) || '?'
  const b = (names[e.to] || e.to) || '?'
  return `${a} \u2192 ${b}：派单 ${e.dispatch || 0} · 汇报 ${e.report || 0} · 互动 ${e.speak || 0}`
}

// 点击岗位：高亮它的全部边，并列出协作对象与（入 / 出）次数。
// 返回 { edgeIds: 命中边的键, rows: [{id, from, to, total}], inCount, outCount }（rows 按 total 降序）。
export function focusNode(nodeId, edges) {
  const ids = []
  const map = new Map()
  for (const e of edges || []) {
    if (e.from === nodeId || e.to === nodeId) {
      ids.push(edgeKey(e))
      const partner = e.from === nodeId ? e.to : e.from
      const row = map.get(partner) || { id: partner, from: 0, to: 0 }
      if (e.from === nodeId) row.from += e.count || 0
      else row.to += e.count || 0
      map.set(partner, row)
    }
  }
  const rows = [...map.values()].map((r) => ({ id: r.id, from: r.from, to: r.to, total: r.from + r.to }))
  rows.sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1))
  return { edgeIds: ids, rows }
}

// ── 浏览器运行期：弹窗里的 2D 图 ──────────────────────────────────
// createCollabGraph({ esc, load }) → { attach(root) }
//   esc: 文本转义    load(query): async () => `/collab?${query}` 返回的 JSON（失败抛错，调用方负责 400/500 文案）
// attach(root) 把工具栏 + 图 + 右侧详情渲染进 root；仅 attach 时才请求数据、只绘制这一次；
// 宿主（ui.js 的 open/close）关闭弹窗即清空 DOM，本模块不挂全局监听、不留常驻开销。
export function createCollabGraph({ esc, load }) {
  const safe = (t) => (typeof esc === 'function' ? esc(t) : String(t ?? ''))
  const norm = (t) => (t == null || t === '' ? '\u2013' : t) // 数据缺失显示 –

  return { attach }

  function attach(root) {
    let win = '14'
    const kinds = new Set(COLLAB_KINDS)
    let data = null // 最后一次成功数据：加载失败时保留上次画面，只亮错误条
    let sel = null // 当前点中的岗位 id
    let zoom = 1
    let busy = false

    root.innerHTML =
      `<div class="cg-head">
        <div class="cg-notes" id="cgNotes"></div>
        <div class="cg-tools" role="group" aria-label="窗口与类型筛选">
          <span class="cg-lab">窗口</span>
          <button type="button" class="cg-btn" data-cg-win="7" aria-pressed="false">7 天</button>
          <button type="button" class="cg-btn on" data-cg-win="14" aria-pressed="true">14 天</button>
          <button type="button" class="cg-btn" data-cg-win="all" aria-pressed="false">全部</button>
          <span class="cg-sep"></span>
          <span class="cg-lab">类型</span>
          <label class="cg-chip"><input type="checkbox" data-cg-kind="dispatch" checked> 派单</label>
          <label class="cg-chip"><input type="checkbox" data-cg-kind="report" checked> 汇报</label>
          <label class="cg-chip"><input type="checkbox" data-cg-kind="speak" checked> 互动</label>
          <span class="cg-sep"></span>
          <button type="button" class="cg-btn" data-cg-zoom-out title="缩小" aria-label="缩小">－</button>
          <button type="button" class="cg-btn" data-cg-zoom-in title="放大" aria-label="放大">＋</button>
          <button type="button" class="cg-btn" data-cg-zoom-1 title="重置缩放" aria-label="重置缩放">重置</button>
          <span class="cg-sep"></span>
          <span class="cg-err" id="cgErr" hidden></span>
        </div>
      </div>
      <div class="cg-main">
        <div class="cg-graph"><div class="cg-scroll" id="cgScroll"><div class="cg-canvas" id="cgCanvas"></div></div></div>
        <aside class="cg-side" id="cgSide"></aside>
      </div>`

    root.querySelectorAll('[data-cg-win]').forEach((b) => (b.onclick = () => { win = b.dataset.cgWin; refreshMarks(); loadData() }))
    root.querySelectorAll('[data-cg-kind]').forEach((i) => (i.onchange = () => { if (i.checked) kinds.add(i.dataset.cgKind); else kinds.delete(i.dataset.cgKind); loadData() }))
    root.querySelector('[data-cg-zoom-in]').onclick = () => setZoom(zoom * 1.25)
    root.querySelector('[data-cg-zoom-out]').onclick = () => setZoom(zoom / 1.25)
    root.querySelector('[data-cg-zoom-1]').onclick = () => setZoom(1)
    root.addEventListener('click', (e) => {
      const g = e.target.closest('[data-cg-node]')
      if (g) { toggleSel(g.dataset.cgNode); return }
      if (e.target.closest('[data-cg-unsel]')) toggleSel(null)
    })
    root.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('[data-cg-node]')
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSel(g.dataset.cgNode === sel ? null : g.dataset.cgNode) } // Tab / Enter 键盘可达
    })

    function refreshMarks() {
      root.querySelectorAll('[data-cg-win]').forEach((b) => { b.classList.toggle('on', b.dataset.cgWin === win); b.setAttribute('aria-pressed', String(b.dataset.cgWin === win)) })
    }
    function setZoom(z) {
      zoom = Math.max(0.6, Math.min(2.5, Math.round(z * 100) / 100))
      const svg = root.querySelector('.cg-svg')
      if (svg) svg.style.width = 100 * zoom + '%'
    }
    function toggleSel(id) {
      sel = id === sel ? null : id
      if (!data) return
      paintGraph()
      paintSide()
    }
    async function loadData() {
      const err = root.querySelector('#cgErr')
      if (kinds.size === 0) { err.textContent = '至少选一种类型'; err.hidden = false; return }
      if (busy) { err.textContent = '读取中…；请稍候'; err.hidden = false; return }
      busy = true
      err.hidden = true
      try {
        const j = await load(`window=${win}&kinds=${[...kinds].join(',')}`)
        if (!root.isConnected) return // 弹窗已关：释放，不绘制
        data = j
        sel = sel && j.nodes && j.nodes.some((n) => n.id === sel) ? sel : null
        paintGraph()
        paintSide()
        paintNotes()
      } catch (e) {
        if (!root.isConnected) return
        err.textContent = '读取失败：' + safe((e && e.message) || e) + '（保留上次数据）'
        err.hidden = false
        if (!data) { // 首次就失败：图与右侧都是空态，不白屏
          paintGraphEmpty()
          paintSideError()
          paintNotes()
        }
      } finally {
        busy = false
      }
    }

    function paintNotes() {
      const box = root.querySelector('#cgNotes')
      if (!box) return
      const pills = []
      if (data && Array.isArray(data.notes)) pills.push(...data.notes)
      // T12b：窗口含今天（数据截至现在的未完成一天）时补一个「含今天（截至 hh:mm）」pill，金边时刻
      if (data && data.window && data.window.partialToday) pills.push(partialTodayPill(pnhHHMM()))
      box.innerHTML = pills.map((n) => `<span class="cg-pill">${safe(n)}</span>`).join(' ')
    }

    function paintGraphEmpty() {
      root.querySelector('#cgCanvas').innerHTML = `<div class="cg-empty">${safe(data && data.empty ? EMPTY_NOTE : '读取中…')}</div>`
      paintSideEmpty()
    }

    function paintGraph() {
      const canvas = root.querySelector('#cgCanvas')
      if (!data || !Array.isArray(data.nodes) || !data.nodes.length) { paintGraphEmpty(); return }
      const { points, width, height } = layoutGroups(data.nodes)
      const pos = new Map(points.map((p) => [p.id, p]))
      const nameOf = (id) => { const n = (data.nodes || []).find((x) => x.id === id); return (n && n.name) || id }
      const nameMap = {}; (data.nodes || []).forEach((n) => { nameMap[n.id] = n.name || n.id })
      const isolated = new Set((data.metrics && data.metrics.isolated) || [])
      const edges = data.edges || []
      const focus = sel ? focusNode(sel, edges) : null
      const focusIds = focus ? new Set(focus.edgeIds) : null
      const dim = sel ? 0.12 : 0.6 // 点中岗位时，其余边降到很淡

      // 反向边存在时把两条平行线错开，避免完全重叠
      const opp = new Set(edges.filter((e) => e.from !== e.to).map((e) => edgeKey({ from: e.to, to: e.from })))
      const edgeHtml = edges.map((e) => {
        const a = pos.get(e.from), b = pos.get(e.to)
        if (!a || !b) return ''
        const key = edgeKey(e)
        const on = focusIds && focusIds.has(key)
        const dx = b.x - a.x, dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        if (len < 0.001) return ''
        const ux = dx / len, uy = dy / len
        const R = 17 // 节点半径 + 描边
        const pad = 8 // 箭头长度
        let x1 = a.x + ux * R, y1 = a.y + uy * R
        let x2 = b.x - ux * (R + pad), y2 = b.y - uy * (R + pad)
        if (opp.has(key)) { // 双向边：各向外侧偏 4px
          const offx = -uy * 4, offy = ux * 4
          x1 += offx; y1 += offy; x2 += offx; y2 += offy
        }
        const w = edgeWidth(e.count)
        const cls = on ? 'cg-line on' : 'cg-line'
        const op = sel ? (on ? 1 : dim) : Math.min(0.85, 0.35 + 0.5 * Math.log2(e.count) / Math.log2(8))
        return `<g class="cg-edge" data-cg-edge="${safe(key)}" opacity="${op.toFixed(2)}"><line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w.toFixed(1)}" marker-end="url(#cgArr)"/><title>${safe(edgeTitle(e, nameMap))}</title></g>`
      }).join('')

      // 房间衬底 + 分组名（沿用 office 的色系，半透明下层）
      const grid = { product: [0, 0], eng: [1, 0], quality: [2, 0], drlife: [3, 0], ops: [0, 1], kb: [1, 1], board: [2, 1] }
      const cell = LAYOUT_CELL
      const cellHtml = GROUP_ORDER.map((g) => {
        const [c, r] = grid[g]
        const cx = c * cell.w + cell.w / 2
        const cy = r * cell.h + cell.h / 2
        const color = GROUP_COLOR[g]
        return `<rect class="cg-cell" x="${cx - cell.w / 2 + 8}" y="${cy - cell.h / 2 + 8}" width="${cell.w - 16}" height="${cell.h - 16}" rx="14" fill="${color}" opacity="0.07"/><text class="cg-group" x="${cx}" y="${cy - cell.h / 2 + 26}" fill="${color}">${safe(GROUP_LABEL[g] || g)}</text>`
      }).join('')

      const nodeHtml = (data.nodes || []).map((n) => {
        const p = pos.get(n.id)
        if (!p) return ''
        const color = GROUP_COLOR[n.group] || '#7c8494'
        const iso = isolated.has(n.id)
        const selOn = sel === n.id
        const fill = iso ? 'none' : color
        const stroke = iso ? '#6b7280' : selOn ? '#fff' : color
        const txt = iso ? '#7c8494' : '#e8ebf0'
        const cls = 'cg-node' + (iso ? ' iso' : '') + (selOn ? ' sel' : '')
        const aria = `${n.name || n.id}${iso ? '（窗口内无协作记录）' : `：入 ${norm(n.inCount)} / 出 ${norm(n.outCount)}`}`
        return `<g class="${cls}" data-cg-node="${safe(n.id)}" tabindex="0" role="button" aria-label="${safe(aria)}"><circle cx="${p.x}" cy="${p.y}" r="13" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text class="cg-nodename" x="${p.x}" y="${p.y + 30}">${safe(n.name || n.id)}</text><title>${safe(`${n.name || n.id} · 协作对象 ${(n.degreeIn || 0) + (n.degreeOut || 0)} 位（入 ${norm(n.degreeIn)} / 出 ${norm(n.degreeOut)}）· 事件行数入 ${norm(n.inCount)} / 出 ${norm(n.outCount)}`)}</title></g>`
      }).join('')

      canvas.innerHTML =
        `<svg class="cg-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="协作关系图：岗位之间的派单、汇报、互动" xmlns="http://www.w3.org/2000/svg">
          <defs><marker id="cgArr" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path class="cg-arrow" d="M0,0 L10,5 L0,10 z"/></marker></defs>
          ${cellHtml}${edgeHtml}${nodeHtml}
        </svg>`
      const svg = canvas.querySelector('.cg-svg')
      svg.style.width = 100 * zoom + '%'
    }

    function paintSideEmpty() {
      root.querySelector('#cgSide').innerHTML = `<h3>岗位详情与指标</h3><div class="note">${safe(data && data.notes && data.notes.length ? data.notes[0] : '读取中…')}</div>`
    }

    function paintSideError() {
      root.querySelector('#cgSide').innerHTML = `<h3>岗位详情与指标</h3><div class="note">服务端读取失败，请稍后再试</div><div class="note">${safe(DISCLAIMER)}</div>`
    }

    function paintSide() {
      const side = root.querySelector('#cgSide')
      if (!data) { paintSideEmpty(); return }
      const nodes = data.nodes || []
      const metrics = data.metrics || {}
      const nameOf = (id) => { const n = nodes.find((x) => x.id === id); return (n && n.name) || id }
      if (sel) {
        const n = nodes.find((x) => x.id === sel)
        if (!n) { paintSideEmpty(); return }
        const f = focusNode(sel, data.edges || [])
        const rows = f.rows.map((r) =>
          `<div class="cg-partner"><b>${safe(nameOf(r.id))}</b><span>${r.from ? `→ 出去 ${r.from}` : ''}${r.from && r.to ? ' · ' : ''}${r.to ? `← 进来 ${r.to}` : ''}<em>${r.total} 次</em></span></div>`).join('') || '<div class="note">窗口内没有协作边</div>'
        side.innerHTML =
          `<h3>${safe(n.name || n.id)}</h3>
           <div class="cg-meta">入边 ${norm(n.inCount)} 次 · ${norm(n.degreeIn)} 个对象 ｜ 出边 ${norm(n.outCount)} 次 · ${norm(n.degreeOut)} 个对象</div>
           <div class="sec">协作对象（点击图外空白取消选中）</div>${rows}
           <button type="button" class="cg-btn" data-cg-unsel>清除选中</button>
           <div class="note" style="margin-top:10px">${safe(DISCLAIMER)}</div>`
        side.querySelector('[data-cg-unsel]').onclick = () => toggleSel(null)
        return
      }
      const hubs = (metrics.hubs || []).map((h) => `<div class="cg-row"><b>${safe(nameOf(h.id))}</b><span>入边 ${norm(h.inCount)} 次</span></div>`).join('') || '<div class="note">窗口内没有入边记录</div>'
      const isolated = (metrics.isolated || []).map((id) => `<span class="cg-chip">${safe(nameOf(id))}</span>`).join('') || '<span class="note">无</span>'
      const o2 = (metrics.oneToOne || []).map((r) => `<div class="cg-row"><b>${safe(nameOf(r.id))}</b><span>出边 ${Math.round(r.share * 100)}% 指向 ${safe(nameOf(r.partner))}</span></div>`).join('') || '<div class="note">无</div>'
      side.innerHTML =
        `<h3>岗位详情与指标</h3>
         <div class="note">点击左侧岗位查看它的协作对象与次数；没有边的岗位灰色显示。</div>
         <div class="sec">汇聚点（入边最多，前 3）</div>${hubs}
         <div class="sec">孤立岗位（窗口内没有协作边）</div>${isolated ? `<div class="cg-chips">${isolated}</div>` : '<div class="note">无</div>'}
         <div class="sec">${safe(oneToOneLabel(data.thresholds))}</div>${o2}
         <div class="note" style="margin-top:10px">${safe(DISCLAIMER)}</div>`
    }

    loadData()
    return { close: () => { root.innerHTML = '' } } // 宿主关闭时调用可立即释放；通常依赖 modal 清空即可
  }
}