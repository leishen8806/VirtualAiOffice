import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import mapData from '../town-map-data.js'
import { HIDDEN_LANDMARKS, MAX_SCALE, MIN_SCALE, avoidLabelCollisions, fitView, hitTest, mapBounds, screenToWorld, worldToScreen, zoomAt } from '../town-map-core.js'

const root=path.resolve(import.meta.dirname,'..'), source=JSON.parse(fs.readFileSync(path.resolve(root,'../town-map-data/m0/derived/town-map-v0.json'),'utf8'))
const width=1200,height=800,bounds=mapBounds(mapData.layers.khans),fit=fitView(bounds,width,height)

test('generated data matches the reviewed source field for field',()=>{
  assert.equal(JSON.stringify(mapData),JSON.stringify(source))
  assert.equal(mapData.layers.khans.length,14); assert.equal(mapData.layers.landmarks.length,24)
  for(const name of ['khans','roads','water','landmarks'])assert.ok(mapData.layers[name].length>0,name)
  const points=[...mapData.layers.khans.flatMap(x=>x.rings.flat()),...mapData.layers.roads.flatMap(x=>x.line),...mapData.layers.water.flatMap(x=>x.lines.flat()),...mapData.layers.landmarks.map(x=>x.point)]
  for(const p of points)assert.ok(p.length===2&&p.every(Number.isFinite)&&p.every(Number.isInteger),JSON.stringify(p))
  const head=fs.readFileSync(path.join(root,'town-map-data.js'),'utf8').split(/\r?\n/,1)[0]; assert.match(head,/OpenStreetMap contributors/);assert.match(head,/ODbL/)
})

test('world and screen transforms round-trip and fit all khans',()=>{
  const world={x:2614,y:-1468},screen=worldToScreen(world,fit,width,height),again=screenToWorld(screen,fit,width,height)
  assert.ok(Math.abs(world.x-again.x)<1e-9&&Math.abs(world.y-again.y)<1e-9)
  for(const p of [{x:bounds.x0,y:bounds.y0},{x:bounds.x1,y:bounds.y1},{x:bounds.x0,y:bounds.y1},{x:bounds.x1,y:bounds.y0}]){const s=worldToScreen(p,fit,width,height);assert.ok(s.x>=35&&s.x<=width-35&&s.y>=35&&s.y<=height-35,JSON.stringify(s))}
})

test('cursor-centred zoom preserves its world point and clamps scale',()=>{
  const cursor={x:287,y:413},before=screenToWorld(cursor,fit,width,height),zoomed=zoomAt(fit,cursor,99,width,height),after=screenToWorld(cursor,zoomed,width,height)
  assert.equal(zoomed.scale,MAX_SCALE);assert.ok(Math.abs(before.x-after.x)<1e-9&&Math.abs(before.y-after.y)<1e-9)
  assert.equal(zoomAt(fit,cursor,.001,width,height).scale,MIN_SCALE)
})

test('landmark, khan and blank hit testing respects hidden landmarks',()=>{
  const monument=mapData.layers.landmarks.find(x=>x.name==='Independence Monument'),m=worldToScreen({x:monument.point[0],y:monument.point[1]},fit,width,height)
  assert.equal(hitTest(m,mapData,fit,width,height)?.item.id,monument.id)
  const khan=mapData.layers.khans.find(x=>x.name==='Khan Dangkao'),k=worldToScreen({x:khan.center[0],y:khan.center[1]},fit,width,height)
  assert.equal(hitTest(k,mapData,fit,width,height,0)?.item.id,khan.id)
  assert.equal(hitTest({x:-5000,y:-5000},mapData,fit,width,height),null)
  for(const name of HIDDEN_LANDMARKS){const hidden=mapData.layers.landmarks.find(x=>x.name===name),p=worldToScreen({x:hidden.point[0],y:hidden.point[1]},fit,width,height),hit=hitTest(p,mapData,fit,width,height);assert.notEqual(hit?.item.id,hidden.id)}
})

test('label avoidance is deterministic and returns no overlaps',()=>{
  const input=[{id:'a',x:0,y:0,w:40,h:20},{id:'b',x:10,y:5,w:40,h:20},{id:'c',x:60,y:0,w:30,h:20}],out=avoidLabelCollisions(input,3)
  assert.deepEqual(out.map(x=>x.id),['a','c'])
  for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++)assert.ok(out[i].x+out[i].w+3<=out[j].x||out[j].x+out[j].w+3<=out[i].x||out[i].y+out[i].h+3<=out[j].y||out[j].y+out[j].h+3<=out[i].y)
})

test('page keeps attribution, safe text rendering and a sub-2MB bundle',()=>{
  const html=fs.readFileSync(path.join(root,'town.html'),'utf8'),css=fs.readFileSync(path.join(root,'town.css'),'utf8'),js=fs.readFileSync(path.join(root,'town.js'),'utf8'),core=fs.readFileSync(path.join(root,'town-map-core.js'),'utf8')
  assert.match(html,/© OpenStreetMap contributors/);assert.match(html,/https:\/\/www\.openstreetmap\.org\/copyright/);assert.match(html,/rel="noopener noreferrer"/)
  for(const [name,text] of [['town.js',js],['town-map-core.js',core]])for(const bad of [/innerHTML/,/\beval\s*\(/,/new Function/,/document\.write/,/XMLHttpRequest/,/WebSocket/])assert.doesNotMatch(text,bad,`${name} ${bad}`)
  assert.equal((js.match(/\bfetch\s*\(/g)||[]).length,1)
  assert.match(js,/fetchImpl:\s*\(url\)\s*=>\s*fetch\(url\)/)
  assert.doesNotMatch(css,/@import|url\(\s*['"]?https?:/i)
  const total=['town.html','town.css','town.js','town-map-core.js','town-map-data.js','town-names.js'].reduce((n,file)=>n+fs.statSync(path.join(root,file)).size,0);assert.ok(total<=2*1024*1024,total)
})
