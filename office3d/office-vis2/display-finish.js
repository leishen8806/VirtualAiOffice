import { buildDisplayDepartments } from '../display-departments.js'
import { displayBatch } from '../display-staff-mesh.js'
import { DISPLAY_DEPARTMENTS, displayRoster } from '../display-staff-logic.js'
import { officeSampleRequested } from './host.js'
import { officeLeafGeometry } from './plants.js'
import { facingSample, marketSamplePlan } from './furniture-sample.js'
import { appendMarketWorkIsland } from './market-work-island.js'

export function officeDisplayRoomSample(layout) {
  if(facingSample(layout))return marketSamplePlan(layout)
  const room = layout.regions.find(r => r.id === 'market')
  if (layout.variant !== 'align' || !room) return null
  const x=(room.x0+room.x1)/2,z=(room.z0+room.z1)/2-.2
  return { room:room.id, table:{id:'market-shared-table',x,z,w:5.6,d:1.1,height:.8},
    visitors:[-2,0,2].map((dx,i)=>({id:`market-visitor-${i+1}`,x:x+dx,z:z-1.1,w:.52,d:.54,height:.98,interactive:false})) }
}

// 保留原标签图集、身份、路线边界及释放契约；只替换已识别的静态陈设。
export function buildOfficeDisplayFinish(context) {
  const result = buildDisplayDepartments(context)
  if (context.layout?.variant !== 'align' || !officeSampleRequested(context.search)) return result
  const { THREE, layout, low = false, departments = DISPLAY_DEPARTMENTS } = context
  const mesh = result.root.children[0], original = mesh.geometry, pieces = [], parts = [], sampleParts=[]
  const rooms = departments.map(id => layout.regions.find(r => r.id === id))
  const people = displayRoster(layout).filter(p => departments.includes(p.department))
  const sample=departments.includes('market')?officeDisplayRoomSample(layout):null
  const vertical=sample?.kind==='facing-work-island',posedLayout=vertical?{...layout,marketSample:true}:layout
  const posedPeople=vertical?displayRoster(posedLayout).filter(p=>departments.includes(p.department)):people
  const boxes = rooms.flatMap(r => [
    [r.x1 - .55, .35, r.z0 + .65, .45, .65, .45],
    ...(!low ? [[r.x1 - .55, .95, r.z0 + .65, .55, .65, .5]] : []),
  ]).concat(people.flatMap(p => [
    [p.home.x, .47, p.home.z, .46, .1, .46],
    [p.home.x, .74, p.home.z + .23, .46, .48, .06],
    [p.home.x, .24, p.home.z, .08, .42, .08],
  ]))
  if(sample)for(const p of people.filter(p=>p.department===sample.room))boxes.push(
    [p.desk.x,.76,p.desk.z,1,.08,.56],
    ...[-.4,.4].map(dx=>[p.desk.x+dx,.37,p.desk.z,.06,.72,.45]))
  if(vertical)for(const p of people.filter(p=>p.department==='market'))boxes.push(
    [p.desk.x,1.04,p.desk.z-.08,.42,.35,.05],...(!low?[[p.desk.x,1.04,p.desk.z-.047,.36,.28,.012]]:[]))
  const pos = original.attributes.position, keep = []
  for (let i = 0; i < pos.count; i += 3) {
    const removed = boxes.some(([x, y, z, w, h, d]) => [i, i + 1, i + 2].every(j =>
      Math.abs(pos.getX(j) - x) <= w / 2 + 1e-5 && Math.abs(pos.getY(j) - y) <= h / 2 + 1e-5 && Math.abs(pos.getZ(j) - z) <= d / 2 + 1e-5))
    if (!removed) keep.push(i, i + 1, i + 2)
  }
  // 上游几何发生变化时保留原件，不能猜测并删除未知物件。
  if (original.index || pos.count - keep.length !== boxes.length * 36) return result
  let replacement,proxy
  const releaseProxy=()=>{if(!proxy)return;context.collision?.remove?.(proxy);proxy.removeFromParent();proxy.geometry.dispose();proxy.material.dispose();proxy=null}
  try {
    const retained = new THREE.BufferGeometry()
    for (const [key, attr] of Object.entries(original.attributes)) {
      const values = new Float32Array(keep.length * attr.itemSize)
      keep.forEach((old, i) => values.set(attr.array.subarray(old * attr.itemSize, (old + 1) * attr.itemSize), i * attr.itemSize))
      retained.setAttribute(key, new THREE.BufferAttribute(values, attr.itemSize))
    }
    pieces.push(retained)
    let pose=null
    const add = (source, color, x, y, z) => {
      const g = source.index ? source.toNonIndexed() : source
      if (source !== g) source.dispose()
      g.translate(x, y, z)
      if(pose)g.translate(-pose.x,0,-pose.z).rotateY(pose.yaw).translate(pose.x,0,pose.z)
      const c = color===null?null:new THREE.Color(color), count = g.attributes.position.count
      const colors = c?new Float32Array(count * 3):new Float32Array(g.attributes.color.array), uv = new Float32Array(count * 2).fill(.005)
      if(c)for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      pieces.push(g)
    }
    const box = (x, y, z, w, h, d, color) => add(new THREE.BoxGeometry(w, h, d), color, x, y, z)
    const cylinder = (x, y, z, r, h, color) => add(new THREE.CylinderGeometry(r, r, h, low ? 8 : 16), color, x, y, z)
    const part = (id, kind, draw, target=parts) => {
      const start = pieces.reduce((n, g) => n + g.attributes.position.count, 0)
      draw()
      target.push({ id, kind, start, count: pieces.reduce((n, g) => n + g.attributes.position.count, 0) - start })
    }
    for (const r of rooms) part(r.id, 'plant', () => {
      const x = r.x1 - .55, z = r.z0 + .65
      add(new THREE.CylinderGeometry(.225, .20, .65, low ? 8 : 16, 1, true), '#D9D3C6', x, .35, z)
      cylinder(x, .03, z, .20, .01, '#D9D3C6')
      cylinder(x, .669, z, .20, .01, '#534A3C')
      if (low) return
      for (let i = 0; i < 10; i++) {
        const angle = i * 2.399, y = .73 + (i % 4) * .065
        cylinder(x, (.675 + y) / 2, z, .006, y - .675, '#526448')
        add(officeLeafGeometry(THREE, angle, .19, 5), i % 3 ? '#4D6A46' : '#708650', x, y, z)
      }
    })
    for (const p of posedPeople) {
      if(vertical&&p.department==='market')continue
      pose=vertical&&p.department==='market'?{...p.home,yaw:p.yaw}:null
      part(p.id, 'chair', () => {
        const x = p.home.x, z = p.home.z
        // 圆角外轮廓完全包含于原座垫方形；顶面及靠背高度不变。
        cylinder(x, .47, z, .23, .10, '#B7C2B4')
        box(x, .74, z + .23, .46, .48, .06, '#B7C2B4')
        cylinder(x, .275, z, .032, .29, '#746A59')
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5, g = new THREE.BoxGeometry(.025, .025, .18)
          g.rotateY(a)
          add(g, '#746A59', x + Math.sin(a) * .09, .12, z + Math.cos(a) * .09)
          cylinder(x + Math.sin(a) * .18, .085, z + Math.cos(a) * .18, .025, .07, '#4A4D48')
        }
        for (const s of [-1, 1]) {
          box(x + s * .21, .61, z + .03, .025, .23, .025, '#746A59')
          box(x + s * .21, .73, z + .03, .04, .035, .33, '#B7C2B4')
        }
      })
      if(pose)sampleParts.push(parts.at(-1))
      pose=vertical&&p.department==='market'?{...p.desk,yaw:p.yaw}:null
      part(p.id, 'desk-detail', () => {
        const x = p.desk.x, z = p.desk.z
        box(x, .805, z - .08, .20, .01, .14, '#746A59')
        box(x, .8375, z - .08, .035, .055, .035, '#746A59')
        box(x - .04, .812, z + .15, .32, .024, .1, '#4A4D48')
        box(x + .24, .812, z + .15, .045, .024, .07, '#4A4D48')
        box(x - .22, .40, z, .24, .64, .38, '#D9D3C6')
        for (const y of [.22, .43, .64]) box(x - .22, y, z + .195, .10, .012, .01, '#B89B64')
        if(pose){
          box(x,1.04,z-.08,.42,.35,.05,'#303F40')
          if(!low)box(x,1.04,z-.047,.36,.28,.012,'#708976')
        }
      })
    }
    pose=null
    if(vertical){
      const plant=parts.find(p=>p.id==='market'&&p.kind==='plant')
      sampleParts.push({...plant,id:'market-existing-plant'})
      appendMarketWorkIsland({THREE,context,plan:sample,add,part,target:sampleParts})
    }
    if(sample&&!vertical){
      const t=sample.table
      part(t.id,'shared-table',()=>{
        const shape=new THREE.Shape(),a=t.w/2,b=t.d/2,r=.12
        shape.moveTo(-a+r,-b);shape.lineTo(a-r,-b);shape.quadraticCurveTo(a,-b,a,-b+r)
        shape.lineTo(a,b-r);shape.quadraticCurveTo(a,b,a-r,b);shape.lineTo(-a+r,b)
        shape.quadraticCurveTo(-a,b,-a,b-r);shape.lineTo(-a,-b+r);shape.quadraticCurveTo(-a,-b,-a+r,-b)
        const top=new THREE.ExtrudeGeometry(shape,{depth:t.thickness??.08,bevelEnabled:false,curveSegments:low?2:5});top.rotateX(-Math.PI/2)
        add(top,'#C9A57A',t.x,t.height-(t.thickness??.08),t.z)
        box(t.x,vertical?.69:.71,t.z,t.w-.08,.025,t.d-.08,'#D9D3C6')
        for(const offset of vertical?[-.9,.9]:[-2.05,2.05]){
          box(t.x+(vertical?0:offset),.4,t.z+(vertical?offset:0),vertical?.75:.08,.62,vertical?.08:.75,'#B89B64')
          box(t.x+(vertical?0:offset),.095,t.z+(vertical?offset:0),vertical?.85:.22,.03,vertical?.22:.85,'#746A59')
        }
        box(t.x,.63,t.z,vertical?.05:4.1,.07,vertical?1.8:.05,'#B89B64')
      },sampleParts)
      for(const s of sample.visitors){
        pose=vertical?{x:s.x,z:s.z,yaw:s.yaw-Math.PI}:null
        part(s.id,'visitor-chair',()=>{
        cylinder(s.x,.47,s.z,.23,.1,'#B7C2B4')
        box(s.x,.74,s.z-.23,.46,.48,.06,'#B7C2B4')
        for(const dx of[-.19,.19])for(const dz of[-.18,.18])box(s.x+dx,.275,s.z+dz,.035,.29,.035,'#746A59')
        for(const side of[-1,1])box(s.x+side*.24,.66,s.z,.04,.06,.40,'#B89B64')
        },sampleParts)
      }
      pose=null
    }
    replacement = displayBatch(THREE, pieces, mesh.material).geometry
    if(sample){
      const positions=replacement.attributes.position,triangles=[]
      sample.bounds=sampleParts.map(part=>{
        const b=new THREE.Box3()
        for(let i=part.start;i<part.start+part.count;i++){
          b.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,i));triangles.push(positions.getX(i),positions.getY(i),positions.getZ(i))
        }
        return {id:part.kind==='chair'?`${part.id}-chair`:part.id,x0:b.min.x,x1:b.max.x,z0:b.min.z,z1:b.max.z,y0:b.min.y,y1:b.max.y}
      })
      if(context.collision){
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(triangles,3))
        proxy=new THREE.Mesh(g,new THREE.MeshBasicMaterial());proxy.visible=false;proxy.name='sample-market-furniture-collision';result.root.add(proxy)
        context.collision.add(proxy,'officeDisplayRoomSample')
      }
    }
    mesh.geometry = replacement; original.dispose()
    result.finish = { parts, retainedVertices: keep.length, ...(sample?{sample:{...sample,parts:sampleParts}}:{}) }
    if(sample){
      result.bounds=[...result.bounds.filter(b=>!people.some(p=>p.department===sample.room&&(b.id===`${p.id}-desk`||(vertical&&b.id===`${p.id}-chair`)))),...sample.bounds]
      if(vertical)result.displayLayout={...posedLayout,marketObstacles:sample.bounds.map(b=>({...b}))}
      const summary=result.summary
      result.summary=()=>({...summary(),triangles:mesh.geometry.attributes.position.count/3,...(vertical?{desks:departments.length*3+1,marketWorkstations:4,vacantSeats:1,sharedTables:0,visitorChairs:0}:{sharedTables:1,visitorChairs:sample.visitors.length})})
      const dispose=result.dispose;let disposed=false
      result.dispose=()=>{if(disposed)return;disposed=true;releaseProxy();dispose()}
    }
  } catch (error) {
    releaseProxy();replacement?.dispose()
    pieces.forEach(g => g.dispose())
    result.finish = { fallback: true, reason: String(error?.message || error) }
  }
  return result
}
