// 周边回波只作附近雨区提示，不能代表定位点正在下雨。
export function rainLevel([r, g, b, a]) {
  if (!a) return 0
  if (a < 200) return 1
  if (r >= 230) return g < 110 ? 5 : 4
  if (r === 0) return g < 120 ? 4 : 3
  return 2
}
export function sampleRadar(png, px, py) {
  let wet = 0, total = 0
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const x = px + dx, y = py + dy
    if (x < 0 || y < 0 || x > 255 || y > 255) continue
    total++
    if (rainLevel(png.pixel(x, y)) >= 2) wet++
  }
  return { level: rainLevel(png.pixel(px, py)), nearby: total ? wet / total : 0 }
}
