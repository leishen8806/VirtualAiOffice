import { r1ToWorld } from '../office-r1-layout.js'
import { createSampleBatch } from './batch.js'
import { officeLeafGeometry } from './plants.js'
import { r1DoorPlan } from './r1-doors.js'

// R1 接待台背后的实体背景墙 00-W-036 朝入口一面的品牌件：铺满的黑底 + 铜色压条 + DR.LIFE+ 标志 + 一行英文标语，
// 另加 3 盏隐藏式聚光灯在上部打出柔和暖光晕（董事会 2026-10-29 选定的效果：看不到灯具、光柱和扇形光斑）。
// 墙本身不改；几何尺寸一律从登记行推出来，所以黑底与墙面四边天然对齐。
export const R1_BRAND_WALL_ID = '00-W-036'
export const R1_BRAND_LOGO_URL = new URL('../assets/logo.png', import.meta.url).href
export const R1_BRAND_LOGO_ASPECT = Object.freeze([979, 544])
export const R1_BRAND_SLOGAN = 'INFINITE POSSIBILITIES'
export const r1BrandSpec = Object.freeze({
  panel: Object.freeze({ width: 5, height: 3, depth: .03, color: '#1E1B19', roughness: .5, metalness: .15 }),
  trim: Object.freeze({ height: .05, depth: .05, color: '#B8955A', metalness: .7, roughness: .35 }),
  logo: Object.freeze({ width: 2.4, centerY: 2.2, emissiveIntensity: .25 }),
  slogan: Object.freeze({ width: 3.4, centerY: 1.2, canvas: Object.freeze([1600, 300]), color: '#E2C07A' }),
  lights: Object.freeze({
    offsets: Object.freeze([-1.6, 0, 1.6]), y: 3.3, standoff: 1.3, targetY: 1.9,
    color: '#ffe2b0', intensity: 10, distance: 6, angle: .45, penumbra: .75, decay: 1.5,
  }),
  // 黑底 0.015、压条 0.03、标志与标语 0.035：都落在验收要求的墙面前 0.005–0.06 m 之间。
  gap: Object.freeze({ panel: .015, trim: .03, art: .035, glow: .034 }),
})

export function drawR1BrandSlogan(ctx, width, height) {
  ctx.clearRect(0, 0, width, height)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = r1BrandSpec.slogan.color
  ctx.font = '600 92px Inter, Arial, sans-serif'
  ctx.letterSpacing = '14px'
  ctx.fillText(R1_BRAND_SLOGAN, width / 2, height / 2)
}

// 低档的替代光晕：三团很淡的径向渐变，Additive 叠在黑底上，模拟聚光灯的暖色光晕。
export function drawR1BrandGlow(ctx, width, height) {
  ctx.clearRect(0, 0, width, height)
  for (const offset of r1BrandSpec.lights.offsets) {
    const cx = width * (.5 + offset / r1BrandSpec.panel.width), cy = height * .28, r = width * .17
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gradient.addColorStop(0, 'rgba(255,226,176,.46)')
    gradient.addColorStop(.55, 'rgba(255,205,140,.16)')
    gradient.addColorStop(1, 'rgba(255,196,128,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  }
}

// ───────────────────────── 氛围五项（CMP-624 / OFFICE-R1-AMBIENCE）─────────────────────────
// 形象墙、房间名牌、欢迎光临、会议室大屏都挂在本模块里，不往 R1 模块列表加新模块。
// 所有尺寸从登记行推出来；实心件进一个合批（r1-ambience-surfaces），带字的件共用一张图集。
export const R1_AMBIENCE_SLOGAN = 'INFINITE POSSIBILITIES'
export const r1AmbienceSpec = Object.freeze({
  emblem: Object.freeze({
    centerXM: 28, centerY: 1.65,
    discRadius: 1.3, ringRadius: 1.32, ringTube: .06, haloRadius: 1.46, haloTube: .015,
    logoWidth: 1.9, logoRise: .08, sloganWidth: 1.6, sloganDrop: .72,
    disc: '#1E1B19', bronze: '#B8955A', warm: '#FFE2A8', gold: '#E2C07A',
    // 朝中庭一面的四层：黑盘 0.04、铜环 0.06、暖光环 0.03、标志与标语 0.05，都在墙面前 0.005–0.06 m。
    gap: Object.freeze({ disc: .04, ring: .06, halo: .03, art: .05 }),
  }),
  planter: Object.freeze({
    radius: 1.75, height: .3, segments: 48, rim: '#8E877C', soil: '#4D4736',
    shrubs: 14, leaves: 5, arcInset: .6, innerRadius: .9, outerRadius: 1.2, leafLength: .32,
    tints: Object.freeze(['#365A3D', '#547044', '#7A8D53', '#456A4C']),
  }),
  plate: Object.freeze({
    width: 1.3, height: .26, depth: .03, centerY: 2.55, clearance: .025,
    frame: '#B8955A', face: '#1E1B19', text: '#E2C07A', canvas: Object.freeze([1024, 208]),
  }),
  welcome: Object.freeze({
    at: Object.freeze([28, -1.6]), width: 7, lift: .0025,
    canvas: Object.freeze([2048, 320]), color: '#C9A15E',
  }),
  screen: Object.freeze({
    wallId: '00-W-003', centerXM: 12.5, centerY: 2.18, width: 4.2, height: 4.2 * 9 / 16,
    bezelWidth: 4.42, bezelHeight: 2.56, bezelDepth: .07, bezel: '#111418',
    glowY: .89, glowSize: .02, minRedrawMs: 5000, canvas: Object.freeze([2048, 1152]),
    gap: Object.freeze({ bezel: .04, face: .081, glow: .05 }),
    ink: '#F3EEE4', dim: '#8D96A3', back: '#0E141B', card: '#16202B', cell: '#1D2935', track: '#26323F',
  }),
})

// 7 块房间名牌；BACKWALL 新开的 11-D-002 / 003 两樘门不挂牌。
export const R1_ROOM_PLATES = Object.freeze([
  Object.freeze({ doorId: '01-D-001', text: '市场部' }),
  Object.freeze({ doorId: '02-D-001', text: '会议与决策' }),
  Object.freeze({ doorId: '05-D-001', text: '客服部' }),
  Object.freeze({ doorId: '09-D-001', text: '售后部' }),
  Object.freeze({ doorId: '13-D-001', text: '营销部' }),
  Object.freeze({ doorId: '03-D-001', text: '洽谈室 A' }),
  Object.freeze({ doorId: '03-D-002', text: '洽谈室 B' }),
])

// 名牌的悬挑距离不是写死的：门扇先离开墙中线 offset，再沿轨道平移，两段行程合起来的最远处
// 就是 |offset| + 门扇半厚。名牌挂在它之外，再留 clearance，101 个相位都碰不到。
export function r1PlateStandoff(layout) {
  const wanted = new Set(R1_ROOM_PLATES.map(row => row.doorId))
  const reach = r1DoorPlan(layout).filter(row => wanted.has(row.doorId))
    .reduce((most, row) => Math.max(most, Math.abs(row.offset) + row.thickness / 2), 0)
  return reach + r1AmbienceSpec.plate.clearance + r1AmbienceSpec.plate.depth / 2
}

// 图集里逐格绘制，所以每个画法都接一个 top 偏移，不依赖 save / translate / restore。
// 铜框用四条 fillRect 画，不用 strokeRect：画布调用面越窄，假上下文越好对。
export function drawR1Nameplate(ctx, width, height, text, top = 0) {
  const S = r1AmbienceSpec.plate, edge = Math.round(height * .055)
  ctx.fillStyle = S.frame; ctx.fillRect(0, top, width, height)
  ctx.fillStyle = S.face; ctx.fillRect(edge, top + edge, width - edge * 2, height - edge * 2)
  ctx.fillStyle = S.text; ctx.font = `bold ${Math.round(height * .46)}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, top + height / 2 + height * .02)
}

export function drawR1AmbienceSlogan(ctx, width, height, top = 0) {
  ctx.fillStyle = r1AmbienceSpec.emblem.disc; ctx.fillRect(0, top, width, height)
  ctx.fillStyle = r1AmbienceSpec.emblem.gold
  ctx.font = `600 ${Math.round(height * .42)}px Inter, Arial, sans-serif`
  ctx.letterSpacing = `${Math.round(height * .08)}px`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(R1_AMBIENCE_SLOGAN, width / 2, top + height / 2)
}

export function drawR1Welcome(ctx, width, height, top = 0) {
  ctx.clearRect(0, top, width, height)
  ctx.fillStyle = r1AmbienceSpec.welcome.color
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `bold ${Math.round(height * .53)}px "KaiTi", "STKaiti", serif`
  ctx.fillText('欢 迎 光 临', width / 2, top + height * .375)
  ctx.font = `600 ${Math.round(height * .22)}px Inter, Arial, sans-serif`
  ctx.letterSpacing = `${Math.round(height * .075)}px`
  ctx.fillText('WELCOME', width / 2, top + height * .8)
}

// 上游取不到的字段会变成 { value: null, reason }；大屏一律读成空值，不抛错也不显示原因码。
const plainValue = value => (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value ? value.value : value)
const finiteOf = value => { const n = Number(plainValue(value)); return Number.isFinite(n) ? n : null }
const textOf = value => { const v = plainValue(value); return typeof v === 'string' ? v : '' }
const PERSON_STATES = Object.freeze({ live: '执行中', error: '出错', paused: '已暂停', task: '有任务', idle: '空闲' })
const personState = agent => agent?.liveRun ? 'live' : agent?.status === 'error' ? 'error'
  : agent?.status === 'paused' ? 'paused' : agent?.task ? 'task' : 'idle'

// 大屏只读 today / agents / names 和 /daily 的 done；token、Telegram、费用一律不进模型。
export function r1WallScreenModel(state, daily) {
  const today = state?.today || {}, open = today.open || {}, runs = today.runs || {}
  const names = state?.names || {}, agents = Array.isArray(state?.agents) ? state.agents : []
  return {
    date: textOf(today.date), weekday: textOf(today.weekday), onDuty: Boolean(plainValue(today.onDuty)),
    tasks: {
      done: finiteOf(today.done), total: finiteOf(today.total), percent: finiteOf(today.percent),
      backlog: finiteOf(today.backlog), comments: finiteOf(today.comments),
      open: { inProgress: finiteOf(open.inProgress), inReview: finiteOf(open.inReview), blocked: finiteOf(open.blocked), todo: finiteOf(open.todo) },
      runs: { total: finiteOf(runs.total), succeeded: finiteOf(runs.succeeded), failed: finiteOf(runs.failed) },
    },
    projects: (Array.isArray(today.byProject) ? today.byProject : []).slice(0, 5)
      .map(row => ({ name: textOf(row?.name) || '未归类', done: finiteOf(row?.done) || 0, total: finiteOf(row?.total) || 0 })),
    people: agents.slice(0, 25).map(agent => ({
      name: (textOf(names[agent?.id]) || textOf(agent?.name)).slice(0, 8),
      state: personState(agent),
      task: textOf(agent?.task?.id).slice(0, 14),
    })),
    peopleTotal: agents.length,
    done: (Array.isArray(daily?.done) ? daily.done : []).slice(0, 4)
      .map(row => ({ ident: textOf(row?.ident), title: textOf(row?.title).slice(0, 16) })),
  }
}

const screenNumber = value => (value === null ? '—' : String(value))

export function drawR1WallScreen(ctx, width, height, model) {
  const S = r1AmbienceSpec.screen, gold = r1AmbienceSpec.emblem.gold
  const yahei = (weight, size) => `${weight} ${size}px "Microsoft YaHei", sans-serif`
  const inter = (weight, size) => `${weight} ${size}px Inter, Arial, sans-serif`
  ctx.fillStyle = S.back; ctx.fillRect(0, 0, width, height)
  const header = ctx.createLinearGradient(0, 0, width, 0)
  header.addColorStop(0, 'rgba(226,192,122,.18)'); header.addColorStop(1, 'rgba(226,192,122,0)')
  ctx.fillStyle = header; ctx.fillRect(0, 0, width, 110)
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillStyle = gold; ctx.font = yahei(700, 58); ctx.fillText('智序工场 · 今日看板', 56, 58)
  ctx.fillStyle = S.ink; ctx.font = yahei(500, 40); ctx.textAlign = 'right'
  ctx.fillText(`${model.date || '—'} ${model.weekday} · ${model.onDuty ? '上班中' : '已下班'}`, width - 56, 58)
  ctx.textAlign = 'left'
  const box = (x, y, w, h, title) => {
    ctx.fillStyle = S.card; ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill()
    ctx.fillStyle = gold; ctx.font = yahei(600, 34); ctx.fillText(title, x + 28, y + 40)
  }
  // 今日任务进度：进度环 + 各状态计数 + 运行与评论。
  box(40, 140, 760, 470, '今日任务进度')
  const percent = Math.max(0, Math.min(1, model.tasks.percent ?? 0)), cx = 220, cy = 390, r = 140
  ctx.lineWidth = 34; ctx.strokeStyle = S.track; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = '#4FC08D'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * percent); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = S.ink; ctx.font = inter(700, 84); ctx.fillText(`${Math.round(percent * 100)}%`, cx, cy - 8)
  ctx.fillStyle = S.dim; ctx.font = yahei(500, 32)
  ctx.fillText(`完成 ${screenNumber(model.tasks.done)} / ${screenNumber(model.tasks.total)}`, cx, cy + 62)
  ctx.textAlign = 'left'
  const stats = [['进行中', model.tasks.open.inProgress, '#4FC08D'], ['待验收', model.tasks.open.inReview, '#E2B44F'],
    ['阻塞', model.tasks.open.blocked, '#E06464'], ['待开始', model.tasks.open.todo, '#6CA3E0'], ['待排期', model.tasks.backlog, S.dim]]
  stats.forEach(([label, value, colour], index) => {
    const y = 240 + index * 70
    ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(440, y, 12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = S.ink; ctx.font = yahei(500, 36); ctx.fillText(label, 470, y)
    ctx.font = inter(700, 44); ctx.textAlign = 'right'; ctx.fillText(screenNumber(value), 760, y); ctx.textAlign = 'left'
  })
  ctx.fillStyle = S.dim; ctx.font = yahei(500, 28)
  ctx.fillText(`运行 ${screenNumber(model.tasks.runs.total)} 次 · 成功 ${screenNumber(model.tasks.runs.succeeded)} · 失败 ${screenNumber(model.tasks.runs.failed)} · 评论 ${screenNumber(model.tasks.comments)}`, 70, 585)
  // 各项目完成情况。
  box(40, 630, 760, 330, '各项目完成情况')
  model.projects.forEach((project, index) => {
    const y = 710 + index * 50, w = 380, fraction = project.total ? project.done / project.total : 0
    ctx.fillStyle = S.ink; ctx.font = yahei(500, 30); ctx.fillText(project.name, 70, y)
    ctx.fillStyle = S.track; ctx.fillRect(330, y - 12, w, 24)
    ctx.fillStyle = gold; ctx.fillRect(330, y - 12, w * Math.max(0, Math.min(1, fraction)), 24)
    ctx.fillStyle = S.dim; ctx.textAlign = 'right'; ctx.fillText(`${project.done}/${project.total}`, 780, y); ctx.textAlign = 'left'
  })
  // 同事状态卡。
  box(830, 140, 1178, 820, `同事状态 · ${model.peopleTotal} 人`)
  const colourOf = { live: '#4FC08D', error: '#E06464', paused: '#59636F', task: '#E2B44F', idle: '#6CA3E0' }
  model.people.forEach((person, index) => {
    const x = 860 + (index % 5) * 228, y = 200 + Math.floor(index / 5) * 150
    ctx.fillStyle = S.cell; ctx.beginPath(); ctx.roundRect(x, y, 212, 134, 14); ctx.fill()
    ctx.fillStyle = colourOf[person.state]; ctx.fillRect(x, y, 8, 134)
    ctx.fillStyle = S.ink; ctx.font = yahei(600, 32); ctx.fillText(person.name, x + 24, y + 34)
    ctx.fillStyle = colourOf[person.state]; ctx.font = yahei(500, 26); ctx.fillText(PERSON_STATES[person.state], x + 24, y + 74)
    ctx.fillStyle = S.dim; ctx.font = inter(500, 22); ctx.fillText(person.task, x + 24, y + 110)
  })
  // 今日完成滚动行。
  ctx.fillStyle = S.card; ctx.beginPath(); ctx.roundRect(40, 985, 1968, 130, 18); ctx.fill()
  ctx.fillStyle = gold; ctx.font = yahei(600, 32); ctx.fillText('今日已完成', 70, 1050)
  ctx.fillStyle = S.ink; ctx.font = yahei(500, 30)
  ctx.fillText(model.done.map(row => `${row.ident} ${row.title}`).join('   ·   ') || '今天还没有完成的任务', 270, 1050, 1700)
}

const canvasTexture = (THREE, canvasTex, width, height, draw) => {
  if (canvasTex) return canvasTex(width, height, draw)
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// 高档走 EffectComposer 的 GTAO 管线，整个场景每帧渲染两遍，所以每多一个网格就多两次
// draw call。氛围五项因此只留三个网格：实心件一个合批、带字的件一张图集、大屏自己一张画布。
// 图集自上而下：7 块名牌、形象墙标语、欢迎光临、DR.LIFE+ 标志、一条暖光色块。
export const ATLAS_WIDTH = r1AmbienceSpec.plate.canvas[0]
export const R1_AMBIENCE_ATLAS = (() => {
  const cells = {}
  let top = 0
  const put = (name, height) => { cells[name] = { top, height }; top += height }
  R1_ROOM_PLATES.forEach((row, index) => put(`plate${index}`, r1AmbienceSpec.plate.canvas[1]))
  put('slogan', ATLAS_WIDTH / 8)
  put('welcome', Math.round(ATLAS_WIDTH * r1AmbienceSpec.welcome.canvas[1] / r1AmbienceSpec.welcome.canvas[0]))
  put('logo', Math.round(ATLAS_WIDTH * R1_BRAND_LOGO_ASPECT[1] / R1_BRAND_LOGO_ASPECT[0]))
  put('warm', 32)
  return Object.freeze({ width: ATLAS_WIDTH, height: top, cells: Object.freeze(cells) })
})()
// 竖向缩进 2 px：相邻格在低层 mipmap 上不互相渗色。
const atlasRect = name => {
  const cell = R1_AMBIENCE_ATLAS.cells[name], height = R1_AMBIENCE_ATLAS.height
  return [0, 1 - (cell.top + cell.height - 2) / height, 1, 1 - (cell.top + 2) / height]
}
const atlasAspect = name => R1_AMBIENCE_ATLAS.cells[name].height / ATLAS_WIDTH

export function drawR1AmbienceAtlas(ctx, width, height) {
  const cells = R1_AMBIENCE_ATLAS.cells
  R1_ROOM_PLATES.forEach((row, index) => drawR1Nameplate(ctx, width, cells[`plate${index}`].height, row.text, cells[`plate${index}`].top))
  drawR1AmbienceSlogan(ctx, width, cells.slogan.height, cells.slogan.top)
  drawR1Welcome(ctx, width, cells.welcome.height, cells.welcome.top)
  // 暖光色块给形象墙的光环和大屏底边光带取色；标志那一格等 logo.png 到了再画上去。
  ctx.fillStyle = r1AmbienceSpec.emblem.warm
  ctx.fillRect(0, cells.warm.top, width, cells.warm.height)
}

const mergeGeometries = (THREE, geometries, withUv = false) => {
  const keys = withUv ? ['position', 'normal', 'uv'] : ['position', 'normal']
  const parts = geometries.map(geometry => (geometry.index ? geometry.toNonIndexed() : geometry))
  const merged = new THREE.BufferGeometry()
  for (const key of keys) {
    const values = []
    for (const part of parts) values.push(...part.attributes[key].array)
    merged.setAttribute(key, new THREE.Float32BufferAttribute(values, key === 'uv' ? 2 : 3))
  }
  parts.forEach((part, index) => { if (part !== geometries[index]) part.dispose(); geometries[index].dispose() })
  merged.computeBoundingBox(); merged.computeBoundingSphere()
  return merged
}

// 整块几何取同一个颜色：把所有 UV 压到图集某一格的中心。
const paintUv = (geometry, [u0, v0, u1, v1]) => {
  const uv = geometry.attributes.uv, u = (u0 + u1) / 2, v = (v0 + v1) / 2
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v)
  return geometry
}

// 带 UV 子矩形的平面：图集里的一格贴到一块牌子上。
const atlasQuad = (THREE, { width, height, uv, position, yaw = 0, tilt = 0 }) => {
  const geometry = new THREE.PlaneGeometry(width, height), attribute = geometry.attributes.uv
  const [u0, v0, u1, v1] = uv
  for (let i = 0; i < attribute.count; i++) attribute.setXY(i, u0 + attribute.getX(i) * (u1 - u0), v0 + attribute.getY(i) * (v1 - v0))
  if (tilt) geometry.rotateX(tilt)
  if (yaw) geometry.rotateY(yaw)
  geometry.translate(...position)
  return geometry
}

// 大屏要反复重画，所以留着画布上下文；没有 document 时（node 测试）由宿主注入。
const screenSurface = (THREE, make, width, height) => {
  if (make) return make(width, height)
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
  return { ctx: canvas.getContext('2d'), texture }
}

const boxOf = (THREE, centre, size) => new THREE.Box3().setFromCenterAndSize(
  new THREE.Vector3(centre.x, centre.y, centre.z), new THREE.Vector3(...size))

export function buildR1Brand({ THREE, root, layout, quality, low = false, canvasTex, canvasSurface, textureLoader, collision, clock }) {
  const wall = layout?.r1Phase === 'R1' && layout.r1.elements.find(row => row.id === R1_BRAND_WALL_ID)
  if (!wall) return { dispose() {} }
  // quality.js 的灯光预算只在高档保留 SpotLight（中档只留必要灯 + 点光，低档只留必要灯），
  // 所以实时聚光灯只在高档建；中低档一律改用光晕贴图，否则中档会既没有灯也没有光晕、屏风全黑。
  const lowTier = quality ? quality.tier !== 'high' : low
  const group = new THREE.Group(); group.name = 'r1-brand'; group.userData.dynamic = true
  const { panel: P, trim: T, logo: L, slogan: S, lights: SL, gap } = r1BrandSpec
  const centre = r1ToWorld(wall.xM, wall.yM), face = centre.z + wall.widthM / 2
  const width = wall.lengthM, height = wall.heightM
  const owned = [], lights = []

  // 黑底与顶部铜条合成一个网格：合批按顶点携带颜色和粗糙度 / 金属度，所以两种饰面共用一次 draw call。
  // 压条宽度取墙面全长（不外伸），黑底四条边因此与墙面严格对齐。
  const batch = createSampleBatch(THREE)
  batch.add(new THREE.BoxGeometry(width, height, P.depth), P.color, [centre.x, height / 2, face + gap.panel], 0, P.roughness, P.metalness)
  batch.add(new THREE.BoxGeometry(width, T.height, T.depth), T.color, [centre.x, height - T.height / 2, face + gap.trim], 0, T.roughness, T.metalness)
  const built = batch.build(group, 'r1-brand-panel')

  // 标志：先把平面建出来（比例锁 979 : 544），贴图加载成功才显示；失败就只剩黑底、压条、标语和灯光。
  const logoHeight = L.width * R1_BRAND_LOGO_ASPECT[1] / R1_BRAND_LOGO_ASPECT[0]
  const logoMaterial = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, metalness: .3, roughness: .35, emissive: new THREE.Color('#ffffff'), emissiveIntensity: L.emissiveIntensity })
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(L.width, logoHeight), logoMaterial)
  logo.name = 'r1-brand-logo'
  logo.position.set(centre.x, L.centerY, face + gap.art)
  logo.visible = false

  const sloganTexture = canvasTexture(THREE, canvasTex, ...S.canvas, drawR1BrandSlogan)
  if (sloganTexture) owned.push(sloganTexture)
  const slogan = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.width * S.canvas[1] / S.canvas[0]),
    new THREE.MeshBasicMaterial({ map: sloganTexture, transparent: true, depthWrite: false, toneMapped: false }))
  slogan.name = 'r1-brand-slogan'
  slogan.position.set(centre.x, S.centerY, face + gap.art)
  group.add(logo, slogan)

  const ambienceParts = buildR1Ambience({ THREE, group, layout, wall, collision, canvasSurface, lowTier, clock, owned })

  const loader = textureLoader || (typeof document === 'undefined' ? null : new THREE.TextureLoader())
  // 一次请求喂两处标志：入口面用贴图，中庭形象墙把同一张图画进氛围图集。
  // 失败路径只关掉标志（图集那一格始终全透明，alphaTest 直接丢掉），不抛错（验收要求 pageerror 为 0）。
  loader?.load(R1_BRAND_LOGO_URL, texture => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
    logoMaterial.map = texture; logoMaterial.emissiveMap = texture; logoMaterial.needsUpdate = true
    logo.visible = true; owned.push(texture)
    ambienceParts.onLogoTexture(texture)
  }, undefined, () => { logo.visible = false })

  if (lowTier) {
    // 低档：不开实时聚光灯，改叠一张三团径向渐变的发光贴图。
    const glowTexture = canvasTexture(THREE, canvasTex, 1024, 614, drawR1BrandGlow)
    if (glowTexture) owned.push(glowTexture)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }))
    glow.name = 'r1-brand-glow'
    glow.position.set(centre.x, height / 2, face + gap.glow)
    group.add(glow)
  } else {
    // 高档：3 盏隐藏式聚光灯，各自打向正前方墙面，不投影、不做可见灯具或光锥。
    for (const offset of SL.offsets) {
      const light = new THREE.SpotLight(SL.color, SL.intensity, SL.distance, SL.angle, SL.penumbra, SL.decay)
      light.castShadow = false
      light.position.set(centre.x + offset, SL.y, face + SL.standoff)
      light.target.position.set(centre.x + offset, SL.targetY, face)
      group.add(light, light.target)
      lights.push(light)
    }
  }

  root.add(group)
  let disposed = false
  return {
    root: group, lights, lowTier, face, width, height,
    ambience: ambienceParts.ambience,
    updateWallScreen: ambienceParts.updateWallScreen,
    dispose() {
      if (disposed) return
      disposed = true
      built.dispose()
      ambienceParts.dispose(collision)
      group.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose() } })
      owned.forEach(texture => texture.dispose?.())
      group.removeFromParent()
    },
  }
}

// 氛围五项的几何、碰撞代理与大屏重绘；实心件进一个合批，带字的件共用一张图集。
function buildR1Ambience({ THREE, group, layout, wall, collision, canvasSurface, lowTier, clock, owned }) {
  const { emblem: E, planter: PL, plate: PT, welcome: W, screen: SC } = r1AmbienceSpec
  const centre = r1ToWorld(wall.xM, wall.yM), atriumFace = centre.z - wall.widthM / 2
  const emblemX = r1ToWorld(E.centerXM, wall.yM).x
  const batch = createSampleBatch(THREE), quads = [], proxies = [], glowPieces = []
  // 先在副本上量包围盒，再交给合批器（合批器会销毁传入的几何体）。
  const emit = (geometry, tint, position, yaw = 0, roughness = .82, metalness = 0, grain = '') => {
    const probe = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    probe.rotateY(yaw); probe.translate(...position); probe.computeBoundingBox()
    const box = probe.boundingBox.clone(); probe.dispose()
    batch.add(geometry, tint, position, yaw, roughness, metalness, grain)
    return box
  }

  // ── 1 形象墙：朝中庭一面的黑盘、铜环、暖光环、标志与标语 ──
  const radial = lowTier ? 48 : 96
  const parts = {
    disc: emit(new THREE.CircleGeometry(E.discRadius, radial), E.disc, [emblemX, E.centerY, atriumFace - E.gap.disc], Math.PI, .45, .2),
    ring: emit(new THREE.TorusGeometry(E.ringRadius, E.ringTube, lowTier ? 8 : 12, radial / 2), E.bronze, [emblemX, E.centerY, atriumFace - E.gap.ring], 0, .35, .7),
  }
  // 暖光环与大屏底边光带取图集里的暖色块：整块 UV 压到色块中心，跟着图集一起画。
  const halo = new THREE.TorusGeometry(E.haloRadius, E.haloTube, 6, radial / 2)
  halo.translate(emblemX, E.centerY, atriumFace - E.gap.halo); halo.computeBoundingBox()
  parts.halo = halo.boundingBox.clone(); glowPieces.push(paintUv(halo, atlasRect('warm')))

  // 标志与标语都是图集里的一格，转过半圈朝中庭；字序从中庭看仍然正确（像把牌子翻个面）。
  const emblemLogoHeight = E.logoWidth * R1_BRAND_LOGO_ASPECT[1] / R1_BRAND_LOGO_ASPECT[0]
  const logoCentre = [emblemX, E.centerY + E.logoRise, atriumFace - E.gap.art]
  quads.push({ width: E.logoWidth, height: emblemLogoHeight, uv: atlasRect('logo'), position: logoCentre, yaw: Math.PI })
  parts.logo = boxOf(THREE, { x: logoCentre[0], y: logoCentre[1], z: logoCentre[2] }, [E.logoWidth, emblemLogoHeight, 0])
  const sloganHeight = E.sloganWidth * atlasAspect('slogan')
  const sloganCentre = [emblemX, E.centerY - E.sloganDrop, atriumFace - E.gap.art]
  quads.push({ width: E.sloganWidth, height: sloganHeight, uv: atlasRect('slogan'), position: sloganCentre, yaw: Math.PI })
  parts.slogan = boxOf(THREE, { x: sloganCentre[0], y: sloganCentre[1], z: sloganCentre[2] }, [E.sloganWidth, sloganHeight, 0])

  // ── 1b 半圆矮花池：θ 从 π/2 到 3π/2 正好是朝中庭的那半圈，贴墙的弦落在墙面上 ──
  const planterBox = emit(new THREE.CylinderGeometry(PL.radius, PL.radius, PL.height, PL.segments, 1, false, Math.PI / 2, Math.PI),
    PL.rim, [emblemX, PL.height / 2, atriumFace], 0, .9, 0, 'stone')
  planterBox.union(emit(new THREE.CylinderGeometry(PL.radius - .1, PL.radius - .1, .04, PL.segments / 2, 1, false, Math.PI / 2, Math.PI),
    PL.soil, [emblemX, PL.height - .02, atriumFace], 0, 1))
  // 灌木复用 I6B 的叶片几何（officeLeafGeometry），不是圆球；叶端全部留在花池半径之内。
  const fract = n => n - Math.floor(n)
  const leaves = lowTier ? 3 : PL.leaves
  for (let i = 0; i < PL.shrubs; i++) {
    const theta = Math.PI / 2 + PL.arcInset + (Math.PI - 2 * PL.arcInset) * (i + .5) / PL.shrubs
    const radius = PL.innerRadius + (PL.outerRadius - PL.innerRadius) * fract(i * .618)
    const x = emblemX + Math.sin(theta) * radius, z = atriumFace + Math.cos(theta) * radius
    for (let j = 0; j < leaves; j++) {
      const leaf = officeLeafGeometry(THREE, theta + j * 2.399, PL.leafLength * (.7 + fract(i * .43 + j * .27) * .3), 2)
      leaf.scale(1, .7 + (i % 3) * .2, 1)
      planterBox.union(emit(leaf, PL.tints[(i + j) % PL.tints.length], [x, PL.height + j * .03, z], 0, .82))
    }
  }
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const planterProxy = new THREE.Mesh(new THREE.CylinderGeometry(PL.radius, PL.radius, PL.height, 24, 1, false, Math.PI / 2, Math.PI), proxyMaterial)
  planterProxy.position.set(emblemX, PL.height / 2, atriumFace)
  planterProxy.name = 'r1-brand-planter'; planterProxy.userData = { collisionProxy: true, r1Id: 'r1-brand-planter' }
  collision?.add?.(planterProxy, 'r1-brand-planter'); proxies.push(planterProxy)

  // ── 2 房间名牌 7 块：黑底铜框金字，挂在门正上方、朝走廊一侧，整块留在门扇行程之外 ──
  const doorPlan = r1DoorPlan(layout), standoff = r1PlateStandoff(layout), plates = []
  R1_ROOM_PLATES.forEach((row, index) => {
    const door = layout.r1.elements.find(item => item.id === row.doorId), leaf = doorPlan.find(item => item.doorId === row.doorId)
    if (!door || !leaf) return
    const p = r1ToWorld(door.xM, door.yM), sign = Math.sign(leaf.offset) || 1
    const plateCentre = { x: p.x, y: PT.centerY, z: p.z }
    plateCentre[leaf.normal] += sign * standoff
    const yaw = leaf.normal === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? Math.PI / 2 : -Math.PI / 2)
    const position = [plateCentre.x, plateCentre.y, plateCentre.z]
    emit(new THREE.BoxGeometry(PT.width, PT.height, PT.depth), PT.frame, position, yaw, .4, .65)
    // 牌面与铜框前表面共面，靠 polygonOffset 压住 z-fighting；名牌包围盒因此就是铜框本身。
    const facing = [Math.sin(yaw) * PT.depth / 2, 0, Math.cos(yaw) * PT.depth / 2]
    quads.push({ width: PT.width, height: PT.height, uv: atlasRect(`plate${index}`), yaw, position: position.map((value, axis) => value + facing[axis]) })
    plates.push({ id: `${row.doorId}-PLATE`, doorId: row.doorId, text: row.text, center: plateCentre, yaw,
      box: boxOf(THREE, plateCentre, leaf.vertical ? [PT.depth, PT.height, PT.width] : [PT.width, PT.height, PT.depth]) })
  })

  // ── 4 会议室大屏：黑边框 + 不透明背板 + 底边暖光带，贴北墙内侧朝会议桌 ──
  const screenWall = layout.r1.elements.find(item => item.id === SC.wallId)
  const screenX = r1ToWorld(SC.centerXM, 0).x, inner = screenWall ? r1ToWorld(screenWall.xM, screenWall.yM).z + screenWall.widthM / 2 : 0
  const bezelBox = emit(new THREE.BoxGeometry(SC.bezelWidth, SC.bezelHeight, SC.bezelDepth), SC.bezel,
    [screenX, SC.centerY, inner + SC.gap.bezel], 0, .4, .3)
  const glow = new THREE.BoxGeometry(SC.bezelWidth, SC.glowSize, SC.glowSize)
  glow.translate(screenX, SC.glowY, inner + SC.gap.glow); glow.computeBoundingBox()
  const glowBox = glow.boundingBox.clone(); glowPieces.push(glow)

  // ── 3 欢迎光临：大门外地面的铜色嵌字，高出铺装 2.5 mm 并开 polygonOffset ──
  const welcomeHeight = W.width * atlasAspect('welcome'), welcomeAt = r1ToWorld(...W.at)
  const welcomeCentre = [welcomeAt.x, W.lift, welcomeAt.z]
  quads.push({ width: W.width, height: welcomeHeight, uv: atlasRect('welcome'), position: welcomeCentre, tilt: -Math.PI / 2 })
  const welcomeBox = boxOf(THREE, { x: welcomeAt.x, y: W.lift, z: welcomeAt.z }, [W.width, 0, welcomeHeight])

  const built = batch.build(group, 'r1-ambience-surfaces')
  built.mesh.material.side = THREE.DoubleSide

  // 一张图集一个网格：7 块牌面、形象墙标志与标语、地面嵌字、暖光环与大屏光带全在里面。
  // 字面是实心的、嵌字背景是全透明的，所以用 alphaTest 切边，不进半透明排序。
  const atlas = screenSurface(THREE, canvasSurface, R1_AMBIENCE_ATLAS.width, R1_AMBIENCE_ATLAS.height)
  if (atlas?.ctx) drawR1AmbienceAtlas(atlas.ctx, R1_AMBIENCE_ATLAS.width, R1_AMBIENCE_ATLAS.height)
  if (atlas?.texture) owned.push(atlas.texture)
  const atlasMaterial = new THREE.MeshStandardMaterial({ map: atlas?.texture || null, alphaTest: .5, roughness: .45, metalness: .3,
    emissive: new THREE.Color('#ffffff'), emissiveMap: atlas?.texture || null, emissiveIntensity: .35,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const atlasMesh = new THREE.Mesh(mergeGeometries(THREE, [...quads.map(quad => atlasQuad(THREE, quad)), ...glowPieces], true), atlasMaterial)
  atlasMesh.name = 'r1-ambience-art'

  const surface = screenSurface(THREE, canvasSurface, ...SC.canvas)
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(SC.width, SC.height),
    new THREE.MeshBasicMaterial({ map: surface?.texture || null, toneMapped: false }))
  screenMesh.name = 'r1-ambience-screen'
  screenMesh.position.set(screenX, SC.centerY, inner + SC.gap.face)
  const faceBox = boxOf(THREE, screenMesh.position, [SC.width, SC.height, 0])
  group.add(atlasMesh, screenMesh)

  // 大屏只在数据变化时重绘，且两帧之间至少 5 s；读不到 /daily 就保留上一帧。
  const now = clock || (() => Date.now())
  let signature = null, lastDraw = -Infinity, redraws = 0
  const updateWallScreen = (state, daily) => {
    if (!surface?.ctx) return false
    const model = r1WallScreenModel(state, daily), next = JSON.stringify(model)
    if (next === signature) return false
    const stamp = now()
    if (stamp - lastDraw < SC.minRedrawMs) return false
    try {
      drawR1WallScreen(surface.ctx, ...SC.canvas, model)
      if (surface.texture) surface.texture.needsUpdate = true
      signature = next; lastDraw = stamp; redraws++
      return true
    } catch (error) {
      console.warn(`[r1-wall-screen] 保留上一帧：${error.message}`)
      return false
    }
  }

  // 形象墙的标志就画进图集那一格：和入口面共用同一次 logo.png 请求，不再多一个网格。
  const onLogoTexture = texture => {
    const image = texture?.image
    if (!atlas?.ctx || !image) return
    const cell = R1_AMBIENCE_ATLAS.cells.logo
    try {
      atlas.ctx.drawImage(image, 0, cell.top, R1_AMBIENCE_ATLAS.width, cell.height)
      if (atlas.texture) atlas.texture.needsUpdate = true
    } catch (error) { console.warn(`[r1-ambience] 形象墙标志未能合入图集：${error.message}`) }
  }

  return {
    onLogoTexture,
    updateWallScreen,
    ambience: {
      atriumFace, atlas: atlas?.texture || null,
      emblem: { center: { x: emblemX, y: E.centerY, z: atriumFace }, parts },
      planter: { radius: PL.radius, height: PL.height, center: { x: emblemX, y: PL.height / 2, z: atriumFace }, box: planterBox, proxy: planterProxy },
      plates,
      welcome: { center: { x: welcomeAt.x, y: W.lift, z: welcomeAt.z }, box: welcomeBox, material: atlasMaterial },
      screen: { center: { x: screenX, y: SC.centerY, z: inner }, inner, face: faceBox, bezel: bezelBox, glow: glowBox,
        box: bezelBox.clone().union(faceBox).union(glowBox), backing: built.mesh.material, texture: surface?.texture || null },
      redraws: () => redraws,
    },
    dispose(owner) {
      proxies.forEach(mesh => { owner?.remove?.(mesh); mesh.geometry.dispose() })
      proxyMaterial.dispose(); built.dispose()
    },
  }
}
