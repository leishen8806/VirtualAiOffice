import { CodexCliWorker } from '../../runtime/index.js'
import type { ExecutorCapabilities } from '../contract.js'
import { LegacyBackedAdapter, type LegacyAdapterOptions } from './legacy-backed.js'

const capabilities: ExecutorCapabilities = { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: true, canUseVision: false, billing: 'unknown' }

export class CodexCliAdapter extends LegacyBackedAdapter {
  constructor(options: LegacyAdapterOptions = {}) { super('codex', CodexCliWorker, options, capabilities) }
}

export const createCodexCliAdapter = (options?: LegacyAdapterOptions) => new CodexCliAdapter(options)
