import fs from 'node:fs'
const O = '/tmp/vis2-qa3/rc1-1168079/office3d/'
const { demoSnapshotAt } = await import(O + 'dr-demo-snapshot.js')
const { campusScreenFrameAt } = await import(O + 'dr-campus-interior.js')
const { controlRoomScreenSummary } = await import(O + 'dr-control-room-screen.js')
const { deriveKpis } = await import(O + 'dr-console-data.js')
const out = '/tmp/vis2-qa3/evidence-r3/parity-probe.json'
const ELAPSED = [0, 1, 1799, 1800, 3600, 90000, 3600000, -5, NaN, Infinity], REFRESH = 1800
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function summaryOf(s) { const k = deriveKpis(s); return { generatedAt: s.generatedAt, kpis: { inbound: k.inbound, outbound: k.outbound, inTransit: s.waybills.filter(x => x.status !== '已完成').length, onTimeRate: k.onTimeRate }, waybills: s.waybills.map(x => ({ id: x.id, status: x.status, progress: x.progress })), events: s.events.slice(-4).map(x => ({ id: x.id, kind: x.kind, zone: x.zone })) } }
const rows = []
for (const e of ELAPSED) { const a = demoSnapshotAt(undefined, e), b = demoSnapshotAt(undefined, e), desktop = summaryOf(a), campus = campusScreenFrameAt(e).summary, control = controlRoomScreenSummary(a), tick = Math.floor(Math.max(0, Number.isFinite(e) ? e : 0) / REFRESH)
  rows.push({ elapsed: String(e), tick, pass: same(a, b) && desktop.generatedAt === `demo-motion-${tick}` && same(campus.kpis, desktop.kpis) && same(campus.waybills, desktop.waybills.map(x => ({ id: x.id, status: x.status, progress: x.progress }))) && same(campus.events, desktop.events) && same(control.kpis, desktop.kpis) && control.generatedAt === desktop.generatedAt && !/NaN/.test(JSON.stringify({ desktop, campus, control })) }) }
const failed = rows.filter(r => !r.pass)
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), verdict: failed.length ? 'FAIL' : 'PASS', failed: failed.length, rows }, null, 2) + '\n')
console.log(JSON.stringify({ verdict: failed.length ? 'FAIL' : 'PASS', failed: failed.length, rows: rows.length }))
