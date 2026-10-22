import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  CONTRACT_FIELDS,
  CHECKABLE_HINTS,
  EMPTY_ACCEPTANCE_WORDS,
  PROTECTED_PATHS,
  contractTemplate,
  parseContract,
  validateContract,
  isLowRiskBatchEligible,
  parentCanComplete,
  summarizeContract,
} from '../task-contract.mjs'

const validText = `【任务契约】
项目: Virtual AI Office
目标: 为前厅公告面板补充加载与错误状态
允许修改: office3d/foyer-panels.js, office3d/tests/foyer-panels.test.mjs
禁止: 不改接口、不改权限、不改 server.mjs
依赖: CMP-301, CMP-305
输入版本: sha256:foyer-panels.js=abc123
验收标准:
- 加载失败时显示固定中文提示
- 新增测试覆盖三种状态
工具权限: 读写工作区文件, 运行测试
预算上限: 运行 ≤ 5 次 / 耗时 ≤ 90 分钟
交付物: 变更说明, 测试输出
审核责任人: Reviewer1
风险等级: 低`

function parsed(text = validText) {
  const result = parseContract(text)
  assert.equal(result.found, true)
  return result.contract
}

test('template round trip and all twelve fields are declared', () => {
  assert.equal(CONTRACT_FIELDS.length, 12)
  assert.equal(new Set(CONTRACT_FIELDS.map((field) => field.key)).size, 12)
  const template = contractTemplate({ project: 'Virtual AI Office' })
  const contract = parsed(template.replace('<填写可观察目标>', '交付一个可检查的面板状态').replace('<填写允许修改的文件>', 'office3d/panel.js').replace('<填写禁止的文件或行为>', '不改 server.mjs').replace('<无或任务编号>', 'CMP-1').replace('<填写对象版本>', 'sha256:x=abc').replace('<填写可检查的验收条件>', '显示固定提示').replace('<填写工具边界>', '读写文件,运行测试').replace('<填写次数 / 分钟 / token 上限>', '运行 ≤ 5 次').replace('<填写文件或证据>', '报告,测试输出').replace('<填写独立审核者>', 'Reviewer1').replace('<低 / 中 / 高 / 资金>', '低'))
  assert.equal(validateContract(contract).ok, true)
  assert.equal(validateContract(contract).completeness, 100)
})

test('parser handles half/full colons, disorder, middle blocks, and first of multiple', () => {
  const text = `前置说明\n【任务契约】\n风险等级：中\n目标：目标文本\n允许修改：a.js、b.js\n项目：项目\n禁止：不改接口\n验收标准:\n- 可观察结果\n预算上限：≤ 20000 token\n交付物：报告\n审核责任人：Reviewer\n\n【其他】\n【任务契约】\n项目：第二个`
  const result = parseContract(text)
  assert.equal(result.contract['项目'], '项目')
  assert.deepEqual(result.contract['允许修改'], ['a.js', 'b.js'])
  assert.equal(result.contract['风险等级'], '中')
  assert.ok(result.errors.some((item) => item.code === 'multiple_contracts'))
  assert.equal(validateContract(result.contract).ok, false)
})

test('missing block and missing required fields are safe', () => {
  assert.deepEqual(parseContract('普通描述'), { found: false, contract: null, errors: [] })
  const contract = parsed('【任务契约】\n项目: x')
  const result = validateContract(contract)
  for (const key of ['目标', '允许修改', '禁止', '验收标准', '预算上限', '交付物', '审核责任人', '风险等级']) {
    assert.ok(result.errors.some((item) => item.field === key))
  }
})

test('scope, protected paths, acceptance and budget rules are deterministic', () => {
  const broad = parsed(validText.replace('office3d/foyer-panels.js, office3d/tests/foyer-panels.test.mjs', '*'))
  assert.ok(validateContract(broad).errors.some((item) => item.code === 'broad_scope'))
  const protectedContract = parsed(validText.replace('office3d/foyer-panels.js, office3d/tests/foyer-panels.test.mjs', 'server.mjs'))
  assert.ok(validateContract(protectedContract).errors.some((item) => item.code === 'protected_path'))
  const high = parsed(validText.replace('风险等级: 低', '风险等级: 高'))
  assert.ok(!validateContract(high).errors.some((item) => item.code === 'protected_path'))
  const emptyAcceptance = parsed(validText.replace('- 加载失败时显示固定中文提示\n- 新增测试覆盖三种状态', '- 完成'))
  assert.ok(validateContract(emptyAcceptance).errors.some((item) => item.code === 'not_checkable'))
  const noBudget = parsed(validText.replace('运行 ≤ 5 次 / 耗时 ≤ 90 分钟', '看情况'))
  assert.ok(validateContract(noBudget).errors.some((item) => item.code === 'no_budget'))
  assert.deepEqual(PROTECTED_PATHS, ['server.mjs', 'lan.json', 'wall.json', 'telegram', '*.dpapi', 'config.json'])
  assert.ok(EMPTY_ACCEPTANCE_WORDS.includes('完成'))
})

test('money, dependencies, risk and self-review rules', () => {
  const securityOnly = parsed(validText.replace('禁止: 不改接口、不改权限、不改 server.mjs', '禁止: 读取密钥 / 不得提现'))
  assert.equal(validateContract(securityOnly).ok, true)
  const money = parsed(validText.replace('目标: 为前厅公告面板补充加载与错误状态', '目标: 完成资金账务迁移').replace('风险等级: 低', '风险等级: 高'))
  assert.ok(validateContract(money).errors.some((item) => item.code === 'money_mismatch'))
  const moneyOk = parsed(validText.replace('目标: 为前厅公告面板补充加载与错误状态', '目标: 完成资金账务迁移').replace('风险等级: 低', '风险等级: 资金'))
  assert.ok(!validateContract(moneyOk).errors.some((item) => item.code === 'money_mismatch'))
  const deps = parsed(validText.replace('CMP-301, CMP-305', 'bad, CMP-301'))
  assert.ok(validateContract(deps).errors.some((item) => item.code === 'invalid_dependency'))
  assert.equal(validateContract(parsed(validText.replace('CMP-301, CMP-305', '无'))).ok, true)
  assert.ok(validateContract(parsed(validText.replace('CMP-301, CMP-305', '无, CMP-301'))).errors.some((item) => item.code === 'invalid_dependency'))
  assert.ok(validateContract(parsed(), { assignee: 'Reviewer1' }).errors.some((item) => item.code === 'self_review'))
})

test('money fields are limited and acceptance requires length plus observable hint', () => {
  const target = parsed(validText.replace('目标: 为前厅公告面板补充加载与错误状态', '目标: 修改提现逻辑'))
  assert.ok(validateContract(target).errors.some((item) => item.code === 'money_mismatch'))
  const deliverable = parsed(validText.replace('交付物: 变更说明, 测试输出', '交付物: 迁移脚本'))
  assert.ok(validateContract(deliverable).errors.some((item) => item.code === 'money_mismatch'))
  const short = parsed(validText.replace('- 加载失败时显示固定中文提示\n- 新增测试覆盖三种状态', '- 好'))
  assert.ok(validateContract(short).errors.some((item) => item.code === 'not_checkable'))
  const good = parsed(validText.replace('- 加载失败时显示固定中文提示\n- 新增测试覆盖三种状态', '- 页面显示等待时长且测试通过'))
  assert.equal(validateContract(good).ok, true)
  assert.ok(CHECKABLE_HINTS.includes('显示'))
})

test('completeness penalizes placeholders and missing optional fields', () => {
  const contract = parsed(validText
    .replace('项目: Virtual AI Office', '项目: <填写项目>')
    .replace('目标: 为前厅公告面板补充加载与错误状态', '目标: <填写可观察目标>')
    .replace('office3d/foyer-panels.js, office3d/tests/foyer-panels.test.mjs', '<填写允许修改的文件>')
    .replace('不改接口、不改权限、不改 server.mjs', '<填写禁止的文件或行为>')
    .replace('工具权限: 读写工作区文件, 运行测试', '工具权限: <填写工具边界>')
    .replace('依赖: CMP-301, CMP-305', '依赖: <无或任务编号>')
    .replace('sha256:foyer-panels.js=abc123', '<填写对象版本>'))
  const result = validateContract(contract)
  assert.ok(result.completeness < 50)
  assert.equal(result.ok, false)
})

test('low-risk batch eligibility accepts one bounded contract and explains six failures', () => {
  const contract = parsed()
  assert.deepEqual(isLowRiskBatchEligible(contract), { eligible: true, reasons: [] })
  const failures = [
    ['风险等级: 低', '风险等级: 中'],
    ['office3d/foyer-panels.js, office3d/tests/foyer-panels.test.mjs', '*'],
    ['运行 ≤ 5 次 / 耗时 ≤ 90 分钟', '看情况'],
    ['- 加载失败时显示固定中文提示\n- 新增测试覆盖三种状态', '- 完成'],
    ['目标: 为前厅公告面板补充加载与错误状态', '目标: 资金账务迁移'],
    ['禁止: 不改接口、不改权限、不改 server.mjs', '禁止: '],
  ]
  for (const [from, to] of failures) {
    const result = isLowRiskBatchEligible(parsed(validText.replace(from, to)))
    assert.equal(result.eligible, false)
    assert.ok(result.reasons.length > 0)
  }
})

test('parent completion requires all children and integration evidence', () => {
  const children = [{ id: 'a', status: 'done' }, { id: 'b', status: 'completed' }]
  assert.equal(parentCanComplete({ parent: { id: 'p' }, children }).ok, false)
  assert.equal(parentCanComplete({ parent: { id: 'p' }, children, integrationEvidence: { ok: true, ref: 'test-output' } }).ok, true)
  const cancelled = parentCanComplete({ children: [...children, { id: 'c', status: 'cancelled' }], integrationEvidence: { ok: true, ref: 'x' } })
  assert.ok(cancelled.missing.some((item) => item.includes('取消')))
  assert.ok(parentCanComplete({ children: [], integrationEvidence: { ok: true, ref: 'x' } }).missing.includes('没有子任务'))
})

test('parser bounds hostile input and remains deterministic', () => {
  const huge = `【任务契约】\n项目: \u0000${'x'.repeat(10000)}\n允许修改: ${Array.from({ length: 1000 }, (_, i) => `f${i}.js`).join(',')}\n验收标准:\n- 通过\n预算上限: 5 次\n禁止: 不改\n交付物: 报告\n审核责任人: R\n风险等级: 低`
  const first = parseContract(huge)
  const second = parseContract(huge)
  assert.deepEqual(first, second)
  assert.ok(first.contract['项目'].length <= 200)
  assert.ok(first.contract['允许修改'].length <= 20)
  assert.doesNotThrow(() => parseContract('<div>【任务契约】</div>'))
})

test('summarizeContract is bounded and does not include contract body', () => {
  const summary = summarizeContract(parsed())
  assert.ok(summary.length <= 80)
  assert.doesNotMatch(summary, /前厅公告面板/)
})

test('static safety contract', () => {
  const source = fs.readFileSync(new URL('../task-contract.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:fetch|Date\.now|Math\.random|innerHTML|eval|child_process)\b/)
  assert.doesNotMatch(source, /from ['"]\.\/(?:[^'"]*(?:server|acceptance|governance|tenancy))\.mjs['"]/)
})
