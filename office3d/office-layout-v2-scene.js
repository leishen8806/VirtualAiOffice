import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'

// O3 只搭建候选外壳；人物、工位和路径由后续卡接管。
const rect = (name, x0, x1, z0, z1, kind = 'wall', extra = {}) => Object.freeze({ name, x0, x1, z0, z1, kind, dynamic: false, offset: kind === 'thin' ? .12 : 0, ...extra })

const wallSegments = (room) => {
  const result = []
  for (const side of ['north', 'south', 'west', 'east']) {
    const vertical = side === 'west' || side === 'east'
    const lo = vertical ? room.z0 : room.x0, hi = vertical ? room.z1 : room.x1
    const holes = (room.doors || []).filter((door) => door.side === side).map((door) => ({ lo: door.at - door.width / 2, hi: door.at + door.width / 2 })).sort((a, b) => a.lo - b.lo)
    let start = lo
    for (const hole of holes) { if (hole.lo > start) result.push({ side, lo: start, hi: hole.lo }); start = Math.max(start, hole.hi) }
    if (start < hi) result.push({ side, lo: start, hi })
  }
  return result
}

export function buildOfficeShellV2Spec(layout) {
  const { envelope, regions, doors } = layout
  const parts = [
    rect('office2-floor', envelope.x0, envelope.x1, envelope.z0, envelope.z1, 'floor'),
    rect('office2-south-west', envelope.x0, doors.south.x0, envelope.z1 - .22, envelope.z1),
    rect('office2-south-east', doors.south.x1, envelope.x1, envelope.z1 - .22, envelope.z1),
    rect('office2-north-west', envelope.x0, doors.north.x0, envelope.z0, envelope.z0 + .22),
    rect('office2-north-east', doors.north.x1, envelope.x1, envelope.z0, envelope.z0 + .22),
    rect('office2-west', envelope.x0, envelope.x0 + .22, envelope.z0, envelope.z1),
    rect('office2-east', envelope.x1 - .22, envelope.x1, envelope.z0, envelope.z1),
    rect('office2-north-locked-door', doors.north.x0, doors.north.x1, envelope.z0, envelope.z0 + .14, 'glass', { locked: true }),
    rect('office2-south-door-frame', doors.south.x0, doors.south.x1, envelope.z1 - .08, envelope.z1 + .08, 'thin'),
    rect('office2-north-door-frame', doors.north.x0, doors.north.x1, envelope.z0 - .08, envelope.z0 + .08, 'thin'),
  ]
  for (const room of regions) {
    for (const segment of wallSegments(room)) {
      const vertical = segment.side === 'west' || segment.side === 'east'
      parts.push(vertical
        ? rect(`office2-${room.id}-${segment.side}-${segment.lo}`, segment.side === 'west' ? room.x0 : room.x1 - .14, segment.side === 'west' ? room.x0 + .14 : room.x1, segment.lo, segment.hi, 'glass')
        : rect(`office2-${room.id}-${segment.side}-${segment.lo}`, segment.lo, segment.hi, segment.side === 'north' ? room.z0 : room.z1 - .14, segment.side === 'north' ? room.z0 + .14 : room.z1, 'glass'))
    }
    parts.push(rect(`office2-${room.id}-label`, room.x0 + .12, room.x1 - .12, room.z0 + .12, room.z0 + .14, 'thin', { label: room.name }))
  }
  return Object.freeze(parts)
}

const makeBoxes = (THREE, root, parts, material, y, h, name, labels = [], colorFor = null) => {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, parts.length)
  const matrix = new THREE.Matrix4()
  const atlas = new Float32Array(parts.length * 2)
  parts.forEach((part, index) => {
    const labelIndex = labels.indexOf(part.label) + 1
    if (labelIndex) matrix.makeScale(part.x1 - part.x0, .72, .04).setPosition((part.x0 + part.x1) / 2, 1.44, part.z0 + .16)
    else matrix.makeScale(part.x1 - part.x0, h, part.z1 - part.z0).setPosition((part.x0 + part.x1) / 2, y, (part.z0 + part.z1) / 2)
    mesh.setMatrixAt(index, matrix)
    if (colorFor) mesh.setColorAt(index, new THREE.Color(colorFor(part)))
    atlas[index * 2] = 1 / (labels.length + 1); atlas[index * 2 + 1] = labelIndex / (labels.length + 1)
  })
  if (labels.length) mesh.geometry.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(atlas, 2))
  mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = false; root.add(mesh)
  return mesh
}

const labelAtlas = (canvasTex, parts) => {
  const labels = parts.map((part) => part.label)
  const texture = canvasTex(1024, 1024, (ctx, width, height) => {
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height)
    const step = height / (labels.length + 1)
    ctx.font = '700 36px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    labels.forEach((label, index) => {
      const y = step * (index + 1)
      ctx.fillStyle = THEME.nameplate; ctx.fillRect(8, y + 8, width - 16, step - 16)
      ctx.strokeStyle = THEME.trim; ctx.lineWidth = 4; ctx.strokeRect(8, y + 8, width - 16, step - 16)
      ctx.fillStyle = THEME.nameplateText; ctx.fillText(`${label}${/市场|服务|售后|营销/.test(label) ? ' · 展示部门 · 模拟角色' : ''}`, width / 2, y + step / 2)
    })
  })
  texture.flipY = false
  return { texture, labels }
}

export function buildOfficeShellV2({ THREE, scene, layout, materials, collision, canvasTex, low = false }) {
  const spec = buildOfficeShellV2Spec(layout)
  const root = new THREE.Group(); root.name = 'office-layout-v2-shell'; scene.add(root)
  const labelParts = spec.filter((part) => part.label)
  const atlas = low ? null : labelAtlas(canvasTex, labelParts)
  const opaque = new THREE.MeshStandardMaterial({ color: 0xffffff, map: atlas?.texture || null, roughness: THEME.wallRoughness, metalness: .02 })
  if (atlas) opaque.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute vec2 instanceAtlas; varying vec2 vOfficeAtlasUv;\n${shader.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvOfficeAtlasUv = vec2(vMapUv.x, vMapUv.y * instanceAtlas.x + instanceAtlas.y);')
    shader.fragmentShader = `varying vec2 vOfficeAtlasUv;\n${shader.fragmentShader}`.replace('#include <map_fragment>', '#ifdef USE_MAP\n\tvec4 sampledDiffuseColor = texture2D( map, vOfficeAtlasUv );\n\tdiffuseColor *= sampledDiffuseColor;\n#endif')
  }
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: THEME.glassOpacity, roughness: THEME.glassRoughness, depthWrite: false })
  const opaqueParts = spec.filter((part) => ['floor', 'wall'].includes(part.kind) || part.label)
  const glassParts = spec.filter((part) => part.kind === 'glass')
  makeBoxes(THREE, root, opaqueParts, opaque, .03, .06, 'office2-opaque-batch', atlas?.labels, part => part.label ? '#FFFFFF' : part.kind === 'floor' ? THEME.floor : THEME.exteriorWall)
  if (!low) makeBoxes(THREE, root, [...glassParts, ...spec.filter((part) => part.kind === 'thin' && !part.label)], glass, 1.1, 2.2, 'office2-glass-batch', [], part => part.kind === 'thin' ? THEME.trim : THEME.glass)

  // 碰撞留在不可见的代理网格，避免为碰撞牺牲合并后的绘制预算。
  for (const part of [...opaqueParts.filter((item) => item.kind === 'wall'), ...glassParts.filter((item) => item.locked)]) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(part.x1 - part.x0, 2.8, part.z1 - part.z0), opaque)
    proxy.name = `${part.name}-collision`; proxy.position.set((part.x0 + part.x1) / 2, 1.4, (part.z0 + part.z1) / 2); proxy.visible = false; root.add(proxy); collision.add(proxy, 'officeWall')
  }
  return { root, spec, dispose() { atlas?.texture.dispose(); opaque.dispose(); glass.dispose() } }
}
