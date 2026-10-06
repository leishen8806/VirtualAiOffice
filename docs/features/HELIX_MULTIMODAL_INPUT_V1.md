# Helix Multimodal Input V1 — Implementation Contract

Scope: `feature/helix-multimodal-input-v1`

Base: stacked draft on `visual-v2/core-shell-a` commit `b6bc6941bd155edf64ada9229f174721489939f2` (PR #9 not yet merged; stacked draft PR pattern; retarget after base merged).

## 1. Deliverables

- Server binary upload endpoint `/niuma/v1/attachments` with lifecycle, scope validation, cancellable progress, and delete.
- Server storage directory `<runtime-tmp>/niuma-attachments/<runtime-id>/<gen-id>.<ext>` — outside public / source / executables.
- Extractors: PDF (pdf-parse), DOCX (mammoth), XLSX (xlsx), TXT/MD/CSV (utf-8 decode bounded).
- Message contract: `/api/message` JSON accepts `{ clientMessageId, text, attachmentIds }` while remaining backward compatible with plain text.
- SSE snapshots carry `attachments[]` state.
- Model boundary assembly: user instr + doc excerpts `[att#N pM]` refs + actual image base64 `image_url` on vision-capable adapter routes + confirmed transcript.
- Helix panel composer V2: attachment tray + grow 160→320px full-width TA + toolbar + send bottom-right + expanded 720px desktop / fullscreen mobile (Escape closes, drafts preserved across SSE rebuilds).
- Drag+drop / clipboard paste / multiple select file picker / removal / retry / upload+processing separate status / progress.
- Attach-only messages → send prompt acknowledgement without auto-execute.
- Audio: upload MP3/WAV/M4A/WebM/OGG → unconfigured TTS → honest "尚未配置语音转写"; optional mic record (browser MediaRecorder).
- Transcription: `transcriptionAdapter` configurable in `niuma.config.json`. Preserves `originalTranscript` vs `confirmedEditedTranscript` distinct fields.
- Vision route: `visionCapableAdapterIds[]`; image attachment → vision payload actual bytes, not just name; unconfigured honest msg.
- Limits enforced SERVER-SIDE: 5 per msg / 50MB total / doc 20MB / img 10MB / aud 25MB 10min. Reject malformed/path-traversal on both ends.
- 14 behavioral acceptance cases in `test/helix-multimodal-input-v1.test.js`.
- Validation: npm ci → npm test → build:packages → test:packages → test:all → verify:packaged-layout → rehearsal → git diff --check.
- Stacked draft PR; no base merge, no auto.

## 2. Non-goals (per spec OUT OF SCOPE)

- Stage 1B-B tool authorization redesign
- Telegram channel
- Full artifact/KB system
- New domain state machines
- Real-time voice / wake word
- TTS / voice generation
- Office character art redesign

## 3. Backend (Worktree: `E:\VirtualAIOffice\mmi-v1-worktree`)

Additions:

```
src/
  attachments/
    types.d.ts           # Attachment interface + lifecycle enum
    store.js             # Scoped storage id, lifecycle cleanup orphaned cancels
    limits.js            # 5/50MB per msg; doc 20MB / img 10MB / aud 25MB 10min
    parse/
      extractor.js       # Extractor registry
      pdf.js             # pdf-parse page refs
      docx.js            # mammoth text+headings+tables
      xlsx.js            # sheet/cell bounded
      plain.js           # utf-8 md/csv/txt with size cap
      audio.js           # transcription adapter provider hook + duration probe
server.js                # add /niuma/v1/attachments route
coordinator.js           # attachIds resolve + scope + assemble model boundary
bin/niuma.js             # --brain flag, attach temp dir path + config schema extension
```

Dependencies added (maintained parsers only; no hand-written format parsers):
- `pdf-parse` (MIT) for PDF
- `mammoth` (BSD-2) for DOCX
- `xlsx` (Apache-2) for XLSX — sheet/cell mode only, no macro execution
- `music-metadata` (MIT) for audio duration probe
- `busboy` (MIT) for streaming multipart parser with file-size caps mid-stream

No OCR added; scanned PDF status = "no_text_extracted" honest.

## 4. Message contract

- `/api/message` (POST, json):
```
{
  clientMessageId?: string,        // idempotency key
  text: string,                    // backward compat when only text
  attachmentIds?: string[]         // server-issued from /niuma/v1/attachments
}
```

Server resolves `attachmentIds` against current runtime scope:
- Attachment `runtimeId` must match the current active coord runtime id.
- Attachment status must be `UPLOADED | PROCESSED | PROCESSING_ERROR`; never `DELETED | UNKNOWN`.
- If any id fails to resolve, message is rejected 400.

Coordinator → executor model boundary assembly function:

```
buildModelInputs({ text, attachments })
  = { prompt: (text || '') + docExcerpts, images: [{base64,mime}], audio: confirmedTranscript }
```

Doc excerpts carry prefix `[att#N page M section S]` for bounded context budget; never claim the whole doc was read.

Image `[{type:'image_url', image_url:{url:`data:${mime};base64,${b64}`}}]` only when adapter id in `visionCapableAdapterIds`; else fallback text description "UNCONFIGURED_VISION_IMAGE_ATTACHED_NAME={n}".

Audio → confirmedEditedTranscript only; if unconfirmed then never sent.

## 5. Frontend additions

```
public/core/core-composer.js
public/core/core-attachments.js
```

`core-shell.js renderHelixPanel` — replace tiny current `<form class="helix-composer">` with Composer V2.

Draft state stored outside transient render:
```
const DRAFTS = new Map() // key = <runtimeId>/<workspacePath>
```

No disk persistence of drafts; memory only.

Composer V2 internal structure (one form `.helix-composer-v2`):

```
<div class="attachment-tray" />   // attachment cards row
<textarea
  rows=6 default min-rows=6 max-rows=14
  style="font: 15px/24px ...; min-height: 160px; max-height: 320px; overflow-y: auto;"
/>
<div class="composer-toolbar">    // bottom toolbar
  <div class="toolbar-left">
    <input type=file multiple hidden id=up />
    <button aria-label="attach">📎</button>
    <button aria-label="record mic">🎙️</button>
  </div>
  <div class="toolbar-right">
    <button aria-label="expand" class="expand-btn">⤢</button>
    <div id=ime-protect />
    <button type=submit class="send">发送</button>
  </div>
</div>
```

Expanded mode:
- `.helix-composer-v2.expanded` desktop `width:min(720px, 95vw); position:fixed; left:50%; transform:translateX(-50%); top:8vh; max-height:88vh; z-index:9999` + overlay
- mobile `position:fixed; inset:0; z-index:9999; width:100%; height:100%`
- Escape keydown → close, focus last textarea; draft + attachment state shared (same Map key, same attachments array).

IME composition guard on keydown Enter:
- `e.isComposing || e.keyCode === 229` → ignore submit
- Shift+Enter → newline (default textarea behavior)
- Plain Enter → submit (send through existing flow)

Paste behavior: if clipboard has files → inserted as attachments.

Drag-drop: form ondragover + ondrop → fileList → queue attachment.

SSE rebuild panel MUST NOT recreate composer if it's currently attached & focus/textarea draft exists. Instead just diff conversations + metrics, leave composer subtree rooted in DOM. Implementation: `renderHelixPanel` reuse existing composer reference by id lookup, replace only conversation block + metrics, swap only if actually null or different form id.

## 6. Attachment cards

Type-specific diff:

- document: filename + icon ext + size + status (uploading/uploaded/parsing/parsed/error) + preview (extracted first 240 chars safe text peek with toggle) + remove + cancel (if uploading/progress) + retry (if error)
- image: thumbnail `<img>` using `URL.createObjectURL` + dimensions if metadata available + status + preview modal (full-size) + remove + retry
- audio: filename or "Recording #N" label + duration probe + play via `<audio controls>` + transcription status + preview transcript editable textarea + remove + retry.

**Separate statuses:**
- `uploadStatus`: IDLE | UPLOADING | UPLOADED | UPLOAD_FAILED | CANCELLED
- `processingStatus`: IDLE | EXTRACTING | EXTRACTED | EXTRACT_FAILED | UNSUPPORTED

Never mark "understood" because UPLOADED. Only mark understood after PROCESSED with actual extracted bytes length > min threshold (or actual vision call returned non-empty / transcript reviewed).

Attachment-only message (empty text after trim + 1+ attachments):
- submit sends. Server → model prompt: "User attached N file(s): [{fn,type,size}]. No task instruction provided. Ask what to do; do not auto-start coding/execution." → honest response from orchestrator rather than silent no-op or auto-guess task.

## 7. Voice/mic details

Transcription adapter provider hook in `niuma.config.json`:
```
"transcription": {
  "provider": "disabled",   // disabled | openai-compatible | whisper-local | custom
  ... url, model, token via env vars not committed.
}
```
If provider === disabled → composer mic entry available → "尚未配置语音转写" shown inline instead of transcript.

Mic recording (browser MediaRecorder):
- request microphone permission ONLY on user click record (not page load).
- visible timer `00:00` record indicator + stop + cancel + playback.
- No auto-send on stop. After stop → audio attachment added to tray with pending transcription status.
- MediaRecorder start/stop tracks released properly (track.stop() on cancel/stop/teardown, MediaRecorder.state !== 'inactive' check).
- Unsupported MIME → fallback or disable record button honestly, no fake waveform, no fake transcript.

Transcript fields distinct: `attachment.originalTranscript` (provider text, immutable after provider returns) + `attachment.confirmedEditedTranscript` (user editable). Model boundary ONLY uses confirmedEditedTranscript (never auto-populated empty if user never confirmed).

## 8. Privacy + limits

Server-side enforcement (not UI-only):
- `attachments.length <= 5` → reject 413
- `sum(fileSize) <= 50_000_000` (50MB total) → reject 413
- doc 20_000_000 / img 10_000_000 / aud 25_000_000 + 10min duration cap probe → reject
- Content-type, extension, file signature magic bytes check (pdf signature %PDF-; jpg ffd8ffe0/f1 etc.) → reject on mismatch
- Filename sanitize to: `allowed = [a-zA-Z0-9._ -]`. Never use original filename as disk path (storage generated ids).
- Extract time cap: 30s per attachment; abort via AbortController if exceeded. Extract text cap: 250_000 chars per doc → truncate with `"[truncated budget]"`.
- Storage path: `<tmpdir>/niuma-attachments/<runtimeId>/<gen_id>.<sane_ext>`. NEVER public/, src/, executable path scope. Cleanup daemon: every 5 minutes delete files with `status = CANCELLED or UNREFERENCED older than 10min`. Never delete files referenced by an attachmentId that appears in any message sent (message log in coord).

## 9. Reliability

- `clientMessageId` idempotency (send again server → dedup if same id, return existing ack, never double-execute).
- Draft Map scope key = `<runtimeId>-<projectPath>-<workspacePath>`. On context switch → load/new draft. Cross-context send guard: if draft's context != new context and user attempts submit, confirmation dialog before sending across scopes.
- Theme switch / Helix drawer open-close: reuse composer element via stable id lookup (no addEventListener duplicated; guard `__handlersAttached` symbol).
- Live/demo separation: mock extractors that produce dummy success MUST only execute in mode === 'demo' or 'fake'; under live/connecting we always use real extractor or honest failed.

## 10. Acceptance cases (test/helix-multimodal-input-v1.test.js)

1. Long text grows + edits expanded mode → committed value equals collapsed
2. Chinese IME: composition keydown 229 → NO submit
3. SSE `snapshot` event arrives: draft text, cursorIndex, attachments array NOT reset/lost
4. Document extract + source ref p.1 → reaches model inputs boundary `[att#0 p.1]`
5. Vision-capable adapter: image attachment reaches model-boundary payload as `{type:image_url, image_url:{url:data:...}}` actual bytes, not filename
6. Audio → transcription review → confirmedEditedTranscript reaches message context
7. Transcription disabled ("尚未配置语音转写") + vision disabled → honest text messages, no fallback silent fake success
8. Attach only (0 text + 1 file) → sent, orchestrator prompt contains "No task instruction provided. Ask..."
9. Processing failed card rendered with distinct ERROR style, included in outgoing message summary with status=ERROR (never silently dropped)
10. Retry with same clientMessageId → server responds without double-posting (idempotent)
11. Oversized 60MB upload, path-traversal `../../../etc/passwd` filename → reject 413/403
12. Attach created in runtime A: not readable/sendable from runtime B (cross-scope isolation)
13. Plain text message (old shape): still flows unchanged through /api/message → coord.post → SSE → conversation
14. Theme swap Core ↔ Sakura ↔ Core: composer present, handlers attached once, no duplicate submit.

## 11. Screenshots (2 captures × 2 views + 4 UI states)

Paths: `E:\VirtualAIOffice\review-artifacts\mmi-v1\...` → outside tracked source:
- `empty-large-composer-1440x900.png`, `empty-large-composer-1280x1024.png`
- `expanded-composer-1440x900.png`, `expanded-composer-1280x1024.png`
- `tray-doc-img-audio-1440x900.png`, `tray-doc-img-audio-1280x1024.png`
- `processing-error-states-1440x900.png`, `processing-error-states-1280x1024.png`

## 12. Delivery / PR

- Stacked draft PR URL pattern: `https://github.com/leishen8806/VirtualAiOffice/compare/visual-v2/core-shell-a...feature/helix-multimodal-input-v1` after push.
- NO auto merge; retarget to main after PR #9 merges.
- Report: base/head SHA, changed files list, composer dimensions evidence, real provider smoke test, screenshots paths, npm test results, CI ubuntu/windows status, any unverified runtime behavior.
- Verdict final line: `READY_FOR_HELIX_MULTIMODAL_REVIEW` only if all 14 acceptance cases + validation commands green.
