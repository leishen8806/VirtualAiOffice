// T20 小镇账本测试：哈希链篡改定位、幂等、余额非负、原子追加、借贷平衡/守恒、守恒破坏定位、
// 旧式 payslip 兼容、settleMonth 整批幂等、public 只进不出拒绝、损坏行哨兵定位。
// 运行：node --test tests/town-ledger.test.mjs
// 账本目录一律用操作系统临时目录（mkdtemp），测试结束清理；不读写 town/ 之外的项目文件。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createLedger, settleMonth } from '../town/town-ledger.mjs'

// 每个测试独立的临时目录（账本目录由调用方传入，测试用临时目录）
function tmpLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'town-ledger-'))
  const ledger = createLedger({ dir })
  return { dir, ledger }
}

const mint = (amountCents, over = {}) => ({ month: '2026-11', agent: 'mint', kind: 'mint', amountCents, reason: '开办拨入', ...over })
const payslip = (agent, totalCents, over = {}) => ({ month: '2026-11', agent, kind: 'payslip', amountCents: totalCents, reason: '工资条', ...over })

test('哈希链：追加行 prev 链与 hash 一致，verify 判定完好', () => {
  const { dir, ledger } = tmpLedger()
  const a = ledger.append(mint(1450500))
  assert.equal(a.status, 'appended')
  assert.equal(a.seq, 1)
  const b = ledger.append(payslip('Frontend1', 36800))
  assert.equal(b.seq, 2)
  const v = ledger.verify()
  assert.equal(v.ok, true)
  assert.equal(v.lines.length, 2)
  assert.equal(v.lines[1].prev, v.lines[0].hash)
  assert.equal(v.lines[1].seq, 2)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('哈希链篡改：改任意一行金额 → 该行起 verify 失败并定位到改的那行', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  ledger.append(payslip('Frontend1', 36800))
  ledger.append(payslip('Backend1', 36800))
  // 篡改第 2 行（seq=2）的 amountCents 后写回文件
  const file = path.join(dir, 'ledger.jsonl')
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
  rows[1].amountCents = 99999
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  const v = ledger.verify()
  assert.equal(v.ok, false)
  assert.equal(v.firstBadLine, 2) // 首处坏行就是被改的第 2 行
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('幂等：同 month|agent|kind|reason 重复追加 → skipped，不重复记录', () => {
  const { dir, ledger } = tmpLedger()
  assert.equal(ledger.append(mint(1450500)).status, 'appended')
  assert.equal(ledger.append(payslip('Frontend1', 36800)).status, 'appended')
  const dup = ledger.append(payslip('Frontend1', 36800))
  assert.equal(dup.status, 'skipped')
  assert.equal(dup.duplicate, true)
  assert.equal(ledger.verify().lines.length, 2)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('余额非负与负账户拒绝：金库没钱时给 wallet 发工资 → 拒绝并抛出；原子性（已落盘行不受影响）', () => {
  const { dir, ledger } = tmpLedger()
  // 没有先 mint：直接 payslip（treasury → wallet）会令金库为负
  assert.throws(() => ledger.append(payslip('Frontend1', 36800)), /余额为负/)
  assert.equal(ledger.verify().ok, true, '被拒绝行未落盘，账本仍完好')
  assert.equal(ledger.verify().lines.length, 0, '没有任何行被污染')
  // 先 mint 再发：正常
  ledger.append(mint(1450500))
  ledger.append(payslip('Frontend1', 36800))
  assert.equal(ledger.balance('Frontend1'), 36800)
  assert.equal(ledger.treasuryBalance(), 1450500 - 36800)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('守恒：mint 与消费一进一出账本平衡（Σwallet+treasury = minted−public）', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  ledger.append(payslip('Frontend1', 36800))
  ledger.append(payslip('Backend1', 46800))
  // 个人消费回流金库
  ledger.append({ month: '2026-11', agent: 'Frontend1', kind: 'spend', amountCents: 5000, reason: '消费' })
  assert.equal(ledger.verify().ok, true)
  const ws = ledger.balance('Frontend1') + ledger.balance('Backend1')
  assert.equal(ws + ledger.treasuryBalance(), 1450500, '守恒：钱包合计 + 金库 = mint 总额')
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('守恒破坏定位：篡改行让资金凭空消失（hash 链重算完好）→ verify 在守恒检查处拦截', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  ledger.append(payslip('Frontend1', 36800))
  const file = path.join(dir, 'ledger.jsonl')
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
  // 篡改第 2 行：from=treasury 但 to 缺失（钱消失），并重算哈希保持链完整，
  // 这样 verify 必须靠【守恒检查】而不是【哈希核对】把它拦下来。
  // （合法方向的转移在扫描时天然守恒，只有 from 有货、to 缺失这种结构才会破坏守恒。）
  rows[1] = { ...rows[1], from: 'treasury', to: undefined, hash: '', prev: '' }
  delete rows[1].to
  rows[1].prev = rows[0].hash
  // 用与模块一致的字段序列化方式重算哈希（from 保留、to 缺失），链是好的
  const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex')
  const clean = (row) => {
    const { prev, hash, ...rest } = row
    const o = {
      seq: rest.seq, at: rest.at, month: rest.month, agent: rest.agent, kind: rest.kind,
      amountCents: rest.amountCents, reason: rest.reason, basis: rest.basis,
    }
    if (rest.from !== undefined) o.from = rest.from
    if (rest.to !== undefined) o.to = rest.to
    return JSON.stringify(o)
  }
  rows[1].hash = sha(rows[1].prev + clean(rows[1]))
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  const v = ledger.verify()
  assert.equal(v.ok, false, '守恒被破坏必须被发现')
  assert.equal(v.firstBadLine, 2)
  // 破坏守恒的行拒绝出余额
  assert.throws(() => ledger.balance('Frontend1'), /已损坏/)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('public 只进不出：任何 from=public 的转出被显式拒绝', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  assert.throws(
    () => ledger.append({ month: '2026-11', agent: 'public', kind: 'spend', amountCents: 100, reason: '错误转出', from: 'public', to: 'treasury' }),
    /公共项目只进不出/
  )
  // 金库 → public 是允许方向（溢出转公共项目）
  assert.equal(ledger.append({ month: '2026-11', agent: 'public', kind: 'overflow', amountCents: 300, reason: '金库溢出', from: 'treasury', to: 'public' }).status, 'appended')
  assert.equal(ledger.publicBalance(), 300)
  assert.equal(ledger.verify().ok, true)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('损坏行哨兵：非 JSON 行保留为 {__corrupt}，verify 定位且 balance 拒绝计算', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  fs.appendFileSync(path.join(dir, 'ledger.jsonl'), 'this is not json\n', 'utf8')
  const v = ledger.verify()
  assert.equal(v.ok, false)
  assert.equal(v.firstBadLine, 2)
  assert.equal(v.lines[1].__corrupt, true)
  assert.equal(v.lines[1].raw, 'this is not json')
  assert.throws(() => ledger.balance('Frontend1'), /已损坏/)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('旧式接口兼容：无 from/to 的 payslip/spend 自动规范化方向', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  ledger.append({ month: '2026-11', agent: 'Frontend1', kind: 'payslip', amountCents: 36800, reason: '工资条' })
  const spend = ledger.append({ month: '2026-11', agent: 'Frontend1', kind: 'spend', amountCents: -5000, reason: '消费' })
  assert.equal(spend.status, 'appended')
  assert.equal(ledger.balance('Frontend1'), 31800)
  assert.equal(ledger.treasuryBalance(), 1450500 - 36800 + 5000)
  assert.equal(ledger.verify().ok, true)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('settleMonth：整批幂等（同月同人已有工资条则跳过），返回 appended/skipped 计数', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(2000000))
  const payslips = [
    { agent: 'Frontend1', tier: 'T1', totalCents: 36800, coefficient: { value: 1, reason: 'formula' }, lines: [] },
    { agent: 'Backend1', tier: 'T1', totalCents: 36800, coefficient: { value: 1, reason: 'formula' }, lines: [] },
    { agent: 'Reviewer1', tier: 'GA', totalCents: 90700, coefficient: { value: 1, reason: 'gatekeeper' }, lines: [] },
  ]
  const r1 = settleMonth({ ledger, payslips, month: '2026-11' })
  assert.equal(r1.appended, 3)
  assert.equal(r1.skipped, 0)
  // 再次结算同一批：整批跳过
  const r2 = settleMonth({ ledger, payslips, month: '2026-11' })
  assert.equal(r2.appended, 0)
  assert.equal(r2.skipped, 3)
  assert.equal(ledger.balance('Frontend1'), 36800)
  assert.equal(ledger.balance('Reviewer1'), 90700)
  assert.equal(ledger.verify().ok, true)
  // 另一个月份正常追加（同人不同月不冲突）
  const r3 = settleMonth({ ledger, payslips, month: '2026-12' })
  assert.equal(r3.appended, 3)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

test('原子追加：中途失败不影响已落盘行，verify 仍通过', () => {
  const { dir, ledger } = tmpLedger()
  ledger.append(mint(1450500))
  ledger.append(payslip('Frontend1', 36800))
  // 构造一笔会导致金库透支的行（treasury 只剩 1450500−36800，发 2000000 必负）
  assert.throws(() => ledger.append(payslip('Backend1', 2000000)), /余额为负/)
  const v = ledger.verify()
  assert.equal(v.ok, true)
  assert.equal(v.lines.length, 2)
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})