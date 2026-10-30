// 档位策略不依赖DOM/Three，测试与浏览器共用；自动降档只作用于当前会话。
export const TIERS = Object.freeze({ low: { dpr: 1, fps: 30, lights: 4 }, medium: { dpr: 1.25, fps: 60, lights: 8 }, high: { dpr: 1.5, fps: 60, lights: 18 } })
export const QUALITY_KEY = 'office3d.quality.v3'
const valid = q => Object.hasOwn(TIERS, q || '')
export function initialQuality({ search = '', storage, wall = false } = {}) {
  const q = new URLSearchParams(search).get('q')
  if (valid(q)) return { tier: q, source: 'url', forced: true }
  try { const saved = storage?.getItem(QUALITY_KEY); if (valid(saved)) return { tier: saved, source: 'storage', forced: false } } catch {}
  return { tier: wall ? 'high' : 'medium', source: wall ? 'wall' : 'warmup', forced: false }
}
export function chooseQuality({ averageMs = 0, cores, memory, gpu = '' } = {}) {
  if (/Intel|UHD|Iris|Mali|Adreno|SwiftShader|llvmpipe|software/i.test(gpu) || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || averageMs > 42) return 'low'
  if ((cores > 0 && cores <= 8) || (memory > 0 && memory <= 8) || averageMs > 25 || !cores) return 'medium'
  return 'high'
}
export function createQualityPolicy({ selection, signals = {}, wall = false } = {}) {
  let tier = selection.tier, source = selection.source, reason = selection.forced ? 'URL强制' : source === 'storage' ? '已保存选择' : wall ? '大屏默认高档' : '等待6秒预热'
  let started = null, windowAt = null, samples = [], warm = [], slowSince = null, initialized = false, downgraded = false
  // 用户明确选了"高"（本次手动选、上次保存、或网址指定）：锁定完整效果，不自动降档、不节能（董事会 2026-10-30）。
  let locked = tier === 'high' && ['url', 'storage'].includes(source)
  function observe(ms, time, eligible = true) {
    if (!eligible || !Number.isFinite(ms) || ms <= 0) { slowSince = null; samples = []; windowAt = null; return false }
    if (started === null) { started = time; return false }
    // 后台由 visibilitychange 显式重置；极慢的前台帧仍须计入降档。
    if (time - started < 6000) { warm.push(ms); return false }
    if (!initialized) {
      initialized = true; windowAt = time
      if (source === 'warmup' && !wall) {
        const next = chooseQuality({ ...signals, averageMs: warm.length ? warm.reduce((a,b) => a+b,0) / warm.length : ms })
        const changed = next !== tier; tier = next; source = 'auto'; reason = '6秒预热与设备信号'; return changed
      }
    }
    if (selection.forced || locked) return false
    if (windowAt === null) windowAt = time
    samples.push(ms)
    if (time - windowAt < 1000) return false
    const avg = samples.reduce((a,b) => a+b,0) / samples.length
    samples = []; windowAt = time
    if (avg <= 1000 / 24) { slowSince = null; return false }
    if (slowSince === null) slowSince = time - 1000
    if (time - slowSince < 10000 || tier === 'low') return false
    tier = tier === 'high' ? 'medium' : 'low'; source = 'auto'; reason = '连续10秒低于24FPS'; downgraded = true; slowSince = null
    return true
  }
  function select(q, storage) {
    if (!valid(q) || selection.forced) return false
    tier = q; source = 'manual'; reason = q === 'high' ? '手动选择：完整效果，不节能' : '手动选择'; locked = q === 'high'; initialized = true; slowSince = null; samples = []
    try { storage?.setItem(QUALITY_KEY, q) } catch {}
    return true
  }
  return { observe, select, resetWindow() { slowSince = null; samples = []; windowAt = null }, get tier() { return tier }, get locked() { return locked }, get source() { return source }, get reason() { return reason }, get downgraded() { return downgraded }, forced: selection.forced }
}
export function renderLimit({ tier, wall = false, idleMs = 0, active = false, hidden = false, locked = false }) {
  if (hidden) return 0
  if (locked) return TIERS[tier].fps // 锁定"高"：闲置也不降到 10 帧
  if (!wall && !active && idleMs >= 30000) return 10
  return TIERS[tier].fps
}
export function cappedDpr(tier, device = 1, width = 1280, height = 720) {
  const scale = tier === 'high' ? Infinity : Math.sqrt((tier === 'low' ? 1920 * 1080 : 2560 * 1440) / (width * height))
  return Math.max(.3, Math.min(device, TIERS[tier].dpr, scale))
}
export function compactDrawGroups(groups, index, vertexCount) {
  if (!groups?.length) return null
  const batches = new Map()
  for (const g of groups) {
    const list=batches.get(g.materialIndex)||[]
    for(let i=g.start;i<g.start+g.count;i++)list.push(index?index[i]:i)
    batches.set(g.materialIndex,list)
  }
  if(batches.size===groups.length)return null
  const values=[],result=[]
  for(const [materialIndex,list]of batches){result.push({start:values.length,count:list.length,materialIndex});values.push(...list)}
  return {index:vertexCount>65535?new Uint32Array(values):new Uint16Array(values),groups:result}
}

export function qualityStartupPlan({ tier = 'medium', source = 'warmup', idle = false } = {}) {
  const current = tier === 'low' || tier === 'high' ? tier : 'medium'
  const variants = current === 'high' ? [] : [current]
  const deferred = idle ? ['low', 'medium'].filter(q => !variants.includes(q)) : []
  return { current, variants, compile: [current], deferred, source }
}

export function takeQualityWork(queue, run, { budgetMs = 8, now = () => performance.now(), timeRemaining = () => budgetMs } = {}) {
  const started = now()
  let count = 0
  while (queue.length && timeRemaining() > 0 && (count === 0 || now() - started < budgetMs)) { run(queue.shift()); count++ }
  return count
}

// 原场景和碰撞引用保留，中低档只切换渲染副本；恢复高档不重新装载模型。
export function createSceneQuality(THREE, { scene, renderer, camera, env, characters, mergeStatic }) {
  let tier = 'high', prepared = false, cooldownUntil = 0
  const compiled = new Set()
  const originals = [], variants = {}, sourceMaterials = new Map(), sourceShadows = new Map(), lightVisibility = new Map(), shadowSizes = new Map(), lowMaterials = new Map(), lowTextures = new Map(), fakeShadows = new Map()
  const originalsGeometry = new Map(), compactGeometry = new Map(), box = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3()
  const isDynamic = mesh => { for (let p = mesh; p; p = p.parent) if (p.userData.agentId || p.userData.dynamic || !p.visible) return true; return false }
  function materialKey(m, low) {
    return JSON.stringify([low ? 'lambert' : m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, low ? 0 : m.roughness, low ? 0 : m.metalness, m.opacity, m.transparent, m.side, m.alphaTest, m.depthWrite, m.depthTest, m.blending, m.vertexColors, m.toneMapped, ...['map','alphaMap','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','lightMap'].map(k => m[k]?.uuid)])
  }
  function lowTexture(t) {
    if (!t?.image || Math.max(t.image.width || 0, t.image.height || 0) <= 1024 || t.isRenderTargetTexture || t.isCanvasTexture) return t
    if (lowTextures.has(t)) return lowTextures.get(t)
    const canvas = document.createElement('canvas'), factor = 1024 / Math.max(t.image.width,t.image.height)
    canvas.width = Math.max(1,Math.round(t.image.width*factor)); canvas.height = Math.max(1,Math.round(t.image.height*factor))
    try { canvas.getContext('2d').drawImage(t.image,0,0,canvas.width,canvas.height) } catch { return t }
    const small = t.clone(); small.image = canvas; small.anisotropy = 1; small.needsUpdate = true; lowTextures.set(t,small); return small
  }
  function lightMaterial(m) {
    if (!m?.isMeshStandardMaterial && !m?.isMeshPhongMaterial) return m
    const key = materialKey(m,true)
    if (lowMaterials.has(key)) return lowMaterials.get(key).material
    const material = new THREE.MeshLambertMaterial({ color:m.color, map:lowTexture(m.map), alphaMap:m.alphaMap, alphaTest:m.alphaTest, side:m.side, opacity:m.opacity, transparent:m.transparent, depthWrite:m.depthWrite, depthTest:m.depthTest, vertexColors:m.vertexColors, emissive:m.emissive, emissiveMap:m.emissiveMap, emissiveIntensity:m.emissiveIntensity, toneMapped:m.toneMapped })
    material.forceSinglePass = true
    lowMaterials.set(key,{ source:m, material }); return material
  }
  function buildVariant(q) {
    if (variants[q]) return variants[q]
    const root = new THREE.Group(); root.name = `quality-${q}`; root.userData.dynamic = true
    const buckets = new Map(), canonical = new Map(), unitBox = new THREE.BoxGeometry(1,1,1), scaling = new THREE.Matrix4()
    for (const o of originals) {
      const original = sourceMaterials.get(o)
      if (Array.isArray(original)) continue
      let mat = q === 'low' ? lightMaterial(original) : original
      // 发光材质仍跟随原材质更新，不把会变色的材质合成另一份。
      const key = original.emissiveMap || original.emissiveIntensity > 0 || original.isMeshBasicMaterial ? original.uuid : materialKey(original,q === 'low')
      if (canonical.has(key)) mat = canonical.get(key); else canonical.set(key,mat)
      box.setFromObject(o).getCenter(center)
      const cell = `${Math.floor(center.x/12)},${Math.floor(center.z/12)}`
      const isBox = o.geometry.type === 'BoxGeometry', geometry = isBox ? unitBox : o.geometry
      const batchKey = [geometry.uuid,mat.uuid,o.castShadow,o.receiveShadow,o.renderOrder,o.layers.mask,cell].join('|')
      if (!buckets.has(batchKey)) buckets.set(batchKey,{ geometry, mat, items:[] })
      const matrix = o.matrixWorld.clone()
      if (isBox) { const p=o.geometry.parameters; matrix.multiply(scaling.makeScale(p.width,p.height,p.depth)) }
      buckets.get(batchKey).items.push({ source:o,matrix })
    }
    let instances=0
    for (const {geometry,mat,items} of buckets.values()) {
      if (items.length > 1) {
        const mesh = new THREE.InstancedMesh(geometry,mat,items.length)
        items.forEach((item,i)=>mesh.setMatrixAt(i,item.matrix)); mesh.computeBoundingBox(); mesh.computeBoundingSphere()
        mesh.userData.instanceSources = items.map(i=>i.source); mesh.frustumCulled = true; mesh.castShadow = q !== 'low' && items[0].source.castShadow; mesh.receiveShadow = q !== 'low' && items[0].source.receiveShadow
        mesh.renderOrder=items[0].source.renderOrder;mesh.layers.mask=items[0].source.layers.mask;root.add(mesh);instances++
      } else {
        const item=items[0], mesh=new THREE.Mesh(geometry.clone(),mat)
        mesh.matrix.copy(item.matrix);mesh.matrixAutoUpdate=false;mesh.castShadow=q!=='low'&&item.source.castShadow;mesh.receiveShadow=q!=='low'&&item.source.receiveShadow;mesh.renderOrder=item.source.renderOrder;mesh.layers.mask=item.source.layers.mask;mesh.userData.source=item.source;root.add(mesh)
      }
    }
    // 仅合并副本，原始几何仍供高档和碰撞使用；透明副本由实例化减少提交。
    root.userData.dynamic=false
    const mergedResult = mergeStatic(root), merged = { removed: mergedResult.removed, added: mergedResult.added }
    root.traverse(mesh=>{if(mesh.isMesh&&mesh.castShadow){const bounds=mesh.isInstancedMesh?mesh.boundingBox:mesh.geometry.boundingBox;if(bounds){bounds.getSize(size);mesh.castShadow=Math.max(size.x,size.z)>1&&size.y>.4}}})
    root.userData.dynamic=true;root.visible=false;scene.add(root)
    return variants[q] = {root,instances,merged}
  }
  function capture() {
    scene.updateMatrixWorld(true)
    scene.traverse(o=>{
      if(o.isLight&&!lightVisibility.has(o)){lightVisibility.set(o,o.visible);if(o.shadow)shadowSizes.set(o,o.shadow.mapSize.clone())}
      if(!o.isMesh||o.userData.qualityProxy)return
      if(!sourceMaterials.has(o)){box.setFromObject(o).getSize(size);sourceMaterials.set(o,o.material);sourceShadows.set(o,{cast:o.castShadow,receive:o.receiveShadow,mediumCast:o.castShadow&&(!!o.userData.agentId||Math.max(size.x,size.z)>1&&size.y>.4)})}
      if(Array.isArray(o.material)&&o.geometry?.groups.length>o.material.length){
        const source=o.geometry, compact=compactDrawGroups(source.groups,source.index?.array,source.attributes.position.count)
        if(compact){const geometry=new THREE.BufferGeometry();geometry.attributes=source.attributes;geometry.morphAttributes=source.morphAttributes;geometry.morphTargetsRelative=source.morphTargetsRelative;geometry.setIndex(new THREE.BufferAttribute(compact.index,1));geometry.groups=compact.groups;geometry.boundingBox=source.boundingBox?.clone()||null;geometry.boundingSphere=source.boundingSphere?.clone()||null;geometry.drawRange={...source.drawRange};originalsGeometry.set(o,source);compactGeometry.set(o,geometry)}
      }
      if(o.isSkinnedMesh||o.isInstancedMesh||o.morphTargetInfluences||isDynamic(o)||Array.isArray(o.material)||o.material?.isShaderMaterial||o.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender)return
      // 原合并体保持分块边界；不把建筑/远景重新并成一个无法剔除的巨物。
      if(o.geometry?.attributes.position)originals.push(o)
    })
  }
  function apply(q) {
    if (!prepared) return
    if (q !== 'high') buildVariant(q)
    tier=q;env.setQuality(q)
    const lights=[...lightVisibility.keys()], essential=lights.filter(l=>l.isHemisphereLight||l.isDirectionalLight), points=lights.filter(l=>l.isPointLight)
    const selected=new Set(q==='high'?lights:q==='low'?essential.slice(0,4):[...essential,...points.filter((_,i)=>[0,3,8,10].includes(i))].slice(0,8))
    for(const l of lights){l.visible=lightVisibility.get(l)&&selected.has(l);if(l.shadow){const scale=q==='medium'?.5:1, original=shadowSizes.get(l);const x=Math.max(1,Math.round(original.x*scale)),y=Math.max(1,Math.round(original.y*scale));if(l.shadow.mapSize.x!==x||l.shadow.mapSize.y!==y){l.shadow.mapSize.set(x,y);l.shadow.map?.dispose();l.shadow.map=null} }}
    renderer.shadowMap.enabled=q!=='low'
    for(const [mesh,mat]of sourceMaterials){mesh.material=q==='low'?(Array.isArray(mat)?mat.map(lightMaterial):lightMaterial(mat)):mat;if(originalsGeometry.has(mesh))mesh.geometry=q==='high'?originalsGeometry.get(mesh):compactGeometry.get(mesh);const shadow=sourceShadows.get(mesh);mesh.castShadow=q==='high'?shadow.cast:q==='medium'&&shadow.mediumCast;mesh.receiveShadow=q!=='low'&&shadow.receive}
    for(const o of originals)o.visible=q==='high'||!variants[q]
    for(const [name,v]of Object.entries(variants)){
      v.root.visible=name===q
      if(name===q&&!v.root.parent)scene.add(v.root)
      else if(name!==q&&v.root.parent)v.root.removeFromParent()
    }
    for(const [ch,shadow]of fakeShadows)shadow.visible=q==='low'&&ch.group.visible
    renderer.shadowMap.needsUpdate=q!=='low'
  }
  function prepare(q = tier) {
    if(prepared)return
    capture();prepared=true;tier=q
    for(const ch of characters()){
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(.38,16),new THREE.MeshBasicMaterial({color:0x18202a,transparent:true,opacity:.2,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}))
      shadow.rotation.x=-Math.PI/2;shadow.userData.dynamic=true;scene.add(shadow);fakeShadows.set(ch,shadow)
    }
    const started=performance.now();apply(q);if(q!=='high')renderer.compile(scene,camera);compiled.add(q);cooldownUntil=performance.now()+Math.max(1000,performance.now()-started)
  }
  function prepareTier(q) {
    if(!prepared)prepare(q)
    else if(q!=='high'&&!variants[q]){const started=performance.now();buildVariant(q);cooldownUntil=performance.now()+Math.max(1000,performance.now()-started)}
  }
  function activate(q) {
    if(!prepared)return
    const started=performance.now();apply(q)
    if(!compiled.has(q)){renderer.compile(scene,camera);compiled.add(q);cooldownUntil=performance.now()+Math.max(1000,performance.now()-started)}
  }
  function update() {
    if(tier==='low')for(const {source,material}of lowMaterials.values()){material.emissive?.copy(source.emissive);material.emissiveIntensity=source.emissiveIntensity}
    if(tier==='low')for(const [ch,shadow]of fakeShadows){shadow.visible=ch.group.visible;shadow.position.set(ch.group.position.x,.035,ch.group.position.z)}
  }
  return {prepare,prepareTier,activate,update,eligible(time=performance.now()){return time>=cooldownUntil},get tier(){return tier},get prepared(){return prepared},summary:()=>({sourceMeshes:originals.length,medium:variants.medium?.merged,low:variants.low?.merged,instanced:[variants.medium?.instances,variants.low?.instances],lowTextures:lowTextures.size})}
}
