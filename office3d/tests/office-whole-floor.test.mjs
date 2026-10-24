import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { wholeFloorSpec } from '../office-vis2/whole-floor.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'
import { buildOfficeAlignedZones } from '../office-vis2/zone-finish.js'

test('whole-floor details preserve frozen seats, keep floor/desk/wall occupancy and south entrance',()=>{
  const before=JSON.stringify(LAYOUT_V3), spec=wholeFloorSpec(LAYOUT_V3), b=LAYOUT_V3.greenBuffer
  assert.deepEqual(spec,wholeFloorSpec(LAYOUT_V3));assert.equal(JSON.stringify(LAYOUT_V3),before)
  assert.equal(new Set(spec.details.filter(p=>p.kind==='desk-tray').map(p=>p.owner)).size,25)
  for(const p of spec.details) {
    if(p.kind==='desk-tray'||p.kind==='desk-book') {
      const [,x,z]=LAYOUT_V3.seats[p.owner]
      assert.ok(p.x-p.w/2>=x-.7&&p.x+p.w/2<=x+.7&&p.z-p.d/2>=z-.35&&p.z+p.d/2<=z+.35)
    } else {
      const r=LAYOUT_V3.regions.find(r=>r.id===p.owner)
      assert.ok(p.x-p.w/2>=r.x0&&p.x+p.w/2<=r.x1&&p.z-p.d/2>=r.z0&&p.z+p.d/2<=r.z1)
      if(p.kind.startsWith('ceiling')||p.kind==='light-recess')assert.ok(p.y-p.h/2>2.8)
      if(p.kind==='wall-slat')assert.ok(p.z+p.d/2<=r.z0+.14)
      if(p.kind.startsWith('desk-group'))assert.ok(p.y+p.h/2<.1)
    }
  }
  assert.equal(new Set(spec.beds.map(p=>p.side)).size,4)
  for(const p of spec.beds) {
    assert.ok(p.x-p.w/2>=b.x0&&p.x+p.w/2<=b.x1&&p.z-p.d/2>=b.z0&&p.z+p.d/2<=b.z1)
    const e=LAYOUT_V3.envelope
    assert.ok(p.x+p.w/2<=e.x0||p.x-p.w/2>=e.x1||p.z+p.d/2<=e.z0||p.z-p.d/2>=e.z1)
    if(p.side==='south')assert.ok(p.x+p.w/2<0||p.x-p.w/2>4)
  }
})

test('whole-floor shares existing batches and repeatedly releases owned garden and surfaces',()=>{
  for(const low of [false,true])for(let repeat=0;repeat<3;repeat++) {
    const root=new THREE.Group(), resources=new Set(), released=new Set()
    const shell=buildOfficeAlignedShell({THREE,root,layout:LAYOUT_V3,low,search:'?officeSample=1'})
    assert.equal(shell.green.visible,false)
    const meshes=root.children.filter(m=>m.name.startsWith('office-aligned-'))
    assert.equal(meshes.length,low?2:3)
    for(const m of meshes)for(const r of [m.geometry,m.material]) {
      resources.add(r.uuid);r.addEventListener('dispose',()=>released.add(r.uuid))
    }
    const garden=root.getObjectByName('office-aligned-plaza-paving')
    assert.ok(garden.geometry.attributes.position.count/3<(low?16000:28000))
    shell.dispose();shell.dispose();assert.equal(root.children.length,0)
    for(const id of resources)assert.ok(released.has(id))
  }
})

test('discussion and dining tables have actual clearance from fixed seats and one another',()=>{
  const root=new THREE.Group(), zones=buildOfficeAlignedZones({THREE,root,layout:LAYOUT_V3,search:'?officeSample=1'})
  for(const table of zones.tableBounds) {
    const zone=zones.zones.find(z=>table.name.startsWith(z.id+'-'))
    const room=LAYOUT_V3.regions.find(r=>r.id===zone.id)
    assert.ok(table.x-table.radius>=room.x0&&table.x+table.radius<=room.x1&&table.z-table.radius>=room.z0&&table.z+table.radius<=room.z1)
    for(const chair of zone.root.children.filter(m=>/-(chair|high-stool)$/.test(m.name))) {
      const p=chair.geometry.parameters,r=p.radiusTop??Math.hypot(p.width,p.depth)/2
      assert.ok(Math.hypot(table.x-chair.position.x,table.z-chair.position.z)-table.radius-r>=.1,table.name+' clears '+chair.name)
    }
  }
  const dining=zones.tableBounds.filter(p=>p.name.startsWith('dining-'))
  assert.equal(dining.length,2)
  assert.ok(Math.hypot(dining[0].x-dining[1].x,dining[0].z-dining[1].z)>dining[0].radius+dining[1].radius+.1)
  zones.dispose();assert.equal(root.children.length,0)
})
