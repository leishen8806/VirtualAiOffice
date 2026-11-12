export const ISSUE_PAGE_SIZE = 100
export const MAX_ISSUE_PAGES = 200

export function createIssuePager({ company, get, warn = console.warn, label = 'issues' }) {
  const previousTotals = new Map()

  async function all(params = {}) {
    const allIssues = []
    const seen = new Set()
    const scope = new URLSearchParams(params).toString()
    let previousPageFingerprint = null
    for (let pageNumber = 0; pageNumber < MAX_ISSUE_PAGES; pageNumber++) {
      const query = new URLSearchParams(params)
      query.set('limit', String(ISSUE_PAGE_SIZE))
      query.set('offset', String(pageNumber * ISSUE_PAGE_SIZE))
      const response = await get(`/api/companies/${company}/issues?${query}`)
      const page = Array.isArray(response) ? response : response.issues || []
      if (!page.length) return finish(scope, allIssues)
      const fingerprint = page.map((issue) => issue.id).sort().join('\u0000')
      if (fingerprint === previousPageFingerprint) {
        warn(`[${label}] pagination repeated a page; stopping with ${allIssues.length} unique issues`)
        return finish(scope, allIssues)
      }
      previousPageFingerprint = fingerprint
      for (const issue of page) {
        if (seen.has(issue.id)) continue
        seen.add(issue.id)
        allIssues.push(issue)
      }
    }
    warn(`[${label}] pagination reached ${MAX_ISSUE_PAGES} pages; stopping with ${allIssues.length} unique issues`)
    return finish(scope, allIssues)
  }

  function finish(scope, issues) {
    const previous = previousTotals.get(scope)
    if (previous !== undefined && issues.length < previous) warn(`[${label}] total decreased from ${previous} to ${issues.length}`)
    previousTotals.set(scope, issues.length)
    return issues
  }

  return { all }
}
