const RULE_MESSAGES = Object.freeze({
  1: '布置超出房间边界',
  2: '物品与已有物品重叠',
  3: '物品实例无效或重复使用',
  4: '墙面物品必须贴墙',
  5: '物品会挡住入口',
  6: '布置会堵死通道',
  7: '布置数量超过上限',
})

export function statusState(status, context = 'request') {
  if (status === 200) return { kind: 'ok', retryable: false, message: '' }
  if (status === 403) return { kind: 'offline', retryable: false, message: context === 'session' ? '仅本机可保存' : '仅本机可保存' }
  if (status === 404) return { kind: 'offline', retryable: false, message: '个人空间保存未开启（本机管理员可在服务端开启）' }
  if (status === 409) return { kind: 'conflict', retryable: false, message: '个人空间版本冲突' }
  if (status === 413) return { kind: 'error', retryable: true, message: '布置内容太大，请减少物品后重试' }
  if (status === 415) return { kind: 'error', retryable: true, message: '保存格式不受支持，请重试' }
  if (status === 422) return { kind: 'invalid', retryable: false, message: '当前布置不合法，请根据提示调整' }
  if (status === 429) return { kind: 'error', retryable: true, message: '保存请求过于频繁，请稍后重试' }
  if (status >= 500) return { kind: 'error', retryable: true, message: '个人空间服务暂不可用，请重试' }
  return { kind: 'error', retryable: true, message: '个人空间请求失败，请重试' }
}

export function networkState() {
  return { kind: 'error', retryable: true, message: '无法连接个人空间服务，当前保留页面内布置' }
}

export function conflictStrategy(choice) {
  if (choice === 'server') return { action: 'use-server', retry: false }
  if (choice === 'overwrite') return { action: 'overwrite', retry: true }
  return { action: 'keep-local', retry: false }
}

export function ruleMessage(rule) {
  return RULE_MESSAGES[Number(rule)] || '当前布置不合法，请调整后重试'
}

export function violationMessages(violations) {
  return (Array.isArray(violations) ? violations : []).map((item) => ruleMessage(item?.rule))
}

export { RULE_MESSAGES }
