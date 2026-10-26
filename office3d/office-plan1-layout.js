// OFFICE-PLAN-1 B-R3 的 L1 运行数据；仅由精确的 ALIGN 样板查询选用。
const region = (id, name, x0, x1, z0, z1, kind, walls, doors = [], footprint = null) => ({
  id, name, x0, x1, z0, z1, kind, walls, doors,
  // 只有封闭展示/会议房参与“整间房阻挡”；开放区的局部玻璃由外壳单独消费。
  walled: ['market', 'board', 'review', 'plan', 'service', 'aftersales', 'marketing'].includes(id),
  ...(footprint ? { footprint } : {}),
})

const PRODUCT_FOOTPRINT = [
  [5,-18],[19.3,-18],[19.3,-8.7],[7.565,-8.7],[7.47,-8.779],[7.373,-8.856],[7.274,-8.931],
  [7.175,-9.006],[7.075,-9.079],[6.974,-9.15],[6.872,-9.22],[6.768,-9.289],[6.664,-9.356],
  [6.559,-9.422],[6.453,-9.486],[6.346,-9.548],[6.238,-9.609],[6.129,-9.669],[6.02,-9.727],
  [5.909,-9.783],[5.798,-9.838],[5.686,-9.891],[5.574,-9.943],[5.46,-9.993],[5.346,-10.042],
  [5.231,-10.088],[5.116,-10.134],[5,-10.177],
].map(([x,z]) => ({ x, z }))

export const OFFICE_PLAN1_REGIONS = [
  region('market','市场部（展示）',-22,-15.2,-18,-10.2,'display',['solid','glass','glass','solid'],[{side:'south',at:-18.6,width:1.5}]),
  region('board','会议与决策·长桌',-14.8,-6,-18,-10.2,'room',['solid','glass','glass','glass'],[{side:'south',at:-7.2,width:1.5}]),
  region('review','会议与决策·圆桌A',-5.6,-1,-18,-14.2,'room',['solid','glass','glass','glass'],[{side:'east',at:-16.1,width:1.5}]),
  region('plan','会议与决策·圆桌B',-5.6,-1,-13.8,-10.2,'room',['glass','glass','glass','glass'],[{side:'east',at:-11.9,width:1.5}]),
  region('product-eng-knowledge','产品·工程·知识',5,19.3,-18,-8.7,'open',['solid','open','open','glass'],[],PRODUCT_FOOTPRINT),
  region('service','客服部（展示）',19.7,26,-18,-10.2,'display',['solid','solid','glass','glass'],[{side:'west',at:-14.1,width:1.5}]),
  region('ops','运维·质量与安全',-22,-7.9,-9.2,7.5,'open',['open','open','open','solid']),
  region('drlife','Dr.life+ 工作室',11.9,26,-7.5,7.5,'open',['open','solid','open','open']),
  region('aftersales','售后部（展示）',-22,-15.2,9.2,14.8,'display',['glass','glass','solid','solid'],[{side:'east',at:11.4,width:1.5}]),
  region('coffee','咖啡吧',-14.8,-7,9,16.2,'display',['open','glass','arc-front','glass']),
  region('foyer','前台与等候区',-6.6,8.6,8.5,17.8,'display',['open','glass','straight-front','glass'],[{side:'south',at:2,width:6}]),
  region('lounge','休闲会客区',9,18.8,9,16.2,'display',['open','glass','arc-front','glass']),
  region('marketing','营销部（展示）',19.2,26,9.2,14.8,'display',['glass','solid','solid','glass'],[{side:'west',at:11.4,width:1.5}]),
]

const s = (region, x, z, yaw, hx, hz) => [region, x, z, yaw, { x: hx, z: hz, yaw }]
export const OFFICE_PLAN1_SEATS = {
  OpsLead:s('ops',-17.05,-6.7,Math.PI/2,-18.05,-6.7), OpsEngineer:s('ops',-16.35,-3.9,-Math.PI/2,-15.35,-3.9),
  QAAutomation:s('ops',-12.05,-6,Math.PI/2,-13.05,-6), Reviewer1:s('ops',-11.35,-4.6,-Math.PI/2,-10.35,-4.6),
  Reviewer2:s('ops',-17.05,2.6,Math.PI/2,-18.05,2.6), SecurityReviewer:s('ops',-12.05,1.9,Math.PI/2,-13.05,1.9),
  Lead:s('product-eng-knowledge',6.7,-15.5,Math.PI,6.7,-16.5), PM:s('product-eng-knowledge',8.1,-14.8,0,8.1,-13.8),
  Architect:s('product-eng-knowledge',12.1,-15.5,Math.PI,12.1,-16.5), UIUX:s('product-eng-knowledge',12.1,-14.8,0,12.1,-13.8),
  FrontendSenior:s('product-eng-knowledge',14.9,-14.8,0,14.9,-13.8), Frontend1:s('product-eng-knowledge',7.95,-11.2,Math.PI,7.95,-12.2),
  Frontend2:s('product-eng-knowledge',9.35,-10.5,0,9.35,-9.5), BackendSenior:s('product-eng-knowledge',12.45,-11.2,Math.PI,12.45,-12.2),
  Backend1:s('product-eng-knowledge',13.85,-10.5,0,13.85,-9.5), Backend2:s('product-eng-knowledge',16.95,-11.2,Math.PI,16.95,-12.2),
  KnowledgeKeeper:s('product-eng-knowledge',18.35,-10.5,0,18.35,-9.5),
  GoSenior:s('drlife',14.85,-4.85,Math.PI/2,13.85,-4.85), Go1:s('drlife',15.55,-3.45,-Math.PI/2,16.55,-3.45),
  Go2:s('drlife',20.25,-4.85,Math.PI/2,19.25,-4.85), DBEngineer:s('drlife',20.95,-3.45,-Math.PI/2,21.95,-3.45),
  LedgerAuditor:s('drlife',14.85,1.5,Math.PI/2,13.85,1.5), ReactSenior:s('drlife',15.55,2.9,-Math.PI/2,16.55,2.9),
  React1:s('drlife',20.25,.8,Math.PI/2,19.25,.8), Localizer:s('drlife',20.95,3.6,-Math.PI/2,21.95,3.6),
}

const display = (prefix, region, cx, cz) => [[-.4,-.8,-Math.PI/2],[-.4,.8,-Math.PI/2],[.4,-.8,Math.PI/2]].map(([dx,dz,yaw],i)=>({
  id:`${prefix}-${i+1}`,region,x:cx+dx,z:cz+dz,yaw,home:{x:cx+dx+Math.sin(yaw),z:cz+dz},display:true,
}))
export const OFFICE_PLAN1_DISPLAY_SEATS = [
  ...display('market','market',-18.6,-14.1), ...display('service','service',22.85,-14.1),
  ...display('aftersales','aftersales',-18.6,12), ...display('marketing','marketing',22.6,12),
]

export const OFFICE_PLAN1_WALLS = Object.freeze({
  outerSolid: Object.freeze({ height: 4.5, thickness: .18, capHeight: .1, finish: '#F4F1EA' }),
  internalGlass: Object.freeze({ height: 2.7, baseThickness: .14, glassThickness: .018, frame: '#AA9472', targetOpacity: .1 }),
})

export function officePlan1InnerWalls(layout) {
  return layout.regions.flatMap(room => {
    const result = [], sides = ['north', 'east', 'south', 'west']
    for (const [index, side] of sides.entries()) {
      const kind = room.walls?.[index]
      if (!['solid', 'glass'].includes(kind)) continue
      let a, b
      if (side === 'north') { a = { x: room.x0, z: room.z0 }; b = { x: room.x1, z: room.z0 } }
      if (side === 'south') { a = { x: room.x1, z: room.z1 }; b = { x: room.x0, z: room.z1 } }
      if (side === 'west') {
        const end = room.footprint ? Math.max(...room.footprint.filter(point => Math.abs(point.x - room.x0) < 1e-6).map(point => point.z)) : room.z1
        a = { x: room.x0, z: end }; b = { x: room.x0, z: room.z0 }
      }
      if (side === 'east') { a = { x: room.x1, z: room.z0 }; b = { x: room.x1, z: room.z1 } }
      const door = room.doors?.find(item => item.side === side)
      if (!door) { result.push({ a, b, side, kind, room }); continue }
      const horizontal = side === 'north' || side === 'south', lo = door.at - door.width / 2, hi = door.at + door.width / 2
      if (horizontal) {
        const min = Math.min(a.x, b.x), max = Math.max(a.x, b.x)
        if (lo > min) result.push({ a: { x: min, z: a.z }, b: { x: lo, z: a.z }, side, kind, room })
        if (hi < max) result.push({ a: { x: hi, z: a.z }, b: { x: max, z: a.z }, side, kind, room })
      } else {
        const min = Math.min(a.z, b.z), max = Math.max(a.z, b.z)
        if (lo > min) result.push({ a: { x: a.x, z: min }, b: { x: a.x, z: lo }, side, kind, room })
        if (hi < max) result.push({ a: { x: a.x, z: hi }, b: { x: a.x, z: max }, side, kind, room })
      }
    }
    return result
  })
}

const roundSeats = (room, x, z) => Array.from({length:4},(_,i)=>{const a=i*Math.PI/2;return{room,x:x+Math.sin(a)*1.2,z:z+Math.cos(a)*1.2,yaw:a,meeting:true}})
const focus = Object.fromEntries(OFFICE_PLAN1_REGIONS.map(r=>[r.id,{label:r.name,t:[(r.x0+r.x1)/2,0,(r.z0+r.z1)/2],r:Math.max(r.x1-r.x0,r.z1-r.z0)+8}]))

export function makeOfficePlan1Layout(base) {
  const center={x:2,z:-2}
  return {
    ...structuredClone(base), plan1Phase:'L1', furnitureSample:true,
    site:{x0:-28,x1:32,z0:-18,z1:30}, envelope:{x0:-22,x1:26,z0:-18,z1:18},
    walls:structuredClone(OFFICE_PLAN1_WALLS),
    greenBuffer:{width:6,x0:-28,x1:32,z0:-18,z1:30},
    doors:{...structuredClone(base.doors),south:{x0:-1,x1:5,z:18,width:6,height:3.5}},
    entrance:{middle:{x0:-4,x1:8,z:18},gate:{x0:-1,x1:5,z:18,width:6},leftArc:{center:{x:-4,z:-37.5},radius:55.5,startDeg:108.925,endDeg:90,outer:{x:-22,z:15},inner:{x:-4,z:18}},rightArc:{center:{x:8,z:-37.5},radius:55.5,startDeg:90,endDeg:71.075,inner:{x:8,z:18},outer:{x:26,z:15}}},
    regions:structuredClone(OFFICE_PLAN1_REGIONS), rooms:structuredClone(OFFICE_PLAN1_REGIONS.filter(r=>r.walled)),
    seats:structuredClone(OFFICE_PLAN1_SEATS), displaySeats:structuredClone(OFFICE_PLAN1_DISPLAY_SEATS),
    meetingSeats:{A:4,B:4}, meetingSeatPoints:{A:roundSeats('A',-3.3,-16.1),B:roundSeats('B',-3.3,-11.9)},
    boardTable:{x:-10.4,z:-14.3}, boss:{...structuredClone(base.boss),desk:{x:-13.3,z:-11.4},stand:{x:-13.3,z:-10.3},region:'board'},
    frontDesk:{x0:-1,x1:5,z0:12,z1:13.4,center:{x:2,z:12.7}}, serviceBar:{x0:-13.8,x1:-8,z0:10,z1:11.2,center:{x:-10.9,z:10.6}}, waitingArc:{x0:3.8,x1:8,z0:10,z1:13,center:{x:5.9,z:11.5}},
    deskGroups:{ops:['OpsLead','OpsEngineer','QAAutomation','Reviewer1','Reviewer2','SecurityReviewer'],quality:[]},
    corridors:{centralRing:{center,r0:4.7,r1:8.7,width:4},north:{x0:-22,x1:26,z0:-10,z1:-8.7,width:1.3},south:{x0:-22,x1:26,z0:7.5,z1:9,width:1.5},vertical:{x0:-1,x1:5,z0:-10.2,z1:18,width:6}},
    passages:{westLoop:{x0:-7.9,x1:-6.4,z0:-9.2,z1:9,width:1.5},eastLoop:{x0:8.7,x1:11.9,z0:-8.7,z1:9,width:3.2}},
    island:{...structuredClone(base.island),center,radius:3.65,barOuter:3.65,stoolRadius:4.2,sofaOuter:4.35,diameter:7.3},
    ring:{center,inner:4.7,outer:8.7,width:4}, bar:{...structuredClone(base.bar),center,radius:3.65,seats:structuredClone(base.bar.seats).map(p=>({...p,x:center.x+(p.x-base.bar.center.x)*.72,z:center.z+(p.z-base.bar.center.z)*.72}))},
    foyer:{x0:-6.6,x1:8.6,z0:8.5,z1:17.8}, axis:{x:2,z:0},
    publicPathNodes:[{x:-7,z:-9.6},{x:-7,z:8.2},{x:10.5,z:-8},{x:10.5,z:8.2},{x:2,z:8.2},{x:2,z:16}],
    meetingAccess:{northZ:-9.6,westSpineX:-.25,eastSpineX:10.5,westMiddleZ:-2,eastMiddleZ:-2,eastSouthZ:8.2},
    regionFocus:{...focus,ops:{label:'运维·质量与安全',t:[-15,0,-.85],r:24},meet:{label:'会议与决策',t:[-7.9,0,-14],r:18},foyer:{label:'前厅接待区',t:[2,0,13],r:24},plaza:{label:'DR 广场',t:[2,0,24],r:25}},
    miniBounds:{x0:-30,x1:34,z0:-20,z1:32}, plaza:{...structuredClone(base.plaza),center:{x:2,z:24},diameter:10.8,radius:5.4},
  }
}
