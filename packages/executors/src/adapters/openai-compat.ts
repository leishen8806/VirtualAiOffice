import { OpenAIWorker } from '../../runtime/index.js'
import type { ExecutorCapabilities } from '../contract.js'
import { LegacyBackedAdapter, type LegacyAdapterOptions } from './legacy-backed.js'

const capabilities: ExecutorCapabilities = { interactive: false, canReadFiles: true, canWriteFiles: true, canRunShell: true, canUseMcp: true, canUseVision: true, billing: 'usage' }

export class OpenAICompatAdapter extends LegacyBackedAdapter {
  constructor(options: LegacyAdapterOptions = {}) { super('openai-compatible', OpenAIWorker, options, capabilities) }
}

export const createOpenAICompatAdapter = (options?: LegacyAdapterOptions) => new OpenAICompatAdapter(options)
