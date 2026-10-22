// S1-2：前厅的两项新数据——匿名访客登记 + 董事会手写公告（服务端，默认关闭）。
// 访客：只计「已通过鉴权」且非本机的页面首次加载（GET / 的 index.html、GET /wall），发一个随机访客 cookie；
//   服务端只存 HMAC-SHA256(salt, id) 的摘要，不存 IP / UA / 访问码 / 令牌；同一设备 30 分钟内去抖。
// 公告：董事会本机手写，≤120 码点，存前过 scanMemoryText（密钥 / 服务器地址 / 账务数据）命中即拒
//   （只回类别、不回显原文、也不写入文件和历史），展示前走 redactText；每个金边日最多 10 次；历史最多留 20 条。
// 原子写入（.tmp 改名）；损坏 / 文件超 512KB 视为关闭并在 /state 提示，不崩溃；foyer.json 不在静态白名单里。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const COOKIE_MAX_AGE = 31536000
export const COOKIE_RE = /^[0-9a-f]{32}$/i // 合法访客 cookie：正好 32 位十六进制
export const ANNOUNCE_MIN = 1
export const ANNOUNCE_MAX = 120
// 金边日（Asia/Phnom_Penh）：公告每日上限与「今天」同口径。只用 Intl，不引其它模块（任务卡只允许 import memory/wall 的函数）。
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayKey = (ms) => DAY_FMT.format(new Date(ms))
// 摘要 = HMAC-SHA256(salt, 随机 id) 的十六进制：同 salt 同 id 恒等，salt 不同则不同
export const digestOf = (salt, id) => crypto.createHmac('sha256', String(salt || '')).update(String(id || '')).digest('hex')
// C0/C1 控制字符：换行、制表归一为空格，其余控制字符直接去掉（公告不含换行，前端按纯文本渲染）
const CTL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
export function normalizeAnnounce(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\n\t]/g, ' ')
    .replace(CTL, '')
    .trim()
}

export function createFoyer(opts = {}) {
  const dir = opts.dir
  const now = typeof opts.now === 'function' ? opts.now : Date.now
  const redact = typeof opts.redactText === 'function' ? opts.redactText : (x) => String(x ?? '')
  const scan = typeof opts.scanMemoryText === 'function' ? opts.scanMemoryText : () => []
  const log = typeof opts.log === 'function' ? opts.log : console.log
  const maxDevices = Number(opts.maxDevices) || 2000
  const maxHistory = Number(opts.maxHistory) || 20
  const maxBytes = Number(opts.maxBytes) || 512 * 1024
  const dedupMs = Number(opts.dedupMs) || 30 * 60000
  const dailyLimit = Number(opts.dailyLimit) || 10
  const file = path.join(dir, 'foyer.json')
  // 默认全部关闭；salt 首次写入时才生成；daily 是内部的「今天已存几条」计数，不出现在接口
  const empty = () => ({ visitors: { enabled: false }, announcement: { enabled: false }, salt: '', devices: {}, announce: { current: null, history: [], daily: null } })
  let cfg = empty()
  let corrupt = false
  let tooBig = false
  const load = () => {
    if (!fs.existsSync(file)) return
    try {
      if (fs.statSync(file).size > maxBytes) tooBig = true // 文件本身已超限：提示，不再写入（防被刷爆）
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!raw || typeof raw !== 'object') throw new Error('不是对象')
      cfg = {
        visitors: { enabled: !!(raw.visitors && raw.visitors.enabled === true) },
        announcement: { enabled: !!(raw.announcement && raw.announcement.enabled === true) },
        salt: typeof raw.salt === 'string' ? raw.salt : '',
        devices: raw.devices && typeof raw.devices === 'object' && !Array.isArray(raw.devices) ? raw.devices : {},
        announce: {
          current: raw.announce && raw.announce.current && typeof raw.announce.current.text === 'string'
            ? { text: String(raw.announce.current.text).slice(0, 400), at: String(raw.announce.current.at || '') }
            : null,
          history: Array.isArray(raw.announce && raw.announce.history) ? raw.announce.history.slice(-maxHistory) : [],
          daily: raw.announce && raw.announce.daily ? { day: String(raw.announce.daily.day || ''), count: Number(raw.announce.daily.count) || 0 } : null,
        },
      }
    } catch (e) {
      corrupt = true // 损坏：视为全部关闭、不覆盖原文件，留给董事会排查
      cfg = empty()
      log(`[foyer] 配置文件损坏，按全部关闭处理：${e.message}`)
    }
  }
  load()
  const clone = () => ({
    visitors: { enabled: cfg.visitors.enabled },
    announcement: { enabled: cfg.announcement.enabled },
    salt: cfg.salt || '',
    devices: { ...cfg.devices },
    announce: { ...cfg.announce, current: cfg.announce.current ? { ...cfg.announce.current } : null, history: [...(cfg.announce.history || [])], daily: cfg.announce.daily ? { ...cfg.announce.daily } : null },
  })
  // 原子写入 + 体积上限：串好新内容再落盘，超 512KB 拒绝写入；成功才提交到内存（失败时内存与文件保持一致）
  const commit = (next) => {
    const json = JSON.stringify(next, null, 2)
    if (Buffer.byteLength(json, 'utf8') > maxBytes) { tooBig = true; return false }
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, json)
    fs.renameSync(tmp, file)
    cfg = next
    tooBig = false
    return true
  }
  const agg = (kind) => {
    const list = Object.values(cfg.devices).filter((d) => d.kind === kind)
    if (!list.length) return { devices: 0, visits: 0, lastAt: null }
    return { devices: list.length, visits: list.reduce((s, d) => s + (d.visits || 0), 0), lastAt: list.map((d) => d.lastSeenAt).sort().at(-1) || null }
  }
  const status = (code, message) => { const e = new Error(message); e.status = code; return e }
  return {
    // 页面首次加载时由 server 调用（只挂在 index.html / wall.html 的已鉴权响应上）：kind 只能是 'lan' / 'wall'。
    // 关闭或损坏时不发 cookie、不写文件；返回 { setCookie } 表示需要让浏览器存下这个访客 id。
    touch({ kind, cookieValue }) {
      if (!cfg.visitors.enabled || corrupt) return {}
      const k = kind === 'wall' ? 'wall' : 'lan'
      const old = typeof cookieValue === 'string' ? cookieValue : ''
      const valid = COOKIE_RE.test(old)
      const id = valid ? old : crypto.randomBytes(16).toString('hex')
      const next = clone()
      if (!next.salt) next.salt = crypto.randomBytes(32).toString('hex') // 首次写入时才生成盐
      const hash = digestOf(next.salt, id)
      const t = now()
      const at = new Date(t).toISOString()
      const rec = next.devices[hash]
      if (rec) {
        if (t - Date.parse(rec.lastSeenAt || 0) >= dedupMs) rec.visits = (rec.visits || 0) + 1 // 30 分钟内重复加载只算一次
        rec.lastSeenAt = at // lastSeenAt 每次更新
      } else {
        next.devices[hash] = { kind: k, firstSeenAt: at, lastSeenAt: at, visits: 1 }
      }
      const keys = Object.keys(next.devices)
      if (keys.length > maxDevices) { // 满了淘汰 lastSeenAt 最旧的
        const drop = keys.slice().sort((a, b) => Date.parse(next.devices[a].lastSeenAt || 0) - Date.parse(next.devices[b].lastSeenAt || 0))[0]
        delete next.devices[drop]
      }
      if (!commit(next)) { log('[foyer] 数据文件超过上限，本次访客暂不登记'); return {} }
      return valid ? {} : { setCookie: `office_visitor=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}` }
    },
    // act() 的 foyer_announce：局域网只读设备的 403 由 server 现有 /act 令牌机制挡掉；这里只管校验 + 落盘
    announce(raw) {
      if (!cfg.announcement.enabled || corrupt) throw status(403, '公告功能未开启')
      const text = normalizeAnnounce(raw)
      const length = [...text].length // Unicode 码点，不是字节
      if (length < ANNOUNCE_MIN || length > ANNOUNCE_MAX) throw status(400, '公告需 1–120 个字符')
      const hits = scan(text)
      if (hits && hits.length) {
        const cats = [...new Set(hits.map((h) => h.category))]
        log(`[foyer] 公告被拦截（${cats.join('、')}）`) // 日志也只带类别
        throw status(422, `公告包含敏感内容（${cats.join('、')}）`) // 只给类别，不回显原文
      }
      const next = clone()
      const today = dayKey(now())
      let daily = next.announce.daily
      if (!daily || daily.day !== today) daily = next.announce.daily = { day: today, count: 0 } // 新的一天重新计数
      if (daily.count >= dailyLimit) throw status(429, '今天最多保存 10 条公告')
      const at = new Date(now()).toISOString()
      if (next.announce.current) { next.announce.history.push(next.announce.current); next.announce.history = next.announce.history.slice(-maxHistory) }
      next.announce.current = { text, at }
      daily.count++
      if (!commit(next)) throw status(507, '前厅数据文件过大，暂时无法保存公告')
      log(`[foyer] 公告已保存（今日第 ${daily.count} 条）`)
      return { saved: true, current: { text: redact(text), at } } // 返回前脱敏
    },
    // act() 的 foyer_announce_clear：清空当前公告（历史保留）。同样只从运行服务的那台电脑操作（server 的 /act 门禁）
    clear() {
      if (corrupt) throw status(500, '前厅数据文件损坏，无法清理')
      const next = clone()
      next.announce.current = null
      if (!commit(next)) throw status(507, '前厅数据文件过大，暂时无法清理')
      return { cleared: true }
    },
    // /state 与 /foyer 共用：不含摘要哈希、不含逐设备信息、不含 IP / UA；损坏 / 超限给提示
    summary() {
      const s = { enabled: Boolean(cfg.visitors.enabled || cfg.announcement.enabled), corrupt, tooBig }
      if (cfg.visitors.enabled) s.visitors = { lan: agg('lan'), wall: agg('wall') }
      else s.visitors = null
      s.announcement = cfg.announce.current ? { text: redact(cfg.announce.current.text), at: cfg.announce.current.at } : null
      return s
    },
    // GET /foyer/visitors（仅本机）：逐设备明细，只给摘要前 8 位，不给完整摘要
    visitors() {
      if (corrupt) return []
      return Object.entries(cfg.devices)
        .map(([hash, d]) => ({ kind: d.kind, id8: hash.slice(0, 8), firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt, visits: d.visits }))
        .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
    },
  }
}