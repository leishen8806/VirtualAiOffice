// 董事会定稿的质检四席和R2十八席；只由对齐版 officeSample=1 解析采用。
export const FACING_SEATS = Object.freeze({
  QAAutomation: Object.freeze(['west-open', -14.3, -.4, Math.PI]),
  Reviewer1: Object.freeze(['west-open', -12.7, -.4, Math.PI]),
  Reviewer2: Object.freeze(['west-open', -14.3, .4, 0]),
  SecurityReviewer: Object.freeze(['west-open', -12.7, .4, 0]),
  Lead: Object.freeze(["product", 15.7, -7.4, Math.PI]),
  PM: Object.freeze(["product", 17.3, -7.4, Math.PI]),
  Architect: Object.freeze(["product", 15.7, -6.6, 0]),
  UIUX: Object.freeze(["product", 17.3, -6.6, 0]),
  FrontendSenior: Object.freeze(["eng", 25.5, -7.4, Math.PI]),
  Frontend1: Object.freeze(["eng", 27.1, -7.4, Math.PI]),
  Frontend2: Object.freeze(["eng", 28.7, -7.4, Math.PI]),
  BackendSenior: Object.freeze(["eng", 25.5, -6.6, 0]),
  Backend1: Object.freeze(["eng", 27.1, -6.6, 0]),
  Backend2: Object.freeze(["eng", 28.7, -6.6, 0]),
  GoSenior: Object.freeze(["drlife", 14.6, 7.6, Math.PI]),
  Go1: Object.freeze(["drlife", 16.2, 7.6, Math.PI]),
  LedgerAuditor: Object.freeze(["drlife", 14.6, 8.4, 0]),
  ReactSenior: Object.freeze(["drlife", 16.2, 8.4, 0]),
  Go2: Object.freeze(["drlife", 19.9, 7.6, Math.PI]),
  DBEngineer: Object.freeze(["drlife", 21.5, 7.6, Math.PI]),
  React1: Object.freeze(["drlife", 19.9, 8.4, 0]),
  Localizer: Object.freeze(["drlife", 21.5, 8.4, 0]),
})
export const FACING_ISLAND_BOUNDS = Object.freeze({ x0: -15.55, x1: -11.45, z0: -1.75, z1: 1.75 })
export const facingSample = layout => layout?.variant === 'align' && layout.furnitureSample === true

export function facingIslandGroups(layout) {
  if(!facingSample(layout))return []
  return [
    ['quality','west-open',['QAAutomation','Reviewer1','Reviewer2','SecurityReviewer']],
    ['product','product',['Lead','PM','Architect','UIUX']],
    ['engineering','eng',['FrontendSenior','Frontend1','Frontend2','BackendSenior','Backend1','Backend2']],
    ['drlife-a','drlife',['GoSenior','Go1','LedgerAuditor','ReactSenior']],
    ['drlife-b','drlife',['Go2','DBEngineer','React1','Localizer']],
  ].map(([id,region,ids])=>{
    const seats=ids.map(id=>layout.seats[id]),xs=seats.map(s=>s[1]),zs=seats.map(s=>s[2]),x0=Math.min(...xs),x1=Math.max(...xs),z=(Math.min(...zs)+Math.max(...zs))/2
    const endWidth=region==='drlife'?.46:.5
    return{id,region,ids,x0,x1,z,endWidth,bounds:id==='quality'?{...FACING_ISLAND_BOUNDS}:{x0:x0-1-endWidth/2,x1:x1+1+endWidth/2,z0:z-1.75,z1:z+1.75}}
  })
}

export function facingHome([region, x, z]) {
  const seat = Object.values(FACING_SEATS).find(s => s[0] === region && s[1] === x && s[2] === z)
  return seat ? { x, z: z + (seat[3] ? -1 : 1), yaw: seat[3] } : null
}

export function facingAccess(layout, point) {
  if (!facingSample(layout)) return null
  const group=facingIslandGroups(layout).find(g=>g.ids.some(id=>{const h=facingHome(layout.seats[id]);return Math.abs(h.x-point.x)<1e-6&&Math.abs(h.z-point.z)<1e-6}))
  if(group)return{x:point.x,z:group.z+(point.z<group.z?-2.3:2.3)}
  const unpaired=Object.entries(layout.seats).find(([id,s])=>!FACING_SEATS[id]&&Math.abs(s[1]-point.x)<1e-6&&Math.abs(s[2]+1-point.z)<1e-6)
  return unpaired?{x:point.x,z:point.z+.9}:null
}

export const posedPoint = (x, z, yaw, dx, dz) => ({ x: x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, z: z - Math.sin(yaw) * dx + Math.cos(yaw) * dz })

export function marketSamplePlan(layout, department = 'market') {
  const room = layout.regions.find(r => r.id === department)
  if (!room || !facingSample(layout)) return null
  const x = (room.x0 + room.x1) / 2, z = (room.z0 + room.z1) / 2
  const stations=[[-.4,-.8,-Math.PI/2],[-.4,.8,-Math.PI/2],[.4,-.8,Math.PI/2],[.4,.8,Math.PI/2]].map(([dx,dz,yaw],i)=>({
    id:`${department}-desk-${i+1}`,personId:i<3?`sim-${department}-${i+1}`:null,x:x+dx,z:z+dz,yaw,
    home:{x:x+dx+Math.sin(yaw),z:z+dz},chairId:i<3?`sim-${department}-${i+1}-chair`:`${department}-empty-chair`,
  }))
  return { room:room.id,kind:'facing-work-island',stations,groupBounds:{x0:x-1.7,x1:x+1.7,z0:z-1.5,z1:z+1.5},
    divider:{id:`${department}-divider`,x,z,w:3,d:.08,yaw:Math.PI/2},
    cabinet:{id:`${department}-wall-cabinet`,x:room.x0+.5,z:department==='service'?room.z0+1.05:z,w:1.6,d:.55,yaw:Math.PI/2},
    art:(department==='marketing'?[-2.8,-1.5,2.2]:[-2.2,0,2.2]).map((dx,i)=>({id:`${department}-wall-art-${i+1}`,x:x+dx,z:room.z0+.12,w:.9,d:.10,y:1.68,h:.66})),
    plants:[{id:`${department}-existing-plant`,x:room.x1-.55,z:room.z0+.65},{id:`${department}-corner-plant`,x:room.x0+.7,z:room.z1-.7}] }
}

export function marketSamplePose(layout, index, department = 'market') {
  const plan = (layout.displayWorkIslands === true || (department==='market'&&layout.marketSample===true)) && marketSamplePlan(layout,department)
  if (!plan) return null
  const station=plan.stations[index]
  return station?.personId?{home:{...station.home},desk:{x:station.x,z:station.z},yaw:station.yaw}:null
}

export function marketSampleBounds(plan) {
  const box=(id,x,z,w,d)=>({id,x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2})
  return [...plan.stations.flatMap(s=>[box(s.id,s.x,s.z,.7,1.4),box(s.chairId,s.home.x,s.home.z,.6,.62)]),
    box(plan.divider.id,plan.divider.x,plan.divider.z,.08,3),box(plan.cabinet.id,plan.cabinet.x,plan.cabinet.z,.55,1.6),
    ...plan.art.map(p=>({...box(p.id,p.x,p.z,p.w,p.d),z0:p.z-.07,z1:p.z+.064})),...plan.plants.map(p=>box(p.id,p.x,p.z,.55,.5))]
}
