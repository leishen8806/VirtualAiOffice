import zlib from 'node:zlib'
// 极简 PNG 解码（8 位、非隔行；RGBA/RGB/灰度/调色板），只用来读雷达瓦片上的像素，不引入依赖
export function decodePng(buf) {
  let p = 8, w, h, bd, ct, plte = null, trns = null
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'PLTE') plte = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, (ch * bd) / 8), stride = Math.ceil((w * ch * bd) / 8)
  const out = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0
      let v = src[x]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      out[y * stride + x] = v & 255
    }
  }
  return { w, h, pixel(x, y) {
    if (ct === 3) { const i = out[y * stride + x]; return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255] }
    const o = y * stride + x * ch
    if (ct === 6) return [out[o], out[o + 1], out[o + 2], out[o + 3]]
    if (ct === 2) return [out[o], out[o + 1], out[o + 2], 255]
    if (ct === 4) return [out[o], out[o], out[o], out[o + 1]]
    return [out[o], out[o], out[o], 255]
  } }
}
