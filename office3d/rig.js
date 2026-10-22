import * as THREE from './vendor/three/three.module.js'

// 角色骨架：根（落在地面，面朝 -z）→ 髋 → 躯干（肩、颈、头）／大腿 → 小腿。
// 姿态由少量连续参数驱动，所有关节每帧由 solve() 计算，这样「坐、站、走、说话」可以任意混合。
const SHIN = 0.47
const THIGH = 0.46
const FOOT_H = 0.05
const HIP_STAND = SHIN + THIGH + FOOT_H // 站立时髋高
const HIP_SIT = 0.58

function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = shadow
  m.receiveShadow = true
  return m
}

export function createCharacter(o) {
  const { outfit = 0x202326, trim = 0xb69a64, skin = 0xe6b894, hair = 0x1b1b1f, hairStyle = 0, pants = 0x1d2026, markTexture = null, accent = 0xb69a64 } = o
  const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62 })
  const mOut = new THREE.MeshStandardMaterial({ color: outfit, roughness: 0.82 })
  const mTrim = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.35, metalness: 0.7 })
  const mPants = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.85 })
  const mHair = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.55 })
  const mShoe = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 })

  const root = new THREE.Group()
  const hips = new THREE.Group()
  root.add(hips)
  hips.add(mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), mPants))

  // 躯干
  const torso = new THREE.Group()
  torso.position.y = 0.05
  hips.add(torso)
  const chest = mesh(new THREE.CapsuleGeometry(0.17, 0.36, 6, 16), mOut)
  chest.position.y = 0.3
  chest.scale.set(1.12, 1, 0.8)
  torso.add(chest)
  // 领口与 Polo 门襟（香槟金滚边，来自 VI 手册 p13）
  const collar = mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 24), mTrim, false)
  collar.position.set(0, 0.6, -0.01)
  collar.rotation.x = Math.PI / 2.1
  torso.add(collar)
  const neck = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 12), mSkin, false)
  neck.position.y = 0.64
  torso.add(neck)
  // 胸前标志 + 工牌挂绳
  if (markTexture) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.075), new THREE.MeshBasicMaterial({ map: markTexture, transparent: true, toneMapped: false, depthWrite: false }))
    mark.position.set(0.085, 0.42, -0.134)
    mark.rotation.y = Math.PI
    torso.add(mark)
  }
  const lan = mesh(new THREE.BoxGeometry(0.012, 0.3, 0.004), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7 }), false)
  lan.position.set(0, 0.46, -0.142)
  torso.add(lan)
  const card = mesh(new THREE.BoxGeometry(0.075, 0.105, 0.006), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4 }), false)
  card.position.set(0, 0.27, -0.148)
  torso.add(card)
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.008), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }))
  stripe.position.set(0, 0.245, -0.152)
  stripe.rotation.y = Math.PI
  torso.add(stripe)

  // 头
  const head = new THREE.Group()
  head.position.y = 0.76
  torso.add(head)
  head.add(mesh(new THREE.SphereGeometry(0.115, 24, 18), mSkin, false))
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x15171c })
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), eyeM)
    e.position.set(s * 0.04, 0.01, -0.103)
    head.add(e)
  }
  const hairs = []
  const cap = mesh(new THREE.SphereGeometry(0.122, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), mHair, false)
  cap.position.y = 0.012
  cap.rotation.x = -0.18
  head.add(cap)
  hairs.push(cap)
  if (hairStyle === 1) { // 长发
    const back = mesh(new THREE.CapsuleGeometry(0.1, 0.16, 4, 12), mHair, false)
    back.position.set(0, -0.06, 0.07)
    head.add(back)
  } else if (hairStyle === 2) { // 发髻
    const bun = mesh(new THREE.SphereGeometry(0.05, 12, 10), mHair, false)
    bun.position.set(0, 0.13, 0.06)
    head.add(bun)
  }

  // 手臂：肩 → 上臂 → 肘 → 前臂 → 手
  function makeArm(side) {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.22, 0.53, 0)
    torso.add(shoulder)
    const up = mesh(new THREE.CapsuleGeometry(0.048, 0.22, 4, 10), mOut)
    up.position.y = -0.14
    shoulder.add(up)
    const cuff = mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 14), mTrim, false)
    cuff.position.y = -0.255
    cuff.rotation.x = Math.PI / 2
    shoulder.add(cuff)
    const elbow = new THREE.Group()
    elbow.position.y = -0.3
    shoulder.add(elbow)
    const fore = mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 10), mSkin)
    fore.position.y = -0.14
    elbow.add(fore)
    const hand = mesh(new THREE.SphereGeometry(0.045, 10, 8), mSkin, false)
    hand.position.set(0, -0.29, 0)
    elbow.add(hand)
    return { shoulder, elbow }
  }
  const armL = makeArm(-1)
  const armR = makeArm(1)

  // 腿：髋关节 → 大腿 → 膝 → 小腿 → 脚
  function makeLeg(side) {
    const hip = new THREE.Group()
    hip.position.set(side * 0.1, -0.05, 0)
    hips.add(hip)
    const th = mesh(new THREE.CapsuleGeometry(0.07, THIGH - 0.14, 4, 10), mPants)
    th.position.y = -THIGH / 2
    hip.add(th)
    const knee = new THREE.Group()
    knee.position.y = -THIGH
    hip.add(knee)
    const sh = mesh(new THREE.CapsuleGeometry(0.055, SHIN - 0.12, 4, 10), mPants)
    sh.position.y = -SHIN / 2
    knee.add(sh)
    const foot = mesh(new THREE.BoxGeometry(0.11, 0.06, 0.25), mShoe)
    foot.position.set(0, -SHIN - 0.01, -0.06)
    knee.add(foot)
    return { hip, knee }
  }
  const legL = makeLeg(-1)
  const legR = makeLeg(1)

  const body = { root, hips, torso, head, armL, armR, legL, legR }
  const pose = {
    sit: 1, // 1 = 坐，0 = 站
    walk: 0, // 0..1 步行幅度
    phase: 0, // 步态相位
    type: 0, // 打字强度
    talk: 0, // 说话手势强度
    carry: 0, // 双手托举（递交材料）
    yaw: 0, // 头部水平转向
    pitch: 0, // 头部俯仰
    breathe: 0,
    t: 0,
    seed: Math.random() * 10,
  }

  // 每帧求解所有关节。
  function solve(dt) {
    pose.t += dt
    const t = pose.t
    const s = pose.sit
    hips.position.y = HIP_STAND + (HIP_SIT - HIP_STAND) * s
    // 腿
    const sw = Math.sin(pose.phase) * pose.walk * 0.62
    const kneeL = Math.max(0, Math.sin(pose.phase + Math.PI / 2)) * pose.walk * 0.9
    const kneeR = Math.max(0, Math.sin(pose.phase - Math.PI / 2)) * pose.walk * 0.9
    legL.hip.rotation.x = (Math.PI / 2) * s + sw * (1 - s)
    legR.hip.rotation.x = (Math.PI / 2) * s - sw * (1 - s)
    legL.knee.rotation.x = -(Math.PI / 2) * s - kneeL * (1 - s)
    legR.knee.rotation.x = -(Math.PI / 2) * s - kneeR * (1 - s)
    // 躯干
    torso.rotation.x = 0.1 * s + pose.type * 0.07 + Math.sin(t * 1.6 + pose.seed) * 0.012 * (1 - pose.walk)
    torso.rotation.y = Math.sin(pose.phase) * pose.walk * 0.1
    // 手臂：基础自然下垂 → 步行摆臂 → 打字 → 递交 → 说话手势
    const typeJit = Math.sin(t * 14 + pose.seed)
    const typeJit2 = Math.sin(t * 14 + pose.seed + 2.1)
    let aL = 0.05 + (-sw * 0.9) * pose.walk, aR = 0.05 + sw * 0.9 * pose.walk
    let eL = 0.1 + Math.max(0, -sw) * 0.5, eR = 0.1 + Math.max(0, sw) * 0.5
    const ty = pose.type
    aL = aL * (1 - ty) + (0.72 + typeJit * 0.06) * ty
    aR = aR * (1 - ty) + (0.72 + typeJit2 * 0.06) * ty
    eL = eL * (1 - ty) + 0.95 * ty
    eR = eR * (1 - ty) + 0.95 * ty
    const ca = pose.carry
    aL = aL * (1 - ca) + 0.95 * ca
    aR = aR * (1 - ca) + 0.95 * ca
    eL = eL * (1 - ca) + 1.2 * ca
    eR = eR * (1 - ca) + 1.2 * ca
    const tk = pose.talk
    aR = aR * (1 - tk) + (0.95 + Math.sin(t * 5.2) * 0.22) * tk
    eR = eR * (1 - tk) + (1.1 + Math.sin(t * 5.2 + 1) * 0.25) * tk
    armL.shoulder.rotation.x = aL
    armR.shoulder.rotation.x = aR
    armL.shoulder.rotation.z = 0.06
    armR.shoulder.rotation.z = -0.06
    armL.elbow.rotation.x = eL
    armR.elbow.rotation.x = eR
    // 头
    head.rotation.y = pose.yaw
    head.rotation.x = pose.pitch + ty * 0.1 + Math.sin(t * 2.2 + pose.seed) * 0.02 * tk
  }
  solve(0)
  return { group: root, body, pose, solve, HIP_STAND, HIP_SIT, hairs }
}
