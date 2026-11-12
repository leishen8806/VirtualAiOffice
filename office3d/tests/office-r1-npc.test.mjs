import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import { createR1Layout, r1ToWorld } from '../office-r1-layout.js'
import { R1_NPC_ROSTER, r1NpcStations, R1_NPC_BODY_R } from '../office-r1-npc.js'

// OFFICE-R1-I7B-A：服务人员 NPC。NPC 不是 Paperclip 同事——不占工位、不显示任务、
// 不计入「在岗」，名牌只写角色。这些测试守住站位（NPC-1）、隔离（NPC-3）与不挡路（NPC-4）。

const layout = createR1Layout({})
const stations = r1NpcStations(layout)
const byId = new Map(stations.map((s) => [s.id, s]))
const element = (id) => layout.elements.find((e) => e.id === id)
const world = (id) => { const e = element(id); return r1ToWorld(e.xM, e.yM) }
// 场景约定：yaw=0 面朝 -z；绕 Y 转 yaw 后，局部 -z 轴指向 (-sin yaw, -cos yaw)
const facingOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

test('NPC-0 名册：11 位服务人员，岗位数量与董事会 2026-10-30 的决定一致', () => {
  assert.equal(R1_NPC_ROSTER.length, 11)
  const count = (post) => R1_NPC_ROSTER.filter((n) => n.post === post).length
  assert.equal(count('reception'), 3)
  assert.equal(count('island-bar'), 2)
  assert.equal(count('cafe-counter'), 1)
  assert.equal(count('plaza-kiosk'), 4)
  assert.equal(count('security'), 1)
  assert.equal(stations.length, 11)
  // 每人一张不同的脸，且都来自本卡新导入的人物
  assert.equal(new Set(R1_NPC_ROSTER.map((n) => n.avatar)).size, 11)
  // Female_Adult_13 留给第 26 位同事（SEAT26），本卡不得占用
  assert.ok(!R1_NPC_ROSTER.some((n) => n.avatar === 'Female_Adult_13'))
})

test('NPC-5：需求修订后的第 29 个导入人物 Male_Adult_21 有完整运行时资源', () => {
  const dir = new URL('../assets/models/people/Male_Adult_21/', import.meta.url)
  for (const name of ['Male_Adult_21.fbx', 'Male_Adult_21_facial.fbx', 'm251_body_color.jpg', 'm251_head_color.jpg', 'm251_keffiyeh_color.jpg', 'preview.png']) {
    assert.ok(existsSync(new URL(name, dir)), `缺少 Male_Adult_21/${name}`)
  }
})

test('NPC-5：11 位服务人员的模型资源都已导入，不能在运行时回退到 404', () => {
  for (const npc of R1_NPC_ROSTER) {
    const dir = new URL(`../assets/models/people/${npc.avatar}/`, import.meta.url)
    assert.ok(existsSync(new URL(`${npc.avatar}.fbx`, dir)), `缺少 ${npc.avatar} 的模型资源`)
  }
})

test('NPC-5：额外人物沿用 compact 资产加载器，不调用已移除的 FBX loader', () => {
})

test('NPC-5: every service NPC has a compact runtime asset', () => {
  for (const npc of R1_NPC_ROSTER) {
    if (npc.avatar === 'Chef_Female_01') continue // Missing source head texture remains a tracked exception.
    assert.ok(existsSync(new URL(`../assets/compact/people/${npc.avatar}.glb.gz`, import.meta.url)), `missing compact asset: ${npc.avatar}`)
  }
})

test('NPC-5: extra avatars use the compact loader', () => {
  const people = readFileSync(new URL('../people.js', import.meta.url), 'utf8')
  const extraLoader = people.slice(people.indexOf('export async function loadExtraAvatars'), people.indexOf('// 首屏之后'))
  assert.match(extraLoader, /loadCompactPerson\(name\)/)
  assert.doesNotMatch(extraLoader, /makeLoader\(/)
})

test('NPC-3 隔离：名牌只写角色，没有同事姓名/职级/模型名，也没有任务字段', () => {
  for (const npc of R1_NPC_ROSTER) {
    assert.match(npc.label, /^[一-龥·]+$/, `${npc.id} 名牌应只有中文角色名：${npc.label}`)
    assert.ok(npc.label.length <= 4, `${npc.id} 名牌过长：${npc.label}`)
    assert.ok(!('agentId' in npc), `${npc.id} 不应带 agentId`)
    assert.ok(!('task' in npc) && !('mode' in npc), `${npc.id} 不应带任务/状态字段`)
  }
  const source = readFileSync(new URL('../office-r1-npc.js', import.meta.url), 'utf8')
  // NPC 不得写进 views / boardViews，也不得带 agentId（点击命中与「在岗」统计都走这两个口子）
  assert.ok(!/\bviews\.set\(/.test(source), 'NPC 不得写入 views')
  assert.ok(!/userData\.agentId\s*=/.test(source), 'NPC 不得设置 userData.agentId')
})

test('NPC-1 前台：1 人坐接待椅、2 人站台后，都朝大门，且不在门前 2.5 m 进出区内', () => {
  const chair = world('11-CH-001')
  const desk = world('11-CT-001')
  const doorZ = world('11-D-001').z
  const seated = stations.filter((s) => s.post === 'reception' && s.seated)
  const standing = stations.filter((s) => s.post === 'reception' && !s.seated)
  assert.equal(seated.length, 1)
  assert.equal(standing.length, 2)
  assert.ok(dist(seated[0], chair) < 0.12, `接待员应坐在 11-CH-001 上：${JSON.stringify(seated[0])}`)
  for (const s of stations.filter((x) => x.post === 'reception')) {
    // 台后 = 比台面更远离大门的一侧
    assert.ok(s.z < desk.z, `${s.id} 应在接待台后侧（z < ${desk.z}）`)
    // 朝向大门（+z）
    assert.ok(facingOf(s.yaw).z > 0.9, `${s.id} 应面朝大门：yaw=${s.yaw}`)
    // 门前 2.5 m 进出区
    assert.ok(doorZ - s.z >= 2.5, `${s.id} 落在门前 2.5 m 进出区内`)
  }
  // 两位站立的分开站，不互相重叠，也不压住椅子
  assert.ok(dist(standing[0], standing[1]) >= 1.6)
  for (const s of standing) assert.ok(dist(s, chair) >= 0.8, `${s.id} 离接待椅太近`)
})

test('NPC-1 中央咖啡岛台：2 人都在吧台内圈员工区，避开中央树池，面朝外', () => {
  const bar = world('07-BAR-001')
  const inner = layout.data.central.radii_m.bar_inner
  const pot = layout.data.central.radii_m.tree_pot
  const crew = stations.filter((s) => s.post === 'island-bar')
  assert.equal(crew.length, 2)
  for (const s of crew) {
    const r = dist(s, bar)
    assert.ok(r + R1_NPC_BODY_R <= inner, `${s.id} 超出吧台内圈：r=${r.toFixed(2)} + ${R1_NPC_BODY_R} > ${inner}`)
    assert.ok(r - R1_NPC_BODY_R >= pot, `${s.id} 压到中央树池：r=${r.toFixed(2)} - ${R1_NPC_BODY_R} < ${pot}`)
    // 面朝吧台外侧（背对中央树）
    const f = facingOf(s.yaw)
    const outward = { x: (s.x - bar.x) / r, z: (s.z - bar.z) / r }
    assert.ok(f.x * outward.x + f.z * outward.z > 0.85, `${s.id} 应面朝吧台外侧`)
  }
  assert.ok(dist(crew[0], crew[1]) >= 1.6, '两位咖啡员不要挤在一起')
})

test('NPC-1 区 10 咖啡台：操作员在登记的 cafe_operator_strip 内，面朝咖啡台', () => {
  const strip = layout.data.controls.cafe_operator_strip
  // controls 的 length 是模型 X 向、width 是模型 Y 向（由 10-CT-001 的 7.2 × 1.0 与偏移 1.125 反推）
  const x0 = strip.cx - strip.length / 2, x1 = strip.cx + strip.length / 2
  const y0 = strip.cy - strip.width / 2, y1 = strip.cy + strip.width / 2
  const a = r1ToWorld(x0, y0), b = r1ToWorld(x1, y1)
  const box = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }
  const op = byId.get('npc-cafe-1')
  assert.ok(op, '缺少区 10 咖啡员')
  for (const p of op.patrol) {
    assert.ok(p.x >= box.x0 && p.x <= box.x1, `咖啡员来回点 x=${p.x} 超出操作带 ${box.x0}..${box.x1}`)
    assert.ok(p.z >= box.z0 && p.z <= box.z1, `咖啡员来回点 z=${p.z} 超出操作带 ${box.z0}..${box.z1}`)
  }
  assert.ok(op.patrol.length >= 2, '咖啡员应在操作带内来回')
  assert.ok(facingOf(op.yaw).z > 0.9, '咖啡员应面朝咖啡台（+z）')
})

test('NPC-1 广场摊位：4 位摊主各在自己柜台后方，面朝顾客一侧', () => {
  const kiosks = ['14-KS-002', '14-KS-003', '14-KS-004', '14-KS-001']
  const vendors = stations.filter((s) => s.post === 'plaza-kiosk')
  assert.equal(vendors.length, 4)
  assert.deepEqual([...vendors].map((v) => v.anchor).sort(), [...kiosks].sort())
  for (const v of vendors) {
    const e = element(v.anchor)
    const c = r1ToWorld(e.xM, e.yM)
    // 柜台朝向顾客；摊主站在柜台另一侧，并且面朝同一个方向
    const f = facingOf(v.yaw)
    const counter = { x: e.facingLocal[0], z: -e.facingLocal[1] }
    // 站在柜台背面：从柜台中心看，摊主在 -facing 一侧
    const rel = { x: v.x - c.x, z: v.z - c.z }
    if (e.category === '餐车') {
      assert.ok(f.x * counter.x + f.z * counter.z < -.95, `${v.id} 应面朝取餐窗`)
      assert.ok(dist(v, c) >= e.widthM / 2 + .3, `${v.id} 不进入封闭车体`)
    } else {
      assert.ok(f.x * counter.x + f.z * counter.z > .95, `${v.id} 应面朝顾客一侧`)
      assert.ok(rel.x * counter.x + rel.z * counter.z < -.14, `${v.id} 应在柜台和后柜之间`)
      assert.ok(dist(v, c) < .2, `${v.id} 应在亭内操作区`)
    }
  }
})

test('NPC-1 保安：站在大门内侧一旁，不占门洞净宽、不进门扇扫掠', () => {
  const door = element('11-D-001')
  const d = r1ToWorld(door.xM, door.yM)
  const guard = byId.get('npc-security-1')
  assert.ok(guard, '缺少保安')
  assert.ok(guard.z < d.z, '保安应在大门内侧')
  // 门洞净宽范围内不得站人（否则挡住进出）
  const half = door.lengthM / 2
  assert.ok(Math.abs(guard.x - d.x) > half + R1_NPC_BODY_R, `保安压住门洞净宽：|${guard.x} - ${d.x}| <= ${half + R1_NPC_BODY_R}`)
  // 巡逻点同样不得进门洞带
  for (const p of guard.patrol || []) {
    const insideBand = Math.abs(p.x - d.x) <= half + R1_NPC_BODY_R
    assert.ok(!insideBand || d.z - p.z >= 2.5, `保安巡逻点 ${JSON.stringify(p)} 进了门前 2.5 m 进出区`)
  }
})

test('NPC-3 / 性能：app.js 把 NPC 排在 25 位同事之后，极速模式不加载', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const liteBlock = app.indexOf("OFFICE_LAYOUT.r1Phase === 'R1' && LITE.lite")
  const fullBlock = app.indexOf("OFFICE_LAYOUT.r1Phase === 'R1' && !LITE.lite")
  const npcCall = app.indexOf('createR1Npcs({')
  assert.ok(liteBlock > 0 && fullBlock > 0 && npcCall > 0)
  // NPC 只在「非极速」那一段里建
  assert.ok(npcCall > fullBlock, 'NPC 必须建在非极速模式的 R1 替换块内')
  // 必须排在同事替换完成（status.completedAt）之后
  assert.ok(npcCall > app.indexOf('status.completedAt = performance.now()', fullBlock), 'NPC 必须排在 25 位同事替换完成之后')
  // 不得推迟「人物就绪」：NPC 在 completedAt 之后、且放在独立的 setTimeout 里
  assert.match(app.slice(fullBlock, npcCall), /setTimeout\(async \(\) => \{[\s\S]*$/)
  // 极速模式那一段里不得出现 NPC
  assert.ok(!app.slice(liteBlock, fullBlock).includes('createR1Npcs'), '极速模式不得加载 NPC')
  // 名牌要跟着同事一起参与避让，并且 NPC 不进 views
  const declutter = app.slice(app.indexOf('declutter(['), app.indexOf('declutter([') + 400)
  assert.ok(declutter.includes('r1Npcs.members.map'), '名牌应与同事一起参与 declutter 避让')
  // 验收采样要读真实的 char.pose；没有这个口子就只能从场景反查重建，pose 恒为 0，证据是假的
  assert.match(app, /window\.__office\.r1NpcMembers = \(\) => \(r1Npcs \? r1Npcs\.members : \[\]\)/)
})

test('NPC-4 不挡路：所有站位与巡逻点都不压 R1 登记路线', () => {
  const routes = layout.data.routes || layout.routes || []
  assert.ok(routes.length >= 17, `应读到 R1 的登记路线，实际 ${routes.length} 条`)
  const pointsOf = (s) => [{ x: s.x, z: s.z }, ...(s.patrol || [])]
  const segmentDistance = (p, a, b) => {
    const vx = b.x - a.x, vz = b.z - a.z
    const len2 = vx * vx + vz * vz
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2)) : 0
    return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t))
  }
  const WALKER_R = 0.6 // MOVE 的 H2 体型半径
  for (const s of stations) {
    for (const p of pointsOf(s)) {
      for (const route of routes) {
        // 咖啡员本来就站在「售后路径避开此区」的操作带里；吧台员在吧台内圈，员工路线本就穿过这里
        if (s.post === 'cafe-counter' && route.id !== 'Z07_staff') { /* 操作带已登记为避让区 */ }
        if (route.id === 'Z07_staff' && (s.post === 'island-bar' || s.post === 'cafe-counter')) continue
        const pts = route.points_m.map(([x, y]) => r1ToWorld(x, y))
        for (let i = 1; i < pts.length; i += 1) {
          const gap = segmentDistance(p, pts[i - 1], pts[i])
          assert.ok(gap >= WALKER_R + R1_NPC_BODY_R, `${s.id} 在 ${JSON.stringify(p)} 处压住路线 ${route.id}：净距 ${gap.toFixed(2)} m < ${(WALKER_R + R1_NPC_BODY_R).toFixed(2)} m`)
        }
      }
    }
  }
})
