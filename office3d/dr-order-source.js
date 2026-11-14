const ORDER_ROWS = [
  ['DEMO-ORD-1001', '金边', 8, '装车中', 'W1', 'DEMO-TRK-01', 1, '托盘上架'],
  ['DEMO-ORD-1002', '暹粒', 12, '等待月台', 'W2', 'DEMO-TRK-02', 2, '分拣复核'],
  ['DEMO-ORD-1003', '马德望', 16, '运输中', 'W3', 'DEMO-TRK-03', 3, '出库发运'],
  ['DEMO-ORD-1004', '西哈努克', 11, '已完成', 'W3', 'DEMO-TRK-03', 4, '车辆进场登记'],
  ['DEMO-ORD-1005', '波贝', 9, '装车中', 'W1', 'DEMO-TRK-01', 5, '月台占用'],
  ['DEMO-ORD-1006', '贡布', 7, '等待月台', 'W2', 'DEMO-TRK-02', 6, '区内移动'],
  ['DEMO-ORD-1007', '金边', 14, '运输中', 'W3', 'DEMO-TRK-03', 0, null],
  ['DEMO-ORD-1008', '暹粒', 6, '已完成', 'W1', 'DEMO-TRK-01', 0, null],
  ['DEMO-ORD-1009', '马德望', 10, '运输中', 'W2', 'DEMO-TRK-02', 0, null],
  ['DEMO-ORD-1010', '西哈努克', 13, '已完成', 'W3', 'DEMO-TRK-03', 0, null],
  ['DEMO-ORD-1011', '波贝', 5, '装车中', 'W1', 'DEMO-TRK-01', 0, null],
  ['DEMO-ORD-1012', '贡布', 15, '等待月台', 'W2', 'DEMO-TRK-02', 0, null],
  ['DEMO-ORD-1013', '金边', 18, '运输中', 'W3', 'DEMO-TRK-03', 0, null],
  ['DEMO-ORD-1014', '暹粒', 4, '已完成', 'W1', 'DEMO-TRK-01', 0, null],
  ['DEMO-ORD-1015', '马德望', 8, '装车中', 'W2', 'DEMO-TRK-02', 0, null],
  ['DEMO-ORD-1016', '西哈努克', 17, '运输中', 'W3', 'DEMO-TRK-03', 0, null],
  ['DEMO-ORD-1017', '波贝', 7, '已完成', 'W1', 'DEMO-TRK-01', 0, null],
  ['DEMO-ORD-1018', '贡布', 12, '等待月台', 'W2', 'DEMO-TRK-02', 0, null],
  ['DEMO-ORD-1019', '金边', 9, '运输中', 'W3', 'DEMO-TRK-03', 0, null],
  ['DEMO-ORD-1020', '暹粒', 6, '已完成', 'W1', 'DEMO-TRK-01', 0, null],
]

export function readDemoOrders() {
  return ORDER_ROWS.map(([orderNo, customerRegion, itemCount, status, warehouse, vehicleId, eventAt, eventKind]) => ({
    orderNo,
    customerRegion,
    itemCount,
    status,
    warehouse,
    vehicleId,
    stageTimes: Object.freeze({ created: `demo-${orderNo}-created`, updated: `demo-${orderNo}-updated` }),
    warehouseSlot: `${warehouse}-S-${orderNo.slice(-2)}`,
    eventAt,
    eventKind,
  }))
}
