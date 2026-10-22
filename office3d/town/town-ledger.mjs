// 小镇生活家 · 追加式账本（哈希链 + 借贷平衡，防篡改；与「矿洞探险」的娱乐外快无关，无共识、无难度）
// 账本目录由调用方传入；本模块不读写 town/ 之外的任何文件；只追加、不自动修复。
// 行结构：{ seq, at, month, agent, kind, amountCents, reason, basis, from, to, prev, hash }
//   amountCents：一律为正数（金额大小），方向由 from → to 决定；旧式接口允许带符号，内部规范化为正。
//   from：'mint'（发行）| 'treasury' | 'wallet:<岗位名>'；to：'treasury' | 'wallet:<岗位名>' | 'public'。
//   public 只进不出；任何转移借贷平衡；守恒不变量：Σwallet + treasury = 累计 mint − 累计 public。
import { createHash } from 'node:crypto'
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

// 稳定字段序列化顺序（prev/hash 除外），保证任何时刻 hash 可复算
function serializeClean(line) {
  const { prev, hash, ...rest } = line
  const o = {
    seq: rest.seq,
    at: rest.at,
    month: rest.month,
    agent: rest.agent,
    kind: rest.kind,
    amountCents: rest.amountCents,
    reason: rest.reason,
    basis: rest.basis,
  }
  if (rest.from !== undefined) o.from = rest.from
  if (rest.to !== undefined) o.to = rest.to
  return JSON.stringify(o)
}

const hashOf = (prevHash, clean) => sha256Hex(prevHash + serializeClean({ ...clean, prev: undefined, hash: undefined }))

// 行里旧式字段（无 from/to 的 payslip/spend）规范化为账户方向
// - payslip 旧式：全走 treasury → wallet:agent
// - spend 旧式：wallet:agent → treasury（amountCents 为负表示支出）
function normalize(entry) {
  const e = { ...entry }
  const amount = Math.abs(Number(e.amountCents) || 0)
  e.amountCents = amount
  if (e.from === undefined && e.to === undefined) {
    if (e.kind === 'payslip') {
      e.from = 'treasury'
      e.to = `wallet:${e.agent}`
    } else if (e.kind === 'spend') {
      e.from = `wallet:${e.agent}`
      e.to = 'treasury'
    } else if (Number(entry.amountCents) < 0) {
      e.from = `wallet:${e.agent}`
      e.to = 'treasury'
    } else {
      e.from = 'mint'
      e.to = Number(entry.amountCents) >= 0 ? 'treasury' : `wallet:${e.agent}`
    }
  }
  if (e.at === undefined) e.at = new Date().toISOString()
  return e
}

// 幂等键：同一笔（月 × 人 × 类型 × 事由）只允许记账一次
const idemKey = (e) => `${e.month}|${e.agent}|${e.kind}|${e.reason}`

// 逐行解析 + 复算账户（mint 只增不算账户扣减；public 只进不出）
function scan(lines) {
  const accounts = {} // 'treasury' | 'wallet:xx' | 'public'（public 只记录入）
  const add = (name, delta) => {
    accounts[name] = (accounts[name] || 0) + delta
  }
  let minted = 0
  let publicSpend = 0
  for (const l of lines) {
    if (l.from === 'mint') minted += l.amountCents
    if (l.to === 'public') publicSpend += l.amountCents
    if (l.from && l.from !== 'mint') add(l.from, -l.amountCents)
    if (l.to) add(l.to, l.amountCents)
  }
  return { accounts, minted, publicSpend }
}

// 一致性：校验每笔转移不使账户为负，且守恒不变量成立
function inconsistency(lines) {
  const outOfPublic = lines.find((l) => l.from === 'public')
  if (outOfPublic) return '公共项目只进不出（禁止从 treasury→public 之外转出）'
  const { accounts, minted, publicSpend } = scan(lines)
  for (const [name, bal] of Object.entries(accounts)) {
    if (name !== 'public' && bal < 0) return `账户 ${name} 余额为负（${bal}）`
  }
  const walletSum = Object.entries(accounts)
    .filter(([name]) => name.startsWith('wallet:'))
    .reduce((s, [, v]) => s + v, 0)
  const treasury = accounts.treasury || 0
  const conserved = walletSum + treasury === minted - publicSpend
  if (!conserved) return `守恒不成立：Σwallet+treasury=${walletSum + treasury} ≠ minted−public=${minted - publicSpend}`
  return null
}

export function createLedger({ dir }) {
  if (!dir) throw new Error('createLedger 需要 dir')
  const file = join(dir, 'ledger.jsonl')
  mkdirSync(dir, { recursive: true })
  const keyByIdem = new Map()

  function reload() {
    const rows = []
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8')
      const parts = text.split(/\r?\n/)
      for (const part of parts) {
        if (!part.trim()) continue
        try {
          rows.push(JSON.parse(part))
        } catch {
          // 损坏行不静默丢弃：保留哨兵行，verify() 才能定位（否则会悄悄截断历史）
          rows.push({ __corrupt: true, raw: part })
        }
      }
    }
    return rows
  }

  // 全量与文件一致地重读，用于追加前的余额校验与幂等判断
  function fresh() {
    const rows = reload()
    return rows
  }

  const ledger = {
    dir,
    file,

    // 追加一笔：要么成功落盘，要么抛错（不改任何既有行）
    append(entry) {
      const rows = fresh()
      const e = normalize(entry)
      const key = idemKey(e)
      const dup = rows.some((r) => idemKey(r) === key)
      if (dup) {
        return { status: 'skipped', duplicate: true, seq: null }
      }
      // 校验：这笔账若使任何账户为负则拒绝（公共账户只进不出在此即不会触发）
      const seq = rows.length + 1
      const prev = rows.length > 0 ? rows[rows.length - 1].hash : ''
      const clean = { seq, at: e.at, month: e.month, agent: e.agent, kind: e.kind, amountCents: e.amountCents, reason: e.reason, basis: e.basis }
      if (e.from !== undefined) clean.from = e.from
      if (e.to !== undefined) clean.to = e.to
      const hash = hashOf(prev, clean)
      const row = { ...clean, prev, hash }
      const bad = inconsistency([...rows, row])
      if (bad) throw new Error(`拒绝记账：${bad}`)
      appendFileSync(file, JSON.stringify(row) + '\n', 'utf8')
      keyByIdem.set(key, seq)
      return { status: 'appended', duplicate: false, seq }
    },

    // 全量核对：哈希链 + seq 连续 + 账户非负 + 守恒
    verify() {
      const rows = fresh()
      const lines = []
      let firstBadLine = null
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        lines.push(r)
        if (r.__corrupt) {
          firstBadLine = firstBadLine ?? i + 1
          continue
        }
        if (r.seq !== i + 1) {
          firstBadLine = firstBadLine ?? i + 1
          continue
        }
        const prev = i === 0 ? '' : rows[i - 1].hash
        if (r.prev !== prev || r.hash !== hashOf(prev, r)) {
          firstBadLine = firstBadLine ?? i + 1
        }
      }
      const bad = inconsistency(rows)
      if (firstBadLine === null && bad) {
        // 找出第一处造成不一致的行
        for (let i = 0; i < rows.length; i++) {
          if (inconsistency(rows.slice(0, i + 1))) {
            firstBadLine = i + 1
            break
          }
        }
      }
      return { ok: firstBadLine === null && !bad, lines, firstBadLine }
    },

    // 指定人余额（分）：收入加、支出减；账本损坏时抛错，不静默继续
    balance(agent) {
      const rows = fresh()
      const v = ledger.verify()
      if (!v.ok) throw new Error(`账本已损坏（首处坏行 ${v.firstBadLine}），拒绝计算余额`)
      let bal = 0
      for (const r of rows) {
        if (r.from === `wallet:${agent}`) bal -= r.amountCents
        if (r.to === `wallet:${agent}`) bal += r.amountCents
      }
      return bal
    },

    // 金库余额（分）
    treasuryBalance() {
      const rows = fresh()
      const v = ledger.verify()
      if (!v.ok) throw new Error(`账本已损坏（首处坏行 ${v.firstBadLine}），拒绝计算余额`)
      return rows.reduce((s, r) => (r.to === 'treasury' ? s + r.amountCents : r.from === 'treasury' ? s - r.amountCents : s), 0)
    },

    // 公共项目累计（分）：只进不出
    publicBalance() {
      const rows = fresh()
      const v = ledger.verify()
      if (!v.ok) throw new Error(`账本已损坏（首处坏行 ${v.firstBadLine}），拒绝计算余额`)
      return rows.reduce((s, r) => (r.to === 'public' ? s + r.amountCents : s), 0)
    },

    lines() {
      return fresh()
    },

    // 本批次幂等结算：同月同人已有 payslip 行则整批跳过
    settleMonth({ payslips, month }) {
      const rows = fresh()
      const existing = new Set(rows.filter((r) => r.kind && r.kind.startsWith('payslip')).map((r) => `${r.month}|${r.agent}`))
      let appended = 0
      let skipped = 0
      for (const ps of payslips) {
        const k = `${month}|${ps.agent}`
        if (existing.has(k)) {
          skipped++
          continue
        }
        const total = ps.totalCents
        const treasuryNow = ledger.treasuryBalance()
        const byTreasury = Math.min(treasuryNow, total)
        const byMint = total - byTreasury
        const basis = {
          tier: ps.tier,
          totalCents: total,
          byTreasury,
          byMint,
          coefficient: ps.coefficient,
          lines: (ps.lines || []).map((l) => ({ key: l.key, label: l.label, amountCents: l.amountCents, basis: l.basis })),
        }
        ledger.append({
          at: new Date().toISOString(),
          month,
          agent: ps.agent,
          kind: 'payslip',
          amountCents: total,
          reason: '工资条',
          basis,
          from: 'treasury',
          to: `wallet:${ps.agent}`,
        })
        appended++
        existing.add(k)
      }
      return { appended, skipped }
    },
  }
  return ledger
}

// 独立导出函数形式：settleMonth({ ledger, payslips, month })
export function settleMonth({ ledger, payslips, month }) {
  return ledger.settleMonth({ payslips, month })
}