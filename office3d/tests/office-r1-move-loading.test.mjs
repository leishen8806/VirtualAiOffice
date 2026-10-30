import { R1_ADDED_AVATARS } from '../office-r1-seating.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createR1Navigation } from '../office-r1-navigation.js'
const peopleSource = readFileSync(new URL('../people.js', import.meta.url), 'utf8')
const assetsContext = { R1_POOL_WARNED: new Set(), console }
vm.runInNewContext(peopleSource.slice(peopleSource.indexOf('export function r1SeatedAssets'), peopleSource.indexOf('export const R1_ARM_LIMITS')).replace('export function', 'function'), assetsContext)
const { r1SeatedAssets } = assetsContext

test('actual preparation worker preserves real-triangle paths and collision after structured transfer', async () => {
  const layout = { site: { x0: -4, x1: 4, z0: -4, z1: 4 }, regions: [], seats: {}, r1: { workstations: [], elements: [] } }
  const collision = createFurnitureCollision(), wall = new THREE.Mesh(new THREE.BoxGeometry(.2, 2, 4))
  wall.position.y = 1; wall.name = 'wall'; wall.userData.r1Id = 'wall'; collision.add(wall, 'wall')
  const snapshot = collision.navigationBodies().map(b => ({ name: b.group.name, id: b.group.userData.r1Id, kind: b.kind,
    box: [...b.box.min.toArray(), ...b.box.max.toArray()], vertices: new Float64Array(b.triangles.flatMap(t => [...t.a.toArray(), ...t.b.toArray(), ...t.c.toArray()])) }))
  const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads'); globalThis.self={postMessage:(v,t)=>parentPort.postMessage(v,t)}; import(workerData).then(()=>parentPort.on('message',data=>self.onmessage({data})));`, { eval: true, workerData: new URL('../office-r1-navigation-worker.js', import.meta.url).href })
  try {
    const data = await new Promise((resolve,reject) => { worker.once('message',resolve); worker.once('error',reject); worker.postMessage({layout,snapshot},snapshot.map(b=>b.vertices.buffer)) })
    assert.equal(data.error, undefined)
    const main = createR1Navigation(structuredClone(layout)); await main.attachAsync(collision)
    assert.equal(main.prepared(),false); main.adoptPrepared(data); assert.equal(main.prepared(),true)
    const local = createR1Navigation(structuredClone(layout)).attach(collision); await local.prepare()
    for (const [start,end] of [[{x:-3,z:0},{x:3,z:0}],[{x:3,z:2},{x:-3,z:-2}],[{x:-3,z:0},{x:0,z:0}]]) {
      assert.deepEqual(main.plan(start,end),local.plan(start,end))
      main.plan(start,end,undefined,[],true)
      assert.deepEqual(main.plan(start,end),local.plan(start,end))
    }
    for (let x=-3;x<=3;x+=.25) for(let z=-3;z<=3;z+=.25) assert.equal(!!main.query({x,z}),!!local.query({x,z}))
  } finally { await worker.terminate() }
})

test('replacement completes before optional movement loading; failure retains people and a recorded fallback', async () => {
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),start=source.lastIndexOf("if (!DR_MODE && OFFICE_LAYOUT.r1Phase === 'R1') {")
  const callbacks=[],events=[],group=()=>({visible:true,add(){},traverse(f){f({userData:{}})},removeFromParent(){}})
  const v={name:'OpsLead',id:'fixture',home:{x:0,z:0,yaw:0},desk:{group:{position:{x:0,z:1}}},ring:{},char:{group:group(),pose:{}}}
  let rejectMovement
  const context={R1_ADDED_AVATARS,DR_MODE:false,OFFICE_LAYOUT:{r1Phase:'R1'},views:new Map([['fixture',v]]),SEATS:{OpsLead:[]},CAST:['Male_Adult_11'],CAST_OVERRIDE:{},PEOPLE:null,
    scene:{userData:{},add(){}},performance:{now:()=>1},setTimeout:f=>callbacks.push(f),requestAnimationFrame:f=>callbacks.push(f),loadPeople:async()=>({}),loadR1Extras:async()=>{},
    loadR1MovementExtras:()=>{assert.ok(context.scene.userData.r1People.completedAt);events.push('extras');return new Promise((_,reject)=>rejectMovement=reject)},
    officeV3:{get:()=>({seatedProfile:()=>({handY:.82}),chairAt:()=>({})})},r1SeatedAssets:p=>p,createPerson:()=>{events.push('person');return{group:group(),pose:{},avatar:'Male_Adult_11'}},placeSeated(){},fitR1SeatedPerson(){}}
  vm.runInNewContext(source.slice(start,source.indexOf('\nwindow.__office =',start)),context)
  for(let i=0;i<40;i++){callbacks.shift()?.();await Promise.resolve()}
  assert.deepEqual(events,['person','extras']);assert.equal(v.char.avatar,'Male_Adult_11')
  rejectMovement(Error('fixture unavailable'));await Promise.resolve();await Promise.resolve()
  assert.equal(context.scene.userData.r1People.movementLoadFailed,true)
  assert.equal(context.scene.userData.r1People.failed.length,0)
})

test('already-created seated asset views see optional motion and lounge clips arriving later', () => {
  const neutral=new THREE.AnimationClip('m_sit_table_idle_neutral_02',1,[]),P={clips:{male:{sitIdle:new THREE.AnimationClip('neutral',1,[])}},extras:{male:{sitFlavor:[neutral]}}}
  const assets=r1SeatedAssets(P,'Male_Adult_11',{motions:['neutral_01','neutral_02']},'OpsLead')
  assert.equal(Object.keys(assets.extras.male.r1Motions).length,0)
  P.extras.male.r1Motions.cheer_01=neutral;P.extras.male.lounge.push(neutral)
  assert.equal(assets.extras.male.r1Motions.cheer_01,neutral);assert.equal(assets.extras.male.lounge[0],neutral)
  assert.equal(assets.extras.male.sitFlavor.length,1);assert.equal(assets.extras.male.sitFlavor[0],neutral)
})


test('browser preparation warms the page search before reporting navigation ready', async () => {
  const originalDocument=globalThis.document,originalWorker=globalThis.Worker
  class BrowserWorker extends Worker {
    constructor(url) {
      super(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:(v,t)=>parentPort.postMessage(v,t)};import(workerData).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:url.href})
      this.on('message',data=>this.onmessage?.({data}));this.on('error',error=>this.onerror?.(error))
    }
  }
  const layout={site:{x0:-3,x1:3,z0:-3,z1:3},regions:[],seats:{},r1:{workstations:[],elements:[]}},c=createFurnitureCollision()
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.2,2,2));wall.position.y=1;c.add(wall,'wall')
  const nav=createR1Navigation(layout);await nav.attachAsync(c)
  try {
    globalThis.document={};globalThis.Worker=BrowserWorker
    const ready=nav.prepare();assert.equal(nav.prepared(),false);await ready
    const proof=nav.preparationInfo();assert.equal(nav.prepared(),true);assert.equal(proof.worker,true)
    assert.ok(proof.mainSearchWarmup.length>0);assert.equal(proof.mainSearchWarmup.length,proof.searchWarmup.length)
    assert.ok(nav.plan({x:-2,z:0},{x:2,z:0}))
  } finally {
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument
    if(originalWorker===undefined)delete globalThis.Worker;else globalThis.Worker=originalWorker
  }
})
