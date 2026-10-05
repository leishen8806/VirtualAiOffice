#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  default,
} from '../../packages/tools/runtime/mcp/desktop-server.js'
import { startDesktopServer } from '../../packages/tools/runtime/mcp/desktop-server.js'

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
const isMain = !!process.argv[1] && same(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))
if (isMain) await startDesktopServer()
