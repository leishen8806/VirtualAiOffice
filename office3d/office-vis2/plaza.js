import { buildOfficePlazaProps } from '../office-plaza-props.js'
import { officeLeafGeometry, appendOfficeGardenBed } from './plants.js'

export function plazaFlowerArcs(layout) {
  return [-1, 1].flatMap(side => [[17, 24], [27, 35]].map((range, index) => {
    const start = (side < 0 ? -range[1] : range[0]) * Math.PI / 180, span = (range[1] - range[0]) * Math.PI / 180
    const corners = [start, start + span].flatMap(a => [11.05, 11.55].map(r => ({ x: layout.plaza.center.x + Math.sin(a) * r, z: layout.plaza.center.z + Math.cos(a) * r })))
    return { id: `plaza-arc-${side}-${index}`, side, start, span, bounds: { x0: Math.min(...corners.map(p => p.x)), x1: Math.max(...corners.map(p => p.x)), z0: Math.min(...corners.map(p => p.z)), z1: Math.max(...corners.map(p => p.z)) } }
  }))
}

// 复用已登记构件并输出占地；宿主沿用既有注册口，不改共享碰撞或导航逻辑。
export function appendOfficePlaza({ THREE, batch, layout, low = false }) {
  const p = layout.plaza, placements = [], prototypes = new Map()
  const box = (x, y, z, w, h, d, color, grain = '') => batch.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], 0, .78, 0, grain)
  const add = (category, kind, id, point, yaw = 0, scale = [1, 1, 1], offset = [0, 0]) => {
    const triangleStart = batch.triangles()
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
      geometry.computeBoundingBox(); bounds.union(geometry.boundingBox)
      if (layout.variant === 'align' && category === 'vendors' && kind === 'awning-cart') {
        const p = geometry.attributes.position, n = geometry.attributes.normal, surface = new Float32Array(p.count * 3)
        for (let i = 0; i < p.count; i++) surface.set([.78, 0, p.getY(i) > 2.2 && n.getY(i) > .5 ? 4 : 0], i * 3)
        geometry.setAttribute('sampleSurface', new THREE.BufferAttribute(surface, 3))
      }
      if(layout.variant==='align' && category==='trees' && mesh.name.endsWith('-leaf')) {
        const b=geometry.boundingBox,center=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),count=low?40:144
        for(let i=0;i<count;i++){
          const a=i*2.399,v=1-2*(i+.5)/count,r=Math.sqrt(1-v*v),length=Math.min(size.x,size.z)*.3
          const leaf=officeLeafGeometry(THREE,a+Math.PI,length,3);leaf.scale(1,.6,1)
          batch.add(leaf,i%5?'#476641':'#7A8C53',[center.x+Math.sin(a)*r*size.x*.4,center.y+v*size.y*.32-.08,center.z+Math.cos(a)*r*size.z*.4],0,.88)
        }
        geometry.dispose();continue
      }
      const treeTint = category === 'trees' ? (mesh.name.endsWith('-leaf') ? '#4F7043' : '#71614B') : null
      batch.add(geometry, treeTint, [0, 0, 0], 0, mesh.material.roughness, mesh.material.metalness)
    }
    placements.push({ id, kind: category, source: { x: point.x, z: point.z }, x: point.x + offset[0], z: point.z + offset[1], yaw, scale, triangles: batch.triangles() - triangleStart, bounds: { x0: bounds.min.x, x1: bounds.max.x, z0: bounds.min.z, z1: bounds.max.z, y0: bounds.min.y, y1: bounds.max.y }, interaction: 'preview-only' })
  }
  try {
    for (const point of p.carts) {
      add('vendors', 'awning-cart', point.id, point, Math.PI / 2, [.72, 1, .72])
      box(point.x + .565, 1, point.z, .02, .86, 2.14, '#C9A57A', 'wood')
      for (let i = 0; i < 12; i++) box(point.x + .581, 1, point.z - .99 + i * .18, .015, .78, .022, '#B89B64')
      if (layout.variant === 'align') {
        box(point.x, 1.95, point.z - .5, .34, .4, .42, '#26333A')
        box(point.x + .173, 1.95, point.z - .5, .006, .16, .21, '#9A968E')
        for (const z of [.42, .68]) batch.add(new THREE.CylinderGeometry(.065, .055, .14, low ? 6 : 10), '#F4F1EA', [point.x + .12, 1.82, point.z + z], 0, .4)
      }
    }
    for (const point of p.kiosks) {
      add('vendors', 'square-kiosk', point.id, point, Math.PI / 2, [.72, 1, .72])
      for (const dz of [-.8, .8]) box(point.x - .94, 1.43, point.z + dz, .07, 1.14, .07, '#C9A57A', 'wood')
      for (const y of [1.16, 1.69]) box(point.x - .96, y, point.z, .035, .05, 1.51, '#C9A57A', 'wood')
      for (let i = 0; i < 5; i++) box(point.x - .95, 1.83, point.z - .53 + i * .26, .045, .23, .15, i % 2 ? '#B7C2B4' : '#D9D3C6')
      box(point.x - .96, 2.08, point.z, .035, .035, 1.55, '#B89B64')
      if (layout.variant === 'align') {
        box(point.x - 1.05, 1.35, point.z, .25, .36, .32, '#26333A')
        for (const z of [-.5, .5]) batch.add(new THREE.CylinderGeometry(.055, .05, .14, low ? 6 : 10), '#F4F1EA', [point.x - 1.08, 1.24, point.z + z], 0, .4)
      }
    }
    p.umbrellaTables.forEach((point, i) => add('cafe', '', `plaza-cafe-${i + 1}`, point, 0, [.85, 1, .85]))
    if(layout.variant==='align')for(const side of [-1,1])for(const z of [17.5,24.5]){
      const x=p.center.x+side*22,id=`plaza-layered-garden-${side}-${z}`,w=5.2,d=4.8
      appendOfficeGardenBed({THREE,batch,low,bed:{x,z,w,d},seed:side+z,organic:true})
      placements.push({id,kind:'garden',x,z,source:{x,z},bounds:{x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y0:0,y1:1.6},interaction:'preview-only'})
    }
    // 既定点位的长椅会穿入伞桌、花箱或亭体，预览移至边缘；明确输出原/新坐标供 Trae 审核。
    p.benches.forEach((point, i) => {
      const side = point.x < p.center.x ? -1 : 1
      const shift = point.z < p.center.z ? -side * 2.5 : side * 2
      const yaw = point.z > p.center.z && point.z < p.center.z + 5 ? -side * Math.PI / 2 : point.z > p.center.z ? Math.PI : 0
      add('benches', '', `plaza-bench-${i + 1}`, point, yaw, [.72, 1, .72], [shift, 0])
    })
    // 杆灯与伞面有冲突的点位暂不实例化，保留南侧两盏，避免穿过伞盖。
    p.lamps.filter(point => point.z >= p.center.z + p.radius).forEach((point, i) => add('lamps', '', `plaza-lamp-${i + 1}`, point, 0, [1, 1, 1], [0, .5]))
    p.flowerBands.filter(point => point.z > p.center.z).forEach((point, i) => {
      box(point.x, .28, point.z, 3.02, .34, .82, '#D9D3C6', 'stone')
      box(point.x, .46, point.z, 2.88, .025, .68, '#534A3C')
      for (let j = 0; j < (low ? 12 : 24); j++) {
        const x = point.x - 1.25 + (j % (low ? 4 : 8)) * (low ? .83 : .35), z = point.z - .23 + Math.floor(j / (low ? 4 : 8)) * .23
        for (let k = 0; k < (low ? 3 : 5); k++) {
          const leaf = new THREE.IcosahedronGeometry(.14, 0); leaf.scale(.4, 1.6, .25); leaf.rotateZ(.65); leaf.rotateY(k * 2.399)
          batch.add(leaf, k % 3 ? '#3E5A4E' : '#648B50', [x, .62, z], 0, .9)
        }
        if (j % 2) batch.add(new THREE.IcosahedronGeometry(.045, 0), j % 3 ? '#BD8C94' : '#E6CD92', [x, .79, z], 0, .95)
      }
      placements.push({ id: `plaza-flowers-${i + 1}`, kind: 'flowers', source: { ...point }, ...point, bounds: { x0: point.x - 1.51, x1: point.x + 1.51, z0: point.z - .41, z1: point.z + .41, y0: .11, y1: .84 }, interaction: 'preview-only' })
    })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) add('trees', 'broadleaf-layered', `plaza-tree-${side}-${i}`, { x: p.center.x + side * 16, z: p.center.z - 6 + i * 4 }, 0, [.65, .85, .65])
      for (const arc of plazaFlowerArcs(layout).filter(arc => arc.side === side)) {
        const bounds = new THREE.Box3(), triangleStart = batch.triangles()
        const put = (geometry, color, position, grain = '') => {
          geometry.translate(...position); geometry.computeBoundingBox(); bounds.union(geometry.boundingBox)
          batch.add(geometry, color, [0, 0, 0], 0, .9, 0, grain)
        }
        const { start, span } = arc
        // 前沿四段花境留出原有 4m 中轴，以及花箱和杆灯之间的通道。
        const shape = new THREE.Shape(), segments = low ? 4 : 8
        for (let i = 0; i <= segments; i++) { const a = start + span * i / segments; const x = Math.sin(a) * 11.55, z = Math.cos(a) * 11.55; if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z) }
        for (let i = segments; i >= 0; i--) { const a = start + span * i / segments; shape.lineTo(Math.sin(a) * 11.05, -Math.cos(a) * 11.05) }
        shape.closePath()
        const rim = new THREE.ExtrudeGeometry(shape, { depth: .24, bevelEnabled: false, steps: 1 }); rim.rotateX(-Math.PI / 2)
        put(rim, '#CDB78F', [p.center.x, .11, p.center.z], 'stone')
        const count = low ? 6 : 12
        for (let i = 0; i < count; i++) {
          const a = start + span * (.1 + .8 * (i % (count / 2)) / (count / 2 - 1)), r = i < count / 2 ? 11.22 : 11.39
          const x = p.center.x + Math.sin(a) * r, z = p.center.z + Math.cos(a) * r
          for (let j = 0; j < (low ? 3 : 5); j++) {
            const leaf = new THREE.IcosahedronGeometry(.10, 0); leaf.scale(.45, 1.7, .25); leaf.rotateZ(.7); leaf.rotateY(j * 2.399)
            put(leaf, j % 2 ? '#3E5A4E' : '#648B50', [x, .48, z])
          }
          put(new THREE.IcosahedronGeometry(.045, 0), i % 3 ? '#BD8C94' : '#E6CD92', [x, .63, z])
        }
        placements.push({ id: arc.id, kind: 'flower-arc', x: (bounds.min.x + bounds.max.x) / 2, z: (bounds.min.z + bounds.max.z) / 2,
          triangles: batch.triangles() - triangleStart, bounds: { x0: bounds.min.x, x1: bounds.max.x, z0: bounds.min.z, z1: bounds.max.z, y0: bounds.min.y, y1: bounds.max.y }, interaction: 'preview-only' })
      }
    }
  } finally { prototypes.forEach(source => source.dispose()) }
  return placements
}
