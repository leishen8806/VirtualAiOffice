import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN as layout,createOfficeNavigation} from '../office-layout.js'
import {buildOfficePlazaHost} from '../office-vis2/plaza-host.js'
import {plazaFlowerArcs} from '../office-vis2/plaza.js'
import {createFurnitureCollision} from '../furniture-collision.js'

const intersects=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1

test('ALIGN front flower arcs widen toward the entrance while retaining the full axis and legacy sectors',()=>{
  const arcs=plazaFlowerArcs(layout),legacy=plazaFlowerArcs(LAYOUT_V3)
  assert.equal(arcs.length,4);assert.equal(legacy.length,4)
  for(const [index,arc]of arcs.entries()){
    assert.ok(!intersects(arc.bounds,{x0:0,x1:4,z0:12,z1:32.5}));assert.ok(arc.bounds.z1<=32.5)
    const first=index%2===0
    assert.ok(Math.abs(arc.span-(first?12:8)*Math.PI/180)<1e-9)
    assert.ok(Math.abs(legacy[index].span-(first?7:8)*Math.PI/180)<1e-9)
  }
})

test('actual rounded planters retain rim height and occupancy while floral detail stays within both native tiers',()=>{
  const nav=createOfficeNavigation(layout),before=JSON.stringify(layout)
  for(const low of[false,true]){
    const root=new THREE.Group(),world=createFurnitureCollision(),host=buildOfficePlazaHost({THREE,root,layout,low,collision:world,search:'?officeSample=1'})
    try{
      root.updateMatrixWorld(true);const meshes=root.children.filter(m=>m.isMesh&&m.visible),solid=root.getObjectByName('office-plaza-props')
      const triangles=meshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)
      assert.ok(triangles<=(low?27540:20620));assert.equal(meshes.length,low?1:2)
      assert.equal(host.placements.filter(p=>p.kind==='vendors').length,4);assert.equal(host.placements.filter(p=>p.kind==='trees').length,8)
      assert.equal(host.placements.filter(p=>p.kind==='benches').length,6)
      for(const planter of host.placements.filter(p=>p.kind==='flowers')){
        const ray=(dx,dz)=>new THREE.Raycaster(new THREE.Vector3(planter.x+dx,1,planter.z+dz),new THREE.Vector3(0,-1,0)).intersectObject(solid)
        assert.equal(ray(1.49,.39).length,0,'outer corner is truly rounded geometry, not a painted rectangle')
        assert.ok(Math.abs(ray(1.49,0)[0].point.y-.45)<1e-6,'stone lip retains its original top')
      }
      const stems=solid.geometry.attributes,stemColor=new THREE.Color('#526448')
      const rooted=(x,z,bottom,top)=>{
        const ys=[]
        for(let i=0;i<stems.position.count;i++)if(Math.abs(stems.color.getX(i)-stemColor.r)<1e-6&&Math.abs(stems.color.getY(i)-stemColor.g)<1e-6&&Math.abs(stems.color.getZ(i)-stemColor.b)<1e-6&&Math.hypot(stems.position.getX(i)-x,stems.position.getZ(i)-z)<.02)ys.push(stems.position.getY(i))
        assert.ok(ys.length>=24,'a real solid stem supports the cluster')
        assert.ok(Math.abs(Math.min(...ys)-bottom)<1e-5);assert.ok(Math.abs(Math.max(...ys)-top)<1e-5)
      }
      for(const p of host.placements.filter(p=>p.kind==='flowers'))rooted(p.x-1.25,p.z-.23,.475,.79)
      for(const arc of plazaFlowerArcs(layout)){
        const a=arc.start+arc.span*.1,x=layout.plaza.center.x+Math.sin(a)*11.22,z=layout.plaza.center.z+Math.cos(a)*11.22
        rooted(x,z,.353,.63)
        const hits=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0)).intersectObject(solid)
        assert.ok(hits.some(h=>Math.abs(h.point.y-.3515)<1e-5&&h.face.normal.y>.99),'inset soil is visible, upward-facing and just below the stem')
      }
      for(const point of Object.values(nav.consumerQueues).flat())assert.equal(world.hit(point.x,point.z)===null,true)
      for(const mesh of meshes){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal
        for(let i=0;i<p.count;i++){
          assert.ok(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i)))
          assert.ok(host.placements.some(({bounds:b})=>p.getX(i)>=b.x0-.001&&p.getX(i)<=b.x1+.001&&p.getZ(i)>=b.z0-.001&&p.getZ(i)<=b.z1+.001&&p.getY(i)>=b.y0-.001&&p.getY(i)<=b.y1+.001),'every visible flower vertex is represented by an exported placement')
        }
      }
      for(const p of host.placements.filter(p=>p.kind==='flowers'||p.kind==='flower-arc'))for(const other of host.placements)if(p!==other)assert.equal(intersects(p.bounds,other.bounds),false,p.id+' / '+other.id)
      assert.equal(world.stats().bodies,host.placements.length)
    }finally{host.dispose();host.dispose()}
    assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0)
  }
  assert.equal(JSON.stringify(layout),before)
})
