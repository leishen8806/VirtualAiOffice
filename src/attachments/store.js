import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ATTACHMENT_STATUS, createEmpty } from './types.js'

/**
 * Attachment store.
 *
 * Disk layout:
 *   <attachmentsDir>/
 *     index.json              → Map<id, Attachment> (in-memory, fsynced every write)
 *     blobs/<id[0:2]>/<id>    → raw file bytes (never exposed by filename)
 *
 * Storage ids are random 24-hex; the original filename is only kept in the
 * index record as a display label. No path component on disk ever comes from
 * user-supplied filenames.
 *
 * Threading note: all operations are serialised per-process via the in-memory
 * index map and Node's single-threaded event loop. Index.json is
 * overwritten + fsynced on every mutation so a crash does not leave orphans
 * with no index row (cleanup daemon will still reap them within 5 min).
 */

const INDEX_FILENAME = 'index.json'
const BLOBS_DIR = 'blobs'
const TMP_SUFFIX = '.tmp'

export class AttachmentStore {
  constructor(attachmentsDir) {
    this.dir = path.resolve(attachmentsDir)
    this.blobsDir = path.join(this.dir, BLOBS_DIR)
    this.indexPath = path.join(this.dir, INDEX_FILENAME)
    /** @type {Map<string, import('./types.js').Attachment>} */
    this._index = new Map()
    this._writeScheduled = false
    this._ensureDirs()
    this._loadIndex()
  }

  _ensureDirs() {
    fs.mkdirSync(this.blobsDir, { recursive: true })
  }

  _loadIndex() {
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf8')
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return
      for (const row of arr) if (row && row.id) this._index.set(row.id, row)
    } catch {}
  }

  /**
   * Call after every mutation. Debounced so a burst only writes once.
   */
  _schedulePersist() {
    if (this._writeScheduled) return
    this._writeScheduled = true
    queueMicrotask(() => {
      this._writeScheduled = false
      this._persistSync()
    })
  }

  _persistSync() {
    const tmp = this.indexPath + TMP_SUFFIX
    const payload = JSON.stringify([...this._index.values()])
    let fd
    try {
      fs.writeFileSync(tmp, payload)
      try {
        fd = fs.openSync(tmp, 'r')
        try { fs.fsyncSync(fd) } finally { try { fs.closeSync(fd) } catch {} }
      } catch (fsyncErr) {
        // Windows / some temporary FS backends (e.g. certain RAM disks or
        // remote junctions) return EPERM on fsync(). The write itself
        // already completed; accept without fsync when the underlying
        // volume does not support it.
        if (fsyncErr && fsyncErr.code !== 'EPERM' && fsyncErr.code !== 'EACCES' && fsyncErr.code !== 'ENOTSUP') {
          throw fsyncErr
        }
      }
      fs.renameSync(tmp, this.indexPath)
    } catch (e) {
      try { fs.unlinkSync(tmp) } catch {}
      throw e
    }
  }

  /**
   * Generate a fresh storage id and reserve a temporary blob path for
   * streaming upload. Does NOT yet add the row to the index – call
   * `create` once the header fields (filename, mime, size estimate) are
   * known.
   */
  reserveId() {
    let id
    do {
      id = crypto.randomBytes(12).toString('hex')
    } while (this._index.has(id))
    return { id, tmpPath: this._blobPath(id) + TMP_SUFFIX, finalPath: this._blobPath(id) }
  }

  _blobPath(id) {
    return path.join(this.blobsDir, id.slice(0, 2), id)
  }

  _ensureBlobDir(id) {
    fs.mkdirSync(path.dirname(this._blobPath(id)), { recursive: true })
  }

  /**
   * Create the index row once the upload header has been validated. The
   * caller owns the .tmp blob file and must either finaliseBlob on success
   * or deleteBlob if the upload aborts.
   * @param {Partial<import('./types.js').Attachment>} patch
   * @returns {import('./types.js').Attachment}
   */
  create(patch) {
    const row = { ...createEmpty(), ...patch, createdAt: Date.now(), updatedAt: Date.now() }
    if (!row.id) throw new Error('id required')
    this._index.set(row.id, row)
    this._schedulePersist()
    return row
  }

  /**
   * Move tmp blob to final location and mark status stored.
   */
  finalizeBlob(id) {
    const row = this._index.get(id)
    if (!row) throw new Error('unknown id')
    const { tmpPath, finalPath } = { tmpPath: this._blobPath(id) + TMP_SUFFIX, finalPath: this._blobPath(id) }
    this._ensureBlobDir(id)
    if (fs.existsSync(tmpPath)) {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath)
      fs.renameSync(tmpPath, finalPath)
    }
    row.storagePath = finalPath
    row.status = ATTACHMENT_STATUS.STORED
    row.updatedAt = Date.now()
    try { row.size = fs.statSync(finalPath).size } catch {}
    this._schedulePersist()
    return row
  }

  /**
   * Partial update of an index row.
   */
  update(id, patch) {
    const row = this._index.get(id)
    if (!row) return null
    Object.assign(row, patch, { updatedAt: Date.now() })
    this._schedulePersist()
    return row
  }

  get(id) {
    return this._index.get(id) || null
  }

  all() {
    return [...this._index.values()]
  }

  has(id) {
    return this._index.has(id)
  }

  /**
   * Remove an attachment: blob + index row. Safe to call on ids that
   * never finished uploading (cleans up tmp files too).
   */
  remove(id) {
    const row = this._index.get(id)
    const paths = [this._blobPath(id), this._blobPath(id) + TMP_SUFFIX]
    for (const p of paths) try { fs.unlinkSync(p) } catch {}
    this._index.delete(id)
    this._schedulePersist()
    return row != null
  }

  /**
   * Cleanup daemon hook: reap rows older than `olderThanMs` whose status
   * is not ATTACHED, plus any row whose owning clientMessageId was never
   * bound (stuck uploading/stored/extracted without a post() call).
   * @param {number} olderThanMs
   * @returns {string[]} removed ids
   */
  reapOrphans(olderThanMs = 5 * 60 * 1000) {
    const cutoff = Date.now() - olderThanMs
    const removed = []
    for (const [id, row] of this._index) {
      const stale = row.updatedAt < cutoff
      const orphan = row.ownerClientMessageId == null
      const bound = row.status === ATTACHMENT_STATUS.ATTACHED
      if (bound) continue
      if (stale && orphan) { this.remove(id); removed.push(id); continue }
      if (row.status === ATTACHMENT_STATUS.CANCELLED && stale) { this.remove(id); removed.push(id); continue }
    }
    return removed
  }

  /**
   * Claim an owner slot: returns true if the owner field was unset and
   * is now set to clientMessageId, OR if it already equals that id.
   * False if a DIFFERENT clientMessageId already owns it (security).
   */
  claimOwner(id, clientMessageId) {
    const row = this._index.get(id)
    if (!row) return false
    if (row.ownerClientMessageId == null) {
      row.ownerClientMessageId = clientMessageId
      row.updatedAt = Date.now()
      this._schedulePersist()
      return true
    }
    return row.ownerClientMessageId === clientMessageId
  }
}
