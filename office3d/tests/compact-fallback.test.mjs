import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import * as THREE from '../vendor/three/three.module.js'

const root = new URL('../', import.meta.url)
const source = fs.readFileSync(new URL('compact-assets.js', root), 'utf8')
function fixture(fail = {}) {
  const calls = [], warnings = [], scene = { userData: { compactHeight: 170 }, traverse() {} }
  class Texture { }
  class TextureLoader {
    constructor(manager = {resolveURL: url => url}) { this.manager = manager }
    load(url, done, progress, error) { calls.push(url); queueMicrotask(() => fail.texture && url.includes('/compact/') ? error(Error('decode')) : done({ image: url })); return new Texture() }
    loadAsync(url) { return new Promise((yes, no) => this.load(url, yes, undefined, no)) }
  }
  class GLTFLoader {
    async parseAsync() { if(fail.decode) throw Error('decode'); return {scene} }
    async loadAsync(url) {calls.push(url); return {scene, animations:['original-ual']} }
  }
  const context={THREE:{Texture,TextureLoader},GLTFLoader,URL,Response,DecompressionStream,queueMicrotask,
    location:{href:'http://localhost/'},initialQuality:()=>({tier:'high'}),console:{warn:x=>warnings.push(x)},
    decodeAnimationClips:()=>{if(fail.decode)throw Error('decode');return ['compact']},
    fetch:async url=>{calls.push(url);return new Response(gzipSync(Buffer.from('fixture')), {status:fail.read?404:200})},
    loadOriginalModule:async()=>{calls.push('FBXLoader dynamic');return {loadOriginalPerson:async name=>({original:name}),loadOriginalClips:async name=>[name]}}
  }
  vm.runInNewContext(source.replace(/^import .*$/gm,'').replaceAll('export ','').replaceAll("import('./original-people.js')",'loadOriginalModule()')+'\nthis.api={loadCompactPerson,loadCompactClips,loadCompactGltf,CompactTextureLoader}',context)
  return {...context.api,calls,warnings,scene}
}
test('normal compact models, clips and textures never import or request FBX', async()=>{
  const f=fixture();assert.equal(await f.loadCompactPerson('New_Avatar'),f.scene)
  assert.equal((await f.loadCompactClips('clip'))[0],'compact')
  const t=await new f.CompactTextureLoader().loadAsync('./assets/models/people/New_Avatar/skin.jpg')
  assert.match(t.image,/compact\/1024/);assert.ok(!f.calls.some(x=>/FBX|\.fbx/.test(x)));assert.equal(f.warnings.length,0)
})
for(const cause of ['read','decode']) test(`only failed compact item falls back on ${cause}, warning once`,async()=>{
  const f=fixture({[cause]:true})
  for(let i=0;i<2;i++)assert.equal((await f.loadCompactPerson('New_Avatar')).original,'New_Avatar')
  assert.equal(f.warnings.length,1)
  assert.equal((await f.loadCompactClips('m_action'))[0],'m_action')
  assert.equal((await f.loadCompactClips('UAL1_Standard'))[0],'original-ual')
  await f.loadCompactGltf('./assets/compact/characters/hair/Hair.glb.gz','./assets/models/characters/hair/')
  assert.ok(f.calls.includes('./assets/models/characters/hair/Hair.gltf'))
})
test('texture decoding failure retains the same Texture object and retries only its original image',async()=>{
  const f=fixture({texture:true}), loader=new f.CompactTextureLoader()
  let returned;const done=new Promise((resolve,reject)=>{returned=loader.load('./assets/models/people/A/skin.png',resolve,undefined,reject);returned.flipY=false})
  const result=await done;assert.equal(result,returned);assert.equal(result.flipY,false)
  assert.equal(result.image,'./assets/models/people/A/skin.png');assert.equal(f.calls.length,2);assert.equal(f.warnings.length,1)
  assert.ok(!f.calls.some(x=>/FBX/.test(x)))
})
test('low-tier URL suppression precedes compact mapping and still avoids normal-map downloads',async()=>{
  const f=fixture(),blank='data:image/png;base64,fixture'
  const loader=new f.CompactTextureLoader({resolveURL:url=>/_Normal\.png$/.test(url)?blank:url})
  assert.equal((await loader.loadAsync('./assets/models/characters/tex/Hair_Normal.png')).image,blank)
  assert.deepEqual(f.calls,[blank]);assert.equal(f.warnings.length,0)
})
test('production static policy allows compact gzip bytes without admitting private text formats',()=>{
  const s=fs.readFileSync(new URL('server.mjs',root),'utf8')
  const types=s.match(/const TYPES = \{[\s\S]*?\n\}/)[0], policy=s.match(/const STATIC_EXT = [^\n]+\nconst staticOk = [^\n]+/)[0]
  const {TYPES,staticOk}=vm.runInNewContext(types+'\n'+policy+'\n;({TYPES,staticOk})',{path})
  assert.equal(TYPES['.gz'],'application/octet-stream')
  for(const url of ['/assets/compact/people/A.glb.gz','/assets/compact/anim/A.anim.gz'])assert.ok(staticOk(url))
  for(const url of ['/secret.json','/app.log','/README.md','/.private/file.gz','/tests/a.gz','/codex-prompts/a.js','/_ref/a.gz'])assert.equal(staticOk(url),false,url)
  assert.doesNotMatch(s.slice(s.lastIndexOf('if (!staticOk')), /Content-Encoding/i)
})
test('every referenced appearance has a compact model and source/output manifest entry',()=>{
  const sources=['people.js','app.js','office-r1-seating.js'].map(f=>fs.readFileSync(new URL(f,root),'utf8'))
  const names=new Set(sources.flatMap(s=>[...s.matchAll(/['"]((?:Male_Adult|Female_Adult|Business_Male)_\d+)['"]/g)].map(m=>m[1])))
  const manifest=JSON.parse(fs.readFileSync(new URL('assets/compact/MANIFEST.json',root)))
  assert.ok(names.size>=27)
  for(const name of names){const suffix=`/people/${name}.glb.gz`;assert.ok(manifest.files.some(r=>r.kind==='model'&&r.file.endsWith(suffix)),name);assert.ok(fs.existsSync(new URL(`assets/compact/people/${name}.glb.gz`,root)),name)}
  const people=sources[0];assert.match(people,/loadPeople\(onProgress, extraAvatars = \[\]\)/);assert.match(people,/extraAvatars\.map/)
  const fallback=fs.readFileSync(new URL('original-people.js',root),'utf8');assert.match(fallback,/await import\('\.\/vendor\/three\/jsm\/loaders\/FBXLoader.js'\)/)
})
test('reused avatar instances retain the shared PBR material preparation',()=>{
  const clean=s=>s.replace(/^import .*$/gm,'').replaceAll('export ','')
  const material=clean(fs.readFileSync(new URL('people-materials.js',root),'utf8'))
  const people=clean(fs.readFileSync(new URL('people.js',root),'utf8'))
  const context={THREE,SkeletonUtils:{clone:o=>o.clone(true)}}
  vm.runInNewContext(material+'\n'+people+'\nthis.create=createPerson',context)
  const obj=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());obj.add(mesh)
  const P={avatars:{Male_Adult_11:{obj,gender:'male',scale:1}},clips:{male:{sitIdle:new THREE.AnimationClip('idle',1,[])}},extras:{male:{}}}
  const a=context.create(P,'Male_Adult_11'),b=context.create(P,'Male_Adult_11')
  assert.notEqual(a.parts.model,b.parts.model);assert.notEqual(a.parts.model.children[0].material,b.parts.model.children[0].material)
  assert.ok(b.parts.model.children[0].material.isMeshStandardMaterial);b.solve(1/30)
})
