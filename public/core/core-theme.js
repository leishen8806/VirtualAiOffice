/* 智序 · Core theme (id: core) — frozen design tokens from docs/design/VISUAL_IDENTITY_V2.md §5.1, §5.2, §5.3.
 *
 * Injects CSS variables for both dark + light themes, font stacks, motion tokens,
 * and reduced-motion fallbacks onto :root / html[data-theme-core].
 *
 * Compatibility note:
 * - Legacy NiumaSkin CSS variable names (--bg / --panel / --ink) are ALIASED so
 *   legacy 经典主题 and existing non-core code do not break.
 * - New V2 identifiers use the --canvas-* / --orchestrator / state tokens from spec.
 */
;(function () {
  'use strict'

  const THEME_ID = 'core'
  const DISPLAY = { zh: '智序 · Core', en: 'Core' }

  const TOKENS = {
    dark: {
      '--bg': '#0E1624',
      '--panel': '#151F32',
      '--panel-2': '#1B2740',
      '--line': '#2A3856',
      '--text': '#E8EEF9',
      '--text-muted': '#9AA8C2',
      '--canvas-floor': '#101A2C',
      '--canvas-grid': '#1C2A45',
      '--accent': '#4C8DFF',
      '--on-accent': '#0B1220',
      '--orchestrator': '#8F82FF',
      '--idle': '#9AA8C2',
      '--thinking': '#38D6E0',
      '--working': '#4C8DFF',
      '--reviewing': '#A58BFF',
      '--waiting-human': '#FFB020',
      '--blocked': '#FF5D5D',
      '--done': '#35D39A',
      '--offline': '#6B7A96',
      '--shadow-1': '0 1px 2px rgba(0,0,0,.35)',
      '--shadow-2': '0 4px 12px rgba(0,0,0,.45)',
    },
    light: {
      '--bg': '#F5F7FB',
      '--panel': '#FFFFFF',
      '--panel-2': '#EEF2F9',
      '--line': '#D5DCEA',
      '--text': '#142033',
      '--text-muted': '#52617D',
      '--canvas-floor': '#E4EAF5',
      '--canvas-grid': '#CBD5E8',
      '--accent': '#2A64DB',
      '--on-accent': '#FFFFFF',
      '--orchestrator': '#5B47D6',
      '--idle': '#52617D',
      '--thinking': '#0A7F8A',
      '--working': '#2A64DB',
      '--reviewing': '#6A4FD6',
      '--waiting-human': '#9A5B00',
      '--blocked': '#C93636',
      '--done': '#0B7A53',
      '--offline': '#5E6E8A',
      '--shadow-1': '0 1px 2px rgba(20,32,51,.08)',
      '--shadow-2': '0 4px 14px rgba(20,32,51,.12)',
    },
    motion: {
      '--dur-fast': '120ms',
      '--dur-base': '200ms',
      '--dur-slow': '320ms',
      '--ease': 'cubic-bezier(.2,.8,.2,1)',
    },
    radius: {
      '--radius-panel': '12px',
      '--radius-control': '8px',
      '--radius-pill': '999px',
    },
    roleColor: {
      '--role-helix': 'var(--orchestrator)',
      '--role-product': '#F0B37E',
      '--role-architect': '#5ED0C9',
      '--role-frontend': '#F2788F',
      '--role-backend': '#8BC34A',
      '--role-qa': '#F2C94C',
      '--role-reviewer': '#C9A27E',
      '--role-docs': '#A6B4C8',
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
    return Object.entries(TOKENS.roleColor).map(([k, v]) => `${k}:${v};`).join('')
  }

  function fontCss() {
    return Object.entries(TOKENS.font).map(([k, v]) => `--${k}:${v};`).join('')
  }

  function motionCss(block) {
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
  ${fontCss()}
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
html[data-theme-core] .panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
}
html[data-theme-core] .pill {
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  font-size: 12px;
  line-height: 16px;
}
@media (prefers-color-scheme: light) {
  html[data-theme-core]:not([data-appearance]) { color-scheme: light; ${surfaceCss('light')} }
}
@media (prefers-reduced-motion: reduce) {
  html[data-theme-core],
  html[data-theme-core] * { transition-duration: 1ms !important; animation: none !important; }
  html[data-theme-core] .pulse::after,
  html[data-theme-core] .spin,
  html[data-theme-core] [data-anim] { animation: none !important; }
  html[data-theme-core] .reduced-motion-hidden { display: none !important; }
}
html[data-theme-core] .state-idle    { color: var(--idle); }
html[data-theme-core] .state-thinking{ color: var(--thinking); }
html[data-theme-core] .state-working { color: var(--working); }
html[data-theme-core] .state-reviewing{ color: var(--reviewing); }
html[data-theme-core] .state-waiting-human { color: var(--waiting-human); }
html[data-theme-core] .state-blocked { color: var(--blocked); }
html[data-theme-core] .state-done    { color: var(--done); }
html[data-theme-core] .state-offline { color: var(--offline); }

/* Legacy 经典主题 aliases: keep old renderers functional when Core is current theme. */
html[data-theme-core] {
  --ink: var(--text);
  --muted: var(--text-muted);
  --edge: var(--line);
  --drop: var(--shadow-2);
  --ok: var(--done);
  --warn: var(--waiting-human);
  --bad: var(--blocked);
}

/* V2 shell layout tokens */
html[data-theme-core] {
  --shell-bar-h: 48px;
  --shell-rail-w: 192px;
  --shell-helix-w: 312px;
  --shell-zone-gap: 8px;
}
@media (max-width: 1024px) {
  html[data-theme-core] { --shell-rail-w: 0px; --shell-helix-w: 300px; }
}
@media (max-width: 640px) {
  html[data-theme-core] { --shell-bar-h: 56px; --shell-helix-w: 0px; }
}
`

  function inject() {
    const id = 'core-theme-style'
    if (document.getElementById(id)) return
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
    // Used by shim layer: NiumaSkin.set(mappedCore) on classic theme switch.
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
