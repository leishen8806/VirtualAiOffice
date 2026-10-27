import { createOfficeV2Registry } from './office-v2-registry.js'
import { buildOfficeShellV2 } from './office-layout-v2-scene.js'
import { placeOfficeFurnitureV2 } from './office-furniture-v2.js'
import { resolveOfficeLayout, createOfficeNavigation, SEATS as LEGACY_SEATS } from './office-layout.js'
import { createDirector as directorFactory } from './director.js'
import { createQueueBoard, createWaitingBoard as legacyWaitingBoard, waitingPlan as legacyWaitingPlan } from './foyer-paths.js'

// 浏览器入口负责选择版本；Node 数据测试不装载依赖浏览器 import-map 的旧渲染器。
const browser = typeof location !== 'undefined'
const [legacyWing, legacyPartitions, legacyFun] = browser ? await Promise.all([import('./wing.js'), import('./office-partitions.js'), import('./fun.js')]) : [null, null, null]
export const OFFICE_LAYOUT = resolveOfficeLayout(browser ? location.search : '')
const [bar, departments, staff] = !browser || OFFICE_LAYOUT.version === 2 ? await Promise.all([
  import('./office-bar.js'), import('./display-departments.js'), import('./display-staff.js'),
]) : []
export const officeSeats = layout => layout?.r1Phase === 'R1' ? {} : [2, 3].includes(layout.version) ? Object.fromEntries(Object.keys(LEGACY_SEATS).map(name => [name, layout.seats[name]])) : LEGACY_SEATS
export const SEATS = officeSeats(OFFICE_LAYOUT)
const navigation = createOfficeNavigation(OFFICE_LAYOUT)
export const { officeExit, corridorPath, loungeTrip, meetingTrip, LOUNGE_AREA, LOUNGE_SEATS } = navigation
export const officeStand = home => navigation.standAt?.(home) || { x: home.x + 1, z: home.z }
export const createDirector = context => directorFactory({ ...context, layout: OFFICE_LAYOUT })
export const createFun = context => legacyFun.createFun({ ...context, layout: OFFICE_LAYOUT })
export const holidayInfo = (...args) => legacyFun.holidayInfo(...args)
export const createWaitingBoard = () => {
  if (OFFICE_LAYOUT.version === 3) return createQueueBoard({ queues: { waiting: navigation.consumerQueues.waiting }, compact: false })
  return OFFICE_LAYOUT.version === 2 ? createQueueBoard({ queues: { waiting: [12, 13, 14, 15].map(x => ({ x, z: 15 })) }, compact: false }) : legacyWaitingBoard()
}
export const waitingPlan = context => {
  if (OFFICE_LAYOUT.version === 3) {
    if (!Number.isFinite(context.home?.x) || !Number.isFinite(context.home?.z)) return { ok: false, reason: 'invalid_home' }
    if (typeof context.agentId !== 'string' || !context.agentId || !context.board?.join || !context.board?.leave) return { ok: false, reason: 'invalid_board' }
    const joined = context.board.join(context.agentId, 'waiting')
    if (!joined.ok) return { ok: false, reason: joined.reason }
    const go = navigation.consumerTrip(context.home, 'waiting', joined.point)
    return { ok: true, targetId: 'waiting', go, stand: { ...joined.point }, back: go.toReversed().map(point => ({ ...point })), slot: joined.slot, yaw: Math.PI }
  }
  const plan = legacyWaitingPlan(context)
  if (!plan.ok || ![2, 3].includes(OFFICE_LAYOUT.version)) return plan
  const exit = navigation.officeExit(context.home), go = [...exit, ...navigation.corridorPath(exit.at(-1), plan.stand)]
  return { ...plan, go, back: go.toReversed().map(p => ({ ...p })) }
}
export const ROOMS = legacyWing?.ROOMS
export const buildWing = context => context.scene.userData.officeV2?.get('furniture')?.wing || legacyWing.buildWing(context)
export const buildOfficePartitions = context => context.scene.userData.officeV2?.get('furniture')?.partitions || legacyPartitions.buildOfficePartitions(context)

export const officeV2Modules = Object.freeze([
  ['navigation', ({ THREE, root, layout, collision }) => {
    for (const box of layout.bar.segments) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.x1 - box.x0, 1, box.z1 - box.z0))
      mesh.position.set((box.x0 + box.x1) / 2, .5, (box.z0 + box.z1) / 2); mesh.visible = false; root.add(mesh); collision.add(mesh, 'officeBar')
    }
    return { ...createOfficeNavigation(layout), dispose() { root.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose() } }) } }
  }],
  ['shell', context => buildOfficeShellV2({ ...context, scene: context.root })],
  ['furniture', context => {
    if (!context.get('shell')) throw new Error('外壳不可用')
    return placeOfficeFurnitureV2({ ...context, parent: context.root })
  }],
  // navigation 已注册同源的 12 段；模型保留不可见代理，但不重复交给碰撞系统。
  ['bar', context => {
    // 模块已自行合批/简化；禁止画质系统把副本搬到办公区根之外。
    context.root.userData.dynamic = true
    return bar.buildOfficeBar({ ...context, collision: undefined })
  }],
  ['displayDepartments', context => {
    context.root.userData.dynamic = true
    return departments.buildDisplayDepartments(context)
  }],
  ['displayStaff', context => {
    const search = context.search ?? (browser ? location.search : '')
    const params = new URLSearchParams(search)
    if (params.getAll('display').length !== 1 || params.get('display') !== '1') return {}
    const value = staff.buildDisplayStaff({ ...context, config: undefined, search })
    let low = context.quality?.tier === 'low'
    return { ...value, onFrame() {
      const nextLow = context.quality?.tier === 'low'
      if (nextLow !== low) { value.setLow(nextLow); low = nextLow }
      value.update()
    } }
  }],
])

export function startOfficeV2(shared) {
  const layout = shared.layout || OFFICE_LAYOUT
  if (layout.version !== 2) return null
  const { THREE, scene, quality, collision, floor } = shared
  const registry = createOfficeV2Registry({ THREE, scene, quality, layout }), pending = []
  try {
    officeV2Modules.forEach(([name, factory]) => registry.register(name, factory))
    registry.buildAll({ ...shared, collision: { ...collision, add: (...args) => pending.push(args) } })
    const furniture = registry.get('furniture')
    if (!registry.get('shell') || !furniture) { registry.dispose(); return null }
    for (const args of pending) collision.add(...args)
    floor.visible = false; scene.userData.officeV2 = registry
    furniture.registry = registry
    return furniture
  } catch (error) {
    registry.dispose(); console.warn('[office-v2] 初始化失败，保留布局一：', String(error?.message || error))
    return null
  }
}
