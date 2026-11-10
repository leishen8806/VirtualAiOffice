const STYLE_ID = 'dr-loading-shared-style'

export function installLoadingStyles(documentRef = document) {
  if (documentRef.getElementById(STYLE_ID)) return
  const style = documentRef.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #loading, .town3d-loader { background: radial-gradient(circle at 50% 35%, #26323a, #0b1116 78%); color:#f4ead7; }
    #loading .bar, .town3d-loader progress { accent-color:#d8b56a; }
    #loading.done, .town3d-loader.is-leaving { opacity:0; pointer-events:none; transition:opacity .6s ease; }
    .town3d-loader-card { border:1px solid rgba(216,181,106,.45); box-shadow:0 20px 60px rgba(0,0,0,.28); }
  `
  documentRef.head.appendChild(style)
}

export function setLoading(text, progress) {
  const textEl = document.getElementById('loadText') || document.getElementById('town3dLoaderStep')
  if (textEl) textEl.textContent = text
  const bar = document.getElementById('loadBar')
  if (bar && progress !== undefined) bar.style.width = `${Math.round(progress * 100)}%`
  const progressEl = document.getElementById('town3dLoaderProgress')
  if (progressEl && progress !== undefined) progressEl.value = Math.round(progress * 100)
}

export function finishLoading({ reduceMotion = false, pushCamera } = {}) {
  const root = document.getElementById('loading') || document.getElementById('town3dLoader')
  if (!root) return
  root.classList.add('done')
  root.classList.add('is-leaving')
  if (typeof pushCamera === 'function' && !reduceMotion) pushCamera(1800)
  setTimeout(() => root.remove(), 650)
}

installLoadingStyles()
