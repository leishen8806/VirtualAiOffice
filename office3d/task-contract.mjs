import { MONEY_RE } from './standup.mjs'

export const CONTRACT_FIELDS = Object.freeze([
  { key: '项目', required: true, type: 'text', description: '所属项目或产品名称' },
  { key: '目标', required: true, type: 'text', description: '可观察的任务目标' },
  { key: '允许修改', required: true, type: 'list', description: '允许触碰的文件或目录' },
  { key: '禁止', required: true, type: 'list', description: '明确禁止的文件、接口或行为' },
  { key: '依赖', required: false, type: 'list', description: '依赖的任务编号' },
  { key: '输入版本', required: false, type: 'text', description: '输入对象版本或哈希' },
  { key: '验收标准', required: true, type: 'bullets', description: '可执行、可判断的验收条件' },
  { key: '工具权限', required: false, type: 'list', description: '允许使用的工具边界' },
  { key: '预算上限', required: true, type: 'text', description: '次数、分钟或 token 上限' },
  { key: '交付物', required: true, type: 'list', description: '应交付的文件或证据' },
  { key: '审核责任人', required: true, type: 'text', description: '独立审核者' },
  { key: '风险等级', required: true, type: 'text', description: '低、中、高或资金' },
])

export const REQUIRED_FIELDS = Object.freeze(CONTRACT_FIELDS.filter((field) => field.required).map((field) => field.key))
export const OPTIONAL_FIELDS = Object.freeze(CONTRACT_FIELDS.filter((field) => !field.required).map((field) => field.key))
export const EMPTY_ACCEPTANCE_WORDS = Object.freeze(['完成', '无', '通过', '好的', 'ok', 'okay', 'done', 'n/a', '不适用'])
export const CHECKABLE_HINTS = Object.freeze(['显示', '返回', '通过', '拒绝', '生成', '保存', '小于', '大于', '等于', '不超过', '≥', '≤', '无报错', '测试全过'])
export const PROTECTED_PATHS = Object.freeze(['server.mjs', 'lan.json', 'wall.json', 'telegram', '*.dpapi', 'config.json'])
export const RISK_LEVELS = Object.freeze(['低', '中', '高', '资金'])

const FIELD_MAP = new Map(CONTRACT_FIELDS.map((field) => [field.key, field]))
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const LIST_SPLIT_RE = /[,，、]\s*/
const PLACEHOLDER_RE = /^(?:<[^>]{1,80}>|\[[^\]]{1,80}\]|待填写|待补充|占位|todo|tbd|placeholder)$/i
const NUMBER_RE = /\d+(?:\.\d+)?/
const DEPENDENCY_RE = /^[A-Z]{2,5}-\d{1,6}$/

function cleanText(value, max = 200) {
  return String(value ?? '').replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanList(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(LIST_SPLIT_RE)
  return [...new Set(values.map((entry) => cleanText(entry)).filter(Boolean))].slice(0, 20)
}

function isMeaningful(value) {
  const text = cleanText(value)
  return Boolean(text) && !PLACEHOLDER_RE.test(text)
}

function fieldScore(field, value) {
  if (field.type === 'list' || field.type === 'bullets') return Array.isArray(value) && value.some(isMeaningful)
  return isMeaningful(value)
}

function blockBounds(description) {
  const text = String(description ?? '').replace(CONTROL_RE, ' ')
  const starts = []
  let cursor = 0
  while (true) {
    const index = text.indexOf('【任务契约】', cursor)
    if (index < 0) break
    starts.push(index)
    cursor = index + '【任务契约】'.length
  }
  const start = starts[0]
  if (start === undefined) return null
  const rest = text.slice(start + '【任务契约】'.length)
  const next = rest.search(/\n\s*\n\s*【/)
  const end = next < 0 ? text.length : start + '【任务契约】'.length + next
  return { start, end, block: text.slice(start, end), multiple: starts.length > 1 }
}

function parseLine(line) {
  const match = line.match(/^\s*([^:：]+?)\s*[:：]\s*(.*)$/)
  return match ? { key: cleanText(match[1], 40), value: match[2] } : null
}

function blankContract() {
  return Object.fromEntries(CONTRACT_FIELDS.map((field) => [field.key, field.type === 'text' ? '' : []]))
}

export function contractTemplate({ project = 'Virtual AI Office' } = {}) {
  return [
    '【任务契约】',
    `项目: ${cleanText(project) || 'Virtual AI Office'}`,
    '目标: <填写可观察目标>',
    '允许修改: <填写允许修改的文件>',
    '禁止: <填写禁止的文件或行为>',
    '依赖: <无或任务编号>',
    '输入版本: <填写对象版本>',
    '验收标准:',
    '- <填写可检查的验收条件>',
    '工具权限: <填写工具边界>',
    '预算上限: <填写次数 / 分钟 / token 上限>',
    '交付物: <填写文件或证据>',
    '审核责任人: <填写独立审核者>',
    '风险等级: <低 / 中 / 高 / 资金>',
  ].join('\n')
}

export function parseContract(description) {
  const bounds = blockBounds(description)
  if (!bounds) return { found: false, contract: null, errors: [] }
  const contract = blankContract()
  const errors = []
  if (bounds.multiple) errors.push({ field: '契约区块', code: 'multiple_contracts', message: '描述中只能有一个任务契约区块' })
  const lines = bounds.block.split(/\r?\n/).slice(1)
  let current = null
  for (const line of lines) {
    if (!line.trim()) continue
    if (/^\s*-\s+/.test(line) && current === '验收标准') {
      contract[current].push(cleanText(line.replace(/^\s*-\s+/, '')))
      continue
    }
    const parsed = parseLine(line)
    if (!parsed) continue
    const field = FIELD_MAP.get(parsed.key)
    if (!field) continue
    current = field.key
    if (field.type === 'bullets' || field.type === 'list') {
      contract[field.key] = cleanList(parsed.value)
    } else {
      contract[field.key] = cleanText(parsed.value)
    }
  }
  Object.defineProperty(contract, '_sourceText', {
    value: cleanText(description, 2000),
    enumerable: false,
  })
  Object.defineProperty(contract, '_parseErrors', {
    value: errors,
    enumerable: false,
  })
  if (!contract['验收标准'].length && lines.some((line) => /^\s*-\s+/.test(line))) {
    errors.push({ field: '验收标准', code: 'orphan_bullet', message: '验收标准项目未归属到字段' })
  }
  return { found: true, contract, errors }
}

function hasWildcard(value) {
  const text = String(value ?? '').trim()
  return text === '*' || text === '**' || text === '.' || text === '/' ||
    /^[A-Za-z]:\\?$/.test(text) || /^(?:[A-Za-z]:[\\/])$/.test(text)
}

function protectedPath(value) {
  const text = String(value ?? '').replace(/\\/g, '/').toLowerCase()
  return PROTECTED_PATHS.some((item) => {
    if (item === '*.dpapi') return /\.dpapi(?:$|\/)/i.test(text)
    if (item === 'telegram') return /(^|\/)telegram[^/]*(?:$|\/)/i.test(text)
    return text === item || text.endsWith(`/${item}`) || text.includes(`/${item}/`)
  })
}

function budgetHasNumber(value) {
  return NUMBER_RE.test(String(value ?? '')) &&
    /(次|回|分钟|分|小时|hour|minute|token|tokens|次运行|运行)/i.test(String(value ?? ''))
}

function acceptanceLengthOk(value) {
  const compact = cleanText(value, 200).replace(/\s/g, '')
  const cjk = (compact.match(/[\u3400-\u9fff]/g) || []).length
  const latin = (compact.match(/[A-Za-z]/g) || []).length
  return cjk > 0 ? cjk >= 6 : latin >= 12
}

function acceptanceUsable(values) {
  return Array.isArray(values) && values.some((value) => {
    const text = cleanText(value)
    return isMeaningful(text) &&
      acceptanceLengthOk(text) &&
      CHECKABLE_HINTS.some((hint) => text.toLowerCase().includes(hint.toLowerCase())) &&
      !EMPTY_ACCEPTANCE_WORDS.includes(text.toLowerCase())
  })
}

function usableAcceptanceCount(values) {
  return (Array.isArray(values) ? values : []).filter((value) => {
    const text = cleanText(value)
    return isMeaningful(text) && !EMPTY_ACCEPTANCE_WORDS.includes(text.toLowerCase())
  }).length
}

function error(field, code, message) {
  return { field, code, message }
}

export function validateContract(contract = {}, ctx = {}) {
  const errors = []
  const warnings = []
  if (Array.isArray(contract?._parseErrors)) errors.push(...contract._parseErrors)
  const completeness = {}
  const value = (key) => contract?.[key]
  for (const field of CONTRACT_FIELDS) {
    const valid = fieldScore(field, value(field.key))
    completeness[field.key] = valid
    if (field.required && !valid) errors.push(error(field.key, 'required', `${field.key} 缺失或仍为占位内容`))
  }
  const allowed = Array.isArray(value('允许修改')) ? value('允许修改') : cleanList(value('允许修改'))
  if (allowed.length === 0 || allowed.some(hasWildcard)) errors.push(error('允许修改', 'broad_scope', '允许修改不得为空或使用全盘通配'))
  if (allowed.some(protectedPath) && value('风险等级') !== '高') {
    errors.push(error('允许修改', 'protected_path', '允许修改包含受保护路径，风险等级必须为高'))
  }
  const acceptance = Array.isArray(value('验收标准')) ? value('验收标准') : cleanList(value('验收标准'))
  if (!acceptanceUsable(acceptance)) errors.push(error('验收标准', 'not_checkable', '至少需要一条可检查的验收标准'))
  if (!budgetHasNumber(value('预算上限'))) errors.push(error('预算上限', 'no_budget', '预算上限必须包含次数、时间或 token 数值'))
  if (value('风险等级') && !RISK_LEVELS.includes(value('风险等级'))) errors.push(error('风险等级', 'invalid_risk', '风险等级必须为低、中、高或资金'))
  const dependencies = Array.isArray(value('依赖')) ? value('依赖') : cleanList(value('依赖'))
  const dependencyNone = new Set(['无', '没有', 'none', '-'])
  const dependencySentinels = dependencies.filter((item) => dependencyNone.has(String(item).toLowerCase()))
  const dependencyIds = dependencies.filter((item) => !dependencyNone.has(String(item).toLowerCase()))
  if (dependencySentinels.length && dependencyIds.length) errors.push(error('依赖', 'invalid_dependency', '“无”类哨兵不能与任务编号混用'))
  if (!dependencySentinels.length && dependencyIds.some((item) => !DEPENDENCY_RE.test(item))) errors.push(error('依赖', 'invalid_dependency', '依赖必须匹配任务编号格式'))
  const moneyText = [value('项目'), value('目标'), value('交付物'), value('允许修改')]
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .filter(Boolean)
    .join('\n')
  if (MONEY_RE.test(moneyText) && value('风险等级') !== '资金') errors.push(error('风险等级', 'money_mismatch', '资金类关键词命中时风险等级必须为资金'))
  if (ctx.assignee && cleanText(ctx.assignee) === cleanText(value('审核责任人'))) {
    errors.push(error('审核责任人', 'self_review', '执行者不能审核自己的交付'))
  }
  if (value('输入版本') && !isMeaningful(value('输入版本'))) warnings.push('输入版本仍是占位内容')
  const requiredValid = REQUIRED_FIELDS.filter((key) => fieldScore(FIELD_MAP.get(key), value(key))).length
  const optionalValid = OPTIONAL_FIELDS.filter((key) => fieldScore(FIELD_MAP.get(key), value(key))).length
  const completenessValue = Math.round((requiredValid / REQUIRED_FIELDS.length) * 80 + (optionalValid / OPTIONAL_FIELDS.length) * 20)
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    completeness: Math.max(0, Math.min(100, completenessValue)),
  }
}

export function isLowRiskBatchEligible(contract = {}) {
  const reasons = []
  const allowed = Array.isArray(contract['允许修改']) ? contract['允许修改'] : cleanList(contract['允许修改'])
  const acceptance = Array.isArray(contract['验收标准']) ? contract['验收标准'] : cleanList(contract['验收标准'])
  if (contract['风险等级'] !== '低') reasons.push('风险等级不是低')
  if (!allowed.length || allowed.some(hasWildcard)) reasons.push('允许修改为空或含通配')
  if (allowed.some(protectedPath)) reasons.push('允许修改含受保护路径')
  if (!budgetHasNumber(contract['预算上限'])) reasons.push('预算上限无法解析')
  if (usableAcceptanceCount(acceptance) < 2) reasons.push('验收标准少于两条可检查项目')
  const moneyText = [contract['项目'], contract['目标'], contract['交付物'], contract['允许修改']]
    .flatMap((item) => Array.isArray(item) ? item : [item])
    .filter(Boolean)
    .join('\n')
  if (MONEY_RE.test(moneyText)) reasons.push('命中资金类关键词')
  if (!cleanList(contract['禁止']).length) reasons.push('禁止为空')
  return { eligible: reasons.length === 0, reasons }
}

function completed(status) {
  return ['done', 'completed', 'closed'].includes(String(status || '').toLowerCase())
}

function cancelled(status) {
  return ['cancelled', 'canceled', 'void'].includes(String(status || '').toLowerCase())
}

export function parentCanComplete({ parent = {}, children = [], integrationEvidence = null } = {}) {
  const missing = []
  if (!Array.isArray(children) || children.length === 0) missing.push('没有子任务')
  const cancelledChildren = (Array.isArray(children) ? children : []).filter((child) => cancelled(child?.status))
  if (cancelledChildren.length) missing.push('存在已取消子任务，取消不计入完成')
  const incomplete = (Array.isArray(children) ? children : []).filter((child) => !completed(child?.status) && !cancelled(child?.status))
  if (incomplete.length) missing.push(`仍有 ${incomplete.length} 个子任务未完成`)
  const evidenceOk = Boolean(integrationEvidence && integrationEvidence.ok === true && cleanText(integrationEvidence.ref))
  if (!evidenceOk) missing.push('缺少父任务整体集成验证证据')
  return { ok: missing.length === 0, missing, parentId: parent?.id || null }
}

export function summarizeContract(contract = {}) {
  const project = cleanText(contract['项目'], 24) || '未命名项目'
  const risk = cleanText(contract['风险等级'], 8) || '未定级'
  const allowed = cleanList(contract['允许修改']).slice(0, 2).join('、') || '未指定范围'
  const acceptance = Array.isArray(contract['验收标准']) ? contract['验收标准'].filter(acceptanceUsable).length : 0
  return cleanText(`${project}｜风险:${risk}｜范围:${allowed}｜验收:${acceptance}项`, 80)
}
