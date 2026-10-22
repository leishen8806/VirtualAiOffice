import crypto from 'node:crypto'

export function issueCsrfToken() {
  const token = crypto.randomBytes(32).toString('base64url')
  return {
    token,
    hash: crypto.createHash('sha256').update(token).digest('hex'),
  }
}

export function verifyCsrfToken(expectedHash, token) {
  const actual = crypto.createHash('sha256').update(String(token || '')).digest('hex')
  const left = Buffer.from(String(expectedHash || ''))
  const right = Buffer.from(actual)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function sameOriginWriteOk({ req, hostOk, originOk, csrfHash }) {
  const origin = req.headers.origin
  const contentType = String(req.headers['content-type'] || '')
  const fetchSite = String(req.headers['sec-fetch-site'] || '')
  const csrfToken = String(req.headers['x-csrf-token'] || '')
  return Boolean(
    hostOk(req.headers.host) &&
    typeof origin === 'string' &&
    originOk(origin) &&
    contentType.startsWith('application/json') &&
    fetchSite !== 'cross-site' &&
    verifyCsrfToken(csrfHash, csrfToken),
  )
}
