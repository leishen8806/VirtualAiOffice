// 真实事件账本（「今日回放」的数据源）。
// 订阅 state() 里已经生成的真实 events（不重新解析活动流，不改 buildEvents），
// 按 id 去重，脱敏、截断后原子追加到 events/YYYY-MM-DD.jsonl（金边日期，一行为一个 JSON）。
// 原则：动画只来自真实事件；没有记录的时段就明说没有记录，不补演、不编造。
// 本模块自身出错只记日志，任何情况下不得影响 /state 的返回。
import fs from 'node:fs'
import path from 'node:path'
import { localParts, onDuty } from '../workhours/schedule.mjs'

const DAY = 86400000
const RETENTION_DAYS = 30 // 账本保留 30 天，启动时和每天一次清理超期文件
const MAX_PER_DAY = 5000 // 单日文件超过 5000 条当天停止追加，在 /state 提示
const TEXT_MAX = 120 // text 一律截断到 120 字（存进去的只有短句，不该出现长内容）
const CLEANUP_MS = 24 * 60 * 60 * 1000
const DAY_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/

export function localDayKey(ms, tz) {
  const p = localParts(new Date(ms), tz)
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}
function fmtLocal(at, tz) {
  const p = localParts(new Date(at), tz)
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
}

export function createEventsLedger({ redactText, dir, now = Date.now, tz = 'Asia/Phnom_Penh', names = () => ({}) }) {
  const ledgerDir = path.join(dir, 'events')
  // enabled:false（events-ledger.json）时不写；默认开启
  let enabled = true
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'events-ledger.json'), 'utf8'))
    enabled = !cfg || cfg.enabled !== false
  } catch {}
  const corrupt = { n: 0 } // 跳过的损坏行数（不崩溃）
  const first = { at: null, local: null } // 回放可用起点 = 账本第一条事件的时间
  const files = new Map() // dayKey -> { ids:Set, count, capped }
  const fileOf = (dayKey) => path.join(ledgerDir, dayKey + '.jsonl')

  function loadDay(dayKey) {
    let f = files.get(dayKey)
    if (f) return f
    f = { ids: new Set(), count: 0, capped: false }
    if (fs.existsSync(fileOf(dayKey))) {
      let text = ''
      try { text = fs.readFileSync(fileOf(dayKey), 'utf8') } catch (e) { console.log('[ledger] 读账本失败：' + String((e && e.message) || e)) }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let r = null
        try { r = JSON.parse(line) } catch {}
        if (!r || typeof r.id !== 'string' || !r.id) { corrupt.n++; continue } // 损坏行：跳过并计数
        if (!f.ids.has(r.id)) { f.ids.add(r.id); f.count++ }
      }
    }
    if (f.count >= MAX_PER_DAY) f.capped = true
    files.set(dayKey, f)
    if (files.size > 45) files.delete(files.keys().next().value) // 只缓存最近 45 天，避免无限增长
    return f
  }

  function ensureFirst() {
    if (first.at) return
    let list = []
    try { list = fs.readdirSync(ledgerDir).filter((n) => DAY_RE.test(n)).sort() } catch {}
    for (const name of list) {
      let text = ''
      try { text = fs.readFileSync(path.join(ledgerDir, name), 'utf8') } catch { continue }
      const line = text.split('\n').find((l) => l.trim())
      if (!line) continue
      let r = null
      try { r = JSON.parse(line) } catch {}
      if (r && typeof r.at === 'string' && r.at) { first.at = r.at; first.local = fmtLocal(r.at, tz); break }
    }
  }

  function normalize(e) {
    return {
      id: String(e.id),
      at: e.at || '',
      kind: String(e.kind || 'speak'),
      from: typeof e.from === 'string' ? e.from : null, // agent id 原样存，回放时再映射成名字
      to: typeof e.to === 'string' ? e.to : null,
      ref: typeof e.ref === 'string' ? e.ref : null,
      text: String(redactText(e.text ?? '')).slice(0, TEXT_MAX), // 存入前脱敏 + 截断
    }
  }

  function ingest(list) {
    if (!enabled) return { written: 0, skipped: Array.isArray(list) ? list.length : 0 }
    if (!Array.isArray(list) || list.length === 0) return { written: 0, skipped: 0 }
    const batches = new Map() // dayKey -> records[]
    let skipped = 0
    for (const e of list) {
      if (!e || typeof e.id !== 'string' || !e.id) { skipped++; continue }
      const ms = Date.parse(e.at || '')
      const dayKey = localDayKey(ms ? ms : now(), tz) // 按事件自身的金边时间分文件（跨日各归各位）
      const f = loadDay(dayKey)
      if (f.capped) { skipped++; continue } // 该日已超限，今天不再追加
      if (f.ids.has(e.id)) { skipped++; continue } // 按 id 去重
      if (!batches.has(dayKey)) batches.set(dayKey, [])
      batches.get(dayKey).push(normalize(e))
    }
    let written = 0
    let dropped = 0 // 写阶段因「已达单日上限」被放弃的条数（分组阶段 count 还未累计，需在写阶段补记）
    for (const [dayKey, recs] of batches) {
      const f = loadDay(dayKey)
      let lines = ''
      for (const r of recs) {
        if (f.capped || f.ids.has(r.id)) { dropped++; continue }
        lines += JSON.stringify(r) + '\n'
        f.ids.add(r.id); f.count++; written++
        if (f.count >= MAX_PER_DAY) f.capped = true
      }
      if (!lines) continue
      fs.mkdirSync(ledgerDir, { recursive: true })
      fs.appendFileSync(fileOf(dayKey), lines, 'utf8') // 单次追加整个批次，崩溃最多坏最后一行（读取时会跳过）
    }
    if (written) ensureFirst()
    return { written, skipped: skipped + dropped }
  }

  function readDay(date) {
    const raw = []
    if (fs.existsSync(fileOf(date))) {
      let text = ''
      try { text = fs.readFileSync(fileOf(date), 'utf8') } catch (e) { console.log('[ledger] 读账本失败：' + String((e && e.message) || e)) }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let r = null
        try { r = JSON.parse(line) } catch {}
        if (!r || typeof r.id !== 'string' || !r.id) { corrupt.n++; continue }
        raw.push(r)
      }
    }
    const map = (typeof names === 'function' ? names() : names) || {}
    return {
      date,
      firstAt: raw.length ? raw[0].at : null,
      raw,
      records: raw.map((r) => ({
        id: r.id, at: r.at, kind: r.kind,
        from: { id: r.from, name: (r.from && map[r.from]) || r.from || '' },
        to: r.to ? { id: r.to, name: map[r.to] || r.to } : null,
        ref: r.ref, text: r.text,
      })),
    }
  }

  function view() {
    const todayKey = localDayKey(now(), tz)
    const f = loadDay(todayKey)
    ensureFirst()
    return { enabled, date: todayKey, count: f.count, capped: f.capped, since: first.local, firstAt: first.at, corrupt: corrupt.n }
  }

  function cleanup() {
    let removed = 0
    let list = []
    try { list = fs.readdirSync(ledgerDir) } catch { return removed }
    const cutoff = localDayKey(now() - RETENTION_DAYS * DAY, tz)
    for (const name of list) {
      const m = name.match(DAY_RE)
      if (!m) continue
      if (m[1] < cutoff) {
        try { fs.unlinkSync(path.join(ledgerDir, name)); removed++ } catch (e) { console.log('[ledger] 删除过期账本失败：' + String((e && e.message) || e)) }
        if (first.at && m[1] <= localDayKey(Date.parse(first.at) || now(), tz)) { first.at = null; first.local = null }
        files.delete(m[1])
      }
    }
    return removed
  }

  cleanup() // 启动时清理一次
  const timer = setInterval(cleanup, CLEANUP_MS) // 之后每天一次
  if (timer && timer.unref) timer.unref()
  return { ingest, view, readDay, cleanup, get ledgerDir() { return ledgerDir } }
}

// ── 纯函数（供 server.mjs 的 /replay 与测试使用）──

// 校验「YYYY-MM-DD」，缺省为今天（金边）；格式非法或不是真实日期（如 2026-02-31）返回 null
export function parseReplayDate(raw, tz = 'Asia/Phnom_Penh') {
  const cand = raw == null || raw === '' ? localDayKey(Date.now(), tz) : String(raw)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cand)) return null
  const d = new Date(cand + 'T00:00:00+07:00') // 金边固定 +07，避免本地时差错位
  if (Number.isNaN(d.getTime())) return null
  const p = localParts(d, tz)
  if (cand !== `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`) return null
  return cand
}

export function dutyConfig(worldView) {
  const d = (worldView && worldView.duty) || null
  if (!d) return null
  return { timezone: (worldView && worldView.tz) || 'Asia/Phnom_Penh', days: d.days, start: d.start, end: d.end }
}

export function isOnDuty(duty, ms) {
  if (!duty) return false
  return onDuty(
    {
      timezone: duty.timezone || 'Asia/Phnom_Penh',
      days: Array.isArray(duty.days) && duty.days.length ? duty.days : [1, 2, 3, 4, 5],
      start: duty.start || '09:00',
      end: duty.end || '18:00',
    },
    new Date(ms),
  )
}

// 空档：相邻事件间隔 > 30 分钟且处于上班时段的空档才标出（只标出，不补）
export function computeGaps(records, duty, gapMin = 30) {
  const out = []
  if (!records || records.length < 2) return out
  for (let i = 1; i < records.length; i++) {
    const a = records[i - 1], b = records[i]
    const t0 = Date.parse(a.at), t1 = Date.parse(b.at)
    if (!t0 || !t1 || t1 - t0 <= gapMin * 60000) continue
    if (!isOnDuty(duty, (t0 + t1) / 2)) continue // 空隙中点处于上班时段才标
    out.push({ from: a.at, to: b.at, minutes: Math.round((t1 - t0) / 60000) })
  }
  return out
}

export const KIND_KEYS = ['dispatch', 'report', 'celebrate', 'speak', 'submit_to_board', 'board_decision']
export function countKinds(records) {
  const counts = { dispatch: 0, report: 0, celebrate: 0, speak: 0, submit_to_board: 0, board_decision: 0 }
  for (const r of records || []) if (counts[r.kind] !== undefined) counts[r.kind]++
  return counts
}