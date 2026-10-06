export type McpToolCall = { readonly name: string; readonly args?: Readonly<Record<string, unknown>> }
export type McpToolDefinition = {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: Readonly<Record<string, unknown>>
}
export type McpContentText = { type: 'text'; text: string }
export type McpContentImage = { type: 'image'; data: string; mimeType: 'image/png' | 'image/jpeg' | string }
export type McpContent = McpContentText | McpContentImage
export type McpCallResult = {
  readonly content?: readonly McpContent[]
  readonly isError?: boolean
}

export type ToolOrigin =
  | { readonly kind: 'builtin' }
  | { readonly kind: 'config' }
  | { readonly kind: 'discovered'; readonly host?: 'claude-code' | 'codex' }

export type ToolDefinition = {
  readonly id: string
  readonly name?: string
  readonly title: string
  readonly description: string
  readonly server: string
  readonly command?: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly requires: readonly ('vision' | 'mcp')[]
  readonly readOnlySafe: boolean
  readonly takesOver: boolean
  readonly exclusive: boolean
  readonly origin: ToolOrigin
  readonly hostBound: readonly string[]
  readonly keywords: readonly string[]
  readonly portable: boolean
  readonly vision: boolean
  readonly enabled: boolean
  readonly source: string
}

export type ResolvedToolSpec = {
  readonly id: string
  readonly server: string
  readonly title: string
  readonly description: string
  readonly delivery: 'inject' | 'preloaded'
  readonly command?: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly requires: readonly ('vision' | 'mcp')[]
  readonly readOnlySafe: boolean
  readonly takesOver: boolean
  readonly exclusive: boolean
  readonly hostBinding: { readonly hostBound: readonly string[] }
}

export type ToolFailureCode =
  | 'TOOL_NOT_FOUND'
  | 'TOOL_NOT_AUTHORIZED'
  | 'TOOL_NOT_SUPPORTED'
  | 'TOOL_ENV_MISSING'
  | 'TOOL_REQUIRES_VISION'
  | 'TOOL_NOT_READ_ONLY_SAFE'
  | 'TOOL_START_FAILED'

export type ToolResolutionFailure = {
  readonly grantId: string
  readonly code: ToolFailureCode
  readonly detail?: string
}

export type ToolResolution =
  | { readonly ok: true; readonly tools: readonly ResolvedToolSpec[] }
  | { readonly ok: false; readonly failures: readonly ToolResolutionFailure[] }

export type ToolGrant = { readonly id: string }

export type ToolGroupLike = {
  readonly type: 'claude-cli' | 'codex-cli' | 'openai-api' | string
  readonly cfg?: { readonly vision?: boolean }
}

export interface ToolResolverLike {
  resolve(grants: readonly ToolGrant[], context?: unknown): ToolResolution
}

export type PlaywrightPinnedVersionSpec = {
  readonly version: string
  readonly spec: string
}

export type BuiltinBrowser = ToolDefinition & { readonly id: 'browser' }
export type BuiltinDesktopControl = ToolDefinition & { readonly id: 'desktop-control' }

export type LegacyBuiltins = {
  readonly browser: Readonly<ToolDefinition & { readonly name?: string }>
  readonly desktop: Readonly<ToolDefinition & { readonly name?: string }>
}

export type CoreBuiltins = {
  readonly browser: BuiltinBrowser
  readonly 'desktop-control': BuiltinDesktopControl
}

export const LEGACY_COMPATIBILITY_IDENTIFIER: {
  readonly servers: {
    readonly niuma_browser: string
    readonly niuma_desktop: string
  }
  readonly ids: {
    readonly desktop: 'desktop'
  }
}

export const FUTURE_NEUTRAL: {
  readonly ids: {
    readonly browser: 'browser'
    readonly desktopControl: 'desktop-control'
  }
  readonly servers: {
    readonly vao_browser: string
    readonly vao_desktop: string
  }
}

export const ALL_TYPES: readonly string[]

export interface McpDesktopServerHandle {
  readonly platform: string
  readonly osZh: string
  readonly maxWidth: number
  readonly backend: unknown | null
  readonly constants: Record<string, unknown>
  readonly runners: ReadonlyArray<McpToolDefinition & { readonly run: (a: unknown) => Promise<McpCallResult> }>
  readonly parseKeys: (keys: string) => { readonly mods: readonly string[]; readonly key: string | null }
  readonly winVk: (key: string) => number
  readonly toolsList: () => readonly McpToolDefinition[]
  readonly handleRequest: (msg: unknown, stdoutOverride?: NodeJS.WritableStream) => Promise<void>
  readonly handleStdioLine: (line: string, stdoutOverride?: NodeJS.WritableStream) => Promise<void>
}

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
export function desktopToolsList(options?: { readonly osZh?: string }): readonly McpToolDefinition[]
export function desktopPlatform(options?: { readonly envPlatform?: string }): string

export const desktopMcp: unknown
declare const _default: unknown
export default _default

export const WIN_VK: Readonly<Record<string, number>>
export const KEY_ALIASES: Readonly<Record<string, string>>
export const MODS: ReadonlySet<string>
export const WIN_EXTENDED: ReadonlySet<number>

export const PLAYWRIGHT_MCP_PINNED_VERSION: string
export const PLAYWRIGHT_MCP_PINNED_SPEC: string

export function claudeServers(workdir?: string, home?: string): Record<string, unknown>
export function codexServers(home?: string): Record<string, unknown>
export const stdio: (def: unknown) => boolean

export function coreBuiltins(options?: { readonly outputDir?: string; readonly desktopScript?: string }): CoreBuiltins
export function legacyBuiltins(options?: { readonly outputDir?: string; readonly desktopScript?: string }): LegacyBuiltins
export function builtinTools(options?: { readonly outputDir?: string; readonly desktopScript?: string }): LegacyBuiltins

export function normalizeToolDefinition(def: Partial<ToolDefinition> & { readonly id?: string; readonly name?: string }): ToolDefinition | null
export function capabilitySupportsTool(group: ToolGroupLike, def: ToolDefinition & { readonly types?: readonly string[]; readonly native?: readonly string[] }): boolean

export class ToolRegistry {
  constructor(options?: { readonly aliases?: Readonly<Record<string, string>> })
  add(def: Partial<ToolDefinition> & { readonly id: string; readonly name?: string }): ToolDefinition | null
  list(predicate?: ((d: ToolDefinition) => boolean) | null): readonly ToolDefinition[]
  get(id: string): ToolDefinition | null
}

export class ToolPolicy {
  constructor(options?: unknown)
  authorize(def: ToolDefinition, context?: { readonly autonomy?: 'safe' | string; readonly readOnly?: boolean }): boolean
}

export function authorizeToolDefinitionAuthorize(def: ToolDefinition, context?: { readonly autonomy?: 'safe' | string; readonly readOnly?: boolean }): boolean

export function resolveGrantsSimple(grants: readonly ToolGrant[], catalog: { readonly get: (id: string) => ToolDefinition | null }): ToolResolution

export class ToolResolver {
  constructor(options?: { readonly registry?: ToolRegistry })
  resolve(grants: readonly ToolGrant[], context?: unknown): ToolResolution
}

export class ToolCatalog {
  constructor(config?: unknown, ctx?: { readonly workdir?: string; readonly home?: string })
  list(): readonly (ToolDefinition & { readonly name: string; readonly types: readonly string[]; readonly native: readonly string[] })[]
  get(id: string): (ToolDefinition & { readonly name: string; readonly types: readonly string[]; readonly native: readonly string[] }) | null
  resolve(refs: unknown): readonly string[]
  supports(group: ToolGroupLike, id: string): boolean
  guess(text: string): readonly string[]
  spec(id: string): { readonly command: string; readonly args: readonly string[]; readonly env: Readonly<Record<string, string>> } | null
}

export function describeMcpCall(server: string, tool: string, args?: Readonly<Record<string, unknown>>): string
export function splitMcpName(composite: string): { readonly server: string; readonly tool: string }

export function expandEnv(value: string, envOverride?: Readonly<Record<string, string | undefined>>): string
export class MissingEnvError extends Error {
  readonly name: 'MissingEnvError'
  readonly key: string
  constructor(key: string)
}
export function readJson<T = unknown>(filePath: string): T | null
