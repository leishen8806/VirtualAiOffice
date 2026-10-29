// 低配极速模式：弱设备 / 慢网络 / 手机打开 R1 办公室时，不加载写实人物与走动导航，直接低档、DPR 1。
// 纯函数，测试与浏览器共用；优先级：URL ?lite= > 用户在页面上的选择 > 自动判断。
export const LITE_KEY = 'office3d.lite.v1'
const SLOW_NET = new Set(['slow-2g', '2g', '3g'])

export function decideLiteMode({ search = '', storage, nav = {}, screen = {}, coarsePointer = false } = {}) {
  const forced = new URLSearchParams(search).get('lite')
  if (forced === '1' || forced === '0') return { lite: forced === '1', source: 'url', reason: forced === '1' ? '网址指定极速模式' : '网址指定完整模式' }
  try { const saved = storage?.getItem(LITE_KEY); if (saved === '1' || saved === '0') return { lite: saved === '1', source: 'storage', reason: saved === '1' ? '已选择极速模式' : '已选择完整模式' } } catch {}
  const conn = nav.connection || {}
  if (conn.saveData) return { lite: true, source: 'auto', reason: '浏览器开启了省流量' }
  if (SLOW_NET.has(conn.effectiveType)) return { lite: true, source: 'auto', reason: `网络较慢（${conn.effectiveType}）` }
  if (nav.deviceMemory > 0 && nav.deviceMemory <= 4) return { lite: true, source: 'auto', reason: `设备内存 ${nav.deviceMemory} GB` }
  if (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return { lite: true, source: 'auto', reason: `处理器 ${nav.hardwareConcurrency} 核` }
  const shortSide = Math.min(screen.width || Infinity, screen.height || Infinity)
  if (coarsePointer && shortSide <= 820) return { lite: true, source: 'auto', reason: '手机屏幕' }
  return { lite: false, source: 'auto', reason: '设备性能足够' }
}

export function setLitePreference(storage, lite) {
  try { storage?.setItem(LITE_KEY, lite ? '1' : '0'); return true } catch { return false }
}
