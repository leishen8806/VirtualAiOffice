// OFFICE-R1-DESKSTATUS（CMP-686）：工位屏幕显示当前任务、空闲显示 Win98；桌角状态灯。
// app.js 是浏览器入口、不能直接 import，这里把屏幕那一段纯函数从源码里切出来，
// 配一个记账用的假 2D 上下文来跑，断言的是真实现而不是复刻一份逻辑。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Furniture } from '../office-vis2/r1-furniture.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { r1ToWorld } from '../office-r1-layout.js'

const appURL = new URL('../app.js', import.meta.url)
const source = await readFile(appURL, 'utf8')

const BLOCK_START = '// 工位状态：屏幕左上角的色点和桌角状态灯必须永远一致'
const BLOCK_END = 'function drawScreen(scr, mode, tick, view) {'

// 把 DESK_STATE_* / deskStatus / wrapCJK / drawWin98 / drawR1Screen 整段取出来求值。
const loadScreenModule = (win98Image) => {
  const from = source.indexOf(BLOCK_START), to = source.indexOf(BLOCK_END)
  assert.ok(from > 0, 'app.js 里找不到工位状态那一段')
  assert.ok(to > from, 'app.js 里找不到 drawScreen 的新签名')
  const block = source.slice(from, to)
  const make = new Function('win98Tex', `${block}; return { DESK_STATE_COLOR, DESK_STATE_TEXT, deskStatus, wrapCJK, drawWin98, drawR1Screen }`)
  return make({ image: win98Image })
}

// 假 2D 上下文：汉字算 10 宽、其余算 6 宽，并把每次绘制记下来。
const fakeCtx = (width = 256, height = 144) => {
  const ops = []
  return {
    canvas: { width, height }, ops,
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    measureText(text) { return { width: [...String(text)].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 10 : 6), 0) } },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', x, y, w, h, fill: this.fillStyle }) },
    fillText(text, x, y) { ops.push({ op: 'fillText', text, x, y, fill: this.fillStyle }) },
    drawImage(img, x, y, w, h) { ops.push({ op: 'drawImage', img, x, y, w, h }) },
    beginPath() {}, arc(x, y, r) { ops.push({ op: 'arc', x, y, r, fill: this.fillStyle }) }, fill() {},
  }
}
const fakeScr = (width, height) => {
  const ctx = fakeCtx(width, height)
  let updates = 0
  return { ctx, scroll: 0, last: '', tex: { set needsUpdate(v) { if (v) updates++ } }, get updates() { return updates } }
}
const view = (over = {}) => ({ mode: 'idle', waits: [], data: {}, ...over })
const task = (id = 'CMP-686', title = '工位屏幕显示任务名') => ({ id, title, status: 'in_progress' })

test('DS-2 工位状态按卡面 F 行的优先级判定，屏幕与状态灯同源', () => {
  const { deskStatus, DESK_STATE_COLOR } = loadScreenModule(null)
  // 暂停 / 下班压过一切。
  assert.equal(deskStatus(view({ mode: 'pause', waits: [{}], data: { task: task() } })), 'pause')
  assert.equal(deskStatus(view({ mode: 'err' })), 'err')
  assert.equal(deskStatus(view({ mode: 'stall' })), 'stall')
  // 出错 / 卡住要压过「有等你处理的事」。
  assert.equal(deskStatus(view({ mode: 'err', waits: [{ kind: 'approval' }] })), 'err')
  assert.equal(deskStatus(view({ mode: 'stall', waits: [{ kind: 'approval' }] })), 'stall')
  // 「有等你处理的事」压过执行中。
  assert.equal(deskStatus(view({ mode: 'run', waits: [{ kind: 'approval' }] })), 'wait')
  assert.equal(deskStatus(view({ mode: 'run' })), 'run')
  // 有任务但没在跑 = 待开始（蓝）；没任务 = 空闲（白）。
  assert.equal(deskStatus(view({ mode: 'idle', data: { task: task() } })), 'todo')
  assert.equal(deskStatus(view({ mode: 'idle' })), 'idle')
  assert.equal(deskStatus(undefined), 'idle')
  // 颜色与头顶状态环同一套（卡面 F 行给定值）。
  assert.equal(DESK_STATE_COLOR.run, '#35d07f')
  assert.equal(DESK_STATE_COLOR.err, '#ff5d5d')
  assert.equal(DESK_STATE_COLOR.stall, '#ffb020')
  assert.equal(DESK_STATE_COLOR.wait, '#ffb020')
  assert.equal(DESK_STATE_COLOR.todo, '#6fa8ff')
  // 空闲是白、暂停是熄灭（最暗的一档）。
  assert.equal(DESK_STATE_COLOR.idle, '#d8dde2')
  assert.equal(DESK_STATE_COLOR.pause, '#3a3f44')
})

test('DS-1 中文任务名自动换行，最多 4 行，排不下收省略号', () => {
  const { wrapCJK } = loadScreenModule(null)
  const g = fakeCtx()
  // 每字 10 宽，限宽 100 → 每行 10 字。
  assert.deepEqual(wrapCJK(g, '一二三四五六七八九十', 100, 4), ['一二三四五六七八九十'])
  assert.deepEqual(wrapCJK(g, '一二三四五六七八九十甲', 100, 4), ['一二三四五六七八九十', '甲'])
  const long = '工'.repeat(50), lines = wrapCJK(g, long, 100, 4)
  assert.equal(lines.length, 4, '最多 4 行')
  assert.ok(lines[3].endsWith('…'), '超出的要收省略号')
  for (const line of lines) assert.ok(g.measureText(line).width <= 100, `行宽超限：${line}`)
  assert.deepEqual(wrapCJK(g, '', 100, 4), [])
})

test('DS-1 有任务画任务编号 + 状态字 + 中文任务名；无任务画 Win98；暂停黑屏', () => {
  const img = { width: 640, height: 400 }
  const { drawR1Screen } = loadScreenModule(img)
  // 有任务：编号、状态字、标题都要真的画出来，且有状态色点。
  const run = fakeScr(256, 144)
  drawR1Screen(run, 0, view({ mode: 'run', data: { task: task('CMP-686', '工位屏幕显示任务名') } }))
  const texts = run.ctx.ops.filter(o => o.op === 'fillText').map(o => o.text)
  assert.ok(texts.includes('CMP-686'), `没画任务编号：${texts}`)
  assert.ok(texts.includes('执行中'), `没画状态字：${texts}`)
  assert.ok(texts.join('').includes('工位屏幕显示任务名'), `没画任务名：${texts}`)
  assert.ok(run.ctx.ops.some(o => o.op === 'arc' && o.fill === '#35d07f'), '没画执行中的状态色点')
  assert.ok(run.ctx.ops.every(o => o.op !== 'drawImage'), '有任务时不该画 Win98')
  // 无任务且非暂停：铺满居中裁切的 Win98，不出现任何文字。
  const idle = fakeScr(256, 144)
  drawR1Screen(idle, 0, view({ mode: 'idle' }))
  const drawn = idle.ctx.ops.filter(o => o.op === 'drawImage')
  assert.equal(drawn.length, 1, '空闲要画 Win98 图')
  const d = drawn[0]
  // cover：等比放大到两边都铺满，居中裁切。640x400 填 256x144 → scale = max(.4, .36) = .4
  assert.ok(Math.abs(d.w / d.h - 640 / 400) < 1e-9, '不是等比缩放')
  assert.ok(d.w >= 256 - 1e-9 && d.h >= 144 - 1e-9, `没铺满：${d.w}x${d.h}`)
  assert.ok(Math.abs(d.x + d.w / 2 - 128) < 1e-9 && Math.abs(d.y + d.h / 2 - 72) < 1e-9, '没居中')
  assert.ok(idle.ctx.ops.every(o => o.op !== 'fillText'), '空闲画面不该有文字')
  // 暂停 / 下班：黑屏（本卡选黑屏，不做屏保）。
  const paused = fakeScr(256, 144)
  drawR1Screen(paused, 0, view({ mode: 'pause', data: { task: task() } }))
  assert.ok(paused.ctx.ops.every(o => o.op !== 'fillText' && o.op !== 'drawImage'), '暂停要黑屏')
  const rects = paused.ctx.ops.filter(o => o.op === 'fillRect')
  assert.equal(rects.length, 1)
  assert.deepEqual([rects[0].x, rects[0].y, rects[0].w, rects[0].h], [0, 0, 256, 144])
})

test('DS-3 任务不变不重画；任务编号或标题一变就重画', () => {
  const { drawR1Screen } = loadScreenModule({ width: 640, height: 400 })
  const scr = fakeScr(256, 144), v = view({ mode: 'idle', data: { task: task('CMP-686', '甲') } })
  drawR1Screen(scr, 0, v)
  const first = scr.updates
  assert.equal(first, 1)
  // 同样的数据连画 30 次，一次都不该重画。
  for (let i = 0; i < 30; i++) drawR1Screen(scr, 0, v)
  assert.equal(scr.updates, first, '数据不变却重画了')
  // 标题变了要重画。
  drawR1Screen(scr, 0, view({ mode: 'idle', data: { task: task('CMP-686', '乙') } }))
  assert.equal(scr.updates, first + 1, '标题变了没重画')
  // 任务编号变了要重画。
  drawR1Screen(scr, 0, view({ mode: 'idle', data: { task: task('CMP-687', '乙') } }))
  assert.equal(scr.updates, first + 2, '任务编号变了没重画')
  // 状态变了要重画（待开始 → 执行中）。
  drawR1Screen(scr, 0, view({ mode: 'run', data: { task: task('CMP-687', '乙') } }))
  assert.equal(scr.updates, first + 3, '状态变了没重画')
  // 撤掉任务 → Win98，也要重画。
  drawR1Screen(scr, 0, view({ mode: 'idle' }))
  assert.equal(scr.updates, first + 4, '撤任务没重画')
  // 空闲画面同样要去重：Win98 不该每帧重画。
  for (let i = 0; i < 30; i++) drawR1Screen(scr, 0, view({ mode: 'idle' }))
  assert.equal(scr.updates, first + 4, '空闲画面每帧都在重画')
})

test('DS-3 执行中的活动条会动，但不改变重画以外的档位行为', () => {
  const { drawR1Screen } = loadScreenModule({ width: 640, height: 400 })
  const scr = fakeScr(256, 144), t = task('CMP-686', '甲')
  // tick 变化时执行中才重画（活动条流动），其余状态不受 tick 影响。
  drawR1Screen(scr, 0, view({ mode: 'run', data: { task: t } }))
  drawR1Screen(scr, 1, view({ mode: 'run', data: { task: t } }))
  assert.equal(scr.updates, 2, '执行中的活动条没跟着 tick 动')
  const still = fakeScr(256, 144)
  drawR1Screen(still, 0, view({ mode: 'idle', data: { task: t } }))
  drawR1Screen(still, 1, view({ mode: 'idle', data: { task: t } }))
  assert.equal(still.updates, 1, '非执行中的屏幕不该跟着 tick 重画')
})

test('DS-1 屏幕画布放大到 512×288 时所有元素按比例走，不超出画布', () => {
  const { drawR1Screen } = loadScreenModule({ width: 640, height: 400 })
  const big = fakeScr(512, 288)
  drawR1Screen(big, 0, view({ mode: 'run', data: { task: task('CMP-686', '工位屏幕显示当前任务名称'.repeat(3)) } }))
  for (const op of big.ctx.ops) {
    if (op.op === 'fillRect') {
      assert.ok(op.x >= 0 && op.y >= 0, `矩形出界：${JSON.stringify(op)}`)
      assert.ok(op.x + op.w <= 512 + 1e-9 && op.y + op.h <= 288 + 1e-9, `矩形出界：${JSON.stringify(op)}`)
    }
    if (op.op === 'fillText') assert.ok(op.x >= 0 && op.x <= 512 && op.y >= 0 && op.y <= 288, `文字出界：${JSON.stringify(op)}`)
  }
  // 字号跟着画布放大（256 时 15px 正文 → 512 时 30px）。
  assert.ok(big.ctx.ops.some(o => o.op === 'fillText'), '放大后没画出文字')
})

test('DS-5 Win98 素材只在一处引用，且已登记进 MANIFEST 与 ASSET_LEDGER', async () => {
  // 代码里集中一处引用，方便日后替换。
  const hits = source.match(/win98-idle\.png/g) || []
  assert.equal(hits.length, 1, `app.js 里出现了 ${hits.length} 次素材路径，应当只有常量那一处`)
  assert.match(source, /const WIN98_IDLE_IMAGE = '\.\/assets\/win98-idle\.png'/)
  const manifest = JSON.parse(await readFile(new URL('../office-vis2/MANIFEST.json', import.meta.url), 'utf8'))
  const entry = manifest.textures.find(t => t.file === 'assets/win98-idle.png')
  assert.ok(entry, 'MANIFEST 贴图清单里没有 Win98 图片')
  assert.equal(entry.sha256, '1685F3448B076FBBB68A699AA31ACCE42B1826ADBC94CF74E85DCD2D1EF589FF')
  assert.deepEqual(entry.dimensions, [640, 400])
  assert.match(entry.source, /董事会提供/)
  assert.match(entry.licenseAsRecorded, /第三方商标图片，董事会决定仅用于内部展示/)
  const ledger = await readFile(new URL('../assets/ASSET_LEDGER.md', import.meta.url), 'utf8')
  assert.match(ledger, /win98-idle\.png/)
  assert.match(ledger, /董事会提供/)
  assert.match(ledger, /第三方商标图片，董事会决定仅用于内部展示/)
})

test('DS-5 旧布局的屏幕分支逐值不变，只多了一个可选参数', () => {
  // 非 R1 仍走原来的四种装饰画面，宽高仍是写死的 256×144。
  assert.match(source, /function drawScreen\(scr, mode, tick, view\) \{\s*\n\s*if \(OFFICE_LAYOUT\.r1Phase === 'R1'\) return drawR1Screen\(scr, tick, view\)\s*\n\s*const g = scr\.ctx, w = 256, h = 144/)
  for (const legacy of ['LIVE WORKSPACE', 'ERROR', 'NO OUTPUT', 'VIRTUAL AI OFFICE', 'standby / ready for next task']) {
    assert.ok(source.includes(legacy), `旧布局画面少了 ${legacy}`)
  }
  // 旧布局的去重键没被动过。
  assert.match(source, /const key = mode \+ \(\(mode === 'run' \|\| mode === 'idle'\) \? tick : ''\) \+ \(markTex\.image \? 'm' : ''\)/)
})

// ───────────── DS-4 桌角状态灯 ─────────────
// 这一段要真的把 R1 家具建出来，所以按既有 R1 测试的做法加载 GLB。
const hooks = registerHooks({ resolve(s, c, next) { return s === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(s, c) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()
const glb = async name => {
  const b = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene
}
const FURN = {}
for (const name of ['computerKeyboard', 'computerMouse', 'books', 'lampRoundTable', 'plantSmall1', 'computerScreen', 'table', 'chairModernCushion', 'bookcaseOpen', 'cabinetTelevision', 'chairRounded', 'desk', 'chairDesk']) FURN[name] = await glb(name)
const A = { furn: FURN }

const buildFurniture = (layout = createOfficeR1Layout()) => {
  const root = new THREE.Group(), collision = createFurnitureCollision()
  return { root, collision, f: buildR1Furniture({ THREE, root, layout, collision, makeScreenTexture: fakeScreenTexture, A, placeFurniture }) }
}
// buildR1Furniture 要一个能当画布用的屏幕纹理；这里给个最小实现。
function fakeScreenTexture() {
  const ctx = fakeCtx(256, 144)
  return { ctx, scroll: 0, last: '', tex: { needsUpdate: false, dispose() {} } }
}
const gap = (a, b) => Math.hypot(
  Math.max(b.min.x - a.max.x, a.min.x - b.max.x, 0),
  Math.max(b.min.y - a.max.y, a.min.y - b.max.y, 0),
  Math.max(b.min.z - a.max.z, a.min.z - b.max.z, 0))

test('DS-4 25 盏状态灯逐盏：在本桌桌面范围内、底面贴桌面、不与桌面件相交', () => {
  const { f } = buildFurniture(), lamps = f.statusLamps, M = lamps.metrics
  const stations = createOfficeR1Layout().r1.workstations
  assert.equal(stations.length, 25)
  assert.equal(lamps.posts.count, 25)
  assert.equal(lamps.caps.count, 25)
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3()
  stations.forEach((station, i) => {
    // 杆：底面正好贴桌面 y=.76。
    lamps.posts.getMatrixAt(i, m); m.decompose(pos, quat, scl)
    // instanceMatrix 是 Float32Array，容差按 float32 取 1e-6。
    const postBottom = pos.y - M.postHeight / 2
    assert.ok(Math.abs(postBottom - M.deskTop) < 1e-6, `第 ${i} 盏杆底没贴桌面：${postBottom}`)
    // 灯头：离桌面 0.12–0.2 m（卡面 E 行）。
    lamps.caps.getMatrixAt(i, m); m.decompose(pos, quat, scl)
    const above = pos.y - M.deskTop
    assert.ok(above >= .12 && above <= .2, `第 ${i} 盏灯头离桌面 ${above}，不在 0.12–0.2 m`)
    // 杆与灯头在同一条竖线上。
    const spot = lamps.spots[i]
    assert.ok(Math.abs(pos.x - spot.x) < 1e-5 && Math.abs(pos.z - spot.z) < 1e-5)
    // 在本桌桌面范围内。
    const deskBox = f.itemBounds.get(station.desk_id)
    assert.ok(deskBox, `第 ${i} 盏找不到本桌包围盒`)
    assert.ok(spot.x >= deskBox.min.x && spot.x <= deskBox.max.x, `第 ${i} 盏 x 出了桌面范围`)
    assert.ok(spot.z >= deskBox.min.z && spot.z <= deskBox.max.z, `第 ${i} 盏 z 出了桌面范围`)
    // 与本桌所有桌面件（键盘 / 鼠标 / 鼠标垫 / 个人物品）和显示器都不相交。
    const lampBox = new THREE.Box3(
      new THREE.Vector3(spot.x - M.cap, M.deskTop, spot.z - M.cap),
      new THREE.Vector3(spot.x + M.cap, M.deskTop + M.capY + M.cap, spot.z + M.cap))
    const obstacles = (f.desktopItems.get(station.desk_id) || []).map(d => ({ id: d.id, box: d.bounds }))
    const monitor = f.itemBounds.get(lamps.monitorByDesk.get(station.desk_id))
    if (monitor) obstacles.push({ id: `${station.desk_id}/monitor`, box: monitor })
    assert.ok(obstacles.length >= 3, `第 ${i} 盏没取到桌面件，断言会变成空转`)
    for (const o of obstacles) assert.ok(gap(lampBox, o.box) > 0, `第 ${i} 盏与 ${o.id} 相交`)
  })
  f.dispose()
})

test('DS-4 状态灯是新增批次，没挪用模型颜色圆片，且只多 2 个 draw call', () => {
  const { f } = buildFurniture()
  const batches = f.root.children.filter(n => (n.isMesh || n.isInstancedMesh) && n.visible)
  const lamps = batches.filter(n => n.name.startsWith('r1-workstation-status-'))
  assert.equal(lamps.length, 2, '状态灯应当是 2 个批次（杆 + 灯头）')
  assert.ok(lamps.every(n => n.isInstancedMesh && n.count === 25), '两个批次都要是 25 实例的 InstancedMesh')
  // 模型颜色圆片还在，且没被状态灯接管。
  const badges = batches.find(n => n.name === 'r1-workstation-badges')
  assert.ok(badges && badges.isInstancedMesh && badges.count === 25, '原来的模型圆片不该被动')
  assert.ok(!lamps.includes(badges))
  f.dispose()
})

test('DS-4 灯头颜色走 instanceColor，与头顶状态环同一套色', () => {
  const { f } = buildFurniture()
  const { DESK_STATE_COLOR } = loadScreenModule(null)
  const handle = f.deskAt(...(() => { const s = createOfficeR1Layout().r1.workstations[0]; const w = r1ToWorld(s.xM, s.yM); return [w.x, w.z] })())
  assert.ok(handle && typeof handle.setStatusLight === 'function', '每张桌要有 setStatusLight')
  const read = i => { const c = new THREE.Color(); f.statusLamps.caps.getColorAt(i, c); return '#' + c.getHexString() }
  // 默认是空闲白。
  assert.equal(read(0), DESK_STATE_COLOR.idle.toLowerCase())
  for (const state of ['run', 'err', 'stall', 'wait', 'todo', 'idle', 'pause']) {
    handle.setStatusLight(DESK_STATE_COLOR[state])
    assert.equal(read(0), DESK_STATE_COLOR[state].toLowerCase(), `${state} 颜色没写进 instanceColor`)
  }
  // 只动这一盏，别的不受影响。
  assert.equal(read(1), DESK_STATE_COLOR.idle.toLowerCase())
  f.dispose()
})

test('DS-5 非 R1 入口不建状态灯', () => {
  const root = new THREE.Group()
  const none = buildR1Furniture({ THREE, root, layout: undefined, collision: createFurnitureCollision(), makeScreenTexture: fakeScreenTexture, A, placeFurniture })
  assert.equal(none.statusLamps, undefined)
  assert.equal(root.children.length, 0)
  none.dispose()
})
