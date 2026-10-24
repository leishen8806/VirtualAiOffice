import fs from 'node:fs'
import * as THREE from '/tmp/vis2-qa/cand-2879124/office3d/vendor/three/three.module.js'
import { CAMPUS, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP } from '/tmp/vis2-qa/cand-2879124/office3d/office-layout.js'
import { createCampusRegistry } from '/tmp/vis2-qa/cand-2879124/office3d/dr-campus-registry.js'
import { buildCampusRacks } from '/tmp/vis2-qa/cand-2879124/office3d/dr-campus-racks.js'
import { buildVis2RackCell, VIS2_COLORS } from '/tmp/vis2-qa/cand-2879124/office3d/dr-vis2-rack-cell.js'
const layout = { campus: CAMPUS, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP }
const checks = []
const push = (id, ok, detail) => checks.push({ id, ok, detail })
const near = (a, b, t = 1e-4) => Math.abs(a - b) <= t
const batch = (cell, name) => cell.group.getObjectByName(name)
const inst = (mesh) => { const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), out = []; for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); m.decompose(p, q, s); out.push({ x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z }) } return out }
const scene = new THREE.Scene(); const root = new THREE.Group(); scene.add(root)
const cell = buildVis2RackCell({ THREE, root, layout, quality: { tier: 'high' } })
const decks = inst(batch(cell, 'vis2-rack-pallets')).filter((p) => near(p.sy, 0.03))
// 同层同排托盘 AABB 不重叠（独立于候选测试）
const groups = new Map()
for (const deck of decks) { const key = `${deck.x.toFixed(2)}|${deck.y.toFixed(2)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(deck) }
let overlaps = 0
for (const rows of groups.values()) for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  const a = rows[i], b = rows[j]
  const overlapX = Math.min(a.x + a.sx / 2, b.x + b.sx / 2) - Math.max(a.x - a.sx / 2, b.x - b.sx / 2)
  const overlapZ = Math.min(a.z + a.sz / 2, b.z + b.sz / 2) - Math.max(a.z - a.sz / 2, b.z - b.sz / 2)
  if (overlapX > 1e-4 && overlapZ > 1e-4) overlaps++
}
push('pallets-no-overlap-independent', overlaps === 0, `同层同排成对重叠=${overlaps}, groups=${groups.size}, decks=${decks.length}`)
cell.dispose()

// 集成风险：旧 racks 与候选同时启用（未接线时）会在同一位置重复；证明替换边界必要
const regScene = new THREE.Scene()
const registry = createCampusRegistry({ THREE, scene: regScene, quality: { tier: 'low' }, layout })
let legacy = null, candidate = null
registry.register('legacyRacks', (context) => { legacy = buildCampusRacks(context); return legacy })
registry.register('vis2Rack', (context) => { candidate = buildVis2RackCell(context); return candidate })
registry.buildAll({ quality: { tier: 'low' } })
const mergedNames = []
registry.root.traverse((node) => { if (node.isMesh) mergedNames.push(node.name) })
const merged = registry.root.getObjectByName('campus-opaque-batch-1')
const colors = merged?.geometry?.getAttribute('color')
const colorOf = (hex) => new THREE.Color(hex) // three 内部线性色空间，与 bake 后的属性一致
const oldBlue = colorOf(0x2d608b), newBlue = colorOf(0x2f6fa8)
let oldColorVerts = 0, newColorVerts = 0
if (colors) for (let i = 0; i < colors.count; i++) {
  const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i)
  if (near(r, oldBlue.r, 0.01) && near(g, oldBlue.g, 0.01) && near(b, oldBlue.b, 0.01)) oldColorVerts++
  if (near(r, newBlue.r, 0.01) && near(g, newBlue.g, 0.01) && near(b, newBlue.b, 0.01)) newColorVerts++
}
push('integration-both-present-without-replacement', oldColorVerts > 0 && newColorVerts > 0, `合并后旧立柱顶点=${oldColorVerts}，新立柱顶点=${newColorVerts}（两者都>0：旧模块未跳过时货架会重复）`)
const summary = registry.summary()
push('integration-summary', summary.modules.length === 2 && summary.skipped.length === 0, JSON.stringify(summary))
registry.dispose()

// 契约源码检查：旧 racks 没有 skip 选项；labels 与 racks 同一函数
const racksSrc = fs.readFileSync('/tmp/vis2-qa/cand-2879124/office3d/dr-campus-racks.js', 'utf8')
push('legacy-no-skip-option', !/skipRacks|skipRack|replacement|skipCargo/i.test(racksSrc), '旧 buildCampusRacks 无「跳过货架/货物」参数')
push('labels-inside-legacy-function', racksSrc.indexOf("labels.name = 'campus-rack-labels'") > racksSrc.indexOf('export function buildCampusRacks'), 'campus-rack-labels 在旧 buildCampusRacks 内创建')
const shuttleSrc = fs.readFileSync('/tmp/vis2-qa/cand-2879124/office3d/dr-campus-shuttle.js', 'utf8')
push('legacy-shuttle-static-exists', shuttleSrc.includes('campus-shuttle-static') && shuttleSrc.includes('campus-shuttle'), '旧轨道/车体名字存在')
const dims = { oldRailTop: 0.5, newRailTop: 0.045 + 0.06, oldUpright: 3.6, newUpright: 4.4 }
push('integration-height-delta-note', dims.oldRailTop !== dims.newRailTop, `旧轨顶=${dims.oldRailTop}，新轨顶=${dims.newRailTop}；旧立柱高=${dims.oldUpright}，新立柱高=${dims.newUpright}（全场景未验证）`)

const result = { generatedAt: new Date().toISOString(), pass: checks.every((c) => c.ok), checks, mergedNames: [...new Set(mergedNames)], summary }
fs.writeFileSync('/tmp/vis2-qa/probe-integration.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ pass: result.pass, checks, mergedNames: [...new Set(mergedNames)], summary }, null, 2))
