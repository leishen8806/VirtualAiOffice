export type { McpToolDefinition, McpCallResult, McpContentText, McpContentImage, McpContent } from '../index.d.ts'
export declare function parseKeys(keys: string): { mods: string[]; key: string | null }
export declare function winVk(key: string): number
export declare const WIN_VK: Readonly<Record<string, number>>
export declare const KEY_ALIASES: Readonly<Record<string, string>>
export declare const MODS: ReadonlySet<string>
export declare const WIN_EXTENDED: ReadonlySet<number>
export declare function desktopToolsList(opts?: { osZh?: string }): import('../index.d.ts').McpToolDefinition[]
export declare function desktopPlatform(opts?: any): any
export declare function createDesktopServer(ctx?: any): Promise<any>
export declare function startDesktopServer(opts?: any): Promise<any>
declare const _default: any
export default _default
