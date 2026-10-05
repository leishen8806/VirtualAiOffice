import { ClaudeCliWorker } from '../../runtime/index.js'
import type { ExecutorCapabilities } from '../contract.js'
import { LegacyBackedAdapter, type LegacyAdapterOptions } from './legacy-backed.js'

const capabilities: ExecutorCapabilities = { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: true, canUseVision: true, billing: 'unknown' }

export class ClaudeCliAdapter extends LegacyBackedAdapter {
  constructor(options: LegacyAdapterOptions = {}) { super('claude-code', ClaudeCliWorker, options, capabilities) }
}

export const createClaudeCliAdapter = (options?: LegacyAdapterOptions) => new ClaudeCliAdapter(options)
