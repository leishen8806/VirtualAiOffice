// VIS2-Q Q3：固定 elapsedMs（tick）下，二维调度台 / 园区调度屏 / 中控大屏的共享快照一致性探针。
// 只读纯模块，不启动服务、不发网络请求、不改真实任务。
import fs from 'node:fs'
import path from 'node:path'
import { demoSnapshotAt } from '../..//office3d/dr-demo-snapshot.js'
import { campusScreenFrameAt } from '../../office3d/dr-campus-interior.js'
import { controlRoomScreenSummary } from '../../office3d/dr-control-room-screen.js'
import { deriveKpis } from '../../office3d/dr-console-data.js'

const repo = path.resolve(process.argv[2] || process.cwd())
const outDir = path.resolve(process.argv[3] || path.join(repo, 'docs/dispatch/vis2/qa-b0'))
fs.mkdirSync(outDir, { recursive: true })
const ELAPSED = [0, 1, 1799, 1800, 3600, 90000, 3600000, -5, Number.NaN, Number.POSITIVE_INFINITY]
const REFRESH = 1800

function summaryOf(snapshot) {
  const kpis = deriveKpis(snapshot)
  return {
    generatedAt: snapshot.generatedAt,
    kpis: {
      inbound: kpis.inbound,
      outbound: kpis.outbound,
      inTransit: snapshot.waybills.filter((item) => item.status !== '已完成').length,
      onTimeRate: kpis.onTimeRate,
    },
    waybills: snapshot.waybills.map((item) => ({ id: item.id, status: item.status, progress: item.progress })),
    events: snapshot.events.slice(-4).map((item) => ({ id: item.id, kind: item.kind, zone: item.zone })),
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const rows = []
for (const elapsed of ELAPSED) {
  const first = demoSnapshotAt(undefined, elapsed)
  const second = demoSnapshotAt(undefined, elapsed)
  const desktop = summaryOf(first)
  const campus = campusScreenFrameAt(elapsed).summary
  const control = controlRoomScreenSummary(first)
  const expectedTick = Math.floor(Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) / REFRESH)
  const checks = {
    deterministic: same(first, second),
    desktopGeneration: desktop.generatedAt === `demo-motion-${expectedTick}`,
    campusKpis: same(campus.kpis, desktop.kpis),
    campusWaybills: same(campus.waybills, desktop.waybills.map((item) => ({ id: item.id, status: item.status, progress: item.progress }))),
    campusEvents: same(campus.events, desktop.events),
    controlKpis: same(control.kpis, desktop.kpis),
    controlWaybills: same(control.waybills, desktop.waybills.map((item) => ({ id: item.id, status: item.status, progress: item.progress }))),
    controlGeneratedAt: control.generatedAt === desktop.generatedAt,
    noNaN: !JSON.stringify({ desktop, campus, control }).includes('null') && !/NaN/.test(JSON.stringify({ desktop, campus, control })),
  }
  rows.push({ elapsed, expectedTick, pass: Object.values(checks).every(Boolean), checks })
}
const failed = rows.filter((row) => !row.pass)
const evidence = {
  generatedAt: new Date().toISOString(),
  module: 'office3d/dr-demo-snapshot.js + dr-campus-interior.js + dr-control-room-screen.js',
  refreshMs: REFRESH,
  rows,
  failed: failed.length,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
}
fs.writeFileSync(path.join(outDir, 'parity-probe.json'), JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify({ verdict: evidence.verdict, failed: failed.length, rows: rows.length }, null, 2))
process.exit(evidence.verdict === 'PASS' ? 0 : 1)
