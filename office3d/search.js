const text = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function searchGroups(query, groups, { maxPerGroup = 6, maxTotal = 24 } = {}) {
  const q = text(query)
  const terms = q ? q.split(' ').filter(Boolean) : []
  let total = 0
  return groups.map((group) => {
    const items = (group.items || []).map((item, index) => {
      const id = text(item.id)
      const title = text(item.title || item.label)
      const searchableId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(item.id) ? '' : item.id
      const haystack = text([searchableId, item.title, item.label, item.search].filter(Boolean).join(' '))
      if (!terms.length) return { item, score: 0, index }
      if (!terms.every((term) => haystack.includes(term))) return null
      let score = 1
      if (id && (id === q || id === `cmp-${q}`)) score += 300
      if (title.startsWith(q)) score += 200
      if (id.startsWith(q)) score += 120
      return { item, score, index }
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, maxPerGroup)
    const allowed = Math.max(0, Math.min(items.length, maxTotal - total))
    total += allowed
    return { ...group, items: items.slice(0, allowed).map((x) => x.item) }
  }).filter((group) => group.items.length)
}

export function recentGroups(groups, recent, { maxPerGroup = 6, maxTotal = 24 } = {}) {
  const keys = new Set((recent || []).map((x) => `${x.kind}:${x.id}`))
  const recentItems = []
  for (const group of groups) for (const item of group.items || []) if (keys.has(`${item.kind}:${item.id}`)) recentItems.push(item)
  return searchGroups('', [{ key: 'recent', label: '最近打开', items: recentItems }], { maxPerGroup, maxTotal })
}
