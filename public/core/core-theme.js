/* 智序 · Core theme (id: core) — Interactive Office A2 red: warm neutrals + cool graphite.
 *
 * Visual spec: VISUAL QUALITY §13 — warm neutral office surfaces, cool graphite structure,
 * restrained indigo-violet Helix accents, material elevation over bordered rectangles.
 *
 * Responsive shell widths (§10 NAV + §9 HELIX PANEL):
 *   --shell-rail-w: 192px (standardized per project memory, within 184-200 spec)
 *   --shell-helix-w-compact: 280px (default, §9)
 *   --shell-helix-w-expanded: 392px (360-420 range, §9)
 *   --shell-helix-w-collapsed: 68px (§9: 64-72 rail)
 *
 * Compat: Legacy NiumaSkin var aliases preserved (--bg / --panel / --ink).
 */
;(function () {
  'use strict'

  const THEME_ID = 'core'
  const DISPLAY = { zh: '智序 · Core', en: 'Core' }

  const TOKENS = {
    dark: {
      // Cool graphite structural surfaces (elevations, structural members, glass frames)
      '--bg': '#0F141B',
      '--panel': '#151B24',
      '--panel-2': '#1A212C',
      '--line': '#2A3444',
      '--text': '#E9ECF2',
      '--text-muted': '#8E98AA',
      // Warm neutral office floor / desk (wood tones, felt inserts, fabric panels)
      '--canvas-floor': '#171C24',
      '--canvas-floor-warm': '#1C2028',
      '--canvas-desk': '#232A36',
      '--canvas-grid': '#26303E',
      '--glass': 'rgba(220, 230, 255, 0.05)',
      '--wood': '#2A2620',
      '--felt': '#2F2834',
      // Accents: restrained indigo-violet for Helix
      '--accent': '#5F84FF',
      '--on-accent': '#0B1220',
      '--orchestrator': '#7966FF',
      '--helix-indigo': '#6A57E6',
      '--helix-violet': '#A578FF',
      // Canonical states
      '--idle': '#8E98AA',
      '--thinking': '#3FB8C0',
      '--working': '#5F84FF',
      '--reviewing': '#8A6CFF',
      '--waiting-human': '#F2A43A',
      '--blocked': '#EF5A5A',
      '--done': '#2DC08D',
      '--offline': '#586478',
      // Elevation (material change, not borders)
      '--shadow-1': '0 1px 0 rgba(255,255,255,.03), 0 1px 3px rgba(0,0,0,.35)',
      '--shadow-2': '0 6px 22px rgba(0,0,0,.48), 0 2px 6px rgba(0,0,0,.25)',
      '--shadow-soft': '0 2px 8px rgba(0,0,0,.22)',
      // Ambient glows (§12: monitor screen glow, subtle LEDs)
      '--glow-monitor': 'rgba(110, 140, 255, 0.10)',
      '--glow-helix': 'rgba(121, 102, 255, 0.14)',
      '--glow-amber': 'rgba(242, 164, 58, 0.12)',
    },
    light: {
      // Warm neutral office (light surfaces, paper, painted drywall)
      '--bg': '#F6F3EE',
      '--panel': '#FFFFFF',
      '--panel-2': '#F4F0EA',
      '--line': '#D8D1C5',
      '--text': '#1E2633',
      '--text-muted': '#5A6578',
      // Floor / desk material (warm oak laminate, neutral area rug, felt pinup)
      '--canvas-floor': '#EFE9DD',
      '--canvas-floor-warm': '#E8DFCE',
      '--canvas-desk': '#F7F3EB',
      '--canvas-grid': '#D7CEBF',
      '--glass': 'rgba(40, 70, 130, 0.04)',
      '--wood': '#D8B98E',
      '--felt': '#CDBFB1',
      // Restrained indigo-violet Helix accents (§13)
      '--accent': '#2C58D6',
      '--on-accent': '#FFFFFF',
      '--orchestrator': '#5540CF',
      '--helix-indigo': '#4D39C7',
      '--helix-violet': '#8A55E6',
      // Canonical states
      '--idle': '#5A6578',
      '--thinking': '#0C757D',
      '--working': '#2C58D6',
      '--reviewing': '#6347D6',
      '--waiting-human': '#B46A00',
      '--blocked': '#C53232',
      '--done': '#0B7A53',
      '--offline': '#637086',
      // Elevation
      '--shadow-1': '0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(30,38,51,.08)',
      '--shadow-2': '0 10px 28px rgba(30,38,51,.14), 0 2px 6px rgba(30,38,51,.08)',
      '--shadow-soft': '0 2px 6px rgba(30,38,51,.08)',
      '--glow-monitor': 'rgba(70, 110, 255, 0.07)',
      '--glow-helix': 'rgba(85, 64, 207, 0.10)',
      '--glow-amber': 'rgba(180, 106, 0, 0.08)',
    },
    motion: {
      '--dur-fast': '140ms',
      '--dur-base': '260ms',
      '--dur-slow': '420ms',
      '--dur-ambient': '3.2s',
      '--ease': 'cubic-bezier(.2,.8,.2,1)',
      '--ease-out': 'cubic-bezier(.16,1,.3,1)',
    },
    radius: {
      '--radius-panel': '14px',
      '--radius-control': '9px',
      '--radius-pill': '999px',
      '--radius-desk': '10px',
      '--radius-workstation': '16px',
    },
    roleColor: {
      '--role-helix': 'var(--orchestrator)',
      '--role-product': '#D48F4A',
      '--role-architect': '#3EA8A0',
      '--role-frontend': '#D95F78',
      '--role-backend': '#6DAA33',
      '--role-qa': '#D9A22B',
      '--role-reviewer': '#A97C4B',
      '--role-docs': '#8A98AE',
    },
    roleIdIndex: {
      helix: 0, product: 1, architect: 2, frontend: 3, backend: 4, qa: 5, reviewer: 6, docs: 7,
    },
    font: {
      sansZh: '"PingFang SC", "Microsoft YaHei UI", "Noto Sans SC", system-ui, sans-serif',
      sans: 'Inter, system-ui, "Segoe UI", sans-serif',
      mono: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
    },
  }

  function roleCss() {
    return Object.entries(TOKENS.roleColor).map(([k, v]) => `--role-${k}:${v};`).join('')
  }
  function motionCss() {
    return Object.entries(TOKENS.motion).map(([k, v]) => `${k}:${v};`).join('') +
      Object.entries(TOKENS.radius).map(([k, v]) => `${k}:${v};`).join('')
  }
  function surfaceCss(variant) {
    const t = TOKENS[variant]
    return Object.entries(t).map(([k, v]) => `${k}:${v};`).join('')
  }

  const CSS = `
:root, html[data-theme-core] {
  color-scheme: dark light;
  font-family: ${TOKENS.font.sansZh}, ${TOKENS.font.sans};
  --core-theme-id: ${THEME_ID};
  ${roleCss()}
  ${motionCss()}
}
html[data-theme-core] { color-scheme: dark; ${surfaceCss('dark')} }
html[data-theme-core][data-pref-color-scheme="light"],
html[data-theme-core][data-appearance="light"] { color-scheme: light; ${surfaceCss('light')} }
html[data-theme-core] body,
body.v2-core-shell {
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 22px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
html[data-theme-core] code,
html[data-theme-core] .mono,
html[data-theme-core] .task-id,
html[data-theme-core] .sha {
  font-family: ${TOKENS.font.mono};
  font-variant-numeric: tabular-nums;
}
/* §13 VISUAL QUALITY: use elevation / material changes, not borders around everything */
html[data-theme-core] .panel {
  background: var(--panel);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  border: 1px solid var(--line);
}
html[data-theme-core] .pill {
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  font-size: 12px;
  line-height: 16px;
}
html[data-theme-core] .material-elevation-1 { box-shadow: var(--shadow-1); }
html[data-theme-core] .material-elevation-2 { box-shadow: var(--shadow-2); }
html[data-theme-core] .material-glass { background: var(--glass); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }

@supports not (backdrop-filter: blur(1px)) {
  html[data-theme-core] .material-glass { background: color-mix(in srgb, var(--panel) 85%, transparent); }
}

@media (prefers-color-scheme: light) {
  html[data-theme-core]:not([data-appearance]) { color-scheme: light; ${surfaceCss('light')} }
}

/* §5 CHARACTER MOTION — reduced-motion enforcement (§5-7 animation must respect) */
@media (prefers-reduced-motion: reduce) {
  html[data-theme-core],
  html[data-theme-core] * {
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
  html[data-theme-core] .pulse::after,
  html[data-theme-core] .spin,
  html[data-theme-core] [data-anim] { animation: none !important; }
  html[data-theme-core] .reduced-motion-hidden,
  html[data-theme-core] [class*="ambient-"] { display: none !important; }
  html[data-theme-core] .person-breath,
  html[data-theme-core] .person-typing,
  html[data-theme-core] .idle-glance,
  html[data-theme-core] .led-blink { animation: none !important; transform: none !important; }
}

html[data-theme-core] .state-idle    { color: var(--idle); }
html[data-theme-core] .state-thinking{ color: var(--thinking); }
html[data-theme-core] .state-working { color: var(--working); }
html[data-theme-core] .state-reviewing{ color: var(--reviewing); }
html[data-theme-core] .state-waiting-human { color: var(--waiting-human); }
html[data-theme-core] .state-blocked { color: var(--blocked); }
html[data-theme-core] .state-done    { color: var(--done); }
html[data-theme-core] .state-offline { color: var(--offline); }

/* Legacy 经典主题 aliases */
html[data-theme-core] {
  --ink: var(--text);
  --muted: var(--text-muted);
  --edge: var(--line);
  --drop: var(--shadow-2);
  --ok: var(--done);
  --warn: var(--waiting-human);
  --bad: var(--blocked);
}

/* V2 shell widths — §10 NAV + §9 HELIX PANEL (collapsed/compact/expanded tri-state) */
html[data-theme-core] {
  --shell-bar-h: 48px;
  --shell-rail-w: 192px;           /* Nav §10: 168-184px min → 192 project-memory standard */
  --shell-helix-w-compact: 280px;  /* Helix §9 default compact */
  --shell-helix-w-expanded: 392px; /* Helix §9 click expand: 360-420px target */
  --shell-helix-w-collapsed: 68px; /* Helix §9 collapsed rail: 64-72px */
  --shell-helix-w: var(--shell-helix-w-compact); /* initial: compact per §9 */
  --shell-zone-gap: 6px;
}
/* Helix panel class overrides: .helix-is-collapsed / .helix-is-expanded on body */
html[data-theme-core] body.helix-is-collapsed { --shell-helix-w: var(--shell-helix-w-collapsed); }
html[data-theme-core] body.helix-is-expanded  { --shell-helix-w: var(--shell-helix-w-expanded); }

@media (max-width: 1024px) {
  html[data-theme-core] { --shell-rail-w: 0px; --shell-helix-w: 0px; }
  html[data-theme-core] body.helix-is-expanded { --shell-helix-w: min(92vw, 360px); }
}
@media (max-width: 640px) {
  html[data-theme-core] { --shell-bar-h: 56px; --shell-helix-w: 0px; }
}

/* Inspector popovers (§8 CLICK INTERACTIONS): Role Inspector + Task Inspector */
html[data-theme-core] .inspector-pop {
  position: fixed;
  z-index: 60;
  min-width: 300px;
  max-width: min(420px, 92vw);
  max-height: min(78vh, 640px);
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-2);
  padding: 14px 14px 16px;
  display: grid;
  gap: 10px;
  animation: inspector-in var(--dur-base) var(--ease-out);
}
@keyframes inspector-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
html[data-theme-core] .inspector-pop .close-x {
  position: absolute; right: 8px; top: 8px;
  width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--panel-2); color: var(--text-muted); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; font-weight: 700;
}
html[data-theme-core] .inspector-pop .close-x:hover { color: var(--text); border-color: var(--accent); }
html[data-theme-core] .inspector-pop h2 {
  margin: 0; font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: .01em;
  display: flex; align-items: center; gap: 8px;
}
html[data-theme-core] .inspector-pop .kv {
  display: grid; grid-template-columns: 92px 1fr; gap: 4px 10px;
  padding-top: 2px; border-top: 1px dashed var(--line);
}
html[data-theme-core] .inspector-pop .kv .k { color: var(--text-muted); font-size: 11px; line-height: 18px; }
html[data-theme-core] .inspector-pop .kv .v { color: var(--text); font-size: 12.5px; line-height: 18px; }
html[data-theme-core] .inspector-pop .section-title {
  font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--text-muted); margin: 4px 0 2px;
}
html[data-theme-core] .inspector-pop ul.list {
  margin: 0; padding-left: 18px; display: grid; gap: 3px;
}
html[data-theme-core] .inspector-pop ul.list li { font-size: 12px; line-height: 17px; color: var(--text); }

/* Ambient office (§12) — subtle: monitor glow, LED blink, slow light drift */
html[data-theme-core] .ambient-floor {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background:
    radial-gradient(1200px 700px at 50% 55%, var(--glow-helix) 0%, transparent 58%),
    radial-gradient(600px 420px at 15% 30%, var(--glow-monitor) 0%, transparent 70%),
    radial-gradient(600px 420px at 85% 30%, var(--glow-monitor) 0%, transparent 70%),
    radial-gradient(600px 420px at 70% 75%, var(--glow-amber) 0%, transparent 75%);
  animation: ambient-drift 14s ease-in-out infinite alternate;
  opacity: .9;
}
@keyframes ambient-drift {
  0%   { transform: translate3d(0,0,0) scale(1); }
  50%  { transform: translate3d(-1%, -0.5%, 0) scale(1.01); }
  100% { transform: translate3d(1%, 0.5%, 0) scale(0.995); }
}
html[data-theme-core] .led-blink { animation: led-blink 2.1s ease-in-out infinite; transform-origin: center; }
@keyframes led-blink {
  0%, 100% { opacity: .3; }
  50%      { opacity: 1; }
}
html[data-theme-core] .person-breath { animation: breath 3.8s ease-in-out infinite; transform-origin: 50% 95%; }
@keyframes breath {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.008) translateY(-0.4px); }
}
html[data-theme-core] .idle-glance { animation: glance 5.5s ease-in-out infinite; transform-origin: 50% 50%; }
@keyframes glance {
  0%, 92%, 100% { transform: translateX(0); }
  95%           { transform: translateX(1px); }
}
html[data-theme-core] .person-typing .hands { animation: typing 340ms ease-in-out infinite; transform-origin: 50% 90%; }
@keyframes typing {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-1.4px); }
}

/* WAITING_HUMAN connection pulse §5 / §6 */
html[data-theme-core] .path-waiting-human {
  stroke: var(--waiting-human); stroke-width: 2; fill: none;
  stroke-dasharray: 6 6; opacity: .75;
  animation: dash-flow 1.4s linear infinite;
}
@keyframes dash-flow {
  to { stroke-dashoffset: -24; }
}
html[data-theme-core] .ring-anim { transform-origin: center; animation: ring-rot 4.4s linear infinite; }
@keyframes ring-rot { to { transform: rotate(360deg); } }
`

  function inject() {
    const id = 'core-theme-style'
    const old = document.getElementById(id)
    if (old) {
      old.textContent = CSS
      return
    }
    const el = document.createElement('style')
    el.id = id
    el.setAttribute('data-core-theme', THEME_ID)
    el.textContent = CSS
    document.head.appendChild(el)
  }

  function setAppearance(kind) {
    if (!document.documentElement.hasAttribute('data-theme-core')) document.documentElement.setAttribute('data-theme-core', THEME_ID)
    if (kind === 'dark' || kind === 'light') {
      document.documentElement.setAttribute('data-appearance', kind)
    } else if (kind === 'system') {
      document.documentElement.removeAttribute('data-appearance')
    }
  }

  function toClassicVarMap() {
    return { coreId: THEME_ID, display: DISPLAY, tokens: TOKENS }
  }

  const api = {
    THEME_ID,
    DISPLAY,
    TOKENS,
    inject,
    setAppearance,
    toClassicVarMap,
  }

  globalThis.VAOCoreTheme = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
