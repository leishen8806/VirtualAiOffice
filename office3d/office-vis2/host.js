import { buildOfficeIsland } from '../office-island.js'

export function officeSampleRequested(search = '') {
  const values = new URLSearchParams(search).getAll('officeSample')
  return values.length === 1 && values[0] === '1'
}

// 异步完成前保留旧画面/碰撞；ALIGN 样板成功后只登记实际家具三角面。
export function buildOfficeSampleHost(context) {
  const precise = context.layout.variant === 'align' && officeSampleRequested(context.search) && context.collision
  const legacyBodies = new Map(), registered = new Set()
  const collision = precise ? { ...context.collision,
    add(mesh, kind) { legacyBodies.set(mesh, kind); registered.add(mesh); return context.collision.add(mesh, kind) },
    remove(mesh) { registered.delete(mesh); return context.collision.remove?.(mesh) },
  } : context.collision
  const legacy = buildOfficeIsland({ ...context, collision })
  if (!officeSampleRequested(context.search) || context.layout.version !== 3) return legacy
  context.root.userData.dynamic = true // 允许回退的旧网格不能被宿主跨模块合批移走。
  let controller, destroyed = false, epoch = 0, status = 'closed'
  const restore = () => { for (const [mesh, kind] of legacyBodies) if (!registered.has(mesh)) { context.collision.add(mesh, kind); registered.add(mesh) } }
  const setConfig = async config => {
    if (destroyed) return false
    const version = ++epoch
    legacy.root.visible = true
    controller?.dispose(); controller = null; status = 'closed'; restore()
    if (destroyed || config?.enabled !== true || Array.isArray(config)) return false
    status = 'loading'
    try {
      const { createOfficeVis2Controller } = await import('./sample.js')
      if (destroyed || version !== epoch) return false
      const ground = context.get?.('shell3')?.ground
      const floorY = ground ? new context.THREE.Box3().setFromObject(ground).max.y + .012 : .012
      const next = createOfficeVis2Controller({ ...context, collision: precise ? context.collision : undefined, includeEnclosure: false, floorY })
      controller = next
      const opened = await next.setConfig(config)
      if (destroyed || version !== epoch) { next.dispose(); return false }
      if (opened && precise) { for (const mesh of registered) context.collision.remove?.(mesh); registered.clear() }
      legacy.root.visible = !opened; status = opened ? 'open' : 'fallback'
      return opened
    } catch { if (!destroyed && version === epoch) { controller?.dispose(); controller = null; status = 'fallback' } return false }
  }
  return {
    ...legacy,
    ready: setConfig({ enabled: true }),
    setConfig,
    get status() { return status },
    get sampleRoot() { return controller?.root || null },
    get mapping() { return controller?.mapping || null },
    summary: () => status === 'open' ? controller.summary() : legacy.summary(),
    dispose() { if (destroyed) return; destroyed = true; epoch++; controller?.dispose(); controller = null; status = 'closed'; legacy.dispose() },
  }
}
