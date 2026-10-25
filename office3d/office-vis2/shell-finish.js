import { buildOfficeShellV3 } from '../office-layout-v3-scene.js'
import { officeSampleRequested } from './host.js'
import { createSampleBatch, officeStoneGrain } from './batch.js'
import { appendOfficePlazaPaving } from './completion.js'
import { wholeFloorSpec, appendWholeFloorGarden } from './whole-floor.js'
import { buildOfficeBackdropTrees } from './plants.js'

const enclosed = new Set(['market', 'service', 'aftersales', 'marketing', 'board', 'review', 'plan'])
const contactShadowOnly = new Set(['floor-joint', 'desk-handle', 'desk-tray', 'desk-book', 'shelf-book', 'meeting-runner', 'meeting-console', 'meeting-paper', 'meeting-folder', 'ceiling-trim', 'light-recess', 'wall-slat', 'desk-group-inlay', 'desk-group-rug', 'pendant-cord', 'pendant-canopy', 'pendant-socket'])

// Only visual surfaces change: the host still owns all walls, door gaps and collision proxies.
export function officeShellFinishSpec(layout, spec) {
  const solid = [], panes = []
  const box = (x, y, z, w, h, d, color, kind) => solid.push({ x, y, z, w, h, d, color, kind })
  const panel = (side, lo, hi, fixed, height, outer = false) => {
    const vertical = side === 'west' || side === 'east', span = hi - lo
    const at = (along, y, w, h, d, color, kind) => box(vertical ? fixed : along, y, vertical ? along : fixed, vertical ? d : w, h, vertical ? w : d, color, kind)
    const middle = (lo + hi) / 2
    at(middle, .18, span, .2, outer ? .18 : .14, '#D8BC94', 'plinth')
    at(middle, .3, span, .045, .07, '#B89B64', 'sill')
    at(middle, height - .045, span, .09, .07, '#AA9472', 'header')
    const divisions = Math.max(1, Math.ceil(span / (outer ? 3 : 2.4)))
    for (let i = 0; i <= divisions; i++) {
      const a = lo + .025 + (span - .05) * i / divisions
      at(a, (.3 + height) / 2, .05, height - .3, .07, '#AA9472', 'mullion')
    }
    panes.push({ x: vertical ? fixed : middle, y: (.32 + height - .09) / 2, z: vertical ? middle : fixed,
      w: vertical ? .018 : span - .05, h: height - .41, d: vertical ? span - .05 : .018, side, lo, hi, outer })
  }
  for (const segment of spec.outer) panel(segment.side, segment.lo, segment.hi, (segment.fixed0 + segment.fixed1) / 2, layout.wallHeight.standard, true)
  // 概念图的北侧背墙保留暖色实体基底；仅在原墙厚内补面，不跨门洞。
  if (layout.variant === 'align') for (const s of spec.outer.filter(s => s.side === 'north')) {
    box((s.lo + s.hi) / 2, 1.3, (s.fixed0 + s.fixed1) / 2, s.hi - s.lo, 2.2, .1, '#E7DFD0', 'north-wall-panel')
  }
  for (const segment of spec.inner) {
    const { room, side } = segment
    if (layout.variant === 'align' && room.walled !== true) continue
    const boundary = side === 'west' ? room.x0 : side === 'east' ? room.x1 : side === 'north' ? room.z0 : room.z1
    const outerBoundary = side === 'west' ? layout.envelope.x0 : side === 'east' ? layout.envelope.x1 : side === 'north' ? layout.envelope.z0 : layout.envelope.z1
    if (Math.abs(boundary - outerBoundary) < .001) continue // No coincident inner/outer glass.
    const fixed = boundary + (side === 'west' || side === 'north' ? .07 : -.07)
    panel(side, segment.lo, segment.hi, fixed, enclosed.has(room.id) ? 2.7 : 1.1)
  }
  // Door headers stay above the walking volume; jambs are already within the wall segments.
  for (const room of layout.regions.filter(room => layout.variant === 'align' ? room.walled === true : enclosed.has(room.id))) for (const door of room.doors || []) {
    const vertical = door.side === 'west' || door.side === 'east'
    const fixed = door.side === 'west' ? room.x0 + .07 : door.side === 'east' ? room.x1 - .07 : door.side === 'north' ? room.z0 + .07 : room.z1 - .07
    box(vertical ? fixed : door.at, 2.655, vertical ? door.at : fixed, vertical ? .07 : door.width, .09, vertical ? door.width : .07, '#AA9472', 'door-header')
  }
  for (const door of Object.values(layout.doors)) box((door.x0 + door.x1) / 2, door.height ? .08 + door.height + .06 : 3.05, door.z, door.width, .12, .16, '#B89B64', 'entrance-header')
  const e = layout.envelope
  for (let x = e.x0 + 2; x < e.x1; x += 2) box(x, .082, (e.z0 + e.z1) / 2, .014, .002, e.z1 - e.z0, '#BFB5A5', 'floor-joint')
  for (let z = e.z0 + 2; z < e.z1; z += 2) box((e.x0 + e.x1) / 2, .082, z, e.x1 - e.x0, .002, .014, '#BFB5A5', 'floor-joint')
  for (const room of layout.regions) {
    if (layout.variant === 'align') continue // ALIGN floors are owned by zone-finish.
    const wood = ['board', 'review', 'plan', 'creative', 'dining'].includes(room.id)
    const width = room.x1 - room.x0 - .4, depth = room.z1 - room.z0 - .4
    box((room.x0 + room.x1) / 2, .086, (room.z0 + room.z1) / 2, width, .002, depth, wood ? '#C3AA87' : '#DEC69F', 'room-floor')
    if (wood) for (let x = room.x0 + .8; x < room.x1 - .2; x += .8) box(x, .088, (room.z0 + room.z1) / 2, .008, .001, depth, '#AD9473', 'wood-joint')
  }
  // These details stay inside existing desk collision volumes, never in chair or walkway space.
  for (const [id, [, x, z]] of Object.entries(layout.seats)) {
    const start = solid.length
    box(x - .5, .38, z, .28, .58, .5, '#D9D3C6', 'desk-cabinet')
    box(x, .53, z - .3, 1.22, .3, .025, '#B7C2B4', 'desk-panel')
    for (const y of [.29, .48]) box(x - .5, y, z + .255, .13, .015, .018, '#B89B64', 'desk-handle')
    solid.slice(start).forEach(p => { p.workstation = id })
  }
  const wholeFloor = wholeFloorSpec(layout)
  solid.push(...wholeFloor.details)
  return { solid, panes, wholeFloor }
}

export function buildOfficeAlignedShell(context) {
  const track = context.layout.variant === 'align' && officeSampleRequested(context.search), registered = []
  const shell = buildOfficeShellV3(track ? { ...context, collision: { ...context.collision, add(proxy, kind) { registered.push(proxy); context.collision?.add?.(proxy, kind) } } } : context)
  if (track) {
    const dispose = shell.dispose; let cleared = false
    shell.dispose = () => { if (cleared) return; cleared = true; for (const proxy of registered) context.collision?.remove?.(proxy); registered.length = 0; dispose() }
  }
  if (!officeSampleRequested(context.search)) return shell
  const { THREE, root, layout, low } = context
  const hidden = [shell.walls, shell.innerGlass, shell.windows, shell.green].filter(Boolean)
  const oldFloor = shell.ground.material, oldFloorReceive = shell.ground.receiveShadow, meshes = [], materials = [], geometries = []
  const oldGreen = shell.green.material.color.clone()
  let disposed = false, paving, backdrop, practicals, foliage
  const restore = () => { hidden.forEach(mesh => { mesh.visible = true }); shell.ground.material = oldFloor; shell.ground.receiveShadow = oldFloorReceive; shell.green.material.color.copy(oldGreen) }
  const release = () => { foliage?.dispose(); practicals?.dispose(); backdrop?.dispose(); paving?.dispose(); for (const mesh of meshes) { mesh.removeFromParent(); mesh.dispose() } geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()) }
  try {
    const spec = officeShellFinishSpec(layout, shell.spec)
    const surfaces = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .7, metalness: .08 })
    const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .085, roughness: .12, depthWrite: false, side: THREE.FrontSide })
    const floor = new THREE.MeshStandardMaterial({ color: layout.variant==='align'?'#E9E2D5':'#E1C399', roughness: .74 })
    floor.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec2 officeStone;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nofficeStone = position.xz / 1.2;')
      const stone = layout.variant === 'align' ? officeStoneGrain('officeStone') : 'float vein = sin(officeStone.x * 24.0 + sin(officeStone.y * 9.0) * 2.0); diffuseColor.rgb *= 0.965 + 0.035 * smoothstep(-0.95, -0.5, vein);'
      shader.fragmentShader = 'varying vec2 officeStone;\n' + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + stone)
    }
    if (layout.variant === 'align') floor.customProgramCacheKey = () => 'office-vis2-ground-fine-stone-v1'
    materials.push(surfaces, glass, floor)
    const add = (name, entries, material) => {
      const geometry = new THREE.BoxGeometry(1, 1, 1); geometries.push(geometry)
      const mesh = new THREE.InstancedMesh(geometry, material, entries.length), matrix = new THREE.Matrix4()
      meshes.push(mesh)
      entries.forEach((p, i) => { matrix.makeScale(p.w, p.h, p.d).setPosition(p.x, p.y, p.z); mesh.setMatrixAt(i, matrix); if (p.color) mesh.setColorAt(i, new THREE.Color(p.color)) })
      mesh.instanceMatrix.needsUpdate = true; mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = false
      mesh.userData.dynamic = true; root.add(mesh); return mesh
    }
    const shadowLod = layout.variant === 'align' && !low
    const sourceIndices = spec.solid.map((_, i) => i)
    if (shadowLod) sourceIndices.sort((a, b) => Number(contactShadowOnly.has(spec.solid[a].kind)) - Number(contactShadowOnly.has(spec.solid[b].kind)))
    const frames = add('office-aligned-frames-and-inlays', sourceIndices.map(i => spec.solid[i]), surfaces)
    // 复用现有太阳阴影；低档与旧布局维持原开销，不新增灯光。
    if (shadowLod) {
      frames.castShadow = frames.receiveShadow = shell.ground.receiveShadow = true
      const total = frames.count, casters = sourceIndices.filter(i => !contactShadowOnly.has(spec.solid[i].kind)).length
      const geometry = frames.geometry, fullIndices = Array.from(geometry.index.array), indices = fullIndices.slice(), fullCount = fullIndices.length
      // BoxGeometry的六组面顺序由测试锁定；八个方向组合预存，阴影回调不分配GPU资源。
      for (let mask = 0; mask < 8; mask++) for (let axis = 0; axis < 3; axis++) {
        const face = axis * 2 + (mask & (1 << axis) ? 0 : 1)
        indices.push(...fullIndices.slice(face * 6, face * 6 + 6))
      }
      geometry.setIndex(indices); geometry.setDrawRange(0, fullCount)
      frames.computeBoundingSphere()
      const direction = new THREE.Vector3(), inverse = new THREE.Matrix4()
      const restoreDraw = () => { frames.count = total; geometry.setDrawRange(0, fullCount) }
      frames.onBeforeShadow = (_renderer, _object, _camera, shadowCamera, _geometry, depthMaterial) => {
        frames.count = casters; geometry.setDrawRange(0, fullCount)
        if (shadowCamera.isOrthographicCamera && (depthMaterial.side === THREE.FrontSide || depthMaterial.side === THREE.BackSide)) {
          shadowCamera.getWorldDirection(direction).transformDirection(inverse.copy(frames.matrixWorld).invert())
          let mask = (direction.x >= 0 ? 1 : 0) | (direction.y >= 0 ? 2 : 0) | (direction.z >= 0 ? 4 : 0)
          if (depthMaterial.side === THREE.FrontSide) mask ^= 7
          geometry.setDrawRange(fullCount + mask * 18, 18)
        }
      }
      // 普通材质、GTAO及被中断后的下一次可见绘制都必须恢复完整构件。
      frames.onAfterShadow = restoreDraw; frames.onBeforeRender = restoreDraw
      frames.userData.officeShadow = { sourceIndices, total, casters, fullIndexCount: fullCount, shadowIndexCount: 18 }
    }
    if (!low) add('office-aligned-clear-glass', spec.panes, glass)
    const batch = createSampleBatch(THREE), leafBatch = layout.variant === 'align' && !low ? createSampleBatch(THREE) : batch
    appendOfficePlazaPaving({ THREE, batch, layout, low })
    appendWholeFloorGarden({ THREE, batch, leafBatch, spec: spec.wholeFloor, low })
    paving = batch.build(root, 'office-aligned-plaza-paving'); paving.mesh.userData.dynamic = true
    if (layout.variant === 'align') paving.mesh.material.userData.officeFineStone = true
    if (leafBatch !== batch) {
      foliage = leafBatch.build(root, 'office-whole-floor-foliage')
      foliage.mesh.material.side = THREE.DoubleSide
      // 旧合并器不按材质side区分；该私有批次不能与单面陈设误合并。
      foliage.mesh.userData.dynamic = true
    }
    if (layout.variant === 'align') {
      const lights = createSampleBatch(THREE)
      for (const p of spec.wholeFloor.practicals.globes) lights.add(new THREE.SphereGeometry(p.radius,low?8:12,low?6:8),'#F4F1EA',[p.x,p.y,p.z],0,.45)
      // 发光面仅表现灯罩与灯槽，不伪称增加了照明，也不添加场景灯光或泛光。
      for (const p of spec.solid.filter(p=>p.kind==='light-recess')) lights.add(new THREE.BoxGeometry(p.w,.004,p.d),'#F4F1EA',[p.x,p.y-p.h/2-.007,p.z],0,.45)
      practicals = lights.build(root,'office-warm-practical-diffusers')
      practicals.mesh.material.emissive.set('#FFE8C4'); practicals.mesh.material.emissiveIntensity = .45
      practicals.mesh.castShadow = practicals.mesh.receiveShadow = false
      practicals.mesh.userData.dynamic = true
    }
    shell.green.material.color.set('#4D6A46')
    hidden.forEach(mesh => { mesh.visible = false }); shell.ground.material = floor
    if (layout.variant === 'align' && context.scene) backdrop = buildOfficeBackdropTrees(context)
    return { ...shell, finishSpec: spec, ...(backdrop?.summary().enabled ? { backdrop, onFrame(dt,frame) { shell.onFrame(dt,frame); backdrop.sync() } } : {}), dispose() { if (disposed) return; disposed = true; restore(); release(); shell.dispose() } }
  } catch (error) {
    restore(); release(); console.warn('[office-shell-finish] 保留原外壳：', error.message)
    return shell
  }
}
