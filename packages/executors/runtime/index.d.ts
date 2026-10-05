export class BaseWorker {
  constructor(group: Record<string, any>, context: Record<string, any>)
  workdir: string
  run(options: Record<string, any>): Promise<Record<string, any>>
}
export class ClaudeCliWorker extends BaseWorker {}
export class CodexCliWorker extends BaseWorker {}
export class OpenAIWorker extends BaseWorker {}
export class Toolbox { constructor(workdir: string, options?: Record<string, any>) }
export class McpClient { constructor(name: string, options?: Record<string, any>) }
export const TOOLS: readonly any[]
export const WORKER_TYPES: Record<string, typeof BaseWorker>
export function createClaudeParser(workdir?: string): any
export function createCodexParser(workdir?: string): any
export function describeClaudeTool(name: string, input?: Record<string, any>, workdir?: string): string
export function describeTool(name: string, input?: Record<string, any>): string
export function describeMcpCall(server: string, tool: string, args?: Record<string, any>): string
export function shortPath(value: string, workdir?: string): string
export function splitMcpName(name: string): { server: string; tool: string } | null
export function mcpResult(result: any): any
export function legacyActivity(kind: string, text: string, extra?: Record<string, any>): any
export function commandActivity(command: string): any
export function spawnCmd(command: string | string[], args: string[], options?: Record<string, any>): any
export function runShell(command: string, options?: Record<string, any>): Promise<any>
export function killTree(child: any): void
export function firstLine(value: unknown, n?: number): string
export function truncate(value: unknown, n: number): string
export function fillEnv(value: unknown): unknown
export function sleep(ms: number): Promise<void>
export const isWin: boolean
export const CLAUDE_DENY: readonly string[]
export const SAFE_COMMANDS: readonly string[]
export const SKIP_DIRS: ReadonlySet<string>
