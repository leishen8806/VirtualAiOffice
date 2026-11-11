export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function chooseOfficeR1InspectorRect({ viewportWidth, viewportHeight, panelWidth, panelHeight, obstacles = [], margin = 14, gap = 12 }) {
  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin)
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin)
  const clampX = value => Math.min(maxLeft, Math.max(margin, value))
  const clampY = value => Math.min(maxTop, Math.max(margin, value))
  const xs = [
    (viewportWidth - panelWidth) / 2,
    margin,
    maxLeft,
    ...obstacles.flatMap((r) => [r.right + gap, r.left - panelWidth - gap]),
  ].map(clampX)
  const ys = [
    margin,
    (viewportHeight - panelHeight) / 2,
    maxTop,
    ...obstacles.flatMap((r) => [r.bottom + gap, r.top - panelHeight - gap]),
  ].map(clampY)
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
