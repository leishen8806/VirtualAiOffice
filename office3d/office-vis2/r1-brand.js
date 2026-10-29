import { r1ToWorld } from '../office-r1-layout.js'
import { createSampleBatch } from './batch.js'

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

export function buildR1Brand({ THREE, root, layout, quality, low = false, canvasTex, textureLoader }) {
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
  const loader = textureLoader || (typeof document === 'undefined' ? null : new THREE.TextureLoader())
  // 失败路径只关掉标志，不抛错（验收要求 pageerror 为 0）。
  loader?.load(R1_BRAND_LOGO_URL, texture => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8
    logoMaterial.map = texture; logoMaterial.emissiveMap = texture; logoMaterial.needsUpdate = true
    logo.visible = true; owned.push(texture)
  }, undefined, () => { logo.visible = false })

  const sloganTexture = canvasTexture(THREE, canvasTex, ...S.canvas, drawR1BrandSlogan)
  if (sloganTexture) owned.push(sloganTexture)
  const slogan = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.width * S.canvas[1] / S.canvas[0]),
    new THREE.MeshBasicMaterial({ map: sloganTexture, transparent: true, depthWrite: false, toneMapped: false }))
  slogan.name = 'r1-brand-slogan'
  slogan.position.set(centre.x, S.centerY, face + gap.art)
  group.add(logo, slogan)

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
    dispose() {
      if (disposed) return
      disposed = true
      built.dispose()
      group.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose() } })
      owned.forEach(texture => texture.dispose?.())
      group.removeFromParent()
    },
  }
}
