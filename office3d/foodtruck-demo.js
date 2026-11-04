const BEATS = [
  { duration: 1.2, motion: 'gestic_talk_relaxed_01', text: '您好，开始咖啡服务演示。' },
  { duration: 2, motion: 'gestic_talk_relaxed_01', prop: 'cup', text: '递出咖啡（演示动作）' },
  { duration: 1.8, motion: 'cell_phone_textmessage', text: '演示支付 · 未扣款' },
  { duration: 1.2, motion: 'gestic_talk_relaxed_01', text: '谢谢光临！本段仅为视觉演示，未扣款。' },
]
const TOTAL = BEATS.reduce((sum, beat) => sum + beat.duration, 0)

export function createFoodtruckDemo(member, showBubble = () => {}) {
  const pose = member?.station?.id === 'npc-kiosk-4' ? member.char?.pose : null
  let elapsed = 0, lastStart = -Infinity, active = false, saved = null
  const show = (text, suffix = '') => showBubble(`演示 · 未扣款｜${text}${suffix}`)
  const snapshot = () => ({
    pose: { r1Motion: pose.r1Motion, r1Prop: pose.r1Prop, talk: pose.talk, walk: pose.walk, phase: pose.phase, yaw: pose.yaw },
    x: member.char.group?.position?.x, z: member.char.group?.position?.z, yaw: member.char.group?.rotation?.y,
    walker: member.walker && { ...member.walker, path: [...member.walker.path] },
  })
  function restore() {
    Object.assign(pose, saved.pose)
    if (member.char.group?.position) member.char.group.position.set(saved.x, 0, saved.z)
    if (member.char.group?.rotation) member.char.group.rotation.y = saved.yaw
    if (member.walker && saved.walker) Object.assign(member.walker, saved.walker)
    member.demoControlled = false
    member.char.solve?.(0)
    saved = null
  }
  function start(now = 0) {
    if (!pose || active || !Number.isFinite(now) || now - lastStart < 800) return false
    active = true
    elapsed = 0
    lastStart = now
    saved = snapshot()
    member.demoControlled = true
    update(0)
    return true
  }
  function update(dt) {
    if (!active) return
    elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0)
    if (elapsed >= TOTAL) {
      active = false
      restore()
      showBubble('')
      return
    }
    let remaining = elapsed
    const beat = BEATS.find(item => (remaining -= item.duration) < 0) || BEATS.at(-1)
    const canAnimate = member.char.hasR1Motion?.(beat.motion) ?? true
    pose.r1Motion = canAnimate ? beat.motion : undefined
    pose.r1Prop = canAnimate ? beat.prop : undefined
    pose.talk = Math.max(saved.pose.talk || 0, .85)
    if (member.char.group?.position) member.char.group.position.set(saved.x, 0, saved.z)
    if (member.char.group?.rotation) member.char.group.rotation.y = saved.yaw
    member.char.solve?.(dt)
    show(beat.text, canAnimate ? '' : '（动作素材未就绪，文字演示）')
  }
  return { get active() { return active }, start, update }
}
