/**
 * Legacy src/tools.js — compatibility facade.
 *
 * LAYERED EXPORT STRATEGY — used to enforce the package boundary:
 *
 *   A) @vao/tools SHARED RUNTIME — from packages/tools/runtime/index.js
 *      ToolCatalog, ToolRegistry, coreBuiltins, builtinTools (=legacyBuiltins),
 *      claudeServers, codexServers, expandEnv, MissingEnvError, readJson,
 *      parseKeys, winVk, WIN_VK, KEY_ALIASES, MODS, WIN_EXTENDED,
 *      createDesktopServer, startDesktopServer, desktopPlatform,
 *      desktopToolsList, desktopMcp, PLAYWRIGHT_MCP_PINNED_VERSION/SPEC,
 *      ToolPolicy/ToolResolver/capabilitySupportsTool/ALL_TYPES,
 *      normalizeToolDefinition/LEGACY_COMPATIBILITY_IDENTIFIER/FUTURE_NEUTRAL,
 *      authorizeToolDefinitionAuthorize, resolveGrantsSimple
 *
 *   B) @vao/executors COMPATIBILITY HELPERS re-exported SEPARATELY for Legacy
 *      consumers that still import them through this facade.
 *      describeMcpCall, splitMcpName
 *      (executor-owned format helpers; NOT exported by the shared tools runtime)
 *
 * NO executors code lives here. packages/tools/runtime MUST NOT import packages/executors.
 * Only this Legacy facade composes both.
 */

export * from '../packages/tools/runtime/index.js'

/**
 * EXECUTOR-OWNED LEGACY HELPERS
 * Re-exported from the executors runtime (NOT from @vao/tools shared runtime)
 * to preserve the old surface used by existing consumers like test/tools.test.js and any
 * code that previously imported these via `import { describeMcpCall, splitMcpName }
 * from './tools.js'`.
 */
export {
  describeMcpCall,
  splitMcpName,
} from '../packages/executors/runtime/format.js'
