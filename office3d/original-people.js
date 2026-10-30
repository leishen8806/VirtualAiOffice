import * as THREE from 'three'
import { fixMaterials } from './people-materials.js'
const BASE = './assets/models/people/'
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
async function makeLoader(folder) {
  const m = new THREE.LoadingManager()
  // FBX 里写的是原始 .tga 路径；改指向转换后的 JPG / PNG（透明贴图）
  m.setURLModifier((url) => {
    const name = decodeURIComponent(url.split(/[\\/]/).pop())
    if (/_(normal|specular)\.tga$/i.test(name)) return BLANK // 只下载了颜色贴图；法线/高光图不加载
    if (/\.tga$/i.test(name)) return BASE + folder + '/' + name.replace(/\.tga$/i, /opacity/i.test(name) ? '.png' : '.jpg')
    return url
  })
  const { FBXLoader } = await import('./vendor/three/jsm/loaders/FBXLoader.js')
  return new FBXLoader(m)
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


export async function loadOriginalPerson(name) {
  const loader = await makeLoader(name)
  let scene
  try { scene = await loader.loadAsync(`${BASE}${name}/${name}_facial.fbx`) }
  catch { scene = await loader.loadAsync(`${BASE}${name}/${name}.fbx`) }
  fixMaterials(scene); pruneMorphs(scene)
  const box = new THREE.Box3().setFromObject(scene)
  scene.userData.compactHeight = box.max.y - box.min.y
  return scene
}
export async function loadOriginalClips(name) {
  const loader = await makeLoader('anim')
  return (await loader.loadAsync(`${BASE}anim/${name}.fbx`)).animations
}
