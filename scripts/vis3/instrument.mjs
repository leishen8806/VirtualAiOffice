// 浏览器 init 脚本（作为字符串注入）：统计 RAF/timer/fetch，并监测 WebGLRenderer 创建次数。
export const INSTRUMENT = `(() => {
  const s = { raf: 0, rafActive: 0, intervals: 0, timeouts: 0, fetchCalls: [], webglRenderers: 0, canvasesAtInit: document.querySelectorAll('canvas').length }
  window.__vis3 = s
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => { s.raf++; s.rafActive++; return raf((t) => { s.rafActive--; cb(t) }) }
  const si = window.setInterval.bind(window); window.setInterval = (fn, ms, ...a) => { s.intervals++; return si(fn, ms, ...a) }
  const st = window.setTimeout.bind(window); window.setTimeout = (fn, ms, ...a) => { s.timeouts++; return st(fn, ms, ...a) }
  const f = window.fetch.bind(window); window.fetch = (input, init) => { try { s.fetchCalls.push(String(typeof input === 'string' ? input : input?.url)) } catch {} ; return f(input, init) }
})()`
