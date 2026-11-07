const DEFAULT_SLOT_COUNT = 192
export const LIVE1_DEFAULT_SEED = 20261107
export const LIVE1_SLOT_STATES = Object.freeze(['empty', 'occupied', 'reserved_in', 'reserved_out'])
export const LIVE1_ORDER_FIELDS = Object.freeze(['orderId', 'sku', 'quantity', 'status', 'timestamp'])

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const mulberry32 = seed => {
  let value = seed >>> 0
  return () => { value |= 0; value = value + 0x6D2B79F5 | 0; let t = Math.imul(value ^ value >>> 15, 1 | value); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
const genericOrder = ({ seed = LIVE1_DEFAULT_SEED } = {}) => {
  const random = mulberry32(seed), next = ({ nowMs, inventory }) => {
    const occupied = inventory.filter(slot => slot.status === 'occupied').length
    const empty = inventory.length - occupied
    if (empty === 0 && occupied === 0) return null
    const kind = empty === 0 ? 'outbound' : occupied === 0 ? 'inbound' : random() < .55 ? 'inbound' : 'outbound'
    return { orderId: `SIM-${Math.floor(nowMs).toString(36)}-${Math.floor(random() * 0xffff).toString(36)}`, sku: `SKU-${1 + Math.floor(random() * 3)}`, quantity: 1, status: 'queued', timestamp: nowMs, kind }
  }
  return Object.freeze({ next })
}
const slotIdList = ids => Array.isArray(ids) && ids.length ? ids.slice() : Array.from({ length: DEFAULT_SLOT_COUNT }, (_, i) => `slot-${String(i + 1).padStart(3, '0')}`)

export function createLive1Simulation({ seed = LIVE1_DEFAULT_SEED, slotIds, multiplier = 8, orderSource = genericOrder({ seed }), nowMs = 0 } = {}) {
  const ids = slotIdList(slotIds), random = mulberry32(seed ^ 0x9e3779b9), listeners = new Set(), events = []
  const slots = ids.map((id, index) => ({ id, status: index < Math.round(ids.length * .6) ? 'occupied' : 'empty', sku: index < Math.round(ids.length * .6) ? `SKU-${index % 3 + 1}` : null, boxType: index % 3 }))
  const initialOnHand = slots.filter(slot => slot.status === 'occupied').length, tasks = [], counters = { inboundCompleted: 0, outboundCompleted: 0, created: 0, completed: 0 }
  let time = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0, rate = clamp(Number(multiplier) || 1, 0, 64), paused = false, sequence = 0, nextOrderAt = time + 2500, disposed = false
  const emit = event => { events.push(Object.freeze({ ...event })); for (const listener of listeners) { try { listener(event) } catch {} } }
  const snapshotInventory = () => slots.map(slot => ({ ...slot }))
  const findSlot = kind => slots.find(slot => kind === 'inbound' ? slot.status === 'empty' : slot.status === 'occupied')
  const assign = (kind, order = {}) => {
    const slot = findSlot(kind); if (!slot) return null
    const id = `task-${++sequence}`, task = { id, kind, orderId: order.orderId || id, slotId: slot.id, sku: order.sku || `SKU-${sequence % 3 + 1}`, boxType: slot.boxType, status: 'moving', createdAt: time, startedAt: time, completeAt: time + 2200 + Math.floor(random() * 900), shuttleIndex: counters.created % 4 }
    slot.status = kind === 'inbound' ? 'reserved_in' : 'reserved_out'; tasks.push(task); counters.created++
    emit({ type: 'task_created', at: time, taskId: id, kind, slotId: slot.id }); emit({ type: 'task_assigned', at: time, taskId: id, kind, slotId: slot.id }); emit({ type: 'task_started', at: time, taskId: id, kind, slotId: slot.id }); return task
  }
  const complete = task => {
    const slot = slots.find(item => item.id === task.slotId); if (!slot) return
    if (task.kind === 'inbound') { slot.status = 'occupied'; slot.sku = task.sku; counters.inboundCompleted++ } else { slot.status = 'empty'; slot.sku = null; counters.outboundCompleted++ }
    task.status = 'complete'; task.completedAt = time; counters.completed++
    emit({ type: 'task_completed', at: time, taskId: task.id, kind: task.kind, slotId: slot.id, inventoryStatus: slot.status })
  }
  for (let index = 0; index < 4; index++) assign(index % 2 ? 'inbound' : 'outbound', { orderId: `BOOT-${index + 1}`, sku: `SKU-${index % 3 + 1}` })
  const snapshot = () => ({ nowMs: time, paused, multiplier: rate, onHand: slots.filter(slot => slot.status === 'occupied' || slot.status === 'reserved_out').length, initialOnHand, slots: snapshotInventory(), tasks: tasks.map(task => ({ ...task })), counters: { ...counters } })
  const advance = realMs => {
    if (disposed || paused || !Number.isFinite(realMs) || realMs <= 0) return snapshot()
    const target = time + realMs * rate
    while (time < target) {
      time = Math.min(target, time + 250)
      if (time >= nextOrderAt) { const order = orderSource?.next?.({ nowMs: time, inventory: snapshotInventory() }); if (order) assign(order.kind === 'outbound' ? 'outbound' : 'inbound', order); nextOrderAt += 4500 }
      for (const task of tasks) if (task.status === 'moving' && task.completeAt <= time) complete(task)
    }
    return snapshot()
  }
  return {
    advance, snapshot, drainEvents: () => events.splice(0, events.length), inventory: () => snapshotInventory(),
    setMultiplier(value) { rate = clamp(Number(value) || 1, 0, 64); return rate },
    pause() { paused = true }, resume() { paused = false },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    events, dispose() { disposed = true; listeners.clear() },
  }
}

export const inventoryDelta = snapshot => snapshot.onHand - snapshot.initialOnHand
