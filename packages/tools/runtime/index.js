import { describeMcpCall, splitMcpName } from '../../executors/runtime/format.js'
export { describeMcpCall, splitMcpName }
export { builtinTools, ToolCatalog, claudeServers, codexServers } from './catalog.js'
export { builtinTools as builtinToolsRaw, npx } from './builtins.js'
export { stdio } from './discovery.js'
export {
  parseKeys,
  winVk,
  WIN_VK,
  KEY_ALIASES,
  MODS,
  WIN_EXTENDED,
  createDesktopServer,
  startDesktopServer,
  desktopPlatform,
  desktopToolsList,
  default as desktopMcp,
} from './mcp/desktop-server.js'
