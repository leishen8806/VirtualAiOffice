import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const output = process.env.ENV_SNAPSHOT_OUT
if (!output) throw new Error('ENV_SNAPSHOT_OUT is required')

const browser = await chromium.launch({ channel: 'chrome', headless: false })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.route('**/state*', route => route.abort())
  await page.goto('http://office.localhost:3200/?q=high', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__office?.scene, null, { timeout: 90_000 })
  const snapshot = await page.evaluate(() => {
    const round = value => Math.round(value * 1e9) / 1e9
    return window.__office.scene.children.map((object, order) => ({
      order,
      name: object.name || '',
      type: object.type,
      position: object.position.toArray().map(round),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map(round),
      scale: object.scale.toArray().map(round),
      children: object.children.length,
      geometry: object.geometry?.type || '',
      material: Array.isArray(object.material) ? object.material.map(item => item?.type || '') : object.material?.type || '',
      color: Array.isArray(object.material) ? '' : object.material?.color?.getHexString?.() || '',
      instances: object.isInstancedMesh ? object.count : 0,
    }))
  })
  await writeFile(output, JSON.stringify(snapshot, null, 2))
  console.log(`ENV_SNAPSHOT ${snapshot.length} ${output}`)
} finally {
  await browser.close()
}
