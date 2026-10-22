import { createDirector } from '../director.js'
import { loungeTrip } from '../office-layout.js'

// 在已运行页面的调试接口上测试离线副本，不向业务后端写入，不污染真实事件队列。
export function checkOfficeRoutes(office, dt = 1 / 60, boardOnly = false) {
  const T = office.THREE, originals = [...office.views.values()], results = []
  for (let index = 0; index < originals.length; index++) {
    const source = originals[index], target = boardOnly ? Object.values(office.boardViews)[0] : originals[(index + 5) % originals.length]
    const views = new Map(originals.map(v => {
      const group = new T.Group(), head = new T.Object3D()
      group.position.set(v.home.x, 0, v.home.z); group.add(head)
      return [v.id, { id: v.id, name: v.name, home: { ...v.home }, stand: { ...v.stand }, chair: v.chair,
        char: { group, body: { head }, pose: { sit: 1, type: 0, carry: 0, walk: 0, phase: 0, talk: 0, yaw: 0, pitch: 0, lounge: 0 } }, act: null }]
    }))
    const board = Object.fromEntries(Object.entries(office.boardViews).map(([name, v]) => {
      const group = new T.Group(), head = new T.Object3D()
      group.position.set(v.home.x, 0, v.home.z); group.add(head)
      return [name, { ...v, act: null, char: { group, body: { head }, pose: { yaw: 0, pitch: 0 } } }]
    }))
    const director = createDirector({ views, board, layer: document.createElement('div'), project: { tmp: new T.Vector3(), fn() {} }, furnitureCollision: office.furnitureCollision })
    director.enqueue({ from: source.id, to: boardOnly ? 'board' : target.id, kind: 'report', text: 'QA' })
    const actor = views.get(source.id), phases = new Set()
    let seconds = 0, contacts = 0, frames = 0
    for (; seconds < 150; seconds += dt) {
      director.update(dt); frames++
      if (actor.act) phases.add(actor.act.phase)
      if (actor.act?.phase === 'walk' && office.furnitureCollision.hit(actor.char.group.position.x, actor.char.group.position.z, actor.chair)) contacts++
      if (seconds > 0 && !director.stats().active && !director.stats().queued) break
    }
    results.push({ from: source.name, to: target.name, complete: seconds < 150, seconds: +seconds.toFixed(2), frames, phases: [...phases], contacts,
      remaining: actor.act && { phase: actor.act.phase, waypoint: actor.act.i, target: actor.act.pts?.[actor.act.i], position: actor.char.group.position.toArray() } })
    director.clear()
  }
  return { dt, routes: results.length, completed: results.filter(r => r.complete).length, contacts: results.reduce((n, r) => n + r.contacts, 0), results }
}

export function checkLoungeRoutes(office, seats = office.LOUNGE) {
  const T = office.THREE, source = [...office.views.values()][0], results = []
  for (const seat of seats) {
    const group = new T.Group(), head = new T.Object3D()
    group.add(head); group.position.set(source.home.x, 0, source.home.z)
    const actor = { id: source.id, name: source.name, home: { ...source.home }, chair: source.chair, char: { group, body: { head }, pose: { sit: 1, type: 0, carry: 0, walk: 0, phase: 0, talk: 0, lounge: 0 } }, act: null }
    const director = createDirector({ views: new Map([[actor.id, actor]]), board: {}, layer: document.createElement('div'), project: { tmp: new T.Vector3(), fn() {} }, furnitureCollision: office.furnitureCollision })
    const h = actor.home, z = director.aisleZ(actor)
    const path = seat.pathFn ? seat.pathFn(actor) : loungeTrip(h, seat)
    const legs = []
    for (const back of [false, true]) {
      director.travel(actor, back ? path.slice().reverse().slice(1).concat([{ x: h.x, z: h.z }]) : path.slice(), back ? h : seat, !back, null)
      let steps = 0
      for (; steps < 10800 && actor.act; steps++) director.update(1 / 60)
      legs.push({ direction: back ? 'return' : 'outbound', complete: !actor.act, seconds: +(steps / 60).toFixed(2), phase: actor.act?.phase, position: group.position.toArray() })
      if (actor.act) break
    }
    results.push({ seat: { x: seat.x, z: seat.z }, legs }); director.clear()
  }
  return { seats: results.length, completed: results.filter(r => r.legs.length === 2 && r.legs.every(l => l.complete)).length, results }
}

export function checkCommuteRoutes(office) {
  const T = office.THREE, results = []
  for (const source of office.views.values()) {
    const group = new T.Group(), head = new T.Object3D(); group.add(head)
    group.position.set(source.home.x, 0, source.home.z)
    const actor = { id: source.id, name: source.name, home: { ...source.home }, chair: source.chair, char: { group, body: { head }, pose: { sit: 1, type: 0, carry: 0, walk: 0, phase: 0, talk: 0, lounge: 0 } }, act: null }
    const director = createDirector({ views: new Map([[actor.id, actor]]), board: {}, layer: document.createElement('div'), project: { tmp: new T.Vector3(), fn() {} }, furnitureCollision: office.furnitureCollision })
    const legs = []
    for (const arrive of [false, true]) {
      if (arrive) director.arrive(actor); else director.goHome(actor)
      let steps = 0
      for (; steps < 10800 && actor.act; steps++) director.update(1 / 60)
      legs.push({ direction: arrive ? 'arrive' : 'leave', complete: !actor.act, seconds: +(steps / 60).toFixed(2), position: group.position.toArray() })
      if (actor.act) break
    }
    results.push({ name: source.name, legs }); director.clear()
  }
  return { agents: results.length, completed: results.filter(r => r.legs.length === 2 && r.legs.every(l => l.complete)).length, results }
}
