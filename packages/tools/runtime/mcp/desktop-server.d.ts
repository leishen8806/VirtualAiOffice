export type McpDesktopServerHandle = import('../index.js').McpDesktopServerHandle
export function createDesktopServer(options?: { readonly envPlatform?: string; readonly maxWidth?: number }): McpDesktopServerHandle
export function startDesktopServer(options?: {
  readonly envPlatform?: string
  readonly maxWidth?: number
  readonly stdin?: NodeJS.ReadableStream
  readonly stdout?: NodeJS.WritableStream
  readonly exitOnEnd?: boolean
}): Promise<{ readonly server: McpDesktopServerHandle; readonly close: () => void }>

export function parseKeys(keys: string): { readonly mods: readonly string[]; readonly key: string | null }
export function winVk(key: string): number
export function desktopToolsList(options?: { readonly osZh?: string }): ReadonlyArray<import('../index.js').McpToolDefinition>
export function desktopPlatform(options?: { readonly envPlatform?: string }): string
export const WIN_VK: Readonly<Record<string, number>>
export const KEY_ALIASES: Readonly<Record<string, string>>
export const MODS: ReadonlySet<string>
export const WIN_EXTENDED: ReadonlySet<number>
