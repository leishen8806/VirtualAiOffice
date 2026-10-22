import { CAMBODIA_CITIES, CAMBODIA_OUTLINE_D, CAMBODIA_ROUTE_PAIRS } from './dr-cambodia-outline.js'

export const MAP_NOTE = Object.freeze({ x: 285, y: 266, width: 217, height: 14 })
export const consoleMapLabels = () => CAMBODIA_CITIES.map(item => Object.freeze({
  id: item.id, x: item.x + item.labelX, y: item.y + item.labelY,
  width: item.name.length * 15, height: 17,
}))

export function campusMapSvg(activeZone = 'ALL') {
  const byId = Object.fromEntries(CAMBODIA_CITIES.map(item => [item.id, item]))
  const routes = CAMBODIA_ROUTE_PAIRS.map(([from, to]) => `<path class="route" d="M${byId[from].x.toFixed(2)} ${byId[from].y.toFixed(2)}L${byId[to].x.toFixed(2)} ${byId[to].y.toFixed(2)}"/>`).join('')
  const nodes = CAMBODIA_CITIES.map(item => `<g class="node${item.id === 'phnom-penh' ? ' active' : ''}" data-city="${item.id}"><circle cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="${item.id === 'phnom-penh' ? 12 : 7}"/><text x="${(item.x + item.labelX).toFixed(2)}" y="${(item.y + item.labelY).toFixed(2)}">${item.name}</text></g>`).join('')
  return `<svg viewBox="0 0 520 270" role="img" aria-label="柬埔寨物流网络示意图" data-campus-filter="${activeZone}"><path class="outline" d="${CAMBODIA_OUTLINE_D}"/>${routes}${nodes}<text class="mapNote" x="${MAP_NOTE.x}" y="${MAP_NOTE.y}">金边起点 · 示意配送目的地 · 模拟轨迹</text></svg>`
}
