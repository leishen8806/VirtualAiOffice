import { officePlan1Reception, officePlan1SouthHeight } from '../office-plan1-layout.js'
import { createSampleBatch, warmOfficeArchitecture } from './batch.js'

// 每翼共用截面顶点；只有链首尾有端面，避免逐段盒体留下缝隙和明暗线。
export function buildPlan1Facade(THREE, root, layout, segments, material) {
  const style = layout.walls.outerSolid, geometry = new THREE.BufferGeometry()
  const states = segments.map(segment => {
    const south = !['north', 'west', 'east'].includes(segment.side)
    const heights = [segment.a, segment.b].map(p => south ? officePlan1SouthHeight(layout, p.x) : style.height)
    return { segment, heights, current: [...heights] }
  })
  const chains = [
    ...states.filter(s=>['north','west','east'].includes(s.segment.side)).map(s=>[s]),
    states.filter(s=>!['north','west','east'].includes(s.segment.side)&&(s.segment.a.x+s.segment.b.x)/2<layout.axis.x),
    states.filter(s=>!['north','west','east'].includes(s.segment.side)&&(s.segment.a.x+s.segment.b.x)/2>layout.axis.x),
  ].filter(c=>c.length)
  const vertices=[], indices=[], strips=[]
  const vertex=(chain,node,side,level)=>{vertices.push({chain,node,side,level});return vertices.length-1}
  const quad=(a,b,c,d,reverse=false)=>indices.push(...(reverse?[a,c,b,a,d,c]:[a,b,c,a,c,d]))
  for(const chain of chains){
    const points=[chain[0].segment.a,...chain.map(s=>s.segment.b)]
    chain.nodes=points.map((point,i)=>{
      const normal=s=>{const dx=s.segment.b.x-s.segment.a.x,dz=s.segment.b.z-s.segment.a.z,l=Math.hypot(dx,dz);return{x:-dz/l,z:dx/l}}
      const prev=normal(chain[Math.max(0,i-1)]),next=normal(chain[Math.min(i,chain.length-1)])
      const x=prev.x+next.x,z=prev.z+next.z,den=x*prev.x+z*prev.z
      return{point,offset:{x:x/den*style.thickness/2,z:z/den*style.thickness/2}}
    })
    for(const side of [-1,1]){
      const rows=points.map((_,i)=>[0,1,2].map(level=>vertex(chain,i,side,level)))
      for(let i=0;i<chain.length;i++)for(let level=0;level<2;level++)quad(rows[i][level],rows[i+1][level],rows[i+1][level+1],rows[i][level+1],side<0)
      strips.push({kind:'side',rows,segments:chain.length})
    }
    for(const level of [0,2]){
      const rows=points.map((_,i)=>[1,-1].map(side=>vertex(chain,i,side,level)))
      for(let i=0;i<chain.length;i++)quad(rows[i][0],rows[i+1][0],rows[i+1][1],rows[i][1],level===0)
      strips.push({kind:level?'cap':'bottom',rows,segments:chain.length})
    }
    for(const node of [0,chain.length])quad(vertex(chain,node,-1,0),vertex(chain,node,1,0),vertex(chain,node,1,2),vertex(chain,node,-1,2),node!==0)
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(vertices.length*3),3))
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(vertices.length*3).fill(1),3))
  geometry.setIndex(indices)
  function write(){
    const p=geometry.attributes.position
    vertices.forEach(({chain,node,side,level},i)=>{
      const {point,offset}=chain.nodes[node]
      const before=chain[Math.max(0,node-1)].current[node?1:0],after=chain[Math.min(node,chain.length-1)].current[node===chain.length?1:0]
      const h=Math.min(before,after)
      p.setXYZ(i,point.x+offset.x*side,level===0?0:h+(level===2?style.capHeight:0),point.z+offset.z*side)
    })
    p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  }
  write()
  const mesh=new THREE.Mesh(geometry,material);mesh.name='office-plan1-sloped-facade';mesh.userData.dynamic=true
  mesh.castShadow=mesh.receiveShadow=false;root.add(mesh)
  return{mesh,states,chains,strips,write,dispose(){geometry.dispose();mesh.removeFromParent()}}
}

export function buildPlan1Reception({ THREE, root, layout, collision, low }) {
  const data = officePlan1Reception(layout), solid = createSampleBatch(THREE), panes = createSampleBatch(THREE), proxies = []
  const box = (batch, x0, x1, y, h, z0, z1, color, metal = 0) => batch.add(new THREE.BoxGeometry(x1-x0,h,z1-z0), color, [(x0+x1)/2,y+h/2,(z0+z1)/2], 0, .6, metal)
  const frame = '#AA9472', trim = '#B89B64', f = data.spec.frameWidth
  const wall = data.wall
  box(solid,wall.x0,wall.x1,0,wall.height,wall.z0,wall.z1,layout.walls.outerSolid.finish)
  for (const p of data.columns) {
    box(solid,p.x0,p.x1,0,p.height,p.z0,p.z1,'#F4F1EA')
    for (const y of [.12,p.height-.08]) box(solid,p.x0-.006,p.x1+.006,y,.05,p.z0-.006,p.z1+.006,trim,.55)
    box(solid,p.x0+.06,p.x1-.06,p.height,.18,p.z0+.06,p.z1-.06,'#D9D3C6')
    // Small owned foliage above the column planter, with fixed three-dimensional leaves.
    for (let i=0;i<(low?12:24);i++) {
      const a=i*2.399, g=new THREE.SphereGeometry(.1,5,3); g.scale(.55,1.8,1); g.rotateZ(.65); g.rotateY(a)
      solid.add(g,['#3F6341','#55764A','#748950'][i%3],[(p.x0+p.x1)/2+Math.sin(a)*.23,p.height+.28+(i%3)*.08,(p.z0+p.z1)/2+Math.cos(a)*.23])
    }
  }
  const slides = []
  for (const p of [...data.partitions,...data.leaves]) {
    const solidStart=solid.triangles()*3, paneStart=panes.triangles()*3
    const leaf=p.kind==='leaf', target=leaf?panes:solid, w=leaf?data.spec.leafFrameWidth:f, z=(p.z0+p.z1)/2, tint=leaf?data.spec.doorFrameColor:frame, metal=leaf ? .25 : .5
    const glass=layout.walls.internalGlass.glassThickness/2
    panes.add(new THREE.BoxGeometry(p.x1-p.x0-2*w,p.height-2*w,2*glass),data.spec.glassColor,[(p.x0+p.x1)/2,p.height/2,z],0,data.spec.glassRoughness,.15)
    // 框条向门扇内部加粗，不改变已验收的厚度、外包络和净通道。
    for (const y of [0,p.height-w]) box(target,p.x0,p.x1,y,w,p.z0,p.z1,tint,metal)
    for(const end of leaf?[p.x0+w/2,p.x1-w/2]:[p.x0,p.x1]) box(target,end-w/2,end+w/2,0,p.height,p.z0,p.z1,tint,metal)
    if(leaf) {
      box(target,p.x0+w,p.x1-w,1.02,.06,p.z1-.02,p.z1,tint,metal)
      const door=data.doors.findIndex(d=>p.id.startsWith(d.id)), side=p.id.endsWith('-0')?0:1
      slides.push({door,shift:data.doors[door].x0+side*data.spec.leafWidth-p.x0,solid:[solidStart,solid.triangles()*3],pane:[paneStart,panes.triangles()*3]})
    }
  }
  for(const d of data.doors) {
    const tracks=data.leaves.filter(p=>p.id.startsWith(d.id)),z0=Math.min(...tracks.map(p=>p.z0)),z1=Math.max(...tracks.map(p=>p.z1))
    box(solid,d.x0,d.x1,d.height,data.spec.trackHeight,z0-.01,z1+.01,data.spec.doorFrameColor,.25)
    // Jambs stay outside the net 2.6m passage.
    for(const x of [d.x0-f/2,d.x1+f/2]) box(solid,x-f/2,x+f/2,0,d.height,d.z-f/2,d.z+f/2,data.spec.doorFrameColor,.25)
  }
  const post = layout.walls.gatePost, gate=layout.doors.south
  for(const x of [gate.x0-post.width/2,gate.x1+post.width/2]) box(solid,x-post.width/2,x+post.width/2,0,post.height,gate.z-post.depth/2,gate.z+post.depth/2,post.color,.5)
  const opaque=solid.build(root,'office-plan1-reception-and-gate'), transparent=panes.build(root,'office-plan1-reception-glass')
  transparent.mesh.material.transparent=true; transparent.mesh.material.opacity=data.spec.glassOpacity; transparent.mesh.material.depthWrite=false
  transparent.mesh.material.side=THREE.DoubleSide; transparent.mesh.userData.dynamic=true
  warmOfficeArchitecture(transparent.mesh.material)
  // 同一合批内只变换门扇顶点；碰撞代理继续使用已验收的开门包络。
  const doorOpen=new THREE.Vector2(), states=data.doors.map(()=>({open:0,absent:0}))
  const previousGlass=transparent.mesh.material.onBeforeCompile,glassKey=transparent.mesh.material.customProgramCacheKey()
  transparent.mesh.material.onBeforeCompile=function(shader,renderer){previousGlass.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\nif (surfaceParams.y > .2) diffuseColor.a = 1.0;')}
  transparent.mesh.material.customProgramCacheKey=()=>glassKey+'-opaque-bronze-frames-v1'
  for(const [batch,range] of [[transparent,'pane']]) {
    const mesh=batch.mesh, count=mesh.geometry.attributes.position.count
    mesh.geometry.morphAttributes.position=[0,1].map(door=>{
      const shifts=new Float32Array(count*3)
      for(const leaf of slides.filter(p=>p.door===door))for(let i=leaf[range][0];i<leaf[range][1];i++)shifts[i*3]=leaf.shift
      return new THREE.BufferAttribute(shifts,3)
    })
    // 内置平移形变同时覆盖普通、GTAO法线与射线检测，避免只在主材质上移门。
    mesh.geometry.morphTargetsRelative=true;mesh.updateMorphTargets();mesh.morphTargetInfluences.fill(1);mesh.userData.dynamic=true
  }
  for(const p of data.blockers) {
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(p.x1-p.x0,p.height,p.z1-p.z0),opaque.mesh.material)
    proxy.position.set((p.x0+p.x1)/2,p.height/2,(p.z0+p.z1)/2);proxy.visible=false;proxy.name='office-plan1-reception-collision-'+p.id
    root.add(proxy);collision?.add(proxy,'office3-wall');proxies.push(proxy)
  }
  let disposed=false
  function onFrame(dt, people=[]) {
    if(disposed)return
    const delta=Number.isFinite(dt)?Math.max(0,dt):0
    for(let i=0;i<data.doors.length;i++){
      const door=data.doors[i],state=states[i],x=(door.x0+door.x1)/2
      const occupied=people.some(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z)&&(p.x-x)**2+(p.z-door.z)**2<=data.spec.sensorRadius**2)
      const before=state.absent;state.absent=occupied?0:before+delta
      if(occupied)state.open=low?1:Math.min(1,state.open+delta/data.spec.openSeconds)
      else if(state.absent>data.spec.closeDelay){const closing=state.absent-Math.max(before,data.spec.closeDelay);state.open=low?0:Math.max(0,state.open-closing/data.spec.closeSeconds)}
    }
    doorOpen.set(states[0].open,states[1].open)
    for(const batch of [transparent])for(let i=0;i<2;i++)batch.mesh.morphTargetInfluences[i]=1-states[i].open
  }
  return {data,opaque,transparent,proxies,doorOpen,states,onFrame,dispose(){if(disposed)return;disposed=true;for(const p of proxies){collision?.remove?.(p);p.geometry.dispose();p.removeFromParent()}opaque.dispose();transparent.dispose()}}
}
