// S1-2 前厅数据后端：访客登记 + 董事会公告。纯函数 + 工厂（临时目录），仿 workload.test.mjs / chat.test.mjs 的写法。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFoyer, digestOf, normalizeAnnounce, dayKey, COOKIE_RE } from '../foyer.mjs'
import { scanMemoryText } from '../memory.mjs'
import { redactText } from '../wall.mjs'

// 夹具：临时目录里跑真文件；seed 可预置 foyer.json（visitors / announcement 开关默认关闭，测试里按需打开）
function runtime(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foyer-t-'))
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {} })
  let ms = Date.now()
  if (opts.seed) fs.writeFileSync(path.join(dir, 'foyer.json'), JSON.stringify({ visitors: { enabled: false }, announcement: { enabled: false }, ...opts.seed }))
  const logs = []
  const foyer = createFoyer({ dir, now: () => ms, redactText, scanMemoryText, log: (...a) => logs.push(a.join(' ')), ...opts })
  return { dir, set: (v) => { ms = v }, foyer, logs }
}

// ── 访客 ──
test('摘要哈希：相同 salt+id 相同摘要；不同 salt 不同；64 位十六进制', (t) => {
  const a = 'a'.repeat(32)
  assert.equal(digestOf('s1', a), digestOf('s1', a))
  assert.notEqual(digestOf('s1', a), digestOf('s2', a))
  assert.match(digestOf('s1', a), /^[0-9a-f]{64}$/)
})

test('cookie 格式：32 位 hex 沿用（不再下 cookie），否则换发并带正确属性', (t) => {
  const { set, foyer } = runtime(t, { seed: { visitors: { enabled: true } } })
  set(1)
  assert.deepEqual(foyer.touch({ kind: 'lan', cookieValue: 'a'.repeat(32) }), {}) // 合法：沿用
  const r = foyer.touch({ kind: 'lan', cookieValue: 'ab'.repeat(15) }) // 30 位，非法
  const v = r.setCookie.replace('office_visitor=', '').split(';')[0]
  assert.ok(COOKIE_RE.test(v))
  assert.match(r.setCookie, /HttpOnly; SameSite=Strict; Path=\/; Max-Age=31536000/)
  assert.ok(!/Secure/.test(r.setCookie))
  assert.equal(foyer.visitors().length, 2)
})

test('伪造 cookie（过长 / 非法字符 / 重复）不崩溃、不写脏数据', (t) => {
  const { set, foyer } = runtime(t, { seed: { visitors: { enabled: true } } })
  set(1)
  for (const c of ['x'.repeat(200), 'ab!c'.repeat(8), 'zz'.repeat(16), 'zz'.repeat(16)]) {
    const r = foyer.touch({ kind: 'lan', cookieValue: c })
    assert.ok(r.setCookie && typeof r.setCookie === 'string')
  }
  const vs = foyer.visitors()
  assert.ok(vs.every((v) => v.id8.length === 8 && Number.isInteger(v.visits) && v.visits >= 1))
})

test('去抖：30 分钟内同一设备只算一次；lastSeenAt 每次更新；超过后再次计数', (t) => {
  const { set, foyer } = runtime(t, { seed: { visitors: { enabled: true } } })
  const base = Date.parse('2026-10-20T08:00:00+07:00')
  const id = 'b'.repeat(32)
  set(base)
  foyer.touch({ kind: 'lan', cookieValue: id })
  set(base + 10 * 60000)
  foyer.touch({ kind: 'lan', cookieValue: id })
  let s = foyer.summary()
  assert.equal(s.visitors.lan.visits, 1)
  assert.equal(s.visitors.lan.devices, 1)
  assert.equal(s.visitors.lan.lastAt, new Date(base + 10 * 60000).toISOString()) // lastSeenAt 已更新
  set(base + 41 * 60000) // 距上次加载（base+10min）已 31 分钟 > 30 → 又一次计数（滚动窗口：lastSeenAt 每次更新）
  foyer.touch({ kind: 'lan', cookieValue: id })
  s = foyer.summary()
  assert.equal(s.visitors.lan.visits, 2)
  assert.equal(s.visitors.lan.devices, 1)
})

test('lan / wall 分开统计', (t) => {
  const { set, foyer } = runtime(t, { seed: { visitors: { enabled: true } } })
  set(1)
  foyer.touch({ kind: 'lan', cookieValue: 'c'.repeat(32) })
  foyer.touch({ kind: 'wall', cookieValue: 'd'.repeat(32) })
  foyer.touch({ kind: 'wall', cookieValue: 'e'.repeat(32) })
  const s = foyer.summary()
  assert.deepEqual(s.visitors.lan, { devices: 1, visits: 1, lastAt: new Date(1).toISOString() })
  assert.equal(s.visitors.wall.devices, 2)
  assert.equal(s.visitors.wall.visits, 2)
})

test('visitors.enabled=false（默认）：不发 cookie、不写文件、摘要 visitors 为 null', (t) => {
  const { dir, foyer } = runtime(t, {})
  assert.deepEqual(foyer.touch({ kind: 'lan', cookieValue: '' }), {})
  assert.ok(!fs.existsSync(path.join(dir, 'foyer.json')))
  const s = foyer.summary()
  assert.equal(s.visitors, null)
  assert.equal(s.enabled, false)
})

test('设备上限淘汰 lastSeenAt 最旧的', (t) => {
  const { set, foyer } = runtime(t, { seed: { visitors: { enabled: true } }, maxDevices: 3, dedupMs: 60000 })
  const id = (i) => String(i).padStart(32, '0').slice(-32)
  for (let i = 1; i <= 4; i++) { set(i * 1000); foyer.touch({ kind: 'lan', cookieValue: id(i) }) }
  const vs = foyer.visitors()
  assert.equal(vs.length, 3)
  assert.deepEqual(vs.map((v) => Date.parse(v.lastSeenAt)).sort(), [2000, 3000, 4000]) // 第一个（1000）被淘汰
})

test('文件体积上限：超限拒绝写入，触发器保留在文件里，summary 提示 tooBig', (t) => {
  const { set, foyer, dir } = runtime(t, { seed: { visitors: { enabled: true } }, maxBytes: 400, maxDevices: 50, dedupMs: 1000 })
  set(1)
  let reached = false
  for (let i = 1; i <= 40 && !reached; i++) { set(i * 10000); foyer.touch({ kind: 'lan', cookieValue: String(i).padStart(32, '0').slice(-32) }); if (foyer.summary().tooBig) reached = true }
  assert.ok(reached)
  assert.ok(fs.statSync(path.join(dir, 'foyer.json')).size <= 400)
  const before = foyer.visitors().length
  set(999999)
  foyer.touch({ kind: 'lan', cookieValue: 'f'.repeat(32) }) // 被拒绝，不再增长
  assert.equal(foyer.visitors().length, before)
})

test('重启后状态保留：salt 与设备都留在文件里，口径连续', (t) => {
  const { dir, set, foyer } = runtime(t, { seed: { visitors: { enabled: true }, salt: 'ab12'.repeat(16) } })
  set(5)
  foyer.touch({ kind: 'lan', cookieValue: 'g'.repeat(32) })
  const id8 = foyer.visitors()[0].id8
  const restarted = createFoyer({ dir, now: () => 5 + 35 * 60000, redactText, scanMemoryText })
  assert.equal(restarted.visitors().length, 1)
  assert.equal(restarted.visitors()[0].id8, id8) // 同 salt 同 id → 同摘要
  restarted.touch({ kind: 'lan', cookieValue: 'g'.repeat(32) })
  assert.equal(restarted.summary().visitors.lan.visits, 2)
})

test('foyer.json 损坏：按全部关闭处理、不崩溃、不覆盖原文件，summary 提示 corrupt', (t) => {
  const { dir } = runtime(t, {})
  fs.writeFileSync(path.join(dir, 'foyer.json'), '{bad json')
  const f2 = createFoyer({ dir, redactText, scanMemoryText })
  const s = f2.summary()
  assert.equal(s.corrupt, true)
  assert.equal(s.enabled, false)
  assert.equal(s.visitors, null)
  assert.equal(s.announcement, null)
  assert.deepEqual(f2.touch({ kind: 'lan', cookieValue: 'a'.repeat(32) }), {})
  assert.equal(fs.readFileSync(path.join(dir, 'foyer.json'), 'utf8'), '{bad json')
})

// ── 公告 ──
test('公告长度 1–120 码点：0 拒、1 过、120 过、121 拒；换行/制表归一为空格、控制字符去掉、首尾空白去掉', (t) => {
  const { foyer } = runtime(t, { seed: { announcement: { enabled: true } } })
  assert.throws(() => foyer.announce('   '), /公告需 1/)
  assert.equal(foyer.announce('好').saved, true)
  assert.equal(foyer.announce('啊'.repeat(120)).saved, true)
  assert.throws(() => foyer.announce('啊'.repeat(121)), /公告需 1/)
  assert.equal(foyer.announce('  第一行\n第二行\t第三行\u0000尾部  ').current.text, '第一行 第二行 第三行尾部')
})

test('公告命中 scanMemoryText 拒绝（ghp_/令牌/IP/金额各 3 样例）；不误杀 CMP-285/localhost:3200/17:30/版本号；拒收文案不含原文', (t) => {
  const { foyer } = runtime(t, { seed: { announcement: { enabled: true } } })
  for (const text of ['CMP-285 今天上线', '服务器在 localhost:3200', '17:30 例会照常', '版本 1.27.2 已发布']) {
    assert.equal(foyer.announce(text).saved, true, text)
  }
  const bad = [
    'ghp_abcDEF123ghi', 'ghp_J1K2L3M4N5P6', 'ghp_x0y1z2w3v4u',
    'sk-AAA111BBB222', 'sk-ccc333DDD444', 'AKIAIOSFODNN7EXAMPLE',
    '地址 192.168.1.10', '服务器 10.0.0.7', '后端 172.16.5.9',
    '预算 $5000', 'USD 1,200 元', '费用 1000000 元',
  ]
  for (const text of bad) {
    assert.throws(() => foyer.announce(text), (e) => {
      assert.equal(e.status, 422)
      assert.ok(!String(e.message).includes(text), '拒收文案不得回显原文')
      return true
    })
  }
})

test('每个金边日最多保存 10 次，超了 429；第二天恢复', (t) => {
  const { set, foyer } = runtime(t, { seed: { announcement: { enabled: true } } })
  let base = Date.parse('2026-10-20T08:00:00+07:00')
  for (let i = 0; i < 10; i++) { set(base + i * 60000); foyer.announce(`公告 ${i}`) }
  assert.throws(() => foyer.announce('第 11 条'), (e) => e.status === 429)
  base = Date.parse('2026-10-21T08:00:00+07:00')
  set(base)
  assert.equal(foyer.announce('新的一天').saved, true)
  assert.equal(dayKey(base), '2026-10-21')
})

test('announce.history 最多保留 20 条', (t) => {
  const { set, foyer, dir } = runtime(t, { seed: { announcement: { enabled: true } }, maxHistory: 20, dailyLimit: 30 })
  const base = Date.parse('2026-10-20T08:00:00+07:00')
  for (let i = 0; i < 25; i++) { set(base + i * 60000); foyer.announce(`公告 ${i}`) }
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'foyer.json'), 'utf8'))
  assert.ok(raw.announce.history.length <= 20)
  assert.equal(foyer.summary().announcement.text, '公告 24')
})

test('foyer_announce_clear 清空当前公告、历史保留', (t) => {
  const { foyer, dir } = runtime(t, { seed: { announcement: { enabled: true } } })
  foyer.announce('第一条')
  foyer.announce('第二条')
  assert.equal(foyer.summary().announcement.text, '第二条')
  assert.deepEqual(foyer.clear(), { cleared: true })
  assert.equal(foyer.summary().announcement, null)
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'foyer.json'), 'utf8'))
  assert.equal(raw.announce.history.length, 1)
  assert.equal(raw.announce.history[0].text, '第一条')
})

test('announcement.enabled=false（默认）时公告 403', (t) => {
  const { foyer } = runtime(t, {})
  assert.throws(() => foyer.announce('你好'), (e) => e.status === 403)
})

test('展示用文本返回前走 redactText（金额 / 地址打码），公告只存纯文本', (t) => {
  const { foyer, logs } = runtime(t, { seed: { announcement: { enabled: true } }, scanMemoryText: () => [] }) // 绕过扫描以便确认脱敏环节
  const text = '请查看 10.252.1.7 的配置，预算 $9999'
  const got = foyer.announce(text)
  assert.ok(!got.current.text.includes('10.252.1.7'))
  assert.ok(!got.current.text.includes('$9999'))
  assert.ok(got.current.text.includes('〔地址〕') && got.current.text.includes('〔金额〕'))
  const s = foyer.summary()
  assert.equal(s.announcement.text, got.current.text)
  assert.ok(!JSON.stringify(s).includes(text)) // 原始文本不出现在任何接口输出
})

// ── 隐私自查（任务卡 §5）──
test('隐私自查：IP / UA / 原始 cookie / 访问码 / 令牌 / 完整摘要 / salt 不出现在接口与日志；文件也搜不到真实标识', (t) => {
  const SALT = 'ab12'.repeat(16)
  const cookie = '9'.repeat(32)
  const { dir, set, foyer, logs } = runtime(t, { seed: { visitors: { enabled: true }, salt: SALT } })
  set(1000)
  foyer.touch({ kind: 'lan', cookieValue: cookie }) // 合法沿用
  const issued = foyer.touch({ kind: 'lan', cookieValue: 'zz-not-hex!!' }) // 非法换发
  const newCookie = issued.setCookie.replace('office_visitor=', '').split(';')[0]
  const fileRaw = JSON.parse(fs.readFileSync(path.join(dir, 'foyer.json'), 'utf8'))
  const fileContent = JSON.stringify(fileRaw)
  const interfaceOut = [JSON.stringify(foyer.summary()), JSON.stringify(foyer.visitors()), logs.join('\n')].join('\n')
  const fullDigests = Object.keys(fileRaw.devices || {})
  assert.ok(fullDigests.length >= 2)
  // ① 真实标识（含 IP / UA / 访问码 / 令牌）连文件里都不该出现
  for (const bad of ['192.168.100.77', 'Mozilla/5.0 test-ua', cookie, newCookie, 'testcode7x', 'walltok-9']) {
    assert.ok(!fileContent.includes(bad) && !interfaceOut.includes(bad), '不应出现：' + bad)
  }
  // ② salt 与完整摘要按 §1 存在 foyer.json 里，但绝不出现在任何接口 / 日志
  assert.ok(fileContent.includes(SALT))
  assert.ok(!interfaceOut.includes(SALT))
  assert.ok(!interfaceOut.includes(fullDigests[0]))
  assert.ok(!interfaceOut.includes(fullDigests[1]))
  // ③ 逐设备明细只给 id8
  for (const v of foyer.visitors()) assert.equal(v.id8.length, 8)
})

// ── server 接线静态断言（仿 workload.test.mjs 末尾）──
test('server 接线：API_PATHS/路由顺序/act 分支/透传前缀//state foyer//foyer.json 不可被静态读取', (t) => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const s = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8')
  const api = s.match(/const API_PATHS = new Set\(\[([^\]]+)\]/)[1]
  assert.match(api, /'\/foyer'/)
  assert.match(api, /'\/foyer\/visitors'/)
  const gate = s.indexOf('if (wallScope &&')
  assert.ok(gate < s.indexOf("url.pathname === '/foyer'")) // 挂在访问控制之后
  assert.ok(s.indexOf("url.pathname === '/foyer'") < s.indexOf('if (!staticOk')) // 且在静态回退之前
  assert.ok(s.indexOf("url.pathname === '/foyer/visitors'") > gate)
  assert.ok(s.indexOf("url.pathname === '/foyer/visitors'") < s.indexOf('if (!staticOk'))
  const visRegion = s.slice(s.indexOf("url.pathname === '/foyer/visitors'"), s.indexOf("url.pathname === '/foyer/visitors'") + 300)
  assert.match(visRegion, /lanUser/) // 仅本机：局域网设备 403
  assert.match(visRegion, /json\(403/)
  assert.ok(s.includes("a.type === 'foyer_announce'")) // act() 两个新分支
  assert.ok(s.includes("a.type === 'foyer_announce_clear'"))
  assert.match(s, /body\.type\.startsWith\('foyer_'\)/) // 结果透传前缀
  assert.match(s, /import \{ createFoyer \} from '\.\/foyer\.mjs'/)
  assert.match(s, /st\.foyer = foyer\.summary\(\)/) // /state 带 foyer
  const touchAt = s.indexOf('foyer.touch({ kind')
  assert.ok(touchAt > gate) // 访客登记放在鉴权之后
  assert.ok(touchAt < s.indexOf('fs.readFile(file')) // 在静态读取之前
  const touchRegion = s.slice(touchAt - 400, Math.min(s.length, touchAt + 300)) // 覆盖上方的判定区与下方的注入区
  assert.match(touchRegion, /wallScope/) // 复用现有「谁算已鉴权」的判断变量（大屏令牌设备）
  assert.match(touchRegion, /lanAuthed\(req\)/) // 局域网设备：已过访问码
  const ext = s.match(/const STATIC_EXT = new Set\(\[([^\]]+)\]/)[1]
  assert.ok(!ext.includes("'.json'")) // foyer.json 不会被静态文件服务读到 → /foyer.json 404
})