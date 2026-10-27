import { buildOpenFurnishing } from './open-furnishing.js'
import { workstationDesktop } from '../office-furniture-v2.js'
import { OFFICE_THEME_V2 as THEME } from '../office-theme-v2.js'
import { officeLeafGeometry } from './plants.js'

// 桌椅与桌面设备沿用真实工位的资产、尺寸和玻璃面贴合，不造一张会议桌冒充工作岛。
export function appendMarketWorkIsland({THREE,context,plan,add,part,target}) {
  const required=['desk','chairDesk','computerScreen','computerKeyboard','computerMouse']
  if(typeof context.placeFurniture!=='function'||required.some(name=>!context.A?.furn?.[name]))throw new Error('MARKET_WORK_ISLAND_ASSETS_REQUIRED')
  const colorFor=m=>/carpet|fabric|cushion/i.test(m.name)?'#506A5A':/metalDark/i.test(m.name)?'#3D4541':/metal/i.test(m.name)?'#756D60':/wood/i.test(m.name)?'#C49A6C':THEME.nameplate
  const asset=(name,x,z,w,h,d,y=0,yaw=0)=>{
    const f=context.placeFurniture(context.A,name,x,z,{scale:1,y,rotY:yaw})
    f.group.scale.set(w/f.size.x,h/f.size.y,d/f.size.z);f.group.updateWorldMatrix(true,true)
    f.group.traverse(m=>{if(m.isMesh){const g=m.geometry.clone();g.applyMatrix4(m.matrixWorld);add(g,colorFor(Array.isArray(m.material)?m.material[0]:m.material),0,0,0)}})
  }
  const box=(x,y,z,w,h,d,color)=>add(new THREE.BoxGeometry(w,h,d),color,x,y,z)
  for(const s of plan.stations){
    part(s.id,'work-desk',()=>{
      asset('desk',s.x,s.z,1.4,.76,.7,0,s.yaw)
      const {monitor,keyboard,mouse,fit}=workstationDesktop(s)
      asset('computerScreen',monitor.x,monitor.z,.66,.46,.16,.76,s.yaw)
      asset('computerKeyboard',keyboard.x,keyboard.z,.42,.02,.14,.765,s.yaw)
      asset('computerMouse',mouse.x,mouse.z,.06,.025,.09,.765,s.yaw)
      const screen=new THREE.PlaneGeometry(fit.width,fit.height)
      screen.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(fit.pitch,fit.yaw,0,'YXZ')).setPosition(fit.center.x,fit.center.y,fit.center.z))
      add(screen,'#303F40',0,0,0)
    },target)
    part(s.chairId,'work-chair',()=>asset('chairDesk',s.home.x,s.home.z,.62,1.04,.6,0,s.yaw+Math.PI),target)
  }
  for(const p of [plan.divider,plan.cabinet])part(p.id,p===plan.divider?'divider':'wall-cabinet',()=>{
    const kind=p===plan.divider?'desk-divider':'cabinet',value=buildOpenFurnishing({THREE,root:new THREE.Group(),low:context.low,plan:{placements:[{...p,x:0,z:0,kind,sample:'market-work-island'}],groups:[]}})
    try{const g=value.root.geometry.clone();g.rotateY(p.yaw);g.translate(p.x,0,p.z);add(g,null,0,0,0)}finally{value.dispose()}
  },target)
  for(const [i,p]of plan.art.entries())part(p.id,'wall-art',()=>{
    box(p.x,p.y,p.z,p.w,p.h,p.d,'#B89B64')
    box(p.x,p.y,p.z+p.d/2+.004,p.w-.06,p.h-.06,.008,'#F4F1EA')
    box(p.x-.16,p.y+.08,p.z+p.d/2+.011,.22,.28,.006,['#B7C2B4','#C49A6C','#756D60'][i])
    box(p.x+.13,p.y-.07,p.z+p.d/2+.011,.24,.17,.006,['#C49A6C','#B7C2B4','#D9D3C6'][i])
    // 小支撑接触北侧实体饰面；前框不与墙共面，也不悬空。
    for(const dx of [-.3,.3])box(p.x+dx,p.y,p.z-.06,.04,.3,.02,'#756D60')
  },target)
  const p=plan.plants[1]
  part(p.id,'plant',()=>{
    add(new THREE.CylinderGeometry(.225,.20,.65,context.low?8:16,1,true),'#D9D3C6',p.x,.35,p.z)
    add(new THREE.CylinderGeometry(.20,.20,.01,context.low?8:16),'#534A3C',p.x,.669,p.z)
    if(!context.low)for(let i=0;i<10;i++)add(officeLeafGeometry(THREE,i*2.399,.19,5),i%3?'#4D6A46':'#708650',p.x,.73+(i%4)*.065,p.z)
  },target)
}
