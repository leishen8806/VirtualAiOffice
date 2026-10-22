// replay.js — 「今日精彩回放」：真事件账本的时间压缩播放（浏览器模块，无依赖）。
// 硬规则：动画只来自真实事件账本；没有记录的时段只标灰色，不补演、不编造、不用随机对话填充。
// 模块顶层不做任何 DOM / 全局访问，纯函数可以在 Node 里以数据 URL import 直接测试；
// 浏览器运行期入口是 createReplay（只在本文件内部使用，app.js 只挂钩最小几处）。
export const GAP_MAX_MS = 2000 // 单个空档在时间轴上最多显示 2 秒
export const TOTAL_MAX_MS = 90000 // 整日回放总长默认 ≤ 90 秒
export const EV_MS = 1400 // 单条事件的默认显示时长
export const MIN_EV_MS = 300 // 事件本体压缩下限
export const SPEAK_WINDOW_MS = 5 * 60 * 1000 // speak 抽样时间窗：5 分钟
export const SPEAK_THRESHOLD = 300 // 超过 300 条才开始合并抽样
export const KEEP_KINDS = ['dispatch', 'report', 'celebrate', 'submit_to_board', 'board_decision'] // 抽样时一条都不丢

// ── 纯函数 ──────────────────────────────────────────────────────────

export function kindColor(kind) {
  return (
    {
      dispatch: '#6fa8ff',
      report: '#35d07f',
      celebrate: '#ffb020',
      speak: '#a3a7b0',
      submit_to_board: '#d9c08c',
      board_decision: '#ff8a8a',
    }[kind] || '#a3a7b0'
  )
}
export const KIND_LABEL = { dispatch: '派单', report: '交付', celebrate: '庆祝', speak: '聊天', submit_to_board: '上报', board_decision: '决定' }

// 金边时间 HH:MM（时间轴与结束画面用）
export function hhmm(atIso, tz = 'Asia/Phnom_Penh') {
  if (!atIso) return ''
  const d = new Date(atIso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

// 金边日期 YYYY-MM-DD 偏移 delta 天（纯函数，供「昨天」入口）
export function phShiftDay(day, delta = 0) {
  const d = new Date(String(day) + 'T00:00:00+07:00')
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + delta)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(d)
}

// speak 抽样：事件 > threshold 条时，同一 5 分钟时间窗内的 speak 只留第一条；
// dispatch / report / celebrate / submit_to_board / board_decision 一条都不丢。
export function sampleEvents(events, { threshold = SPEAK_THRESHOLD, windowMs = SPEAK_WINDOW_MS } = {}) {
  const list = Array.isArray(events)
    ? events.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))
    : []
  let dropped = 0
  let speakTotal = 0
  let speakKept = 0
  const kept = []
  const windowSpoken = new Set()
  for (const e of list) {
    if (!e) continue
    if (e.kind === 'speak') speakTotal++
  }
  for (const e of list) {
    if (!e || e.kind == null) continue
    if (list.length > threshold && e.kind === 'speak') {
      const ms = Date.parse(e.at)
      const wk = Number.isFinite(ms) ? Math.floor(ms / windowMs) : -1
      if (windowSpoken.has(wk)) { dropped++; continue }
      windowSpoken.add(wk)
      speakKept++
    } else if (e.kind === 'speak') speakKept++
    kept.push(e)
  }
  const critical = {}
  for (const k of KEEP_KINDS) critical[k] = 0
  for (const e of kept) if (e && critical[e.kind] !== undefined) critical[e.kind]++
  return { list: kept, dropped, sampled: dropped > 0, speakTotal, speakKept, critical }
}

// 时间压缩：真实空档压缩到 ≤gapMaxMs；整体超 totalMaxMs 时先压事件本体、再匀空档，最终 ≤ totalMaxMs。
export function compressTimeline(events, opts = {}) {
  const gapMaxMs = opts.gapMaxMs ?? GAP_MAX_MS
  const totalMaxMs = opts.totalMaxMs ?? TOTAL_MAX_MS
  const evMs = opts.evMs ?? EV_MS
  const minEvMs = opts.minEvMs ?? MIN_EV_MS
  const list = Array.isArray(events) ? events : []
  const n = list.length
  if (!n) return { events: [], zones: [], durationMs: 0 }
  const startMs = list.map((e) => Date.parse(e && e.at))
  let gaps = []
  for (let i = 1; i < n; i++) {
    const gi = startMs[i] - startMs[i - 1]
    gaps.push(Number.isFinite(gi) ? Math.max(0, Math.min(gapMaxMs, gi)) : 0)
  }
  let ev = evMs
  const bodyMax = totalMaxMs * 0.75 // 事件本体预算：总长 75%
  if (n * evMs > bodyMax) ev = Math.max(minEvMs, bodyMax / Math.max(n, 1))
  let sumGap = gaps.reduce((s, x) => s + x, 0)
  let raw = n * ev + sumGap
  if (raw > totalMaxMs && sumGap > 0) { // 先匀空档：把超出部分从空档里省出来
    gaps = gaps.map((g) => (g * Math.max(0, totalMaxMs - n * ev)) / sumGap)
    sumGap = gaps.reduce((s, x) => s + x, 0)
    raw = n * ev + sumGap
  }
  if (raw > totalMaxMs) { // 极端：事件本体就超预算（如 >300 条关键事件），均匀压到预算内
    ev = totalMaxMs / Math.max(n, 1)
    gaps = new Array(Math.max(0, n - 1)).fill(0)
  }
  const zones = []
  const out = []
  let cursor = 0
  for (let i = 0; i < n; i++) {
    out.push(Object.assign({}, list[i], { start: cursor, end: cursor + ev }))
    cursor += ev
    if (i < n - 1) {
      const g = gaps[i]
      if (g >= 250) zones.push({ from: cursor, to: cursor + g }) // 显示上的空档标「此时段没有记录」
      cursor += g
    }
  }
  return { events: out, zones, durationMs: cursor }
}

// 统计：与 events-ledger 的 countKinds 同口径（结束画面只用账本统计数字）
export function countKinds(records) {
  const counts = { dispatch: 0, report: 0, celebrate: 0, speak: 0, submit_to_board: 0, board_decision: 0 }
  for (const r of records || []) if (r && counts[r.kind] !== undefined) counts[r.kind]++
  return counts
}

// 完整计划：抽样 → 压缩；附原始统计（结束画面用）
export function planReplay(events, opts = {}) {
  const src = Array.isArray(events) ? events.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))) : []
  const counts = countKinds(src)
  const s = sampleEvents(src, opts)
  const c = compressTimeline(s.list, opts)
  return {
    data: c.events,
    zones: c.zones,
    durationMs: c.durationMs,
    sampled: s.sampled,
    dropped: s.dropped,
    speakTotal: s.speakTotal,
    speakKept: s.speakKept,
    critical: s.critical,
    counts, // 原始账本统计（不因抽样而变）
    firstAt: src.length ? src[0].at : null,
    lastAt: src.length ? src[src.length - 1].at : null,
    total: src.length,
  }
}

// 时间轴分段（着色 + 灰色空档）：彩色 = 事件、灰色 = 「此时段没有记录」
export function trackSegments(plan) {
  const S = (plan && plan.durationMs) || 1
  const segs = []
  for (const z of (plan && plan.zones) || []) segs.push({ kind: 'gap', color: '#3a3f47', from: Math.min(1, Math.max(0, z.from / S)), to: Math.min(1, Math.max(0, z.to / S)) })
  for (const e of (plan && plan.data) || []) segs.push({ kind: e.kind, color: kindColor(e.kind), from: Math.min(1, Math.max(0, e.start / S)), to: Math.min(1, Math.max(0, e.end / S)) })
  segs.sort((a, b) => a.from - b.from || a.to - b.to)
  return segs
}

// 跳转：显示时刻 t 对应的「下一个还没演完的事件」下标（= 播放游标 nextIdx 的值）
export function seekIndex(plan, t) {
  if (!plan || !plan.data || !plan.data.length) return 0
  const i = plan.data.findIndex((e) => e.end > t)
  return i < 0 ? plan.data.length : i
}

// ── 浏览器运行期：播放控制条 ─────────────────────────────────────────
// createReplay({ director, esc, today, load, onLive })
//   director: { enqueue(ev), clear() }   esc: 文本转义   today: () => 'YYYY-MM-DD'（金边）
//   load(date): async () => /replay 返回的 JSON（由 app.js 用 fetch 提供）
//   onLive(active): 回放开始 / 结束时回调，app.js 用它暂停 / 恢复实时事件接收
// 返回 { open(which), openDate(date), close(), active }
export function createReplay({ director, esc, today, load, onLive }) {
  const $ = (id) => document.getElementById(id)
  const safe = (t) => (typeof esc === 'function' ? esc(t) : String(t ?? ''))
  let shell = null // 复用容器
  let plan = null
  let t = 0 // 当前播放位置（显示毫秒）
  let playing = false
  let speed = 1
  let nextIdx = 0
  let raf = 0
  let lastFt = 0
  let onKey = null
  const TZ = 'Asia/Phnom_Penh'
  const api = {
    get active() {
      return !!shell && !shell.hidden
    },
    open: (which) => openDate(which === 'yesterday' ? phShiftDay(today(), -1) : today()),
    openDate,
    close,
  }

  function build() {
    if (shell) return shell
    shell = $('replayUI')
    shell.innerHTML =
      '<div class="rp-shell glass" id="rpShell">' +
      '  <div class="rp-badge">回放</div>' +
      '  <div class="rp-main">' +
      '    <div class="rp-top">' +
      '      <button type="button" id="rpPlay">⏸ 暂停</button>' +
      '      <button type="button" id="rpSpeed">速度：1×</button>' +
      '      <span id="rpClock">–</span>' +
      '      <button type="button" id="rpExit">✕ 退出</button>' +
      '    </div>' +
      '    <div class="rp-track" id="rpTrack"><div class="rp-tick" id="rpTick"></div></div>' +
      '    <div class="rp-meta" id="rpMeta"></div>' +
      '  </div>' +
      '</div>'
    // 事件绑定（只绑一次）
    $('rpPlay').addEventListener('click', () => { playing ? pause() : play() })
    $('rpSpeed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; updateSpeedBtn(); })
    $('rpExit').addEventListener('click', () => close())
    const track = $('rpTrack')
    const seekFrom = (clientX) => {
      const r = track.getBoundingClientRect()
      seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)))
    }
    const down = (e) => { seekFrom(e.clientX); track.__drag = true; track.setPointerCapture(e.pointerId) }
    const move = (e) => { if (track.__drag) seekFrom(e.clientX) }
    const up = (e) => { track.__drag = false; if (track.releasePointerCapture) try { track.releasePointerCapture(e.pointerId) } catch {} }
    track.addEventListener('pointerdown', down)
    track.addEventListener('pointermove', move)
    track.addEventListener('pointerup', up)
    track.addEventListener('pointercancel', up)
  }

  async function openDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return
    cancelAnimationFrame(raf)
    if (onKey) removeEventListener('keydown', onKey)
    onKey = null
    build()
    const data = await load(date)
    if (!data || data.available === false || !Array.isArray(data.events) || !data.events.length) {
      renderEmpty(date)
      return
    }
    plan = planReplay(data.events)
    t = 0
    nextIdx = 0
    playing = true
    speed = 1
    shell.hidden = false
    document.body.classList.add('replying')
    if (onLive) onLive(true) // 回放期间暂停接收实时事件（app.js 缓冲）
    $('rpShell').querySelector('.rp-badge').textContent = `回放 · ${safe(date)}`
    $('rpTick').style.display = 'block'
    renderMeta(false)
    updateSpeedBtn()
    updatePlayBtn()
    paintTrack()
    paintTick()
    lastFt = performance.now()
    onKey = (e) => {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); playing ? pause() : play() }
      else if (e.key === 'Escape') close()
    }
    addEventListener('keydown', onKey)
    raf = requestAnimationFrame(frame)
  }

  function renderEmpty(date) {
    plan = null
    playing = false
    shell.hidden = false
    document.body.classList.add('replying')
    if (onLive) onLive(true) // 空态也属回放模式：期间实时事件先缓冲
    $('rpShell').querySelector('.rp-badge').textContent = `回放 · ${safe(date)}`
    $('rpTick').style.display = 'none'
    $('rpTrack').style.background = '#2a2e35'
    $('rpMeta').textContent = `这一天没有记录（账本自上线起积累，今天之前不可回放是预期）`
    $('rpClock').textContent = '–'
    $('rpPlay').textContent = '▶ 开始'
    onKey = (e) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', onKey)
  }

  function frame(now) {
    if (!shell || shell.hidden) return
    const dt = Math.min(250, now - lastFt)
    lastFt = now
    if (playing && plan) {
      t += dt * speed
      if (t >= plan.durationMs) { t = plan.durationMs; finish() }
    }
    if (plan) {
      while (nextIdx < plan.data.length && plan.data[nextIdx].start <= t) {
        enqueueEvent(plan.data[nextIdx])
        nextIdx++
      }
    }
    paintTick()
    if (playing) raf = requestAnimationFrame(frame) // 暂停时停掉 rAF，省资源
    else cancelAnimationFrame(raf)
  }
  function play() { if (!plan) return; playing = true; lastFt = performance.now(); updatePlayBtn(); renderMeta(false); raf = requestAnimationFrame(frame) }
  function pause() { playing = false; updatePlayBtn(); cancelAnimationFrame(raf) }
  function finish() {
    playing = false
    updatePlayBtn()
    renderMeta(true)
  }
  function seek(ratio) {
    if (!plan) return
    t = ratio * plan.durationMs
    nextIdx = seekIndex(plan, t)
    director.clear()
    // 跳转后先就近演出几秒内的内容，避免画面空白
    for (let i = nextIdx; i < plan.data.length; i++) {
      const e = plan.data[i]
      if (e.start > t + 2000) break
      enqueueEvent(e)
      nextIdx++
    }
    paintTick()
    if (t >= plan.durationMs) finish()
  }
  function enqueueEvent(e) {
    const ev = {
      id: e.id, at: e.at, kind: e.kind,
      from: e.from && e.from.id, to: (e.to && e.to.id) || null,
      ref: e.ref, text: e.text,
    }
    director.enqueue(ev)
    syncClock(ev)
  }
  function syncClock(ev) {
    $('rpClock').textContent = hhmm(ev.at, TZ) || '–'
  }
  function updatePlayBtn() { $('rpPlay').textContent = playing ? '⏸ 暂停' : '▶ 继续' }
  function updateSpeedBtn() { $('rpSpeed').textContent = `速度：${speed}×` }
  function renderMeta(done) {
    if (!plan) return
    const meta = $('rpMeta')
    if (done) {
      meta.textContent =
        `整日共 ${plan.total} 件 · 派单 ${plan.counts.dispatch} · 交付 ${plan.counts.report} · 庆祝 ${plan.counts.celebrate}` +
        ` · 首件 ${hhmm(plan.firstAt, TZ)} · 末件 ${hhmm(plan.lastAt, TZ)}` +
        (plan.sampled ? ` · 聊天已抽样显示 ${plan.speakKept} / 共 ${plan.speakTotal} 条` : '')
    } else {
      meta.textContent = plan.sampled ? `已抽样显示 ${plan.speakKept} / 共 ${plan.speakTotal} 条聊天（关键事件一条不丢）` : ''
    }
  }
  function paintTrack() {
    const track = $('rpTrack')
    if (!plan) return
    const segs = trackSegments(plan)
    const stops = segs.map((s) => `${s.color} ${(s.from * 100).toFixed(3)}% ${(s.to * 100).toFixed(3)}%`).join(', ')
    track.style.background = stops ? `linear-gradient(to right, ${stops})` : '#2a2e35'
    track.style.backgroundSize = '100% 100%'
  }
  function paintTick() {
    if (!plan) return
    $('rpTick').style.left = `${(t / plan.durationMs) * 100}%`
  }
  function close() {
    cancelAnimationFrame(raf)
    if (onKey) removeEventListener('keydown', onKey)
    onKey = null
    if (director && director.clear) director.clear() // 演出复位，回到实时位置
    plan = null
    playing = false
    if (shell) shell.hidden = true // 保留 DOM 结构，下次直接复用
    document.body.classList.remove('replying')
    if (onLive) onLive(false) // 恢复实时事件接收
  }
  return api
}