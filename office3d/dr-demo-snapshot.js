import { buildSnapshot } from './dr-console-data.js'

export const DEMO_REFRESH_MS = 1800
export const DEMO_BASE_SNAPSHOT = Object.freeze(
  buildSnapshot({ seed: 2808, timeSlice: 5 }),
)
const DEMO_CLOCK_ORIGIN = typeof performance === 'undefined'
  ? 0
  : performance.now()

const EVENTS = Object.freeze([
  ['入库上架', 'W1', '托盘进入智慧云仓'],
  ['区内周转', 'W2', '订单进入复核队列'],
  ['复核完成', 'W2', '分拣结果已确认'],
  ['发运出库', 'W3', '车辆驶向配送区'],
])

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function normalizedDemoElapsed(elapsedMs) {
  const numeric = Number(elapsedMs)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

export function sharedDemoElapsedNow(nowMs = performance.now()) {
  return normalizedDemoElapsed(Number(nowMs) - DEMO_CLOCK_ORIGIN)
}

export function demoSnapshotAt(base = DEMO_BASE_SNAPSHOT, elapsedMs = 0) {
  const tick = Math.floor(normalizedDemoElapsed(elapsedMs) / DEMO_REFRESH_MS)
  const snapshot = clone(base)
  const eventIndex = tick % EVENTS.length
  const visible = EVENTS.slice(0, eventIndex + 1)
  snapshot.generatedAt = `demo-motion-${tick}`
  snapshot.events = [
    ...(base.events || []),
    ...visible.map(([kind, zone, detail], index) => ({
      id: `motion-${Math.floor(tick / EVENTS.length)}-${index}`,
      at: tick + index,
      kind,
      zone,
      pallets: index === 3 ? 16 : 8,
      detail: `${detail} · 模拟`,
      demo: true,
    })),
  ].slice(-8)
  snapshot.waybills = snapshot.waybills.map((item, index) => ({
    ...item,
    progress: Math.min(100, item.progress + ((tick + index) % 5) * 3),
    status: index === eventIndex ? '处理中' : item.status,
  }))
  snapshot.tasks = snapshot.tasks.map((item, index) => ({
    ...item,
    status: index === eventIndex % snapshot.tasks.length
      ? '进行中'
      : item.status,
  }))
  return snapshot
}

export function sharedDemoSnapshotAt(elapsedMs) {
  return demoSnapshotAt(DEMO_BASE_SNAPSHOT, elapsedMs)
}
