export interface McpToolCall {
  id: string
  name: string
  arguments?: Record<string, any>
}
export interface McpToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, any>>
}
export interface McpContentText {
  readonly type: 'text'
  readonly text: string
}
export interface McpContentImage {
  readonly type: 'image'
  readonly data: string
  readonly mimeType: string
}
export type McpContent = McpContentText | McpContentImage
export interface McpCallResult {
  readonly content: McpContent[]
  readonly isError?: boolean
}
export interface BuiltinToolSpec {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly keywords: readonly string[]
  readonly server: string
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly native: readonly string[]
  readonly types: readonly string[]
  readonly vision: boolean
  readonly takesOver: boolean
  readonly source: 'builtin' | 'config' | 'installed'
}
export interface ToolSpec {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly keywords: readonly string[]
  readonly server: string
  readonly command?: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly native: readonly string[]
  readonly types: readonly string[]
  readonly vision: boolean
  readonly takesOver: boolean
  readonly source: 'builtin' | 'config' | 'installed'
}
export interface ResolvedToolSpec {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}
export interface ToolGroupLike {
  readonly type: string
  readonly cfg?: Readonly<Record<string, any>>
}
export declare function builtinTools(): Record<string, BuiltinToolSpec & Record<string, any>>
export declare function builtinToolsRaw(): Record<string, BuiltinToolSpec & Record<string, any>>
export declare function npx(pkg: string, extra?: readonly string[]): { command: string; args: readonly string[] }
export declare function claudeServers(workdir: string, home?: string): Record<string, any>
export declare function codexServers(home?: string): Record<string, any>
export declare const stdio: (def: any) => boolean
export declare const WIN_VK: Readonly<Record<string, number>>
export declare const KEY_ALIASES: Readonly<Record<string, string>>
export declare const MODS: ReadonlySet<string>
export declare const WIN_EXTENDED: ReadonlySet<number>
export declare function parseKeys(keys: string): { mods: string[]; key: string | null }
export declare function winVk(key: string): number
export declare function desktopToolsList(opts?: { osZh?: string }): McpToolDefinition[]
export declare function desktopPlatform(opts?: any): any
export declare function createDesktopServer(ctx?: any): Promise<{
  readonly platformSetup: any
  readonly TOOLS: McpToolDefinition[]
  readonly backend: any
  readonly handle: (writeJson: (obj: any) => void, msg: any) => Promise<void>
}>
export declare function startDesktopServer(opts?: any): Promise<any>
export declare function describeMcpCall(server: string, tool: string, args: any): string
export declare function splitMcpName(name: string): { server: string; tool: string }
export declare class ToolCatalog {
  constructor(config?: Readonly<Record<string, any>>, opts?: { workdir?: string; home?: string })
  list(): readonly ToolSpec[]
  get(id: string): ToolSpec | null
  resolve(refs: string | readonly string[]): string[]
  supports(group: ToolGroupLike, id: string): boolean
  guess(text: string): string[]
  spec(id: string): ResolvedToolSpec | null
}
