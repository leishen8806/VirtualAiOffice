// 办公室趣味：庆祝彩纸、办公室猫「小橘」、金边节日装饰、本周之星奖杯。
// 规则：凡是跟工作有关的（彩纸、奖杯、表情）都由真实数据触发；猫和节日装饰是纯装饰，不代表任何工作。
import * as THREE from 'three'
import * as catPlay from './cat-play.js'
import { PERSON_GAP } from './pedestrian-traffic.js'

// ───────── 柬埔寨 2026 公共假日（来源：2026 年假日次令，Andersen 柬埔寨摘要 kh.andersen.com）─────────
// style：festive 彩旗+灯笼+夜间烟花；water 再加护城河龙舟；solemn 只放莲花灯、不放烟花；banner 只挂横幅
export const HOLIDAYS = [
  ['2026-01-01', '元旦', 'festive'], ['2026-01-07', '战胜种族灭绝日', 'banner'], ['2026-03-08', '国际妇女节', 'banner'],
  ['2026-04-14', '高棉新年', 'festive'], ['2026-04-15', '高棉新年', 'festive'], ['2026-04-16', '高棉新年', 'festive'],
  ['2026-05-01', '劳动节 · 佛诞节', 'banner'], ['2026-05-05', '御耕节', 'banner'], ['2026-05-14', '国王诞辰', 'festive'],
  ['2026-06-18', '太后诞辰', 'banner'], ['2026-09-24', '宪法日', 'banner'],
  ['2026-10-10', '亡人节', 'solemn'], ['2026-10-11', '亡人节', 'solemn'], ['2026-10-12', '亡人节', 'solemn'],
  ['2026-10-15', '西哈努克太皇纪念日', 'solemn'], ['2026-10-29', '国王加冕日', 'festive'], ['2026-11-09', '独立日', 'festive'],
  ['2026-11-23', '送水节', 'water'], ['2026-11-24', '送水节', 'water'], ['2026-11-25', '送水节', 'water'], ['2026-12-29', '和平日', 'banner'],
]
export function holidayInfo(dateStr) {
  const today = HOLIDAYS.find((h) => h[0] === dateStr)
  const next = HOLIDAYS.find((h) => h[0] > dateStr && (!today || h[1] !== today[1]))
  const days = next ? Math.round((Date.parse(next[0]) - Date.parse(dateStr)) / 86400000) : null
  return { today: today ? { name: today[1], style: today[2] } : null, next: next ? { name: next[1], date: next[0], days } : null }
}

export function createFun({ scene, views, boardViews, LOUNGE, furnitureCollision, layout }) {
  const { CAT_DESTINATIONS, aimCat, catDeskAnchor, catDeskTopPoint, catJumpSegmentSafe, catRoamPoints, catRoute, catTarget, classifyJump, createCatDiagBuffer, createCatPlayState, isCatGroundPoint, planHop, reactCat, toggleCatPlay, updateCatPlay } = { ...catPlay, ...catPlay.createCatNavigation(layout, furnitureCollision) }
  const root = new THREE.Group()
  root.name = 'fun'
  root.userData.dynamic = true // 不参与静态合并
  scene.add(root)
  const tmp = new THREE.Vector3()
  const ray = new THREE.Raycaster()

  // ───────── 彩纸（真实事件：任务完成 / 董事会批准）─────────
  const CONF_N = 220
  const confGeo = new THREE.PlaneGeometry(0.05, 0.08)
  const confMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false })
  const confetti = new THREE.InstancedMesh(confGeo, confMat, CONF_N * 3)
  confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  confetti.frustumCulled = false
  confetti.count = 0
  root.add(confetti)
  const PALETTE = [0xb69a64, 0xe0c88f, 0xff6b6b, 0x4ecdc4, 0xffd166, 0x8b6cff, 0x3fbf8f, 0xffffff].map((c) => new THREE.Color(c))
  let parts = []
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1)
  function burst(pos, n = CONF_N) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2
      parts.push({ p: pos.clone().add(new THREE.Vector3(0, 0.2, 0)), v: new THREE.Vector3(Math.cos(a) * sp * 0.5, 3 + Math.random() * 2.5, Math.sin(a) * sp * 0.5), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12), life: 3.2 + Math.random() * 1.2, c: PALETTE[i % PALETTE.length] })
    }
    if (parts.length > CONF_N * 3) parts = parts.slice(-CONF_N * 3)
  }
  function updateConfetti(dt) {
    parts = parts.filter((p) => (p.life -= dt) > 0)
    parts.forEach((p, i) => {
      p.v.y -= 4.5 * dt
      p.v.multiplyScalar(1 - dt * 1.4) // 空气阻力，飘着落
      p.p.addScaledVector(p.v, dt)
      if (p.p.y < 0.02) { p.p.y = 0.02; p.v.set(0, 0, 0); p.w.set(0, 0, 0) }
      p.r.addScaledVector(p.w, dt)
      q.setFromEuler(e.set(p.r.x, p.r.y, p.r.z))
      confetti.setMatrixAt(i, m4.compose(p.p, q, s1))
      confetti.setColorAt(i, p.c)
    })
    confetti.count = parts.length
    confetti.instanceMatrix.needsUpdate = true
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true
  }

  // ───────── 本周之星奖杯（真实统计，见 server 的 stats.mjs）─────────
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00, emissiveIntensity: 0.4 })
  function makeTrophy() {
    const g = new THREE.Group()
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.1, 16, 1, true), gold)
    cup.position.y = 0.13
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8), gold)
    stem.position.y = 0.055
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.09), new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.5 }))
    base.position.y = 0.012
    const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), gold)
    h1.position.set(0.075, 0.14, 0); h1.rotation.z = -Math.PI / 2
    const h2 = h1.clone(); h2.position.x = -0.075; h2.rotation.z = Math.PI / 2
    g.add(cup, stem, base, h1, h2)
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    return g
  }
  const trophies = new Map() // agentId -> group
  function deskTop(x, z) {
    ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0))
    const hit = ray.intersectObjects(scene.children, true).find((h) => chainVisible(h.object) && !h.object.userData.agentId && h.point.y < 1.3 && !isUnder(h.object, root))
    return hit ? hit.point.y : 0.75
  }
  const chainVisible = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
  const isUnder = (o, r) => { for (let p = o; p; p = p.parent) if (p === r) return true; return false }
  function setAwards(awards) {
    const want = new Map()
    for (const a of awards || []) {
      if (!want.has(a.agentId)) want.set(a.agentId, [])
      want.get(a.agentId).push(a)
    }
    for (const [id, g] of trophies) if (!want.has(id)) { g.removeFromParent(); trophies.delete(id) }
    for (const [id, list] of want) {
      const v = views.get(id)
      if (!v) continue
      v.awards = list
      if (trophies.has(id)) continue
      const g = makeTrophy()
      const x = v.home.x + 0.45, z = v.home.z - 1.0 // 桌面右侧（左边是台灯）
      g.position.set(x, deskTop(x, z), z)
      root.add(g)
      trophies.set(id, g)
    }
    for (const v of views.values()) if (!want.has(v.id)) v.awards = null
  }

  // ───────── 办公室猫「小橘」（纯装饰）─────────
  const fur = new THREE.MeshStandardMaterial({ color: 0xd98a3d, roughness: 0.9 })
  const furLight = new THREE.MeshStandardMaterial({ color: 0xf3e2c8, roughness: 0.9 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.4 })
  const cat = new THREE.Group()
  cat.userData.isCat = true
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), fur)
  body.scale.set(1, 0.85, 2.0)
  body.position.y = 0.17
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), furLight)
  belly.scale.set(1, 0.7, 1.8); belly.position.set(0, 0.145, 0.02)
  const headG = new THREE.Group()
  headG.position.set(0, 0.26, 0.2)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), fur)
  head.scale.set(1.1, 0.95, 1)
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), furLight)
  muzzle.position.set(0, -0.02, 0.06); muzzle.scale.set(1.3, 0.8, 0.8)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshStandardMaterial({ color: 0xd77a7a }))
  nose.position.set(0, -0.005, 0.088)
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), dark); eyeL.position.set(-0.03, 0.015, 0.065)
  const eyeR = eyeL.clone(); eyeR.position.x = 0.03
  const earGeo = new THREE.ConeGeometry(0.028, 0.05, 4)
  const earL = new THREE.Mesh(earGeo, fur); earL.position.set(-0.042, 0.07, 0); earL.rotation.z = 0.3
  const earR = new THREE.Mesh(earGeo, fur); earR.position.set(0.042, 0.07, 0); earR.rotation.z = -0.3
  headG.add(head, muzzle, nose, eyeL, eyeR, earL, earR)
  const legs = []
  for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.13, 8), fur)
    l.geometry.translate(0, -0.065, 0)
    l.position.set(x, 0.13, z)
    legs.push(l)
  }
  const tail = []
  let prev = cat
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group()
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016 - i * 0.0012, 0.018 - i * 0.0012, 0.05, 6), i === 6 ? furLight : fur)
    m.rotation.x = Math.PI / 2
    m.position.z = -0.025
    seg.add(m)
    seg.position.set(0, i === 0 ? 0.2 : 0, i === 0 ? -0.2 : -0.05)
    prev.add(seg)
    tail.push(seg)
    prev = seg
  }
  cat.add(body, belly, headG, ...legs)
  cat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.isCat = true } })
  root.add(cat)
  cat.position.set(2, 0, 4)
  const spawnAt = performance.now()
  const catLabel = document.createElement('div')
  catLabel.className = 'catTag'
  catLabel.textContent = '🐱 小橘'
  document.body.appendChild(catLabel)
  const play = createCatPlayState(performance.now())
  const toy = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 8), new THREE.MeshBasicMaterial({ color: 0xe7bf68, transparent: true, opacity: 0.9, depthWrite: false }))
  toy.rotation.x = -Math.PI / 2; toy.position.y = 0.035; toy.visible = false; toy.userData.dynamic = true; root.add(toy)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), new THREE.MeshBasicMaterial({ color: 0xd95f59 }))
  ball.position.y = 0.11; ball.visible = false; ball.userData.dynamic = true; root.add(ball)
  let reaction = null, ballLast = null

  const C = { mode: 'idle', path: [], goal: null, until: 0, y: 0, hop: null, purr: 0, target: null, why: '', deskHome: null, afterHop: null }
  const diag = createCatDiagBuffer(50)
  let previousPosition = null, lastHopAt = -Infinity, maxStepDist = 0
  const ROAM = catRoamPoints()
  function recordDiag(event) {
    return diag.record({ mode: C.mode, why: C.why, playMode: play.mode, sinceSpawnMs: performance.now() - spawnAt, ...event })
  }
  function goTo(p, then, why, toDeskHome = null) {
    if (C.hop) { C.afterHop = { p, then, why, toDeskHome }; return true }
    if (C.deskHome && cat.position.y > 0.05) {
      C.afterHop = { p, then, why, toDeskHome }; C.mode = 'landing'; hopTo(0, 0.45, catDeskAnchor(C.deskHome)); return true
    }
    const path = catRoute(cat.position, p, { fromDeskHome: C.deskHome, toDeskHome })
    if (!path || (!path.length && Math.hypot(cat.position.x - p.x, cat.position.z - p.z) > 0.3)) {
      C.path = []; C.goal = null; C.mode = 'idle'; C.until = performance.now() + 3000
      recordDiag({ reason: 'route_empty', target: { x: p.x, z: p.z }, from: { x: cat.position.x, y: cat.position.y, z: cat.position.z } })
      return false
    }
    C.path = path
    C.deskHome = null
    C.goal = { ...p, then }
    C.mode = 'walk'
    C.why = why
    return true
  }
  function startHop(y, dur, point, done = null) {
    const dist = point ? Math.hypot(point.x - cat.position.x, point.z - cat.position.z) : 0
    C.hop = { y0: cat.position.y, y1: y, x0: cat.position.x, z0: cat.position.z, point, t: 0, dur: Math.max(0.45, dur, dist / 2.5), done }
  }
  function hopTo(y, dur = 0.45, point = null, done = null) {
    if (!point) { startHop(y, dur, null, done); return true }
    const plan = planHop(cat.position, point, { segmentSafe: catJumpSegmentSafe })
    if (plan.mode === 'hop') { startHop(y, Math.max(dur, plan.dur), point, done); return true }
    if (y < cat.position.y) { startHop(y, Math.max(dur, plan.dur), plan.landAt, done); return true }
    if (Math.hypot(cat.position.x - plan.walkTo.x, cat.position.z - plan.walkTo.z) <= 0.12) { startHop(y, Math.max(dur, plan.dur), point, done); return true }
    return goTo(plan.walkTo, () => hopTo(y, Math.max(dur, plan.dur), point, done), C.why || '准备跳跃')
  }
  function nextPlan(ctx) {
    const now = performance.now()
    // 1) 天黑/下班：去后窗台看吴哥窟
    if (ctx.night > 0.55 || ctx.offDuty) { goTo(CAT_DESTINATIONS.rearWindow, () => { hopTo(1.02); C.mode = 'sit'; C.until = now + 120000; C.why = '在后窗边看夜景' }, '去后窗边'); return }
    // 2) 下雨：躲到休息区沙发边
      if (ctx.raining) { goTo(CAT_DESTINATIONS.lounge, () => { C.mode = 'sleep'; C.until = now + 90000; C.why = '下雨了，缩在沙发边' }, '躲雨'); return }
    const r = Math.random()
    // 3) 找一位空闲的同事，趴在他桌上睡觉（他一开始干活猫就会跳下来）
    const idle = [...views.values()].filter((v) => v.mode === 'idle' && !v.away && !v.act && !v.lounging && !(v.waits && v.waits.length))
    if (r < 0.45 && idle.length) {
      const v = idle[Math.floor(Math.random() * idle.length)]
      const top = catDeskTopPoint(v.home), anchor = catDeskAnchor(v.home)
      goTo(anchor, () => hopTo(deskTop(top.x, top.z) + 0.01, 0.45, top, () => { C.mode = 'sleep'; C.target = v; C.deskHome = v.home; C.until = now + 60000 + Math.random() * 120000; C.why = `在 ${v.name} 的桌上睡觉` }), `去找 ${v.name}`, v.home)
      return
    }
    // 4) 去休息区蹭坐着的人
    const lounging = [...views.values()].filter((v) => v.lounging && !v.act)
    if (r < 0.65 && lounging.length) {
      const v = lounging[Math.floor(Math.random() * lounging.length)]
      const p = v.char.group.position
      goTo({ x: p.x + PERSON_GAP + 0.12, z: p.z + (p.z > 10 ? -PERSON_GAP - 0.12 : PERSON_GAP + 0.12) }, () => { C.mode = 'sit'; C.until = now + 25000; C.why = `蹭 ${v.name}` }, '去休息区')
      return
    }
    // 5) 去董事会门口坐一会
    if (r < 0.75) { goTo(CAT_DESTINATIONS.board, () => { C.mode = 'sit'; C.until = now + 30000; C.why = '在董事会门口等' }, '去董事会'); return }
    // 6) 随便逛逛
    const p = ROAM[Math.floor(Math.random() * ROAM.length)]
    goTo(p, () => { C.mode = Math.random() < 0.5 ? 'sit' : 'idle'; C.until = now + 8000 + Math.random() * 15000; C.why = '溜达' }, '溜达')
  }
  const SPEED = 0.75
  let walkPh = 0
  function updateCat(dt, t, ctx) {
    const now = performance.now()
    const jump = classifyJump(previousPosition, cat.position, { dt })
    maxStepDist = Math.max(maxStepDist, jump.dist)
    if (jump.kind === 'anomaly') recordDiag({ at: Date.now(), dist: jump.dist, from: { ...previousPosition }, to: { x: cat.position.x, y: cat.position.y, z: cat.position.z }, hop: Boolean(C.hop), hopPhase: C.hop ? Math.min(1, C.hop.t / C.hop.dur) : null, afterHop: now - lastHopAt < 1000, tier: globalThis.window?.__office?.quality?.tier ?? null, frameMs: dt * 1000, dt })
    previousPosition = { x: cat.position.x, y: cat.position.y, z: cat.position.z }
    if (C.hop) {
      C.hop.t += dt
      const k = Math.min(1, C.hop.t / C.hop.dur)
      cat.position.y = C.hop.y0 + (C.hop.y1 - C.hop.y0) * k + Math.sin(k * Math.PI) * 0.35
      if (C.hop.point) { cat.position.x = C.hop.x0 + (C.hop.point.x - C.hop.x0) * k; cat.position.z = C.hop.z0 + (C.hop.point.z - C.hop.z0) * k }
      if (k >= 1) {
        const done = C.hop.done
        C.hop = null; lastHopAt = now; if (done) done()
        if (C.afterHop) { const next = C.afterHop; C.afterHop = null; goTo(next.p, next.then, next.why, next.toDeskHome) }
      }
    }
    // 趴在谁桌上，他开始干活 / 离开 / 回来要用桌子 → 跳下来走开
    if (C.mode === 'sleep' && C.target && (C.target.mode !== 'idle' || C.target.away || C.target.act)) { C.target = null; C.until = 0 }
    if (!play.enabled && (C.mode === 'sleep' || C.mode === 'sit' || C.mode === 'idle') && now > C.until && !C.hop) {
      if (cat.position.y > 0.05) { hopTo(0, 0.45, C.deskHome ? catDeskAnchor(C.deskHome) : null); return }
      nextPlan(ctx)
    }
    if (C.mode === 'walk' && !C.hop) {
      if (cat.position.y > 0.05) { hopTo(0); return }
      const p = C.path[0]
      if (!p) {
        const g = C.goal, arrived = g && Math.hypot(cat.position.x - g.x, cat.position.z - g.z) <= 0.3
        C.mode = 'idle'; C.until = now + 3000; C.goal = null
        if (arrived && g.then) g.then()
        else if (g) recordDiag({ reason: 'route_empty', target: { x: g.x, z: g.z }, from: { x: cat.position.x, y: cat.position.y, z: cat.position.z } })
        return
      }
      const dx = p.x - cat.position.x, dz = p.z - cat.position.z, d = Math.hypot(dx, dz)
      if (d < 0.05) { C.path.shift(); return }
      const st = Math.min(d, SPEED * dt)
      const nx = cat.position.x + (dx / d) * st, nz = cat.position.z + (dz / d) * st
      const people = [...views.values(), ...Object.values(boardViews)].filter(v => !v.away && v.char).map(v => v.char.group.position)
      if (people.some(v => Math.hypot(nx - v.x, nz - v.z) < PERSON_GAP)) return
      const moved = { x: cat.position.x, z: cat.position.z }
      // 中央前台后来覆盖了固定出生点，加载遮罩内用正常步长走出碰撞盒。
      if (!isCatGroundPoint(moved) && Math.hypot(nx - 2, nz - 4) <= 0.85) { moved.x = nx; moved.z = nz }
      else if (furnitureCollision) furnitureCollision.move(moved, nx - moved.x, nz - moved.z)
      else { moved.x = nx; moved.z = nz }
      cat.position.x = moved.x; cat.position.z = moved.z
      const want = Math.atan2(dx, dz)
      let dy = want - cat.rotation.y
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      cat.rotation.y += dy * Math.min(1, dt * 8)
      walkPh += st * 18
    }
    // 姿态：走路摆腿、坐着后腿收起、睡觉缩成一团
    const walking = C.mode === 'walk' && !C.hop
    const sleeping = C.mode === 'sleep' && !C.hop
    const sitting = C.mode === 'sit' && !C.hop
    legs.forEach((l, i) => { l.rotation.x = walking ? Math.sin(walkPh + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; l.visible = !sleeping })
    const breathe = 1 + Math.sin(t * (sleeping ? 2.2 : 3.5)) * 0.03
    body.scale.set(sleeping ? 1.25 : 1, (sleeping ? 0.75 : 0.85) * breathe, sleeping ? 1.6 : 2.0)
    body.position.y = sleeping ? 0.07 : sitting ? 0.15 : 0.17
    belly.visible = !sleeping
    body.rotation.x = sitting ? -0.45 : 0
    headG.position.set(sleeping ? 0.05 : 0, sleeping ? 0.09 : sitting ? 0.3 : 0.26 + (walking ? Math.abs(Math.sin(walkPh)) * 0.01 : 0), sleeping ? 0.13 : sitting ? 0.14 : 0.2)
    headG.rotation.set(sleeping ? 0.3 : 0, sleeping ? 0.5 : Math.sin(t * 0.6) * 0.4, sleeping ? 0.3 : 0)
    eyeL.scale.y = eyeR.scale.y = sleeping ? 0.15 : 1
    tail.forEach((s, i) => {
      if (i === 0) s.position.set(sleeping ? 0.08 : 0, sleeping ? 0.06 : sitting ? 0.05 : 0.2, sleeping ? -0.12 : -0.2)
      s.rotation.y = sleeping ? 0.45 : Math.sin(t * (walking ? 4 : 1.6) - i * 0.6) * (sitting ? 0.25 : 0.18)
      s.rotation.x = sleeping ? 0 : i === 0 ? (sitting ? 0.2 : -0.6) : walking ? 0.12 : 0.05
    })
    if (reaction && now < reaction.until) {
      const k = (reaction.until - now) / reaction.duration
      if (reaction.kind === 'rub') cat.rotation.z = Math.sin(k * Math.PI * 4) * 0.14
      if (reaction.kind === 'stretch') { body.scale.x *= 1.18; body.scale.z *= 1.12; headG.rotation.x = -0.2 }
      if (reaction.kind === 'meow') headG.position.y += Math.sin(k * Math.PI) * 0.06
    } else { reaction = null; cat.rotation.z *= Math.max(0, 1 - dt * 10) }
    catLabel.textContent = reaction?.kind === 'meow' ? '喵~' : '🐱 小橘'
  }

  function updatePlay(dt, now) {
    if (!play.enabled) { toy.visible = ball.visible = false; return false }
    if (C.mode === 'landing' && C.hop) return true
    const people = [...views.values(), ...Object.values(boardViews)].filter(v => !v.away && v.char).map(v => ({ x: v.char.group.position.x, z: v.char.group.position.z }))
    const r = updateCatPlay(play, { now, dt, position: cat.position, people })
    if (!r || !play.enabled) { toy.visible = ball.visible = false; return false }
    if (r.position) {
      const oldX = cat.position.x, oldZ = cat.position.z, dx = r.position.x - oldX, dz = r.position.z - oldZ, moved = { x: oldX, z: oldZ }
      if (furnitureCollision) furnitureCollision.move(moved, dx, dz)
      else { moved.x += dx; moved.z += dz }
      cat.position.x = moved.x; cat.position.z = moved.z
      if (Math.hypot(moved.x - oldX, moved.z - oldZ) > 1e-5) cat.rotation.y = Math.atan2(dx, dz)
      C.mode = r.moved ? 'walk' : r.mode === 'pounce' || r.mode === 'batting' ? 'sit' : 'idle'; C.until = now + 1000; C.path = []; C.goal = null
    }
    if (r.pounce && !C.hop) hopTo(0.12, 0.32)
    toy.visible = Boolean(play.target); if (play.target) toy.position.set(play.target.x, 0.035, play.target.z)
    ball.visible = Boolean(play.ball)
    if (play.ball) {
      if (ballLast) ball.rotation.x += Math.hypot(play.ball.point.x - ballLast.x, play.ball.point.z - ballLast.z) * 8
      if (furnitureCollision?.hit(play.ball.point.x, play.ball.point.z)) play.ball.point = { x: cat.position.x, z: cat.position.z }
      ball.position.set(play.ball.point.x, 0.11, play.ball.point.z); ballLast = { ...play.ball.point }
    } else ballLast = null
    return true
  }

  // ───────── 节日装饰 ─────────
  const deco = new THREE.Group()
  root.add(deco)
  let decoStyle = null
  const fireworks = []
  const fwGeo = new THREE.BufferGeometry()
  const FW_N = 180
  function clearDeco() { while (deco.children.length) deco.children[0].removeFromParent() }
  function bunting(z, colors) {
    const n = 34
    for (let i = 0; i < n; i++) {
      const x = -20 + (40 * i) / (n - 1)
      const sag = 0.35 * Math.sin((Math.PI * i) / (n - 1))
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 3), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.8, side: THREE.DoubleSide }))
      tri.rotation.x = Math.PI
      tri.position.set(x, 3.25 - sag, z)
      deco.add(tri)
    }
  }
  function lanterns(colors) {
    for (let i = 0; i < 12; i++) {
      const x = -19 + i * 3.4
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], emissive: colors[i % colors.length], emissiveIntensity: 0.9, roughness: 0.6 }))
      l.scale.y = 1.25
      l.position.set(x, 3.0, -12.4)
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0x333333 }))
      cord.position.set(x, 3.5, -12.4)
      deco.add(l, cord)
    }
  }
  function lotusCandles() {
    for (let i = 0; i < 9; i++) {
      const x = -2 + i * 0.5
      const lotus = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xf4c6d0, roughness: 0.7, side: THREE.DoubleSide }))
      lotus.rotation.x = Math.PI
      lotus.position.set(x, 0.05, 11.6)
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b }))
      flame.position.set(x, 0.13, 11.6)
      flame.userData.flicker = Math.random() * 6
      deco.add(lotus, flame)
    }
  }
  function boats() {
    // 吴哥窟护城河（中心 0, -340；护城河 330×290）前段，三条龙舟来回划
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group()
      const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 1.1), new THREE.MeshStandardMaterial({ color: [0xb33a3a, 0x2f5fb3, 0xd4af37][i], roughness: 0.6 }))
      const prow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 }))
      prow.rotation.z = -Math.PI / 2 - 0.5
      prow.position.set(7.6, 0.7, 0)
      b.add(hull, prow)
      for (let k = 0; k < 12; k++) {
        const r = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2b2b2b }))
        r.position.set(-5.5 + k, 0.55, 0)
        b.add(r)
      }
      b.userData.boat = { lane: -205 + i * 5, speed: 9 + i * 1.5, ph: i * 70 }
      b.position.y = -0.45
      deco.add(b)
    }
  }
  function banner(text) {
    const c = document.createElement('canvas')
    c.width = 1024; c.height = 160
    const g = c.getContext('2d')
    g.fillStyle = '#202326'; g.fillRect(0, 0, 1024, 160)
    g.strokeStyle = '#b69a64'; g.lineWidth = 8; g.strokeRect(8, 8, 1008, 144)
    g.fillStyle = '#e0c88f'; g.font = 'bold 72px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, 512, 84)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshBasicMaterial({ map: tex }))
    m.position.set(0.5, 3.7, -12.6)
    deco.add(m)
  }
  const KH = [0x032ea1, 0xe00025, 0xffffff] // 柬埔寨国旗的蓝、红、白
  let previewing = false
  function setHoliday(info, opts = {}) {
    if (previewing && !opts.preview) return // 预览中：不被每 3 秒的真实日期刷新覆盖
    const style = info && info.today ? info.today.style : null
    const key = style ? style + info.today.name : null
    if (key === decoStyle && !opts.force) return
    decoStyle = key
    clearDeco()
    if (!style) return
    banner(info.today.name + (style === 'solemn' ? '' : ' 快乐'))
    if (style === 'festive' || style === 'water') { bunting(-6, KH); bunting(0.5, [0xd4af37, 0xe00025, 0x032ea1]); bunting(7, KH); lanterns([0xe00025, 0xd4af37]) }
    if (style === 'water') boats()
    if (style === 'solemn') lotusCandles()
  }
  // 夜间烟花（festive / water 节日，天黑以后）
  function spawnFirework() {
    const spots = [[-112, 60, -118], [118, 60, -125], [0, 90, -300], [-60, 70, -180], [70, 70, -200]]
    const s = spots[Math.floor(Math.random() * spots.length)]
    const center = new THREE.Vector3(s[0] + (Math.random() - 0.5) * 30, s[1] + Math.random() * 25, s[2] + (Math.random() - 0.5) * 30)
    const pos = new Float32Array(FW_N * 3), vel = []
    for (let i = 0; i < FW_N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u)
      vel.push(new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th)).multiplyScalar(14 + Math.random() * 4))
      pos.set([center.x, center.y, center.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const col = PALETTE[Math.floor(Math.random() * PALETTE.length)]
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    pts.frustumCulled = false
    root.add(pts)
    fireworks.push({ pts, vel, center, t: 0 })
  }
  let fwNext = 0
  function updateDeco(dt, t, ctx) {
    for (const o of deco.children) {
      const b = o.userData.boat
      if (b) { const x = ((t * b.speed + b.ph) % 300) - 150; o.position.set(x, -0.45 + Math.sin(t * 3 + b.ph) * 0.08, b.lane) }
      if (o.userData.flicker !== undefined) o.scale.setScalar(0.85 + Math.sin(t * 13 + o.userData.flicker) * 0.15)
    }
    const festive = decoStyle && (decoStyle.startsWith('festive') || decoStyle.startsWith('water'))
    if (festive && ctx.night > 0.5 && t > fwNext) { spawnFirework(); fwNext = t + 1.2 + Math.random() * 2 }
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const f = fireworks[i]
      f.t += dt
      const a = f.pts.geometry.attributes.position
      for (let k = 0; k < f.vel.length; k++) {
        f.vel[k].y -= 6 * dt
        f.vel[k].multiplyScalar(1 - dt * 0.9)
        a.setXYZ(k, a.getX(k) + f.vel[k].x * dt, a.getY(k) + f.vel[k].y * dt, a.getZ(k) + f.vel[k].z * dt)
      }
      a.needsUpdate = true
      f.pts.material.opacity = Math.max(0, 1 - f.t / 2.6)
      if (f.t > 2.6) { f.pts.removeFromParent(); f.pts.geometry.dispose(); f.pts.material.dispose(); fireworks.splice(i, 1) }
    }
  }

  let trophyCheck = 0
  function fixTrophies() { // 家具是异步加载的：奖杯放下时桌子可能还没到，落在地上的隔一会重新量一次桌面高度
    const now = performance.now()
    if (now < trophyCheck) return
    trophyCheck = now + 2000
    for (const g of trophies.values()) if (g.position.y < 0.3) g.position.y = deskTop(g.position.x, g.position.z)
  }
  return {
    burst,
    celebrate(v) {
      v.char.group.getWorldPosition(tmp)
      burst(tmp.clone().setY(1.9))
      for (const o of views.values()) { // 附近的同事转头看
        if (o === v || o.away || o.act) continue
        const p = o.char.group.position
        if (Math.hypot(p.x - tmp.x, p.z - tmp.z) < 7) { o.lookAt = v; o.lookUntil = performance.now() + 6000 }
      }
    },
    setAwards,
    setHoliday,
    // 预览节日装饰（控制台：__office.fun.preview('water', '送水节')；__office.fun.preview(null) 恢复按真实日期）
    preview(style, name = '预览') { previewing = !!style; decoStyle = '__'; setHoliday(style ? { today: { name, style } } : null, { preview: true, force: true }) },
    pick(raycaster) { return raycaster.intersectObject(cat, true).length > 0 },
    catInfo: () => C.why || '溜达',
    catDiag: () => diag.list(),
    catDiagClear: () => { diag.clear(); maxStepDist = 0; previousPosition = { x: cat.position.x, y: cat.position.y, z: cat.position.z } },
    catReact() {
      const kind = reactCat(play, performance.now())
      if (!kind) return null
      reaction = { kind, until: performance.now() + (kind === 'wander' ? 2500 : 1200), duration: kind === 'wander' ? 2500 : 1200 }
      if (kind === 'wander') {
        const a = Math.random() * Math.PI * 2, target = catTarget({ x: cat.position.x + Math.sin(a) * 1.8, z: cat.position.z + Math.cos(a) * 1.8 }).point
        goTo(target, () => { C.mode = 'idle'; C.until = performance.now() + 1200 }, '跳到附近')
      } else { C.mode = 'idle'; C.until = reaction.until }
      return ({ meow: '喵了一声', rub: '蹭了一下', stretch: '伸了个懒腰', wander: '跳到附近玩' })[kind]
    },
    catToggle(on) {
      const enabled = toggleCatPlay(play, on, performance.now())
      if (enabled) { C.path = []; C.goal = null }
      if (enabled && C.deskHome && cat.position.y > 0.05) { hopTo(0, 0.45, catDeskAnchor(C.deskHome)); C.deskHome = null; C.mode = 'landing' }
      if (!enabled) {
        toy.visible = ball.visible = false
        if (C.hop) { const done = C.hop.done; C.hop.done = () => { if (done) done(); if (cat.position.y > 0.05) hopTo(0) } }
        else if (cat.position.y > 0.05) hopTo(0)
      }
      return enabled
    },
    catPlaying: () => play.enabled,
    catAim(point, withBall = false) { const ok = aimCat(play, point, performance.now(), withBall); if (ok) C.why = withBall ? '拨弄小球' : play.lookAt ? '在门外看逗猫棒' : '追逗猫棒'; return ok },
    debugCatPlan(kind, index = 0) {
      const now = performance.now(), people = [...views.values()]
      if (kind === 'desk' && people.length) {
        const v = people[index % people.length], top = catDeskTopPoint(v.home), anchor = catDeskAnchor(v.home)
        goTo(anchor, () => hopTo(deskTop(top.x, top.z) + 0.01, 0.45, top, () => { C.mode = 'sleep'; C.target = v; C.deskHome = v.home; C.until = now + 60000; C.why = `在 ${v.name} 的桌上睡觉` }), `去找 ${v.name}`, v.home)
      } else {
        const p = kind === 'lounge' ? CAT_DESTINATIONS.lounge : kind === 'board' ? CAT_DESTINATIONS.board : kind === 'window' ? CAT_DESTINATIONS.rearWindow : kind === 'plaza' ? CAT_DESTINATIONS.plaza : ROAM[index % ROAM.length]
        goTo(p, () => { C.mode = 'sit'; C.until = now + 30000; C.why = `验收：${kind}` }, `验收：${kind}`)
      }
    },
    update(dt, t, ctx, project) {
      updateConfetti(dt)
      fixTrophies()
      updatePlay(dt, performance.now())
      updateCat(dt, t, ctx)
      updateDeco(dt, t, ctx)
      tmp.copy(cat.position); tmp.y += 0.45
      project(tmp, catLabel)
    },
    debug: () => ({ cat: { ...C, play: { ...play }, path: C.path.length, pos: cat.position.toArray().map((x) => +x.toFixed(2)), maxStepDist }, parts: parts.length, deco: decoStyle, trophies: [...trophies.keys()] }),
  }
}
