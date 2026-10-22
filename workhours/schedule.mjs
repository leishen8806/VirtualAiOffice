// 作息时间的计算（调度器与办公室 3D 共用）。只依赖 Node / 浏览器自带的 Intl，不需要时区库。
export function localParts(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]))
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { dow, y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, minutes: +p.hour * 60 + +p.minute }
}
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }

export function onDuty(cfg, date = new Date()) {
  const t = localParts(date, cfg.timezone)
  return cfg.days.includes(t.dow) && t.minutes >= hm(cfg.start) && t.minutes < hm(cfg.end)
}

// 下一次上班 / 下班的时间点（按分钟往后找，最多找 8 天）
export function nextChange(cfg, date = new Date()) {
  const now = onDuty(cfg, date)
  const start = Math.floor(date.getTime() / 60000) * 60000
  for (let i = 1; i < 8 * 24 * 60; i++) {
    const d = new Date(start + i * 60000)
    if (onDuty(cfg, d) !== now) return { at: d.toISOString(), to: now ? 'off' : 'on' }
  }
  return null
}
