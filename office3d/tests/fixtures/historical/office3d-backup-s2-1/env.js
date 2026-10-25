import * as THREE from 'three'
import { Sky } from './vendor/three/jsm/objects/Sky.js'
import { EffectComposer } from './vendor/three/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from './vendor/three/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from './vendor/three/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from './vendor/three/jsm/postprocessing/OutputPass.js'
import { buildLandmarks } from './landmarks.js'
import { ENTRANCE } from './office-layout.js'

// 室外：天空、阳光、云、雨、广场、草地、行道树、街道与远处城市。
// 时间与天气跟随柬埔寨金边（服务端每 15 分钟取一次天气）：太阳按金边当地时间与日出日落走，
// 云量变灰、下雨有雨丝、雷雨有闪电，天黑后城市亮灯、办公室开灯。全部程序生成，不依赖外部素材。

// WMO 天气代码 → 中文与图标
export function weatherText(code) {
  if (code === 0) return ['☀️', '晴']
  if (code === 1) return ['🌤️', '晴间多云']
  if (code === 2) return ['⛅', '多云']
  if (code === 3) return ['☁️', '阴']
  if (code === 45 || code === 48) return ['🌫️', '雾']
  if (code >= 51 && code <= 57) return ['🌦️', '毛毛雨']
  if (code >= 61 && code <= 67) return ['🌧️', code >= 65 ? '大雨' : code >= 63 ? '中雨' : '小雨']
  if (code >= 80 && code <= 82) return ['🌧️', '阵雨']
  if (code >= 95) return ['⛈️', '雷阵雨']
  return ['🌡️', '—']
}
const RAINY = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const hm = (s) => { if (!s) return null; const m = String(s).match(/T(\d\d):(\d\d)/); return m ? +m[1] * 60 + +m[2] : null }

export function buildEnvironment({ scene, renderer, camera, sun, hemi, rnd }) {
  // ── 天空 ──
  const sky = new Sky()
  sky.scale.setScalar(3000)
  const u = sky.material.uniforms
  u.mieCoefficient.value = 0.004
  u.mieDirectionalG.value = 0.82
  scene.add(sky)
  camera.far = 6000
  camera.updateProjectionMatrix()
  scene.background = null
  scene.fog = new THREE.Fog(0xcdd6de, 160, 1400)

  // 环境反射（随时间/天气重新生成，节流）
  const envScene = new THREE.Scene()
  const s2 = new Sky()
  s2.scale.setScalar(1000)
  s2.material.uniforms.showSunDisc.value = 0 // 反射里不要太阳圆盘，否则光滑地面会反射出一大片白光
  envScene.add(s2)
  const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0xbdb3a2 }))
  groundEnv.rotation.x = -Math.PI / 2
  groundEnv.position.y = -20
  envScene.add(groundEnv)
  const pmrem = new THREE.PMREMGenerator(renderer)
  let envRT = null
  function regenEnv() {
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = u[k].value
    s2.material.uniforms.sunPosition.value.copy(u.sunPosition.value)
    const old = envRT
    envRT = pmrem.fromScene(envScene, 0.02)
    scene.environment = envRT.texture
    if (old) old.dispose()
  }

  // 月光（夜里一点冷色的方向光，不投影）
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0)
  moon.position.set(30, 50, -20)
  scene.add(moon)

  const tex = (w, h, draw, rep) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    if (rep) t.repeat.set(rep[0], rep[1])
    t.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return t
  }
  const noise = (g, w, h, base, spread, n, size = 2) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < n; i++) {
      const v = (rnd() - 0.5) * spread
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`
      g.fillRect(rnd() * w, rnd() * h, size, size)
    }
  }
  const add = (geo, mat, x, y, z, shadow = false) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.receiveShadow = true
    m.castShadow = shadow
    scene.add(m)
    return m
  }

  // ── 地面：草地、广场、底座、台阶、街道 ──
  const grass = new THREE.MeshStandardMaterial({ map: tex(256, 256, (g, w, h) => noise(g, w, h, '#6f8f4e', 0.22, 9000), [220, 220]), roughness: 1 })
  add(new THREE.PlaneGeometry(2400, 2400), grass, 0, -0.62, 0).rotation.x = -Math.PI / 2
  const paving = new THREE.MeshStandardMaterial({
    map: tex(512, 512, (g, w, h) => {
      noise(g, w, h, '#b9b1a3', 0.12, 12000)
      g.strokeStyle = 'rgba(120,110,95,.35)'
      g.lineWidth = 2
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke() }
    }, [14, 11]),
    roughness: 0.85,
  })
  add(new THREE.PlaneGeometry(112, 88), paving, 0, -0.6, 4).rotation.x = -Math.PI / 2
  add(new THREE.BoxGeometry(45, 0.6, 27), new THREE.MeshStandardMaterial({ color: 0xcfc7b9, roughness: 0.8 }), 0, -0.345, 0, false) // 顶面 -0.045：低于金边与室内地面，避免抢深度而闪烁
  add(new THREE.BoxGeometry(45.6, 0.08, 27.6), new THREE.MeshStandardMaterial({ color: 0xb69a64, roughness: 0.35, metalness: 0.9 }), 0, -0.05, 0) // 金色收边：顶面 -0.01，高于底座、低于室内地面，只在边缘露出
  for (let i = 0; i < 3; i++) {
    const stair = add(new THREE.BoxGeometry(ENTRANCE.x1 - ENTRANCE.x0, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 0.75 }), (ENTRANCE.x0 + ENTRANCE.x1) / 2, -0.5 + i * 0.2, 14.9 - i * 0.6, false)
    stair.name = `entrance-step-${i}`
  }
  const asphalt = new THREE.MeshStandardMaterial({
    map: tex(256, 256, (g, w, h) => {
      noise(g, w, h, '#3d4045', 0.2, 6000)
      g.fillStyle = 'rgba(240,240,230,.85)'
      for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 8, 124, 36, 8)
    }, [30, 1]),
    roughness: 0.95,
  })
  const road = (w, d, x, z, rot = 0) => { const m = add(new THREE.PlaneGeometry(w, d), asphalt, x, -0.59, z); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; return m }
  road(260, 12, 0, -46)
  road(260, 12, 0, 54)
  road(220, 12, -64, 0, Math.PI / 2)
  road(220, 12, 64, 0, Math.PI / 2)
  // 路灯：天黑后亮
  const lampHeads = []
  const poleM = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 })
  const lampM = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 })
  for (const [x, z] of [[-40, -38.5], [-20, -38.5], [0, -38.5], [20, -38.5], [40, -38.5], [-40, 46.5], [-20, 46.5], [20, 46.5], [40, 46.5], [-56.5, 0], [56.5, 0], [-56.5, 24], [56.5, 24]]) {
    add(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), poleM, x, 1.9, z)
    lampHeads.push(add(new THREE.SphereGeometry(0.28, 12, 10), lampM, x, 4.5, z))
  }

  // ── 行道树、后花园、花坛 ──
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 })
  const leafMs = [0x4f8a3c, 0x5d9a44, 0x3f7a39, 0x6aa04f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }))
  // 树冠用实例化网格（每种叶色一次绘制），随风摆动只改实例矩阵；树干是静态的，会被合并
  const crowns = []
  const tree = (x, z, s = 1) => {
    const g = new THREE.Group()
    g.position.set(x, -0.6, z)
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 2.6 * s, 7), trunkM)
    t.position.y = 1.3 * s
    t.castShadow = true
    g.add(t)
    for (let k = 0; k < 3; k++) {
      const r = (1.3 + rnd() * 0.7) * s, m = (k + Math.floor(rnd() * 4)) % 4
      const px = (rnd() - 0.5) * 1.2 * s, py = (2.9 + k * 0.7 + rnd() * 0.4) * s, pz = (rnd() - 0.5) * 1.2 * s
      crowns.push({ m, r, x: x + px, y: -0.6 + py, z: z + pz, ph: rnd() * 6 })
    }
    scene.add(g)
  }
  for (let x = -50; x <= 50; x += 9) { tree(x + rnd() * 2, -38 + rnd() * 2, 1 + rnd() * 0.3); tree(x + rnd() * 2, 46 + rnd() * 2, 1 + rnd() * 0.3) }
  for (let z = -30; z <= 40; z += 9) { tree(-55 + rnd() * 2, z, 1.1); tree(55 + rnd() * 2, z, 1.1) }
  add(new THREE.PlaneGeometry(60, 18), grass, 0, -0.595, -24).rotation.x = -Math.PI / 2
  for (let i = 0; i < 14; i++) tree(-26 + i * 4 + rnd() * 2, -20 - rnd() * 10, 0.8 + rnd() * 0.5)
  const crownGeo = new THREE.IcosahedronGeometry(1, 1)
  const crownMeshes = leafMs.map((mat, mi) => {
    const list = crowns.filter((c) => c.m === mi)
    const im = new THREE.InstancedMesh(crownGeo, mat, list.length)
    im.castShadow = true
    im.frustumCulled = false
    im.userData.dynamic = true
    im.userData.list = list
    scene.add(im)
    return im
  })
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3()
  const swayCrowns = (t, sway) => {
    for (const im of crownMeshes) {
      im.userData.list.forEach((c, i) => {
        _p.set(c.x + Math.sin(t * 1.3 + c.ph) * sway, c.y, c.z + Math.cos(t * 1.1 + c.ph) * sway * 0.6)
        im.setMatrixAt(i, _m4.compose(_p, _q, _s.setScalar(c.r)))
      })
      im.instanceMatrix.needsUpdate = true
    }
  }
  swayCrowns(0, 0)
  for (const x of [-16, -9, 9, 16]) {
    add(new THREE.BoxGeometry(5, 0.5, 1.6), new THREE.MeshStandardMaterial({ color: 0xe0d9cc, roughness: 0.8 }), x, -0.35, 16.6, true)
    for (let k = 0; k < 6; k++) add(new THREE.IcosahedronGeometry(0.35 + rnd() * 0.2, 0), leafMs[k % 4], x - 2 + k * 0.8, 0.1 + rnd() * 0.15, 16.6, true)
  }

  // ── 远处城市（夜里窗户会亮） ──
  const winLit = []
  const facadeDraw = (lit) => (g, w, h) => {
    g.fillStyle = lit ? '#000' : '#9aa7b4'
    g.fillRect(0, 0, w, h)
    let i = 0
    for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 14) {
      const on = winLit[i] ?? (winLit[i] = rnd())
      i++
      if (lit) { if (on > 0.55) { g.fillStyle = on > 0.85 ? '#ffe2a8' : '#f6d38c'; g.fillRect(x, y, 9, 10) } continue }
      g.fillStyle = on > 0.9 ? '#f3e1b8' : on > 0.45 ? '#5f7488' : '#4b5d70'
      g.fillRect(x, y, 9, 10)
    }
  }
  const SHOP_COLORS = [0xf2e4c4, 0xf3d27a, 0xeaa98a, 0xc5e3cd, 0xb7d0ea, 0xf0ece4]
  const facade = tex(128, 256, facadeDraw(false))
  const facadeLit = tex(128, 256, facadeDraw(true))
  const cityMats = []
  const building = (x, z, w, d, h, ci) => {
    const rep = [Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 12))]
    const t = facade.clone(); t.repeat.set(rep[0], rep[1]); t.needsUpdate = true
    const e = facadeLit.clone(); e.repeat.set(rep[0], rep[1]); e.needsUpdate = true
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: e, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, metalness: 0.15, color: SHOP_COLORS[ci % SHOP_COLORS.length] })
    cityMats.push(m)
    const b = add(new THREE.BoxGeometry(w, h, d), m, x, h / 2 - 0.6, z)
    b.receiveShadow = false
    add(new THREE.BoxGeometry(w * 0.6, 2, d * 0.6), new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.8 }), x, h - 0.6 + 1, z)
  }
  // ── 金边街景：低矮的骑楼商铺（粉彩外墙），不再有高楼挡住远处的景点 ──
  let ci = 0
  for (let x = -66; x <= 66; x += 12) if (Math.abs(x) > 14) building(x + rnd() * 2, -62 - rnd() * 4, 10 + rnd() * 2, 10, 6 + rnd() * 4, ci++) // 正中留出缺口，看得到吴哥窟
  for (const sx of [-1, 1]) for (let z = -30; z <= 40; z += 12) building(sx * (76 + rnd() * 3), z + rnd() * 2, 10, 10 + rnd() * 2, 8 + rnd() * 8, ci++)
  for (let x = -66; x <= 66; x += 13) building(x + rnd() * 2, 70 + rnd() * 4, 11, 10, 8 + rnd() * 6, ci++)

  // ── 高棉地标（程序生成的写意造型，不是精确复刻） ──
  const sand = new THREE.MeshStandardMaterial({ color: 0xa8977a, roughness: 0.9, flatShading: true })
  const sandDark = new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.9, flatShading: true })
  const laterite = new THREE.MeshStandardMaterial({ color: 0xa9705a, roughness: 0.85, flatShading: true })
  const white = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.7 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd7a83e, roughness: 0.35, metalness: 0.75 })
  const roofY = new THREE.MeshStandardMaterial({ color: 0xd99a2b, roughness: 0.55, flatShading: true })
  const roofG = new THREE.MeshStandardMaterial({ color: 0x2f6f4f, roughness: 0.6, flatShading: true })
  const water = new THREE.MeshStandardMaterial({ color: 0x4f7f8f, roughness: 0.15, metalness: 0.2 })
  const part = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; parent.add(m); return m }
  // 莲花苞塔（吴哥式）：八边形、分层收分
  const lotusTower = (h, r, mat) => {
    const pts = [[1, 0], [1, 0.12], [0.88, 0.16], [0.95, 0.3], [0.8, 0.34], [0.86, 0.48], [0.68, 0.52], [0.72, 0.64], [0.52, 0.68], [0.55, 0.78], [0.36, 0.82], [0.36, 0.9], [0.18, 0.95], [0.04, 1]]
    return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a * r, b * h)), 8), mat)
  }
  buildLandmarks(scene, { rnd, leafMs, renderer }) // 吴哥窟（后）、独立纪念碑（左）、王宫（右）、塔仔山（左前），见 landmarks.js
  // 5) 糖棕树（柬埔寨国树）：细高树干 + 扇形叶冠，点缀在广场四周
  const palmTrunk = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 })
  const palmLeaf = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.8, side: THREE.DoubleSide, flatShading: true })
  const palm = (x, z, h = 9) => {
    const g = new THREE.Group()
    g.position.set(x, -0.6, z)
    const t = part(new THREE.CylinderGeometry(0.22, 0.32, h, 7), palmTrunk, 0, h / 2, 0, g)
    t.castShadow = true
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const leaf = part(new THREE.CircleGeometry(1.6, 7, -0.6, 1.2), palmLeaf, Math.cos(a) * 0.9, h + 0.2 + Math.sin(i * 1.7) * 0.3, Math.sin(a) * 0.9, g)
      leaf.rotation.set(-0.5 + rnd() * 0.3, -a + Math.PI / 2, 0)
      leaf.castShadow = true
    }
    scene.add(g)
    return g
  }
  for (const [x, z] of [[-28, 18], [28, 18], [-30, -16], [30, -16], [-46, 30], [46, 30], [-12, 30], [12, 30], [-44, -30], [44, -30]]) {
    const tree = palm(x + rnd(), z + rnd(), 8 + rnd() * 4)
    // 生成后再移除，保留随机数顺序，避免其他绿化和云层随之换位。
    if ((x === -28 && z === 18) || (z === 30 && [-12, 12].includes(x))) scene.remove(tree)
  }
  // 远处地平线上再撒几棵糖棕，田野感
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 110 + rnd() * 160; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 60 && Math.abs(x) < 120) continue; palm(x, z, 10 + rnd() * 5) }

  // ── 云层：一张随风飘动的大云图，透明度跟云量走 ──
  const cloudTex = tex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 90
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(255,255,255,.55)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    }
  }, [3, 3])
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0, depthWrite: false, fog: false, color: 0xffffff })
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), cloudMat)
  clouds.rotation.x = Math.PI / 2
  clouds.position.y = 260
  clouds.userData.dynamic = true
  scene.add(clouds)

  // ── 雨：一团跟着建筑走的雨丝 ──
  const RAIN_N = 7000
  const rainPos = new Float32Array(RAIN_N * 6)
  for (let i = 0; i < RAIN_N; i++) {
    const x = (rnd() - 0.5) * 120, y = rnd() * 40, z = (rnd() - 0.5) * 100
    rainPos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6)
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45 }))
  rain.visible = false
  rain.frustumCulled = false
  scene.add(rain)

  // ── 室内灯：天黑或阴雨时亮 ──
  const indoor = []
  for (const [x, z] of [[-15, -6], [-5, -6], [5, -6], [15, -6], [-15, 4], [-5, 4], [5, 4], [15, 4], [-26, -6], [-26, 5], [-37, -8], [-37, 7]]) {
    const l = new THREE.PointLight(0xffd6a0, 0, 16, 1.6)
    l.position.set(x, 3.7, z)
    scene.add(l)
    indoor.push(l)
  }

  // 星星（夜里）
  const starGeo = new THREE.BufferGeometry()
  const sp = new Float32Array(900 * 3)
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3().setFromSphericalCoords(2000, Math.acos(rnd() * 0.95), rnd() * Math.PI * 2)
    sp.set([v.x, Math.abs(v.y), v.z], i * 3)
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
  scene.add(stars)

  // ── 世界状态：金边时间 + 天气 ──
  const W = { minutes: 12 * 60, sunrise: 6 * 60, sunset: 18 * 60, cloud: 20, rain: 0, code: 1, wind: 8, got: false, gotAt: 0 }
  const cur = { day: 1, cloud: 0.2, rain: 0 } // 平滑过渡用
  let lastEnv = { elev: 999, cloud: -1 }
  let flash = 0
  function sunAngles(minutes) {
    const frac = (minutes - W.sunrise) / (W.sunset - W.sunrise)
    let elev
    if (frac >= 0 && frac <= 1) elev = 72 * Math.sin(Math.PI * frac)
    else { // 夜里：太阳在地平线下
      const toRise = frac < 0 ? -frac : 0, fromSet = frac > 1 ? frac - 1 : 0
      elev = -Math.min(28, (toRise + fromSet) * 120)
    }
    const az = 90 - 180 * Math.min(1, Math.max(0, frac)) // 东(+x) → 南(+z，镜头身后) → 西(-x)
    return { elev, az }
  }
  function setWorld(world) {
    if (!world) return
    if (world.local) { W.minutes = world.local.minutes + world.local.s / 60; W.gotAt = performance.now() }
    const w = world.weather
    if (w) {
      W.sunrise = hm(w.sunrise) ?? W.sunrise
      W.sunset = hm(w.sunset) ?? W.sunset
      W.cloud = w.cloud ?? W.cloud
      W.rain = RAINY(w.code) ? Math.max(0.3, Math.min(1, (w.rainMm || 0.5) / 4)) : 0
      W.code = w.code
      W.wind = w.windKmh ?? W.wind
    }
    W.got = true
  }

  function update(dt, t) {
    // 本地时间在两次轮询之间按真实时间往前走
    const minutes = W.minutes + (W.got ? (performance.now() - W.gotAt) / 60000 : 0)
    const { elev, az } = sunAngles(minutes)
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az))
    u.sunPosition.value.copy(dir)
    const dayTarget = smooth(-4, 10, elev)
    const k = 1 - Math.pow(0.02, dt)
    cur.day += (dayTarget - cur.day) * k
    cur.cloud += (W.cloud / 100 - cur.cloud) * k
    cur.rain += (W.rain - cur.rain) * k
    const overcast = Math.min(1, cur.cloud * 0.8 + cur.rain * 0.6)
    u.turbidity.value = 3 + overcast * 9
    u.rayleigh.value = 1.2 + overcast * 1.6 + (1 - cur.day) * 0.8
    // 阳光：高度越低越暖，云越厚越弱
    sun.position.copy(dir).multiplyScalar(60)
    sun.intensity = Math.max(0, 2.1 * cur.day * (1 - 0.7 * overcast))
    sun.color.setHex(0xffb072).lerp(new THREE.Color(0xfff1dc), smooth(2, 25, elev))
    sun.castShadow = quality !== 'low' && sun.intensity > 0.05
    moon.intensity = 0.32 * (1 - cur.day)
    if (hemi) {
      hemi.intensity = 0.12 + 0.36 * cur.day * (1 - 0.3 * overcast) + flash * 3
      hemi.color.setHex(0xdfe9ff).lerp(new THREE.Color(0x9aa5b4), overcast)
    }
    scene.environmentIntensity = 0.08 + 0.4 * cur.day * (1 - 0.4 * overcast)
    // 雾：夜里深色，阴雨更浓
    const fogDay = new THREE.Color(0xcdd6de).lerp(new THREE.Color(0x9ea6ae), overcast)
    scene.fog.color.copy(new THREE.Color(0x0e1320).lerp(fogDay, cur.day))
    scene.fog.near = 120 - cur.rain * 90
    scene.fog.far = 1400 - cur.rain * 1050 - (W.code === 45 || W.code === 48 ? 1100 : 0)
    // 云层
    cloudMat.opacity = Math.min(0.92, cur.cloud * 0.95)
    cloudMat.color.setHex(0xffffff).lerp(new THREE.Color(0x6d7480), cur.rain * 0.8).multiplyScalar(0.25 + 0.75 * cur.day)
    cloudTex.offset.x += dt * (W.wind / 3600) * 0.02
    // 雨
    rain.visible = quality !== 'low' && cur.rain > 0.05
    if (rain.visible) {
      rain.material.opacity = 0.2 + cur.rain * 0.4
      const p = rainGeo.attributes.position.array
      const fall = dt * (22 + cur.rain * 10)
      for (let i = 0; i < RAIN_N; i++) {
        const o = i * 6
        p[o + 1] -= fall; p[o + 4] -= fall
        if (p[o + 4] < -0.6) { p[o + 1] += 40; p[o + 4] += 40 }
      }
      rainGeo.attributes.position.needsUpdate = true
    }
    // 雷阵雨：偶尔打闪
    flash = Math.max(0, flash - dt * 4)
    if (quality !== 'low' && W.code >= 95 && Math.random() < dt * 0.08) flash = 1
    // 夜景：星星、城市灯、路灯、室内灯
    const night = 1 - cur.day
    stars.material.opacity = quality === 'low' ? 0 : Math.max(0, night - overcast * 0.9)
    for (const m of cityMats) m.emissiveIntensity = night * 1.1
    lampM.emissiveIntensity = smooth(0.4, 0.9, night) * 4
    const indoorOn = Math.max(smooth(0.3, 0.8, night), overcast * 0.6)
    for (const l of indoor) l.intensity = indoorOn * 18
    // 树叶随风轻轻摆
    const sway = Math.min(0.12, W.wind / 300)
    swayCrowns(t, sway)
    // 反射图按需重算（太阳高度或云量变化明显时）
    if (Math.abs(elev - lastEnv.elev) > 3 || Math.abs(cur.cloud - lastEnv.cloud) > 0.12) { regenEnv(); lastEnv = { elev, cloud: cur.cloud } }
  }

  // ── 后期：环境光遮蔽（角落、桌下更有体积）──
  const size = new THREE.Vector2()
  renderer.getSize(size)
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, rt)
  composer.addPass(new RenderPass(scene, camera))
  const gtao = new GTAOPass(scene, camera, size.x, size.y)
  gtao.blendIntensity = 0.9
  gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.0 })
  composer.addPass(gtao)
  composer.addPass(new OutputPass())
  // 档位由 app 统一选择；高档保留原环境光遮蔽管线。
  let quality = 'high'
  update(0, 0)

  return {
    get quality() { return quality },
    get night() { return 1 - cur.day },
    setQuality(q) {
      quality = ['low','medium','high'].includes(q) ? q : 'medium'
    },
    setWorld,
    update,
    render() {
      if (quality === 'high') composer.render()
      else renderer.render(scene, camera)
    },
    resize(w, h) {
      composer.setSize(w, h)
      gtao.setSize(w, h)
    },
  }
}
