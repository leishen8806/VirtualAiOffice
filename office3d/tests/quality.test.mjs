import test from 'node:test'
import assert from 'node:assert/strict'
import {initialQuality,chooseQuality,createQualityPolicy,renderLimit,cappedDpr,compactDrawGroups,QUALITY_KEY} from '../quality.js'

test('URL优先，非法URL回退存储；存储异常及损坏回退预热',()=>{
  const storage={getItem:()=> 'low'}
  assert.deepEqual(initialQuality({search:'?q=high',storage}),{tier:'high',source:'url',forced:true})
  assert.equal(initialQuality({search:'?q=bogus',storage}).tier,'low')
  assert.equal(initialQuality({storage:{getItem:()=>'{bad'}}).source,'warmup')
  assert.equal(initialQuality({storage:{getItem(){throw Error('blocked')}}}).tier,'medium')
  assert.equal(initialQuality({wall:true}).tier,'high')
})
test('设备组合：软件/集显、少核心和小内存降档，信号缺失保守回退',()=>{
  for(const gpu of ['Intel UHD','Iris Xe','Mali','Adreno','SwiftShader','llvmpipe'])assert.equal(chooseQuality({cores:16,memory:16,gpu,averageMs:12}),'low')
  assert.equal(chooseQuality({cores:4,memory:16}),'low');assert.equal(chooseQuality({cores:16,memory:4}),'low')
  assert.equal(chooseQuality({cores:8,memory:8,averageMs:20}),'medium');assert.equal(chooseQuality({cores:16,memory:16,averageMs:18}),'high')
  assert.equal(chooseQuality({cores:16,memory:16,averageMs:50}),'low');assert.equal(chooseQuality({cores:16,memory:16,averageMs:30}),'medium');assert.equal(chooseQuality({}),'medium')
})
test('6秒预热后自动选档，预热期不作连续低帧降级',()=>{
  const p=createQualityPolicy({selection:initialQuality(),signals:{gpu:'Intel',cores:16}})
  for(let t=0;t<6000;t+=100)assert.equal(p.observe(100,t),false)
  assert.equal(p.tier,'medium');assert.equal(p.observe(100,6000),true);assert.equal(p.tier,'low')
})
// 保存的"高"现在锁定不降档（董事会 2026-10-30，见 quality-high-locked.test.mjs）；降档机制用保存的"中"来测。
test('连续10秒低于24FPS才降档，恢复帧率重置累计，同会话永不自动升回',()=>{
  const p=createQualityPolicy({selection:{tier:'medium',source:'storage',forced:false}})
  for(let t=0;t<=6000;t+=50)p.observe(50,t)
  for(let t=6050;t<16000;t+=50)p.observe(50,t)
  assert.equal(p.tier,'medium');p.observe(50,16000);assert.equal(p.tier,'low')
  for(let t=16050;t<18000;t+=16)p.observe(16,t)
  assert.equal(p.tier,'low');assert.equal(p.downgraded,true)
})
test('中间正常帧中止低帧连续期，不按总坏帧数凑10秒',()=>{
  const p=createQualityPolicy({selection:{tier:'high',source:'storage',forced:false}})
  for(let t=0;t<14000;t+=50)p.observe(50,t)
  for(let t=14000;t<16000;t+=16)p.observe(16,t)
  for(let t=16000;t<22000;t+=50)p.observe(50,t)
  assert.equal(p.tier,'high')
})
test('软件渲染前台帧超过2.5秒时仍能持续降档',()=>{
  const p=createQualityPolicy({selection:{tier:'medium',source:'storage',forced:false}})
  for(let t=0;t<=24000;t+=3000)p.observe(3000,t)
  assert.equal(p.tier,'low')
})
test('后台/闲置限帧不计低帧；大屏默认高但保留持续低帧保护',()=>{
  const p=createQualityPolicy({selection:initialQuality({wall:true}),wall:true})
  for(let t=0;t<30000;t+=100)p.observe(100,t,false)
  assert.equal(p.tier,'high')
  for(let t=30000;t<=47000;t+=50)p.observe(50,t)
  assert.equal(p.tier,'medium')
})
test('URL锁定，手动存储拒绝时仍能切档，保存只记录用户选择',()=>{
  const p=createQualityPolicy({selection:initialQuality({search:'?q=high'})})
  for(let t=0;t<30000;t+=100)p.observe(100,t)
  assert.equal(p.tier,'high');assert.equal(p.select('low'),false)
  const manual=createQualityPolicy({selection:initialQuality()});assert.equal(manual.select('low',{setItem(){throw Error('blocked')}}),true)
  let saved;manual.select('high',{setItem:(k,v)=>saved=[k,v]});assert.deepEqual(saved,[QUALITY_KEY,'high'])
})
test('DPR与大屏分辨率上限，显式fixeddpr仍不能越过档位硬上限',()=>{
  assert.equal(cappedDpr('low',2),1);assert.equal(cappedDpr('medium',2),1.25);assert.equal(cappedDpr('high',2),1.5)
  assert.equal(cappedDpr('low',2,3840,2160),.5);assert.ok(cappedDpr('medium',2,3840,2160)<1)
})
test('隐藏完全停渲染，无操作10FPS，人物动作或大屏恢复档位上限',()=>{
  assert.equal(renderLimit({tier:'high',hidden:true}),0);assert.equal(renderLimit({tier:'low'}),30)
  assert.equal(renderLimit({tier:'high',idleMs:30000}),10);assert.equal(renderLimit({tier:'high',idleMs:30000,active:true}),60)
  assert.equal(renderLimit({tier:'high',idleMs:30000,wall:true}),60)
})
test('同材质绘制组压缩不丢三角形、材质归属及顶点索引，原始数组不改',()=>{
  const original=new Uint16Array([0,1,2,3,4,5,6,7,8]), groups=[{start:0,count:3,materialIndex:0},{start:3,count:3,materialIndex:1},{start:6,count:3,materialIndex:0}]
  const result=compactDrawGroups(groups,original,9)
  assert.deepEqual([...result.index],[0,1,2,6,7,8,3,4,5]);assert.deepEqual([...original],[0,1,2,3,4,5,6,7,8]);assert.equal(result.groups.length,2);assert.equal(result.groups[0].count,6);assert.equal(result.groups[1].materialIndex,1)
  assert.equal(compactDrawGroups(groups,null,70000).index.constructor,Uint32Array)
})
