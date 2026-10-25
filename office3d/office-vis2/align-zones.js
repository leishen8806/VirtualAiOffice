import { createSampleBatch } from './batch.js'
import { buildOpenFurnishing, planOpenFurnishing } from './open-furnishing.js'

const isRect = b => ['x0','x1','z0','z1'].every(k => Number.isFinite(b?.[k]))
export const alignPassages = layout => Object.values({ ...layout.corridors, ...layout.passages }).filter(isRect)

export function alignDoorAprons(layout) {
  return layout.regions.filter(r => r.walled).flatMap(r => r.doors.map(d => {
    const b = { id: `${r.id}-${d.side}`, x0: d.at-.75, x1: d.at+.75, z0: r.z0-1.5, z1: r.z0 }
    if (d.side === 'south') { b.z0=r.z1; b.z1=r.z1+1.5 }
    if (d.side === 'west' || d.side === 'east') {
      b.x0=d.side==='west'?r.x0-1.5:r.x1; b.x1=b.x0+1.5; b.z0=d.at-.75; b.z1=d.at+.75
    }
    return b
  }))
}

// 围绕既有真实桌位生成端柜与背屏；不增加桌面、业务席位，也不改变 workHome 朝向。
export function planWorkstationIslands(layout, area) {
  const seats=Object.entries(layout.seats).filter(([,s])=>s[0]===area.id).map(([id,[,x,z]])=>({id,x,z}))
  const rows=[]
  for(const seat of seats.sort((a,b)=>a.z-b.z||a.x-b.x)) {
    let row=rows.at(-1)
    if(!row||row[0].z!==seat.z||seat.x-row.at(-1).x>4)rows.push(row=[])
    row.push(seat)
  }
  const placements=[],groups=[],skipped=[],forbidden=[...alignPassages(layout),...alignDoorAprons(layout)]
  const overlap=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1
  for(const [i,row]of rows.entries()) {
    const id=`real-desks-${i+1}`,z=row[0].z,left=row[0].x-.7,right=row.at(-1).x+.7,members=[]
    const add=(kind,x,z,w,d,height)=>{
      const bounds={x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y0:0,y1:height}
      if(bounds.x0<area.x0||bounds.x1>area.x1||bounds.z0<area.z0||bounds.z1>area.z1||forbidden.some(b=>overlap(bounds,b))) {skipped.push(`${id}-${kind}-${x}`);return}
      members.push({id:`${id}-${kind}-${members.length}`,groupId:id,kind,x,z,w,d,height,bounds,workstationIds:row.map(s=>s.id)})
    }
    const screenLeft=Math.max(left,area.x0),screenRight=Math.min(right,area.x1)
    add('desk-divider',(screenLeft+screenRight)/2,z-.43,screenRight-screenLeft,.08,1.135)
    for(const x of [left-.245,right+.245])add('planter-cabinet',x,z,.45,.7,1.25)
    for(let j=1;j<row.length;j++) {
      const gap=row[j].x-row[j-1].x-1.4
      if(gap>=1.8)add('planter-cabinet',(row[j].x+row[j-1].x)/2,z,Math.min(1.1,gap-.6),.7,1.25)
    }
    placements.push(...members)
    groups.push({id,template:'real-workstation-island',workstationIds:row.map(s=>s.id),memberIds:members.map(p=>p.id),
      groupBounds:{x0:Math.min(left,...members.map(p=>p.bounds.x0)),x1:Math.max(right,...members.map(p=>p.bounds.x1)),z0:z-.47,z1:z+1.3},
      useSpace:{x0:left,x1:right,z0:z+.35,z1:z+1.3}})
  }
  return{placements,groups,skipped,corridors:alignPassages(layout)}
}

// Shared by the renderer and route planner: keep navigation obstacles identical
// to the deterministic furnishing plan without importing THREE into routing.
export function alignZoneObstaclePlan(layout) {
  const reserved = alignDoorAprons(layout)
  const corridors = alignPassages(layout)
  const workstations = Object.values(layout.seats).map(([, x, z]) => ({ x, z, radius: 1 }))
  const entries = []
  for (const id of ['west-open', 'kb', 'product', 'eng', 'drlife', 'creative', 'dining', 'leisure']) {
    const area = layout.regions.find(region => region.id === id)
    const zoneKind = ['creative', 'dining', 'leisure'].includes(id) ? id : undefined
    const plan = zoneKind ? planOpenFurnishing({ area, workstations, corridors, reserved, ring: layout.ring, zoneKind }) : planWorkstationIslands(layout,area)
    for (const group of plan.groups) reserved.push({ x0: group.groupBounds.x0 - 1.2, x1: group.groupBounds.x1 + 1.2, z0: group.groupBounds.z0 - 1.2, z1: group.groupBounds.z1 + 1.2 })
    entries.push({ id, plan })
  }
  // 北侧已建业务会议室时，把原洽谈组放到西侧腾出的空间；保留原模块 id，不新增业务工位。
  if (layout.variant === 'align') {
    const board = layout.regions.find(r => r.id === 'board')
    const west = layout.regions.find(r => r.id === 'west-open')
    const northOccupied = layout.regions.some(r => ['review', 'plan'].includes(r.id) && r.z0 === layout.envelope.z0)
    const area = northOccupied
      ? { x0: west.x0, x1: west.x1, z0: Math.max(board.z1, layout.regions.find(r => r.id === 'market').z1), z1: west.z0 }
      : { x0: board.x1, x1: layout.doors.north.x0, z0: layout.envelope.z0, z1: board.z1 }
    const plan = planOpenFurnishing({ area, workstations, corridors, reserved: [...reserved, ...layout.regions.filter(r => r.walled)], ring: layout.ring, zoneKind: 'north-nook' })
    entries.push({ id: 'north-nook', plan })
  }
  return entries
}

export function alignFloorSpec(layout) {
  const palette = { open:'#E7DECF', display:'#D9D3C6', room:'#C3AA87' }, e=layout.envelope
  const regions=layout.regions.map(r=>({...r,color:palette[r.kind]}))
  const paths=alignPassages(layout).map(b=>({x0:Math.max(b.x0,e.x0),x1:Math.min(b.x1,e.x1),z0:Math.max(b.z0,e.z0),z1:Math.min(b.z1,e.z1)})).filter(b=>b.x1>b.x0&&b.z1>b.z0)
  // Rectangular union: duplicate paths and crossing strips must not create coplanar layers.
  const xs=[...new Set(paths.flatMap(b=>[b.x0,b.x1]))].sort((a,b)=>a-b), zs=[...new Set(paths.flatMap(b=>[b.z0,b.z1]))].sort((a,b)=>a-b), corridors=[]
  for(let j=0;j<zs.length-1;j++) for(let i=0;i<xs.length-1;i++) {
    const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2
    if(paths.some(b=>x>b.x0&&x<b.x1&&z>b.z0&&z<b.z1)) corridors.push({x0:xs[i],x1:xs[i+1],z0:zs[j],z1:zs[j+1]})
  }
  return {regions,corridors,ring:layout.ring}
}

export function buildAlignZones({THREE,root,layout,collision,low=false,get}) {
  const batch=createSampleBatch(THREE), floor=alignFloorSpec(layout), furnishings=[], proxies=[], registered=[]
  let paving,disposed=false
  const dispose=()=>{
    if(disposed)return;disposed=true
    for(const p of registered)collision?.remove?.(p)
    for(const p of proxies){p.removeFromParent();p.geometry.dispose();p.material.dispose()}
    furnishings.forEach(f=>f.dispose());paving?.dispose()
  }
  try {
    const slab=(b,y,color,grain='stone')=>{const g=new THREE.PlaneGeometry(b.x1-b.x0,b.z1-b.z0);g.rotateX(-Math.PI/2);batch.add(g,color,[(b.x0+b.x1)/2,y,(b.z0+b.z1)/2],0,.78,0,grain)}
    for(const b of floor.regions){
      slab(b,.126,b.color,b.kind==='room'?'wood':'stone')
      const step=b.kind==='room'?.6:1.5
      for(let x=b.x0+step;x<b.x1;x+=step)slab({x0:x-.007,x1:x+.007,z0:b.z0,z1:b.z1},.128,b.kind==='room'?'#AB9477':'#C8BEAC','')
      if(b.kind!=='room')for(let z=b.z0+1.5;z<b.z1;z+=1.5)slab({x0:b.x0,x1:b.x1,z0:z-.007,z1:z+.007},.128,'#C8BEAC','')
    }
    for(const b of floor.corridors)slab(b,.132,'#F4F1EA')
    const r=floor.ring
    for(const [inner,outer,y,color] of [[r.inner,r.outer,.138,'#EEE5D5'],[r.inner,r.inner+.08,.141,'#9B886B'],[r.outer-.08,r.outer,.141,'#9B886B']]){
      const g=new THREE.RingGeometry(inner,outer,low?96:192);g.rotateX(-Math.PI/2);batch.add(g,color,[r.center.x,y,r.center.z],0,.88)
    }
    paving=batch.build(root,'align-floor-and-ring')
    paving.mesh.material.userData.officeFineStone = true
    for(const {id,plan} of alignZoneObstaclePlan(layout)) {
      if (!plan.placements.length) continue
      const f=buildOpenFurnishing({THREE,root,plan,low})
      furnishings.push(f);f.region=id;f.root.name=`align-${id}-furnishing`
      if(id==='north-nook'){
        const ground=get?.('shell3')?.ground
        if(ground){
          root.updateWorldMatrix(true,false)
          const floorY=new THREE.Box3().setFromObject(ground).max.y-new THREE.Vector3().setFromMatrixPosition(root.matrixWorld).y
          f.root.geometry.translate(0,floorY,0)
          for(const p of f.placements){p.bounds.y0+=floorY;p.bounds.y1+=floorY}
          for(const b of f.colliders){b.y0+=floorY;b.y1+=floorY}
        }
      }
      for(const g of f.groups){g.id=`${id}-${g.id}`;g.memberIds=g.memberIds.map(s=>`${id}-${s}`)}
      for(const p of f.placements){p.id=`${id}-${p.id}`;p.groupId=`${id}-${p.groupId}`}
      f.colliders.forEach(b=>{b.id=`${id}-${b.id}`})
    }
    const obstacles=furnishings.flatMap(f=>f.colliders)
    for(const b of obstacles){
      const p=new THREE.Mesh(new THREE.BoxGeometry(b.x1-b.x0,b.y1-b.y0,b.z1-b.z0),new THREE.MeshBasicMaterial())
      p.name=b.id;p.visible=false;p.position.set((b.x0+b.x1)/2,(b.y0+b.y1)/2,(b.z0+b.z1)/2);root.add(p);proxies.push(p)
    }
    // Register only after every component builds; the registry commits its pending collision batch.
    for(const p of proxies){collision?.add(p,'office3-align-furnishing');registered.push(p)}
    return {root,floor,furnishings,obstacles:()=>obstacles.map(b=>({...b})),dispose}
  }catch(error){dispose();throw error}
}
