import fs from 'node:fs'
import crypto from 'node:crypto'
import * as THREE from '/tmp/vis2-qa/cand-2879124/office3d/vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '/tmp/vis2-qa/cand-2879124/office3d/office-layout.js'
import { createCampusRackPlan } from '/tmp/vis2-qa/cand-2879124/office3d/dr-campus-racks.js'
import { shuttlePlan } from '/tmp/vis2-qa/cand-2879124/office3d/dr-campus-shuttle-logic.js'
import { createCampusRegistry } from '/tmp/vis2-qa/cand-2879124/office3d/dr-campus-registry.js'
import { VIS2_COLORS, VIS2_DIMENSIONS, VIS2_REPLACES, buildVis2RackCell } from '/tmp/vis2-qa/cand-2879124/office3d/dr-vis2-rack-cell.js'

const OUT = '/tmp/vis2-qa/probe-node.json'
const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const highRack = CAMPUS_ZONES.find((z) => z.id === 'highRack')
const checks = []
const push = (id, ok, detail) => checks.push({ id, ok, detail })
const near = (a, b, t = 1e-4) => Math.abs(a - b) <= t
const D = VIS2_DIMENSIONS
const build = (options = {}) => { const scene = new THREE.Scene(); const holder = new THREE.Group(); const cell = buildVis2RackCell({ THREE, root: holder, layout, quality: { tier: 'high' }, ...options }); scene.add(holder); return { scene, holder, cell } }
const batch = (cell, name) => cell.group.getObjectByName(name)
const inst = (mesh) => { const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Color(), out = []; for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); m.decompose(p, q, s); mesh.getColorAt(i, c); out.push({ x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z, hex: c.getHex(), rotZ: q.z }) } return out }
const hashInstances = (mesh) => crypto.createHash('sha256').update(Buffer.from(mesh.instanceMatrix.array.buffer, 0, mesh.count * 64)).digest('hex')

const { cell, scene, holder } = build()
const summary = cell.summary()
const frames = inst(batch(cell, 'vis2-rack-frames')), pallets = inst(batch(cell, 'vis2-rack-pallets')), cartons = inst(batch(cell, 'vis2-rack-cartons')), films = inst(batch(cell, 'vis2-rack-film')), rails = inst(batch(cell, 'vis2-rails'))
const shuttle = cell.group.getObjectByName('vis2-shuttle')

// 1 颜色与几何
const frameColors = [...new Set(frames.map((f) => f.hex))].sort()
push('approved-colors', JSON.stringify(frameColors) === JSON.stringify([VIS2_COLORS.upright, VIS2_COLORS.beam].sort()), `frame colors=${frameColors.map((c) => '#' + c.toString(16))}`)
push('upright-blue-hex', VIS2_COLORS.upright === 0x2f6fa8 && frames.some((f) => f.hex === 0x2f6fa8 && f.sy > 4), '立柱 #2F6FA8')
push('beam-orange-hex', VIS2_COLORS.beam === 0xe8832a && frames.some((f) => f.hex === 0xe8832a && f.sy < 0.2 && f.sz > 1), '横梁 #E8832A')

// 2 自报指标 vs 独立几何计算
const triFromGeometry = Object.values({ frame: batch(cell, 'vis2-rack-frames'), pallet: batch(cell, 'vis2-rack-pallets'), carton: batch(cell, 'vis2-rack-cartons'), film: batch(cell, 'vis2-rack-film'), rail: batch(cell, 'vis2-rails') }).reduce((sum, mesh) => sum + (mesh.geometry.index.count / 3) * mesh.count, 0) + shuttle.geometry.index.count / 3
push('triangle-count-matches', Math.round(triFromGeometry) === summary.triangles, `summary=${summary.triangles} geometry=${Math.round(triFromGeometry)}`)
push('drawcall-count-matches', summary.drawCalls === 5 + 1, `summary drawCalls=${summary.drawCalls} (5 instanced batches + 1 merged shuttle)`)
push('claimed-25144-high', summary.triangles === 25144, `high triangles=${summary.triangles}`)
const low = build({ quality: { tier: 'low' } }).cell.summary()
push('claimed-low-9132', low.triangles === 9132, `low triangles=${low.triangles}`)

// 3 容器约束（货架/托盘/纸箱/膜 x/z 在 highRack，y 低于屋面）
const highRackBox = (item) => item.x - item.sx / 2 >= highRack.x0 - 1e-4 && item.x + item.sx / 2 <= highRack.x1 + 1e-4 && item.z - item.sz / 2 >= highRack.z0 - 1e-4 && item.z + item.sz / 2 <= highRack.z1 + 1e-4 && item.y - item.sy / 2 >= -1e-4 && item.y + item.sy / 2 <= 4.45
const outOfRack = [...frames, ...pallets, ...cartons, ...films].filter((item) => !highRackBox(item))
push('rack-contained', outOfRack.length === 0, `outOfRack=${outOfRack.length}`)

// 4 托盘由横梁支撑：面板底面 - 0.09 = 承梁底面 = 横梁顶面
const beamTops = D.beamLevels.map((level) => level + D.beamHeight / 2)
const decks = pallets.filter((p) => near(p.sy, 0.03))
const badSupport = decks.filter((deck) => !beamTops.slice(0, 3).some((top) => near(deck.y - deck.sy / 2 - 0.09, top)))
push('pallet-on-beam', decks.length > 50 && badSupport.length === 0, `decks=${decks.length} bad=${badSupport.length}`)
push('pallet-overhang', decks.every((deck) => deck.sx / 2 > 0.475 + 1e-4), '托盘两侧悬出 0.125m')
// 纸箱不穿上一层横梁
const badCarton = cartons.filter((box) => { const level = beamTops.slice(0, 3).findLastIndex((top) => box.y - box.sy / 2 >= top + D.palletHeight - 1e-4); if (level < 0) return true; return box.y + box.sy / 2 > beamTops[level + 1] - D.beamHeight / 2 - 0.04 })
push('carton-clearance', badCarton.length === 0, `bad=${badCarton.length}`)
push('top-beam-empty', decks.every((deck) => deck.y < D.beamLevels[3]), `max deck y=${Math.max(...decks.map((d) => d.y)).toFixed(3)} < ${D.beamLevels[3]}`)

// 5 轨道与穿梭机车轮
const railTop = 0.045 + D.railHeight
const railBars = rails.filter((r) => near(r.sx, D.railWidth) && near(r.sy, D.railHeight))
const centerX = (CAMPUS_SHUTTLE_STRIP.x0 + CAMPUS_SHUTTLE_STRIP.x1) / 2
push('two-rails', railBars.length === 2 && railBars.every((r) => near(Math.abs(r.x - centerX), 0.7, 1e-3)), `rail xs=${railBars.map((r) => r.x.toFixed(3))}`)
const box = shuttle.geometry.boundingBox
push('wheels-on-railtop', near(box.min.y, railTop, 0.002), `shuttle minY=${box.min.y.toFixed(4)} railTop=${railTop.toFixed(4)}`)
const minY = box.min.y + 1e-4
const lowest = []
const pos = shuttle.geometry.attributes.position
for (let i = 0; i < pos.count; i++) if (pos.getY(i) < minY) lowest.push(pos.getX(i))
const wheelXs = [...new Set(lowest.map((x) => Number(x.toFixed(3))))].sort((a, b) => a - b)
// 最低点是四个车轮的底面：每个车轮宽 0.07、中心在 ±0.7 的轨道上，所以左右两点成对、中点=轨心
const wheelPairs = []
for (let i = 0; i < wheelXs.length; i += 2) wheelPairs.push({ mid: Number(((wheelXs[i] + wheelXs[i + 1]) / 2).toFixed(3)), width: Number((wheelXs[i + 1] - wheelXs[i]).toFixed(3)) })
const railLocal = railBars.map((r) => Number((r.x - centerX).toFixed(3))).sort((a, b) => a - b)
push('wheel-x-on-rails', wheelPairs.length === 2 && wheelPairs.every((pair, i) => near(pair.mid, railLocal[i], 1e-3) && near(pair.width, 0.07, 1e-3)), `wheel pairs=${JSON.stringify(wheelPairs)} rail local x=${railLocal}`)
push('shuttle-default-slot', near(shuttle.position.z, shuttlePlan(layout).slots[1].z, 1e-3) && near(shuttle.position.x, centerX, 1e-3), `pos=${shuttle.position.toArray().map((v) => v.toFixed(2))}`)
const railPath = shuttlePlan(layout).path
cell.setShuttle({ z: -1000, lift: 5 }); const clampLow = [shuttle.position.z, shuttle.position.y]
cell.setShuttle({ z: 1000, lift: -3 }); const clampHigh = [shuttle.position.z, shuttle.position.y]
cell.setShuttle({ z: Number.NaN, lift: 0 }); const clampNaN = shuttle.position.z
push('shuttle-clamp', near(clampLow[0], railPath.z0) && near(clampLow[1], 0.12) && near(clampHigh[0], railPath.z1) && near(clampHigh[1], 0) && near(clampNaN, railPath.z1), `low=${clampLow} high=${clampHigh}`)
cell.setShuttle({ z: shuttlePlan(layout).slots[1].z, lift: 0 })

// 6 确定性
const a = build(), b = build(), c = build({ seed: 999 })
const det = ['vis2-rack-frames', 'vis2-rack-pallets', 'vis2-rack-cartons'].every((name) => hashInstances(batch(a.cell, name)) === hashInstances(batch(b.cell, name)))
const diff = hashInstances(batch(a.cell, 'vis2-rack-cartons')) !== hashInstances(batch(c.cell, 'vis2-rack-cartons'))
push('deterministic-same-seed', det, 'same seed instance hash equal')
push('different-seed-differs', diff, 'seed 4207 vs 999 carton hash differs')

// 7 生命周期 / 幂等 dispose
let disposedGeometry = 0, disposedMaterial = 0
const geometries = [], materials = []
a.cell.group.traverse((node) => { if (node.geometry) geometries.push(node.geometry); if (node.material) materials.push(node.material) })
geometries.forEach((g) => g.addEventListener('dispose', () => disposedGeometry++))
materials.forEach((m) => m.addEventListener('dispose', () => disposedMaterial++))
a.cell.dispose(); a.cell.dispose()
push('dispose-idempotent', a.holder.children.length === 0 && a.cell.group.parent === null, `holder children=${a.holder.children.length}`)
push('dispose-own-resources', disposedGeometry === geometries.length && disposedMaterial === materials.length && geometries.length > 0, `geometry ${disposedGeometry}/${geometries.length}, material ${disposedMaterial}/${materials.length}`)

// 8 重复 50 次构建/销毁，scene 不残留
const loop = new THREE.Scene(); const loopRoot = new THREE.Group(); loop.add(loopRoot)
for (let i = 0; i < 50; i++) { const item = buildVis2RackCell({ THREE, root: loopRoot, layout, quality: { tier: 'high' } }); item.dispose() }
push('build-dispose-50', loopRoot.children.length === 0 && loop.children.length === 1, `scene children=${loop.children.length} root children=${loopRoot.children.length}`)

// 9 校园 registry 集成契约（组件级）
const registryScene = new THREE.Scene()
const registry = createCampusRegistry({ THREE, scene: registryScene, quality: { tier: 'high' }, layout })
registry.register('vis2Rack', (context) => buildVis2RackCell(context))
registry.buildAll({ quality: { tier: 'high' } })
const root = registry.root
const registrySummary = registry.summary()
const film = root.getObjectByName('vis2-rack-film'), shuttleNode = root.getObjectByName('vis2-shuttle'), framesNode = root.getObjectByName('vis2-rack-frames')
push('registry-factory-contract', registrySummary.modules.includes('vis2Rack') && registrySummary.skipped.length === 0, `modules=${registrySummary.modules} skipped=${registrySummary.skipped}`)
push('registry-merge-film-opacity', Boolean(film) && film.material.opacity === 0.28, `film opacity=${film?.material?.opacity}`)
push('registry-merge-static', Boolean(shuttleNode) && framesNode === undefined && Boolean(root.getObjectByName('campus-opaque-batch-1')), '静态实例被合并，穿梭机保留')
registry.dispose()

// 10 源码安全边界
const source = fs.readFileSync('/tmp/vis2-qa/cand-2879124/office3d/dr-vis2-rack-cell.js', 'utf8')
const forbidden = ['requestAnimationFrame', 'Math.random', 'Date.now', 'performance.now', 'fetch(', 'innerHTML', 'WebGLRenderer', 'setInterval', 'setTimeout', 'localStorage', 'document.', 'window.']
const hits = forbidden.filter((item) => source.includes(item))
push('module-no-unsafe-apis', hits.length === 0, `hits=${JSON.stringify(hits)}`)
push('module-no-dom-renderer', !/new\s+THREE\.(WebGLRenderer|CanvasTexture|Scene)/.test(source), '不创建渲染器/场景')

// 11 替换清单（旧对象真实存在）
const racksSrc = fs.readFileSync('/tmp/vis2-qa/cand-2879124/office3d/dr-campus-racks.js', 'utf8')
const shuttleSrc = fs.readFileSync('/tmp/vis2-qa/cand-2879124/office3d/dr-campus-shuttle.js', 'utf8')
const replaceMissing = VIS2_REPLACES.filter((item) => !(racksSrc.includes(item.legacy) || shuttleSrc.includes(item.legacy)))
push('replace-list-real', replaceMissing.length === 0, `missing=${replaceMissing.map((i) => i.legacy)}`)

const result = { generatedAt: new Date().toISOString(), summary, lowSummary: low, pass: checks.every((c) => c.ok), failed: checks.filter((c) => !c.ok), checks }
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ pass: result.pass, summary, lowSummary: low, failed: result.failed, checks: checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`) }, null, 2))
process.exit(result.pass ? 0 : 1)
