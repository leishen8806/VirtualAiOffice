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
  southProfile: Object.freeze([{x:-22,h:4.5},{x:-15.2,h:4.5},{x:-4,h:1.2},{x:8,h:1.2},{x:19.2,h:4.5},{x:26,h:4.5}].map(Object.freeze)),
  gatePost: Object.freeze({width:.3,depth:.3,height:2.4,color:'#B89B64'}),
  reception: Object.freeze({z:8.5,wallWidth:4,wallHeight:3,wallDepth:.14,doorWidth:2.6,doorHeight:2.7,frameWidth:.05,leafFrameWidth:.07,doorFrameColor:'#705735',sensorRadius:2.2,openSeconds:.6,closeDelay:1,closeSeconds:.8,glassOpacity:.35,glassColor:'#E8E0D0',glassRoughness:.12,columnWidth:.8,columnDepth:.8,columnHeight:3.6,leafWidth:1.3,leafExposure:.45,leafGap:.03,trackHeight:.14}),
})

export function officePlan1SouthHeight(layout, x) {
  const points=layout.walls.southProfile
  for(let i=1;i<points.length;i++)if(x<=points[i].x){const a=points[i-1],b=points[i];return a.h+(b.h-a.h)*Math.max(0,(x-a.x)/(b.x-a.x))}
  return points.at(-1).h
}

export const officePlan1Phase = layout => layout?.plan1Phase === 'L2B' ? 'L2' : layout?.plan1Phase

export function officePlan1Reception(layout) {
  const s=layout.walls?.reception
  if(!s)return null
  const cx=layout.frontDesk.center.x, room=layout.regions.find(r=>r.id==='foyer')
  const wall={x0:cx-s.wallWidth/2,x1:cx+s.wallWidth/2,z0:s.z-s.wallDepth/2,z1:s.z+s.wallDepth/2,height:s.wallHeight,kind:'solid'}
  const doors=[{x0:wall.x0-s.doorWidth,x1:wall.x0},{x0:wall.x1,x1:wall.x1+s.doorWidth}].map((d,i)=>({...d,id:i?'east':'west',z:s.z,height:s.doorHeight}))
  const columns=[{x0:doors[0].x0-s.columnWidth,x1:doors[0].x0},{x0:doors[1].x1,x1:doors[1].x1+s.columnWidth}].map(d=>({...d,z0:s.z-s.columnDepth/2,z1:s.z+s.columnDepth/2,height:s.columnHeight,kind:'column'}))
  const partitions=[{x0:room.x0,x1:columns[0].x0},{x0:columns[1].x1,x1:room.x1}].map(d=>({...d,z0:s.z-layout.walls.internalGlass.baseThickness/2,z1:s.z+layout.walls.internalGlass.baseThickness/2,height:layout.walls.internalGlass.height,kind:'glass'}))
  // 北侧双轨分别贴柱/中墙表面，净距30mm；南侧停放会侵入已冻结排队点的人员净距。
  const leaves=doors.flatMap((d,i)=>[0,1].map(side=>{
    const wallSide=i!==side, surface=wallSide?wall:columns[i], z0=surface.z0-s.leafGap-s.frameWidth
    return{x0:side?d.x1-s.leafExposure:d.x0+s.leafExposure-s.leafWidth,x1:side?d.x1-s.leafExposure+s.leafWidth:d.x0+s.leafExposure,z0,z1:z0+s.frameWidth,height:s.doorHeight,kind:'leaf',id:d.id+'-'+side,surface:wallSide?'wall':'column'}
  }))
  doors.forEach(d=>{d.clearX0=d.x0+s.leafExposure;d.clearX1=d.x1-s.leafExposure})
  return {spec:s,centerX:cx,wall,doors,columns,partitions,leaves,blockers:[wall,...columns,...partitions,...leaves]}
}

export function officePlan1InnerWalls(layout) {
  const walls=layout.regions.flatMap(room => {
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
  const reception=officePlan1Reception(layout), room=layout.regions.find(r=>r.id==='foyer')
  // 柱和开启门扇按四条边加入既有墙线口径，不扩大或放宽路线避障阈值。
  if(reception)for(const box of reception.blockers){
    const corners=[{x:box.x0,z:box.z0},{x:box.x1,z:box.z0},{x:box.x1,z:box.z1},{x:box.x0,z:box.z1}]
    corners.forEach((a,i)=>walls.push({a,b:corners[(i+1)%4],side:'north',kind:box.kind,room,reception:true}))
  }
  return walls
}

const roundSeats = (room, x, z) => Array.from({length:4},(_,i)=>{const a=i*Math.PI/2;return{room,x:x+Math.sin(a)*1.2,z:z+Math.cos(a)*1.2,yaw:a,meeting:true}})
const focus = Object.fromEntries(OFFICE_PLAN1_REGIONS.map(r=>[r.id,{label:r.name,t:[(r.x0+r.x1)/2,0,(r.z0+r.z1)/2],r:Math.max(r.x1-r.x0,r.z1-r.z0)+8}]))

export function makeOfficePlan1Layout(base) {
  const center={x:2,z:-2}
  return {
    ...structuredClone(base), plan1Phase:'L2', furnitureSample:true,
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

export function makeOfficePlan1L2BLayout(base) {
  const layout = makeOfficePlan1Layout(base)
  layout.plan1Phase = 'L2B'
  layout.site.z0 = layout.envelope.z0 = layout.greenBuffer.z0 = -19
  layout.doors.north.z = -19
  layout.regions = layout.regions.map(room => ({
    ...room,
    ...( ['market', 'board', 'review', 'product-eng-knowledge', 'service'].includes(room.id) ? { z0: -19 } : {}),
    ...(room.id === 'review' ? { z1: -14.8 } : {}),
    ...(room.id === 'plan' ? { z0: -14.4 } : {}),
  }))
  layout.rooms = layout.regions.filter(room => room.walled)
  layout.meetingSeatPoints = Object.fromEntries([['A', -16.9, .96], ['B', -12.3, .86]].map(([id, z, radius]) => [id,
    Array.from({ length: 4 }, (_, i) => { const angle = i * Math.PI / 2; return { room: id, x: -3.3 + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius, yaw: angle, meeting: true } }),
  ]))
  layout.miniBounds.z0 = -21
  return layout
}

// OFFICE-L2：批准的 B-R3 数据子集；不改变真实工位或 L1 回退数据。
export const OFFICE_PLAN1_L2 = {
  "islands": [
    {
      "id": "ops-1",
      "region": "ops",
      "center": {
        "x": -16.7,
        "z": -5.3
      },
      "axis": "NS",
      "capacity": 6,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "OpsLead",
          "deskCenter": {
            "x": -17.05,
            "z": -6.7
          },
          "home": {
            "x": -18.05,
            "z": -6.7
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -18.36,
            "x1": -17.740000000000002,
            "z0": -7,
            "z1": -6.4,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -17.05,
            "z": -5.3
          },
          "home": {
            "x": -18.05,
            "z": -5.3
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -18.36,
            "x1": -17.740000000000002,
            "z0": -5.6,
            "z1": -5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -17.05,
            "z": -3.9
          },
          "home": {
            "x": -18.05,
            "z": -3.9
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -18.36,
            "x1": -17.740000000000002,
            "z0": -4.2,
            "z1": -3.6,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -16.35,
            "z": -6.7
          },
          "home": {
            "x": -15.35,
            "z": -6.7
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -15.66,
            "x1": -15.04,
            "z0": -7,
            "z1": -6.4,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 5,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -16.35,
            "z": -5.3
          },
          "home": {
            "x": -15.35,
            "z": -5.3
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -15.66,
            "x1": -15.04,
            "z0": -5.6,
            "z1": -5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 6,
          "kind": "real",
          "identity": "OpsEngineer",
          "deskCenter": {
            "x": -16.35,
            "z": -3.9
          },
          "home": {
            "x": -15.35,
            "z": -3.9
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -15.66,
            "x1": -15.04,
            "z0": -4.2,
            "z1": -3.6,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "ops-2",
      "region": "ops",
      "center": {
        "x": -11.7,
        "z": -5.3
      },
      "axis": "NS",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "QAAutomation",
          "deskCenter": {
            "x": -12.05,
            "z": -6
          },
          "home": {
            "x": -13.05,
            "z": -6
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -13.360000000000001,
            "x1": -12.74,
            "z0": -6.3,
            "z1": -5.7,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -12.05,
            "z": -4.6
          },
          "home": {
            "x": -13.05,
            "z": -4.6
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -13.360000000000001,
            "x1": -12.74,
            "z0": -4.8999999999999995,
            "z1": -4.3,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -11.35,
            "z": -6
          },
          "home": {
            "x": -10.35,
            "z": -6
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -10.66,
            "x1": -10.04,
            "z0": -6.3,
            "z1": -5.7,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "Reviewer1",
          "deskCenter": {
            "x": -11.35,
            "z": -4.6
          },
          "home": {
            "x": -10.35,
            "z": -4.6
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -10.66,
            "x1": -10.04,
            "z0": -4.8999999999999995,
            "z1": -4.3,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "ops-3",
      "region": "ops",
      "center": {
        "x": -16.7,
        "z": 1.2
      },
      "axis": "NS",
      "capacity": 6,
      "seats": [
        {
          "slot": 1,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -17.05,
            "z": -0.2
          },
          "home": {
            "x": -18.05,
            "z": -0.2
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -18.36,
            "x1": -17.740000000000002,
            "z0": -0.5,
            "z1": 0.09999999999999998,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -17.05,
            "z": 1.2
          },
          "home": {
            "x": -18.05,
            "z": 1.2
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -18.36,
            "x1": -17.740000000000002,
            "z0": 0.8999999999999999,
            "z1": 1.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "real",
          "identity": "Reviewer2",
          "deskCenter": {
            "x": -17.05,
            "z": 2.6
          },
          "home": {
            "x": -18.05,
            "z": 2.6
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -18.36,
            "x1": -17.740000000000002,
            "z0": 2.3000000000000003,
            "z1": 2.9,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -16.35,
            "z": -0.2
          },
          "home": {
            "x": -15.35,
            "z": -0.2
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -15.66,
            "x1": -15.04,
            "z0": -0.5,
            "z1": 0.09999999999999998,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 5,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -16.35,
            "z": 1.2
          },
          "home": {
            "x": -15.35,
            "z": 1.2
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -15.66,
            "x1": -15.04,
            "z0": 0.8999999999999999,
            "z1": 1.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 6,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -16.35,
            "z": 2.6
          },
          "home": {
            "x": -15.35,
            "z": 2.6
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -15.66,
            "x1": -15.04,
            "z0": 2.3000000000000003,
            "z1": 2.9,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "ops-4",
      "region": "ops",
      "center": {
        "x": -11.7,
        "z": 1.2
      },
      "axis": "NS",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -12.05,
            "z": 0.5
          },
          "home": {
            "x": -13.05,
            "z": 0.5
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -13.360000000000001,
            "x1": -12.74,
            "z0": 0.2,
            "z1": 0.8,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "real",
          "identity": "SecurityReviewer",
          "deskCenter": {
            "x": -12.05,
            "z": 1.9
          },
          "home": {
            "x": -13.05,
            "z": 1.9
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": -13.360000000000001,
            "x1": -12.74,
            "z0": 1.5999999999999999,
            "z1": 2.1999999999999997,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -11.35,
            "z": 0.5
          },
          "home": {
            "x": -10.35,
            "z": 0.5
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -10.66,
            "x1": -10.04,
            "z0": 0.2,
            "z1": 0.8,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": -11.35,
            "z": 1.9
          },
          "home": {
            "x": -10.35,
            "z": 1.9
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": -10.66,
            "x1": -10.04,
            "z0": 1.5999999999999999,
            "z1": 2.1999999999999997,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "pek-1",
      "region": "product-eng-knowledge",
      "center": {
        "x": 7.4,
        "z": -15.15
      },
      "axis": "EW",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "Lead",
          "deskCenter": {
            "x": 6.7,
            "z": -15.5
          },
          "home": {
            "x": 6.7,
            "z": -16.5
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 6.390000000000001,
            "x1": 7.01,
            "z0": -16.8,
            "z1": -16.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 8.1,
            "z": -15.5
          },
          "home": {
            "x": 8.1,
            "z": -16.5
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 7.79,
            "x1": 8.41,
            "z0": -16.8,
            "z1": -16.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 6.7,
            "z": -14.8
          },
          "home": {
            "x": 6.7,
            "z": -13.8
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 6.390000000000001,
            "x1": 7.01,
            "z0": -14.100000000000001,
            "z1": -13.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "PM",
          "deskCenter": {
            "x": 8.1,
            "z": -14.8
          },
          "home": {
            "x": 8.1,
            "z": -13.8
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 7.79,
            "x1": 8.41,
            "z0": -14.100000000000001,
            "z1": -13.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "pek-2",
      "region": "product-eng-knowledge",
      "center": {
        "x": 13.5,
        "z": -15.15
      },
      "axis": "EW",
      "capacity": 6,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "Architect",
          "deskCenter": {
            "x": 12.1,
            "z": -15.5
          },
          "home": {
            "x": 12.1,
            "z": -16.5
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 11.79,
            "x1": 12.41,
            "z0": -16.8,
            "z1": -16.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 13.5,
            "z": -15.5
          },
          "home": {
            "x": 13.5,
            "z": -16.5
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 13.19,
            "x1": 13.81,
            "z0": -16.8,
            "z1": -16.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 14.9,
            "z": -15.5
          },
          "home": {
            "x": 14.9,
            "z": -16.5
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 14.59,
            "x1": 15.21,
            "z0": -16.8,
            "z1": -16.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "UIUX",
          "deskCenter": {
            "x": 12.1,
            "z": -14.8
          },
          "home": {
            "x": 12.1,
            "z": -13.8
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 11.79,
            "x1": 12.41,
            "z0": -14.100000000000001,
            "z1": -13.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 5,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 13.5,
            "z": -14.8
          },
          "home": {
            "x": 13.5,
            "z": -13.8
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 13.19,
            "x1": 13.81,
            "z0": -14.100000000000001,
            "z1": -13.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 6,
          "kind": "real",
          "identity": "FrontendSenior",
          "deskCenter": {
            "x": 14.9,
            "z": -14.8
          },
          "home": {
            "x": 14.9,
            "z": -13.8
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 14.59,
            "x1": 15.21,
            "z0": -14.100000000000001,
            "z1": -13.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "pek-3",
      "region": "product-eng-knowledge",
      "center": {
        "x": 8.65,
        "z": -10.85
      },
      "axis": "EW",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "Frontend1",
          "deskCenter": {
            "x": 7.95,
            "z": -11.2
          },
          "home": {
            "x": 7.95,
            "z": -12.2
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 7.640000000000001,
            "x1": 8.26,
            "z0": -12.5,
            "z1": -11.899999999999999,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 9.35,
            "z": -11.2
          },
          "home": {
            "x": 9.35,
            "z": -12.2
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 9.04,
            "x1": 9.66,
            "z0": -12.5,
            "z1": -11.899999999999999,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 7.95,
            "z": -10.5
          },
          "home": {
            "x": 7.95,
            "z": -9.5
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 7.640000000000001,
            "x1": 8.26,
            "z0": -9.8,
            "z1": -9.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "Frontend2",
          "deskCenter": {
            "x": 9.35,
            "z": -10.5
          },
          "home": {
            "x": 9.35,
            "z": -9.5
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 9.04,
            "x1": 9.66,
            "z0": -9.8,
            "z1": -9.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "pek-4",
      "region": "product-eng-knowledge",
      "center": {
        "x": 13.15,
        "z": -10.85
      },
      "axis": "EW",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "BackendSenior",
          "deskCenter": {
            "x": 12.45,
            "z": -11.2
          },
          "home": {
            "x": 12.45,
            "z": -12.2
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 12.139999999999999,
            "x1": 12.76,
            "z0": -12.5,
            "z1": -11.899999999999999,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 13.85,
            "z": -11.2
          },
          "home": {
            "x": 13.85,
            "z": -12.2
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 13.54,
            "x1": 14.16,
            "z0": -12.5,
            "z1": -11.899999999999999,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 12.45,
            "z": -10.5
          },
          "home": {
            "x": 12.45,
            "z": -9.5
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 12.139999999999999,
            "x1": 12.76,
            "z0": -9.8,
            "z1": -9.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "Backend1",
          "deskCenter": {
            "x": 13.85,
            "z": -10.5
          },
          "home": {
            "x": 13.85,
            "z": -9.5
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 13.54,
            "x1": 14.16,
            "z0": -9.8,
            "z1": -9.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "pek-5",
      "region": "product-eng-knowledge",
      "center": {
        "x": 17.65,
        "z": -10.85
      },
      "axis": "EW",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "Backend2",
          "deskCenter": {
            "x": 16.95,
            "z": -11.2
          },
          "home": {
            "x": 16.95,
            "z": -12.2
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 16.64,
            "x1": 17.259999999999998,
            "z0": -12.5,
            "z1": -11.899999999999999,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 18.35,
            "z": -11.2
          },
          "home": {
            "x": 18.35,
            "z": -12.2
          },
          "yawDeg": 180,
          "chairEnvelope": {
            "x0": 18.040000000000003,
            "x1": 18.66,
            "z0": -12.5,
            "z1": -11.899999999999999,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 16.95,
            "z": -10.5
          },
          "home": {
            "x": 16.95,
            "z": -9.5
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 16.64,
            "x1": 17.259999999999998,
            "z0": -9.8,
            "z1": -9.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "KnowledgeKeeper",
          "deskCenter": {
            "x": 18.35,
            "z": -10.5
          },
          "home": {
            "x": 18.35,
            "z": -9.5
          },
          "yawDeg": 0,
          "chairEnvelope": {
            "x0": 18.040000000000003,
            "x1": 18.66,
            "z0": -9.8,
            "z1": -9.2,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "dr-1",
      "region": "drlife",
      "center": {
        "x": 15.2,
        "z": -4.15
      },
      "axis": "NS",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "GoSenior",
          "deskCenter": {
            "x": 14.85,
            "z": -4.85
          },
          "home": {
            "x": 13.85,
            "z": -4.85
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 13.54,
            "x1": 14.16,
            "z0": -5.1499999999999995,
            "z1": -4.55,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 14.85,
            "z": -3.45
          },
          "home": {
            "x": 13.85,
            "z": -3.45
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 13.54,
            "x1": 14.16,
            "z0": -3.75,
            "z1": -3.1500000000000004,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 15.55,
            "z": -4.85
          },
          "home": {
            "x": 16.55,
            "z": -4.85
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 16.240000000000002,
            "x1": 16.86,
            "z0": -5.1499999999999995,
            "z1": -4.55,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "Go1",
          "deskCenter": {
            "x": 15.55,
            "z": -3.45
          },
          "home": {
            "x": 16.55,
            "z": -3.45
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 16.240000000000002,
            "x1": 16.86,
            "z0": -3.75,
            "z1": -3.1500000000000004,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "dr-2",
      "region": "drlife",
      "center": {
        "x": 20.6,
        "z": -4.15
      },
      "axis": "NS",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "Go2",
          "deskCenter": {
            "x": 20.25,
            "z": -4.85
          },
          "home": {
            "x": 19.25,
            "z": -4.85
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 18.94,
            "x1": 19.56,
            "z0": -5.1499999999999995,
            "z1": -4.55,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 20.25,
            "z": -3.45
          },
          "home": {
            "x": 19.25,
            "z": -3.45
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 18.94,
            "x1": 19.56,
            "z0": -3.75,
            "z1": -3.1500000000000004,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 20.95,
            "z": -4.85
          },
          "home": {
            "x": 21.95,
            "z": -4.85
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 21.64,
            "x1": 22.259999999999998,
            "z0": -5.1499999999999995,
            "z1": -4.55,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "DBEngineer",
          "deskCenter": {
            "x": 20.95,
            "z": -3.45
          },
          "home": {
            "x": 21.95,
            "z": -3.45
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 21.64,
            "x1": 22.259999999999998,
            "z0": -3.75,
            "z1": -3.1500000000000004,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "dr-3",
      "region": "drlife",
      "center": {
        "x": 15.2,
        "z": 2.2
      },
      "axis": "NS",
      "capacity": 4,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "LedgerAuditor",
          "deskCenter": {
            "x": 14.85,
            "z": 1.5
          },
          "home": {
            "x": 13.85,
            "z": 1.5
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 13.54,
            "x1": 14.16,
            "z0": 1.2,
            "z1": 1.8,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 14.85,
            "z": 2.9
          },
          "home": {
            "x": 13.85,
            "z": 2.9
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 13.54,
            "x1": 14.16,
            "z0": 2.6,
            "z1": 3.1999999999999997,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 15.55,
            "z": 1.5
          },
          "home": {
            "x": 16.55,
            "z": 1.5
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 16.240000000000002,
            "x1": 16.86,
            "z0": 1.2,
            "z1": 1.8,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "real",
          "identity": "ReactSenior",
          "deskCenter": {
            "x": 15.55,
            "z": 2.9
          },
          "home": {
            "x": 16.55,
            "z": 2.9
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 16.240000000000002,
            "x1": 16.86,
            "z0": 2.6,
            "z1": 3.1999999999999997,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    },
    {
      "id": "dr-4",
      "region": "drlife",
      "center": {
        "x": 20.6,
        "z": 2.2
      },
      "axis": "NS",
      "capacity": 6,
      "seats": [
        {
          "slot": 1,
          "kind": "real",
          "identity": "React1",
          "deskCenter": {
            "x": 20.25,
            "z": 0.8
          },
          "home": {
            "x": 19.25,
            "z": 0.8
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 18.94,
            "x1": 19.56,
            "z0": 0.5,
            "z1": 1.1,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 2,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 20.25,
            "z": 2.2
          },
          "home": {
            "x": 19.25,
            "z": 2.2
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 18.94,
            "x1": 19.56,
            "z0": 1.9000000000000001,
            "z1": 2.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 3,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 20.25,
            "z": 3.6
          },
          "home": {
            "x": 19.25,
            "z": 3.6
          },
          "yawDeg": 90,
          "chairEnvelope": {
            "x0": 18.94,
            "x1": 19.56,
            "z0": 3.3000000000000003,
            "z1": 3.9,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 4,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 20.95,
            "z": 0.8
          },
          "home": {
            "x": 21.95,
            "z": 0.8
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 21.64,
            "x1": 22.259999999999998,
            "z0": 0.5,
            "z1": 1.1,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 5,
          "kind": "empty",
          "identity": null,
          "deskCenter": {
            "x": 20.95,
            "z": 2.2
          },
          "home": {
            "x": 21.95,
            "z": 2.2
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 21.64,
            "x1": 22.259999999999998,
            "z0": 1.9000000000000001,
            "z1": 2.5,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        },
        {
          "slot": 6,
          "kind": "real",
          "identity": "Localizer",
          "deskCenter": {
            "x": 20.95,
            "z": 3.6
          },
          "home": {
            "x": 21.95,
            "z": 3.6
          },
          "yawDeg": 270,
          "chairEnvelope": {
            "x0": 21.64,
            "x1": 22.259999999999998,
            "z0": 3.3000000000000003,
            "z1": 3.9,
            "width": 0.62,
            "depth": 0.6,
            "area": 0.372
          }
        }
      ]
    }
  ],
  "support": [
    {
      "id": "ops-screen-wall",
      "region": "ops",
      "kind": "wall-screen",
      "bounds": {
        "x0": -16.6,
        "x1": -12,
        "z0": -9.15,
        "z1": -8.85,
        "width": 4.6,
        "depth": 0.3,
        "area": 1.38
      },
      "mount": "north wall",
      "components": [
        "4.6m信息屏",
        "低柜"
      ]
    },
    {
      "id": "ops-sofa-corner",
      "region": "ops",
      "kind": "sofa-corner",
      "bounds": {
        "x0": -21.5,
        "x1": -19.6,
        "z0": -7.7,
        "z1": -3.8,
        "width": 1.9,
        "depth": 3.9,
        "area": 7.41
      },
      "components": [
        "L形沙发",
        "圆几",
        "落地灯"
      ]
    },
    {
      "id": "pek-book-wall",
      "region": "product-eng-knowledge",
      "kind": "book-wall",
      "bounds": {
        "x0": 12.4,
        "x1": 18.7,
        "z0": -18,
        "z1": -17.9,
        "width": 6.3,
        "depth": 0.1,
        "area": 0.63
      },
      "mount": "recessed north wall",
      "components": [
        "6.3m嵌入式书墙",
        "展示格"
      ]
    },
    {
      "id": "drlife-book-wall",
      "region": "drlife",
      "kind": "book-wall",
      "bounds": {
        "x0": 17,
        "x1": 23.4,
        "z0": -7.45,
        "z1": -7,
        "width": 6.4,
        "depth": 0.45,
        "area": 2.88
      },
      "mount": "north wall",
      "components": [
        "6.4m书架",
        "作品展示格"
      ]
    },
    {
      "id": "drlife-sofa-corner",
      "region": "drlife",
      "kind": "sofa-corner",
      "bounds": {
        "x0": 23.4,
        "x1": 25.4,
        "z0": -5.8,
        "z1": -2.2,
        "width": 2,
        "depth": 3.6,
        "area": 7.2
      },
      "components": [
        "双人弧沙发",
        "圆几",
        "边几"
      ]
    },
    {
      "id": "coffee-counter",
      "region": "coffee",
      "kind": "coffee-bar",
      "bounds": {
        "x0": -13.8,
        "x1": -8.1,
        "z0": 10.1,
        "z1": 11.2,
        "width": 5.7,
        "depth": 1.1,
        "area": 6.27
      },
      "components": [
        "5.7m吧台",
        "后柜",
        "咖啡设备",
        "4吧椅"
      ]
    },
    {
      "id": "reception",
      "region": "foyer",
      "kind": "reception",
      "bounds": {
        "x0": -2,
        "x1": 6,
        "z0": 11.7,
        "z1": 13.2,
        "width": 8,
        "depth": 1.5,
        "area": 12
      },
      "components": [
        "弧形前台",
        "品牌背景墙",
        "接待工位"
      ]
    },
    {
      "id": "foyer-wait-west",
      "region": "foyer",
      "kind": "waiting-seats",
      "bounds": {
        "x0": -5.8,
        "x1": -2.8,
        "z0": 14,
        "z1": 16.2,
        "width": 3,
        "depth": 2.2,
        "area": 6.6
      },
      "components": [
        "双人沙发",
        "圆几"
      ]
    },
    {
      "id": "foyer-wait-east",
      "region": "foyer",
      "kind": "waiting-seats",
      "bounds": {
        "x0": 3.2,
        "x1": 6.2,
        "z0": 14,
        "z1": 16.2,
        "width": 3,
        "depth": 2.2,
        "area": 6.6
      },
      "components": [
        "双人沙发",
        "圆几"
      ]
    },
    {
      "id": "lounge-sofa",
      "region": "lounge",
      "kind": "lounge-group",
      "bounds": {
        "x0": 11,
        "x1": 16.8,
        "z0": 11,
        "z1": 14.6,
        "width": 5.8,
        "depth": 3.6,
        "area": 20.88
      },
      "components": [
        "弧形组合沙发",
        "双圆几",
        "边几"
      ]
    }
  ],
  "meetings": {
    "board": {
      "table": {
        "center": {
          "x": -10.4,
          "z": -14.3
        },
        "size": [
          5.2,
          1.4
        ],
        "seats": 10
      },
      "screenWall": "north",
      "cabinet": {
        "x0": -14.3,
        "x1": -12.8,
        "z0": -17.5,
        "z1": -17,
        "width": 1.5,
        "depth": 0.5,
        "area": 0.75
      }
    },
    "review": {
      "table": {
        "center": {
          "x": -3.3,
          "z": -16.1
        },
        "diameter": 1.4,
        "seats": 4
      },
      "screenWall": "west"
    },
    "plan": {
      "table": {
        "center": {
          "x": -3.3,
          "z": -11.9
        },
        "diameter": 1.4,
        "seats": 4
      },
      "screenWall": "west"
    },
    "directorDesk": {
      "status": "建议",
      "center": {
        "x": -13.3,
        "z": -11.4
      },
      "size": [
        1.8,
        0.8
      ],
      "region": "board",
      "businessIdentity": null,
      "reason": "概念图没有老板桌；作为董事会共享访客席靠会议区南侧，避免引入第26个Agent或占用中央主轴。实施前需董事会单独确认。"
    }
  },
  "equipment": {
    "coordinateRule": "yawDeg: 0=北、90=东、180=南、270=西；size=[宽,深,高]，单位m",
    "centralIsland": {
      "devices": [
        {
          "id": "island-espresso",
          "name": "双头咖啡机",
          "zone": "central",
          "center": {
            "x": 0.337,
            "z": -4.376
          },
          "size": [
            0.85,
            0.45,
            0.52
          ],
          "yawDeg": 325,
          "support": "环形台面"
        },
        {
          "id": "island-grinder",
          "name": "磨豆机",
          "zone": "central",
          "center": {
            "x": -0.376,
            "z": -3.663
          },
          "size": [
            0.26,
            0.26,
            0.52
          ],
          "yawDeg": 305,
          "support": "环形台面"
        },
        {
          "id": "island-tea",
          "name": "热水/茶饮机",
          "zone": "central",
          "center": {
            "x": 3.864,
            "z": -4.222
          },
          "size": [
            0.52,
            0.38,
            0.58
          ],
          "yawDeg": 40,
          "support": "环形台面"
        },
        {
          "id": "island-cold-display",
          "name": "展示冷柜",
          "zone": "central",
          "center": {
            "x": 4.689,
            "z": -3.086
          },
          "size": [
            0.82,
            0.42,
            0.45
          ],
          "yawDeg": 68,
          "support": "环形台面"
        },
        {
          "id": "island-pastry",
          "name": "糕点展示柜",
          "zone": "central",
          "center": {
            "x": 4.561,
            "z": -0.639
          },
          "size": [
            0.9,
            0.44,
            0.48
          ],
          "yawDeg": 118,
          "support": "环形台面"
        },
        {
          "id": "island-sink",
          "name": "嵌入式水槽",
          "zone": "central",
          "center": {
            "x": 0.774,
            "z": 0.628
          },
          "size": [
            0.62,
            0.44,
            0.08
          ],
          "yawDeg": 205,
          "support": "环形台面嵌入"
        },
        {
          "id": "island-cup-rack",
          "name": "杯架/杯具",
          "zone": "central",
          "center": {
            "x": -0.376,
            "z": -0.337
          },
          "size": [
            0.72,
            0.28,
            0.42
          ],
          "yawDeg": 235,
          "support": "环形台面"
        },
        {
          "id": "island-menu",
          "name": "双面菜单屏",
          "zone": "central",
          "center": {
            "x": 2,
            "z": -4.75
          },
          "size": [
            0.72,
            0.08,
            0.42
          ],
          "yawDeg": 0,
          "support": "台面支架"
        }
      ],
      "stools": [
        {
          "id": "island-stool-01",
          "zone": "central",
          "center": {
            "x": 0.392,
            "z": 1.881
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 22.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-02",
          "zone": "central",
          "center": {
            "x": -0.971,
            "z": 0.971
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 45,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-03",
          "zone": "central",
          "center": {
            "x": -1.881,
            "z": -0.392
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 67.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-04",
          "zone": "central",
          "center": {
            "x": -1.881,
            "z": -3.608
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 112.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-05",
          "zone": "central",
          "center": {
            "x": -0.971,
            "z": -4.971
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 135,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-06",
          "zone": "central",
          "center": {
            "x": 0.392,
            "z": -5.881
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 157.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-07",
          "zone": "central",
          "center": {
            "x": 2,
            "z": -6.201
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 180,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-08",
          "zone": "central",
          "center": {
            "x": 3.608,
            "z": -5.881
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 202.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-09",
          "zone": "central",
          "center": {
            "x": 4.971,
            "z": -4.971
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 225,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-10",
          "zone": "central",
          "center": {
            "x": 5.881,
            "z": -3.608
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 247.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-11",
          "zone": "central",
          "center": {
            "x": 5.881,
            "z": -0.392
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 292.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-12",
          "zone": "central",
          "center": {
            "x": 4.971,
            "z": 0.971
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 315,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-13",
          "zone": "central",
          "center": {
            "x": 3.608,
            "z": 1.881
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 337.5,
          "support": "floor",
          "note": "面向岛台"
        },
        {
          "id": "island-stool-14",
          "zone": "central",
          "center": {
            "x": 2,
            "z": 2.201
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 0,
          "support": "floor",
          "note": "面向岛台"
        }
      ],
      "operatorAccess": [
        "east opening",
        "west opening"
      ],
      "countertopAnnulus": [
        2.05,
        3.65
      ]
    },
    "southCafe": {
      "devices": [
        {
          "id": "cafe-espresso",
          "name": "双头咖啡机",
          "zone": "coffee",
          "center": {
            "x": -10.25,
            "z": 10.43
          },
          "size": [
            0.85,
            0.45,
            0.52
          ],
          "yawDeg": 180,
          "support": "吧台台面"
        },
        {
          "id": "cafe-grinder",
          "name": "磨豆机",
          "zone": "coffee",
          "center": {
            "x": -11.05,
            "z": 10.43
          },
          "size": [
            0.26,
            0.26,
            0.52
          ],
          "yawDeg": 180,
          "support": "吧台台面"
        },
        {
          "id": "cafe-tea",
          "name": "热水/茶饮机",
          "zone": "coffee",
          "center": {
            "x": -9.35,
            "z": 10.43
          },
          "size": [
            0.52,
            0.38,
            0.58
          ],
          "yawDeg": 180,
          "support": "吧台台面"
        },
        {
          "id": "cafe-cold-fridge",
          "name": "台下冷柜",
          "zone": "coffee",
          "center": {
            "x": -12.75,
            "z": 10.62
          },
          "size": [
            0.8,
            0.7,
            0.85
          ],
          "yawDeg": 180,
          "support": "吧台下柜"
        },
        {
          "id": "cafe-pastry",
          "name": "糕点展示柜",
          "zone": "coffee",
          "center": {
            "x": -8.65,
            "z": 10.43
          },
          "size": [
            0.82,
            0.42,
            0.48
          ],
          "yawDeg": 180,
          "support": "吧台台面"
        },
        {
          "id": "cafe-sink",
          "name": "嵌入式水槽",
          "zone": "coffee",
          "center": {
            "x": -12.05,
            "z": 10.5
          },
          "size": [
            0.62,
            0.44,
            0.08
          ],
          "yawDeg": 180,
          "support": "吧台台面嵌入"
        },
        {
          "id": "cafe-cup-rack",
          "name": "杯架/杯具",
          "zone": "coffee",
          "center": {
            "x": -13.35,
            "z": 10.4
          },
          "size": [
            0.6,
            0.26,
            0.42
          ],
          "yawDeg": 180,
          "support": "吧台台面"
        },
        {
          "id": "cafe-menu",
          "name": "菜单屏",
          "zone": "coffee",
          "center": {
            "x": -10.95,
            "z": 9.25
          },
          "size": [
            1.1,
            0.08,
            0.62
          ],
          "yawDeg": 180,
          "support": "北侧后墙"
        }
      ],
      "stools": [
        {
          "id": "cafe-stool-01",
          "zone": "coffee",
          "center": {
            "x": -12.9,
            "z": 11.9
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 0,
          "support": "floor",
          "note": "面向北侧咖啡吧台"
        },
        {
          "id": "cafe-stool-02",
          "zone": "coffee",
          "center": {
            "x": -11.5,
            "z": 11.9
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 0,
          "support": "floor",
          "note": "面向北侧咖啡吧台"
        },
        {
          "id": "cafe-stool-03",
          "zone": "coffee",
          "center": {
            "x": -10.1,
            "z": 11.9
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 0,
          "support": "floor",
          "note": "面向北侧咖啡吧台"
        },
        {
          "id": "cafe-stool-04",
          "zone": "coffee",
          "center": {
            "x": -8.7,
            "z": 11.9
          },
          "diameter": 0.5,
          "height": 0.78,
          "yawDeg": 0,
          "support": "floor",
          "note": "面向北侧咖啡吧台"
        }
      ],
      "counterBounds": {
        "x0": -13.8,
        "x1": -8.1,
        "z0": 10.1,
        "z1": 11.2,
        "width": 5.7,
        "depth": 1.1,
        "area": 6.27
      }
    }
  }
}
