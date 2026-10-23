export const OFFICE_VIS2_TEXTURES = Object.freeze({
  oak: new URL('../assets/textures/office-v2/oak-light.jpg', import.meta.url).href,
  stone: new URL('../assets/textures/office-v2/stone-floor.jpg', import.meta.url).href,
  fabric: new URL('../assets/textures/office-v2/fabric-cream.jpg', import.meta.url).href,
})

export const officeVis2Enabled = value => !!value && typeof value === 'object' && !Array.isArray(value) && value.enabled === true

// 只有显式开启才读美术图片；加载失败释放自己的纹理，交由调用者恢复原办公室。
export async function loadOfficeVis2Assets(THREE, config, loader) {
  if (!officeVis2Enabled(config)) return null
  loader ||= new THREE.TextureLoader()
  const owned = [], results = await Promise.allSettled(Object.entries(OFFICE_VIS2_TEXTURES).map(async ([name, url]) => {
    const texture = await loader.loadAsync(url); owned.push(texture)
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4
    return [name, texture]
  }))
  if (results.some(result => result.status === 'rejected')) { owned.forEach(t => t.dispose()); throw new Error('Office VIS2 material asset unavailable') }
  let disposed = false
  return { ...Object.fromEntries(results.map(result => result.value)), dispose() { if (disposed) return; disposed = true; owned.forEach(t => t.dispose()) } }
}
