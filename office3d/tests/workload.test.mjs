import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildWorkload, busyTime, confidence, createWorkload, workdays } from '../workload.mjs'

const schedule = { timezone: 'Asia/Phnom_Penh', days: [0,1,2,3,4,5,6], start: '08:30', end: '17:30' }
const iso = (d, time) => `${d}T${time}:00+07:00`
const now = Date.parse('2026-10-29T12:00:00+07:00')
const agent = (id = 'a', name = id) => ({ id, name, title: '前端工程师', function: '前端工程师', projects: ['p'], status: 'idle' })
function fixture(n = 14) {
  const window = workdays(now, 14, schedule).slice(-n), db = { enabled: true, agents: { a: agent(), b: agent('b') }, observations: {}, reworks: {}, tasks: {}, commentsComplete: true }, ledger = { runs: {}, done: {}, comments: {} }
  for (const d of window) db.observations[d] = Object.fromEntries(['a','b'].map(id => [id, { available: true, unavailable: false, queue: { am: { total:0, todo:0, blocked:0 }, pm: { total:0, todo:0, blocked:0 } } }]))
  return { now, ledger, db, schedule }
}
function busy(f, status = 'succeeded') {
  for (const d of Object.keys(f.db.observations)) {
    f.ledger.runs[d] = { a:'a', s:status, at:iso(d,'17:00'), startedAt:iso(d,'08:30'), finishedAt:iso(d,'17:00') }
    f.db.observations[d].a.queue.pm = { total:4, todo:4, blocked:0 }
  }
  return f
}
const row = f => buildWorkload(f).roles.find(r => r.id === 'a')
test('出勤只认实采idle/running；暂停/出错单记不可用，不算空闲', () => {
  const f=fixture(2), days=Object.keys(f.db.observations)
  for(const d of days) f.db.observations[d].a={available:false,unavailable:true,queue:{}}
  const r=row(f)
  assert.equal(r.availableDays,0); assert.equal(r.unavailableDays,2); assert.equal(r.utilization,null)
  assert.equal(r.observedDays,2); assert.equal(r.rows.filter(d=>d.observed).length,2)
})
test('金边作息包括周日，窗口排除今天；Oct29之前最多参考', () => {
  assert.ok(workdays(now,14,schedule).includes('2026-10-25'))
  assert.equal(workdays(now,14,schedule).at(-1),'2026-10-28')
  const f=fixture(); f.now=Date.parse('2026-10-28T23:59:00+07:00')
  assert.equal(row(f).observedDays,13); assert.equal(row(f).confidence,'参考')
  assert.equal(confidence(6),'不足以判断'); assert.equal(confidence(7),'参考'); assert.equal(confidence(13),'参考'); assert.equal(confidence(14),'可用')
})
test('忙碌按作息裁剪，跨午夜、并发区间不重复；缺时间戳未知', () => {
  const d='2026-10-25', run=(s,e)=>({startedAt:iso(d,s),finishedAt:iso(d,e),at:iso(d,e)})
  assert.equal(busyTime([run('07:00','10:00'),run('09:00','18:00')],d,schedule),9*3600000)
  assert.equal(busyTime([{startedAt:iso('2026-10-24','23:00'),finishedAt:iso(d,'09:30'),at:iso(d,'09:30')}],d,schedule),3600000)
  assert.equal(busyTime([{at:iso(d,'10:00')}],d,schedule),null)
})
test('运行分开记成功失败超时取消，取消不进成功率分母，复用T4', () => {
  const f=fixture(1), d=Object.keys(f.db.observations)[0]
  for(const s of ['succeeded','failed','timed_out','cancelled']) f.ledger.runs[s]={a:'a',s,at:iso(d,'10:00')}
  f.ledger.done.one={a:'a',at:iso(d,'11:00')};f.ledger.comments.one={a:'a',at:iso(d,'11:01')}
  const r=row(f)
  assert.equal(r.runs,4);assert.equal(r.failed,1);assert.equal(r.timedOut,1);assert.equal(r.cancelled,1);assert.equal(r.successRate,1/3);assert.equal(r.productiveDays,1);assert.equal(r.done,1);assert.equal(r.comments,1)
  assert.equal(r.busyMs,null);assert.equal(r.utilization,null)
})
test('不足7天的忙岗位和空闲岗位均无增减建议（5天旧账本）', () => {
  for(const f of [fixture(5),busy(fixture(5))]) assert.equal(buildWorkload(f).suggestions.filter(s=>s.type!=='排查').length,0)
})
test('快照不足7个完整日：即便等待已超4小时也不触发扩编', () => {
  const f=busy(fixture())
  Object.values(f.db.observations).slice(0,8).forEach(o=>{o.a.queue={}})
  f.db.tasks.one={agentId:'a',todoAt:iso('2026-10-28','08:30'),firstRunAt:iso('2026-10-28','16:30')}
  assert.equal(row(f).snapshotDays,6);assert.ok(row(f).gaps.some(g=>g.includes('快照积累中')))
  assert.equal(buildWorkload(f).suggestions.filter(s=>s.id==='a').length,0)
})
test('扩编必须忙+队列+正常成功率，阈值可调且随证据返回', () => {
  const f=busy(fixture(7)), r=buildWorkload(f), s=r.suggestions.find(s=>s.id==='a')
  assert.equal(s.type,'扩编');assert.equal(s.confidence,'参考');assert.equal(s.facts.queueDayShare,1);assert.equal(s.facts.successRate,1);assert.equal(s.thresholds.busyUtilization,.7)
  f.db.thresholds={queueTodo:5};assert.equal(buildWorkload(f).suggestions.filter(s=>s.type==='扩编').length,0)
})
test('失败率高先排查，不因失败重跑扩编；阻塞、返工、长期不可用可排查', () => {
  const f=busy(fixture(7),'failed');assert.deepEqual(buildWorkload(f).suggestions.filter(s=>s.id==='a').map(s=>s.type),['排查'])
  const b=fixture(7);Object.values(b.db.observations).forEach(o=>o.a.queue.pm={total:1,todo:0,blocked:1});assert.equal(buildWorkload(b).suggestions[0].type,'排查')
  const u=fixture(7);Object.values(u.db.observations).forEach(o=>o.a={available:false,unavailable:true,queue:{}});assert.equal(buildWorkload(u).suggestions[0].type,'排查')
  const re=fixture(1); for(let i=0;i<3;i++)re.db.reworks[i]={agentId:'a',at:iso('2026-10-28','12:00')};assert.equal(buildWorkload(re).suggestions[0].type,'排查')
})
test('缩编须14天、低产出低利用率、本人及同类同期零队列且有承接岗位', () => {
  const f=fixture();assert.equal(buildWorkload(f).suggestions.find(s=>s.id==='a').type,'缩编 / 合并')
  f.db.observations['2026-10-20'].b.queue.am.total=1;assert.equal(buildWorkload(f).suggestions.filter(s=>s.id==='a').length,0)
  f.db.observations['2026-10-20'].b.queue.am.total=0;f.db.agents.b.function='设计师';assert.equal(buildWorkload(f).suggestions.filter(s=>s.id==='a').length,0)
  f.db.agents.b.function='前端工程师';f.db.agents.b.projects=['other'];assert.equal(buildWorkload(f).suggestions.filter(s=>s.id==='a').length,0)
  f.db.agents.b.projects=['p'];f.db.agents.b.status='paused';assert.equal(buildWorkload(f).suggestions.filter(s=>s.id==='a').length,0)
})
test('资金类永不缩编；满足扩编标董事会审批', () => {
  for(const name of ['GoSenior','DBEngineer','LedgerAuditor','SecurityReviewer','账务审查']) {const f=fixture();f.db.agents.a.name=name;assert.equal(buildWorkload(f).suggestions.filter(s=>s.id==='a'&&s.type.includes('缩编')).length,0)}
  const f=busy(fixture(7));f.db.agents.a.name='GoSenior';assert.equal(buildWorkload(f).suggestions.find(s=>s.id==='a').boardApproval,true)
})
test('等待只用真实todo与首次运行；负间隔及无时间戳忽略', () => {
  const f=fixture(); f.db.tasks={a:{agentId:'a',todoAt:iso('2026-10-28','08:30'),firstRunAt:iso('2026-10-28','10:30')},b:{agentId:'a',todoAt:iso('2026-10-28','12:30'),firstRunAt:iso('2026-10-28','10:30')},c:{agentId:'a',firstRunAt:iso('2026-10-28','10:30')}}
  assert.equal(row(f).waitMs,2*3600000)
})

function runtime(t, enabled=true, clock='2026-10-29T10:00:00+07:00') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workload-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const workhoursFile=path.join(dir,'hours.json');fs.writeFileSync(workhoursFile,JSON.stringify(schedule))
  if(enabled!==undefined)fs.writeFileSync(path.join(dir,'workload.json'),JSON.stringify({enabled}))
  let ms=Date.parse(clock), calls=[], notifications=[], issue={id:'i',assigneeAgentId:'a',projectId:'p',status:'todo',todoAt:iso('2026-10-29','08:30'),updatedAt:'v1',description:'SECRET BODY MUST NOT APPEAR'}
  let run={id:'r',agentId:'a',status:'succeeded',startedAt:iso('2026-10-28','09:00'),finishedAt:iso('2026-10-28','10:00'),issueId:'i'}
  const ledger={runs:{r:{a:'a',s:'succeeded',at:iso('2026-10-28','10:00')}},done:{},comments:{}}
  const options={dir,company:'c',workhoursFile,stats:()=>structuredClone(ledger),now:()=>ms,dutyOn:()=>true,notify:async msg=>notifications.push(msg),get:async p=>{calls.push(p);if(p.endsWith('/agents'))return [agent('a','a user@example.com $55 10.1.2.3')];if(p.includes('heartbeat-runs'))return [run];if(p.endsWith('/comments'))return [{id:'c',createdAt:iso('2026-10-28','12:00'),body:'【第 2 轮退回】secret comment'}];if(p.endsWith('/issues'))return [issue];throw Error('unexpected GET '+p)}}
  const w=createWorkload(options);t.after(()=>w.stop())
  return {dir,w,options,calls,notifications,ledger,issue,run,advance:n=>ms+=n,set:v=>ms=Date.parse(v)}
}
test('缺配置/关闭/非布尔true均不聚合、不写文件、不通知、不读Paperclip',async t=>{
  for(const enabled of [false,undefined,'true']) {
    const r=runtime(t,enabled);if(enabled===undefined)fs.unlinkSync(path.join(r.dir,'workload.json'))
    const before=fs.readdirSync(r.dir).sort();r.advance(200000)
    assert.equal((await r.w.tick()).skip,'功能关闭');assert.equal((await r.w.report()).skip,'功能关闭');assert.equal(r.w.reportView().roles.length,0)
    assert.deepEqual(r.calls,[]);assert.deepEqual(r.notifications,[]);assert.deepEqual(fs.readdirSync(r.dir).sort(),before)
  }
})
test('损坏账本容错提示且不覆盖；重启首两分钟不聚合',async t=>{
  const r=runtime(t);assert.equal((await r.w.tick()).skip,'启动后延迟2分钟');assert.deepEqual(r.calls,[])
  fs.writeFileSync(path.join(r.dir,'workload.json'),'{bad');r.advance(120000);assert.equal((await r.w.tick()).skip,'功能关闭');assert.match(r.w.view().error,/损坏/);assert.equal(fs.readFileSync(path.join(r.dir,'workload.json'),'utf8'),'{bad')
})
test('实采队列仅08:30/17:00，不补错过的时点；原子写和重启保留、返工去重、真实关联',async t=>{
  const r=runtime(t,true,'2026-10-29T08:00:00+07:00');r.set('2026-10-29T08:30:00+07:00');assert.equal((await r.w.tick()).ok,true)
  let db=JSON.parse(fs.readFileSync(path.join(r.dir,'workload.json')))
  assert.equal(db.observations['2026-10-29'].a.available,true);assert.equal(db.observations['2026-10-29'].a.queue.am.todo,1);assert.equal(Object.keys(db.reworks).length,1)
  assert.equal(db.tasks.i.firstRunAt,iso('2026-10-28','09:00'))
  assert.equal(db.timedRuns.r.startedAt,iso('2026-10-28','09:00'))
  r.set('2026-10-29T10:00:00+07:00');await r.w.tick()
  const restarted=createWorkload(r.options);t.after(()=>restarted.stop());assert.equal(restarted.reportView().roles.length,1)
  db=JSON.parse(fs.readFileSync(path.join(r.dir,'workload.json')));assert.equal(Object.keys(db.reworks).length,1);assert.equal(db.observations['2026-10-29'].a.queue.pm,undefined)
  assert.ok(!fs.readdirSync(r.dir).some(s=>s.endsWith('.tmp')))
  r.set('2026-10-29T17:00:00+07:00');await r.w.tick();db=JSON.parse(fs.readFileSync(path.join(r.dir,'workload.json')));assert.equal(db.observations['2026-10-29'].a.queue.pm.total,1)
})
test('周一08:20每周一次报告通知，手动不覆盖，报告脱敏且不含正文',async t=>{
  const r=runtime(t,true,'2026-11-02T08:00:00+07:00');r.set('2026-11-02T08:19:00+07:00');await r.w.tick()
  // 队列采样不依赖此调用；准备模拟岗位元数据以验证报告脱敏。
  r.set('2026-11-02T08:20:00+07:00');await r.w.tick();await r.w.tick();assert.equal(r.notifications.length,1)
  const first=fs.readdirSync(path.join(r.dir,'reports'));assert.equal(first.length,1)
  const old=fs.readFileSync(path.join(r.dir,'reports',first[0]),'utf8')
  assert.ok(!old.includes('SECRET BODY'));assert.ok(!old.includes('secret comment'));assert.ok(!old.includes('user@example.com'));assert.ok(!old.includes('$55'));assert.ok(!old.includes('10.1.2.3'));assert.match(old,/〔邮箱〕/)
  const report=await r.w.report();assert.match(report.path,/-2\.md$/);assert.equal(fs.readFileSync(path.join(r.dir,'reports',first[0]),'utf8'),old);assert.equal(r.notifications.length,2)
  const restarted=createWorkload(r.options);r.advance(120000);await restarted.tick();assert.equal(r.notifications.length,2);restarted.stop()
})
test('通知失败记录尝试，自动任务不重复发送同一份报告',async t=>{
  const r=runtime(t,true,'2026-11-02T08:00:00+07:00');let tries=0
  const w=createWorkload({...r.options,notify:async()=>{tries++;throw Error('network')}});t.after(()=>w.stop());r.set('2026-11-02T08:20:00+07:00');await w.tick();await w.tick();assert.equal(tries,1);assert.equal(w.view().lastReport.endsWith('.md'),true)
})
test('聚合读取途中关闭开关，不覆盖关闭配置、不落账、不通知',async t=>{
  const r=runtime(t), originalGet=r.options.get
  const w=createWorkload({...r.options,get:async p=>{const result=await originalGet(p);fs.writeFileSync(path.join(r.dir,'workload.json'),JSON.stringify({enabled:false}));return result}})
  t.after(()=>w.stop());r.advance(120000)
  assert.match((await w.tick()).error,/总开关关闭/)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.dir,'workload.json'))),{enabled:false})
  assert.deepEqual(r.notifications,[]);assert.ok(!fs.existsSync(path.join(r.dir,'reports')))
})
test('没有页面轮询时仍保留GET中的新终态运行，未知时间仍未知',async t=>{
  const r=runtime(t);r.run.id='new';r.run.startedAt=null;r.advance(120000);await r.w.tick()
  const a=r.w.reportView().roles[0];assert.equal(a.runs,2);assert.equal(a.busyMs,null)
})
test('stats补字段保留同状态旧记录的a/s/at及每日计数，不启动真实计时器',()=>{
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))), source=fs.readFileSync(path.join(root,'stats.mjs'),'utf8').replace(/^import .*$/gm,'').replace('export function createStats','function createStats')
  const old={runs:{r:{a:'a',s:'succeeded',at:iso('2026-10-15','10:00')}},done:{},comments:{},decisions:{},since:iso('2026-10-15','10:00')}
  const context={fs:{readFileSync:()=>JSON.stringify(old)},path,structuredClone,setInterval:()=>0}
  vm.runInNewContext(source+'\nthis.make=createStats',context)
  const stats=context.make({dir:'unused',get:async()=>[],company:'fake'})
  stats.ingest({runs:[{id:'r',agentId:'a',status:'succeeded',startedAt:iso('2026-10-15','09:00'),finishedAt:iso('2026-10-16','10:00')}]})
  assert.equal(stats.snapshot().runs.r.at,old.runs.r.at);assert.equal(stats.snapshot().runs.r.finishedAt,iso('2026-10-16','10:00'));assert.equal(stats.daily('2026-10-15').runs.total,1);assert.equal(stats.daily('2026-10-16').runs.total,0)
})
test('server接线在访问控制后，API_PATHS阻止大屏，保持局域网只读与结果透传',()=>{
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))), s=fs.readFileSync(path.join(root,'server.mjs'),'utf8'), ui=fs.readFileSync(path.join(root,'ui.js'),'utf8')
  const api=s.match(/const API_PATHS = new Set\(\[([^\]]+)\]/)[1];assert.match(api,/'\/workload'/);assert.match(api,/'\/replay'/);assert.match(api,/'\/collab'/)
  const gate=s.indexOf('if (wallScope &&');assert.ok(gate<s.indexOf("url.pathname === '/workload'"));assert.match(s.slice(gate,gate+200),/API_PATHS\.has/)
  assert.ok(s.indexOf("url.pathname === '/replay'")>gate)  // T11：/replay 也必须在访问控制之后
  assert.ok(s.indexOf("url.pathname === '/replay'")<s.indexOf("if (!staticOk"))  // 且在静态回退之前
  assert.ok(s.indexOf("url.pathname === '/collab'")>gate)  // T12：/collab 也在访问控制之后
  assert.ok(s.indexOf("url.pathname === '/collab'")<s.indexOf("if (!staticOk")) // 且在静态回退之前
  assert.match(s,/import \{ buildCollab[^}]*\} from '\.\/collab\.mjs'/) // T12：引入 buildCollab
  assert.match(s,/window 只能是 7 \/ 14 \/ all/);assert.match(s,/kinds 只能包含 dispatch \/ report \/ speak/)
  assert.match(s,/if \(lanUser && !LAN.write\) return json\(403/);assert.match(s,/a.type === 'workload_report'\) return workload.report\(\)/);assert.match(s,/startsWith\('workload_'\)/)
  assert.match(ui,/state\?\.lan \|\| !data.enabled \? 'disabled'/);assert.match(ui,/esc\(JSON.stringify\(data.thresholds/)
})
