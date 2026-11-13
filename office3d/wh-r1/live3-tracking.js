export const LIVE3_TRACKING_STATIONS = Object.freeze([
  Object.freeze({ id: 'receiving', label: '收货' }),
  Object.freeze({ id: 'quality', label: '质检' }),
  Object.freeze({ id: 'putaway', label: '上架' }),
  Object.freeze({ id: 'retrieve', label: '取货' }),
  Object.freeze({ id: 'picking', label: '拣货' }),
  Object.freeze({ id: 'conveyor', label: '输送' }),
  Object.freeze({ id: 'weighing', label: '称重' }),
  Object.freeze({ id: 'packing', label: '打包' }),
  Object.freeze({ id: 'staging', label: '集货' }),
  Object.freeze({ id: 'shipped', label: '出库' }),
])

const STAGE_INDEX = Object.freeze({ arrival: 0, quality: 1, putaway: 2, retrieve: 3, picking: 4, conveyor: 5, packing: 7, staging: 8, shipped: 9 })
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0))

const tracked = (item, nowMs) => {
  const index = STAGE_INDEX[item.stage] ?? 0
  const progress = item.stage === 'shipped' ? 1 : clamp(item.startedAt === null ? 0 : (nowMs - item.startedAt) / Math.max(1, item.completeAt - item.startedAt))
  return Object.freeze({
    itemId: item.itemId, waybill: item.waybill, orderId: item.orderId, destination: item.destination,
    weightKg: item.weightKg, stage: item.stage, stationIndex: index, station: LIVE3_TRACKING_STATIONS[index],
    progress: Math.min(100, Math.round(((index + progress) / (LIVE3_TRACKING_STATIONS.length - 1)) * 100)),
    elapsedSeconds: Math.max(0, Math.round((nowMs - item.createdAt) / 1000)),
    position: item.position || null,
  })
}

export function createLive3Tracking(snapshot) {
  let selectedId = null
  let followId = null
  let carouselIndex = 0
  let carouselAt = 0
  const rows = () => {
    const state = snapshot?.() || { nowMs: 0, items: [] }
    return state.items.filter(item => item.stage !== 'rejected').map(item => tracked(item, state.nowMs))
  }
  const current = () => rows().find(row => row.itemId === followId) || rows().find(row => row.itemId === selectedId) || null
  return {
    select(id) { selectedId = id || null; return rows().find(row => row.itemId === selectedId) || null },
    follow(id) { followId = id || null; selectedId = followId; return current() },
    tick(nowMs) {
      const available = rows()
      if (available.length && (carouselAt === 0 || nowMs - carouselAt >= 6000)) { carouselIndex = (carouselIndex + 1) % available.length; carouselAt = nowMs }
      return available[carouselIndex] || null
    },
    selected: current,
    carousel: () => rows()[carouselIndex] || null,
    summary: () => { const row = current(); return { selected: row, following: followId ? row : null, carousel: rows()[carouselIndex] || null, stations: LIVE3_TRACKING_STATIONS } },
  }
}
