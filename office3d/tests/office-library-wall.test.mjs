import test from 'node:test'
import assert from 'node:assert/strict'
import {LAYOUT_V3, LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {officeFurnitureV2Spec} from '../office-furniture-v2.js'
import {wholeFloorSpec} from '../office-vis2/whole-floor.js'
import {alignPassages} from '../office-vis2/align-zones.js'

test('ALIGN knowledge wall fills its north frontage, rests on the local floor and preserves real workstation use space',()=>{
  const before=JSON.stringify(layout),kb=layout.regions.find(r=>r.id==='kb'),shelves=officeFurnitureV2Spec(layout).shelves
  const left=Math.min(...shelves.map(s=>s.x-s.w/2)),right=Math.max(...shelves.map(s=>s.x+s.w/2))
  assert.ok(Math.abs(right-left-7.1)<1e-9);assert.ok(Math.abs((left+right)/2-(kb.x0+kb.x1)/2)<1e-9)
  assert.equal(shelves.length,2)
  for(const s of shelves){
    assert.equal(s.h,2.65);assert.equal(s.y,.126);assert.equal(s.d,.6);assert.equal(s.yaw,0)
    const b={x0:s.x-s.w/2,x1:s.x+s.w/2,z0:s.z-s.d/2,z1:s.z+s.d/2}
    assert.ok(b.x0>kb.x0+.4&&b.x1<kb.x1-.4&&b.z0>kb.z0&&b.z1<kb.z1)
    for(const c of alignPassages(layout))assert.ok(b.x1<=c.x0||b.x0>=c.x1||b.z1<=c.z0||b.z0>=c.z1)
    for(const [,x,z]of Object.values(layout.seats))assert.ok(Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.z0-z,0,z-b.z1))>=1.2)
  }
  assert.equal(JSON.stringify(layout),before);assert.equal(Object.keys(layout.seats).length,25);assert.equal(layout.displaySeats.length,12)
  assert.deepEqual(officeFurnitureV2Spec(LAYOUT_V3).shelves,[{x:30.5,z:-17.45,w:2.8,d:.6,yaw:0},{x:32.45,z:-15.7,w:2,d:.6,yaw:Math.PI/2}])
})

test('all three real shelf levels hold books with bounded crown/toe details; spine print has no duplicate geometry',()=>{
  const details=wholeFloorSpec(layout).details,shelves=officeFurnitureV2Spec(layout).shelves,books=details.filter(p=>p.kind==='shelf-book'),bands=details.filter(p=>p.kind==='shelf-spine')
  assert.equal(books.length,174);assert.equal(bands.length,0)
  for(const shelf of shelves){
    const own=books.filter(p=>Math.abs(p.x-shelf.x)<shelf.w/2)
    for(const surface of [.277,.781,1.286])assert.equal(own.filter(p=>Math.abs(p.y-p.h/2-shelf.y-surface*shelf.h/1.85)<1e-9).length,29)
  }
  for(const kind of['shelf-cornice','shelf-toe']){
    const pieces=details.filter(p=>p.kind===kind);assert.equal(pieces.length,2)
    for(const p of pieces)assert.ok(shelves.some(s=>p.x-p.w/2>=s.x-s.w/2-1e-9&&p.x+p.w/2<=s.x+s.w/2+1e-9&&p.z-p.d/2>=s.z-s.d/2-1e-9&&p.z+p.d/2<=s.z+s.d/2+1e-9))
  }
})
