import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const intake = path.resolve(root, '..', 'asset-intake', 'gpt-textures')
const manifestPath = path.join(root, 'assets', 'third-party', 'MANIFEST.json')
const metricsPath = path.join(root, 'assets', 'third-party', 'texture-prep-metrics.json')
const require = createRequire(import.meta.url)
const playwrightRoot = process.env.CODEX_WORKSPACE_NODE_MODULES || path.join(
  os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'
)
const { chromium } = require(path.join(playwrightRoot, 'playwright'))

const SOURCE = '董事会在 ChatGPT 生成，2026-10-22，按 `GPT-texture-redraw-prompts.md` 的提示词；原提示词文本未逐张保存'
const LICENSE = 'AI 生成，由董事会按其账号适用的 OpenAI 使用条款使用；无第三方许可'

const textures = [
  ['office', '1-office-oak-light.png', 'oak-light.jpg', true, false, '浅色橡木'],
  ['office', '2-office-walnut-bar.png', 'walnut-bar.jpg', true, false, '胡桃木吧台'],
  ['office', '3-office-plaster-warm.png', 'plaster-warm.jpg', true, false, '暖白粉刷墙'],
  ['office', '4-office-stone-floor.png', 'stone-floor.jpg', true, false, '浅色石材地面'],
  ['office', '5-office-fabric-cream.png', 'fabric-cream.jpg', true, false, '米色织物'],
  ['office', '6-office-sign-blank.png', 'sign-blank.jpg', false, false, '门头底图'],
  ['office', '7-office-leaf-atlas.png', 'leaf-atlas.png', false, true, '绿植叶片图集'],
  ['campus', '8-campus-floor-concrete.png', 'floor-concrete.jpg', true, false, '仓配混凝土地面'],
  ['campus', '9-campus-asphalt-dock.png', 'asphalt-dock.jpg', true, false, '月台沥青'],
  ['campus', '10-campus-rack-paint.png', 'rack-paint.jpg', false, false, '货架喷漆色带'],
  ['campus', '11-campus-carton-atlas.png', 'carton-atlas.jpg', false, false, '纸箱图集'],
  ['campus', '12-campus-pallet-wrap.png', 'pallet-wrap.jpg', true, false, '托盘缠绕膜'],
  ['campus', '13-campus-truck-livery.png', 'truck-livery.jpg', false, false, '车身涂装'],
  ['campus', '14-campus-palm-atlas.png', 'palm-atlas.png', false, true, '棕榈叶片图集']
].map(([line, input, output, tile, alpha, label]) => ({ line, input, output, tile, alpha, label }))

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase()
const round = (value) => Math.round(value * 100) / 100

async function processInBrowser(page, source, config) {
  return page.evaluate(async ({ source, config }) => {
    const image = await new Promise((resolve, reject) => {
      const item = new Image()
      item.onload = () => resolve(item)
      item.onerror = reject
      item.src = source
    })
    const maxEdge = config.alpha ? 704 : 1024
    let width
    let height
    if (config.tile) {
      width = 1024
      height = 1024
    } else if (config.output === 'sign-blank.jpg') {
      width = 1024
      height = 256
    } else {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
      width = Math.round(image.naturalWidth * scale)
      height = Math.round(image.naturalHeight * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    if (config.tile) {
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      const sx = (image.naturalWidth - side) / 2
      const sy = (image.naturalHeight - side) / 2
      ctx.drawImage(image, sx, sy, side, side, 0, 0, width, height)
    } else if (config.output === 'sign-blank.jpg') {
      const sourceRatio = image.naturalWidth / image.naturalHeight
      const targetRatio = width / height
      if (sourceRatio > targetRatio) {
        const cropWidth = image.naturalHeight * targetRatio
        ctx.drawImage(image, (image.naturalWidth - cropWidth) / 2, 0, cropWidth, image.naturalHeight, 0, 0, width, height)
      } else {
        const cropHeight = image.naturalWidth / targetRatio
        ctx.drawImage(image, 0, (image.naturalHeight - cropHeight) / 2, image.naturalWidth, cropHeight, 0, 0, width, height)
      }
    } else {
      ctx.drawImage(image, 0, 0, width, height)
    }

    const edgeMetric = (data, w, h) => {
      let lr = 0; let lrRef = 0; let tb = 0; let tbRef = 0
      const diff = (a, b) => (Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2])) / 3
      for (let y = 0; y < h; y += 1) {
        const row = y * w * 4
        lr += diff(row, row + (w - 1) * 4)
        for (let x = 0; x < w - 1; x += 1) lrRef += diff(row + x * 4, row + (x + 1) * 4)
      }
      for (let x = 0; x < w; x += 1) {
        const top = x * 4
        const bottom = ((h - 1) * w + x) * 4
        tb += diff(top, bottom)
        for (let y = 0; y < h - 1; y += 1) tbRef += diff((y * w + x) * 4, ((y + 1) * w + x) * 4)
      }
      return { lr: lr / h, tb: tb / w, lrReference: lrRef / (h * (w - 1)), tbReference: tbRef / (w * (h - 1)) }
    }

    const beforeData = ctx.getImageData(0, 0, width, height)
    const before = edgeMetric(beforeData.data, width, height)

    if (config.tile) {
      const base = document.createElement('canvas')
      base.width = width
      base.height = height
      base.getContext('2d').putImageData(beforeData, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const dx = width / 2
      const dy = height / 2
      for (const x of [-dx, dx]) for (const y of [-dy, dy]) ctx.drawImage(base, x, y)

      const pixels = ctx.getImageData(0, 0, width, height)
      const data = pixels.data
      const blendVertical = (center, radius) => {
        for (let y = 0; y < height; y += 1) for (let d = 0; d < radius; d += 1) {
          const left = (y * width + center - 1 - d) * 4
          const right = (y * width + center + d) * 4
          const amount = (1 - d / radius) * 0.5
          for (let c = 0; c < 3; c += 1) {
            const a = data[left + c]; const b = data[right + c]
            data[left + c] = Math.round(a * (1 - amount) + b * amount)
            data[right + c] = Math.round(b * (1 - amount) + a * amount)
          }
        }
      }
      const blendHorizontal = (center, radius) => {
        for (let x = 0; x < width; x += 1) for (let d = 0; d < radius; d += 1) {
          const top = ((center - 1 - d) * width + x) * 4
          const bottom = ((center + d) * width + x) * 4
          const amount = (1 - d / radius) * 0.5
          for (let c = 0; c < 3; c += 1) {
            const a = data[top + c]; const b = data[bottom + c]
            data[top + c] = Math.round(a * (1 - amount) + b * amount)
            data[bottom + c] = Math.round(b * (1 - amount) + a * amount)
          }
        }
      }
      blendVertical(width / 2, 64)
      blendHorizontal(height / 2, 64)
      const edgeRadius = 16
      for (let y = 0; y < height; y += 1) for (let d = 0; d < edgeRadius; d += 1) {
        const left = (y * width + d) * 4
        const right = (y * width + width - 1 - d) * 4
        const amount = (1 - d / edgeRadius) * 0.5
        for (let c = 0; c < 3; c += 1) {
          const a = data[left + c]; const b = data[right + c]
          data[left + c] = Math.round(a * (1 - amount) + b * amount)
          data[right + c] = Math.round(b * (1 - amount) + a * amount)
        }
      }
      for (let x = 0; x < width; x += 1) for (let d = 0; d < edgeRadius; d += 1) {
        const top = (d * width + x) * 4
        const bottom = ((height - 1 - d) * width + x) * 4
        const amount = (1 - d / edgeRadius) * 0.5
        for (let c = 0; c < 3; c += 1) {
          const a = data[top + c]; const b = data[bottom + c]
          data[top + c] = Math.round(a * (1 - amount) + b * amount)
          data[bottom + c] = Math.round(b * (1 - amount) + a * amount)
        }
      }
      ctx.putImageData(pixels, 0, 0)
    }

    let alphaAssessment = null
    if (config.alpha) {
      const pixels = ctx.getImageData(0, 0, width, height)
      const data = pixels.data
      const rawAlpha = new Uint8ClampedArray(width * height)
      let meanR = 0; let meanG = 0; let meanB = 0; let meanCount = 0
      for (let i = 0; i < rawAlpha.length; i += 1) {
        const at = i * 4
        const brightness = Math.max(data[at], data[at + 1], data[at + 2])
        rawAlpha[i] = brightness <= 14 ? 0 : brightness >= 62 ? 255 : Math.round((brightness - 14) / 48 * 255)
        if (rawAlpha[i] > 220) { meanR += data[at]; meanG += data[at + 1]; meanB += data[at + 2]; meanCount += 1 }
      }
      meanR /= meanCount || 1; meanG /= meanCount || 1; meanB /= meanCount || 1
      let visiblePixels = 0; let transparentPixels = 0
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        let alpha = 255
        for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + ox))
          const sy = Math.max(0, Math.min(height - 1, y + oy))
          alpha = Math.min(alpha, rawAlpha[sy * width + sx])
        }
        const at = (y * width + x) * 4
        data[at + 3] = alpha
        if (alpha === 0) transparentPixels += 1
        if (alpha > 0) visiblePixels += 1
        if (alpha > 0 && alpha < 245) {
          const strength = (245 - alpha) / 245 * 0.8
          data[at] = Math.round(data[at] * (1 - strength) + meanR * strength)
          data[at + 1] = Math.round(data[at + 1] * (1 - strength) + meanG * strength)
          data[at + 2] = Math.round(data[at + 2] * (1 - strength) + meanB * strength)
        }
      }
      ctx.putImageData(pixels, 0, 0)
      let fringePixels = 0; let boundaryPixels = 0
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const at = (y * width + x) * 4
        if (data[at + 3] === 0) continue
        let touchesTransparency = false
        for (let oy = -2; oy <= 2 && !touchesTransparency; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + ox))
          const sy = Math.max(0, Math.min(height - 1, y + oy))
          if (data[(sy * width + sx) * 4 + 3] === 0) { touchesTransparency = true; break }
        }
        if (!touchesTransparency) continue
        boundaryPixels += 1
        if (data[at + 1] - Math.max(data[at], data[at + 2]) > 45) fringePixels += 1
      }
      const fringeRatio = fringePixels / Math.max(1, boundaryPixels)
      alphaAssessment = {
        fringePixels,
        fringeRatio,
        transparentRatio: transparentPixels / (width * height),
        status: fringeRatio <= 0.08 && transparentPixels > 0 ? '可用' : '待重绘'
      }
    }

    const mime = config.alpha ? 'image/png' : 'image/jpeg'
    const output = canvas.toDataURL(mime, config.alpha ? undefined : 0.88)
    const thumb = document.createElement('canvas')
    const thumbScale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight))
    thumb.width = Math.max(1, Math.round(image.naturalWidth * thumbScale))
    thumb.height = Math.max(1, Math.round(image.naturalHeight * thumbScale))
    thumb.getContext('2d').drawImage(image, 0, 0, thumb.width, thumb.height)
    const thumbnail = thumb.toDataURL('image/jpeg', 0.76)
    return { output, thumbnail, width, height, before, alphaAssessment }
  }, { source, config })
}

function previewHtml(records, thumbnails) {
  const cards = JSON.stringify(records.map((record, index) => ({ ...record, thumbnail: thumbnails[index] })))
  return `<!doctype html>
<html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AS2-0 贴图检验台</title><link rel="icon" href="data:," /><style>
:root{color-scheme:light;--bg:#f3f0e8;--panel:#fffdf8;--ink:#282620;--muted:#69645a;--line:#d8d0bf;--accent:#ad6b32;--shadow:0 12px 32px #30241014}
[data-theme=dark]{color-scheme:dark;--bg:#171716;--panel:#222220;--ink:#f5f0e7;--muted:#b9b1a4;--line:#45423c;--accent:#e2a46e;--shadow:none}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}button{font:inherit}.shell{width:min(1520px,calc(100% - 32px));margin:auto;padding:28px 0 60px}.head{display:flex;align-items:end;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line);padding-bottom:20px}.eyebrow{letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-size:12px;font-weight:750}.head h1{font:600 clamp(28px,4vw,54px)/1.05 Georgia,serif;margin:6px 0}.head p{margin:0;color:var(--muted);max-width:720px}.theme{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:999px;padding:9px 14px;cursor:pointer}.tabs{display:flex;gap:8px;margin:22px 0}.tab{border:1px solid var(--line);border-radius:999px;padding:9px 16px;background:transparent;color:var(--ink);cursor:pointer}.tab[aria-selected=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:16px;min-width:0}.cardhead{display:flex;justify-content:space-between;gap:12px;align-items:start;margin-bottom:12px}.card h2{font-size:18px;margin:0}.pill{border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:var(--muted);font-size:12px}.views{display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:10px}.view{min-width:0}.view b{display:block;font-size:12px;margin-bottom:6px;color:var(--muted)}.frame{aspect-ratio:1.2;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:repeating-conic-gradient(#dedbd2 0 25%,#f6f2e9 0 50%) 50%/16px 16px}.frame img{width:100%;height:100%;display:block;object-fit:contain}.tile{background-repeat:repeat;background-size:33.333% 33.333%}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.metric{border-top:1px solid var(--line);padding-top:8px;color:var(--muted);font-size:12px}.metric strong{display:block;color:var(--ink);font-size:14px}.status-warn{color:#b34d36!important}.empty{padding:50px 0;color:var(--muted)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(max-width:900px){.grid{grid-template-columns:1fr}.views{grid-template-columns:1fr 1fr}.views .view:last-child{grid-column:1/-1}.head{align-items:start}.meta{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.shell{width:min(100% - 20px,1520px);padding-top:18px}.head{display:block}.theme{margin-top:14px}.views{grid-template-columns:1fr}.views .view:last-child{grid-column:auto}.meta{grid-template-columns:1fr 1fr}.tabs{position:sticky;top:0;z-index:2;background:var(--bg);padding:10px 0}}
</style></head><body><main class="shell"><header class="head"><div><div class="eyebrow">AS2-0 · Static QA</div><h1>贴图检验台</h1><p>原图、处理结果和 3×3 重复面并排检查。所有内容来自本地静态文件；数值为处理脚本实测。</p></div><button class="theme" type="button">切换深浅主题</button></header><nav class="tabs" role="tablist" aria-label="产品线"><button class="tab" role="tab" aria-selected="true" data-line="office">办公区</button><button class="tab" role="tab" aria-selected="false" data-line="campus">仓配</button></nav><section class="grid" aria-live="polite"></section></main><script>
const records=${cards};const grid=document.querySelector('.grid');const format=n=>new Intl.NumberFormat('zh-CN').format(n);function render(line){const items=records.filter(x=>x.productLine===line);grid.innerHTML=items.map(x=>{const before=x.seam?.before;const after=x.seam?.after;const alpha=x.alphaAssessment;return '<article class="card"><div class="cardhead"><div><div class="eyebrow">'+(x.tile?'Seamless':'Atlas / Surface')+'</div><h2>'+x.label+'</h2></div><span class="pill">'+x.outputFile.split('/').pop()+'</span></div><div class="views"><div class="view"><b>原图缩略</b><div class="frame"><img src="'+x.thumbnail+'" alt="'+x.label+' 原图缩略"></div></div><div class="view"><b>处理后</b><div class="frame"><img src="'+x.outputFile+'" alt="'+x.label+' 处理后"></div></div><div class="view"><b>3×3 平铺预览</b><div class="frame tile" style="background-image:url('+x.outputFile+')" role="img" aria-label="'+x.label+' 3×3 平铺"></div></div></div><div class="meta"><div class="metric"><strong>'+x.width+' × '+x.height+'</strong>尺寸</div><div class="metric"><strong>'+format(x.bytes)+' B</strong>文件大小</div><div class="metric"><strong>'+(x.tile?(before.lr.toFixed(2)+' / '+before.tb.toFixed(2)):'不适用')+'</strong>处理前 LR / TB</div><div class="metric"><strong class="'+(alpha?.status==='待重绘'?'status-warn':'')+'">'+(x.tile?(after.lr.toFixed(2)+' / '+after.tb.toFixed(2)):(alpha?.status||'不平铺'))+'</strong>'+(x.tile?'处理后 LR / TB':'Alpha / 类型')+'</div></div></article>'}).join('')||'<p class="empty">没有记录。</p>'}document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));render(tab.dataset.line)}));document.querySelector('.theme').addEventListener('click',()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark');render('office');
</script></body></html>`
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' })
  const page = await browser.newPage()
  const records = []
  const thumbnails = []
  try {
    for (const item of textures) {
      const inputPath = path.join(intake, item.line, item.input)
      const input = await readFile(inputPath)
      const source = `data:image/png;base64,${input.toString('base64')}`
      const result = await processInBrowser(page, source, item)
      const outputDir = path.join(root, 'assets', 'textures', item.line === 'office' ? 'office-v2' : 'dr-campus')
      await mkdir(outputDir, { recursive: true })
      const outputPath = path.join(outputDir, item.output)
      const output = Buffer.from(result.output.split(',')[1], 'base64')
      await writeFile(outputPath, output)

      const decoded = await page.evaluate(async (source) => {
        const image = await new Promise((resolve, reject) => { const x = new Image(); x.onload = () => resolve(x); x.onerror = reject; x.src = source })
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        const metric = (axis) => { let edge = 0; let reference = 0; const count = axis === 'x' ? canvas.height : canvas.width; for (let i = 0; i < count; i += 1) { const a = axis === 'x' ? (i * canvas.width) * 4 : i * 4; const b = axis === 'x' ? (i * canvas.width + canvas.width - 1) * 4 : ((canvas.height - 1) * canvas.width + i) * 4; for (let channel = 0; channel < 3; channel += 1) edge += Math.abs(data[a + channel] - data[b + channel]) / 3 } if (axis === 'x') { for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width - 1; x += 1) for (let channel = 0; channel < 3; channel += 1) reference += Math.abs(data[(y * canvas.width + x) * 4 + channel] - data[(y * canvas.width + x + 1) * 4 + channel]) / 3; return { edge: edge / count, reference: reference / (canvas.height * (canvas.width - 1)) } } for (let y = 0; y < canvas.height - 1; y += 1) for (let x = 0; x < canvas.width; x += 1) for (let channel = 0; channel < 3; channel += 1) reference += Math.abs(data[(y * canvas.width + x) * 4 + channel] - data[((y + 1) * canvas.width + x) * 4 + channel]) / 3; return { edge: edge / count, reference: reference / (canvas.width * (canvas.height - 1)) } }
        const lr = metric('x'); const tb = metric('y'); return { lr: lr.edge, tb: tb.edge, lrReference: lr.reference, tbReference: tb.reference }
      }, result.output)
      const info = await stat(outputPath)
      const productLine = item.line === 'office' ? 'office' : 'campus'
      records.push({
        id: `gpt-texture-${path.parse(item.output).name}`,
        label: item.label,
        productLine,
        outputFile: path.relative(root, outputPath).replaceAll('\\', '/'),
        outputSha256: sha256(output),
        originalFile: path.relative(path.resolve(root, '..'), inputPath).replaceAll('\\', '/'),
        originalSha256: sha256(input),
        source: SOURCE,
        license: LICENSE,
        width: result.width,
        height: result.height,
        bytes: info.size,
        tile: item.tile,
        alpha: item.alpha,
        alphaAssessment: result.alphaAssessment ? {
          status: result.alphaAssessment.status,
          fringeRatio: round(result.alphaAssessment.fringeRatio),
          transparentRatio: round(result.alphaAssessment.transparentRatio)
        } : null,
        seam: item.tile ? {
          before: Object.fromEntries(Object.entries(result.before).map(([key, value]) => [key, round(value)])),
          after: Object.fromEntries(Object.entries(decoded).map(([key, value]) => [key, round(value)])),
          pass: decoded.lr <= decoded.lrReference * 1.5 && decoded.tb <= decoded.tbReference * 1.5
        } : null,
        processing: item.alpha
          ? '长边缩至 704；亮度去黑底；2 px Alpha 腐蚀；边缘向叶片内部均色去溢色；PNG。'
          : item.tile
            ? '中心正方形裁剪至 1024×1024；半幅偏移；64 px 重叠渐变混合；sRGB JPEG，质量 88。'
            : item.output === 'sign-blank.jpg'
              ? '中心裁剪至 1024×256；sRGB JPEG，质量 88。'
              : '保持比例，长边缩至 1024；sRGB JPEG，质量 88。'
      })
      thumbnails.push(result.thumbnail)
    }
  } finally {
    await browser.close()
  }

  const oversized = records.filter((record) => record.bytes > 400 * 1024)
  if (oversized.length) throw new Error(`Processed texture exceeds 400 KB: ${oversized.map((record) => `${record.id}=${record.bytes}`).join(', ')}`)
  const failedSeams = records.filter((record) => record.tile && !record.seam.pass)
  if (failedSeams.length) throw new Error(`Seam acceptance failed: ${failedSeams.map((record) => `${record.id}=${JSON.stringify(record.seam.after)}`).join(', ')}`)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.textures = records
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(metricsPath, `${JSON.stringify({ schemaVersion: 1, generatedBy: 'tools/texture-prep.mjs', textures: records.map(({ id, productLine, outputFile, tile, seam, alphaAssessment }) => ({ id, productLine, outputFile, tile, seam, alphaAssessment })) }, null, 2)}\n`)
  await writeFile(path.join(root, 'texture-preview.html'), previewHtml(records, thumbnails))
  console.log(JSON.stringify(records.map(({ id, width, height, bytes, seam, alphaAssessment }) => ({ id, width, height, bytes, seam, alphaAssessment })), null, 2))
}

await main().catch(async (error) => {
  await Promise.all([
    rm(path.join(root, 'assets', 'textures', 'office-v2'), { recursive: true, force: true }),
    rm(path.join(root, 'assets', 'textures', 'dr-campus'), { recursive: true, force: true })
  ])
  console.error(error.message)
  process.exitCode = 1
})
