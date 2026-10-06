/**
 * Attachment type contracts.
 *
 * Lifecycle per attachment:
 *   uploading  → streaming from client (busboy chunk state). A clientMessageId
 *                slot may be claimed before POST starts so that attachmentIds
 *                can only be referenced by the message that "owns" them.
 *   stored     → bytes on disk, extractor may still be running. Preview/meta
 *                is available once stored.
 *   extracted  → parse job done (text pages / transcript / image thumb).
 *   cancelled  → client disconnected or DELETE called before the owning
 *                message was dispatched. Cleanup daemon reaps these + any
 *                stored row whose owning clientMessageId was never seen.
 *   attached   → attachmentIds[] on a dispatched message are marked bound so
 *                the cleanup daemon will not reap them. The attachment stays
 *                on disk until the message is garbage-collected (future).
 *
 * The coordinator's post() is the ONLY authority that transitions stored →
 * attached. A client cannot bind an attachment to a message it does not own.
 */

export const ATTACHMENT_STATUS = Object.freeze({
  UPLOADING: 'uploading',
  STORED: 'stored',
  EXTRACTING: 'extracting',
  EXTRACTED: 'extracted',
  CANCELLED: 'cancelled',
  ATTACHED: 'attached',
})

export const ATTACHMENT_KIND = Object.freeze({
  DOCUMENT: 'document',
  IMAGE: 'image',
  AUDIO: 'audio',
  UNKNOWN: 'unknown',
})

/**
 * Extractors produce these. Documents are split into page chunks so the
 * model boundary can emit `[att#N p.M]` markers that match real page
 * ordinals the user would recognise.
 *
 * @typedef {object} DocumentExtract
 * @property {number}               pageCount
 * @property {Array<{n:number,text:string}>} pages   - 1-indexed page ordinal + text
 *
 * @typedef {object} ImageExtract
 * @property {string} [dataUrl]  - data:mime;base64 for vision-capable models
 * @property {number} [width]
 * @property {number} [height]
 *
 * @typedef {object} AudioExtract
 * @property {string} [transcript]        - raw ASR output (may be empty)
 * @property {string} [confirmedEdited]   - only this field crosses the model
 *                                          boundary for audio, never the raw
 *                                          transcript. Set only after a
 *                                          human-or-model confirmation pass.
 * @property {number} [durationSec]
 *
 * @typedef { {id:string,
 *             ownerClientMessageId:string|null,
 *             filename:string,
 *             sanitizedName:string,
 *             kind:'document'|'image'|'audio'|'unknown',
 *             mimeType:string,
 *             size:number,
 *             status:typeof ATTACHMENT_STATUS[keyof typeof ATTACHMENT_STATUS],
 *             createdAt:number,
 *             updatedAt:number,
 *             storagePath:string,
 *             error?:string,
 *             extract: (DocumentExtract|ImageExtract|AudioExtract) & object,
 *           } } Attachment
 */

export const createEmpty = () => ({
  id: '',
  ownerClientMessageId: null,
  filename: '',
  sanitizedName: '',
  kind: ATTACHMENT_KIND.UNKNOWN,
  mimeType: 'application/octet-stream',
  size: 0,
  status: ATTACHMENT_STATUS.UPLOADING,
  createdAt: 0,
  updatedAt: 0,
  storagePath: '',
  extract: {},
})
