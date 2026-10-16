// Gera os ícones do app (favicon, PWA e Apple) a partir do monograma "DI" em #1f41c7.
//
// Uso: node scripts/generate-icons.mjs
//      CHROMIUM_PATH=/caminho/do/chrome node scripts/generate-icons.mjs
//      (CHROMIUM_PATH só é necessário se o Chromium da versão do Playwright não
//       estiver instalado — alternativa: npx playwright install chromium)
//
// Fonte única da verdade: a geometria abaixo. O script escreve:
//   public/logo.svg, public/favicon.svg          (vetoriais, cantos arredondados)
//   public/pwa-192x192.png, public/pwa-512x512.png (purpose "any", cantos arredondados)
//   public/maskable-icon-512x512.png             (purpose "maskable", sangria total, safe zone de 80%)
//   public/apple-touch-icon.png (180×180)        (sangria total: o iOS arredonda sozinho)
//   public/favicon.ico (16, 32 e 48 px, PNG dentro do ICO)
// Renderização local com o Chromium do Playwright (nenhum serviço externo).
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BRAND = '#1f41c7'
const INK = '#ffffff'
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Monograma "DI" num quadro de 512×512, centrado (caixa 286×220).
// D: haste reta + semicírculo (raio externo 110, interno 54); I: haste de 56.
const MONOGRAM = [
  `<path fill="${INK}" fill-rule="evenodd" d="M113 146H203A110 110 0 0 1 203 366H113ZM169 202V310H203A54 54 0 0 0 203 202Z"/>`,
  `<rect x="343" y="146" width="56" height="220" fill="${INK}"/>`,
].join('')

/** @param {{ rounded: boolean, scale?: number, size?: number, title?: boolean }} opts */
function iconSvg({ rounded, scale = 1, size, title = false }) {
  const dims = size ? ` width="${size}" height="${size}"` : ''
  const a11y = title ? ' role="img" aria-labelledby="title"' : ' aria-hidden="true"'
  const bg = rounded
    ? `<rect width="512" height="512" rx="112" fill="${BRAND}"/>`
    : `<rect width="512" height="512" fill="${BRAND}"/>`
  const glyphs = scale === 1 ? MONOGRAM : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${MONOGRAM}</g>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${dims}${a11y}>` +
    (title ? '<title id="title">Doutor Imigrante</title>' : '') +
    bg +
    glyphs +
    '</svg>'
  )
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ deviceScaleFactor: 1 })

/** Rasteriza um SVG em PNG de size×size (fundo transparente fora do desenho). */
async function renderPng(svg, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`,
  )
  return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

/** Monta um .ico com PNGs embutidos (suportado por todos os navegadores atuais). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // tipo: ícone
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + images.length * 16
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // paleta
    entry.writeUInt8(0, 3) // reservado
    entry.writeUInt16LE(1, 4) // planos
    entry.writeUInt16LE(32, 6) // bits por pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const roundedSvg = iconSvg({ rounded: true })
const outputs = []

async function save(name, data) {
  await writeFile(path.join(publicDir, name), data)
  outputs.push(name)
}

await save('logo.svg', iconSvg({ rounded: true, size: 512, title: true }) + '\n')
await save('favicon.svg', iconSvg({ rounded: true }) + '\n')
await save('pwa-192x192.png', await renderPng(roundedSvg, 192))
await save('pwa-512x512.png', await renderPng(roundedSvg, 512))
await save('maskable-icon-512x512.png', await renderPng(iconSvg({ rounded: false, scale: 0.84 }), 512))
await save('apple-touch-icon.png', await renderPng(iconSvg({ rounded: false, scale: 0.92 }), 180))

const icoSizes = [16, 32, 48]
const icoImages = []
for (const size of icoSizes) icoImages.push({ size, data: await renderPng(roundedSvg, size) })
await save('favicon.ico', buildIco(icoImages))

await browser.close()
console.log(`Ícones gerados em ${publicDir}:\n- ${outputs.join('\n- ')}`)
