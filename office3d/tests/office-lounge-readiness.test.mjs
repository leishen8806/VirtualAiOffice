import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8')
const goSource=app.slice(app.indexOf('function goLounge('),app.indexOf('// ── 休息区八卦'))
const gossipSource=app.slice(app.indexOf('function gossipTick('),app.indexOf('function loungeChat('))
const go=new Function('loungeReady','LOUNGE','director','loungePath',goSource+';return goLounge')

test('pending bar neither reserves a lounge seat nor attempts travel; real meetings and default office still work',()=>{
  for(const ready of[false,true])for(const meeting of[false,true]){
    const v={},seat={taken:null,meeting},calls=[],travel=(...args)=>{calls.push(args);return true}
    const run=go(()=>ready,[seat],{travel},()=>[{x:0,z:0}]),result=run(v,100,200,meeting?seat:undefined)
    assert.equal(calls.length,ready||meeting?1:0)
    assert.equal(result,ready||meeting)
    if(result){assert.equal(seat.taken===v,true);assert.equal(v.lounging===seat,true);assert.equal(v.loungeUntil,300)}
    else{assert.equal(seat.taken,null);assert.equal(v.lounging,undefined)}
  }
})

test('actual readiness predicate fails closed for pending/fallback/disposed ALIGN while default and stable V3 remain unchanged',()=>{
  const declaration=app.match(/^const loungeReady = .*$/m)[0]
  const make=new Function('OFFICE_SAMPLE_MODE','OFFICE_LAYOUT','officeV3',declaration+';return loungeReady')
  for(const status of['loading','closed','fallback',undefined])assert.equal(make(true,{variant:'align'},{get:()=>({status})})(),false)
  assert.equal(make(true,{variant:'align'},null)(),false);assert.equal(make(true,{variant:'align'},{get:()=>({status:'open'})})(),true)
  for(const [sample,variant]of[[false,'align'],[true,undefined]])assert.equal(make(sample,{variant},{get(){throw Error('must not inspect optional sample')}})(),true)
})

test('unready gossip remains unconsumed, then gathers the same cast exactly once after readiness',()=>{
  let ready=false,attempts=0
  const threads=[{id:'test-news',at:new Date(0).toISOString(),cast:['a','b']}],played=new Set(),views=new Map(['a','b'].map(id=>[id,{id}]))
  const build=new Function('loungeReady','gossipThreads','gossipPlayed','views','isFreeForChat','goLounge','director',`let gossip=null;${gossipSource};return {tick:gossipTick,current:()=>gossip}`)
  const value=build(()=>ready,threads,played,views,()=>true,()=>{attempts++},{enqueue(){throw Error('must not speak before arrival')}})
  value.tick(1000);assert.equal(played.size,0);assert.equal(attempts,0);assert.equal(value.current(),null)
  ready=true;value.tick(1001);assert.deepEqual([...played],['test-news']);assert.equal(attempts,2);assert.equal(value.current().t,threads[0])
  value.tick(1002);assert.equal(attempts,2)
})
