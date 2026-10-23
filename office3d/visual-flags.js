const OFF = Object.freeze({ officeV2: false, campus: false })

function validFlags(value) {
  if (!value || typeof value !== 'object') return OFF
  return Object.freeze({
    officeV2: value.officeV2 === true,
    campus: value.campus === true,
  })
}

export async function loadVisualFlags(fetcher = globalThis.fetch) {
  if (typeof window === 'undefined' || typeof fetcher !== 'function') return OFF
  try {
    const response = await fetcher('/visual-flags', { cache: 'no-store' })
    if (!response.ok) return OFF
    return validFlags(await response.json())
  } catch {
    return OFF
  }
}

export { OFF as VISUAL_FLAGS_OFF }
