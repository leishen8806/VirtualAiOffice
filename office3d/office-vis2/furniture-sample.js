// 董事会批准的四席样板；只由对齐版 officeSample=1 解析生成这些唯一坐标。
export const FACING_SEATS = Object.freeze({
  QAAutomation: Object.freeze(['west-open', -14.3, -.4, Math.PI]),
  Reviewer1: Object.freeze(['west-open', -12.7, -.4, Math.PI]),
  Reviewer2: Object.freeze(['west-open', -14.3, .4, 0]),
  SecurityReviewer: Object.freeze(['west-open', -12.7, .4, 0]),
})
export const FACING_ISLAND_BOUNDS = Object.freeze({ x0: -15.55, x1: -11.45, z0: -1.75, z1: 1.75 })
export const facingSample = layout => layout?.variant === 'align' && layout.furnitureSample === true

export function facingHome([region, x, z]) {
  const explicit = arguments[0]?.[4]
  if (explicit && Number.isFinite(explicit.x) && Number.isFinite(explicit.z) && Number.isFinite(explicit.yaw)) return { ...explicit }
  const seat = Object.values(FACING_SEATS).find(s => s[0] === region && s[1] === x && s[2] === z)
  return seat ? { x, z: z + (seat[3] ? -1 : 1), yaw: seat[3] } : null
}

export function facingAccess(layout, point) {
  if (!facingSample(layout)) return null
  const seats = Object.values(layout.seats || {})
  const entry = Object.entries(layout.seats || {}).find(([, s]) => {
    const home = facingHome(s)
    return home && Math.abs(home.x - point.x) < 1e-6 && Math.abs(home.z - point.z) < 1e-6
  })
  const seat = entry?.[1]
  const home = seat && facingHome(seat)
  if (!home) return null
  if (['L1', 'L2'].includes(layout.plan1Phase)) {
    const dx = home.x - seat[1], dz = home.z - seat[2], length = Math.hypot(dx, dz) || 1
    // R6: keep the four routes clear of adjacent real-chair envelopes; all other seats retain L1's 1.15 m offset.
    const distance = layout.plan1Phase === 'L2' && ['PM', 'Frontend1', 'BackendSenior', 'UIUX'].includes(entry[0]) ? .6 : 1.15
    return { x: home.x + dx / length * distance, z: home.z + dz / length * distance }
  }
  return { x: home.x, z: home.z < 0 ? -2.3 : 2.3 }
}

export const posedPoint = (x, z, yaw, dx, dz) => ({ x: x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, z: z - Math.sin(yaw) * dx + Math.cos(yaw) * dz })

export function marketSamplePlan(layout) {
  const room = layout.regions.find(r => r.id === 'market')
  if (!room || !facingSample(layout)) return null
  const x = (room.x0 + room.x1) / 2, z = (room.z0 + room.z1) / 2
  const stations=[[-.4,-.8,-Math.PI/2],[-.4,.8,-Math.PI/2],[.4,-.8,Math.PI/2],[.4,.8,Math.PI/2]].map(([dx,dz,yaw],i)=>({
    id:`market-desk-${i+1}`,personId:i<3?`sim-market-${i+1}`:null,x:x+dx,z:z+dz,yaw,
    home:{x:x+dx+Math.sin(yaw),z:z+dz},chairId:i<3?`sim-market-${i+1}-chair`:'market-empty-chair',
  }))
  return { room:room.id,kind:'facing-work-island',stations,groupBounds:{x0:x-1.7,x1:x+1.7,z0:z-1.5,z1:z+1.5},
    divider:{id:'market-divider',x,z,w:3,d:.08,yaw:Math.PI/2},
    cabinet:{id:'market-wall-cabinet',x:room.x0+.2,z,w:1.6,d:.35,yaw:Math.PI/2},
    art:[-2.2,0,2.2].map((dx,i)=>({id:`market-wall-art-${i+1}`,x:x+dx,z:room.z0+.12,w:.9,d:.10,y:1.68,h:.66})),
    plants:[{id:'market-existing-plant',x:room.x1-.55,z:room.z0+.65},{id:'market-corner-plant',x:room.x0+.7,z:room.z1-.7}] }
}

export function marketSamplePose(layout, index) {
  const plan = layout.marketSample === true && marketSamplePlan(layout)
  if (!plan) return null
  const station=plan.stations[index]
  return station?.personId?{home:{...station.home},desk:{x:station.x,z:station.z},yaw:station.yaw}:null
}

export function marketSampleBounds(plan) {
  const box=(id,x,z,w,d)=>({id,x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2})
  return [...plan.stations.flatMap(s=>[box(s.id,s.x,s.z,.7,1.4),box(s.chairId,s.home.x,s.home.z,.6,.62)]),
    box(plan.divider.id,plan.divider.x,plan.divider.z,.08,3),box(plan.cabinet.id,plan.cabinet.x,plan.cabinet.z,plan.cabinet.d,plan.cabinet.w),
    ...plan.art.map(p=>({...box(p.id,p.x,p.z,p.w,p.d),z0:p.z-.07,z1:p.z+.064})),...plan.plants.map(p=>box(p.id,p.x,p.z,.55,.5))]
}
