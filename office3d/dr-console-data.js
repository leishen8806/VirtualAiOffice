// DR 仓配中控台只使用这里的确定性演示快照；不读取任何现实业务数据。
const baseEvents = [
  { id: 'demo-e01', at: 1, zone: 'W1', kind: '托盘上架', pallets: 12 },
  { id: 'demo-e02', at: 2, zone: 'W2', kind: '分拣复核完成', pallets: 8 },
  { id: 'demo-e02b', at: 2, zone: 'W2', kind: '区内移动', pallets: 10, from: 'W1' },
  { id: 'demo-e03', at: 3, zone: 'W3', kind: '出库发运', pallets: 16 },
  { id: 'demo-e04', at: 4, zone: 'W1', kind: '车辆进场登记', pallets: 0 },
  { id: 'demo-e05', at: 5, zone: 'W3', kind: '月台占用', pallets: 0 },
]

const inventory = [
  { name: '建材板材', pallets: 960, sku: 86, unit: '托盘' },
  { name: '瓷砖类', pallets: 720, sku: 64, unit: '托盘' },
  { name: '五金工具', pallets: 480, sku: 212, unit: '套' },
  { name: '定制木作', pallets: 310, sku: 44, unit: '平方米' },
  { name: '家居类', pallets: 260, sku: 71, unit: '件' },
  { name: '化工辅材', pallets: 190, sku: 38, unit: '桶' },
]

const seeded = (seed, index, floor, span) => floor + ((Number(seed || 0) * 17 + index * 29) % span)

export function buildSnapshot({ seed = 2808, timeSlice = 0 } = {}) {
  const slice = Math.max(0, Number(timeSlice) || 0)
  return {
    schemaVersion: 'DrConsoleSnapshot v1', mode: 'demo', generatedAt: `demo-slice-${slice}`,
    warehouses: [
      { id: 'W1', name: '智慧云仓', area: 4015, usedSlots: seeded(seed, 1, 690, 40), totalSlots: 960 },
      { id: 'W2', name: '订单周转中心', area: 1740, usedSlots: seeded(seed, 2, 310, 30), totalSlots: 480 },
      { id: 'W3', name: '集货物流中心', area: 8004, usedSlots: seeded(seed, 3, 980, 50), totalSlots: 1440 },
    ],
    inventoryByCategory: inventory.map((item) => ({ ...item })),
    pallets: inventory.reduce((sum, item) => sum + item.pallets, 0),
    waybills: [
      { id: 'DEMO-WB-1042', zone: 'W1', status: '装车中', from: '金边', to: '暹粒', pallets: 16, progress: 72, eta: '示意 14:40' },
      { id: 'DEMO-WB-1048', zone: 'W2', status: '等待月台', from: '金边', to: '马德望', pallets: 9, progress: 38, eta: '示意 16:10' },
      { id: 'DEMO-WB-1053', zone: 'W3', status: '运输中', from: '金边', to: '西哈努克', pallets: 22, progress: 58, eta: '示意 18:20' },
      { id: 'DEMO-WB-1036', zone: 'W3', status: '已完成', from: '金边', to: '波贝', pallets: 11, progress: 100, eta: '示意 已完成' },
    ],
    vehicles: [
      { id: 'DEMO-TRK-01', inYard: true, zone: 'W1' }, { id: 'DEMO-TRK-02', inYard: true, zone: 'W2' },
      { id: 'DEMO-TRK-03', inYard: true, zone: 'W3' }, { id: 'DEMO-TRK-04', inYard: false, zone: '计划路线' },
    ],
    tasks: [
      { id: 'DEMO-T-01', zone: 'W1', status: '进行中' }, { id: 'DEMO-T-02', zone: 'W2', status: '进行中' },
      { id: 'DEMO-T-03', zone: 'W3', status: '待处理' }, { id: 'DEMO-T-04', zone: 'W3', status: '待处理' },
    ],
    devices: [
      { name: '穿梭机', total: 6, normal: 6 }, { name: '叉车', total: 8, normal: 7 },
      { name: '输送线', total: 4, normal: 4 }, { name: '月台', total: 7, normal: 5 },
      { name: '分拣线', total: 3, normal: 3 }, { name: '充电桩', total: 10, normal: 9 },
    ],
    alerts: [
      { type: '设备', count: 1 }, { type: '库存', count: 2 }, { type: '运单', count: 1 },
    ],
    events: eventsUpTo({ timeSlice: slice }, slice),
  }
}

export function eventsUpTo(snapshot, timeSlice = 0) {
  const limit = Math.max(0, Number(timeSlice) || 0) % (baseEvents.length + 1)
  return baseEvents.filter((event) => event.at <= limit).map((event) => ({ ...event, demo: true, detail: '演示事件 · 模拟' }))
}

export function inventoryAfterEvents(snapshot, events = snapshot.events || []) {
  const seen = new Set()
  let shipped = 0
  for (const event of events) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    if (event.kind === '出库发运') shipped += event.pallets || 0
  }
  return { pallets: snapshot.pallets - shipped, shipped }
}

export function deriveKpis(snapshot) {
  const totalPallets = snapshot.inventoryByCategory.reduce((sum, item) => sum + item.pallets, 0)
  const used = snapshot.warehouses.reduce((sum, item) => sum + item.usedSlots, 0)
  const capacity = snapshot.warehouses.reduce((sum, item) => sum + item.totalSlots, 0)
  const count = (list, state) => list.filter((item) => item.status === state).length
  return {
    totalPallets,
    inbound: snapshot.events.filter((event) => event.kind === '托盘上架').reduce((sum, event) => sum + event.pallets, 0),
    outbound: snapshot.events.filter((event) => event.kind === '出库发运').reduce((sum, event) => sum + event.pallets, 0),
    vehiclesInYard: snapshot.vehicles.filter((vehicle) => vehicle.inYard).length,
    activeTasks: count(snapshot.tasks, '进行中'), pendingTasks: count(snapshot.tasks, '待处理'),
    onTimeRate: Math.round((snapshot.waybills.filter((waybill) => waybill.status !== '等待月台').length / snapshot.waybills.length) * 1000) / 10,
    utilization: Math.round((used / capacity) * 1000) / 10,
    alerts: snapshot.alerts.reduce((sum, alert) => sum + alert.count, 0),
  }
}

export function inventoryDisplay(snapshot) {
  const total = snapshot.pallets || 1
  return snapshot.inventoryByCategory.map((item) => ({ ...item, share: Math.round((item.pallets / total) * 1000) / 10 }))
}
