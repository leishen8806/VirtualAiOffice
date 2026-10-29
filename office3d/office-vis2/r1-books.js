import { r1ToWorld } from '../office-r1-layout.js'

// ── OFFICE-R1-FOOD 补充 R2：两个书架摆满书 ─────────────────────────────────────
// 董事会 2026-10-29："这面墙可以摆放一个书架（堆满互联网、AI 相关书籍）"。
// 书架壳体仍由 r1-furniture 按登记件建（bookcaseOpen，CC0 Kenney Furniture Kit）；
// 本模块只往壳体的层板上摆书，所以不新增素材，也不改登记数据。
//
// 层板位置不写死：直接量 bookcaseOpen 的几何（朝上的水平面就是层板顶面），
// 这样壳体换了素材或改了尺寸，书也跟着落在真实层板上，不会浮空或穿板。
//
// 绘制批次：所有书脊 / 平摞 / 盆栽 / 封面朝外的书体都是同一个 BoxGeometry 的实例
// （一个 InstancedMesh，1 个批次），封面的字是一张 Canvas 图集上的四边形（再 1 个批次）。
export const R1_BOOK_SHELF_IDS = Object.freeze(['08-BK-001', '08-BK-002'])

export const R1_BOOK_SPEC = Object.freeze({
  // 书脊厚 2–5 cm、书高 18–28 cm（补充卡《要做的事》第 2 条）。
  // 低档只把书脊加厚（同样的九成满 ⇒ 实例少两成），形状、斜放、平摞与填充率都不变。
  thickness: Object.freeze([.02, .05]), lowThickness: Object.freeze([.035, .05]),
  height: Object.freeze([.18, .28]), depth: .17,
  fill: .9,            // 每层约九成满
  frontGap: .012,      // 书前沿缩进层板前缘
  tiltDeg: 12,         // 斜放的书绕进深轴倾斜
  tiltEvery: 9, stackEvery: 14, plantEvery: 23,
  cover: Object.freeze({ width: .16, height: .25, thickness: .035 }),
})

// 书脊配色：十种，按实例轮换 + 抖动，保证颜色多样又逐次可复现。
export const R1_BOOK_SPINES = Object.freeze(['#8C3B30', '#2F5B7A', '#3F6B4A', '#B5812F', '#4A3C6B',
  '#A85A3C', '#2C4A52', '#7A2F49', '#5E6B33', '#36424E'])
const PLANT_COLOR = Object.freeze({ pot: '#9A6240', leaf: '#4F7A3A' })

// 封面朝外的书：书名是通用 AI / 互联网题材（补充卡给的词表），不是真实出版物的书名或封面。
export const R1_BOOK_COVERS = Object.freeze({
  '08-BK-001': Object.freeze(['人工智能导论', '机器学习实战', '深度学习原理', '大模型与智能体', '提示词工程', '数据结构与算法', '分布式系统设计']),
  '08-BK-002': Object.freeze(['互联网产品方法论', '云原生架构', '网络安全基础', 'AI Agents', 'Machine Learning', 'Neural Networks', 'The Internet Age']),
})
export const R1_BOOK_COVER_SERIES = '智序工场 · 技术丛书'
const COVER_FACE = Object.freeze(['#E8DCC4', '#DCE4E8', '#E4DCE8', '#DCE8DE', '#E8E0D4', '#D8E0EA', '#EAE2D6'])
const COVER_GRID = 4, COVER_CANVAS = Object.freeze([1024, 1024])
export const R1_BOOK_COVER_LIST = Object.freeze(R1_BOOK_SHELF_IDS.flatMap(shelfId =>
  R1_BOOK_COVERS[shelfId].map((title, index) => Object.freeze({ shelfId, title, index }))))

// 书名折行：英文按空格拆，中文按字数均分（6 字拆成 3 + 3，不拆成 5 + 1）。
export const r1BookCoverLines = title => {
  if (/[a-zA-Z]/.test(title[0])) return title.split(' ')
  const rows = Math.ceil(title.length / 5), size = Math.ceil(title.length / rows), out = []
  for (let i = 0; i < title.length; i += size) out.push(title.slice(i, i + size))
  return out
}

// 一张 4 × 4 图集装下两个书架的 14 本封面：浅色封面 + 深色书脊条 + 竖排书名 + 丛书名。
export function drawR1BookCovers(ctx, width, height) {
  const cell = { w: width / COVER_GRID, h: height / COVER_GRID }
  ctx.clearRect(0, 0, width, height)
  R1_BOOK_COVER_LIST.forEach((cover, slot) => {
    const ox = (slot % COVER_GRID) * cell.w, oy = Math.floor(slot / COVER_GRID) * cell.h
    ctx.fillStyle = COVER_FACE[slot % COVER_FACE.length]; ctx.fillRect(ox, oy, cell.w, cell.h)
    ctx.fillStyle = R1_BOOK_SPINES[slot % R1_BOOK_SPINES.length]; ctx.fillRect(ox, oy, cell.w * .14, cell.h)
    ctx.fillStyle = R1_BOOK_SPINES[slot % R1_BOOK_SPINES.length]; ctx.fillRect(ox + cell.w * .2, oy + cell.h * .12, cell.w * .62, cell.h * .012)
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    const lines = r1BookCoverLines(cover.title)
    const size = Math.round(cell.h * (lines.length > 2 ? .105 : .125))
    ctx.font = `700 ${size}px "Microsoft YaHei", "Noto Sans SC", sans-serif`
    ctx.fillStyle = '#23292E'
    lines.forEach((line, row) => ctx.fillText(line, ox + cell.w * .21, oy + cell.h * .2 + row * size * 1.2))
    ctx.font = `500 ${Math.round(cell.h * .06)}px "Microsoft YaHei", "Noto Sans SC", sans-serif`
    ctx.fillStyle = '#5A6066'
    ctx.fillText(R1_BOOK_COVER_SERIES, ox + cell.w * .21, oy + cell.h * .82)
  })
}

const coverTexture = (THREE, canvasTex) => {
  if (canvasTex) return canvasTex(...COVER_CANVAS, drawR1BookCovers)
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = COVER_CANVAS[0]; canvas.height = COVER_CANVAS[1]
  drawR1BookCovers(canvas.getContext('2d'), ...COVER_CANVAS)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
  return texture
}

// 逐次可复现的伪随机：书的厚度 / 高度 / 颜色都从这里取，不用 Math.random，
// 所以同一次构建、不同机器、不同档位的同一层书都一模一样（验收要逐层数书）。
const seeded = text => {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  let state = hash >>> 0
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
const lerp = (range, k) => range[0] + (range[1] - range[0]) * k

// 量 bookcaseOpen：朝上的水平面是层板顶，朝下的水平面是上一层的底面（也就是这一层的净高上限）。
// 返回模型自身单位（素材 0.4 × 0.88 × 0.25 m），由调用方按登记尺寸缩放。
export function r1BookcaseMetrics(THREE, model) {
  model.updateWorldMatrix(true, true)
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const up = new Map(), down = new Map(), corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  model.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld)
    const position = geometry.attributes.position, normal = geometry.attributes.normal
    for (let i = 0; i < position.count; i += 3) {
      const ny = normal ? (normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2)) / 3 : 0
      if (Math.abs(ny) < .9) continue
      for (let k = 0; k < 3; k++) corner[k].fromBufferAttribute(position, i + k)
      const y = Number(((corner[0].y + corner[1].y + corner[2].y) / 3).toFixed(4))
      const area = corner[1].clone().sub(corner[0]).cross(corner[2].clone().sub(corner[0])).length() / 2
      const table = ny > 0 ? up : down
      const row = table.get(y) || { y, area: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
      row.area += area
      for (const point of corner) {
        row.minX = Math.min(row.minX, point.x); row.maxX = Math.max(row.maxX, point.x)
        row.minZ = Math.min(row.minZ, point.z); row.maxZ = Math.max(row.maxZ, point.z)
      }
      table.set(y, row)
    }
    geometry.dispose()
  })
  // 层板顶面是面积最大的那几个朝上平面：顶盖下的四根立柱顶（面积只有层板的百分之几）要排掉。
  const planes = [...up.values()].sort((a, b) => a.y - b.y)
  const biggest = planes.reduce((max, row) => Math.max(max, row.area), 0)
  const planks = planes.filter(row => row.area >= biggest * .5)
  const ceilings = [...down.values()].map(row => row.y).sort((a, b) => a - b)
  const centre = { x: size.x / 2, z: size.z / 2 }
  const levels = planks.map(plank => {
    const ceiling = ceilings.find(y => y > plank.y + 1e-4)
    // 层板厚：顶面到自己底面的距离，书的可用宽 / 进深按它内缩，保证落在层板里而不是贴着侧板。
    const own = ceilings.filter(y => y < plank.y - 1e-4).pop()
    const thickness = own === undefined ? .03 : plank.y - own
    return {
      y: plank.y, clearHeight: ceiling === undefined ? Infinity : ceiling - plank.y, thickness,
      minX: plank.minX + thickness - centre.x, maxX: plank.maxX - thickness - centre.x,
      minZ: plank.minZ + thickness - centre.z, maxZ: plank.maxZ - thickness - centre.z,
    }
  })
  return { size, levels: Object.freeze(levels.map(Object.freeze)) }
}

const yawFor = row => -Number(row.yawDeg || 0) * Math.PI / 180

// 一层的填充：沿书架长度方向从左往右排，排到约九成满为止。
// kind 只有四种，全部是同一个单位立方体的实例：spine（立着的书，偶尔斜放）、
// stack（平放成摞）、plant（小盆栽）、cover（封面朝外的书体）。
function fillLevel({ shelfId, level, index, span, front, lowTier, covers }) {
  const random = seeded(`${shelfId}#${index}`), spec = R1_BOOK_SPEC
  const thickness = lowTier ? spec.lowThickness : spec.thickness
  const target = span * spec.fill, out = [], tilt = spec.tiltDeg * Math.PI / 180
  let used = 0, n = 0, coverSlot = 0
  const coverAt = covers.map((_, slot) => target * (slot + 1) / (covers.length + 1))
  const push = (kind, width, build) => { out.push({ kind, u: -span / 2 + used + width / 2, width, ...build(width) }); used += width; n++ }
  while (used < target) {
    const left = target - used
    if (coverSlot < covers.length && used >= coverAt[coverSlot] && left >= spec.cover.width) {
      const cover = covers[coverSlot++]
      push('cover', spec.cover.width, () => ({
        size: { x: spec.cover.width, y: spec.cover.height, z: spec.cover.thickness },
        y: level + spec.cover.height / 2, v: front - spec.cover.thickness / 2, tiltRad: 0,
        color: R1_BOOK_SPINES[R1_BOOK_COVER_LIST.findIndex(row => row.shelfId === cover.shelfId && row.title === cover.title) % R1_BOOK_SPINES.length],
        cover: cover.title,
      }))
      continue
    }
    if (n && n % spec.stackEvery === 0 && left >= .16) {
      // 平放成摞：2–4 本叠起来，占一小段长度。
      const count = 2 + Math.floor(random() * 3)
      let top = level
      for (let k = 0; k < count; k++) {
        const t = lerp(thickness, random())
        out.push({ kind: 'stack', u: -span / 2 + used + .07 + (random() - .5) * .012, width: 0,
          size: { x: .14, y: t, z: .19 }, y: top + t / 2, v: front - .19 / 2, tiltRad: 0,
          color: R1_BOOK_SPINES[(n + k) % R1_BOOK_SPINES.length] })
        top += t
      }
      used += .15; n++
      continue
    }
    if (n && n % spec.plantEvery === 0 && left >= .18) {
      const u = -span / 2 + used + .08
      out.push({ kind: 'plant', u, width: 0, size: { x: .11, y: .1, z: .11 }, y: level + .05, v: front - .11, tiltRad: 0, color: PLANT_COLOR.pot })
      out.push({ kind: 'plant', u, width: 0, size: { x: .15, y: .16, z: .15 }, y: level + .1 + .08, v: front - .11, tiltRad: 0, color: PLANT_COLOR.leaf })
      used += .17; n++
      continue
    }
    const t = lerp(thickness, random()), height = lerp(spec.height, random())
    const leaning = n % spec.tiltEvery === spec.tiltEvery - 1
    const tiltRad = leaning ? (n % (spec.tiltEvery * 2) === spec.tiltEvery - 1 ? tilt : -tilt) : 0
    const width = leaning ? t * Math.cos(tilt) + height * Math.sin(tilt) : t
    if (used + width > target && used > 0) break
    push('spine', width, () => ({
      size: { x: t, y: height, z: spec.depth },
      // 斜放的书绕进深轴倾斜，底角仍压在层板上：抬高量按旋转后的半高算，不是名义半高。
      y: level + (height / 2) * Math.cos(Math.abs(tiltRad)) + (t / 2) * Math.sin(Math.abs(tiltRad)),
      v: front - spec.depth / 2, tiltRad,
      color: R1_BOOK_SPINES[n % R1_BOOK_SPINES.length],
    }))
  }
  return { items: out, used }
}

export function buildR1Books({ THREE, root, layout, collision, quality, low = false, A, canvasTex }) {
  const empty = { shelves: [], books: 0, covers: 0, summary: () => ({ calls: 0, triangles: 0, books: 0 }), dispose() {} }
  if (layout?.r1Phase !== 'R1' || !A?.furn?.bookcaseOpen) return empty
  const lowTier = quality ? quality.tier === 'low' : low
  const rows = R1_BOOK_SHELF_IDS.map(id => layout.r1.elements.find(item => item.id === id)).filter(Boolean)
  if (!rows.length) return empty
  const group = new THREE.Group(); group.name = 'r1-books'; group.userData.dynamic = true
  const metrics = r1BookcaseMetrics(THREE, A.furn.bookcaseOpen)
  const instances = [], coverQuads = [], shelves = [], proxies = []
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  for (const row of rows) {
    const world = r1ToWorld(row.xM, row.yM), yaw = yawFor(row), base = Number(row.zM) || 0
    const scale = { x: row.lengthM / metrics.size.x, y: row.heightM / metrics.size.y, z: row.widthM / metrics.size.z }
    const cos = Math.cos(yaw), sin = Math.sin(yaw)
    // 局部 (u, v)：u 沿书架长度（登记 lengthM），v 指向书架正面（登记 facingLocal 那一侧）。
    const at = (u, v) => ({ x: world.x + cos * u + sin * v, z: world.z - sin * u + cos * v })
    // 封闭层才摆书：最上面那块板是书架顶面（上方无净高），不算一层。
    const bays = metrics.levels.filter(level => Number.isFinite(level.clearHeight))
    const covers = R1_BOOK_COVERS[row.id] || []
    const record = { id: row.id, yaw, position: { ...world, y: base }, levels: [], covers: [], books: 0 }
    bays.forEach((level, index) => {
      const span = (level.maxX - level.minX) * scale.x, front = level.maxZ * scale.z - R1_BOOK_SPEC.frontGap
      const mine = covers.filter((_, slot) => slot % bays.length === index).map(title => ({ shelfId: row.id, title }))
      const filled = fillLevel({ shelfId: row.id, level: base + level.y * scale.y, index, span, front, lowTier, covers: mine })
      let books = 0
      for (const item of filled.items) {
        const point = at(item.u, item.v)
        instances.push({ shelfId: row.id, level: index, kind: item.kind, color: item.color, size: item.size,
          position: { x: point.x, y: item.y, z: point.z }, yaw, tiltRad: item.tiltRad })
        if (item.kind === 'plant') continue
        books++
        if (item.kind !== 'cover') continue
        const face = at(item.u, item.v + item.size.z / 2 + .002)
        const slot = R1_BOOK_COVER_LIST.findIndex(entry => entry.shelfId === row.id && entry.title === item.cover)
        coverQuads.push({ shelfId: row.id, title: item.cover, slot, position: { x: face.x, y: item.y, z: face.z }, yaw })
        record.covers.push(item.cover)
      }
      record.books += books
      // minU / maxU / minV / maxV 是这一层的可用局部范围（u 沿长度、v 指向正面），验收用它逐件核对书在层板里。
      record.levels.push({ index, y: base + level.y * scale.y, span, clearHeight: level.clearHeight * scale.y,
        minU: -span / 2, maxU: span / 2, minV: level.minZ * scale.z, maxV: level.maxZ * scale.z,
        books, fill: filled.used / span })
    })
    shelves.push(record)
    // 碰撞只给董事会新增的书架：登记件 08-BK-001 的通行判定是 I3 验收过的，不在本卡范围内改。
    if (row.status !== 'BOARD_ADDED') continue
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(row.lengthM, row.heightM, row.widthM), proxyMaterial)
    proxy.position.set(world.x, base + row.heightM / 2, world.z); proxy.rotation.y = yaw
    proxy.name = `r1-books-collision-${row.id}`; proxy.visible = false
    proxy.userData = { collisionProxy: true, r1Id: row.id }
    proxy.updateWorldMatrix(true, true)
    collision?.add(proxy, row.category); proxies.push(proxy)
  }
  // 全部书件共用一个单位立方体：一个 InstancedMesh = 一个绘制批次，颜色走 instanceColor。
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .78, metalness: .02 })
  const mesh = new THREE.InstancedMesh(unit, material, instances.length)
  mesh.name = 'r1-books-batch'; mesh.castShadow = mesh.receiveShadow = true
  mesh.userData.itemIds = shelves.map(shelf => shelf.id)
  const dummy = new THREE.Object3D(), tint = new THREE.Color()
  instances.forEach((item, index) => {
    dummy.position.set(item.position.x, item.position.y, item.position.z)
    dummy.rotation.set(0, item.yaw, 0)
    // 斜放：绕书架长度方向的法线（局部 v 轴）转，所以在局部先转 z 再套 yaw。
    if (item.tiltRad) dummy.rotateZ(item.tiltRad)
    dummy.scale.set(item.size.x, item.size.y, item.size.z)
    dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); mesh.setColorAt(index, tint.set(item.color))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  group.add(mesh)
  // 封面：一张 Canvas 图集 + 一个 MeshBasicMaterial；取不到 Canvas 时只剩素色封面，不抛错。
  const coverMap = coverQuads.length ? coverTexture(THREE, canvasTex) : null
  const positions = [], normals = [], uvs = []
  const cover = R1_BOOK_SPEC.cover
  for (const quad of coverQuads) {
    const plane = new THREE.PlaneGeometry(cover.width - .012, cover.height - .012).toNonIndexed()
    plane.rotateY(quad.yaw); plane.translate(quad.position.x, quad.position.y, quad.position.z)
    positions.push(...plane.attributes.position.array); normals.push(...plane.attributes.normal.array)
    const uv = plane.attributes.uv, col = quad.slot % COVER_GRID, rowIndex = Math.floor(quad.slot / COVER_GRID)
    for (let i = 0; i < uv.count; i++) uvs.push((col + uv.getX(i)) / COVER_GRID, (COVER_GRID - 1 - rowIndex + uv.getY(i)) / COVER_GRID)
    plane.dispose()
  }
  const coverGeometry = new THREE.BufferGeometry()
  coverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  coverGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  coverGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  coverGeometry.computeBoundingBox(); coverGeometry.computeBoundingSphere()
  const coverMaterial = new THREE.MeshBasicMaterial({ map: coverMap, color: coverMap ? 0xffffff : new THREE.Color(COVER_FACE[0]), toneMapped: false, side: THREE.DoubleSide })
  const coverMesh = new THREE.Mesh(coverGeometry, coverMaterial)
  coverMesh.name = 'r1-books-covers'; coverMesh.userData.itemIds = coverQuads.map(quad => `${quad.shelfId}/${quad.title}`)
  group.add(coverMesh)
  root.add(group)
  const triangles = instances.length * 12 + coverQuads.length * 2
  let disposed = false
  return {
    root: group, mesh, coverMesh, shelves, instances, coverQuads, proxies, metrics,
    books: shelves.reduce((sum, shelf) => sum + shelf.books, 0), covers: coverQuads.length,
    summary: () => ({ calls: 2, triangles, books: shelves.reduce((sum, shelf) => sum + shelf.books, 0) }),
    dispose() {
      if (disposed) return
      disposed = true
      proxies.forEach(proxy => { collision?.remove?.(proxy); proxy.geometry.dispose() })
      proxyMaterial.dispose(); unit.dispose(); material.dispose()
      coverGeometry.dispose(); coverMaterial.dispose(); coverMap?.dispose?.()
      group.removeFromParent()
    },
  }
}
