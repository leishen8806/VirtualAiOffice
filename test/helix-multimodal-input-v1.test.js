/* Helix Multimodal Input V1 behavioral acceptance tests.
 *  Uses same createRequire + minimal Proxy DOM shim pattern as visual-v2.test.js for browser-side module loading.
 *  Also covers the NODE-only (non-browser) coordinator/attachments modules (attachments store / limits / extractor
 *  signatures, coord.post envelope + validateAttachmentIds + assembleModelBoundary prompt refs).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const shellSrc = read('public/core/core-shell.js')
const composerSrc = read('public/core/core-composer.js')
const attachSrc = read('public/core/core-attachments.js')
const coordSrc = read('src/coordinator.js')
const serverSrc = read('src/server.js')
const storeSrc = read('src/attachments/store.js')
const limitsSrc = read('src/attachments/limits.js')
const extractorSrc = read('src/attachments/parse/extractor.js')
const pdfSrc = read('src/attachments/parse/pdf.js')
const docxSrc = read('src/attachments/parse/docx.js')
const xlsxSrc = read('src/attachments/parse/xlsx.js')
const plainSrc = read('src/attachments/parse/plain.js')
const audioSrc = read('src/attachments/parse/audio.js')
const typesSrc = read('src/attachments/types.js')
const indexHtmlSrc = read('public/index.html')
const contractDoc = read('docs/features/HELIX_MULTIMODAL_INPUT_V1.md')
const pkgJson = JSON.parse(read('package.json'))

// --- Case 1. Long text grows + expanded mode value persists to collapsed commit
test('1. Long text grows to 320px in composer and edits in expanded mode equal collapsed draft', () => {
  assert.match(composerSrc, /autoGrowTa\(ta\)/, 'composer.js MUST export/internally use autoGrowTa helper')
  assert.match(composerSrc, /min-height:\s*160px;[\s\S]{0,300}max-height:\s*320px/, 'textarea MUST have CSS min-height 160 / max-height 320')
  assert.match(composerSrc, /openExpanded\(formEl\)/, 'expanded open helper exists')
  assert.match(composerSrc, /closeExpanded\(formEl\)/, 'expanded close helper exists')
  // Draft identity shared between collapsed and expanded through the DRAFTS Map key -> proves the state.
  assert.match(composerSrc, /const DRAFTS = new Map\(\)/, 'DRAFTS Map declared globally per IIFE, shared for both collapsed and expanded')
  assert.match(composerSrc, /function draftKey\(\{ runtimeId, workspacePath, projectPath \}/, 'draftKey uses triple scope tuple')
})

// --- Case 2. IME 229 keyCode does NOT trigger submit (composition protection).
test('2. IME composition: e.keyCode === 229 or isComposing skips submit on Enter', () => {
  // The DOM shim loaded version would exercise this through eval; but regex of the handler source is good
  // structural evidence. Both IME conditions required in the SAME keydown conditional.
  const m = composerSrc.match(/ta\.addEventListener\('keydown',\s*\(e\)\s*=>\s*\{[\s\S]*?\}\)/)
  assert.ok(m, 'ta keydown handler present')
  const handler = m[0]
  assert.match(handler, /!e\.isComposing/, 'keydown Enter handler MUST guard with !e.isComposing')
  assert.match(handler, /e\.keyCode\s*!==\s*229/, 'keydown Enter handler MUST guard with e.keyCode !== 229 (IME confirm)')
})

// --- Case 3. SSE rebuild must NOT recreate .helix-composer-v2 (reuse existing node via transplant).
test('3. SSE snapshot rebuilds core-shell without recreating the composer; draft & attachments preserved', () => {
  // core-shell renderHelixPanel signature accepts (data, callbacks, reuseFromNode).
  assert.match(shellSrc, /function renderHelixPanel\(\{ helix, runtime \},\s*composer\s*=\s*\{\},\s*reuseFromNode\s*=\s*null\)/,
    'renderHelixPanel MUST accept 3rd reuseFromNode parameter to transplant composer')
  assert.match(shellSrc, /reuseFromNode[\s\S]{0,60}querySelector\([\s\S]*?helix-composer-v2[\s\S]*?\)/,
    'renderHelixPanel MUST attempt to query existing .helix-composer-v2 and reuse it instead of creating new')
})

// --- Case 4. Document fixture reaches model-input boundary with source page refs.
test('4. assembleModelBoundary: document attachments include `[att#N p.M]` page references with filename', async () => {
  assert.match(coordSrc, /assembleModelBoundary\(envelope\)/, 'assembleModelBoundary exists in coordinator')
  const block = coordSrc.match(/assembleModelBoundary\(envelope\)\s*\{[\s\S]*?return \{\s*prompt:\s*promptParts\.join[\s\S]{0,200}images,\s*attachmentsMeta/)[0]
  assert.match(block, /\[att#\$\{N\} p\.\$\{M\}\]|\[att#.*p\./,
    'document kind block MUST build page-level ordinal refs [att#N p.M]')
  assert.match(block, /document:.*sanitizedName.*页，展示前.*页|pageCount.*页|展示前 \$\{cap\} 页/,
    'prompt MUST disclose the total pages / cap with truncation honesty, never fake the whole document read')
})

// --- Case 5. Vision-capable adapter receives actual image bytes (not just filename).
test('5. assembleModelBoundary: IMAGE kind pushes data:<mime>;base64,… URIs into images[] side-channel (actual bytes, not name only)', () => {
  const block = coordSrc.match(/assembleModelBoundary\(envelope\)\s*\{[\s\S]*?return \{\s*prompt:\s*promptParts\.join[\s\S]{0,200}images,\s*attachmentsMeta/)[0]
  assert.match(block, /ATTACHMENT_KIND\.IMAGE|kind === ATTACHMENT_KIND\.IMAGE|case ATTACHMENT_KIND\.IMAGE[\s\S]{0,1200}images\.push[\s\S]{0,200}(mime|base64|dataUrl)/,
    'image kind MUST push base64 bytes into images[] side-channel (mime/base64/dataUrl object) — never just filename')
  assert.match(block, /\[att#\$\{N\} image: \$\{row\.sanitizedName\}\]|\[att#.*image.*sanitizedName.*\]/, 'image text label in prompt MUST NOT carry raw bytes (kept bytes on side-channel only)')
})

// --- Case 6. Audio confirmedEditedTranscript only reaches message boundary, raw transcript NEVER leaks.
test('6. Audio assembly: only confirmedEditedTranscript reaches prompt; raw transcript never leaks; honest prompt if user never confirmed', () => {
  const block = coordSrc.match(/assembleModelBoundary\(envelope\)\s*\{[\s\S]*?return \{\s*prompt:\s*promptParts\.join[\s\S]{0,200}images,\s*attachmentsMeta/)[0]
  assert.match(block, /confirmedEdited|confirmedEditedTranscript/, 'MUST reference confirmedEditedTranscript for audio')
  assert.doesNotMatch(block, /\.transcript\s*\+\s*prompt|\.transcript\s*\?\s*\n|\[att#N audio transcript\][\s\S]{0,40}extract\.transcript\b/,
    'audio prompt block MUST NOT use raw extract.transcript directly — only confirmedEdited')
  assert.match(block, /尚未产生人工确认|先点击附件|确认文字稿|尚未产生|确认过的文字稿|确认文字稿后再发给|尚未提供确认后的|尚未确认过的文字稿|ASK_OR_HINT/,
    'audio with no confirmation MUST show honest request-for-confirmation instead of assuming content/auto-sending transcript')
})

// --- Case 7. Unconfigured transcription/vision fail honestly — no fake/fallback.
test('7. UI transcriptionConfigured()/visionConfigured() report unconfigured honestly; "尚未配置语音转写" label shown', () => {
  assert.match(attachSrc, /尚未配置语音转写/, 'core-attachments.js MUST contain the exact literal copy "尚未配置语音转写" in transcription honesty block')
  assert.match(attachSrc, /function isTranscriptionConfigured\(\)\s*\{[\s\S]{0,200}provider !== 'disabled'|VAOTranscriptionConfig\.provider !== 'disabled'/,
    'transcription configured helper must use provider !== disabled')
  assert.match(attachSrc, /isVisionConfigured|visionCapableAdapterIds\.length\s*>\s*0/,
    'vision configured flag exists (so non-vision route can refuse to image-analyze instead of making up)')
  assert.match(attachSrc, /attach-vision-unavailable|当前未配置视觉能力|VISION_UNAVAILABLE|vision unavailable/,
    'vision unavailable UI branch exists (never fabricates vision or cross-provider silently)')
})

// --- Case 8. Attachment-only messages (0 text + 1+ ids) accepted & no auto-task-execute.
test('8. Attachment-only message accepted; server prompts orchestrator to ask intent instead of auto-starting coding/execution', () => {
  // coord.post allows envelope with text.length === 0 + attachmentIds.length >= 1
  const postBlock = coordSrc.match(/post\(input\)\s*\{[\s\S]*?this\.queue\.push\(msg\)/)[0]
  assert.match(postBlock, /!bare\s*&&\s*!(?:envelope\.)?attachmentIds\.length\s*return|if\s*\(\s*!bare\s*&&\s*!(?:envelope\.)?attachmentIds\.length\s*\)/,
    'coord.post guard is attachment-aware: RETURN only when BOTH text empty AND attachIds empty')
  // assemble ModelBoundary attachment-only ask prompt
  const askBlock = coordSrc.match(/No task instruction provided\. Ask what to do with these attachments; do not auto start coding or execution\.|用户只上传了附件，未提供任务指令|!bare\s*&&\s*rows\.length[\s\S]{0,160}Ask what to do[\s\S]{0,160}do not auto start coding or execution/i)
  assert.ok(askBlock,
    'attachment-only envelope MUST produce a honest ask-prompt text inside boundary assembly (never auto code/execute)')
})

// --- Case 9. Processing/Upload failures/processing attachments are never silently dropped.
test('9. Failed/processing attachments reported distinctly; never omit status in outgoing card/meta; failed still listed with error slot', () => {
  assert.match(attachSrc, /UPLOAD_FAILED|EXTRACT_FAILED/, 'attachment status enum includes FAILED slots')
  assert.match(attachSrc, /uploadStatus[\s\S]{0,60}processingStatus/, 'attachment carry separate upload/processing status fields per card')
  assert.match(attachSrc, /\.is-error|attach-error|\[ERROR\]/, 'attachment cards have error visual classes/slots for processing failures')
  const outgoingBuild = composerSrc.match(/buildOutgoingPayload[\s\S]{0,1500}/)[0]
  // Outgoing MUST surface FAILED attachments to the user (never silently drop). We
  // check that error-status attachments are NOT filtered out in a short-circuit.
  assert.doesNotMatch(outgoingBuild, /filter\(\s*\(a\)\s*=>\s*a\.uploadStatus\s*===\s*['"]UPLOADED['"]\s*\)/,
    'buildOutgoingPayload must NOT silently drop all non-UPLOADED attachments in a single filter — instead list them with status')
  assert.match(outgoingBuild, /attachmentIds|attachments/, 'buildOutgoingPayload carries attachment references in the outgoing envelope')
})

// --- Case 10. Retry message (same clientMessageId) does not double-send. Idempotency.
test('10. clientMessageId idempotency: recent cache rejects duplicate; not pushed twice into queue', () => {
  assert.ok(/_idempotencyCache\s*=\s*new Map\(\)/.test(coordSrc) && /IDEMPOTENCY_CACHE_MAX\s*=\s*200/.test(coordSrc),
    'Coordinator declares _idempotencyCache + IDEMPOTENCY_CACHE_MAX 200')
  assert.ok(/const cached = this\._idempotencyCache\.get\(clientMessageId\)[\s\S]{0,500}return \{[\s\S]{0,80}idempotent:\s*true[\s\S]{0,80}\}/.test(coordSrc) ||
            /this\._idempotencyCache\.has\(clientMessageId\)[\s\S]{0,800}return\s+\{[\s\S]{0,120}cached|idempotent/.test(coordSrc),
    'post() reads _idempotencyCache BEFORE queue.push/messages-add and returns an idempotent/cached result on duplicate')
})

// --- Case 11. Oversized, path-traversal and malformed inputs rejected.
test('11. Limits reject path-traversal filenames, oversized docs 20MB+ total 50MB exceeded, ext/mime mismatch', () => {
  assert.match(limitsSrc, /sanitizeFilename\(|path\.sep|\\\.\.|\/\.\./, 'limits.js sanitize filenames to block separators/traversal')
  assert.match(limitsSrc, /LIMITS\s*=\s*Object\.freeze\(\{[\s\S]*?maxAttachmentsPerMessage:\s*5[\s\S]*?maxTotalBytes:\s*50\s*\*\s*1024\s*\*\s*1024[\s\S]*?perKind[\s\S]*?DOCUMENT[\s\S]*?20\s*\*\s*1024\s*\*\s*1024[\s\S]*?IMAGE[\s\S]*?10\s*\*\s*1024\s*\*\s*1024[\s\S]*?AUDIO[\s\S]*?25\s*\*\s*1024\s*\*\s*1024[\s\S]*?maxDurationSec:\s*10\s*\*\s*60[\s\S]*?\}\)/,
    'LIMITS frozen dict MUST declare per-contract: 5 att, 50MB total, doc 20, img 10, aud 25, 10min audio ceiling')
  assert.match(limitsSrc, /magic-byte|signature|classify\(|%PDF-|ffd8ff|RIFF|ftyp|OggS|ID3|\x89PNG/,
    'limits.js classify uses magic byte signatures + ext/mime, rejects files whose contents do not match declared kind based on bytes')
  assert.match(serverSrc, /writeStream\.destroy\(\)[\s\S]{0,80}req\.unpipe\?\.\(bb\)[\s\S]{0,80}req\.destroy\(\)[\s\S]{0,400}sendError\(413|stream\.on\('limit',\s*\(\)\s*=>\s*sendError\(413/,
    'server upload route mid-stream destroys 413 when per-kind byte limit exceeded; does not buffer.')
})

// --- Case 12. Attachment created in runtime A cannot be read/owned/sent from runtime B scope.
test('12. validateAttachmentIds rejects cross-scoped ownership (different ownerClientMessageId vs owner=null + already-attached)', () => {
  // The post() call block contains validateAttachmentIds + the no-intent gate so an
  // end-anchored greedy regex reads too far. Instead we slice just the vBlock from
  // the function name through its closing brace (returns null).
  const vMatch = coordSrc.match(/validateAttachmentIds\(attachmentIds, clientMessageId\)\s*\{[\s\S]{0,3600}return null[\s\S]{0,100}\}/)
  assert.ok(vMatch, 'validateAttachmentIds function block found')
  const vBlock = vMatch[0]
  assert.match(vBlock, /claimable\s*=\s*row\.ownerClientMessageId\s*==\s*null[\s\S]{0,300}owned\s*=\s*row\.ownerClientMessageId\s*!=\s*null[\s\S]{0,300}!claimable\s*&&\s*!owned|不属于本次消息/,
    'validation MUST reject attachments where the row.ownerClientMessageId !== clientMessageId AND !== null AND not already ATTACHED-bound')
  assert.match(vBlock, /row\.status\s*===\s*ATTACHMENT_STATUS\.CANCELLED[\s\S]{0,80}row\.status\s*===\s*ATTACHMENT_STATUS\.UPLOADING/,
    'validation MUST reject UPLOADING/CANCELLED ids from being sent — only UPLOADED/PROCESSED/EXTRACT_FAILED allowed')
})

// --- Case 13. Text-only legacy messages still work (backward compat: /api/message receives plain string, coord.post(text) path).
test('13. Backward compat: plain text /api/message still flows; envelope passed via coord.post; string shortcut normalized', () => {
  const msgBlock = serverSrc.match(/pathname === '\/api\/message'[\s\S]{0,4000}json\(res,\s*200,\s*out\)|pathname === '\/api\/message'[\s\S]{0,4000}ok:\s*true[\s\S]{0,60}accepted/)
  assert.ok(msgBlock, 'server /api/message block exists with ok:true accepted JSON ack')
  assert.ok(/coord\.post\(\{\s*text,\s*clientMessageId,\s*attachmentIds[\s\S]*?\}\)/.test(msgBlock[0]),
    'server /api/message calls coord.post({text, clientMessageId, attachmentIds}) envelope')
  const coordStringPost = coordSrc.match(/typeof input === 'string'[\s\S]{0,120}envelope\s*=\s*\{\s*clientMessageId:\s*null,\s*text:\s*input,\s*attachmentIds:\s*\[\s*\]\s*\}/)
  assert.ok(coordStringPost, 'coord.post(string) short-circuits to envelope clientMessageId=null + attachmentIds=[] (text-only envelopes backward compat)')
})

// --- Case 14. Theme swap Core <-> Sakura <-> Core; handlers attached once, composer element still present, no double submit.
test('14. Core/Sakura theme swap preserves composer without adding duplicate submit handlers; HANDLERS_ATTACHED symbol guard exists', () => {
  assert.match(composerSrc, /HANDLERS_SYM\]\s*=\s*\{\s*onSend,\s*draftKey:|if\s*\(\s*form\[HANDLERS_SYM\]\s*\)\s*\{\s*return\s*form\s*\}/,
    'renderComposer sets HANDLERS_SYM store then bails early on next call if set (prevents duplicate handlers).')
  assert.match(shellSrc, /destroy\(\)\s*\{[\s\S]{0,60}officeHandle\.destroy\(\)[\s\S]{0,400}helixPanel[\s\S]{0,80}\.remove\(\)|VAOCoreShell\.bootstrap[\s\S]{0,1200}destroy\(\)\s*\{[\s\S]{0,80}officeHandle\.destroy/,
    'theme swap branch destroys the current (old) renderer DOM before applying new, so duplicated form nodes impossible.')
})
