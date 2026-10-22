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

export function createHomePersistence({ fetchImpl = globalThis.fetch, onConflict } = {}) {
  let token = ''
  let ownerId = ''
  let revision = 0

  const headers = (extra = {}) => ({
    Accept: 'application/json',
    ...(token ? { 'X-Home-Token': token } : {}),
    ...extra,
  })
  const readJson = async (response) => {
    try { return await response.json() } catch { return {} }
  }
  const request = async (path, init = {}) => {
    try {
      const response = await fetchImpl(path, { ...init, headers: headers(init.headers) })
      return { response, body: await readJson(response) }
    } catch {
      return { response: null, body: null }
    }
  }
  const connect = async () => {
    const session = await request('/town/home/session')
    if (!session.response) return { ...networkState(), mode: 'offline', offline: true }
    const sessionState = statusState(session.response.status, 'session')
    if (sessionState.kind !== 'ok') return { ...sessionState, mode: 'offline', offline: true }
    token = typeof session.body?.token === 'string' ? session.body.token : ''
    ownerId = typeof session.body?.ownerId === 'string' ? session.body.ownerId : ''
    const loaded = await request('/town/home/layout')
    if (!loaded.response) return { ...networkState(), mode: 'offline', offline: true }
    const loadedState = statusState(loaded.response.status, 'layout')
    if (loadedState.kind !== 'ok') return { ...loadedState, mode: 'offline', offline: true }
    revision = Number(loaded.body?.layout?.revision || 0)
    return {
      kind: 'online',
      mode: 'online',
      ownerId,
      revision,
      layout: loaded.body?.layout || null,
      inventory: Array.isArray(loaded.body?.inventory) ? loaded.body.inventory : [],
      status: loaded.body?.status || 'ok',
      message: loaded.body?.status === 'corrupt' ? '上次的布置文件损坏，已用默认布置（原文件已保留副本）' : '',
    }
  }
  const post = async (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const save = async (layout) => {
    if (!token) return { ...statusState(404, 'save'), ok: false, offline: true }
    const local = { placements: layout?.placements || [], expectedRevision: revision }
    const result = await post('/town/home/save', local)
    if (!result.response) return { ...networkState(), offline: true }
    const state = statusState(result.response.status, 'save')
    if (state.kind === 'ok') {
      revision = Number(result.body?.layout?.revision ?? revision)
      return { ...state, ok: true, layout: result.body?.layout || { ...layout, revision } }
    }
    if (state.kind === 'conflict') {
      const choice = await onConflict?.(result.body?.layout || null)
      const strategy = conflictStrategy(choice)
      if (strategy.action === 'use-server') {
        if (!result.body?.layout) return { ...state, ok: false }
        revision = Number(result.body?.layout?.revision ?? revision)
        return { kind: 'ok', ok: true, saved: false, layout: result.body.layout, message: '已改用服务器版本（你的修改未保存）' }
      }
      if (strategy.retry) {
        revision = Number(result.body?.layout?.revision ?? revision)
        const retry = await post('/town/home/save', { ...local, expectedRevision: revision })
        if (!retry.response) return networkState()
        const retryState = statusState(retry.response.status, 'save')
        if (retryState.kind === 'ok') {
          revision = Number(retry.body?.layout?.revision ?? revision)
          return { ...retryState, ok: true, saved: true, layout: retry.body?.layout || { ...layout, revision }, message: '已覆盖服务器版本并保存' }
        }
        return { ...retryState, ok: false, message: retryState.message }
      }
    }
    if (state.kind === 'offline') return { ...state, ok: false, offline: true }
    if (state.kind === 'invalid') return { ...state, ok: false, message: violationMessages(result.body?.violations).join('；') || state.message }
    return { ...state, ok: false }
  }
  const reset = async () => {
    if (!token) return { ...statusState(404, 'reset'), ok: false, offline: true }
    const result = await post('/town/home/reset', { expectedRevision: revision })
    if (!result.response) return { ...networkState(), offline: true }
    const state = statusState(result.response.status, 'reset')
    if (state.kind === 'ok') {
      revision = Number(result.body?.layout?.revision ?? revision)
      return { ...state, ok: true, layout: result.body?.layout || null }
    }
    if (state.kind === 'offline') return { ...state, ok: false, offline: true }
    return { ...state, ok: false }
  }
  return Object.freeze({ connect, save, reset, getRevision: () => revision })
}
