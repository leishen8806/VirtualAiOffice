const FIELDS = [
  ['项目', 'text'], ['目标', 'text'], ['允许修改', 'list'], ['禁止', 'list'],
  ['依赖', 'list'], ['输入版本', 'text'], ['验收标准', 'bullets'], ['工具权限', 'list'],
  ['预算上限', 'text'], ['交付物', 'list'], ['审核责任人', 'text'], ['风险等级', 'text'],
]

function clean(value, max = 200) {
  return String(value ?? '').replace(/【任务契约】/g, '任务契约').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function list(value) {
  return String(value ?? '').split(/[,，、]\s*/).map((item) => clean(item)).filter(Boolean).slice(0, 20)
}

export function formatContract(input = {}) {
  const values = Object.fromEntries(FIELDS.map(([key]) => [key, input[key]]))
  const meaningful = FIELDS.slice(1).some(([key, type]) => type === 'bullets'
    ? String(values[key] ?? '').split(/\r?\n/).some((item) => clean(item))
    : type === 'list'
      ? list(values[key]).length > 0
      : clean(values[key]))
  if (!meaningful) return ''
  const bullets = String(values['验收标准'] ?? '').split(/\r?\n/).map((item) => clean(item)).filter(Boolean)
  const line = (key, type) => `${key}: ${type === 'list' ? list(values[key]).join(', ') : clean(values[key])}`
  return [
    '【任务契约】',
    line('项目', 'text') || '项目: Virtual AI Office',
    line('目标', 'text') || '目标: ',
    line('允许修改', 'list'),
    line('禁止', 'list'),
    line('依赖', 'list'),
    line('输入版本', 'text'),
    '验收标准:',
    ...(bullets.length ? bullets.map((item) => `- ${item}`) : ['- ']),
    line('工具权限', 'list'),
    line('预算上限', 'text'),
    line('交付物', 'list'),
    line('审核责任人', 'text'),
    line('风险等级', 'text'),
  ].join('\n')
}

export function hasContractValues(input = {}) {
  return Boolean(formatContract(input))
}
