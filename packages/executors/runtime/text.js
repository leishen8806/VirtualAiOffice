export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export function truncate(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
export function firstLine(s, n = 80) { const line = String(s ?? '').trim().split('\n').find((l) => l.trim()) || ''; return truncate(line.replace(/\*\*|`/g, '').replace(/^[#>\s]+/, '').trim(), n) }
export function fillEnv(value) { return typeof value === 'string' ? value.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '') : value }
