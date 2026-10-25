import { buildOfficePlazaProps } from '../office-plaza-props.js'
import { officeLeafGeometry, appendOfficeGardenBed } from './plants.js'

export function plazaFlowerArcs(layout) {
  const ranges = layout.variant === 'align' ? [[12, 24], [27, 35]] : [[17, 24], [27, 35]]
  return [-1, 1].flatMap(side => ranges.map((range, index) => {
    const start = (side < 0 ? -range[1] : range[0]) * Math.PI / 180, span = (range[1] - range[0]) * Math.PI / 180
    const corners = [start, start + span].flatMap(a => [11.05, 11.55].map(r => ({ x: layout.plaza.center.x + Math.sin(a) * r, z: layout.plaza.center.z + Math.cos(a) * r })))
    return { id: `plaza-arc-${side}-${index}`, side, start, span, bounds: { x0: Math.min(...corners.map(p => p.x)), x1: Math.max(...corners.map(p => p.x)), z0: Math.min(...corners.map(p => p.z)), z1: Math.max(...corners.map(p => p.z)) } }
  }))
}

// 复用已登记构件并输出占地；宿主沿用既有注册口，不改共享碰撞或导航逻辑。
export function appendOfficePlaza({ THREE, batch, leafBatch = batch, layout, low = false }) {
  const p = layout.plaza, placements = [], prototypes = new Map()
  const angle = 40 * Math.PI / 180
  const flank = (side, along, away = 0) => ({ x: p.center.x + side * (11.7 + Math.sin(angle) * along + Math.cos(angle) * away), z: 17.6 + Math.cos(angle) * along - Math.sin(angle) * away })
  let transform = null
  const emit = (geometry, color, position = [0, 0, 0], yaw = 0, ...surface) => {
    const target = geometry.userData.officeLeafOutline ? leafBatch : batch
    if (!transform) return target.add(geometry, color, position, yaw, ...surface)
    geometry.rotateY(yaw); geometry.translate(...position)
    geometry.computeBoundingBox(); transform.sourceBounds.union(geometry.boundingBox)
    // 条纹和木纹随摊位一起转，不能在旋转后的世界坐标上重新投影。
    if (!geometry.attributes.sampleUv) {
      const p = geometry.attributes.position, n = geometry.attributes.normal, uv = new Float32Array(p.count * 2)
      for (let i = 0; i < p.count; i++) { const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i)); uv.set([(x > y && x > z ? p.getZ(i) : p.getX(i)) / 1.2, (y > x && y > z ? p.getZ(i) : p.getY(i)) / 1.2], i * 2) }
      geometry.setAttribute('sampleUv', new THREE.BufferAttribute(uv, 2))
    }
    geometry.translate(-transform.source.x, 0, -transform.source.z); geometry.rotateY(transform.delta); geometry.translate(transform.x, 0, transform.z)
    geometry.computeBoundingBox(); transform.bounds.union(geometry.boundingBox)
    target.add(geometry, color, [0, 0, 0], 0, ...surface)
  }
  const atPose = (point, pose, draw) => {
    transform = { source: point, ...pose, bounds: new THREE.Box3(), sourceBounds: new THREE.Box3() }
    try {
      draw()
      const item = placements.at(-1), b = transform.bounds
      Object.assign(item, { x: transform.x, z: transform.z, yaw: (item.yaw || 0) + transform.delta, bounds: { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, y0: b.min.y, y1: b.max.y } })
      if (item.kind === 'vendors') {
        const s = transform.sourceBounds, c = Math.cos(transform.delta), a = Math.sin(transform.delta)
        item.footprint = [[s.min.x,s.min.z],[s.max.x,s.min.z],[s.max.x,s.max.z],[s.min.x,s.max.z]].map(([x,z]) => ({ x:transform.x+c*(x-point.x)+a*(z-point.z), z:transform.z-a*(x-point.x)+c*(z-point.z) }))
        Object.assign(item.bounds, { x0:Math.min(...item.footprint.map(p=>p.x)), x1:Math.max(...item.footprint.map(p=>p.x)), z0:Math.min(...item.footprint.map(p=>p.z)), z1:Math.max(...item.footprint.map(p=>p.z)) })
      }
    } finally { transform = null }
  }
  const atVendor = (point, draw) => {
    if (layout.variant !== 'align') return draw()
    const side = point.x < p.center.x ? -1 : 1, along = (point.z - p.center.z + 3) / 3 * 3.6
    return atPose(point, { ...flank(side, along), delta: side * angle }, draw)
  }
  const box = (x, y, z, w, h, d, color, grain = '') => emit(new THREE.BoxGeometry(w, h, d), color, [x, y, z], 0, .78, 0, grain)
  const flowerLeaf = (angle, arc) => {
    if (layout.variant !== 'align') {
      const leaf = new THREE.IcosahedronGeometry(arc ? .10 : .14, 0)
      leaf.scale(arc ? .45 : .4, arc ? 1.7 : 1.6, .25); leaf.rotateZ(arc ? .7 : .65); leaf.rotateY(angle)
      return leaf
    }
    const leaf = officeLeafGeometry(THREE, angle, arc ? .20 : .25, low ? 2 : 5, leafBatch !== batch)
    leaf.scale(.65, .45, .65)
    return leaf
  }
  const flowerPlanter = (x, y, z, w, h, d, color, soil = false) => {
    if (layout.variant !== 'align') return box(x, y, z, w, h, d, color, soil ? '' : 'stone')
    const shape = new THREE.Shape(), r = Math.min(.20, d / 3), a = w / 2 - r, b = d / 2 - r
    shape.absarc(a, b, r, 0, Math.PI / 2, false); shape.absarc(-a, b, r, Math.PI / 2, Math.PI, false)
    shape.absarc(-a, -b, r, Math.PI, Math.PI * 1.5, false); shape.absarc(a, -b, r, Math.PI * 1.5, Math.PI * 2, false); shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, steps: 1, curveSegments: low ? 2 : 4, bevelEnabled: false })
    geometry.rotateX(-Math.PI / 2); emit(geometry, color, [x, y - h / 2, z], 0, .78, 0, soil ? '' : 'stone')
  }
  const add = (category, kind, id, point, yaw = 0, scale = [1, 1, 1], offset = [0, 0]) => {
    const triangles = () => batch.triangles() + (leafBatch === batch ? 0 : leafBatch.triangles()), triangleStart = triangles()
    const key = category + kind
    if (!prototypes.has(key)) prototypes.set(key, buildOfficePlazaProps({ THREE, low, root: new THREE.Group(), placements: { [category]: [{ id: key, kind, x: 0, z: 0, yaw: 0 }] } }))
    const source = prototypes.get(key), bounds = new THREE.Box3()
    for (const mesh of source.root.children) for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      const geometry = mesh.geometry.clone()
      if (mesh.isInstancedMesh) {
        const matrix = new THREE.Matrix4(), color = new THREE.Color()
        mesh.getMatrixAt(instance, matrix); mesh.getColorAt(instance, color); geometry.applyMatrix4(matrix)
        const colors = new Float32Array(geometry.attributes.position.count * 3)
        for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      // 原共享伞盖为向上开口的锥面，私有副本翻正，保持原杆、桌与椅不变。
      if (category === 'cafe' && mesh.name.endsWith('-accent')) geometry.translate(0, -3.15, 0).rotateX(Math.PI).translate(0, 3.15, 0)
      geometry.scale(...scale); geometry.rotateY(yaw); geometry.translate(point.x + offset[0], .11, point.z + offset[1])
      geometry.computeBoundingBox(); if (!transform) bounds.union(geometry.boundingBox)
      if (layout.variant === 'align' && category === 'vendors' && kind === 'awning-cart') {
        const p = geometry.attributes.position, n = geometry.attributes.normal, surface = new Float32Array(p.count * 3)
        for (let i = 0; i < p.count; i++) surface.set([.78, 0, p.getY(i) > 2.2 && n.getY(i) > .5 ? 4 : 0], i * 3)
        geometry.setAttribute('sampleSurface', new THREE.BufferAttribute(surface, 3))
      }
      if(layout.variant==='align' && category==='trees' && mesh.name.endsWith('-leaf')) {
        const b=geometry.boundingBox,center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),count=low?76:264
        // 叶片错开倾角，去掉整齐向心的针叶层；用省下的叶面预算补真实分枝。
        for(let i=0;i<(low?1:3);i++){
          const a=i*2.399,end=new THREE.Vector3(center.x+Math.sin(a)*size.x*.18,center.y-.06,center.z+Math.cos(a)*size.z*.18)
          const start=new THREE.Vector3(point.x+offset[0],.11+2.35*scale[1],point.z+offset[1]),direction=end.clone().sub(start)
          const branch=new THREE.CylinderGeometry(.025,.045,direction.length(),low?3:4)
          branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize()))
          emit(branch,'#71614B',start.add(end).multiplyScalar(.5).toArray(),0,.88)
        }
        for(let i=0;i<count;i++){
          const a=i*2.399+point.x*.37,v=1-2*(i+.5)/count,r=Math.sqrt(1-v*v)
          const leaf=officeLeafGeometry(THREE,0,.28,2,leafBatch!==batch)
          leaf.scale(1,.25,1);leaf.rotateZ(Math.sin(i*1.7)*.6);leaf.rotateX(Math.sin(i*1.1)*.75+.2);leaf.rotateY(a+i*1.13)
          emit(leaf,i%5?'#476641':'#7A8C53',[center.x+Math.sin(a)*r*size.x*.31,center.y+v*size.y*.32-.06,center.z+Math.cos(a)*r*size.z*.31],0,.88)
        }
        geometry.dispose();continue
      }
      const treeTint = category === 'trees' ? (mesh.name.endsWith('-leaf') ? '#4F7043' : '#71614B') : null
      emit(geometry, treeTint, [0, 0, 0], 0, mesh.material.roughness, mesh.material.metalness)
    }
    placements.push({ id, kind: category, source: { x: point.x, z: point.z }, x: point.x + offset[0], z: point.z + offset[1], yaw, scale, triangles: triangles() - triangleStart, bounds: { x0: bounds.min.x, x1: bounds.max.x, z0: bounds.min.z, z1: bounds.max.z, y0: bounds.min.y, y1: bounds.max.y }, interaction: 'preview-only' })
  }
  try {
    for (const point of p.carts) atVendor(point, () => {
      add('vendors', 'awning-cart', point.id, point, Math.PI / 2, [.72, 1, .72])
      box(point.x + .565, 1, point.z, .02, .86, 2.14, '#C9A57A', 'wood')
      for (let i = 0; i < 12; i++) box(point.x + .581, 1, point.z - .99 + i * .18, .015, .78, .022, '#B89B64')
      if (layout.variant === 'align') {
        box(point.x, 1.95, point.z - .5, .34, .4, .42, '#26333A')
        box(point.x + .173, 1.95, point.z - .5, .006, .16, .21, '#9A968E')
        for (const z of [.42, .68]) emit(new THREE.CylinderGeometry(.065, .055, .14, low ? 6 : 10), '#F4F1EA', [point.x + .12, 1.82, point.z + z], 0, .4)
      }
    })
    for (const point of p.kiosks) atVendor(point, () => {
      add('vendors', 'square-kiosk', point.id, point, Math.PI / 2, [.72, 1, .72])
      for (const dz of [-.8, .8]) box(point.x - .94, 1.43, point.z + dz, .07, 1.14, .07, '#C9A57A', 'wood')
      for (const y of [1.16, 1.69]) box(point.x - .96, y, point.z, .035, .05, 1.51, '#C9A57A', 'wood')
      for (let i = 0; i < 5; i++) box(point.x - .95, 1.83, point.z - .53 + i * .26, .045, .23, .15, i % 2 ? '#B7C2B4' : '#D9D3C6')
      box(point.x - .96, 2.08, point.z, .035, .035, 1.55, '#B89B64')
      if (layout.variant === 'align') {
        box(point.x - 1.05, 1.35, point.z, .25, .36, .32, '#26333A')
        for (const z of [-.5, .5]) emit(new THREE.CylinderGeometry(.055, .05, .14, low ? 6 : 10), '#F4F1EA', [point.x - 1.08, 1.24, point.z + z], 0, .4)
      }
    })
    p.umbrellaTables.forEach((point, i) => add('cafe', '', `plaza-cafe-${i + 1}`, point, 0, [.85, 1, .85], [0, layout.variant === 'align' && point.z < p.center.z ? -1.3 : 0]))
    if(layout.variant==='align')for(const side of [-1,1])for(const z of [17.5,24.5]){
      const x=p.center.x+side*22,id=`plaza-layered-garden-${side}-${z}`,w=4.2,d=1.8
      atPose({x,z},{...flank(side,z===17.5?1.8:8.2,6.5),delta:side*(angle-Math.PI/2)},()=>{
        const gardenBatch = { add: emit }
        appendOfficeGardenBed({THREE,batch:gardenBatch,leafBatch:leafBatch===batch?gardenBatch:{add:emit},low,bed:{x,z,w,d},seed:side+z,organic:true})
        placements.push({id,kind:'garden',x,z,source:{x,z},bounds:{x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y0:0,y1:1.6},interaction:'preview-only'})
      })
    }
    // 既定点位的长椅会穿入伞桌、花箱或亭体，预览移至边缘；明确输出原/新坐标供 Trae 审核。
    p.benches.forEach((point, i) => {
      const side = point.x < p.center.x ? -1 : 1
      const shift = point.z < p.center.z ? -side * 2.5 : side * 2
      const yaw = point.z > p.center.z && point.z < p.center.z + 5 ? -side * Math.PI / 2 : point.z > p.center.z ? Math.PI : 0
      // 侧椅向外让出B0第四排队位的胶囊净距，保留四个槽位和镜像布局。
      const finalShift = layout.variant === 'align' && point.z > p.center.z && point.z < p.center.z + 5 ? -side * .65 : shift
      add('benches', '', `plaza-bench-${i + 1}`, point, yaw, [.72, 1, .72], [finalShift, 0])
    })
    // 杆灯与伞面有冲突的点位暂不实例化，保留南侧两盏，避免穿过伞盖。
    p.lamps.filter(point => point.z >= p.center.z + p.radius).forEach((point, i) => add('lamps', '', `plaza-lamp-${i + 1}`, point, 0, [1, 1, 1], [0, .5]))
    p.flowerBands.filter(point => point.z > p.center.z).forEach((point, i) => {
      flowerPlanter(point.x, .28, point.z, 3.02, .34, .82, '#D9D3C6')
      flowerPlanter(point.x, .46, point.z, 2.88, .025, .68, '#534A3C', true)
      for (let j = 0; j < (low ? 12 : 24); j++) {
        const x = point.x - 1.25 + (j % (low ? 4 : 8)) * (low ? .83 : .35), z = point.z - .23 + Math.floor(j / (low ? 4 : 8)) * .23
        for (let k = 0; k < (low ? 3 : 5); k++) {
          emit(flowerLeaf(k * 2.399, false), k % 3 ? '#3E5A4E' : '#648B50', [x, layout.variant === 'align' ? .49 + k % 3 * .065 : .62, z], 0, .9)
        }
        if (layout.variant === 'align') emit(new THREE.CylinderGeometry(.009, .013, .315, low ? 4 : 5, 1, true), '#526448', [x, .6325, z], 0, .9)
        if (j % 2) batch.add(new THREE.IcosahedronGeometry(.045, 0), j % 3 ? '#BD8C94' : '#E6CD92', [x, .79, z], 0, .95)
      }
      placements.push({ id: `plaza-flowers-${i + 1}`, kind: 'flowers', source: { ...point }, ...point, bounds: { x0: point.x - 1.51, x1: point.x + 1.51, z0: point.z - .41, z1: point.z + .41, y0: .11, y1: .84 }, interaction: 'preview-only' })
    })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const point = { x: p.center.x + side * 16, z: p.center.z - 6 + i * 4 }
        const draw = () => add('trees', 'broadleaf-layered', `plaza-tree-${side}-${i}`, point, 0, [.65, .85, .65])
        if (layout.variant === 'align') atPose(point, { ...flank(side, i * 3.6, 3.6), delta: side * angle }, draw)
        else draw()
      }
      for (const arc of plazaFlowerArcs(layout).filter(arc => arc.side === side)) {
        const bounds = new THREE.Box3(), triangleStart = batch.triangles()
        const put = (geometry, color, position, grain = '') => {
          geometry.translate(...position); geometry.computeBoundingBox(); bounds.union(geometry.boundingBox)
          emit(geometry, color, [0, 0, 0], 0, .9, 0, grain)
        }
        const { start, span } = arc
        // 前沿四段花境留出原有 4m 中轴，以及花箱和杆灯之间的通道。
        const segments = low ? 4 : 8
        const arcShape = (inner, outer, margin = 0) => {
          const shape = new THREE.Shape()
          for (let i = 0; i <= segments; i++) { const a = start + margin + (span - margin * 2) * i / segments; const x = Math.sin(a) * outer, z = Math.cos(a) * outer; if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z) }
          for (let i = segments; i >= 0; i--) { const a = start + margin + (span - margin * 2) * i / segments; shape.lineTo(Math.sin(a) * inner, -Math.cos(a) * inner) }
          shape.closePath(); return shape
        }
        const rim = new THREE.ExtrudeGeometry(arcShape(11.05, 11.55), { depth: .24, bevelEnabled: false, steps: 1 }); rim.rotateX(-Math.PI / 2)
        put(rim, '#CDB78F', [p.center.x, .11, p.center.z], 'stone')
        if (layout.variant === 'align') { const soil = new THREE.ShapeGeometry(arcShape(11.09, 11.51, .007)); soil.rotateX(-Math.PI / 2); put(soil, '#534A3C', [p.center.x, .3515, p.center.z]) }
        const count = layout.variant === 'align' && span > .18 ? (low ? 10 : 20) : (low ? 6 : 12)
        for (let i = 0; i < count; i++) {
          const a = start + span * (.1 + .8 * (i % (count / 2)) / (count / 2 - 1)), r = i < count / 2 ? 11.22 : 11.39
          const x = p.center.x + Math.sin(a) * r, z = p.center.z + Math.cos(a) * r
          for (let j = 0; j < (low ? 3 : 5); j++) {
            put(flowerLeaf(j * 2.399, true), j % 2 ? '#3E5A4E' : '#648B50', [x, layout.variant === 'align' ? .37 + j % 3 * .065 : .48, z])
          }
          if (layout.variant === 'align') put(new THREE.CylinderGeometry(.009, .013, .277, low ? 4 : 5, 1, true), '#526448', [x, .4915, z])
          put(new THREE.IcosahedronGeometry(.045, 0), i % 3 ? '#BD8C94' : '#E6CD92', [x, .63, z])
        }
        placements.push({ id: arc.id, kind: 'flower-arc', x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2,
          triangles: batch.triangles() - triangleStart, bounds: { x0: bounds.min.x, x1: bounds.max.x, z0: bounds.min.z, z1: bounds.max.z, y0: bounds.min.y, y1: bounds.max.y }, interaction: 'preview-only' })
      }
    }
  } finally { prototypes.forEach(source => source.dispose()) }
  return placements
}
