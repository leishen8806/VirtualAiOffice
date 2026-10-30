import * as THREE from 'three'
import { FBXLoader } from './vendor/three/jsm/loaders/FBXLoader.js'
import * as SkeletonUtils from './vendor/three/jsm/utils/SkeletonUtils.js'
import { createGarmentMotion } from './garment-motion.js'

// 写实人物：Microsoft Rocketbox（MIT），日常/商务便装、不同脸型与肤色。
// 贴图已在隔离区从 2048 TGA 转为 1024 JPG/PNG；动画是同一套 Bip01 骨架的坐姿、站姿、说话、走路。
const BASE = './assets/models/people/'
export const AVATARS = {
  male: ['Male_Adult_01', 'Male_Adult_02', 'Male_Adult_03', 'Male_Adult_04', 'Male_Adult_05', 'Male_Adult_06', 'Male_Adult_07', 'Male_Adult_08', 'Male_Adult_09', 'Male_Adult_10', 'Male_Adult_11', 'Male_Adult_12'],
  female: ['Female_Adult_01', 'Female_Adult_02', 'Female_Adult_03', 'Female_Adult_04', 'Female_Adult_05', 'Female_Adult_06', 'Female_Adult_07', 'Female_Adult_08', 'Female_Adult_09', 'Female_Adult_10'],
}
const CLIPS = {
  sitIdle: 'sit_table_idle_neutral_01', sitTalk: 'sit_table_gestic_thoughtful', stand: 'idle_neutral_01', standTalk: 'gestic_talk_neutral_01', walk: 'walk_neutral_01',
}
// 日常小动作（按需后台加载，不挡首屏）：坐着发呆时偶尔看看四周、挠头、摸脸、打哈欠、伸懒腰；休息区坐沙发；站着时喝水、看手机
const EXTRA = {
  sitFlavor: ['sit_table_idle_look_around', 'sit_table_idle_scratch_head', 'sit_table_idle_touch_face', 'sit_table_idle_yawn', 'sit_table_breathe_01', 'sit_table_idle_stretch_arms'],
  lounge: ['sit_chair_idle_relaxed_01', 'sit_chair_idle_neutral_01'],
  standFlavor: ['idle_look_around_01', 'idle_stretch_arms_01', 'drink_idle', 'cell_phone_textmessage'],
}
const HEIGHT = { male: 1.78, female: 1.66 }
const BLANK = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/png') })()
// 22 位 agent 按工位顺序分配（男女穿插），每人一张不同的脸
export const CAST = ['Male_Adult_01', 'Female_Adult_01', 'Male_Adult_02', 'Male_Adult_03', 'Female_Adult_02', 'Male_Adult_04', 'Female_Adult_03', 'Male_Adult_05', 'Female_Adult_04', 'Male_Adult_06', 'Female_Adult_05', 'Male_Adult_07', 'Male_Adult_08', 'Female_Adult_06', 'Male_Adult_09', 'Female_Adult_07', 'Male_Adult_10', 'Female_Adult_08', 'Male_Adult_11', 'Female_Adult_09', 'Male_Adult_12', 'Female_Adult_10']
const STRIDE = 1.21 // 走路动画一个循环走 1.21 米（实测根骨位移），用来让脚步与移动速度对上
// Female_Adult_10 的宽袍下摆没有布料模拟；避免大幅抬臂动作把衣服拉穿。
const LOOSE_GARMENT = /Female_Adult_10$/

function makeLoader(folder) {
  const m = new THREE.LoadingManager()
  // FBX 里写的是原始 .tga 路径；改指向转换后的 JPG / PNG（透明贴图）
  m.setURLModifier((url) => {
    const name = decodeURIComponent(url.split(/[\\/]/).pop())
    if (/_(normal|specular)\.tga$/i.test(name)) return BLANK // 只下载了颜色贴图；法线/高光图不加载
    if (/\.tga$/i.test(name)) return BASE + folder + '/' + name.replace(/\.tga$/i, /opacity/i.test(name) ? '.png' : '.jpg')
    return url
  })
  return new FBXLoader(m)
}

// FBX 带来的 Phong 材质换成 PBR，透明贴图（头发、睫毛）用 alphaTest，避免排序闪烁
function fixMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
    if (o.isSkinnedMesh) o.normalizeSkinWeights()
    const conv = (m) => {
      const map = m.map || null
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4 }
      const cut = /opacity/i.test(m.name || '') || /opacity/i.test(map?.image?.src || map?.name || '')
      const n = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: cut ? 0.6 : 0.72, metalness: 0, name: m.name })
      if (cut) { n.transparent = false; n.alphaTest = 0.45; n.side = THREE.DoubleSide }
      return n
    }
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material)
  })
}

// 带表情的模型每人约 87 个全身大小的表情形变（位置 + 法线），22 人合计 1 GB 以上，是卡顿和显卡掉线的主因。
// 页面只用到眨眼、张嘴、几个口型和微笑（见 createPerson 里的 MI），其余全部丢掉；法线形变也丢掉（眨眼张嘴看不出差别）。
const KEEP_MORPH = /(EyeBlinkLeft|EyeBlinkRight|AK_25_JawOpen|VI_10_aa|VI_13_O|VI_11_E|MouthSmileLeft|MouthSmileRight|MouthFrownLeft|MouthFrownRight|BrowDownLeft|BrowDownRight|BrowInnerUp)$/
function pruneMorphs(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.morphTargetDictionary) return
    const g = o.geometry
    const pos = g.morphAttributes.position || []
    const keep = Object.entries(o.morphTargetDictionary).filter(([n]) => KEEP_MORPH.test(n)).sort((a, b) => a[1] - b[1])
    if (!keep.length) {
      g.morphAttributes = {}
      o.morphTargetDictionary = undefined
      o.morphTargetInfluences = undefined
      return
    }
    g.morphAttributes = { position: keep.map(([, i]) => pos[i]) }
    o.morphTargetDictionary = Object.fromEntries(keep.map(([n], j) => [n, j]))
    o.morphTargetInfluences = keep.map(() => 0)
  })
}

const cache = new Map()
export async function loadPeople(onProgress, extraAvatars = []) {
  const out = { avatars: {}, clips: { male: {}, female: {} } }
  const all = [...AVATARS.male.map((a) => ['male', a]), ...AVATARS.female.map((a) => ['female', a]), ...extraAvatars.map(a => [/Female_/.test(a) ? 'female' : 'male', a])]
  let done = 0
  const total = all.length + Object.keys(CLIPS).length * 2
  const tick = () => onProgress && onProgress(++done / total)
  await Promise.all(all.map(async ([g, name]) => {
    // 优先用带表情的版本（会眨眼、说话时嘴动）；没有就用普通版
    let obj
    try { obj = await makeLoader(name).loadAsync(`${BASE}${name}/${name}_facial.fbx`) } catch { obj = await makeLoader(name).loadAsync(`${BASE}${name}/${name}.fbx`) }
    // 每个 FBX 都自带一盏强度 1 的环境光：22 个人叠起来会把整个场景照成一片白，全部去掉
    const lights = []
    obj.traverse((o) => { if (o.isLight) lights.push(o) })
    lights.forEach((l) => l.parent && l.parent.remove(l))
    fixMaterials(obj)
    pruneMorphs(obj)
    const box = new THREE.Box3().setFromObject(obj)
    const h = box.max.y - box.min.y
    out.avatars[name] = { obj, gender: g, scale: HEIGHT[g] / h }
    tick()
  }))
  for (const g of ['male', 'female']) {
    await Promise.all(Object.entries(CLIPS).map(async ([k, file]) => {
      const f = `${g === 'male' ? 'm' : 'f'}_${file}`
      const a = await new FBXLoader().loadAsync(`${BASE}anim/${f}.fbx`)
      const clip = a.animations[0]
      // 导出辅助节点不在人物模型中，剔除其无效轨道，避免 PropertyBinding 警告。
      // 只保留旋转与根骨（Bip01）的位移：不同人骨长不同，其它位移轨道会把人拉变形
      clip.tracks = clip.tracks.filter((t) => (t.name.endsWith('.quaternion') && !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name)) || (t.name.endsWith('.position') && /^Bip01\.position$/.test(t.name)))
      if (k === 'walk') flattenRoot(clip) // 走路动作里根骨还残留水平位移：每个循环会往前滑一段再跳回，看起来像「同一段路走了几遍」
      clip.name = k
      out.clips[g][k] = clip
      tick()
    }))
  }
  out.extras = { male: {}, female: {} }
  return out
}

// 首屏之后再慢慢加载日常小动作；加载到一个就能用一个
export async function loadExtras(P) {
  for (const g of ['male', 'female']) {
    for (const [kind, list] of Object.entries(EXTRA)) {
      for (const file of list) {
        // 资源包仅提供女性坐姿伸懒腰，跳过不存在的男性版本。
        if (g === 'male' && file === 'sit_table_idle_stretch_arms') continue
        const f = `${g === 'male' ? 'm' : 'f'}_${file}`
        try {
          const a = await new FBXLoader().loadAsync(`${BASE}anim/${f}.fbx`)
          const clip = a.animations[0]
          clip.tracks = clip.tracks.filter((t) => (t.name.endsWith('.quaternion') && !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name)) || (t.name.endsWith('.position') && /^Bip01\.position$/.test(t.name)))
          clip.name = f
          ;(P.extras[g][kind] = P.extras[g][kind] || []).push(clip)
        } catch { /* 这个性别没有这个动作（例如男版伸懒腰），跳过 */ }
      }
    }
  }
}

// 把根骨（Bip01）的水平位移固定为第一帧，只保留上下起伏；移动交给场景里的走位
function flattenRoot(clip) {
  const t = clip.tracks.find((x) => x.name === 'Bip01.position')
  if (!t) return
  const v = t.values
  const x0 = v[0], z0 = v[2]
  for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0 }
}

function findBone(root, re) {
  let f = null
  root.traverse((o) => { if (!f && (o.isBone || o.type === 'Bone' || o.isObject3D) && re.test(o.name)) f = o })
  return f
}

const used = new Set()
// 对外接口与旧角色一致（group / body.head / pose / solve），director 与 app 不用改
export function createPerson(P, name) {
  const src = P.avatars[name]
  const model = used.has(name) ? SkeletonUtils.clone(src.obj) : src.obj
  used.add(name)
  if (model !== src.obj) {
    // 复用人物时不复制上一实例挂在手上的道具。
    const inherited = model.getObjectByName('office-hand-props')
    if (inherited) inherited.removeFromParent()
    fixMaterials(model)
  }
  const root = new THREE.Group()
  const holder = new THREE.Group()
  holder.scale.setScalar(src.scale)
  holder.rotation.y = Math.PI // 模型面朝 +z，场景约定面朝 -z
  holder.add(model)
  root.add(holder)
  const garment = LOOSE_GARMENT.test(name) ? createGarmentMotion(model, root, src.scale) : null
  const head = findBone(model, /Bip01_Head$/) || findBone(model, /Head/)
  const hand = findBone(model, /Bip01_R_Hand$/)
  const mixer = new THREE.AnimationMixer(model)
  const clips = P.clips[src.gender]
  const actions = {}
  for (const [k, c] of Object.entries(clips)) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopRepeat, Infinity); actions[k] = a }
  // 文件夹（递交材料时拿在手里）
  const folder = new THREE.Group()
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 30), new THREE.MeshStandardMaterial({ color: 0xf4f1eb, roughness: 0.7 }))
  const edge = new THREE.Mesh(new THREE.BoxGeometry(22.5, 0.4, 2), new THREE.MeshStandardMaterial({ color: 0xb69a64, roughness: 0.35, metalness: 0.9 }))
  edge.position.set(0, 0.8, -14)
  folder.add(sheet, edge)
  folder.visible = false
  const handProps = new THREE.Group()
  handProps.name = 'office-hand-props'
  const cup = new THREE.Group()
  const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.2, 10, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8ddd0, roughness: 0.55, side: THREE.DoubleSide }))
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(3.8, 20), new THREE.MeshStandardMaterial({ color: 0x493021, roughness: 0.8 }))
  coffee.rotation.x = -Math.PI / 2
  coffee.position.y = 4
  const cupBase = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), cupBody.material)
  cupBase.rotation.x = Math.PI / 2
  cupBase.position.y = -5
  cup.add(cupBody, coffee, cupBase)
  cup.position.set(10, 4, 0)
  cup.rotation.x = Math.PI / 2
  const phone = new THREE.Group()
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(7, 14, 0.9), new THREE.MeshStandardMaterial({ color: 0x20252d, roughness: 0.4 }))
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6, 11.5), new THREE.MeshStandardMaterial({ color: 0x9bc7d7, emissive: 0x203c48, roughness: 0.45 }))
  screen.position.z = 0.46
  phone.add(phoneBody, screen)
  phone.position.set(10, 3, 0)
  phone.rotation.set(-Math.PI / 2, 0, -Math.PI / 2)
  cup.visible = phone.visible = false
  handProps.add(folder, cup, phone)
  if (hand) hand.add(handProps)

  // 表情：找到带 blendShape 的网格与几个关键表情的序号
  const faces = []
  model.traverse((o) => { if (o.isMesh && o.morphTargetDictionary) faces.push(o) })
  const morph = (re) => faces.map((m) => { const k = Object.keys(m.morphTargetDictionary).find((n) => re.test(n)); return k === undefined ? -1 : m.morphTargetDictionary[k] })
  const MI = {
    blinkL: morph(/EyeBlinkLeft$/), blinkR: morph(/EyeBlinkRight$/), jaw: morph(/AK_25_JawOpen$/),
    aa: morph(/VI_10_aa$/), O: morph(/VI_13_O$/), E: morph(/VI_11_E$/), smileL: morph(/MouthSmileLeft$/), smileR: morph(/MouthSmileRight$/),
    frownL: morph(/MouthFrownLeft$/), frownR: morph(/MouthFrownRight$/), browL: morph(/BrowDownLeft$/), browR: morph(/BrowDownRight$/), browIn: morph(/BrowInnerUp$/),
  }
  const setM = (key, v) => faces.forEach((m, i) => { const ix = MI[key][i]; if (ix >= 0) m.morphTargetInfluences[ix] = v })
  let blinkT = 1 + Math.random() * 4, blinkPh = -1, mouthT = 0

  const pose = { sit: 1, walk: 0, phase: 0, type: 0, talk: 0, carry: 0, yaw: 0, pitch: 0, t: 0, seed: Math.random() * 10, lounge: 0 }
  const extraActs = new Map()
  const extraAction = (clip, once) => {
    let a = extraActs.get(clip)
    if (!a) { a = mixer.clipAction(clip); extraActs.set(clip, a) }
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
    a.clampWhenFinished = false
    return a
  }
  let flavor = null, flavorEnd = 0, nextFlavor = 8 + Math.random() * 25, folderReadyAt = 0
  let cur = null, lastPhase = 0
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), qd = new THREE.Quaternion()
  const UP = new THREE.Vector3(0, 1, 0)
  const X = P.extras[src.gender]
  const looseGarment = LOOSE_GARMENT.test(name)
  const pick = () => {
    if (pose.r1Motion && X.r1Motions?.[pose.r1Motion]) return `r1:${pose.r1Motion}`
    if (pose.walk > 0.5) return 'walk'
    if (pose.sit > 0.5) {
      if (pose.lounge > 0.5 && X.lounge && X.lounge.length) return 'lounge'
      return pose.talk > 0.5 && pose.carry <= 0.5 ? 'sitTalk' : 'sitIdle'
    }
    return pose.talk > 0.5 && pose.carry <= 0.5 ? 'standTalk' : 'stand'
  }
  const loungeClip = () => X.lounge[Math.floor(pose.seed * 7) % X.lounge.length]
  const actionFor = (k) => (k?.startsWith('r1:') ? extraAction(X.r1Motions[k.slice(3)], false) : k === 'lounge' ? extraAction(loungeClip(), false) : actions[k])
  function solve(dt) {
    pose.t += dt
    const want = pick()
    const curAct = flavor || (cur && actionFor(cur))
    if (pose.carry > 0.5 && (flavor || cur === 'sitTalk' || cur === 'standTalk')) folderReadyAt = pose.t + 0.45
    if (want !== cur && actionFor(want)) {
      const next = actionFor(want)
      next.reset()
      next.time = Math.random() * next.getClip().duration // 每个人的动作错开，不会整齐划一
      next.play()
      if (curAct) next.crossFadeFrom(curAct, 0.35, false)
      cur = want
      flavor = null
    }
    // 日常小动作：坐着/站着没事时，隔一阵做一个（干活时少做一些）
    nextFlavor -= dt * (pose.type > 0.5 ? 0.4 : 1)
    const rawPool = cur === 'sitIdle' ? X.sitFlavor : cur === 'stand' ? X.standFlavor : null
    // 这件宽袍没有额外布料骨骼，伸懒腰会把肩部蒙皮拉穿；保留低幅动作。
    const pool = looseGarment && rawPool ? rawPool.filter((c) => !/stretch_arms/.test(c.name)) : rawPool
    if (!flavor && nextFlavor <= 0 && pool && pool.length && pose.talk < 0.3 && pose.carry <= 0.5) {
      // 心情影响小动作：皱眉时多挠头摸脸，累了多伸懒腰打哈欠（心情来自真实数据，见 app.js）
      const pref = pose.mood === 'frown' ? /scratch_head|touch_face/ : pose.mood === 'tired' ? /stretch|yawn|drink/ : null
      const liked = pref ? pool.filter((c) => pref.test(c.name)) : []
      const clip = liked.length && Math.random() < 0.7 ? liked[Math.floor(Math.random() * liked.length)] : pool[Math.floor(Math.random() * pool.length)]
      const a = extraAction(clip, true)
      a.reset().play()
      a.crossFadeFrom(actionFor(cur), 0.4, false)
      flavor = a
      flavorEnd = pose.t + clip.duration - 0.45
    }
    if (flavor && (pose.t >= flavorEnd || pose.carry > 0.5)) {
      const back = actionFor(cur)
      back.reset().play()
      back.crossFadeFrom(flavor, 0.45, false)
      flavor = null
      nextFlavor = 18 + Math.random() * 40
    }
    if (cur === 'walk' && dt > 0) {
      const v = Math.max(0, (pose.phase - lastPhase) / 4.6 / dt)
      // 到达路点后冻结最后一步，避免人物已经停下但双脚仍低速原地滑动。
      actions.walk.timeScale = v < 0.05 ? 0 : Math.min(2.2, Math.max(0.3, (v * actions.walk.getClip().duration) / STRIDE))
    }
    lastPhase = pose.phase
    mixer.update(dt)
    if (garment) garment.update(dt)
    if (head && Math.abs(pose.yaw) > 0.001) {
      model.updateMatrixWorld(true)
      head.parent.getWorldQuaternion(qp)
      head.getWorldQuaternion(q)
      qd.setFromAxisAngle(UP, Math.max(-1, Math.min(1, pose.yaw)) * 0.7)
      q.premultiply(qd)
      head.quaternion.copy(qp.invert().multiply(q))
    }
    folder.visible = pose.carry > 0.5 && pose.t >= folderReadyAt
    // 淡出期间仍跟随手掌，离开该动作后收起；文件夹优先占用手部。
    cup.visible = phone.visible = false
    if (pose.carry <= 0.5) for (const [clip, a] of extraActs) {
      if (!a.isRunning() || a.getEffectiveWeight() <= 0.05) continue
      if (/drink_idle$/.test(clip.name)) cup.visible = true
      if (/cell_phone_textmessage$/.test(clip.name)) phone.visible = true
    }
    // 眨眼：2~6 秒一次；说话：嘴巴随气泡开合；平时带一点点笑意
    if (faces.length) {
      blinkT -= dt
      if (blinkT <= 0 && blinkPh < 0) { blinkPh = 0; blinkT = 2 + Math.random() * 4 }
      let b = 0
      if (blinkPh >= 0) { blinkPh += dt; b = blinkPh < 0.07 ? blinkPh / 0.07 : Math.max(0, 1 - (blinkPh - 0.07) / 0.09); if (blinkPh > 0.16) blinkPh = -1 }
      setM('blinkL', b); setM('blinkR', b)
      if (pose.talk > 0.4) {
        mouthT += dt * 9
        const o = Math.max(0, Math.sin(mouthT) * 0.5 + Math.sin(mouthT * 2.3) * 0.3)
        setM('jaw', o * 0.35); setM('aa', o * 0.6); setM('O', Math.max(0, Math.sin(mouthT * 0.7)) * 0.3); setM('E', Math.max(0, Math.cos(mouthT * 1.3)) * 0.25)
      } else { setM('jaw', 0); setM('aa', 0); setM('O', 0); setM('E', 0) }
      const smile = pose.mood === 'frown' ? 0 : pose.mood === 'happy' ? 0.55 : pose.lounge > 0.5 ? 0.3 : 0.12
      setM('smileL', smile); setM('smileR', smile)
      const fr = pose.mood === 'frown' ? 0.5 : 0
      setM('frownL', fr); setM('frownR', fr); setM('browL', fr * 0.9); setM('browR', fr * 0.9)
      setM('browIn', pose.mood === 'tired' ? 0.35 : 0)
    }
  }
  solve(0)
  return { group: root, body: { head }, pose, solve, labelDY: 0.36, ringY: src.gender === 'male' ? 2.0 : 1.88, isModel: true, avatar: name, cloneForTest: () => createPerson(P, name), parts: { folder, cup, phone, model, holder, garment } }
}

// Only the R1 caller opts in; existing animation pools and source clips stay intact.
export const R1_SEATED_EXTRAS = Object.freeze(['sit_table_idle_neutral_02', 'sit_table_idle_relaxed_01', 'sit_table_idle_waiting_01', 'sit_table_idle_nervous_01', 'sit_table_gestic_shrug_01', 'sit_table_idle_touch_hair', 'sit_table_idle_roll_head'])
export async function loadR1Extras(P) {
  await Promise.all(['male', 'female'].flatMap(g => R1_SEATED_EXTRAS.filter(name => /idle_(neutral_02|relaxed_01|waiting_01|nervous_01)$/.test(name) && !(g === 'female' && name === 'sit_table_idle_nervous_01')).map(async name => {
    const file = `${g === 'male' ? 'm' : 'f'}_${name}`
    const source = await new FBXLoader().loadAsync(`${BASE}anim/${file}.fbx`), clip = source.animations[0]
    clip.tracks = clip.tracks.filter(t => (t.name.endsWith('.quaternion') && !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name)) || t.name === 'Bip01.position')
    clip.name = file
    ;(P.extras[g].sitFlavor ||= []).push(clip)
  })))
}


export async function loadR1MovementExtras(P) {
  const names = ['cheer_01', 'cheer_03', 'claphands_01', 'gestic_talk_excited_01', 'gestic_talk_relaxed_01']
  await Promise.all(['male', 'female'].flatMap(g => names.map(async name => {
    const file = `${g === 'male' ? 'm' : 'f'}_${name}`
    const source = await new FBXLoader().loadAsync(`${BASE}anim/${file}.fbx`), clip = source.animations[0]
    clip.tracks = clip.tracks.filter(t => (t.name.endsWith('.quaternion') && !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name)) || t.name === 'Bip01.position')
    clip.name = file
    ;(P.extras[g].r1Motions ||= {})[name] = clip
  })))
  await Promise.all(['male', 'female'].flatMap(g => EXTRA.lounge.map(async name => {
    const file = `${g === 'male' ? 'm' : 'f'}_${name}`, source = await new FBXLoader().loadAsync(`${BASE}anim/${file}.fbx`), clip = source.animations[0]
    clip.tracks = clip.tracks.filter(t => (t.name.endsWith('.quaternion') && !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name)) || t.name === 'Bip01.position')
    clip.name = file; (P.extras[g].lounge ||= []).push(clip)
  })))
}

const R1_POOL_WARNED = new Set()
export function r1SeatedAssets(P, avatar, profile, personName) {
  const gender = avatar.startsWith('Female_') ? 'female' : 'male'
  const clips = new Map([['neutral_01', P.clips[gender].sitIdle], ...(P.extras[gender].sitFlavor || []).map(clip => [clip.name.replace(/^[mf]_sit_table_idle_/, ''), clip])])
  const names = [...new Set(profile?.motions || [])]
  const neutral = names.find(name => /^neutral_0[12]$/.test(name))
  if (names.length < 2 || !neutral || names.some(name => !/^(neutral_01|neutral_02|relaxed_01|waiting_01|nervous_01)$/.test(name) || !clips.has(name))) {
    if (!R1_POOL_WARNED.has(personName)) { console.warn(`R1 ${personName}：坐姿动作池不足或未就绪，保留卡通占位`); R1_POOL_WARNED.add(personName) }
    return null
  }
  P.extras[gender].r1Motions ||= {}
  P.extras[gender].lounge ||= []
  // Separate actions avoid cross-fading an action into itself when speech starts; source tracks stay intact.
  return { ...P, clips: { ...P.clips, [gender]: { ...P.clips[gender], sitIdle: clips.get(neutral), sitTalk: clips.get(neutral).clone() } }, extras: { ...P.extras, [gender]: { ...P.extras[gender], sitFlavor: names.filter(name => name !== neutral).map(name => clips.get(name)) } } }
}

export const R1_ARM_LIMITS = Object.freeze({ upperArm: 20, forearm: 30, wrist: 15 })
export function fitR1SeatedPerson(ch, { home, desk, chair, handY = .82 }) {
  if (!Number.isFinite(handY) || handY < .75 || handY > .85) throw new Error('R1 hand target outside approved range')
  const model = ch.parts.model, pelvis = [], arms = [], skinning = new Map()
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return
    const rows = new Map(), basis = new THREE.Matrix4(), cache = { rows, basis, bind: new THREE.Matrix4(), position: null, version: -1, changed: true }
    skinning.set(mesh, cache)
    const { skinIndex, skinWeight, position } = mesh.geometry.attributes
    for (let i = 0; i < position.count; i++) {
      let weight = 0
      for (let j = 0; j < 4; j++) if (mesh.skeleton.bones[skinIndex.getComponent(i, j)]?.name === 'Bip01_Pelvis') weight += skinWeight.getComponent(i, j)
      if (weight >= .5) {
        const influences = []
        for (let j = 0; j < 4; j++) {
          const w = skinWeight.getComponent(i, j), index = skinIndex.getComponent(i, j)
          if (!w) continue
          if (!rows.has(index)) rows.set(index, new THREE.Matrix4())
          influences.push([w, rows.get(index).elements])
        }
        const dynamicMorph = (mesh.geometry.morphAttributes.position || []).some(p => [0, 1, 2].some(k => p.getComponent(i, k) !== (mesh.geometry.morphTargetsRelative ? 0 : position.getComponent(i, k))))
        pelvis.push({ mesh, i, influences, basis, cache, dynamicMorph, point: new THREE.Vector3() })
      }
    }
  })
  chair.updateWorldMatrix(true, true)
  const hit = new THREE.Raycaster(new THREE.Vector3(home.x, 2, home.z), new THREE.Vector3(0, -1, 0)).intersectObject(chair, true).find(h => h.face.normal.y > .8)
  if (!hit || !pelvis.length) throw new Error('R1 cannot measure the actual seat or pelvis')
  for (const side of ['L', 'R']) {
    const bones = ['UpperArm', 'Forearm', 'Hand'].map(name => model.getObjectByName(`Bip01_${side}_${name}`))
    if (bones.some(b => !b)) throw new Error(`R1 missing ${side} arm bones`)
    const chain = []
    for (let bone = bones[2]; bone && bone !== bones[0].parent; bone = bone.parent) chain.unshift(bone)
    arms.push({ side, bones, chain, original: bones.map(b => b.quaternion.clone()) })
  }
  const forward = ch.avatar === 'Female_Adult_09' ? .24 : ch.avatar.startsWith('Female_') ? .28 : .12
  const spread = ch.avatar === 'Female_Adult_09' ? .08 : 0
  const solve = ch.solve, sin = Math.sin(home.yaw), cos = Math.cos(home.yaw), radians = Math.PI / 180
  const limits = [R1_ARM_LIMITS.upperArm, R1_ARM_LIMITS.forearm, R1_ARM_LIMITS.wrist].map(v => v * radians)
  const pivot = new THREE.Vector3(), current = new THREE.Vector3(), wanted = new THREE.Vector3(), scale = new THREE.Vector3()
  const delta = new THREE.Quaternion(), parent = new THREE.Quaternion(), world = new THREE.Quaternion()
  const before = new THREE.Vector3(), target = new THREE.Vector3(), handWorld = new THREE.Quaternion(), rotation = new THREE.Quaternion()
  const report = ch.r1Seated = { handY, seatY: hit.point.y, tableY: .75, seatRaise: chair.userData.seatAdjustment || 0, forward, limits: R1_ARM_LIMITS, hands: [] }
  ch.solve = dt => {
    // Remove last frame's correction before the original mixer updates its pose.
    for (const arm of arms) arm.bones.forEach((bone, i) => bone.quaternion.copy(arm.original[i]))
    solve(dt)
    if (ch.pose?.r1AtDesk === false) {
      for (const arm of arms) arm.bones.forEach((bone, i) => arm.original[i].copy(bone.quaternion))
      report.active = false; return
    }
    report.active = true
    ch.group.position.set(home.x - sin * forward, 0, home.z - cos * forward)
    ch.group.updateMatrixWorld(true)
    for (const [mesh, cache] of skinning) {
      const { rows, basis } = cache, position = mesh.geometry.attributes.position
      cache.changed = cache.position !== position || cache.version !== position.version || !cache.bind.equals(mesh.bindMatrix)
      cache.position = position; cache.version = position.version; cache.bind.copy(mesh.bindMatrix)
      basis.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
      for (const [index, matrix] of rows) matrix.multiplyMatrices(mesh.skeleton.bones[index].matrixWorld, mesh.skeleton.boneInverses[index]).premultiply(basis)
    }
    let bottom = Infinity
    // Same skinning as THREE, computing only world Y and reusing each bone matrix across vertices.
    for (const { mesh, i, influences, basis, cache, dynamicMorph, point } of pelvis) {
      // Cache only unchanged bind-space vertices; animated garments and nonzero morphs stay live.
      if (cache.changed || dynamicMorph) THREE.Mesh.prototype.getVertexPosition.call(mesh, i, point).applyMatrix4(mesh.bindMatrix)
      let y = 0, sum = 0
      for (const [w, m] of influences) { y += w * (m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13]); sum += w }
      bottom = Math.min(bottom, y + basis.elements[13] * (1 - sum))
    }
    ch.group.position.y = hit.point.y + .015 - bottom
    ch.group.updateWorldMatrix(false, false)
    report.offset = ch.group.position.toArray(); report.pelvisY = hit.point.y + .015; report.hands = []
    for (const arm of arms) {
      const { bones, original, chain } = arm, hand = bones[2]
      bones.forEach((bone, i) => original[i].copy(bone.quaternion))
      hand.getWorldPosition(before); target.copy(before)
      hand.matrixWorld.decompose(pivot, handWorld, scale)
      const dx = before.x - desk.x, dz = before.z - desk.z
      const x = THREE.MathUtils.clamp(cos * dx - sin * dz + (arm.side === 'L' ? -spread : spread), -.62, .62), z = THREE.MathUtils.clamp(sin * dx + cos * dz, -.34, .34)
      target.set(desk.x + cos * x + sin * z, handY, desk.z - sin * x + cos * z)
      // Let raised hands/head-touch/stretch gestures pass through; never pin an arm to the desk.
      const weight = 1 - THREE.MathUtils.smoothstep(before.y - ch.group.position.y, .90, 1.06)
      const clampJoint = i => {
        const angle = original[i].angleTo(bones[i].quaternion)
        if (angle > limits[i]) bones[i].quaternion.slerpQuaternions(original[i], rotation.copy(bones[i].quaternion), limits[i] / angle)
      }
      if (weight > 0) {
        for (let pass = 0; pass < (ch.avatar === 'Female_Adult_09' ? 8 : 4); pass++) for (let i = 1; i >= 0; i--) {
          const joint = bones[i]
          pivot.setFromMatrixPosition(joint.matrixWorld); current.setFromMatrixPosition(hand.matrixWorld).sub(pivot); wanted.copy(target).sub(pivot)
          delta.setFromUnitVectors(current.normalize(), wanted.normalize())
          joint.parent.matrixWorld.decompose(pivot, parent, scale); joint.matrixWorld.decompose(pivot, world, scale)
          joint.quaternion.copy(parent.invert().multiply(delta.multiply(world))); clampJoint(i)
          for (let j = chain.indexOf(joint); j < chain.length; j++) chain[j].updateWorldMatrix(false, false)
        }
        // The arm chain matrices were updated above; do not traverse the same ancestors again.
        hand.parent.matrixWorld.decompose(pivot, parent, scale)
        hand.quaternion.copy(parent.invert().multiply(handWorld)); clampJoint(2)
        bones.forEach((bone, i) => bone.quaternion.slerpQuaternions(original[i], rotation.copy(bone.quaternion), weight))
        bones[0].updateWorldMatrix(false, true)
      }
      report.hands.push({ side: arm.side, before: before.toArray(), after: current.setFromMatrixPosition(hand.matrixWorld).toArray(), angles: bones.map((bone, i) => original[i].angleTo(bone.quaternion) / radians), weight })
    }
  }
  ch.solve(0)
  return report
}
