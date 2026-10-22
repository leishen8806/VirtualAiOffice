// DS-1：office3d/pngmini.mjs 的单元测试。
// 只加测试，不改被测代码；测试自己用 node:zlib 生成 PNG，不读外部文件、不联网。
import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { decodePng } from '../pngmini.mjs'

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** 一个最小 PNG 块；CRC 固定填 0（被测解码器不校验 CRC）。 */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  return out
}

function ihdr(w, h, colorType) {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(w, 0)
  data.writeUInt32BE(h, 4)
  data[8] = 8 // 位深 8（被测解码器只支持这一档）
  data[9] = colorType
  data[10] = 0 // compression
  data[11] = 0 // filter
  data[12] = 0 // interlace：非隔行
  return chunk('IHDR', data)
}

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** 按 PNG 规则对一行做滤波编码（测试侧实现，用来生成覆盖 0–4 的文件）。 */
function filterRow(filter, row, prior, bpp) {
  const out = Buffer.alloc(row.length)
  for (let x = 0; x < row.length; x++) {
    const a = x >= bpp ? row[x - bpp] : 0
    const b = prior ? prior[x] : 0
    const c = x >= bpp && prior ? prior[x - bpp] : 0
    let predictor = 0
    if (filter === 1) predictor = a
    else if (filter === 2) predictor = b
    else if (filter === 3) predictor = (a + b) >> 1
    else if (filter === 4) predictor = paethPredictor(a, b, c)
    out[x] = (row[x] - predictor) & 255
  }
  return out
}

/**
 * 生成 PNG 字节。
 * pixels(x, y) 返回该像素的通道数组（长度由 colorType 决定）。
 */
function encodePng({ w, h, colorType, pixels, filter = 0, palette, trns, idatParts = 1 }) {
  const channels = CHANNELS[colorType]
  assert.ok(channels, `不支持的颜色类型 ${colorType}`)
  const rows = []
  let prior = null
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(w * channels)
    for (let x = 0; x < w; x++) {
      const px = pixels(x, y)
      assert.equal(px.length, channels, `像素 (${x},${y}) 通道数`)
      for (let i = 0; i < channels; i++) row[x * channels + i] = px[i] & 255
    }
    rows.push(Buffer.from([filter]), filterRow(filter, row, prior, channels))
    prior = row
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows))
  const parts = []
  const slice = Math.ceil(compressed.length / Math.max(1, idatParts))
  for (let i = 0; i < idatParts; i++) parts.push(compressed.subarray(i * slice, (i + 1) * slice))
  const out = [SIG, ihdr(w, h, colorType)]
  if (palette) out.push(chunk('PLTE', Buffer.from(palette.flat())))
  if (trns) out.push(chunk('tRNS', Buffer.from(trns)))
  for (const part of parts) if (part.length) out.push(chunk('IDAT', part))
  out.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(out)
}

function assertPixels(img, w, h, expected) {
  assert.equal(img.w, w, 'width')
  assert.equal(img.h, h, 'height')
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = img.pixel(x, y)
      assert.equal(px.length, 4, `pixel(${x},${y}) 返回长度 4 的数组`)
      assert.deepEqual(px, expected(x, y), `像素 (${x},${y})`)
    }
  }
}

test('颜色类型 6（RGBA）：逐像素解码并与原始值一致', () => {
  const w = 4
  const h = 3
  const rgba = (x, y) => [x * 30 + 1, y * 40 + 7, (x + y) * 20, 255 - (x * 5 + y)]
  const png = encodePng({ w, h, colorType: 6, pixels: rgba })
  assert.equal(png.subarray(0, 8).equals(SIG), true, 'PNG 签名')
  const img = decodePng(png)
  assert.equal(img.pixel(0, 0).length, 4, 'pixel 返回 4 通道')
  assertPixels(img, w, h, rgba)
})

test('颜色类型 2（RGB）：第 4 通道恒为 255', () => {
  const w = 3
  const h = 3
  const rgb = (x, y) => [10 + x * 20, 40 + y * 30, 200 - x * 10 - y]
  const png = encodePng({ w, h, colorType: 2, pixels: rgb })
  assertPixels(decodePng(png), w, h, (x, y) => [...rgb(x, y), 255])
})

test('颜色类型 0（灰度）：RGB 三通道相同、alpha 255', () => {
  const w = 3
  const h = 3
  const gray = (x, y) => [20 + x * 15 + y * 5]
  const png = encodePng({ w, h, colorType: 0, pixels: gray })
  assertPixels(decodePng(png), w, h, (x, y) => [gray(x, y)[0], gray(x, y)[0], gray(x, y)[0], 255])
})

test('颜色类型 4（灰度 + alpha）：RGB 取灰度、第 4 通道取 alpha', () => {
  const w = 3
  const h = 4
  const ga = (x, y) => [30 + x * 7, 255 - y * 20]
  const png = encodePng({ w, h, colorType: 4, pixels: ga })
  assertPixels(decodePng(png), w, h, (x, y) => {
    const [g, a] = ga(x, y)
    return [g, g, g, a]
  })
})

test('颜色类型 3（调色板）：有 tRNS 时按索引取 alpha，越界索引 alpha 255', () => {
  const palette = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [9, 9, 9]]
  // tRNS 比调色板短：索引 0/1 有 alpha，2/3 回落 255
  const trns = [0, 128]
  const w = 4
  const h = 3
  const idx = (x, y) => [(x + y) % 4]
  const png = encodePng({ w, h, colorType: 3, pixels: idx, palette, trns })
  const img = decodePng(png)
  assertPixels(img, w, h, (x, y) => {
    const i = (x + y) % 4
    return [...palette[i], trns[i] ?? 255]
  })
})

test('颜色类型 3（调色板）：无 tRNS 时 alpha 恒为 255', () => {
  const palette = [[1, 2, 3], [4, 5, 6]]
  const w = 3
  const h = 3
  const png = encodePng({ w, h, colorType: 3, pixels: (x, y) => [(x + y) % 2], palette })
  assertPixels(decodePng(png), w, h, (x, y) => [...palette[(x + y) % 2], 255])
})

test('五种行滤波 0–4：每张 4×4 图逐像素与原始一致', () => {
  const w = 4
  const h = 4
  // 数值刻意交错，让 Sub/Up/Average/Paeth 的预测器都真正参与
  const rgba = (x, y) => [(x * 53 + y * 29) & 255, (x * 11 + y * 71) & 255, (x * 97 + y * 13) & 255, (x * 7 + y * 3 + 40) & 255]
  for (const filter of [0, 1, 2, 3, 4]) {
    const png = encodePng({ w, h, colorType: 6, pixels: rgba, filter })
    // 确认文件里真的用了这个滤波（首行滤波字节）
    const raw = zlib.inflateSync(Buffer.concat(
      (() => {
        const parts = []
        let p = 8
        while (p < png.length) {
          const len = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8)
          if (type === 'IDAT') parts.push(png.subarray(p + 8, p + 8 + len))
          p += 12 + len
        }
        return parts
      })(),
    ))
    assert.equal(raw[0], filter, `filter ${filter} 的编码字节`)
    assert.equal(raw.length, h * (w * 4 + 1), `filter ${filter} 的扫描线长度`)
    assertPixels(decodePng(png), w, h, rgba)
  }
})

test('Paeth 平局分支：a=b=c 等平局时的预测值仍还原原始像素', () => {
  // a=b=c=0 的平局在原始实现里选 a；变异成严格小于后会改选 b，下面的像素必须因此变红。
  const w = 4
  const h = 4
  const rgba = (x, y) => {
    if (x === 0 || y === 0) return [0, 0, 0, 0]
    // 让 (x-1,y)、(x,y-1)、(x-1,y-1) 的预测输入出现平局：a=b、c=0 等
    return [(x * 17 + y * 31) & 255, (x * 29 + y * 5) & 255, (x === y ? 0 : (x * 13 + y * 23) & 255), 128]
  }
  const png = encodePng({ w, h, colorType: 6, pixels: rgba, filter: 4 })
  assertPixels(decodePng(png), w, h, rgba)
})

test('Paeth 平局定点：a=0,b=3,c=2 时原实现选 a、变异实现选 c', () => {
  // 像素邻域 (left,up,upleft)=(0,3,2)：pa=1,pb=2,pc=1。
  // 原实现 pa<=pc 成立 → 选 a=0；把 <= 改成 < 后会改选 c=2，解码结果偏移 2，本用例必须变红。
  const source = [
    [2, 3, 7],
    [0, 123, 9],
    [5, 6, 4],
  ]
  const png = encodePng({ w: 3, h: 3, colorType: 0, pixels: (x, y) => [source[y][x]], filter: 4 })
  assertPixels(decodePng(png), 3, 3, (x, y) => [source[y][x], source[y][x], source[y][x], 255])
})

test('多个 IDAT 分块拼接后解码结果不变', () => {
  const w = 5
  const h = 4
  const rgb = (x, y) => [(x * 40 + y) & 255, (y * 50 + x) & 255, (x * y * 9) & 255]
  const single = encodePng({ w, h, colorType: 2, pixels: rgb, idatParts: 1 })
  const multi = encodePng({ w, h, colorType: 2, pixels: rgb, idatParts: 3 })
  assert.notEqual(single.length, multi.length)
  const idatCount = (png) => {
    let n = 0, p = 8
    while (p < png.length) { const len = png.readUInt32BE(p); if (png.toString('ascii', p + 4, p + 8) === 'IDAT') n++; p += 12 + len }
    return n
  }
  assert.equal(idatCount(single), 1, '单块 IDAT')
  assert.equal(idatCount(multi), 3, '三块 IDAT')
  const a = decodePng(single)
  const b = decodePng(multi)
  assert.equal(b.w, w)
  assert.equal(b.h, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.deepEqual(b.pixel(x, y), a.pixel(x, y), `(${x},${y})`)
})

test('非法输入：记录当前实际行为并用断言固定', () => {
  let thrown = 0
  const recordThrow = (fn) => { thrown++; return fn() }
  // 空 Buffer / 只有签名：IDAT 为空，zlib.inflateSync 抛 Z_BUF_ERROR
  for (const [name, buf] of [
    ['空 Buffer', Buffer.alloc(0)],
    ['只有 PNG 签名', SIG],
    ['100 字节非 PNG 文本', Buffer.from('x'.repeat(100))],
  ]) {
    recordThrow(() => assert.throws(
      () => decodePng(buf),
      (err) => err instanceof Error && err.code === 'Z_BUF_ERROR',
      `${name} 应抛 Z_BUF_ERROR`,
    ))
  }

  // 长度不足 8 字节的 chunk 头：readUInt32BE 越界，抛 RangeError
  const tooShort = Buffer.concat([SIG, Buffer.from([0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1])])
  recordThrow(() => assert.throws(
    () => decodePng(tooShort),
    (err) => err instanceof RangeError && err.code === 'ERR_OUT_OF_RANGE',
    '截断的 IHDR 应抛 ERR_OUT_OF_RANGE',
  ))

  const nineBytes = Buffer.from('not a png')
  recordThrow(() => assert.throws(
    () => decodePng(nineBytes),
    (err) => err instanceof RangeError && err.code === 'ERR_OUT_OF_RANGE',
    '9 字节非 PNG 应抛 ERR_OUT_OF_RANGE',
  ))
  assert.equal(thrown, 5, '固定 5 类非法输入的当前行为')
})
