export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function chooseOfficeR1InspectorRect({ viewportWidth, viewportHeight, panelWidth, panelHeight, obstacles = [], margin = 14, gap = 12 }) {
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin)
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin)
  const xs = [margin, maxLeft, ...obstacles.map((r) => Math.min(maxLeft, Math.max(margin, r.right + gap)))]
  const ys = [76, maxTop, ...obstacles.map((r) => Math.min(maxTop, Math.max(76, r.bottom + gap)))]
  const seen = new Set()
  for (const left of xs) for (const top of ys) {
    const key = `${left}|${top}`
    if (seen.has(key)) continue
    seen.add(key)
    const candidate = { left, top, right: left + panelWidth, bottom: top + panelHeight }
    if (obstacles.every((obstacle) => !rectsOverlap(candidate, obstacle))) return candidate
  }
  return { left: margin, top: maxTop, right: margin + panelWidth, bottom: maxTop + panelHeight }
}
