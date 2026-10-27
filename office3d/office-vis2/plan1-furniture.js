import { OFFICE_PLAN1_L2 as DATA, officePlan1Phase } from '../office-plan1-layout.js'
import { createSampleBatch } from './batch.js'

// Rendering and routing consume these same, world-space furniture envelopes.
export function plan1FurniturePlan(layout) {
  if (officePlan1Phase(layout) !== 'L2') return []
  const items = []
  const add = (id, kind, x, z, w, d, h, yaw = 0, extra = {}) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), wx = w*c+d*s, dz = w*s+d*c
    items.push({id,kind,x,z,w,d,h,yaw,...extra,bounds:{x0:x-wx/2,x1:x+wx/2,z0:z-dz/2,z1:z+dz/2,y0:.13,y1:.13+h}})
  }
  for (const island of DATA.islands) {
    const ns = island.axis === 'NS', length = island.capacity/2*1.4, yaw = ns ? Math.PI/2 : 0
    for (const seat of island.seats) if (seat.kind === 'empty') {
      const id = `${island.id}-empty-${seat.slot}`
      add(`${id}-desk`,'desk',seat.deskCenter.x,seat.deskCenter.z,1.4,.7,.76,seat.yawDeg*Math.PI/180,{island:island.id,businessIdentity:null})
      add(`${id}-chair`,'chair',seat.home.x,seat.home.z,.6,.62,.98,seat.yawDeg*Math.PI/180,{island:island.id,businessIdentity:null})
    }
    add(`${island.id}-screen`,'divider',island.center.x,island.center.z,length,.06,1.15,yaw,{island:island.id})
    for (const side of [-1,1]) add(`${island.id}-end-${side}`,'cabinet',island.center.x+(ns?0:side*(length/2+.125)),island.center.z+(ns?side*(length/2+.125):0),.25,1.4,.75,yaw,{island:island.id})
  }
  for (const group of DATA.support) {
    // The accepted reception and coffee counter are retained, never duplicated.
    if (['reception','coffee-counter'].includes(group.id)) continue
    const b=group.bounds,x=(b.x0+b.x1)/2,z=(b.z0+b.z1)/2,w=b.x1-b.x0,d=b.z1-b.z0
    if(group.kind==='book-wall') add(group.id,'bookcase',x,z,w,d,2.3)
    else if(group.kind==='wall-screen') add(group.id,'information-wall',x,z,w,d,2.5)
    else {
      const vertical=group.kind==='sofa-corner',sw=vertical?d:w
      add(`${group.id}-sofa`,'sofa',vertical?b.x0+.42:x,vertical?z:b.z1-.42,sw,.84,.9,vertical?Math.PI/2:0,{group:group.id})
      add(`${group.id}-table`,'round-table',vertical?b.x1-.45:x,vertical?z:b.z0+.5,.8,.8,.48,0,{group:group.id})
    }
  }
  const c=DATA.meetings.board.cabinet
  add('board-cabinet','cabinet',(c.x0+c.x1)/2,(c.z0+c.z1)/2,c.width,c.depth,.85)
  for(const stool of DATA.equipment.southCafe.stools) {
    const p=stool.center||stool
    add(stool.id,'stool',p.x,p.z,stool.diameter||.5,stool.diameter||.5,stool.height||.78)
  }
  return items
}

export function buildPlan1Furnishing({THREE,root,plan,low=false}) {
  const batch=createSampleBatch(THREE), records=[]
  for(const p of plan.placements) {
    const start=batch.triangles()*3, c=Math.cos(p.yaw),s=Math.sin(p.yaw)
    const add=(g,color,x,y,z,rough=.7,metal=0,grain='')=>batch.add(g,color,[p.x+c*x+s*z,.13+y,p.z-s*x+c*z],p.yaw,rough,metal,grain)
    const box=(w,h,d,x,y,z,color='#C9A57A',grain='wood')=>add(new THREE.BoxGeometry(w,h,d),color,x,y,z,.7,0,grain)
    const cyl=(r,h,x,y,z,color)=>add(new THREE.CylinderGeometry(r,r,h,low?10:16),color,x,y,z)
    if(p.kind==='desk') {
      box(p.w,.055,p.d,0,.7325,0,'#F4F1EA','stone')
      for(const x of [-p.w/2+.065,p.w/2-.065])for(const z of [-p.d/2+.065,p.d/2-.065])box(.055,.705,.055,x,.3525,z,'#9B8B6D','')
    } else if(p.kind==='chair') {
      cyl(.04,.4,0,.25,0,'#6B6254')
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;box(.055,.04,.055,Math.sin(a)*.25,.055,Math.cos(a)*.25,'#26333A','')}
      box(.55,.09,.5,0,.49,0,'#687D68','fabric');box(.55,.43,.07,0,.765,.25,'#687D68','fabric')
      for(const x of [-.28,.28])box(.04,.05,.37,x,.65,.03,'#6B6254','')
    } else if(p.kind==='stool') {
      cyl(p.w/2,.08,0,p.h-.04,0,'#687D68');cyl(.035,p.h-.08,0,(p.h-.08)/2,0,'#9B8B6D');cyl(.2,.04,0,.02,0,'#9B8B6D')
    } else if(p.kind==='divider') {
      box(p.w,.38,p.d,0,.96,0,'#B7C2B4','fabric')
      for(const x of [-p.w/2+.03,p.w/2-.03])box(.03,.4,p.d+.01,x,.95,0,'#B89B64','')
    } else if(p.kind==='sofa') {
      box(p.w,.19,p.d,0,.32,0,'#687D68','fabric');box(p.w,.48,.14,0,.66,p.d/2-.07,'#687D68','fabric')
      for(const x of [-p.w/2+.08,p.w/2-.08])box(.16,.38,p.d,x,.49,0,'#C9A57A')
      for(const x of [-p.w/2+.18,p.w/2-.18])for(const z of [-.27,.27])box(.06,.22,.06,x,.11,z,'#6B6254','')
    } else if(p.kind==='round-table') {
      cyl(p.w/2,.05,0,p.h-.025,0,'#F4F1EA');cyl(.055,p.h-.05,0,(p.h-.05)/2,0,'#B89B64');cyl(.22,.03,0,.015,0,'#6B6254')
    } else if(p.kind==='bookcase') {
      box(p.w,p.h,.025,0,p.h/2,-p.d/2+.0125)
      for(let y=0;y<=p.h+.001;y+=p.h/5)box(p.w,.035,p.d,0,Math.max(.0175,Math.min(p.h-.0175,y)),0)
      const n=Math.ceil(p.w/.9)
      for(let i=0;i<=n;i++)box(.035,p.h,p.d,-p.w/2+.0175+i*(p.w-.035)/n,p.h/2,0)
      for(let row=0;row<5;row++)for(let i=0;i<Math.floor(p.w/.105);i++)box(.07,.24+(i%3)*.035,Math.max(.02,p.d-.03),-p.w/2+.07+i*.105,row*p.h/5+.18,0,['#687D68','#C9A57A','#D9D3C6'][i%3],'')
    } else if(p.kind==='information-wall') {
      box(p.w,.65,p.d,0,.325,0)
      box(p.w,1.4,.08,0,1.8,0,'#26333A','')
      box(p.w-.1,1.3,.012,0,1.8,.046,'#B7C2B4','')
      for(let i=0;i<6;i++)box((p.w-.3)/6-.07,.06+(i%3)*.11,.014,-p.w/2+.22+i*(p.w-.3)/6,1.55,.059,'#506A5A','')
    } else {
      box(p.w,p.h,p.d,0,p.h/2,0)
      box(p.w,.035,p.d,0,p.h-.0175,0,'#F4F1EA','stone')
      for(const x of [-p.w/4,p.w/4])box(.08,.015,.025,x,p.h*.62,p.d/2+.0125,'#B89B64','')
    }
    records.push({...p,firstVertex:start,vertexCount:batch.triangles()*3-start})
  }
  const built=batch.build(root,'plan1-l2-furniture')
  return {root:built.mesh,placements:records,groups:[],colliders:records.map(p=>({id:p.id,...p.bounds})),dispose:()=>built.dispose()}
}

// Add the approved static appliances to the existing counter batch, not a new loop or atlas.
export function addPlan1Equipment(THREE,batch,area) {
  const devices=DATA.equipment[area].devices
  for(const p of devices) {
    const [w,d,h]=p.size,yaw=p.yawDeg*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw)
    const base=p.support.includes('下')?.13:p.support.includes('墙')?1.6:area==='centralIsland'?1.05:.995
    const box=(ww,hh,dd,x,y,z,color,metal=0)=>batch.add(new THREE.BoxGeometry(ww,hh,dd),color,[p.center.x+c*x+s*z,base+y,p.center.z-s*x+c*z],yaw,.45,metal)
    box(w,h,d,0,h/2,0,'#9A968E',.5)
    if(p.id.includes('sink')) {box(w*.78,.008,d*.75,0,h+.004,0,'#26333A');continue}
    if(p.id.includes('cup')) {
      box(w*.93,h*.75,d*.82,0,h*.55,d*.1,'#F4F1EA');continue
    }
    const front=-(d/2+.003)
    box(w*.85,h*.62,.006,0,h*.55,front,p.id.includes('pastry')||p.id.includes('cold')||p.id.includes('fridge')?'#B7C2B4':'#26333A')
    if(p.id.includes('espresso'))for(const x of [-w*.23,w*.23])box(.05,h*.2,.07,x,h*.25,front-.03,'#B89B64',.6)
    if(p.id.includes('menu'))for(let i=0;i<3;i++)box(w*.6,.012,.008,0,h*(.28+i*.18),front-.006,'#F4F1EA')
  }
  return devices
}
