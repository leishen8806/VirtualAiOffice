// 西翼：把办公室向左扩出 22 米（x -44 … -22），放两间玻璃会议室、一面日程墙，和运维 / 知识库两个新工作区。
// 会议室里的「开会」只由真实的多人讨论触发（见 app.js 的 meetings），不演假会议；日程墙上是 Paperclip 里真实的定时例程。
import * as THREE from 'three'
import { ENVELOPE, MAIN_FLOOR_X0, OFFICE_ROOMS, MEETING_ROOMS, MEETING_SEATS } from './office-layout.js'

export const WING = { ...ENVELOPE, x1: MAIN_FLOOR_X0 }
export const ROOMS = MEETING_ROOMS

export function buildWing({ scene, box, add, M, VI, canvasTex, marble, furn, A, WALL_H, BACK_Z, carpet, furnitureCollision }) {
  const ivory = M.ivory
  // ── 地面、底座、围墙 ──
  const mt = marble.clone()
  const wingWidth = WING.x1 - WING.x0, wingDepth = WING.z1 - WING.z0, wingX = (WING.x0 + WING.x1) / 2
  mt.repeat.set(wingWidth / 8, wingDepth / 8)
  mt.needsUpdate = true
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(wingWidth, wingDepth), new THREE.MeshStandardMaterial({ map: mt, roughness: 0.62, metalness: 0, envMapIntensity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(wingX, 0, 0)
  floor.receiveShadow = true
  scene.add(floor)
  add(scene, new THREE.BoxGeometry(wingWidth + 1, 0.6, wingDepth + 1), new THREE.MeshStandardMaterial({ color: 0xcfc7b9, roughness: 0.8 }), wingX - 0.5, -0.345, 0, false)
  add(scene, new THREE.BoxGeometry(wingWidth + 2, 0.08, wingDepth + 1.6), new THREE.MeshStandardMaterial({ color: 0xb69a64, roughness: 0.35, metalness: 0.9 }), wingX - 0.8, -0.05, 0)
  // 西墙（低墙 + 玻璃带，和东墙一致）
  box(0.2, 1.1, wingDepth, ivory, WING.x0, 0.55, 0)
  const wg = new THREE.Mesh(new THREE.PlaneGeometry(wingDepth, 1.6), new THREE.MeshPhysicalMaterial({ color: 0xdde8ff, transparent: true, opacity: 0.08, roughness: 0.08, side: THREE.DoubleSide }))
  wg.rotation.y = Math.PI / 2
  wg.position.set(WING.x0, 1.9, 0)
  scene.add(wg)
  // 后墙：两扇窗
  const wx = [WING.x0 + 5, WING.x1 - 8]
  const cx = (WING.x0 + WING.x1) / 2, w = WING.x1 - WING.x0
  box(w, 1.0, 0.3, ivory, cx, 0.5, BACK_Z)
  box(w, 0.7, 0.3, ivory, cx, WALL_H - 0.35, BACK_Z)
  const piers = [WING.x0, ...wx.flatMap((x) => [x - 1.6, x + 1.6]), WING.x1]
  for (let i = 0; i < piers.length; i += 2) if (piers[i + 1] - piers[i] > 0.05) box(piers[i + 1] - piers[i], WALL_H, 0.3, ivory, (piers[i] + piers[i + 1]) / 2, WALL_H / 2, BACK_Z)
  box(w, 0.22, 0.34, M.graphite, cx, 0.11, BACK_Z + 0.02, false)
  for (const x of wx) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 2.45), new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.1, roughness: 0.05 }))
    g.position.set(x, 2.35, BACK_Z + 0.16)
    scene.add(g)
    box(0.06, 2.5, 0.06, M.graphite, x, 2.35, BACK_Z + 0.17, false)
    box(3.2, 0.06, 0.06, M.graphite, x, 2.35, BACK_Z + 0.17, false)
  }

  // ── 新工作区的地毯与摆设 ──
  const kb = OFFICE_ROOMS.find(r => r.id === 'kb')
  if (A) {
    for (const dx of [1.5, 3, 4.5, 6].filter(dx => dx < kb.x1 - kb.x0 - 1.5)) furn('bookcaseClosed', kb.x0 + dx, kb.z0 + 0.5, { scale: 2, rotY: 0 })
    furn('pottedPlant', kb.x1 - 1, kb.z0 + 1, { scale: 2.6 })
    furn('pottedPlant', WING.x1 - 1, ENVELOPE.z1 - 1, { scale: 2.6 })
    furn('pottedPlant', WING.x0 + 1, ENVELOPE.z1 - 1, { scale: 2.4 })
  }

  // ── 日程墙（真实例程）──
  const sc = document.createElement('canvas')
  sc.width = 768; sc.height = 432
  const sctx = sc.getContext('2d')
  const stex = new THREE.CanvasTexture(sc)
  stex.colorSpace = THREE.SRGBColorSpace
  box(3.5, 2.0, 0.08, M.graphiteMetal, (ROOMS[0].x0 + ROOMS[0].x1) / 2, 2.5, BACK_Z + 0.2, false)
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.86), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }))
  board.position.set((ROOMS[0].x0 + ROOMS[0].x1) / 2, 2.5, BACK_Z + 0.25)
  scene.add(board)
  let schedKey = ''
  function drawSchedule(list, nameOf, now = new Date()) {
    const hm = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).format(new Date(iso))
    const key = JSON.stringify(list.map((x) => [x.title, x.nextRunAt])) + Math.floor(now.getTime() / 60000)
    if (key === schedKey) return
    schedKey = key
    const g = sctx
    g.fillStyle = '#14171a'; g.fillRect(0, 0, 768, 432)
    g.fillStyle = 'rgba(182,154,100,.25)'; g.fillRect(0, 0, 768, 64)
    g.fillStyle = '#e0c88f'; g.font = 'bold 34px sans-serif'; g.textAlign = 'left'; g.fillText('日程 · 下次定时例程（金边时间）', 24, 44)
    g.font = '27px sans-serif'
    list.slice(0, 7).forEach((x, i) => {
      const y = 112 + i * 44
      g.fillStyle = '#9fe7b4'; g.fillText(hm(x.nextRunAt), 24, y)
      g.fillStyle = '#f4f1eb'; g.fillText(x.title.slice(0, 16), 220, y)
      g.fillStyle = '#a9adb3'; g.font = '22px sans-serif'; g.fillText(nameOf(x.agentId) || '', 590, y); g.font = '27px sans-serif'
    })
    if (!list.length) { g.fillStyle = '#a9adb3'; g.fillText('暂无定时例程', 24, 120) }
    stex.needsUpdate = true
  }

  // ── 会议室 ──
  const seats = []
  const rooms = {}
  for (const r of ROOMS) {
    const cxr = (r.x0 + r.x1) / 2, czr = (r.z0 + r.z1) / 2
    carpet(r.x0 + 0.2, r.x1 - 0.2, r.z0 + 0.2, r.z1 - 0.2)
    // 桌椅
    const tw = r.n === 8 ? 5.0 : 3.8, td = 1.5
    const top = box(tw, 0.06, td, M.oak, cxr, 0.75, czr)
    furnitureCollision?.add(top, 'meetingTable')
    box(tw - 0.4, 0.04, 0.05, M.gold, cxr, 0.785, czr - td / 2 + 0.02, false)
    for (const sx of [-1, 1]) {
      const leg = box(0.08, 0.72, td - 0.3, M.graphiteMetal, cxr + sx * (tw / 2 - 0.3), 0.36, czr)
      furnitureCollision?.add(leg, 'meetingTableLeg')
    }
    for (const seat of MEETING_SEATS.filter(s => s.room === r.id)) {
      if (A) furn('chairDesk', seat.x, seat.z + 0.05, { rotY: seat.yaw + Math.PI })
      seats.push({ ...seat, taken: null })
    }
    // 墙面屏（会议状态）
    const c = document.createElement('canvas')
    c.width = 512; c.height = 288
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    box(3.0, 1.7, 0.06, M.graphiteMetal, r.x0 + 0.12, 1.75, czr, false).rotation.y = Math.PI / 2
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 1.58), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }))
    scr.position.set(r.x0 + 0.16, 1.75, czr); scr.rotation.y = Math.PI / 2
    scene.add(scr)
    rooms[r.id] = { room: r, ctx: c.getContext('2d'), tex: t, key: '', seats: seats.filter((s) => s.room === r.id) }

  }
  function drawRoom(id, info) {
    const R = rooms[id]
    const key = JSON.stringify(info || null)
    if (R.key === key) return
    R.key = key
    const g = R.ctx
    g.fillStyle = info ? '#10202a' : '#0d1116'; g.fillRect(0, 0, 512, 288)
    g.fillStyle = 'rgba(182,154,100,.25)'; g.fillRect(0, 0, 512, 52)
    g.fillStyle = '#e0c88f'; g.font = 'bold 30px sans-serif'; g.textAlign = 'left'; g.fillText(`${R.room.name} · ${info ? (info.mode === 'vote' ? '投票中' : '讨论中') : '空闲'}`, 18, 38)
    g.fillStyle = '#f4f1eb'; g.font = '26px sans-serif'
    if (info) {
      g.fillText(`${info.ident || ''} ${info.topic || ''}`.slice(0, 22), 18, 96)
      g.fillStyle = '#9fe7b4'; g.font = '22px sans-serif'; g.fillText('在场：' + (info.here.join('、') || '—').slice(0, 26), 18, 146)
      g.fillStyle = '#a9adb3'; g.fillText('远程：' + (info.remote.join('、') || '—').slice(0, 26), 18, 186)
      g.fillStyle = '#6f747b'; g.font = '18px sans-serif'; g.fillText(info.basis || '依据：同一任务里的真实评论', 18, 262)
    } else { g.fillStyle = '#a9adb3'; g.fillText('有真实讨论或委员投票时会有人来这里', 18, 110) }
    R.tex.needsUpdate = true
  }
  for (const id of Object.keys(rooms)) drawRoom(id, null)

  return { seats, rooms, drawSchedule, drawRoom }
}
