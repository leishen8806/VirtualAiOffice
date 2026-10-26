import { CAMPUS_FINISHED_FLOOR_Y } from './dr-campus-shell.js'

const rect = (id,x0,x1,z0,z1) => Object.freeze({id,x0,x1,z0,z1})
export const B4_PLAN = Object.freeze({
  parking: Object.freeze(Array.from({length:4},(_,i)=>rect(`FP-0${i+1}`,-98+i*4.3,-94.2+i*4.3,21,23.1))),
  visitor: rect('L04',-167,-116,29,30.8),
  main: rect('F-MAIN',-164,-105.3,-4.25,-.75),
  receiving: rect('F-RCV-01',-145.5,-142,-15.42,-3),
  shipping: Object.freeze([[-106.75,12.95],[-106.75,17.5],[-91,17.5],[-91,13.15]].map(Object.freeze)),
  turns: Object.freeze([[-143.75,-15.42],[-143.75,-3],[-118,-2.5],[-112,-2.5],[-106,-2.5]].map(([x,z],i)=>Object.freeze({id:`TURN-${i+1}`,x,z,radius:2.25}))),
  forklift: Object.freeze({length:2.8,width:1.1,height:3.4,forkLength:1.2}),
})

// 以整车（含货叉）外包络 2.8 × 1.1 m 建模，沿本地 +z 前进。
export function forkliftParts() {
  const parts=[],add=(part,x,y,z,sx,sy,sz,color,shape='box')=>parts.push({part,x,y,z,sx,sy,sz,color,shape})
  add('counterweight',0,.57,-.89,1.05,.66,.96,0xe4a844)
  add('chassis',0,.33,-.60,1.1,.20,1.6,0x34404a)
  add('seat',0,.91,-.62,.48,.16,.42,0x242b30)
  add('seat-back',0,1.17,-.84,.48,.46,.12,0x242b30)
  add('console',0,1.13,-.12,.48,.15,.20,0x34404a)
  for(const x of [-.45,.45]) {
    for(const z of [-1.14,.05])add('guard-post',x,1.34,z,.07,1.45,.07,0x34404a)
    add('mast',x,1.77,.15,.10,3.26,.10,0x34404a)
    for(const z of [-1.03,-.10])add('wheel',x,.23,z,.20,.46,.46,0x242b30,'wheel')
  }
  add('overhead-guard',0,2.04,-.55,1.04,.12,1.4,0xe4a844)
  for(const x of [-.28,.28])add('fork',x,.12,.8,.13,.08,1.2,0x34404a)
  add('carriage',0,.58,.20,1.0,.58,.08,0x34404a)
  return parts
}

export function truckParts() {
  const parts=[],add=(part,x,y,z,sx,sy,sz,color,shape='box')=>parts.push({part,x,y,z,sx,sy,sz,color,shape})
  add('cargo-box',0,1.85,-1.05,2.55,2.6,6.9,0xf2f4f5)
  add('cab',0,1.18,3.45,2.45,1.50,2.1,0xf2f4f5)
  add('cab-roof',0,2.02,3.29,2.45,.18,1.78,0xf2f4f5)
  add('windscreen',0,1.61,4.46,2.02,.62,.04,0x426979)
  add('bumper',0,.58,4.42,2.5,.16,.16,0x34404a)
  add('grille',0,.95,4.475,1.1,.25,.03,0x26333a)
  for(const x of [-1.24,1.24]) {
    add('side-window',x,1.65,3.45,.02,.55,1.35,0x426979)
    for(const z of [-3.05,-1.35,3.05]) {
      add('wheel',x*.94,.41,z,.20,.82,.82,0x242b30,'wheel')
      add('wheel-arch-top',x,.91,z,.07,.12,1.03,0x34404a)
      for(const d of [-.48,.48])add('wheel-arch-side',x,.68,z+d,.07,.46,.10,0x34404a)
    }
  }
  for(const x of [-.595,.595]) {
    add('rear-door',x,1.86,-4.48,1.17,2.35,.04,0xdce2df)
    add('rear-lock',x,1.87,-4.495,.045,2.05,.01,0x627079)
    add('rear-handle',x,1.45,-4.495,.22,.045,.01,0x627079)
    add('tail-light',x*1.65,.60,-4.49,.22,.14,.02,0xd05242)
    add('head-light',x*1.65,1.0,4.48,.24,.16,.04,0xffe6ad)
  }
  return parts
}

export function buildCampusVehicleMarkings({THREE,root,canvasTex}) {
  const group=new THREE.Group();group.name='campus-b4-markings';root.add(group)
  const pieces=[],floor=CAMPUS_FINISHED_FLOOR_Y
  const box=(name,x,z,sx,sz,color,y=floor+.025,sy=.025)=>pieces.push({name,x,y,z,sx,sy,sz,color})
  const outline=(r,color)=>{const x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2;for(const end of [r.z0+.025,r.z1-.025])box(r.id,x,end,r.x1-r.x0,.05,color);for(const end of [r.x0+.025,r.x1-.025])box(r.id,end,z,.05,r.z1-r.z0,color)}
  for(const r of [...B4_PLAN.parking,B4_PLAN.main,B4_PLAN.receiving])outline(r,0xe9bf59)
  const walk=B4_PLAN.visitor;box('L04-surface',(walk.x0+walk.x1)/2,(walk.z0+walk.z1)/2,walk.x1-walk.x0,walk.z1-walk.z0,0x718f83,floor+.02,.02)
  // 北侧低栏隔开作业区，栏杆放在人行带外，不挤占 1.8 m 净宽。
  box('L04-curb',-141.5,28.82,51,.18,0xd5af62,floor+.10,.20)
  box('L04-rail',-141.5,28.82,51,.06,0x344b58,floor+.85,.08)
  for(let x=walk.x0;x<=walk.x1;x+=3)box('L04-post',x,28.82,.08,.08,0x344b58,floor+.43,.86)
  const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial({roughness:.72,metalness:.18})
  const mesh=new THREE.InstancedMesh(geometry,material,pieces.length);mesh.name='campus-b4-markings-boxes';mesh.userData.qualityProxy=true;mesh.userData.parts=pieces
  const m=new THREE.Matrix4(),q=new THREE.Quaternion()
  pieces.forEach((p,i)=>{mesh.setMatrixAt(i,m.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(p.sx,p.sy,p.sz)));mesh.setColorAt(i,new THREE.Color(p.color))});group.add(mesh)
  let texture,labels,labelsMaterial
  if(canvasTex){
    texture=canvasTex(1024,128,(ctx,w,h)=>{ctx.fillStyle='#fff0bb';ctx.textAlign='center';ctx.font='bold 54px sans-serif';B4_PLAN.parking.forEach((p,i)=>ctx.fillText(p.id,(i+.5)*w/4,h*.65))})
    const g=new THREE.BufferGeometry(),pos=[],uv=[],idx=[]
    B4_PLAN.parking.forEach((p,i)=>{const x=(p.x0+p.x1)/2,z=(p.z0+p.z1)/2,n=pos.length/3;pos.push(x-.75,floor+.045,z-.24,x+.75,floor+.045,z-.24,x+.75,floor+.045,z+.24,x-.75,floor+.045,z+.24);uv.push(i/4,1,(i+1)/4,1,(i+1)/4,0,i/4,0);idx.push(n,n+2,n+1,n,n+3,n+2)})
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals()
    labelsMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});labels=new THREE.Mesh(g,labelsMaterial);labels.name='campus-b4-parking-labels';group.add(labels)
  }
  return {plan:B4_PLAN,root:group,dispose(){geometry.dispose();material.dispose();labels?.geometry.dispose();labelsMaterial?.dispose();texture?.dispose();group.removeFromParent()}}
}
