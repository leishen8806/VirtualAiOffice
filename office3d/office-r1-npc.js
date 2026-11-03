// OFFICE-R1-I7B-A：R1 办公室的服务人员（前台、中央咖啡岛台、区 10 咖啡台、广场摊位、大门保安）。
//
// 这些人是 NPC，不是 Paperclip 同事：不写进 views、不带 userData.agentId、不占工位、
// 不显示任务、不计入顶栏「在岗」人数，名牌只写角色（董事会 2026-10-30）。
// 站位全部由 office-r1/data.js 的登记锚点推出来，不写死坐标；具体偏移量见下表注释。
import { r1ToWorld, runtimeYawFromFacing } from './office-r1-layout.js'

// 站立人物的身体半径（肩宽的一半）。MOVE 走路用的 H2 体型是 0.6 m，两者相加就是
// NPC 站位与登记路线之间要留的净距。
export const R1_NPC_BODY_R = 0.3

// 场景约定：yaw = 0 时面朝 -z。把世界方向 (dx, dz) 换成 yaw。
const yawTo = (dx, dz) => Math.atan2(-dx, -dz)

// 名册。post 决定行为，anchor 是站位所依附的登记构件 id，avatar 是本卡新导入的人物。
// 人物分配照任务卡 OFFICE-R1-I7B-A 的表；Female_Adult_13 留给第 26 位同事，这里不用。
export const R1_NPC_ROSTER = Object.freeze([
  { id: 'npc-reception-1', post: 'reception', label: '前台', avatar: 'Business_Female_01', gender: 'female', anchor: '11-CH-001', seated: true },
  { id: 'npc-reception-2', post: 'reception', label: '前台', avatar: 'Business_Female_02', gender: 'female', anchor: '11-CT-001', seated: false, along: -1.7 },
  { id: 'npc-reception-3', post: 'reception', label: '前台', avatar: 'Business_Female_03', gender: 'female', anchor: '11-CT-001', seated: false, along: 1.7 },
  // 环形吧台内圈：角度沿逆时针，半径取内圈 2.9 与树池 1.2 之间
  { id: 'npc-island-1', post: 'island-bar', label: '咖啡员', avatar: 'Chef_Female_01', gender: 'female', anchor: '07-BAR-001', angle: 2.4 },
  { id: 'npc-island-2', post: 'island-bar', label: '咖啡员', avatar: 'Male_Adult_13', gender: 'male', anchor: '07-BAR-001', angle: 5.0 },
  { id: 'npc-cafe-1', post: 'cafe-counter', label: '咖啡员', avatar: 'Male_Adult_16', gender: 'male', anchor: '10-CT-001' },
  { id: 'npc-kiosk-1', post: 'plaza-kiosk', label: '摊主', avatar: 'Female_Adult_11', gender: 'female', anchor: '14-KS-002' },
  { id: 'npc-kiosk-2', post: 'plaza-kiosk', label: '摊主', avatar: 'Male_Adult_14', gender: 'male', anchor: '14-KS-003' },
  { id: 'npc-kiosk-3', post: 'plaza-kiosk', label: '摊主', avatar: 'Female_Adult_12', gender: 'female', anchor: '14-KS-004' },
  { id: 'npc-kiosk-4', post: 'plaza-kiosk', label: '摊主', avatar: 'Male_Adult_15', gender: 'male', anchor: '14-KS-001' },
  { id: 'npc-security-1', post: 'security', label: '保安', avatar: 'Security_Male_01', gender: 'male', anchor: '11-D-001' },
])

// 本卡用到的人物（供加载器按名字预取）
export const R1_NPC_AVATARS = Object.freeze(R1_NPC_ROSTER.map((n) => ({ name: n.avatar, gender: n.gender })))

// 接待台后侧：站立接待员比台面再往里 1.1 m（台宽 1.8，半宽 0.9 + 0.2 余量）
const RECEPTION_BACK = 1.1

export function r1NpcStations(layout) {
  const element = (id) => {
    const row = layout.elements.find((e) => e.id === id)
    if (!row) throw new Error(`R1 NPC：找不到登记构件 ${id}`)
    return row
  }
  const worldOf = (row) => r1ToWorld(row.xM, row.yM)
  const central = layout.data.central
  const controls = layout.data.controls

  return R1_NPC_ROSTER.map((npc) => {
    const row = element(npc.anchor)
    const c = worldOf(row)

    if (npc.post === 'reception') {
      if (npc.seated) {
        // 坐在接待椅上：位置与朝向直接用椅子的登记值（朝大门）
        return { ...npc, x: c.x, z: c.z, yaw: yawTo(row.facingLocal[0], row.facingLocal[1]), patrol: [] }
      }
      // 站在接待台后侧（比台面更远离大门），沿台面方向左右分开，和坐着的人一样朝大门
      const deskFacing = { x: row.facingLocal[0], z: row.facingLocal[1] }
      // 台面朝向指向「台后」一侧（登记约定：facingLocal 指向使用者所在的那一侧）
      return {
        ...npc,
        x: c.x + npc.along + deskFacing.x * RECEPTION_BACK,
        z: c.z + deskFacing.z * RECEPTION_BACK,
        // 面朝大门：与接待椅同向
        yaw: yawTo(-deskFacing.x, -deskFacing.z),
        patrol: [],
      }
    }

    if (npc.post === 'island-bar') {
      // 内圈员工区：半径落在树池（tree_pot）与吧台内圈（bar_inner）正中间
      const r = (central.radii_m.tree_pot + central.radii_m.bar_inner) / 2
      const x = c.x + Math.cos(npc.angle) * r
      const z = c.z + Math.sin(npc.angle) * r
      // 面朝吧台外侧（背对中央树），在咖啡机与陈列柜之间沿内圈小幅走动
      const out = { x: Math.cos(npc.angle), z: Math.sin(npc.angle) }
      const swing = 0.32 // 沿内圈左右各走约 0.32 rad
      const at = (a) => ({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r })
      return { ...npc, x, z, yaw: yawTo(out.x, out.z), patrol: [at(npc.angle - swing), at(npc.angle + swing)] }
    }

    if (npc.post === 'cafe-counter') {
      // 登记的「虚拟操作区」：length 是模型 X 向、width 是模型 Y 向
      // （由 10-CT-001 的 7.2 × 1.0 与中心偏移 1.125 = 0.5 + 0.625 反推）
      const s = controls.cafe_operator_strip
      const margin = R1_NPC_BODY_R + 0.1
      const a = r1ToWorld(s.cx - s.length / 2 + margin, s.cy)
      const b = r1ToWorld(s.cx + s.length / 2 - margin, s.cy)
      const counterFacing = { x: row.facingLocal[0], z: row.facingLocal[1] }
      return {
        ...npc,
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        // 咖啡台的 facingLocal 指向操作带；操作员反过来朝咖啡台
        yaw: yawTo(-counterFacing.x, -counterFacing.z),
        patrol: [a, b],
      }
    }

    if (npc.post === 'plaza-kiosk') {
      // 与摊亭模型用同一坐标变换；登记 Y 轴与世界 Z 轴相反。
      const yaw = runtimeYawFromFacing(row.facingLocal[0], -row.facingLocal[1])
      const at = (x, z) => ({ x: c.x + x * Math.cos(yaw) + z * Math.sin(yaw), z: c.z - x * Math.sin(yaw) + z * Math.cos(yaw) })
      if (row.category === '餐车') {
        // 餐车是封闭车体，外侧取餐窗服务点不冒充车内通道。
        const z = -row.widthM / 2 - .5
        return { ...npc, ...at(0, z), yaw: yaw + Math.PI, patrol: [at(-.4, z), at(.4, z)] }
      }
      // 台面后缘 -0.30、后柜前缘 +0.65；0.30 m 身体在这条真实空隙中活动。
      return { ...npc, ...at(0, .15), yaw, patrol: [at(-.55, .15), at(.55, .15)] }
    }

    // 保安：大门内侧一旁，避开门洞净宽与门扇扫掠；偶尔到广场上走一小段
    const post = { x: c.x + row.lengthM / 2 + 3.9, z: c.z - 1.1 }
    return {
      ...npc,
      x: post.x,
      z: post.z,
      yaw: yawTo(0, 1), // 面朝大门（+z）
      // 在门内侧巡查；到达方式仍由真实导航求解，不再把跨过花池的直线当通路。
      patrol: [post, { x: post.x - 2, z: post.z - .8 }, { x: post.x, z: post.z - 2 }],
    }
  })
}

// ---- 场景层 ----------------------------------------------------------------
// 在 25 位同事替换完成之后调用；低配极速模式不调用（见 app.js）。

const WALK_SPEED = 0.5          // m/s，服务人员在自己的活动范围内慢走
const PHASE_PER_M = 4.6         // 与 app.js / people.js 的走路相位换算一致
const DWELL = [5, 13]           // 到达端点后停留的秒数区间

function makeWalker(station, seed) {
  const route = station.patrol && station.patrol.length >= 2 ? station.patrol : null
  return {
    route,
    leg: 0,
    path: [],
    speed: 0,
    arrivals: 0,
    blocked: 0,
    dwell: DWELL[0] + (seed % 1) * (DWELL[1] - DWELL[0]),
    x: station.x,
    z: station.z,
    yaw: station.yaw,
    walking: 0,
  }
}

function stepWalker(w, dt, station, navigation, collision) {
  if (!w.route) return
  const turn = target => {
    const delta = Math.atan2(Math.sin(target - w.yaw), Math.cos(target - w.yaw))
    w.yaw += Math.max(-dt * Math.PI / 2, Math.min(dt * Math.PI / 2, delta))
    return Math.abs(delta)
  }
  w.walking = 0
  if (w.dwell > 0) { w.dwell -= dt; w.speed = 0; turn(station.yaw); return }
  const guard = station.post === 'security'
  if (guard && !navigation?.prepared()) return
  if (!w.path.length) {
    const target = w.route[w.leg]
    if (Math.hypot(target.x - w.x, target.z - w.z) < .015) { w.leg = (w.leg + 1) % w.route.length; return }
    w.path = guard ? (navigation.plan(w, target, station.id) || []).slice(1) : [target]
    if (!w.path.length) { w.dwell = 2; w.blocked++; w.leg = (w.leg + 1) % w.route.length; return }
  }
  const to = w.path[0], span = Math.hypot(to.x - w.x, to.z - w.z)
  if (span < .015) {
    w.path.shift()
    if (!w.path.length) {
      w.arrivals++; w.leg = (w.leg + 1) % w.route.length
      w.dwell = DWELL[0] + Math.random() * (DWELL[1] - DWELL[0]); w.speed = 0
    }
    return
  }
  const angle = turn(yawTo(to.x - w.x, to.z - w.z))
  if (angle > .25) { w.speed = 0; return }
  w.speed = Math.min(WALK_SPEED, w.speed + dt * .6, Math.sqrt(2 * .6 * span))
  const step = Math.min(span, w.speed * dt)
  const next = { x: w.x + (to.x - w.x) * step / span, z: w.z + (to.z - w.z) * step / span }
  const safe = guard ? navigation.clear(w, next, station.id) : collision && !collision.navigationHit(next.x, next.z, R1_NPC_BODY_R)
  if (!safe) {
    w.path = []; w.speed = 0; w.dwell = 2; w.blocked++
    return
  }
  w.x = next.x; w.z = next.z; w.walking = 1
}

export function createR1Npcs({ THREE, scene, layout, people, labelsEl, createPerson, collision, navigation, document: doc = globalThis.document }) {
  const stations = r1NpcStations(layout)
  // 摆场变化时也不能生成在障碍内；只在守岗点附近找最近的真实可站立点。
  const guard = stations.find(s => s.post === 'security')
  if (collision && guard) {
    const free = p => {
      for (let radius = 0; radius <= 2; radius += .1) {
        const count = radius ? Math.ceil(2 * Math.PI * radius / .1) : 1
        for (let i = 0; i < count; i++) {
          const q = { x: p.x + Math.cos(i * 2 * Math.PI / count) * radius, z: p.z + Math.sin(i * 2 * Math.PI / count) * radius }
          if (!collision.navigationHit(q.x, q.z, .6)) return q
        }
      }
      throw new Error('保安守岗点附近没有安全站位')
    }
    guard.patrol = guard.patrol.map(free)
    Object.assign(guard, guard.patrol[0])
  }
  const members = []
  const head = new THREE.Vector3()

  for (const station of stations) {
    const ch = createPerson(people, station.avatar)
    ch.group.position.set(station.x, 0, station.z)
    ch.group.rotation.y = station.yaw
    ch.pose.sit = station.seated ? 1 : 0
    // 只打 NPC 标记，不写 agentId：pick() 只在 views / boardViews 里取网格，
    // 所以 NPC 既点不开同事卡片，也不会被当成同事统计。
    ch.group.traverse((o) => { o.userData.r1NpcId = station.id })
    scene.add(ch.group)

    let label = null
    if (labelsEl && doc) {
      label = doc.createElement('div')
      label.className = 'lab npc'
      label.dataset.npc = station.id
      const nm = doc.createElement('span')
      nm.className = 'nm'
      nm.textContent = station.label // 名牌只写角色
      label.appendChild(nm)
      labelsEl.appendChild(label)
    }

    members.push({ station, char: ch, label, walker: makeWalker(station, ch.pose.seed), lookT: 2 + Math.random() * 6 })
  }

  function update(dt, t, project) {
    for (const m of members) {
      const { station, char, walker } = m
      const p = char.pose
      stepWalker(walker, dt, station, navigation, collision)
      if (walker.route) {
        const moved = Math.hypot(char.group.position.x - walker.x, char.group.position.z - walker.z)
        char.group.position.set(walker.x, 0, walker.z)
        p.phase += moved * PHASE_PER_M
        p.walk += (walker.walking - p.walk) * Math.min(1, dt * 6)
        char.group.rotation.y = walker.yaw
      }
      p.sit += ((station.seated ? 1 : 0) - p.sit) * Math.min(1, dt * 6)
      // 前台偶尔看向大门方向；其余人原地小幅转头
      m.lookT -= dt
      if (m.lookT <= 0) { m.lookT = 4 + Math.random() * 9; m.lookTarget = (Math.random() - 0.5) * 0.9 }
      p.yaw += ((m.lookTarget || 0) - p.yaw) * Math.min(1, dt * 1.6)
      if (station.post === 'plaza-kiosk') p.talk += ((!walker.walking && walker.dwell > 3 && walker.dwell < 7 ? .7 : 0) - p.talk) * Math.min(1, dt * 2)
      char.solve(dt)
      if (m.label && project) {
        char.body.head.getWorldPosition(head)
        head.y += char.labelDY || 0.62
        project(head, m.label, 0)
      }
    }
  }

  function summary() {
    return {
      count: members.length,
      posts: members.reduce((acc, m) => { acc[m.station.post] = (acc[m.station.post] || 0) + 1; return acc }, {}),
      members: members.map((m) => ({
        id: m.station.id, post: m.station.post, label: m.station.label, avatar: m.station.avatar,
        x: +m.char.group.position.x.toFixed(3), z: +m.char.group.position.z.toFixed(3),
        yaw: +m.char.group.rotation.y.toFixed(4), walking: m.walker.walking > 0.5,
        arrivals: m.walker.arrivals, blocked: m.walker.blocked,
      })),
    }
  }

  function dispose() {
    for (const m of members) { m.char.group.removeFromParent(); m.label?.remove() }
    members.length = 0
  }

  return { members, stations, update, summary, dispose }
}
