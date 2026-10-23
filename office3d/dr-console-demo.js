const FLOW_PATHS = Object.freeze([
  { id: 'inbound', color: '#52d5ff', points: [[.18,.64],[.31,.58],[.42,.60]] },
  { id: 'turnover', color: '#ffd05c', points: [[.42,.60],[.55,.52],[.66,.58]] },
  { id: 'review', color: '#ff9d42', points: [[.66,.58],[.73,.48],[.80,.55]] },
  { id: 'dispatch', color: '#5df08b', points: [[.80,.55],[.88,.45],[.94,.38]] },
])
const EVENTS = Object.freeze([
  ['入库上架', 'W1', '托盘进入智慧云仓'],
  ['区内周转', 'W2', '订单进入复核队列'],
  ['复核完成', 'W2', '分拣结果已确认'],
  ['发运出库', 'W3', '车辆驶向配送区'],
])

function clone(value) { return JSON.parse(JSON.stringify(value)) }
export function demoSnapshotAt(base, elapsedMs) {
  const tick = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1800))
  const snapshot = clone(base)
  const eventIndex = tick % EVENTS.length
  const visible = EVENTS.slice(0, (tick % EVENTS.length) + 1)
  snapshot.generatedAt = `demo-motion-${tick}`
  snapshot.events = [...(base.events || []), ...visible.map(([kind, zone, detail], index) => ({
    id: `motion-${Math.floor(tick / EVENTS.length)}-${index}`,
    at: tick + index,
    kind, zone, pallets: index === 3 ? 16 : 8, detail: `${detail} · 模拟`, demo: true,
  }))].slice(-8)
  snapshot.waybills = snapshot.waybills.map((item, index) => ({
    ...item,
    progress: Math.min(100, item.progress + ((tick + index) % 5) * 3),
    status: index === eventIndex ? '处理中' : item.status,
  }))
  snapshot.tasks = snapshot.tasks.map((item, index) => ({ ...item, status: index === eventIndex % snapshot.tasks.length ? '进行中' : item.status }))
  return snapshot
}

export function flowCanvasDpr({
  viewportWidth = globalThis.innerWidth || 0,
  devicePixelRatio = globalThis.devicePixelRatio || 1,
} = {}) {
  return Math.min(viewportWidth >= 2560 ? 3 : 2, Math.max(1, devicePixelRatio))
}

function resizeFlowCanvas(canvas, windowRef) {
  const rect = canvas.getBoundingClientRect()
  const dpr = flowCanvasDpr({
    viewportWidth: windowRef?.innerWidth,
    devicePixelRatio: windowRef?.devicePixelRatio,
  })
  const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
  return { width, height, dpr }
}

function drawFlow(canvas, elapsedMs, windowRef) {
  const { width, height, dpr } = resizeFlowCanvas(canvas, windowRef)
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const pulse = (elapsedMs % 1800) / 1800
  for (const flow of FLOW_PATHS) {
    ctx.strokeStyle = `${flow.color}88`; ctx.lineWidth = 2.5 * dpr; ctx.setLineDash([8 * dpr, 8 * dpr]); ctx.lineDashOffset = -elapsedMs / 35
    ctx.beginPath(); flow.points.forEach(([x, y], index) => index ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)); ctx.stroke(); ctx.setLineDash([])
    const [x, y] = flow.points[Math.min(flow.points.length - 1, Math.floor(pulse * flow.points.length))]
    ctx.fillStyle = flow.color; ctx.shadowColor = flow.color; ctx.shadowBlur = 10 * dpr; ctx.beginPath(); ctx.arc(x * width, y * height, 4 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
  }
}

export function createDemoDisplay({
  root = document,
  baseSnapshot,
  onSnapshot = () => {},
  now = () => performance.now(),
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
} = {}) {
  const canvas = root.querySelector('#flowOverlay'), toggle = root.querySelector('#motionToggle'), status = root.querySelector('#motionState')
  if (!canvas || !toggle) return { start() {}, stop() {}, dispose() {}, isRunning: () => false }
  const previous = root.__drConsoleDemoDisplay
  previous?.dispose()
  let running = false, disposed = false, raf = 0, epoch = 0, lastTick = -1
  const update = (stamp) => {
    if (!running) return
    const elapsed = Math.max(0, stamp - epoch); const tick = Math.floor(elapsed / 1800)
    if (tick !== lastTick) { lastTick = tick; onSnapshot(demoSnapshotAt(baseSnapshot, elapsed)) }
    drawFlow(canvas, elapsed, windowRef); raf = requestFrame(update)
  }
  const setState = () => { toggle.textContent = running ? '停止动态演示' : '启动动态演示'; toggle.setAttribute('aria-pressed', String(running)); status.textContent = running ? '动态演示 · 模拟' : '静态演示 · 默认关闭' }
  const reset = () => {
    lastTick = -1
    const { width, height } = resizeFlowCanvas(canvas, windowRef)
    canvas.getContext('2d')?.clearRect(0, 0, width, height)
    onSnapshot(baseSnapshot)
    setState()
  }
  const start = () => {
    if (disposed || running || documentRef?.hidden) return
    running = true; epoch = now(); lastTick = -1; setState(); raf = requestFrame(update)
  }
  const stop = () => {
    running = false
    if (raf) cancelFrame(raf)
    raf = 0
    reset()
  }
  const onVisibility = () => { if (documentRef.hidden) stop() }
  const onResize = () => {
    if (running) drawFlow(canvas, Math.max(0, now() - epoch), windowRef)
    else reset()
  }
  const onToggle = () => running ? stop() : start()
  toggle.addEventListener('click', onToggle)
  documentRef?.addEventListener?.('visibilitychange', onVisibility)
  windowRef?.addEventListener?.('resize', onResize)
  reset()
  const api = {
    start,
    stop,
    dispose() {
      if (disposed) return
      stop()
      disposed = true
      documentRef?.removeEventListener?.('visibilitychange', onVisibility)
      windowRef?.removeEventListener?.('resize', onResize)
      toggle.removeEventListener?.('click', onToggle)
      if (root.__drConsoleDemoDisplay === api) delete root.__drConsoleDemoDisplay
    },
    isRunning: () => running,
  }
  root.__drConsoleDemoDisplay = api
  return api
}

export function createDemoPageLifecycle({
  root = document,
  windowRef = globalThis.window,
  ...displayOptions
} = {}) {
  let display = null
  let disposed = false
  const mount = () => {
    if (disposed) return null
    display?.dispose()
    display = createDemoDisplay({ root, windowRef, ...displayOptions })
    return display
  }
  const onPageHide = () => {
    display?.dispose()
    display = null
  }
  const onPageShow = () => mount()
  windowRef?.addEventListener?.('pagehide', onPageHide)
  windowRef?.addEventListener?.('pageshow', onPageShow)
  mount()
  return {
    start: () => display?.start(),
    stop: () => display?.stop(),
    isRunning: () => display?.isRunning() || false,
    dispose() {
      if (disposed) return
      disposed = true
      display?.dispose()
      display = null
      windowRef?.removeEventListener?.('pagehide', onPageHide)
      windowRef?.removeEventListener?.('pageshow', onPageShow)
    },
  }
}
