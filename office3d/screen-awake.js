export function keepFullscreenAwake({ doc = document, nav = navigator, onStatus = () => {} } = {}) {
  let lock = null, pending = false, stopped = false
  const wanted = () => !stopped && !!doc.fullscreenElement && doc.visibilityState === 'visible'
  const status = value => { doc.documentElement.dataset.screenAwake = value; onStatus(value) }
  async function release() {
    const current = lock; lock = null
    if (current) { try { await current.release() } catch {} }
    status('off')
  }
  async function sync() {
    if (!wanted()) { await release(); return }
    if (lock || pending) return
    if (!nav.wakeLock?.request) { status('unsupported'); return }
    pending = true
    try {
      const acquired = await nav.wakeLock.request('screen')
      if (!wanted()) { await acquired.release(); return }
      lock = acquired
      acquired.addEventListener('release', () => {
        if (lock !== acquired) return
        lock = null; status(wanted() ? 'released' : 'off')
      })
      status('active')
    } catch { status(wanted() ? 'denied' : 'off') }
    finally { pending = false }
  }
  doc.addEventListener('fullscreenchange', sync)
  doc.addEventListener('visibilitychange', sync)
  doc.defaultView?.addEventListener('pagehide', release)
  void sync()
  return () => {
    stopped = true
    doc.removeEventListener('fullscreenchange', sync)
    doc.removeEventListener('visibilitychange', sync)
    doc.defaultView?.removeEventListener('pagehide', release)
    return release()
  }
}

export const awakeMessage = status => ({ active: '屏幕常亮已开启；退出全屏后恢复', unsupported: '此浏览器或地址不支持屏幕常亮，仍可能锁屏', denied: '常亮请求被浏览器或系统拒绝，仍可能锁屏', released: '系统已释放屏幕常亮，仍可能锁屏', off: '全屏时请求屏幕常亮' })[status] || ''
