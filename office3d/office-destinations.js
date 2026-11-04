export function officeDestinationsForLayout(layout) {
  if (layout?.version < 3 || !Array.isArray(layout.regions)) return []
  const layoutScope = typeof layout.variant === 'string' && layout.variant
    ? layout.variant
    : `v${layout.version}`

  return layout.regions
    .filter(({ id, name, x0, x1, z0, z1 }) =>
      id != null && typeof name === 'string' && name.trim() &&
      [x0, x1, z0, z1].every(Number.isFinite) && x1 > x0 && z1 > z0,
    )
    .map((region) => {
      const registeredFocus = layout.regionFocus?.[region.id]
      const target = registeredFocus?.t || [
        (region.x0 + region.x1) / 2,
        0,
        (region.z0 + region.z1) / 2,
      ]
      const radius = Number.isFinite(registeredFocus?.r)
        ? registeredFocus.r
        : Math.max(14, Math.max(region.x1 - region.x0, region.z1 - region.z0) * 1.5)

      return Object.freeze({
        id: `office:${layoutScope}:region:${region.id}`,
        regionId: String(region.id),
        label: region.name,
        focus: Object.freeze({ az: 6, el: 36, r: radius, t: Object.freeze([...target]) }),
      })
    })
}
