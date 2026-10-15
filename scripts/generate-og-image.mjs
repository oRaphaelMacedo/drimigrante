// Gera public/og-image.jpg (1200×630) a partir de scripts/og-image.html.
// Uso: node scripts/generate-og-image.mjs
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(dir, 'og-image.html')
const out = path.join(dir, '..', 'public', 'og-image.jpg')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(`file://${src}`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
console.log(`OG image gerada: ${out}`)
