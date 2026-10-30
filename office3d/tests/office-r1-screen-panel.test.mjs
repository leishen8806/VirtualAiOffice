// CMP-723 / OFFICE-R1-DESKSTATUS R2：工位屏幕贴片要铺满显示器正面那块黑色面板。
// R1 之前的贴片按「玻璃」那一小块算尺寸，而且是一块**竖直**的矩形，没有跟着面板后仰 8°，
// 于是只有中线以上那一半浮在面板前面、以下那一半埋进外壳里被挡掉——就是董事会看到的「只覆盖了一半」。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveOfficeLayout } from '../office-layout.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { MONITOR_PANEL_SOURCE, MONITOR_PANEL_BORDER_MAX, monitorPanelFit, workstationDesktop } from '../office-furniture-v2.js'
import { R1_SCREEN_CELL, r1ScreenAtlasSize } from '../office-vis2/r1-furniture.js'

const MONITOR_SIZE = { width: .66, height: .46, depth: .16 } // r1-furniture.js 里 computerScreen 的缩放
const DESK_TOP_Y = .76

// ── 从 computerScreen.glb 直接读出正面黑色面板，和源码里的常量对账 ──
function readMonitorModel() {
  const raw = fs.readFileSync(new URL('../assets/models/furniture/computerScreen.glb', import.meta.url))
  const jsonLength = raw.readUInt32LE(12), gltf = JSON.parse(raw.subarray(20, 20 + jsonLength).toString('utf8'))
  const bin = 28 + jsonLength, POS = gltf.bufferViews[0].byteOffset, NRM = gltf.bufferViews[1].byteOffset
  const pos = (i) => [0, 1, 2].map(a => raw.readFloatLE(bin + POS + i * 12 + a * 4))
  const nrm = (i) => [0, 1, 2].map(a => raw.readFloatLE(bin + NRM + i * 12 + a * 4))
  const prims = gltf.meshes[0].primitives.map(prim => {
    const acc = gltf.accessors[prim.indices], view = gltf.bufferViews[acc.bufferView]
    const indices = Array.from({ length: acc.count }, (_, i) => raw.readUInt32LE(bin + view.byteOffset + i * 4))
    return { name: gltf.materials[prim.material].name, indices }
  })
  return { pos, nrm, prims, allVerts: [...new Set(prims.flatMap(p => p.indices))] }
}

const MODEL = readMonitorModel()
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

test('R2-A 正面黑色面板的实测值与 MONITOR_PANEL_SOURCE 逐位对上，且比玻璃大一圈', () => {
  const shell = MODEL.prims.find(p => p.name === 'metalDark')
  const front = []
  for (let t = 0; t < shell.indices.length; t += 3) {
    if (dot(MODEL.nrm(shell.indices[t]), MONITOR_PANEL_SOURCE.normal) > 0.9999) front.push(shell.indices[t], shell.indices[t + 1], shell.indices[t + 2])
  }
  const verts = [...new Set(front)], P = verts.map(MODEL.pos)
  assert.equal(verts.length, 8, '正面应当是外壳最前面那一圈（8 个顶点）')
  const span = (a) => [Math.min(...P.map(p => p[a])), Math.max(...P.map(p => p[a]))]
  const low = P.reduce((a, p) => (a[1] < p[1] ? a : p)), high = P.reduce((a, p) => (a[1] > p[1] ? a : p))
  const [x0, x1] = span(0)
  assert.ok(Math.abs(MONITOR_PANEL_SOURCE.width - (x1 - x0)) < 1e-9)
  assert.ok(Math.abs(MONITOR_PANEL_SOURCE.height - Math.hypot(high[1] - low[1], high[2] - low[2])) < 1e-9)
  ;[0, 1, 2].forEach(a => { const [v0, v1] = span(a); assert.ok(Math.abs(MONITOR_PANEL_SOURCE.center[a] - (v0 + v1) / 2) < 1e-9) })
  assert.deepEqual(MODEL.nrm(verts[0]), MONITOR_PANEL_SOURCE.normal)
})

// 25 台工位显示器逐台检查
const layout = resolveOfficeLayout('?layout=3&align=1&officeSample=1&r1=1')
const stations = layout.r1.workstations

const fitFor = (station) => {
  const desk = r1ToWorld(station.xM, station.yM), yaw = layout.seats[station.business_id][4].yaw
  const monitor = workstationDesktop({ x: desk.x, z: desk.z, yaw }).monitor
  return { yaw, monitor, fit: monitorPanelFit({ ...monitor, ...MONITOR_SIZE, y: DESK_TOP_Y, yaw, aspect: R1_SCREEN_CELL.width / R1_SCREEN_CELL.height }) }
}

// 把显示器模型的顶点按 placeFurniture + addAsset 的摆法搬到世界坐标：
// placeFurniture 把模型在 x/z 居中、底面落到 y=0，再由 addAsset 各轴缩放，最后平移到 (x, .76, z) 并绕 y 转 yaw。
const toWorld = (local, monitor, yaw) => {
  const sx = MONITOR_SIZE.width / .39268800616264343, sy = MONITOR_SIZE.height / .29428520798683167, sz = MONITOR_SIZE.depth / .10400399565696716
  const lx = (local[0] - .1963440030813217) * sx, ly = local[1] * sy, lz = (local[2] - (-.05200199782848358)) * sz
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  return [monitor.x + cos * lx + sin * lz, DESK_TOP_Y + ly, monitor.z - sin * lx + cos * lz]
}

test('R2-B 逐台：贴片四角落在面板范围内，四周边框 ≤ 1.5 cm', () => {
  assert.equal(stations.length, Object.keys(layout.seats).length)
  for (const station of stations) {
    const { fit } = fitFor(station)
    const label = station.business_id
    assert.ok(fit.width <= fit.panelWidth + 1e-12, `${label} 贴片比面板宽`)
    assert.ok(fit.height <= fit.panelHeight + 1e-12, `${label} 贴片比面板高`)
    const borderX = (fit.panelWidth - fit.width) / 2, borderY = (fit.panelHeight - fit.height) / 2
    assert.ok(borderX > 0 && borderX <= MONITOR_PANEL_BORDER_MAX + 1e-12, `${label} 左右边框 ${borderX} 超出 ≤1.5cm`)
    assert.ok(borderY > 0 && borderY <= MONITOR_PANEL_BORDER_MAX + 1e-12, `${label} 上下边框 ${borderY} 超出 ≤1.5cm`)
  }
})

test('R2-C 逐台：贴片四角离面板前表面 0.5–3 mm，且整片与面板共面（跟着后仰，不是竖直的）', () => {
  for (const station of stations) {
    const { fit } = fitFor(station)
    const label = station.business_id
    for (const corner of fit.corners) {
      const d = dot([corner.x - fit.panelCenter.x, corner.y - fit.panelCenter.y, corner.z - fit.panelCenter.z], fit.normal)
      assert.ok(d >= .0005 && d <= .003, `${label} 角点离面板 ${d * 1000} mm，不在 0.5–3 mm 内`)
    }
    // 四角到面板平面的距离必须一致 —— 贴片和面板平行，这正是老实现（竖直矩形）过不了的一条
    const ds = fit.corners.map(c => dot([c.x - fit.panelCenter.x, c.y - fit.panelCenter.y, c.z - fit.panelCenter.z], fit.normal))
    assert.ok(Math.max(...ds) - Math.min(...ds) < 1e-9, `${label} 贴片没有跟面板平行`)
    // 面板后仰 8°：贴片上下两边必须有高度差之外的 z 差
    assert.ok(Math.abs(fit.pitch) > .13 && Math.abs(fit.pitch) < .15, `${label} 贴片倾角 ${fit.pitch} 不是面板的后仰角`)
  }
})

// 外壳是低模：遮挡发生在三角形**面**上，光看顶点会漏掉。按重心坐标在每个三角形上打点，
// 任何既落在贴片足迹里、又跑到贴片平面前面的点，都算挡住了贴片。
const STEP = 24
// frame = { center, normal, up, width, height }；normal 必须是这块贴片**自己**的法线
// （老的竖直贴片是水平法线，新的跟着面板后仰），否则量出来的前后关系没有意义。
function worstOccluder(frame, monitor, yaw) {
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)], halfW = frame.width / 2, halfH = frame.height / 2
  let worst = -Infinity
  for (const prim of MODEL.prims) {
    for (let t = 0; t < prim.indices.length; t += 3) {
      const tri = [0, 1, 2].map(k => toWorld(MODEL.pos(prim.indices[t + k]), monitor, yaw))
      for (let i = 0; i <= STEP; i++) for (let j = 0; i + j <= STEP; j++) {
        const a = i / STEP, b = j / STEP, c = 1 - a - b
        const p = [0, 1, 2].map(ax => tri[0][ax] * a + tri[1][ax] * b + tri[2][ax] * c)
        const rel = [p[0] - frame.center.x, p[1] - frame.center.y, p[2] - frame.center.z]
        if (Math.abs(dot(rel, right)) > halfW || Math.abs(dot(rel, frame.up)) > halfH) continue // 不在贴片正前方
        const n = dot(rel, frame.normal)
        if (n > worst) worst = n
      }
    }
  }
  return worst
}
const frameOf = (fit) => ({ center: fit.center, normal: fit.normal, up: [fit.up.x, fit.up.y, fit.up.z], width: fit.width, height: fit.height })

test('R2-D 逐台：贴片不穿外壳、也不被外壳挡（外壳三角面没有一处伸到贴片前面）', () => {
  for (const station of stations) {
    const { fit, monitor, yaw } = fitFor(station)
    const worst = worstOccluder(frameOf(fit), monitor, yaw)
    // 贴片足迹内，外壳没有一处伸到贴片前面 —— 既不被挡，也没穿进外壳里
    assert.ok(worst < 0, `${station.business_id} 外壳伸到贴片前面 ${worst * 1000} mm`)
  }
})

test('R2-E 画布宽高比跟贴片走（不拉伸），图集仍在 2560×1440 以内', () => {
  const cellAspect = R1_SCREEN_CELL.width / R1_SCREEN_CELL.height
  for (const station of stations) {
    const { fit } = fitFor(station)
    assert.ok(Math.abs(fit.width / fit.height - cellAspect) < 1e-9, `${station.business_id} 贴片宽高比与画布不一致，会被拉伸`)
  }
  const atlas = r1ScreenAtlasSize(stations.length)
  assert.ok(atlas.width <= 2560 && atlas.height <= 1440)
  assert.ok(atlas.columns * atlas.rows >= stations.length)
  assert.deepEqual(r1ScreenAtlasSize(25), { columns: 5, rows: 5, width: 2560, height: 1440 })
})

test('R2-G 回归：老的「竖直矩形」贴法下半片确实被外壳挡住（这条守住修复不被改回去）', () => {
  const station = stations[0], { fit, monitor, yaw } = fitFor(station)
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)]
  // 复刻老实现：同一个中心、同样的宽高，但 up 取纯竖直 (0,1,0)
  const halfW = fit.width / 2, halfH = fit.height / 2
  const oldCorner = (sw, sh) => [fit.center.x + right[0] * halfW * sw, fit.center.y + halfH * sh, fit.center.z + right[2] * halfW * sw]
  const bottom = oldCorner(0, -1), top = oldCorner(0, 1)
  const depth = (p) => dot([p[0] - fit.panelCenter.x, p[1] - fit.panelCenter.y, p[2] - fit.panelCenter.z], fit.normal)
  assert.ok(depth(bottom) < -.015, `老贴法下边缘应当陷进面板里，实测 ${depth(bottom) * 1000} mm`)
  assert.ok(depth(top) > .015, `老贴法上边缘应当飘在面板外，实测 ${depth(top) * 1000} mm`)
  // 老贴片是竖直的，法线只有水平分量；外壳的面确实伸到它前面把下半片挡住
  const nh = Math.hypot(fit.normal[0], fit.normal[2])
  const oldFrame = { center: fit.center, normal: [fit.normal[0] / nh, 0, fit.normal[2] / nh], up: [0, 1, 0], width: fit.width, height: fit.height }
  const worstOld = worstOccluder(oldFrame, monitor, yaw)
  assert.ok(worstOld > .004, `老贴法应当被外壳挡住，实测最深只有 ${worstOld * 1000} mm`)
  assert.ok(worstOccluder(frameOf(fit), monitor, yaw) < 0, '新贴法不应再被挡')
})

test('R2-F 面板贴片确实比原来的玻璃贴片铺得更满', () => {
  const { fit } = fitFor(stations[0])
  // 老实现：玻璃宽高各减 12 mm
  const oldWidth = .379136648029089 * (.66 / .39268800616264343) - .012
  assert.ok(fit.width > oldWidth, '新贴片应当比老的玻璃贴片宽')
  assert.ok(fit.width / fit.panelWidth > .95 && fit.height / fit.panelHeight > .92)
})
