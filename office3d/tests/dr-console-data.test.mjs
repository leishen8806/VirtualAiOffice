import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOrderDemoSnapshot, buildSnapshot, deriveKpis, eventsUpTo, inventoryAfterEvents, inventoryDisplay } from '../dr-console-data.js'
import { readDemoOrders } from '../dr-order-source.js'

test('demo order source is a fixed synthetic 20-order contract', () => {
  const orders = readDemoOrders()
  assert.equal(orders.length, 20)
  assert.equal(new Set(orders.map((order) => order.orderNo)).size, 20)
  assert.ok(orders.every((order) => order.orderNo.startsWith('DEMO-ORD-') && order.customerRegion && order.itemCount > 0 && order.status && order.stageTimes && order.vehicleId && order.warehouseSlot))
  assert.ok(orders.every((order) => order.orderNo.startsWith('DEMO-') && !/\d{7,}/.test(order.customerRegion)))
})

test('order rows exist only in the running demo snapshot', () => {
  assert.equal(buildSnapshot().waybills.filter((item) => item.id.startsWith('DEMO-ORD-')).length, 0)
  assert.equal(buildOrderDemoSnapshot().waybills.filter((item) => item.id.startsWith('DEMO-ORD-')).length, 20)
})

test('DR console demo snapshot and derived KPI are deterministic', () => {
  const options = { seed: 2808, timeSlice: 5 }
  const snapshot = buildSnapshot(options)
  assert.deepEqual(snapshot, buildSnapshot(options))
  const kpi = deriveKpis(snapshot)
  assert.equal(kpi.totalPallets, snapshot.inventoryByCategory.reduce((sum, item) => sum + item.pallets, 0))
  assert.equal(kpi.utilization, Math.round((snapshot.warehouses.reduce((sum, item) => sum + item.usedSlots, 0) / snapshot.warehouses.reduce((sum, item) => sum + item.totalSlots, 0)) * 1000) / 10)
  assert.equal(kpi.vehiclesInYard, snapshot.vehicles.filter((item) => item.inYard).length)
})

test('inventory display keeps distinct units separate', () => {
  const rows = inventoryDisplay(buildSnapshot({ seed: 1, timeSlice: 0 }))
  assert.equal(rows.reduce((sum, row) => sum + row.pallets, 0), buildSnapshot({ seed: 1, timeSlice: 0 }).pallets)
  assert.ok(new Set(rows.map((row) => row.unit)).size > 1)
  assert.ok(rows.every((row) => typeof row.unit === 'string' && row.unit.length > 0))
})

test('event ids are idempotent and only dispatch reduces inventory', () => {
  const snapshot = buildSnapshot({ seed: 1, timeSlice: 5 })
  const events = eventsUpTo(snapshot, 5)
  const outbound = events.find((event) => event.kind === '出库发运')
  assert.equal(inventoryAfterEvents(snapshot, [...events, outbound]).shipped, outbound.pallets)
  assert.equal(inventoryAfterEvents(snapshot, events.filter((event) => event.kind === '托盘上架')).shipped, 0)
  assert.equal(inventoryAfterEvents(snapshot, events.filter((event) => event.kind === '区内移动')).shipped, 0)
  assert.equal(events.filter((event) => event.id === outbound.id).length, 1)
})
