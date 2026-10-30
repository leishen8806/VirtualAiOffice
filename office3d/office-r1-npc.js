// OFFICE-R1-I7B-A：R1 办公室的服务人员（前台、中央咖啡岛台、区 10 咖啡台、广场摊位、大门保安）。
//
// 这些人是 NPC，不是 Paperclip 同事：不写进 views、不带 userData.agentId、不占工位、
// 不显示任务、不计入顶栏「在岗」人数，名牌只写角色（董事会 2026-10-30）。
// 站位全部由 office-r1/data.js 的登记锚点推出来，不写死坐标；具体偏移量见下表注释。
import { r1ToWorld } from './office-r1-layout.js'

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

// 站在柜台后方时，人体中心离柜台边缘再留的余量
const COUNTER_GAP = 0.5
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
      // 柜台的 facingLocal 指向顾客一侧；摊主站在另一侧，面朝同一个方向
      const f = { x: row.facingLocal[0], z: row.facingLocal[1] }
      const depth = Math.min(row.lengthM, row.widthM) / 2 + COUNTER_GAP
      return { ...npc, x: c.x - f.x * depth, z: c.z - f.z * depth, yaw: yawTo(f.x, f.z), patrol: [] }
    }

    // 保安：大门内侧一旁，避开门洞净宽与门扇扫掠；偶尔到广场上走一小段
    const post = { x: c.x + row.lengthM / 2 + 3.9, z: c.z - 1.1 }
    return {
      ...npc,
      x: post.x,
      z: post.z,
      yaw: yawTo(0, 1), // 面朝大门（+z）
      patrol: [post, { x: post.x - 0.2, z: post.z + 3.6 }, { x: post.x - 1.9, z: post.z + 5.9 }],
    }
  })
}
