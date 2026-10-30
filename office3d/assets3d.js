import * as THREE from 'three'
import { GLTFLoader } from './vendor/three/jsm/loaders/GLTFLoader.js'
import { CompactTextureLoader, compactTextureSize, loadCompactClips, loadCompactGltf } from './compact-assets.js'
import * as SkeletonUtils from './vendor/three/jsm/utils/SkeletonUtils.js'

// 素材：Kenney Furniture Kit、Quaternius Universal Base Characters / Universal Animation Library（均为 CC0，见 assets/ASSET_LEDGER.md）
// 末三件（咖啡机 / 面包机 / 搅拌机）给 R1 中央吧台台面用，OFFICE-R1-FOOD（CMP-626）经董事会审批后加入。
const FURN = ['desk', 'chairDesk', 'computerScreen', 'computerKeyboard', 'computerMouse', 'laptop', 'pottedPlant', 'plantSmall1', 'plantSmall2', 'bookcaseClosed', 'bookcaseOpen', 'books', 'lampRoundTable', 'lampSquareFloor', 'loungeSofa', 'loungeSofaLong', 'loungeChair', 'tableCoffee', 'rugRectangle', 'sideTable', 'trashcan', 'table', 'chairModernCushion', 'chairRounded', 'coatRack', 'speaker', 'cabinetTelevision', 'kitchenCoffeeMachine', 'toaster', 'kitchenBlender']
export const HAIRS = ['Hair_Beard', 'Hair_Buns', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Long', 'Hair_SimpleParted']
export const FURN_SCALE = 2 // Kenney 家具约为真实尺寸的一半
const STRIDE = 1.5 // 走路动画一个循环大约走多远（米），用来让脚步和移动速度对上
const SKIN_URL = {
  male: { dark: './assets/models/characters/tex/T_Superhero_Male_Dark.png', light: './assets/models/characters/tex/T_Superhero_Male_Ligh.png' },
  female: { dark: './assets/models/characters/tex/T_Superhero_Female_Dark_BaseColor.png', light: './assets/models/characters/tex/T_Superhero_Female_Light_BaseColor.png' },
}

// Kenney 原版是糖果色；这里按 VI 配色重新上色：象牙白 / 石墨 / 香槟金 / 拉丝银 + 橡木
const PALETTE = {
  wood: [0xcdbb9c, 0.5, 0.0], woodDark: [0x5b4a3a, 0.4, 0.0],
  carpet: [0x2c3036, 0.9, 0.0], carpetBlue: [0x2c3036, 0.9, 0.0],
  metal: [0xc7cbcf, 0.3, 0.9], metalMedium: [0x9aa0a6, 0.35, 0.85], metalDark: [0x2a2d31, 0.4, 0.7],
  plant: [0x3c8a4f, 0.8, 0.0],
}
const tl = new CompactTextureLoader()
const skinTexCache = new Map()
function skinTexture(gender, tone) {
  const key = `${gender}:${tone}`
  if (!skinTexCache.has(key)) {
    const t = tl.load(SKIN_URL[gender][tone])
    t.flipY = false
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    skinTexCache.set(key, t)
  }
  return skinTexCache.get(key)
}

function prepShadow(root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false } })
}

// ───────────── 衣服：从身体网格里按骨骼权重挑出三角形，外扩一层做成「壳」，共用同一副骨架 ─────────────
const SHIRT_BONES = /^(spine_0[123]|clavicle_[lr]|upperarm_[lr])$/
const LEG_BONES = /^(pelvis|thigh_[lr]|calf_[lr])$/
const FOOT_BONES = /^(foot_[lr]|ball_[lr]|ball_leaf_[lr])$/
function makeShells(body, H, gkey) {
  const g = body.geometry
  const pos = g.attributes.position, nor = g.attributes.normal
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight
  const idx = g.index.array
  const names = body.skeleton.bones.map((b) => b.name)
  g.computeBoundingBox()
  const gh = g.boundingBox.max.y - g.boundingBox.min.y
  const k = gh / H // 几何单位 / 米
  const y0 = g.boundingBox.min.y
  const domName = (v) => {
    let best = 0, bi = 0
    for (let c = 0; c < 4; c++) { const w = sw.getComponent(v, c); if (w > best) { best = w; bi = si.getComponent(v, c) } }
    return names[bi]
  }
  const vName = new Array(pos.count)
  for (let v = 0; v < pos.count; v++) vName[v] = domName(v)
  const kinds = { shirt: [], pants: [], shoes: [] }
  // 裁剪线用片元着色器按「静止姿态下的位置」切：下摆、腰线、脚踝是笔直的，不会有三角形锯齿
  const Y = (f) => (y0 + f * H * k).toFixed(5)
  const rest = (name) => {
    const i = names.indexOf(name)
    const m = new THREE.Matrix4().copy(body.skeleton.boneInverses[i]).invert()
    return new THREE.Vector3().setFromMatrixPosition(m)
  }
  const sl = rest('upperarm_l'), el = rest('lowerarm_l'), sr = rest('upperarm_r'), er = rest('lowerarm_r')
  const dl = el.clone().sub(sl), dr = er.clone().sub(sr)
  const sleeve = (0.62 * dl.length()).toFixed(5)
  dl.normalize(); dr.normalize()
  const v3 = (v) => `vec3(${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)})`
  const clips = {
    shirt: `if (abs(vRest.x) < ${(0.3 * H * k).toFixed(5)} && vRest.y < ${Y(0.545)}) discard;
      if (vRest.y > ${(y0 + 1.5 * k).toFixed(5)} + 1.3 * max(0.0, abs(vRest.x) - ${(0.075 * k).toFixed(5)})) discard;
      if (vRest.x * ${sl.x.toFixed(5)} > 0.0) { if (dot(vRest - ${v3(sl)}, ${v3(dl)}) > ${sleeve}) discard; }
      else { if (dot(vRest - ${v3(sr)}, ${v3(dr)}) > ${sleeve}) discard; }`,
    pants: `if (vRest.y > ${Y(0.575)} || vRest.y < ${Y(0.07)}) discard;`,
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    const n3 = [vName[a], vName[b], vName[c]]
    const count = (re) => n3.filter((n) => re.test(n)).length
    if (count(FOOT_BONES) >= 2) kinds.shoes.push(a, b, c)
    else if (count(/^(spine_0[123]|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|pelvis)$/) >= 1 && count(/^(neck_01|Head)$/) === 0) kinds.shirt.push(a, b, c)
    if (count(LEG_BONES) >= 1 && count(FOOT_BONES) === 0) kinds.pants.push(a, b, c)
  }
  const clipMat = (key, glsl, color) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })
    if (glsl) {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;')
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${glsl}`)
      }
      m.customProgramCacheKey = () => key
    }
    return m
  }
  const make = (tri, off, name, glsl) => {
    const np = new Float32Array(pos.count * 3)
    for (let v = 0; v < pos.count; v++) {
      np[v * 3] = pos.getX(v) + nor.getX(v) * off * k
      np[v * 3 + 1] = pos.getY(v) + nor.getY(v) * off * k
      np[v * 3 + 2] = pos.getZ(v) + nor.getZ(v) * off * k
    }
    const ng = new THREE.BufferGeometry()
    ng.setAttribute('position', new THREE.BufferAttribute(np, 3))
    ng.setAttribute('normal', nor)
    ng.setAttribute('skinIndex', si)
    ng.setAttribute('skinWeight', sw)
    if (g.attributes.uv) ng.setAttribute('uv', g.attributes.uv)
    ng.setIndex(tri)
    const m = new THREE.SkinnedMesh(ng, clipMat(`${name}:${gkey}`, glsl, 0x25292e))
    m.name = name
    m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale)
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false
    body.parent.add(m)
    m.bind(body.skeleton, body.bindMatrix)
    return m
  }
  make(kinds.shirt, 0.014, 'shell_shirt', clips.shirt)
  make(kinds.pants, 0.010, 'shell_pants', clips.pants)
  make(kinds.shoes, 0.008, 'shell_shoes', null)
  return k
}

function boneByName(root, name) {
  let f = null
  root.traverse((o) => { if (o.isBone && o.name === name) f = o })
  return f
}

// 极速模式：卡通人物的法线 / 粗糙度贴图（单张 3–5 MB，小人物在低档下几乎看不出）换成 1 像素空图；
// 同一张贴图被多个角色引用时只下载一次（加载期间临时开启 three 的缓存，加载完清掉）。
const LITE_BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
export const liteTextureUrl = url => /_(Normal|Roughness)\.png$/i.test(url) ? LITE_BLANK : url
export async function loadAssets({ lite = false } = {}) {
  const manager = new THREE.LoadingManager()
  const size = lite ? 512 : compactTextureSize()
  manager.setURLModifier(url => lite || size === 512 ? liteTextureUrl(url) : url)
  manager.addHandler(/\.(png|jpe?g)$/i, new CompactTextureLoader(manager))
  if (lite) THREE.Cache.enabled = true
  try { return await loadAssetSet(new GLTFLoader(manager)) } finally { if (lite) { THREE.Cache.clear(); THREE.Cache.enabled = false } }
}
async function loadAssetSet(loader) {
  const furn = {}
  await Promise.all(FURN.map(async (n) => {
    const g = await loader.loadAsync(`./assets/models/furniture/${n}.glb`)
    prepShadow(g.scene)
    g.scene.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const p = PALETTE[o.material.name]
      if (!p) return
      o.material.color.setHex(p[0])
      o.material.roughness = p[1]
      o.material.metalness = p[2]
    })
    furn[n] = g.scene
  }))
  const chars = {}
  for (const [gender, file] of [['male', 'Superhero_Male_FullBody'], ['female', 'Superhero_Female_FullBody']]) {
    const g = await loadCompactGltf(`./assets/compact/characters/${file}.glb.gz`, './assets/models/characters/', loader.manager)
    prepShadow(g.scene)
    let body = null
    g.scene.traverse((o) => { if (o.isSkinnedMesh && /Sphere|Retopology|Body/i.test(o.name)) body = o })
    if (!body) g.scene.traverse((o) => { if (o.isSkinnedMesh && !body && o.material && /Superhero/.test(o.material.name)) body = o })
    if (!body) throw new Error('找不到身体网格')
    const box = new THREE.Box3().setFromObject(g.scene)
    const k = makeShells(body, 1.78, gender)
    // 胸前标志：记下「脊柱 3」骨头的局部坐标，克隆后跟着骨头走
    g.scene.updateMatrixWorld(true)
    const hi = body.skeleton.bones.findIndex((b) => b.name === 'Head')
    chars[gender] = { scene: g.scene, body, height: box.max.y - box.min.y, k, headInv: body.skeleton.boneInverses[hi].clone() }
  }
  const hairs = {}
  await Promise.all(HAIRS.map(async (n) => {
    const g = await loadCompactGltf(`./assets/compact/characters/hair/${n}.glb.gz`, './assets/models/characters/hair/', loader.manager)
    prepShadow(g.scene)
    hairs[n] = g.scene
  }))
  const animGltf = { animations: await loadCompactClips('UAL1_Standard') }
  const clips = {}
  for (const c of animGltf.animations) {
    // 去掉缩放与除骨盆外的位移轨道：两套骨架比例略有差异，只保留旋转就不会变形
    c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')))
    clips[c.name] = c
  }
  return { furn, chars, clips, hairs }
}

// 家具：缩放到真实尺寸，并把包围盒「底面中心」放到原点
export function placeFurniture(A, name, x, z, { y = 0, rotY = 0, scale = FURN_SCALE, mat = null } = {}) {
  const src = A.furn[name]
  if (!src) throw new Error(`缺少家具 ${name}`)
  const inner = src.clone(true)
  inner.traverse((o) => { if (o.isMesh && mat) o.material = mat })
  const box = new THREE.Box3().setFromObject(inner)
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(-c.x, -box.min.y, -c.z)
  const wrap = new THREE.Group()
  wrap.add(inner)
  wrap.scale.setScalar(scale)
  wrap.position.set(x, y, z)
  wrap.rotation.y = rotY
  return { group: wrap, size: box.getSize(new THREE.Vector3()).multiplyScalar(scale) }
}

const ANIM = {
  sitIdle: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop', stand: 'Idle_Loop', standTalk: 'Idle_Talking_Loop', walk: 'Walk_Formal_Loop',
}

// 角色：对外接口与旧的程序化骨架一致（group / body.head / pose / solve），director 与 app 不用改
export function createCharacter3D(A, o) {
  const { gender = 'male', tone = 'dark', hair = 0xffffff, shirt = 0x25292e, pants = 0x1d2026, shoes = 0x14161a, markTexture = null, accent = 0xb69a64 } = o
  const T = A.chars[gender]
  const model = SkeletonUtils.clone(T.scene)
  prepShadow(model)
  let bodyMesh = null
  model.traverse((m) => {
    if (!m.isSkinnedMesh) return
    const own = (hex) => { // 每个人自己的颜色；裁剪着色器要手动带过去（Material.clone 不会复制它）
      const src = m.material, c = src.clone()
      c.onBeforeCompile = src.onBeforeCompile
      c.customProgramCacheKey = src.customProgramCacheKey
      c.color.setHex(hex)
      m.material = c
    }
    if (m.name === 'shell_shirt') own(shirt)
    else if (m.name === 'shell_pants') own(pants)
    else if (m.name === 'shell_shoes') own(shoes)
    else if (m.material && /Hair/.test(m.material.name)) m.material = m.material.clone(), m.material.color.setHex(hair)
    else if (m.material && /Superhero/.test(m.material.name)) { bodyMesh = m; m.material = m.material.clone(); m.material.map = skinTexture(gender, tone); m.material.normalScale.set(0.6, 0.6) }
  })
  const root = new THREE.Group()
  model.rotation.y = Math.PI // 模型面朝 +z，场景约定面朝 -z
  root.add(model)
  const head = boneByName(model, 'Head')
  // 发型：「Origin at 0」的网格按静止姿态放好，再挂到头骨上
  for (const hn of [].concat(o.hairStyle || [])) {
    const src = A.hairs[hn]
    if (!src || !head) continue
    const h = src.clone(true)
    h.traverse((m) => {
      if (m.isMesh) { m.material = m.material.clone(); m.material.color.setHex(hair); m.castShadow = true }
    })
    const holder = new THREE.Object3D()
    T.headInv.decompose(holder.position, holder.quaternion, holder.scale)
    holder.add(h)
    head.add(holder)
  }
  const hand = boneByName(model, 'hand_r')
  const spine = boneByName(model, 'spine_03')
  const neck = boneByName(model, 'neck_01')

  // 领口金边 + 胸前标志（挂在骨头上，随动作一起动）
  const gold = new THREE.MeshStandardMaterial({ color: 0xb69a64, roughness: 0.35, metalness: 0.9 })
  if (neck) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 24), gold)
    collar.name = 'collar'
    neck.add(collar)
    collar.userData.isTrim = true
  }
  if (markTexture && spine) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.075), new THREE.MeshBasicMaterial({ map: markTexture, transparent: true, toneMapped: false, depthWrite: false }))
    mark.name = 'chestmark'
    spine.add(mark)
  }
  // 递交材料用的文件夹
  const folder = new THREE.Group()
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.3), new THREE.MeshStandardMaterial({ color: 0xf4f1eb, roughness: 0.7 }))
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.004, 0.02), gold)
  edge.position.set(0, 0.008, -0.14)
  folder.add(sheet, edge)
  folder.visible = false
  if (hand) hand.add(folder)

  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const [k, n] of Object.entries(ANIM)) {
    const clip = A.clips[n]
    if (!clip) continue
    const a = mixer.clipAction(clip)
    a.setLoop(THREE.LoopRepeat, Infinity)
    actions[k] = a
  }
  const pose = { sit: 1, walk: 0, phase: 0, type: 0, talk: 0, carry: 0, yaw: 0, pitch: 0, breathe: 0, t: 0, seed: Math.random() * 10 }
  let cur = null
  let lastPhase = 0
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), qd = new THREE.Quaternion()
  const UP = new THREE.Vector3(0, 1, 0)
  const pick = () => {
    if (pose.walk > 0.5) return 'walk'
    if (pose.sit > 0.5) return pose.talk > 0.5 ? 'sitTalk' : 'sitIdle'
    return pose.talk > 0.5 ? 'standTalk' : 'stand'
  }
  function solve(dt) {
    pose.t += dt
    const want = pick()
    if (want !== cur && actions[want]) {
      const next = actions[want]
      next.reset().play()
      if (cur && actions[cur]) next.crossFadeFrom(actions[cur], 0.28, false)
      else next.setEffectiveWeight(1)
      cur = want
    }
    if (cur === 'walk' && dt > 0) {
      const v = Math.max(0, (pose.phase - lastPhase) / 4.6 / dt) // 米/秒
      actions.walk.timeScale = Math.min(2.5, Math.max(0.25, (v * actions.walk.getClip().duration) / STRIDE))
    }
    lastPhase = pose.phase
    mixer.update(dt)
    // 转头（听对方说话）：在世界坐标绕竖轴转，再换算回骨头的局部旋转
    if (head && Math.abs(pose.yaw) > 0.001) {
      model.updateMatrixWorld(true)
      head.parent.getWorldQuaternion(qp)
      head.getWorldQuaternion(q)
      qd.setFromAxisAngle(UP, Math.max(-1, Math.min(1, pose.yaw)) * 0.8)
      q.premultiply(qd)
      head.quaternion.copy(qp.invert().multiply(q))
    }
    folder.visible = pose.carry > 0.5
  }
  solve(0)
  return { group: root, body: { head }, pose, solve, labelDY: 0.38, ringY: 2.05, isModel: true, parts: { folder, model } }
}
