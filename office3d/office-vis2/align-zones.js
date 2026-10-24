import { createSampleBatch } from './batch.js'
import { buildOpenFurnishing } from './open-furnishing.js'

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

export function alignFloorSpec(layout) {
  const palette = { open:'#DEC69F', display:'#D9D3C6', room:'#C3AA87' }, e=layout.envelope
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

export function buildAlignZones({THREE,root,layout,collision,low=false}) {
  const batch=createSampleBatch(THREE), floor=alignFloorSpec(layout), furnishings=[], proxies=[], registered=[], reserved=alignDoorAprons(layout)
  const corridors=alignPassages(layout), workstations=Object.values(layout.seats).map(([,x,z])=>({x,z,radius:1}))
  let paving,disposed=false
  const dispose=()=>{
    if(disposed)return;disposed=true
    for(const p of registered)collision?.remove?.(p)
    for(const p of proxies){p.removeFromParent();p.geometry.dispose();p.material.dispose()}
    furnishings.forEach(f=>f.dispose());paving?.dispose()
  }
  try {
    const slab=(b,y,color)=>{const g=new THREE.PlaneGeometry(b.x1-b.x0,b.z1-b.z0);g.rotateX(-Math.PI/2);batch.add(g,color,[(b.x0+b.x1)/2,y,(b.z0+b.z1)/2],0,.88)}
    for(const b of floor.regions)slab(b,.126,b.color)
    for(const b of floor.corridors)slab(b,.132,'#F4F1EA')
    const r=floor.ring
    for(const [inner,outer,y,color] of [[r.inner,r.outer,.138,'#EEE5D5'],[r.inner,r.inner+.08,.141,'#9B886B'],[r.outer-.08,r.outer,.141,'#9B886B']]){
      const g=new THREE.RingGeometry(inner,outer,low?96:192);g.rotateX(-Math.PI/2);batch.add(g,color,[r.center.x,y,r.center.z],0,.88)
    }
    paving=batch.build(root,'align-floor-and-ring')
    for(const id of ['west-open','kb','product','eng','drlife','creative','dining','leisure']) {
      const area=layout.regions.find(r=>r.id===id)
      const f=buildOpenFurnishing({THREE,root,area,workstations,corridors,reserved,ring:layout.ring,low,zoneKind:['creative','dining','leisure'].includes(id)?id:undefined})
      furnishings.push(f);f.region=id;f.root.name=`align-${id}-furnishing`
      for(const g of f.groups){g.id=`${id}-${g.id}`;g.memberIds=g.memberIds.map(s=>`${id}-${s}`);const b=g.groupBounds;reserved.push({x0:b.x0-1.2,x1:b.x1+1.2,z0:b.z0-1.2,z1:b.z1+1.2})}
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
