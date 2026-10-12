import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
const ROOT = path.resolve(import.meta.dirname, '..')
const PDF_HEADER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\ntrailer\n<< /Size 1 >>\nstartxref\n30\n%%EOF\n', 'binary')
const PNG_HEADER = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154785e63000100000500010d0a2db40000000049454e44ae426082', 'hex')
const WAV_HEADER = Buffer.from('524946462404000057415645666d7420100000000100010044ac000088580100020010006461746100040000', 'hex')
function buildPdf(n) { if (n <= PDF_HEADER.length) return PDF_HEADER.subarray(0, n); const b = Buffer.alloc(n, 0x20); PDF_HEADER.copy(b, 0); b[n-6]=0x25; b[n-5]=0x25; b[n-4]=0x45; b[n-3]=0x4f; b[n-2]=0x46; b[n-1]=0x0a; return b }
function buildPng(n) { if (n <= PNG_HEADER.length) return PNG_HEADER.subarray(0, n); const extra = n - PNG_HEADER.length; return Buffer.concat([PNG_HEADER, Buffer.alloc(extra, 0x20)]) }
function buildWav(n) { if (n <= WAV_HEADER.length) return WAV_HEADER.subarray(0, n); const b = Buffer.alloc(n); WAV_HEADER.copy(b, 0); b.writeUInt32LE(Math.max(0,n-8),4); b.writeUInt32LE(Math.max(0,n-44),40); return b }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex') }

const { createServer } = await import('../src/server.js')
const { Coordinator } = await import('../src/coordinator.js')
const { AttachmentStore } = await import('../src/attachments/store.js')

function rmrf(p, atts=5) { let n=0; while (n++ < atts) { try { fs.rmSync(p,{recursive:true,force:true,maxRetries:3,retryDelay:80}); return } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100) } } }

const results = []; function pass(name){results.push({name,ok:true});console.log('PASS',name)}; function fail(name,e){results.push({name,ok:false,err:e?.message||String(e)});console.log('FAIL',name,e?.message||String(e).slice(0,400))}

async function startHarness(opts = {}) {
  const rootTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bhvr-'))
  const workdir = path.join(rootTmp,'wd')
  const attDir = path.join(rootTmp,'att')
  fs.mkdirSync(attDir,{recursive:true})
  const sf = path.join(workdir,'stats.json'); fs.mkdirSync(workdir,{recursive:true}); fs.writeFileSync(sf,'{}')
  const cfg = { workdir, port:0, host:'127.0.0.1', autonomy:{rounds:1}, logDir:path.join(workdir,'logs'), statsFile:sf,
    transcription:{provider: opts.transcriptionProvider || 'test'},
    groups:[{id:'g1',type:'openai-api',name:'t',enabled:true,baseUrl:'http://x',apiKey:'k',
      vision: opts.enableVision !== false, models:{easy:'e',medium:'m',hard:'h'}}],
    employees:[{id:'e1',skill:'generalist',group:'g1',name:'E',enabled:true}] }
  const s = new AttachmentStore(attDir)
  const coord = new Coordinator(cfg, { mode:'live', root:ROOT, attachmentStore:s })
  coord._askCalls = []
  for (const g of coord.team.groups.values()) {
    g.ask = async (prompt, o={}) => { coord._askCalls.push({ prompt, opts: o, groupId: g.id, at: Date.now() }); return '```json\n{"tasks":[{"id":"1","title":"x","difficulty":"easy","agent":"e1","depends":[],"instruction":"y"}],"minutes":"m"}\n```' }
    g.check = async () => { g.available = true }
  }
  await coord.init()
  const server = createServer(coord, { publicDir: path.join(ROOT,'public'), host:'127.0.0.1', token:'', attachmentStore: s })
  await new Promise(r => server.listen(0,'127.0.0.1',r))
  const port = server.address().port
  const hostHdr = `127.0.0.1:${port}`
  function close() { return new Promise(res => { try { server.closeAllConnections?.() } catch {} try { server.close(()=>res()) } catch { res() } setTimeout(res, 800).unref?.() }) }
  function cleanup() { return close().then(() => rmrf(rootTmp)) }
  return { coord, attStore: s, port, hostHdr, rootTmp, close, cleanup }
}

// ------ Helper: form-data upload with configurable chunking -----------------
async function upload(port, hostHdr, bytes, filename, { chunk=0, declaredSize=null, clientMessageId=null }={}) {
  const boundary = '---B'+crypto.randomBytes(8).toString('hex')
  const CRLF = '\r\n'
  const head = Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`)
  const parts = [head, bytes]
  if (declaredSize != null) parts.push(Buffer.from(`${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="declaredSize"${CRLF}${CRLF}${declaredSize}`))
  if (clientMessageId) parts.push(Buffer.from(`${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="clientMessageId"${CRLF}${CRLF}${clientMessageId}`))
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`))
  const total = parts.reduce((a,x)=>a+x.length,0)
  return await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('upload timeout')), 30000)
    const r = http.request({host:'127.0.0.1',port,method:'POST',path:'/niuma/v1/attachments',
      headers:{Host:hostHdr,Origin:`http://${hostHdr}`,'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':String(total)}},
      q => { const cs=[]; q.on('data',c=>cs.push(c)); q.on('end',()=>{clearTimeout(t);const b=Buffer.concat(cs);let j=null;try{j=JSON.parse(b.toString('utf8'))}catch{}res({s:q.statusCode,j,t:b.toString('utf8'),buf:b})})})
    r.on('error', e => { clearTimeout(t); rej(e) })
    const [hdr,...rest] = parts
    r.write(hdr)
    // last part = tail. All parts between = body + declared/client fields.
    const tail = rest.pop()
    // body may be chunked. rest[0] is bytes.
    const body = rest.shift()
    if (chunk > 0) for (let i=0;i<body.length;i+=chunk) r.write(body.subarray(i,i+chunk))
    else r.write(body)
    for (const p of rest) r.write(p)
    r.write(tail); r.end()
  })
}
async function httpCall(port, hostHdr, method, path, body=null, extraHeaders={}) {
  const buf = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)))
  const hdrs = { Host: hostHdr, Origin: `http://${hostHdr}`, ...extraHeaders }
  if (buf) { hdrs['Content-Type'] = hdrs['Content-Type'] || 'application/json'; hdrs['Content-Length'] = String(buf.length) }
  return await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('http timeout')), 30000)
    const r = http.request({host:'127.0.0.1',port,method,path,headers:hdrs}, q => {
      const cs=[]; q.on('data',c=>cs.push(c)); q.on('end',()=>{clearTimeout(t);const b=Buffer.concat(cs);let j=null;try{if((q.headers['content-type']||'').includes('json'))j=JSON.parse(b.toString('utf8'))}catch{}res({s:q.statusCode,j,t:b.toString('utf8'),buf:b})})
    })
    r.on('error', e => { clearTimeout(t); rej(e) })
    if (buf) r.write(buf); r.end()
  })
}

// ----------------- TESTS ------------------------------------------------
{ // T1 1KB doc
  const h = await startHarness(); try {
    const size=1024; const b=buildPdf(size); const oh=sha256(b)
    const up = await upload(h.port,h.hostHdr,b,'f.pdf',{declaredSize:size})
    if (up.s!==201) throw new Error(`HTTP ${up.s} ${up.t.slice(0,200)}`)
    if (up.j.size !== size) throw new Error(`j.size ${up.j.size} !== ${size}`)
    const row = h.attStore.get(up.j.id); const stored = fs.readFileSync(row.storagePath)
    if (stored.length !== size) throw new Error(`stored len ${stored.length}`)
    if (sha256(stored) !== oh) throw new Error('sha')
    pass('R2 1KB doc byte integrity')
  } catch(e){fail('R2 1KB doc byte integrity',e)} finally { await h.cleanup() }
}

{ // T2 6KB doc chunk 1500
  const h = await startHarness(); try {
    const size=6*1024; const b=buildPdf(size); const oh=sha256(b)
    const up = await upload(h.port,h.hostHdr,b,'f.pdf',{chunk:1500,declaredSize:size})
    if (up.s!==201) throw new Error(`HTTP ${up.s} ${up.t.slice(0,200)}`)
    const row = h.attStore.get(up.j.id); const stored = fs.readFileSync(row.storagePath)
    if (stored.length !== size) throw new Error(`len ${stored.length}`)
    if (sha256(stored) !== oh) throw new Error('sha')
    pass('R2 6KB doc chunk=1500 byte integrity')
  } catch(e){fail('R2 6KB doc chunk=1500 byte integrity',e)} finally { await h.cleanup() }
}

{ // T3 64KB doc chunk=8192
  const h = await startHarness(); try {
    const size=64*1024; const b=buildPdf(size); const oh=sha256(b)
    const up = await upload(h.port,h.hostHdr,b,'f.pdf',{chunk:8192,declaredSize:size})
    if (up.s!==201) throw new Error(`HTTP ${up.s} ${up.t.slice(0,200)}`)
    const row = h.attStore.get(up.j.id); const stored = fs.readFileSync(row.storagePath)
    if (stored.length !== size) throw new Error(`len ${stored.length}`)
    if (sha256(stored) !== oh) throw new Error('sha')
    pass('R2 64KB doc chunk=8192 byte integrity')
  } catch(e){fail('R2 64KB doc chunk=8192 byte integrity',e)} finally { await h.cleanup() }
}

{ // T4 123B tiny doc chunk=7
  const h = await startHarness(); try {
    const size=123; const b=buildPdf(size); const oh=sha256(b)
    const up = await upload(h.port,h.hostHdr,b,'f.pdf',{chunk:7,declaredSize:size})
    if (up.s!==201) throw new Error(`HTTP ${up.s} ${up.t.slice(0,200)}`)
    const row = h.attStore.get(up.j.id); const stored = fs.readFileSync(row.storagePath)
    if (stored.length !== size) throw new Error(`len ${stored.length}`)
    if (sha256(stored) !== oh) throw new Error('sha')
    pass('R2 tiny 123B doc chunk=7 byte integrity')
  } catch(e){fail('R2 tiny 123B doc chunk=7 byte integrity',e)} finally { await h.cleanup() }
}

{ // T5 PNG classify + SHA roundtrip via meta API
  const h = await startHarness(); try {
    const b=buildPng(1024); const oh=sha256(b)
    const up = await upload(h.port,h.hostHdr,b,'i.png',{declaredSize:b.length})
    if (up.s!==201) throw new Error(`upl ${up.s} ${up.t.slice(0,200)}`)
    const meta = await httpCall(h.port,h.hostHdr,'GET',`/niuma/v1/attachments/${up.j.id}/preview/meta`)
    if (meta.s!==200) throw new Error(`meta s ${meta.s} ${meta.t.slice(0,200)}`)
    if (meta.j.kind !== 'image') throw new Error(`kind ${meta.j.kind} !== image`)
    const row = h.attStore.get(up.j.id); if (sha256(fs.readFileSync(row.storagePath)) !== oh) throw new Error('png sha')
    pass('R2 PNG classifies as IMAGE + bytes exact via preview/meta API')
  } catch(e){fail('R2 PNG classifies as IMAGE + bytes exact via preview/meta API',e)} finally { await h.cleanup() }
}

{ // T6 /api/config safe exposure
  const h = await startHarness(); try {
    const r = await httpCall(h.port,h.hostHdr,'GET','/api/config')
    if (r.s!==200) throw new Error(`HTTP ${r.s}`)
    if (!r.j.ok) throw new Error('!ok')
    if (!Array.isArray(r.j.vision.visionCapableAdapterIds) || r.j.vision.visionCapableAdapterIds.length<1) throw new Error('vision empty')
    if (r.j.transcription.provider !== 'test') throw new Error(`provider ${r.j.transcription.provider}`)
    if (!r.j.transcription.enabled) throw new Error('not enabled')
    if (/sk-|not-a-real-key|baseUrl|apiKey/.test(JSON.stringify(r.j))) throw new Error('key/secret leak')
    pass('R1 /api/config exposes safe booleans no keys')
  } catch(e){fail('R1 /api/config exposes safe booleans no keys',e)} finally { await h.cleanup() }
}

{ // T7 identical retry caches
  const h = await startHarness(); try {
    const mid='idem-'+Date.now(); const env={clientMessageId:mid,text:'hello',attachmentIds:[]}
    const a = await httpCall(h.port,h.hostHdr,'POST','/api/message',env)
    // wait for the coordinator's async drain loop to fully push into the queue
    // (init() sets up the chat, then post() calls drain() synchronously, but the
    // queue might get consumed during makePlan projectContext/git scans. We just
    // ensure we see exactly ONE user message with this text since post→drain
    // will consume the queue but messages array still records it.)
    await new Promise(r=>setTimeout(r, 20))
    const userMsgs1 = h.coord.messages.filter(m => m.role==='user' && (m.text||'').includes('hello')).length
    const b = await httpCall(h.port,h.hostHdr,'POST','/api/message',env)
    await new Promise(r=>setTimeout(r, 20))
    const userMsgs2 = h.coord.messages.filter(m => m.role==='user' && (m.text||'').includes('hello')).length
    if (a.s!==200) throw new Error(`a ${a.s} ${a.t.slice(0,200)}`)
    if (b.s!==200) throw new Error(`b ${b.s} ${b.t.slice(0,200)}`)
    if (b.j.idempotent !== true) throw new Error('b not idempotent=true')
    if (userMsgs1 < 1) throw new Error('userMsgs1 none')
    if (userMsgs1 !== userMsgs2) throw new Error(`user messages duplicated: ${userMsgs1} → ${userMsgs2}`)
    pass('R4 idempotency identical retry caches hit with idempotent:true')
  } catch(e){fail('R4 idempotency identical retry caches hit with idempotent:true',e)} finally { await h.cleanup() }
}

{ // T8 same id diff content → 409 IDEMPOTENT_CONFLICT
  const h = await startHarness(); try {
    const mid='conf-'+Date.now()
    const a = await httpCall(h.port,h.hostHdr,'POST','/api/message',{clientMessageId:mid,text:'A'})
    const b = await httpCall(h.port,h.hostHdr,'POST','/api/message',{clientMessageId:mid,text:'BBB'})
    if (a.s!==200) throw new Error(`a ${a.s}`)
    if (b.s!==409) throw new Error(`b expected 409 got ${b.s}`)
    if (b.j.code !== 'IDEMPOTENT_CONFLICT') throw new Error(`code ${b.j?.code}`)
    pass('R4 idempotency different content returns HTTP 409 IDEMPOTENT_CONFLICT')
  } catch(e){fail('R4 idempotency different content returns HTTP 409 IDEMPOTENT_CONFLICT',e)} finally { await h.cleanup() }
}

{ // T9 bad ATTACHMENT_INVALID → fix retry with same id → exactly ONE accepted
  const h = await startHarness(); try {
    const mid='fix-'+Date.now()
    const bad = await httpCall(h.port,h.hostHdr,'POST','/api/message',{clientMessageId:mid,text:'x',attachmentIds:['0000000000000000000000ff']})
    if (bad.s!==400) throw new Error(`expected 400 got ${bad.s}`)
    if (bad.j.code !== 'ATTACHMENT_INVALID') throw new Error(`code ${bad.j?.code}`)
    const userMsgsBefore = h.coord.messages.filter(m => m.role==='user' && (m.text||'').includes('x')).length
    // If validation rejected BEFORE the post call cached it (per rule 3 failed
    // validation never cached), the cache should not have mid yet.
    const before = h.coord._idempotencyCache?.get(mid)
    if (before) throw new Error('failed validation was cached as accepted: rule 3 broken')
    const pdf = buildPdf(2048)
    const up = await upload(h.port,h.hostHdr,pdf,'d.pdf',{declaredSize:2048,clientMessageId:mid})
    if (up.s!==201) throw new Error(`pdf upload ${up.s} ${up.t.slice(0,200)}`)
    const goodEnv = {clientMessageId:mid,text:'x',attachmentIds:[up.j.id]}
    const g = await httpCall(h.port,h.hostHdr,'POST','/api/message',goodEnv)
    if (g.s!==200) throw new Error(`good ${g.s} ${g.t.slice(0,200)}`)
    await new Promise(r=>setTimeout(r, 20))
    const userMsgsAfterFirstGood = h.coord.messages.filter(m => m.role==='user' && (m.text||'').includes('x')).length
    if (userMsgsAfterFirstGood !== userMsgsBefore + 1) throw new Error(`msgs ${userMsgsBefore} → ${userMsgsAfterFirstGood} ≠ +1`)
    const idem = await httpCall(h.port,h.hostHdr,'POST','/api/message',goodEnv)
    if (!idem.j.idempotent) throw new Error('idem retry not cached')
    await new Promise(r=>setTimeout(r, 20))
    const userMsgsFinal = h.coord.messages.filter(m => m.role==='user' && (m.text||'').includes('x')).length
    if (userMsgsFinal !== userMsgsAfterFirstGood) throw new Error(`cached retry pushed a duplicate user message: ${userMsgsAfterFirstGood} → ${userMsgsFinal}`)
    pass('R4 ATTACHMENT_INVALID → corrected retry same id exactly ONE accepted (idempotency-retry chain)')
  } catch(e){fail('R4 ATTACHMENT_INVALID → corrected retry same id exactly ONE accepted (idempotency-retry chain)',e)} finally { await h.cleanup() }
}

{ // T10 attach-only PROGRAM no-intent gate
  const h = await startHarness(); try {
    const pdf = buildPdf(1024)
    const up = await upload(h.port,h.hostHdr,pdf,'a.pdf',{declaredSize:1024})
    if (up.s!==201) throw new Error(`upload ${up.s}`)
    const helloMsgsBefore = h.coord.messages.length
    let planCalls = 0
    const orig = h.coord.makePlan.bind(h.coord); h.coord.makePlan = async (...a) => { planCalls++; return await orig(...a) }
    const r = await httpCall(h.port,h.hostHdr,'POST','/api/message',{text:'',attachmentIds:[up.j.id]})
    if (r.s!==200) throw new Error(`HTTP ${r.s} ${r.t}`)
    if (!r.j.ok || r.j.noIntent !== true) throw new Error('expected ok:true + noIntent:true PROGRAM gate via HTTP, got: ' + JSON.stringify(r.j))
    await new Promise(res=>setTimeout(res, 60))
    if (planCalls !== 0) throw new Error(`makePlan calls = ${planCalls}`)
    if (h.coord.tasks.length !== 0) throw new Error(`tasks=${h.coord.tasks.length}`)
    const newMsgs = h.coord.messages.slice(helloMsgsBefore)
    const flat = newMsgs.map(m=>String(m.text||'')).join('\n')
    if (!/告诉我|整理|翻译|总结|说明|已收到|意图|暂停/.test(flat)) throw new Error('ask-intent missing: '+flat.slice(-500))
    pass('R5 attach-only no-intent PROGRAM gate: HTTP /api/message returns noIntent:true; makePlan never invoked 0 tasks ask-intent reply')
  } catch(e){fail('R5 attach-only no-intent PROGRAM gate: HTTP /api/message returns noIntent:true; makePlan never invoked 0 tasks ask-intent reply',e)} finally { await h.cleanup() }
}

{ // T11 EMPTY 400
  const h = await startHarness(); try {
    const r = await httpCall(h.port,h.hostHdr,'POST','/api/message',{text:'   ',attachmentIds:[]})
    if (r.s!==400) throw new Error(`expected 400 got ${r.s}`)
    if (r.j.code !== 'EMPTY_MESSAGE') throw new Error(`code ${r.j?.code}`)
    pass('R4 empty envelope HTTP 400 EMPTY_MESSAGE explicit rejection')
  } catch(e){fail('R4 empty envelope HTTP 400 EMPTY_MESSAGE explicit rejection',e)} finally { await h.cleanup() }
}

{ // T12 text-only legacy compat
  const h = await startHarness(); try {
    const r = await httpCall(h.port,h.hostHdr,'POST','/api/message',{text:'hello'})
    if (r.s!==200) throw new Error(`HTTP ${r.s}`)
    await new Promise(r=>setTimeout(r, 30))
    const userHellos = h.coord.messages.filter(m => m.role==='user' && String(m.text||'').trim()==='hello')
    if (userHellos.length < 1) throw new Error('no user hello message found. tail=' + JSON.stringify(h.coord.messages.slice(-5).map(m=>({role:m.role,text:m.text}))))
    const direct = h.coord.post('hello')
    if (!direct || direct.ok !== true) throw new Error('direct string post not accepted: ' + JSON.stringify(direct))
    pass('R1 text-only legacy envelope still accepted with null clientMessageId empty attachmentIds')
  } catch(e){fail('R1 text-only legacy envelope still accepted with null clientMessageId empty attachmentIds',e)} finally { await h.cleanup() }
}

{ // T13 vision ask() images[] round-trip
  const h = await startHarness(); try {
    const png = buildPng(1024); const origSha = sha256(png)
    const up = await upload(h.port,h.hostHdr,png,'i.png',{declaredSize:png.length})
    if (up.s!==201) throw new Error(`upload ${up.s}`)
    const env = { clientMessageId:'vis-'+Date.now(), text:'描述图', attachmentIds:[up.j.id] }
    const p = h.coord.post(env)
    if (!p.ok) throw new Error('post !ok')
    let safety = 0
    while ((h.coord.busy || h.coord.queue.length) && safety++ < 120) await new Promise(r=>setTimeout(r, 15))
    const calls = h.coord._askCalls || []
    if (calls.length < 1) throw new Error(`ask calls=${calls.length}`)
    const imgs = calls[0].opts && calls[0].opts.images
    if (!Array.isArray(imgs) || imgs.length < 1) throw new Error('images[] absent: ' + JSON.stringify(Object.keys(calls[0].opts||{})))
    for (const img of imgs) {
      if (!img.mime || !img.base64) throw new Error('img mime/base64 missing')
      const wire = Buffer.from(img.base64,'base64')
      if (sha256(wire) !== origSha) throw new Error('wire sha != original uploaded sha')
    }
    pass('R3 vision ask() gets actual uploaded PNG bytes on images[] side channel')
  } catch(e){fail('R3 vision ask() gets actual uploaded PNG bytes on images[] side channel',e)} finally { await h.cleanup() }
}

{ // T14 VISION_UNSUPPORTED explicit 0-tasks + refusal message
  const h = await startHarness({ enableVision: false }); try {
    // Force this harness's g to also not support vision, else the test sets cfg.vision=false but OpenAiGroup.supportsVision() reads its own cfg.vision.
    for (const g of h.coord.team.groups.values()) { g.cfg.vision = false }
    const png = buildPng(1024)
    const up = await upload(h.port,h.hostHdr,png,'x.png',{declaredSize:png.length})
    if (up.s!==201) throw new Error(`upl ${up.s} ${up.t.slice(0,200)}`)
    const tBefore = h.coord.tasks.length
    h.coord.post({ clientMessageId:'voff-'+Date.now(), text:'描述', attachmentIds:[up.j.id] })
    let safety=0; while((h.coord.busy || h.coord.queue.length) && safety++<80) await new Promise(r=>setTimeout(r,20))
    if (h.coord.tasks.length !== tBefore) throw new Error(`tasks grew ${tBefore} → ${h.coord.tasks.length}`)
    const flat = h.coord.messages.slice(-10).map(m=>String(m.text||'')).join('\n')
    if (!/VISION_UNSUPPORTED|视觉|不支持图片|不支持视觉|无法分析|未配置视觉|切换支持/.test(flat)) throw new Error('unsupported phrase absent tail: ' + flat.slice(-800))
    pass('R3 VISION_UNSUPPORTED route explicit: 0 new tasks + capability refusal message')
  } catch(e){fail('R3 VISION_UNSUPPORTED route explicit: 0 new tasks + capability refusal message',e)} finally { await h.cleanup() }
}

{ // T15 audio → test provider transcribe → PATCH confirm → only confirmed enters prompt
  const h = await startHarness({ transcriptionProvider: 'test' }); try {
    const wav = buildWav(2048)
    const up = await upload(h.port,h.hostHdr,wav,'v.wav',{declaredSize:wav.length})
    if (up.s!==201) throw new Error(`wav upload ${up.s}`)
    const id = up.j.id
    const { runExtract } = await import('../src/attachments/parse/extractor.js')
    const row = h.attStore.get(id)
    await runExtract(h.attStore, id, { transcription: h.coord.config.transcription })
    const row2 = h.attStore.get(id)
    const ex = row2 && row2.extract
    if (row2.kind !== 'audio') throw new Error('kind not audio: ' + row2.kind)
    if (!ex?.originalTranscript || ex.originalTranscript.length < 8) throw new Error('original transcript empty: ' + JSON.stringify(ex))
    const preMeta = await httpCall(h.port,h.hostHdr,'GET',`/niuma/v1/attachments/${id}/preview/meta`)
    if (preMeta.s!==200) throw new Error('meta s '+preMeta.s)
    if (preMeta.j.originalTranscript !== ex.originalTranscript) throw new Error('orig mismatch meta')
    if ((preMeta.j.confirmedEdited || '').length) throw new Error('confirmed should be empty initially')
    const patchText = '这是服务器端 PATCH 确认后的文字稿，模型只应该看到这段话。'
    const patched = await httpCall(h.port,h.hostHdr,'PATCH',`/niuma/v1/attachments/${id}/transcript`,{ confirmedEdited: patchText })
    if (patched.s!==200) throw new Error(`patch s ${patched.s} ${patched.t.slice(0,200)}`)
    if (patched.j.confirmedEdited !== patchText) throw new Error('patched wrong')
    const assembled = h.coord.assembleModelBoundary({ clientMessageId:'a-'+Date.now(), text:'起草回复', attachmentIds:[id] })
    if (!/这是服务器端 PATCH 确认后的文字稿，模型只应该看到这段话。/.test(assembled.prompt)) throw new Error('confirmed missing from prompt')
    if (assembled.prompt.includes(ex.originalTranscript)) throw new Error('raw originalTranscript leaked into prompt')
    pass('R3 audio test provider → PATCH confirm persists server-side → only confirmed in prompt original NOT leaked')
  } catch(e){fail('R3 audio test provider → PATCH confirm persists server-side → only confirmed in prompt original NOT leaked',e)} finally { await h.cleanup() }
}

console.log('\n========================= SUMMARY =========================')
const ok = results.filter(r=>r.ok).length, tot = results.length
for (const r of results) if (!r.ok) console.log('F', r.name, '→', r.err)
console.log(`${ok}/${tot} passed`)
process.exit(ok === tot ? 0 : 1)
