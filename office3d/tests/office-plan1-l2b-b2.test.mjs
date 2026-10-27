import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN_L2B, LAYOUT_V3_ALIGN_SAMPLE, createOfficeNavigation, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { buildOfficeShellV3Spec } from '../office-layout-v3-scene.js'
import { officePlan1InnerWalls } from '../office-plan1-layout.js'
import { plan1FurniturePlan } from '../office-vis2/plan1-furniture.js'

const hooks=registerHooks({resolve(s,c,n){return s==='three'?{url:new URL('../vendor/three/three.module.js',import.meta.url).href,shortCircuit:true}:n(s,c)}})
const {GLTFLoader}=await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const {placeFurniture}=await import('../assets3d.js')
hooks.deregister()
const routeKey=r=>`${r.id}/${r.kind}/${r.key}`
const routesFor=layout=>{const nav=createOfficeNavigation(layout),spec=officeFurnitureV2Spec(layout),routes=[];for(const[id,data]of Object.entries(layout.seats)){const home=workHome(data),add=(kind,key,target,run,targetOwner=null)=>routes.push({id,kind,key,target,targetOwner,points:run()});add('exit','',null,()=>nav.officeExit(home));add('board','',null,()=>nav.boardTrip(home,layout.boss.stand));for(const[name,target]of Object.entries(layout.seats))add('office',name,workHome(target),()=>nav.officeTrip(home,workHome(target),workHome(target)),name);for(const[i,target]of nav.LOUNGE_SEATS.entries())add('lounge',String(i),target,()=>nav.loungeTrip(home,target));for(const room of spec.meetings)for(const[i,target]of room.seats.entries())add('meeting',`${room.id}:${i}`,target,()=>nav.meetingTrip(home,target));for(const[name,targets]of Object.entries(nav.consumerQueues))for(const[i,target]of targets.entries())add(`consumer-${name}`,String(i),target,()=>nav.consumerTrip(home,name,target))}return routes}
const rect=(id,x,z,w,d,owner)=>({id,owner,bounds:{x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2}})
const pointSegment=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=dx*dx+dz*dz?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz))):0;return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)}
const segmentSegment=(a,b,c,d)=>{const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x),on=(p,q,r)=>q.x>=Math.min(p.x,r.x)-1e-9&&q.x<=Math.max(p.x,r.x)+1e-9&&q.z>=Math.min(p.z,r.z)-1e-9&&q.z<=Math.max(p.z,r.z)+1e-9,v=[cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)];if(v[0]*v[1]<0&&v[2]*v[3]<0||Math.abs(v[0])<1e-9&&on(a,c,b)||Math.abs(v[1])<1e-9&&on(a,d,b)||Math.abs(v[2])<1e-9&&on(c,a,d)||Math.abs(v[3])<1e-9&&on(c,b,d))return 0;return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))}
const segmentBox=(a,b,q)=>{if([a,b].some(p=>p.x>=q.x0&&p.x<=q.x1&&p.z>=q.z0&&p.z<=q.z1))return 0;const c=[{x:q.x0,z:q.z0},{x:q.x1,z:q.z0},{x:q.x1,z:q.z1},{x:q.x0,z:q.z1}];return Math.min(...c.map((p,i)=>segmentSegment(a,b,p,c[(i+1)%4])))}
const segmentCircle=(a,b,c)=>pointSegment({x:c.x,z:c.z},a,b)-c.radius
const boxGap=(a,b)=>Math.hypot(Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z))
const boxIssues=(r,obstacles,excluded=new Set())=>{const issues=[];for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i];for(const item of obstacles){if(excluded.has(item.id))continue;const gap=segmentBox(a,b,item.bounds);if(gap<.28-1e-6)issues.push({route:routeKey(r),obstacle:item.id,gap,segment:[a,b],owner:item.owner})}}return issues}
const modelBox=(models,name,seat,w,h,d,yaw=seat.yaw||0)=>{const f=placeFurniture({furn:models},name,seat.x,seat.z,{scale:1,rotY:yaw+Math.PI});f.group.scale.set(w/f.size.x,h/f.size.y,d/f.size.z);f.group.updateMatrixWorld(true);return new THREE.Box3().setFromObject(f.group)}
const b2Rooms={A:{x0:-5.6,x1:-1,z0:-19,z1:-14.8},B:{x0:-5.6,x1:-1,z0:-14.4,z1:-10.2}}

test('OFFICE-L2B B2: Ø1.4 rooms, real Box3, reachable seats, all-route clearance and R5 wall whitelist',async t=>{
 const layout=LAYOUT_V3_ALIGN_L2B,spec=officeFurnitureV2Spec(layout),models={}
 for(const name of ['chairModernCushion','table','chairDesk']){const bytes=fs.readFileSync(new URL(`../assets/models/furniture/${name}.glb`,import.meta.url));models[name]=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene}
 const actual=routesFor(layout),baselineLayout=structuredClone(layout);baselineLayout.plan1Phase='L2';const baseline=routesFor(baselineLayout),baselineMap=new Map(baseline.map(r=>[routeKey(r),r]))
 const frozenL2=officeFurnitureV2Spec(LAYOUT_V3_ALIGN_SAMPLE).meetings
 assert.deepEqual(frozenL2.map(r=>[r.id,r.w]),[['A',1.2],['B',1]])
 assert.ok(Math.abs(Math.hypot(frozenL2[0].seats[0].x-frozenL2[0].x,frozenL2[0].seats[0].z-frozenL2[0].z)-.96)<1e-9)
 assert.ok(Math.abs(Math.hypot(frozenL2[1].seats[0].x-frozenL2[1].x,frozenL2[1].seats[0].z-frozenL2[1].z)-.86)<1e-9)
 assert.equal(actual.length,1825);assert.equal(baseline.length,1825)
 const changed=actual.filter(r=>JSON.stringify(r.points)!==JSON.stringify(baselineMap.get(routeKey(r)).points));assert.equal(changed.length,200);assert.ok(changed.every(r=>r.kind==='meeting'))
 for(const r of actual){assert.ok(r.points.length&&r.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),`${routeKey(r)} finite`);if(r.kind!=='meeting')assert.deepEqual(r.points,baselineMap.get(routeKey(r)).points,`${routeKey(r)} nonmeeting unchanged`)}
 const roomRows=[],meetingBoxes=new Map(),tableCircles=[]
 for(const room of spec.meetings){const expectedSeats=room.id==='A'?[[-3.3,-15.7],[-2.1,-16.9],[-3.3,-18.1],[-4.5,-16.9]]:[[-3.3,-11.1],[-2.1,-12.3],[-3.3,-13.5],[-4.5,-12.3]],bounds=b2Rooms[room.id],table=modelBox(models,'table',{x:room.x,z:room.z},1,.76,1),chairs=room.seats.map(s=>modelBox(models,'chairModernCushion',s,.62,1.04,.6)),disk={x:room.x,z:room.z,radius:.7}
  for(const dx of [-.7,.7])for(const dz of [-.7,.7])table.expandByPoint(new THREE.Vector3(room.x+dx,table.min.y,room.z+dz))
  assert.equal(room.w,1.4,`${room.id} diameter`);assert.equal(room.d,1.4);assert.deepEqual([room.x,room.z],room.id==='A'?[-3.3,-16.9]:[-3.3,-12.3]);assert.equal(room.seats.length,4)
  const seats=room.seats.map((s,i)=>{assert.ok(Math.hypot(s.x-expectedSeats[i][0],s.z-expectedSeats[i][1])<.001,`${room.id}/${i} seat coordinate`);assert.equal(s.yaw,i*Math.PI/2,`${room.id}/${i} yaw`);return{x:s.x,z:s.z,yaw:s.yaw}})
  const gaps=[]
  for(let i=0;i<4;i++){const b=chairs[i],radial=i===0?b.min.z-(room.z+.7):i===1?b.min.x-(room.x+.7):i===2?(room.z-.7)-b.max.z:(room.x-.7)-b.max.x;gaps.push(radial);assert.ok(radial>=.03-1e-6,`${room.id}/${i} table edge to chair front ${radial}`);assert.ok(radial>0,`${room.id}/${i} no penetration`);for(const other of [table,...chairs.filter((_,j)=>j!==i)])assert.ok(boxGap(b,other)>0,`${room.id}/${i} Box3 nonpenetration`);const clearance=Math.min(b.min.x-bounds.x0,bounds.x1-b.max.x,b.min.z-bounds.z0,bounds.z1-b.max.z);assert.ok(clearance>=-1e-6,`${room.id}/${i} inside room`);meetingBoxes.set(`${room.id}:${i}`,b)}
  const tableClearance=Math.min(table.min.x-bounds.x0,bounds.x1-table.max.x,table.min.z-bounds.z0,bounds.z1-table.max.z);assert.ok(tableClearance>=-1e-6,`${room.id} table inside room`);tableCircles.push(disk);roomRows.push({room:room.id,diameter:room.w,seatRadius:1.2,seats,minChairWallClearance:Math.min(...chairs.flatMap(b=>[b.min.x-bounds.x0,bounds.x1-b.max.x,b.min.z-bounds.z0,bounds.z1-b.max.z])),tableWallClearance:tableClearance,tableChairFrontGaps:gaps})
 }
 const items=plan1FurniturePlan(layout).map(p=>({id:p.id,bounds:p.bounds}))
 for(const[id,data]of Object.entries(layout.seats)){const[,x,z,yaw,home]=data,w=Math.abs(Math.cos(yaw))*1.4+Math.abs(Math.sin(yaw))*.7,d=Math.abs(Math.sin(yaw))*1.4+Math.abs(Math.cos(yaw))*.7;items.push(rect(`${id}-desk`,x,z,w,d,id),rect(`${id}-chair`,home.x,home.z,.62,.6,id))}
 items.push(rect('board-table',spec.board.x,spec.board.z,spec.board.w,spec.board.d),rect('boss-desk',spec.boss.desk.x,spec.boss.desk.z,1.4,.7))
 {const b=modelBox(models,'chairDesk',spec.boss.chair,.62,1.04,.6);items.push({id:'boss-chair',bounds:{x0:b.min.x,x1:b.max.x,z0:b.min.z,z1:b.max.z}})}
 for(const seat of spec.boardSeats)items.push({id:'board-chair',bounds:(()=>{const b=modelBox(models,'chairModernCushion',seat,.62,1.04,.6);return{x0:b.min.x,x1:b.max.x,z0:b.min.z,z1:b.max.z}})()})
 const itemIds=new Set([...items.map(item=>item.id),...[...meetingBoxes.keys()].map(key=>`meeting-chair-${key}`)])
 const exclusionRows=actual.map(r=>{const ids=new Set([`${r.id}-desk`,`${r.id}-chair`]);if(r.kind==='office'&&r.targetOwner&&r.targetOwner!==r.id){ids.add(`${r.targetOwner}-desk`);ids.add(`${r.targetOwner}-chair`)}if(r.kind==='meeting')ids.add(`meeting-chair-${r.target.room}:${Number(r.key.split(':')[1])}`);return{route:routeKey(r),ids:[...ids].sort()}})
 assert.equal(exclusionRows.length,1825);assert.equal(new Set(exclusionRows.map(row=>row.route)).size,1825)
 const exclusionByRoute=new Map(exclusionRows.map(row=>[row.route,new Set(row.ids)]))
 for(const r of actual){const expected=new Set([`${r.id}-desk`,`${r.id}-chair`]);if(r.kind==='office'&&r.targetOwner&&r.targetOwner!==r.id){expected.add(`${r.targetOwner}-desk`);expected.add(`${r.targetOwner}-chair`)}if(r.kind==='meeting')expected.add(`meeting-chair-${r.target.room}:${Number(r.key.split(':')[1])}`);assert.deepEqual(exclusionByRoute.get(routeKey(r)),expected,`${routeKey(r)} has only its approved endpoint furniture ids`)}
 const exclusionPairs=exclusionRows.flatMap(row=>row.ids.map(id=>[row.route,id]))
 assert.ok(exclusionPairs.every(([,id])=>itemIds.has(id)),'every exclusion names one exact existing furniture id')
 const excludedClasses={sourceSeatDeskAndChair:actual.length*2,officeTargetSeatDeskAndChair:actual.filter(r=>r.kind==='office'&&r.targetOwner&&r.targetOwner!==r.id).length*2,meetingTargetChair:actual.filter(r=>r.kind==='meeting').length}
 assert.deepEqual(excludedClasses,{sourceSeatDeskAndChair:3650,officeTargetSeatDeskAndChair:1200,meetingTargetChair:200})
 assert.equal(exclusionPairs.length,5050,'3650 source seat objects + 1200 distinct office target objects + 200 meeting target chairs')
 assert.equal(new Set(exclusionPairs.map(pair=>JSON.stringify(pair))).size,5050,'route-key/furniture-id exclusions are unique')
 const doorFrames=spec.meetings.flatMap(room=>{const region=layout.regions.find(r=>r.id===(room.id==='A'?'review':'plan')),door=region.doors.find(d=>d.side==='east');return[-1,1].map(side=>({a:{x:region.x1,z:door.at+side*door.width/2},b:{x:region.x1,z:door.at+side*door.width/2},side:'doorframe',room:region}))}),walls=[...officePlan1InnerWalls(layout).filter(w=>w.a&&w.b),...doorFrames],furnitureIssues=[],strictFurnitureIssues=[],wallIssues=[],routeByKey=new Map(actual.map(r=>[routeKey(r),r]))
 for(const r of actual){const excluded=exclusionByRoute.get(routeKey(r)),strictTargetChair=r.kind==='meeting'?`meeting-chair-${r.target.room}:${Number(r.key.split(':')[1])}`:null;strictFurnitureIssues.push(...boxIssues(r,items));furnitureIssues.push(...boxIssues(r,items,excluded));for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i];for(const circle of tableCircles){const gap=segmentCircle(a,b,circle);if(gap<.28-1e-6){const issue={route:routeKey(r),obstacle:`meeting-table-${circle.x},${circle.z}`,gap,segment:[a,b]};strictFurnitureIssues.push(issue);furnitureIssues.push(issue)}}for(const[key,box]of meetingBoxes){const chairId=`meeting-chair-${key}`;if(chairId===strictTargetChair)continue;const gap=segmentBox(a,b,{x0:box.min.x,x1:box.max.x,z0:box.min.z,z1:box.max.z});if(gap<.28-1e-6){const issue={route:routeKey(r),obstacle:chairId,gap,segment:[a,b]};strictFurnitureIssues.push(issue);if(!excluded.has(chairId))furnitureIssues.push(issue)}}for(const wall of walls){const gap=segmentSegment(a,b,wall.a,wall.b);if(gap<.28-1e-6)wallIssues.push({route:routeKey(r),obstacle:`wall-${wall.room?.id||wall.side}`,gap,segment:[a,b]})}}}
 const strictGroups=new Map();for(const issue of strictFurnitureIssues){const route=routeByKey.get(issue.route),item=items.find(x=>x.id===issue.obstacle),role=item?.owner===route?.id?'出发者工位':item?.owner===route?.targetOwner&&route?.kind==='office'?'office目标工位':'其他',kind=issue.obstacle.endsWith('-chair')?'椅':issue.obstacle.endsWith('-desk')?'桌':'其他',key=`${role}/${kind}`;strictGroups.set(key,(strictGroups.get(key)||0)+1)}
 assert.equal(strictFurnitureIssues.length,2450,'strict R1 log is reproduced before endpoint furniture exclusions')
 assert.ok([...strictGroups.keys()].every(key=>!key.startsWith('其他/')),'all strict failures are endpoint-owned workstation furniture')
 const reverseRoute=actual.find(r=>r.kind==='meeting'),reverseSegment=reverseRoute.points.slice(1).map((b,i)=>[reverseRoute.points[i],b]).find(([a,b])=>Math.hypot(b.x-a.x,b.z-a.z)>.001),[ra,rb]=reverseSegment,mid={x:(ra.x+rb.x)/2,z:(ra.z+rb.z)/2},probe={id:'non-owned-reverse-probe',owner:'not-an-endpoint',bounds:{x0:mid.x-.01,x1:mid.x+.01,z0:mid.z-.01,z1:mid.z+.01}}
 assert.ok(!exclusionByRoute.get(routeKey(reverseRoute)).has(probe.id));assert.ok(boxIssues(reverseRoute,[probe],exclusionByRoute.get(routeKey(reverseRoute))).length>0,'a non-owned box placed on a route is still detected')
 assert.equal(furnitureIssues.length,0,JSON.stringify(furnitureIssues.slice(0,20),null,2))
 const expectedWalls=Object.keys(layout.seats).flatMap(id=>[{route:`${id}/board/`,obstacle:'wall-board',gap:.1,segment:[{x:-7.2,z:-10.3},{x:-13.3,z:-10.3}]},{route:`${id}/consumer-A2/2`,obstacle:'wall-coffee',gap:.2,segment:[{x:-7.45,z:9.2},{x:-7.2,z:9.2}]},{route:`${id}/consumer-B1/3`,obstacle:'wall-foyer',gap:Math.sqrt(.05),segment:[{x:8.5,z:18.75},{x:8.5,z:18}]}])
 const wallKey=i=>JSON.stringify([i.route,i.obstacle,i.segment]),actualWalls=new Map(wallIssues.map(i=>[wallKey(i),i]));assert.equal(wallIssues.length,75,JSON.stringify(wallIssues.slice(0,10),null,2));assert.equal(actualWalls.size,75);for(const e of expectedWalls)assert.ok(Math.abs(actualWalls.get(wallKey(e))?.gap-e.gap)<1e-9,`wall whitelist ${wallKey(e)}`)
 const meetingRoutes=actual.filter(r=>r.kind==='meeting');assert.equal(meetingRoutes.length,200);for(const r of meetingRoutes){const room=r.target.room==='A'?'review':'plan',door=layout.regions.find(x=>x.id===room).doors[0],inside={x:-1.4,z:door.at};assert.ok(r.points.some(p=>p.x===inside.x&&p.z===inside.z),`${routeKey(r)} D6 door point`);const targetIndex=Number(r.key.split(':')[1]),seat=spec.meetings.find(m=>m.id===r.target.room).seats[targetIndex];assert.ok(Math.hypot(r.points.at(-1).x-seat.x,r.points.at(-1).z-seat.z)<=.001,`${routeKey(r)} endpoint`)}
 t.diagnostic(JSON.stringify({routes:actual.length,changedMeetingRoutes:changed.length,nonMeetingUnchanged:1625,strictLiteralViolations:strictFurnitureIssues.length,strictViolationClasses:Object.fromEntries(strictGroups),excludedRouteFurniturePairs:exclusionPairs.length,excludedClasses,reverseNonOwnedProbe:'detected',finalFurnitureViolations:furnitureIssues.length,wallWhitelist:wallIssues.length,rooms:roomRows,doorInteriorX:-1.4,explicitExclusions:exclusionRows},null,2))
})

