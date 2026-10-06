#!/usr/bin/env node

/**
 * Package-local desktop MCP launcher for NEW-CORE (VAO neutral).
 *
 * This file is a MINIMAL launcher ONLY. It must not contain any MCP logic —
 * the single desktop MCP implementation lives at:
 *
 *   packages/tools/runtime/mcp/desktop-server.js
 *
 * Legacy consumers use:
 *   src/mcp/desktop.js
 * and are NOT affected by this launcher.
 */
import { startDesktopServer } from './desktop-server.js'
await startDesktopServer()
