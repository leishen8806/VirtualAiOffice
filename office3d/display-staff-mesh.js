import { OFFICE_THEME_V2 as T } from './office-theme-v2.js'

export function displayBatch(THREE, list, material) {
  const geometry = new THREE.BufferGeometry()
  for (const key of Object.keys(list[0].attributes)) {
    const size = list[0].attributes[key].itemSize
    const array = new Float32Array(list.reduce((sum, g) => sum + g.attributes[key].array.length, 0))
    let offset = 0
    for (const g of list) { array.set(g.attributes[key].array, offset); offset += g.attributes[key].array.length }
    geometry.setAttribute(key, new THREE.BufferAttribute(array, size))
  }
  list.forEach(g => g.dispose())
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return new THREE.Mesh(geometry, material)
}
export function displayAtlas(THREE, lines, canvasTex) {
  if (!canvasTex && typeof document === 'undefined') return null
  const width = lines.every(line => !line[1]) ? 256 : 1024
  const height = 128 * lines.length
  const draw = (ctx, w, h) => {
    ctx.fillStyle = T.nameplate; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = T.nameplateText; ctx.textAlign = 'center'
    lines.forEach((line, i) => {
      ctx.font = `bold ${line[1] ? 42 : 76}px "Microsoft YaHei", sans-serif`; ctx.fillText(line[0], w / 2, i * 128 + (line[1] ? 50 : 90))
      ctx.font = '30px "Microsoft YaHei", sans-serif'; ctx.fillText(line[1] || '', w / 2, i * 128 + 98)
    })
  }
  let texture
  if (canvasTex) texture = canvasTex(width, height, draw)
  else {
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    draw(canvas.getContext('2d'), width, height)
    texture = new THREE.CanvasTexture(canvas)
  }
  if (texture) texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
