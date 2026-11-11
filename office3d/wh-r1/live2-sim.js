// LIVE-2 is the warehouse process model.  It owns the one clock used by the
// renderer; the renderer only projects item positions from this state.
export const LIVE2_STAGE_CONFIG = Object.freeze({
  arrival: Object.freeze({ durationMs: 700, workers: 2 }),
  quality: Object.freeze({ durationMs: 1400, workers: 2 }),
  putaway: Object.freeze({ durationMs: 1000, workers: 2 }),
  retrieve: Object.freeze({ durationMs: 1200, workers: 4 }),
  picking: Object.freeze({ durationMs: 1500, workers: 3 }),
  conveyor: Object.freeze({ durationMs: 1800, workers: 1 }),
  packing: Object.freeze({ durationMs: 1600, workers: 3 }),
  staging: Object.freeze({ durationMs: 1200, workers: 2 }),
})
export const LIVE2_STAGES = Object.freeze(Object.keys(LIVE2_STAGE_CONFIG))
export const WH_R1_DESTINATIONS = Object.freeze(['金边', '暹粒', '西哈努克', '马德望', '贡布', '磅湛'])
const MAX_QUEUE = 32
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const mulberry32 = seed => { let v = seed >>> 0; return () => { v |= 0; v = v + 0x6D2B79F5 | 0; let t = Math.imul(v ^ v >>> 15, 1 | v); t = t + Math.imul(t ^ t >>> 7, 61 | 0) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const idsOrDefault = ids => Array.isArray(ids) && ids.length ? ids.slice() : Array.from({ length: 192 }, (_, i) => `slot-${String(i + 1).padStart(3, '0')}`)
const genericOrder = ({ seed = 20261107, alternateKinds = false } = {}) => {
  const random = mulberry32(seed)
  const cargoRandom = mulberry32(seed ^ 0x2c6bc12f)
  let nextInbound = true
  return Object.freeze({ next: ({ nowMs, inventory }) => {
    const occupied = inventory.filter(slot => slot.status === 'occupied').length
    const empty = inventory.length - occupied
    if (!occupied && !empty) return null
    const inbound = random() < .55
    const kind = occupied && empty ? ((alternateKinds ? nextInbound : inbound) ? 'inbound' : 'outbound') : (empty ? 'inbound' : 'outbound')
    nextInbound = kind !== 'inbound'
    return { orderId: `SIM-${Math.floor(nowMs).toString(36)}-${Math.floor(random() * 0xffff).toString(36)}`, weightKg: 1 + Math.floor(cargoRandom() * 30), destination: WH_R1_DESTINATIONS[Math.floor(cargoRandom() * WH_R1_DESTINATIONS.length)], sku: `SKU-${1 + Math.floor(random() * 3)}`, quantity: 1, status: 'queued', timestamp: nowMs, kind }
  } })
}

export function createLive2Simulation({ seed = 20261107, slotIds, preferSlot = () => false, multiplier = 8, alternateKinds = false, orderSource = genericOrder({ seed, alternateKinds }), nowMs = 0, stageConfig = LIVE2_STAGE_CONFIG, orderIntervalMs = 4500 } = {}) {
  const ids = idsOrDefault(slotIds), random = mulberry32(seed ^ 0x7f4a7c15), listeners = new Set(), events = []
  const exceptionRandom = mulberry32(seed ^ 0x523772ff)
  const initialCount = Math.round(ids.length * .6)
  const initialOccupied = new Set(Array.from({ length: initialCount }, (_, i) => Math.floor(i * ids.length / initialCount)))
  const slots = ids.map((id, i) => ({ id, status: initialOccupied.has(i) ? 'occupied' : 'empty', sku: initialOccupied.has(i) ? `SKU-${i % 3 + 1}` : null, boxType: i % 3 }))
  const storedCargo = new Map()
  const initialOnHand = initialCount, queues = Object.fromEntries(LIVE2_STAGES.map(stage => [stage, []]))
  const active = Object.fromEntries(LIVE2_STAGES.map(stage => [stage, []]))
  const nextStageStart = Object.fromEntries(LIVE2_STAGES.map(stage => [stage, -Infinity]))
  const items = [], counters = { inbound: 0, outbound: 0, shipped: 0, received: 0, rejected: 0, exceptions: 0 }
  const completedByStage = Object.fromEntries(LIVE2_STAGES.map(stage => [stage, 0]))
  let processingTotalMs = 0, processingCount = 0
  let time = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0, rate = clamp(Number(multiplier) || 1, 0, 64), paused = false, sequence = 0, nextOrderAt = time + 2500, disposed = false
  const emit = event => { const value = Object.freeze({ ...event }); events.push(value); for (const listener of listeners) { try { listener(value) } catch {} } }
  const inventory = () => slots.map(slot => ({ ...slot }))
  const preferred = slots.filter(slot => preferSlot(slot.id))
  const chooseSlot = status => preferred.find(slot => slot.status === status) || slots.find(slot => slot.status === status)
  const taskFor = (item, stage) => ({ itemId: item.itemId, taskId: item.itemId, orderId: item.orderId, waybill: item.waybill, weightKg: item.weightKg, destination: item.destination, slotId: item.slotId, sku: item.sku, boxType: item.boxType, kind: item.kind, anomaly: item.anomaly === true, stage, status: item.startedAt === null ? 'queued' : 'moving', createdAt: item.createdAt, startedAt: item.startedAt, completeAt: item.completeAt, workerIndex: item.workerIndex ?? null })
  const queue = (item, stage) => {
    item.stage = stage; item.startedAt = null; item.completeAt = null; item.workerIndex = null
    if (queues[stage].length < MAX_QUEUE) { queues[stage].push(item); return }
    const slot = slots.find(row => row.id === item.slotId)
    if (slot) {
      slot.status = item.kind === 'inbound' ? 'empty' : 'occupied'
      if (item.kind === 'inbound') slot.sku = null
    }
    item.stage = 'rejected'; counters.rejected++
    emit({ type: 'item_rejected', at: time, itemId: item.itemId, stage })
  }
  const start = () => {
    for (const stage of LIVE2_STAGES) {
      const cfg = stageConfig[stage]
      while (active[stage].length < cfg.workers && queues[stage].length && time >= nextStageStart[stage]) {
        const item = queues[stage].shift()
        item.startedAt = time
        if (stage === 'packing') item.workerIndex = Array.from({ length: cfg.workers }, (_, i) => i).find(i => !active[stage].some(current => current.workerIndex === i))
        item.completeAt = time + cfg.durationMs + (cfg.jitter === false ? 0 : Math.floor(random() * 250))
        active[stage].push(item)
        if (cfg.startGapMs) nextStageStart[stage] = time + cfg.startGapMs
        emit({ type: 'stage_started', at: time, itemId: item.itemId, stage })
      }
    }
  }
  const finish = item => {
    const stage = item.stage
    active[stage].splice(active[stage].indexOf(item), 1)
    completedByStage[stage]++
    if (item.startedAt !== null) { processingTotalMs += time - item.startedAt; processingCount++ }
    emit({ type: 'stage_completed', at: time, itemId: item.itemId, stage })
    if (stage === 'quality' && !item.anomaly && exceptionRandom() < .01) { item.anomaly = true; counters.exceptions++; emit({ type: 'quality_exception', at: time, itemId: item.itemId, waybill: item.waybill }) }
    if (stage === 'arrival') queue(item, 'quality')
    else if (stage === 'quality') { if (item.anomaly) { const slot = slots.find(s => s.id === item.slotId); if (slot) { slot.status = 'empty'; slot.sku = null } item.slotId = null; item.stage = 'exception' } else queue(item, 'putaway') }
    else if (stage === 'putaway') { const slot = slots.find(s => s.id === item.slotId); if (slot) { slot.status = 'occupied'; slot.sku = item.sku; storedCargo.set(slot.id, item) } item.stage = 'stored'; counters.received++; emit({ type: 'inventory_putaway', at: time, itemId: item.itemId, slotId: item.slotId }) }
    else if (stage === 'retrieve') queue(item, 'picking')
    else if (stage === 'picking') queue(item, 'conveyor')
    else if (stage === 'conveyor') queue(item, 'packing')
    else if (stage === 'packing') queue(item, 'staging')
    else if (stage === 'staging') { const slot = slots.find(s => s.id === item.slotId); if (slot) { slot.status = 'empty'; slot.sku = null; storedCargo.delete(slot.id) } item.stage = 'shipped'; counters.shipped++; emit({ type: 'shipment_staged', at: time, itemId: item.itemId, slotId: item.slotId }) }
  }
  const createItem = (kind, order, stage = kind === 'inbound' ? 'arrival' : 'retrieve') => {
    const slot = chooseSlot(kind === 'inbound' ? 'empty' : 'occupied'); if (!slot) return null
    slot.status = kind === 'inbound' ? 'reserved_in' : 'reserved_out'
    const prior = kind === 'outbound' ? storedCargo.get(slot.id) : null
    const item = prior || { itemId: `CARGO-${String(++sequence).padStart(5, '0')}`, orderId: order?.orderId || `ORDER-${sequence}`, waybill: `DR${String(sequence).padStart(8, '0')}`, weightKg: Number.isFinite(order?.weightKg) ? order.weightKg : 1 + (sequence * 7) % 30, destination: order?.destination || WH_R1_DESTINATIONS[sequence % WH_R1_DESTINATIONS.length], sku: order?.sku || `SKU-${sequence % 3 + 1}`, quantity: order?.quantity || 1, boxType: slot.boxType, slotId: slot.id, kind, anomaly: false, stage: null, createdAt: time, startedAt: null, completeAt: null }
    if (!prior) items.push(item)
    else { item.kind = kind; item.orderId = order?.orderId || item.orderId; item.createdAt = time }
    counters[kind]++; emit({ type: 'cargo_arrived', at: time, itemId: item.itemId, kind, slotId: slot.id, orderId: item.orderId }); queue(item, stage); return item
  }
  const seedPipeline = () => {
    const seed = (kind, status, stages) => {
      for (const stage of stages) {
        const slot = chooseSlot(status)
        if (!slot) break
        createItem(kind, { orderId: `BOOT-${kind === 'inbound' ? 'IN' : 'OUT'}-${slot.id}`, sku: slot.sku || `SKU-${slot.boxType + 1}` }, stage)
      }
    }
    seed('inbound', 'empty', ['arrival', 'putaway', 'quality', 'quality', 'quality'])
    seed('outbound', 'occupied', ['retrieve', 'picking', 'conveyor', 'packing', 'staging'])
  }
  seedPipeline(); start()
  const snapshot = () => ({ nowMs: time, paused, multiplier: rate, onHand: slots.filter(s => s.status === 'occupied' || s.status === 'reserved_out').length, initialOnHand, slots: inventory(), tasks: items.filter(item => ['arrival', 'quality', 'putaway', 'retrieve', 'picking', 'conveyor', 'packing', 'staging'].includes(item.stage)).map(item => taskFor(item, item.stage)), items: items.map(item => ({ ...item })), queues: Object.fromEntries(LIVE2_STAGES.map(stage => [stage, queues[stage].length + active[stage].length])), workers: Object.fromEntries(LIVE2_STAGES.map(stage => [stage, stageConfig[stage].workers])), stageStats: Object.fromEntries(LIVE2_STAGES.map(stage => [stage, { queued: queues[stage].length, active: active[stage].length, completed: completedByStage[stage] }])), averageProcessingMs: processingCount ? processingTotalMs / processingCount : 0, counters: { ...counters } })
  const advance = realMs => {
    if (disposed || paused || !Number.isFinite(realMs) || realMs <= 0) return snapshot()
    const target = time + realMs * rate
    while (time < target) {
      time = Math.min(target, time + 100)
      if (time >= nextOrderAt) { const order = orderSource?.next?.({ nowMs: time, inventory: inventory() }); if (order) createItem(order.kind === 'outbound' ? 'outbound' : 'inbound', order); nextOrderAt += orderIntervalMs }
      for (const stage of LIVE2_STAGES) for (const item of [...active[stage]]) if (item.completeAt <= time) finish(item)
      start()
    }
    return snapshot()
  }
  return { advance, snapshot, inventory, events, drainEvents: () => events.splice(0, events.length), setMultiplier(value) { rate = clamp(Number(value) || 1, 0, 64); return rate }, pause() { paused = true }, resume() { paused = false }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }, dispose() { disposed = true; listeners.clear() } }
}

export const live2QueueTotal = snapshot => Object.values(snapshot?.queues || {}).reduce((total, count) => total + count, 0)
export const live2InventoryDelta = snapshot => snapshot.onHand - snapshot.initialOnHand
