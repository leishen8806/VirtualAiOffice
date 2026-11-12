import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const repo=fileURLToPath(new URL('../../',import.meta.url)), output=path.join(repo,'office3d/assets/compact/wh-trucks')
const {chromium}=await import(pathToFileURL(process.argv[2]||'C:/Users/Administrator/node_modules/playwright/index.mjs').href)
const server=http.createServer(async(req,res)=>{
  if(req.url==='/')return res.writeHead(200,{'content-type':'text/html'}).end('<link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/office3d/vendor/three/three.module.js"}}</script>')
  const file=path.resolve(repo,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname))
  if(!file.startsWith(path.resolve(repo)+path.sep))return res.writeHead(403).end()
  try{res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.png')?'image/png':'application/octet-stream'}).end(await fs.readFile(file))}catch{res.writeHead(404).end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage()
try{
 await fs.mkdir(output,{recursive:true});await page.goto(`http://127.0.0.1:${server.address().port}`)
 const rows=[]
 for(const tier of ['near','mid','far']){
  const r=await page.evaluate(async tier=>{
   const {createTruck}=await import('/scripts/wh-r1-trucks/model.js'),{GLTFExporter}=await import('/scripts/perf-load-2/vendor/exporters/GLTFExporter.js'),T=await import('/office3d/vendor/three/three.module.js')
   const group=await createTruck(tier),bounds=new T.Box3().setFromObject(group),parts=group.userData.parts;delete group.userData.parts
   const binary=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true}),bytes=new Uint8Array(binary);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768))
   return {base64:btoa(s),bounds:[bounds.min.toArray(),bounds.max.toArray()],parts,triangles:group.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),calls:group.children.length}
  },tier)
  const raw=Buffer.from(r.base64,'base64'),bytes=gzipSync(raw,{level:9});delete r.base64
  const file=`semitrailer-${tier}.glb.gz`;await fs.writeFile(path.join(output,file),bytes)
  rows.push({tier,file,bytes:bytes.length,glbBytes:raw.length,sha256:createHash('sha256').update(bytes).digest('hex'),...r});console.log(JSON.stringify({...rows.at(-1),parts:undefined}))
 }
 assert(rows.reduce((n,r)=>n+r.bytes,0)<=3*1024*1024,'compressed GLB budget')
 const sourceHashes={};for(const file of ['scripts/wh-r1-trucks/model.js','scripts/wh-r1-trucks/build.mjs','scripts/perf-load-2/vendor/exporters/GLTFExporter.js','office3d/assets/logo.png']){const bytes=await fs.readFile(path.join(repo,file));sourceHashes[file]=createHash('sha256').update(file.endsWith('.js')||file.endsWith('.mjs')?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes).digest('hex')}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({schema:1,source:'scripts/wh-r1-trucks/model.js',sourceHashes,rows},null,2)+'\n')
}finally{await browser.close();await new Promise(r=>server.close(r))}
