export const PLACE_NAVIGATION = Object.freeze({
  office: Object.freeze({
    id: 'office',
    markerId: 'office-zixu-workshop',
    name: '智序工场·办公室',
    placeHref: '/?place=office',
    workbenchName: 'AI 团队指挥中心',
    workbenchHref: '/command-view.html',
  }),
  dr: Object.freeze({
    id: 'dr',
    markerId: 'dr-logistics-campus',
    name: 'DR 仓配服务中心',
    placeHref: '/?campus=1&place=dr',
    workbenchName: '仓配调度中心',
    workbenchHref: '/dr-console.html',
  }),
})

export function placeNavigation(value) {
  if (value === 'dr' || value === 'dr-logistics-campus') return PLACE_NAVIGATION.dr
  return PLACE_NAVIGATION.office
}

export function currentPlace(locationRef = globalThis.location) {
  const params = new URLSearchParams(locationRef?.search || '')
  if (
    locationRef?.pathname === '/dr-console.html' ||
    params.get('place') === 'dr' ||
    params.get('campus') === '1'
  ) {
    return PLACE_NAVIGATION.dr
  }
  return PLACE_NAVIGATION.office
}

function textNode(documentRef, name, value) {
  const node = documentRef.createElement(name)
  node.textContent = value
  return node
}

function linkNode(documentRef, text, href) {
  const link = textNode(documentRef, 'a', text)
  link.href = href
  return link
}

export function mountPlaceBar({
  config = globalThis.__TOWN_NAV__,
  documentRef = globalThis.document,
  locationRef = globalThis.location,
} = {}) {
  if (config?.enabled !== true || !documentRef?.body) return null
  const existing = documentRef.getElementById('placeBar')
  if (existing) return existing

  const place = currentPlace(locationRef)
  const company = documentRef.body.dataset.company || '–'
  const style = documentRef.createElement('style')
  style.id = 'placeBarStyle'
  style.textContent = `
    #placeBar{position:relative;z-index:1000;display:flex;align-items:center;gap:8px;min-height:34px;padding:5px 14px;border-bottom:1px solid var(--line,rgba(128,128,128,.28));background:var(--surface,var(--panel,rgba(255,255,255,.92)));color:var(--text,#25333f);font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif}
    #placeBar .place-bar-label{color:var(--muted,#667481)}
    #placeBar .place-bar-separator{color:var(--line,rgba(128,128,128,.5))}
    #placeBar a{color:var(--accent,var(--gold,#315e88));text-decoration:none;white-space:nowrap}
    #placeBar a:hover{text-decoration:underline;text-underline-offset:3px}
    #placeBar a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    @media(max-width:640px){#placeBar{align-items:flex-start;flex-wrap:wrap;padding:7px 10px}#placeBar .place-bar-company{flex-basis:100%}}
  `

  const bar = documentRef.createElement('nav')
  bar.id = 'placeBar'
  bar.setAttribute('aria-label', '地点导航')
  const companyLabel = textNode(documentRef, 'span', `当前公司：${company}`)
  companyLabel.className = 'place-bar-label place-bar-company'
  const placeLabel = textNode(documentRef, 'span', `当前地点：${place.name}`)
  placeLabel.className = 'place-bar-label'
  bar.append(
    companyLabel,
    textNode(documentRef, 'span', '｜'),
    placeLabel,
    textNode(documentRef, 'span', '｜'),
    linkNode(documentRef, '返回小镇', '/town.html'),
    textNode(documentRef, 'span', '｜'),
    linkNode(documentRef, place.workbenchName, place.workbenchHref),
  )
  for (const separator of bar.querySelectorAll('span:nth-of-type(even)')) {
    separator.className = 'place-bar-separator'
    separator.setAttribute('aria-hidden', 'true')
  }
  documentRef.head.append(style)
  documentRef.body.prepend(bar)
  return bar
}

if (typeof document !== 'undefined') mountPlaceBar()
