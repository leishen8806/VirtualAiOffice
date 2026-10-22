import { createDirector } from '../director.js'
import { loungeTrip } from '../office-layout.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'

// 只在现有页面创建真实骨骼模型的独立副本；不接业务事件、不访问后端。
export function createLoungeInspection(office) {
  const T = office.THREE, originals = [...office.views.values()], actors = new Map(), saved = []
  const stage = new T.Group(); stage.name = 'LOCAL_VISUAL_INSPECTION'; office.scene.add(stage)
  for (const v of [...originals, ...Object.values(office.boardViews)]) {
    const group = v.char.group
    saved.push({ group, parent: group.parent }); group.removeFromParent()
  }
  const banner = document.createElement('div')
  banner.style.cssText = 'position:fixed;bottom:70px;left:20px;z-index:99;background:#5a3513;color:white;padding:10px;pointer-events:none'
  document.body.appendChild(banner)
  const director = createDirector({ views: actors, board: {}, layer: document.createElement('div'), project: { tmp: new T.Vector3(), fn() {} }, furnitureCollision: office.furnitureCollision })
  let time = 0, minDistance = Infinity, overlaps = 0, samples = [], phaseSeen = {}, direction = 'outbound'
  let movingMax = 0, queuedMax = 0, sitHeadingError = 0, turnLoweringFrames = 0
  let risingMax = 0, walkContactFrames = 0, wallContactFrames = 0, longestWalkStopSecs = 0
  const stopped = new Map()
  function reset(directionName) {
    direction = directionName; time = 0; minDistance = Infinity; overlaps = 0; samples = []; phaseSeen = {}
    movingMax = queuedMax = sitHeadingError = turnLoweringFrames = 0
    risingMax = walkContactFrames = wallContactFrames = longestWalkStopSecs = 0; stopped.clear()
  }
  function add(source, seat) {
    if (!source.char.cloneForTest) throw new Error('需要页面加载带 cloneForTest 的当前 people.js')
    const char = source.char.cloneForTest()
    char.pose.seed = source.char.pose.seed; char.group.position.set(source.home.x, 0, source.home.z); char.group.rotation.y = source.home.yaw
    char.pose.sit = 1; char.solve(1 / 60); stage.add(char.group)
    const actor = { id: source.id, name: source.name, home: { ...source.home }, chair: source.chair, char, act: null, seat }
    actors.set(actor.id, actor)
    director.travel(actor, (seat.pathFn ? seat.pathFn(actor) : loungeTrip(actor.home, seat)), seat, !seat.meeting, null)
    return actor
  }
  function bones(v) {
    const result = {}
    v.char.parts.model.traverse(b => { if (b.isBone && /Bip01_(Pelvis|Head|[LR]_(Calf|Foot|Thigh|Hand))$/.test(b.name)) {
      const p = new T.Vector3(); b.getWorldPosition(p); result[b.name] = p.toArray()
    } })
    return result
  }
  function snapshot() {
    return { time: +time.toFixed(3), direction, actors: [...actors.values()].map(v => ({ name: v.name, avatar: v.char.avatar, phase: v.act?.phase || 'seated', sit: +v.char.pose.sit.toFixed(3), position: v.char.group.position.toArray(), yaw: v.char.group.rotation.y, bones: bones(v) })) }
  }
  function step(frames = 1, dt = 1 / 60) {
    for (let f = 0; f < frames; f++) {
      const before = new Map([...actors.values()].map(v => [v.id, v.char.group.position.clone()]))
      director.update(dt)
      risingMax = Math.max(risingMax, [...actors.values()].filter(v => v.act?.phase === 'rise').length)
      movingMax = Math.max(movingMax, [...actors.values()].filter(v => v.act && !['queued', 'say'].includes(v.act.phase)).length)
      queuedMax = Math.max(queuedMax, [...actors.values()].filter(v => v.act?.phase === 'queued').length)
      for (const v of actors.values()) {
        v.char.solve(dt); v.char.group.updateMatrixWorld(true)
        const phase = v.act?.phase || 'seated', key = `${v.id}:${direction}:${phase}`
        if (!phaseSeen[key]) { phaseSeen[key] = true; samples.push(snapshot()) }
        if (phase === 'sit') sitHeadingError = Math.max(sitHeadingError, Math.abs(Math.atan2(Math.sin(v.char.group.rotation.y - v.act.seat.yaw), Math.cos(v.char.group.rotation.y - v.act.seat.yaw))))
        if (phase === 'turn' && v.char.pose.sit > 0.001) turnLoweringFrames++
        const idle = phase === 'walk' && v.char.group.position.distanceTo(before.get(v.id)) < 1e-6
        stopped.set(v.id, idle ? (stopped.get(v.id) || 0) + dt : 0)
        longestWalkStopSecs = Math.max(longestWalkStopSecs, stopped.get(v.id))
        if (phase === 'walk' && office.furnitureCollision) {
          const ignore = new Set([v.chair]), a = v.act
          if (a.departure && !a.departure.exited) ignore.add(a.departure.body)
          if (a.seat && a.i === a.pts.length - 1) ignore.add(office.furnitureCollision.seatBody(a.seat))
          const hit = office.furnitureCollision.hit(v.char.group.position.x, v.char.group.position.z, ignore)
          if (hit) { walkContactFrames++; if (hit.kind === 'officeWall') wallContactFrames++ }
        }
      }
      const vs = [...actors.values()]
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
        const d = vs[i].char.group.position.distanceTo(vs[j].char.group.position)
        minDistance = Math.min(minDistance, d)
        if (d < PERSON_GAP - 1e-6) { overlaps++; if (samples.length < 100 && overlaps % 15 === 1) samples.push(snapshot()) }
      }
      time += dt
    }
    const acting = [...actors.values()].filter(v => v.act && v.act.phase !== 'queued').length
    const waiting = [...actors.values()].filter(v => v.act?.phase === 'queued').length
    banner.textContent = `本地动作验收（非业务事件）· ${direction} · ${time.toFixed(2)}秒 · 行动 ${acting}人 · 等候 ${waiting}人`
    office.env3d.render()
    return snapshot()
  }
  function back() {
    reset('return')
    for (const v of actors.values()) {
      if (v.act) throw new Error('请先完成去程')
      director.travel(v, (v.seat.pathFn ? v.seat.pathFn(v) : loungeTrip(v.home, v.seat)).reverse().slice(1).concat([{ x: v.home.x, z: v.home.z }]), v.home, false, null)
    }
  }
  function mixed() {
    director.clear(); reset('mixed')
    let index = 0
    for (const v of actors.values()) {
      const returning = index++ < Math.floor(actors.size / 2), start = returning ? v.seat : v.home
      v.char.group.position.set(start.x, 0, start.z); v.char.group.rotation.y = start.yaw
      Object.assign(v.char.pose, { sit: 1, walk: 0, lounge: returning ? 1 : 0 })
      for (let j = 0; j < 60; j++) v.char.solve(1 / 60)
      const path = (v.seat.pathFn ? v.seat.pathFn(v) : loungeTrip(v.home, v.seat))
      director.travel(v, returning ? path.reverse().slice(1).concat([{ x: v.home.x, z: v.home.z }]) : path, returning ? v.home : v.seat, !returning && !v.seat.meeting, null)
    }
  }
  return {
    add, step, snapshot, back, mixed,
    actors, director,
    result: () => ({ seconds: time, actors: actors.size, active: director.stats().active, minDistance: Number.isFinite(minDistance) ? minDistance : null, overlapFrames: overlaps, movingMax, queuedMax, risingMax, walkContactFrames, wallContactFrames, longestWalkStopSecs, sitHeadingError, turnLoweringFrames, samples }),
    dispose() {
      director.clear(); stage.removeFromParent(); banner.remove()
      for (const { group, parent } of saved) if (parent) parent.add(group)
      // 副本共享角色材质，不得 dispose 原人物正在使用的材质和贴图。
      for (const v of actors.values()) v.char.parts.model.traverse(m => { if (m.isSkinnedMesh && m.skeleton.boneTexture) m.skeleton.boneTexture.dispose() })
      actors.clear()
    },
  }
}
