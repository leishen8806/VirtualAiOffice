// OFFICE-R1-DESKSTATUS（CMP-686）：工位屏幕显示当前任务、空闲显示 Win98；桌角状态灯。
// app.js 是浏览器入口、不能直接 import，这里把屏幕那一段纯函数从源码里切出来，
// 配一个记账用的假 2D 上下文来跑，断言的是真实现而不是复刻一份逻辑。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
