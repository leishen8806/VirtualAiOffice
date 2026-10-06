#!/usr/bin/env node
// 桌面控制 MCP 旧版入口。
// 实现：单一事实来源 packages/tools/runtime/mcp/desktop-server.js （startDesktopServer）。
// 此文件作用：① 旧配置/旧 ToolCatalog.spec('desktop').args[0] 按这个文件路径启动 stdio；② 测试 import parseKeys/winVk。
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
