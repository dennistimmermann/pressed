import { labelDocument } from '@pressed/core/template/label.ts'
import { toBits } from '@pressed/core/raster/dither.ts'
import type { Meta, PrinterProfile, RenderedLabel } from '@pressed/core'

const CSS_PX_PER_MM = 96 / 25.4

/**
 * Render one label document to printer-resolution pixels. Millimetres are the model; this is
 * the one place they become dots (`mm * dpi / 25.4`).
 *
 * ponytail: `<foreignObject>` in an SVG image — no dependency, but web fonts and external
 * images do not load inside it (that is why templates bundle assets as data URLs). Swap for
 * html-to-image if that ever stops being enough.
 */
export async function rasterize(label: RenderedLabel, size: Meta['size'], profile: PrinterProfile, margin = 0): Promise<ImageData> {
  const dotsPerMm = profile.dpi / 25.4
  const w = Math.min(Math.round(size.width * dotsPerMm), profile.maxDots)
  const h = Math.round(size.height * dotsPerMm)

  // XMLSerializer turns the (possibly sloppy) HTML into well-formed XHTML for foreignObject.
  const doc = new DOMParser().parseFromString(labelDocument(label, size, false, margin), 'text/html')
  const body = new XMLSerializer().serializeToString(doc.body)
  const style = new XMLSerializer().serializeToString(doc.head)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale(${dotsPerMm / CSS_PX_PER_MM});transform-origin:0 0;background:#fff">${style}${body}</div>
    </foreignObject></svg>`

  const img = new Image()
  // data: URL, not blob: — Chrome taints the canvas for blob-URL SVGs with <foreignObject>.
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

/** `data-loc` / `data-inst` only exist so canvas clicks find their source; never on paper. */
export const stripDataLoc = (html: string) => html.replace(/ data-(loc|inst)="[^"]*"/g, '')

/**
 * The same 1-bit bitmap the printer burns, as a PNG data URL for the preview's Raster view.
 * Renders through the identical path as printing — that is the point of the toggle.
 */
export async function rasterDataUrl(label: RenderedLabel, size: Meta['size'], profile: PrinterProfile, margin = 0): Promise<string> {
  const image = await rasterize({ html: stripDataLoc(label.html), css: label.css }, size, profile, margin)
  const bits = toBits(image, true) // 1 = black, so the loop below reads as "ink"
  const bytesPerRow = Math.ceil(image.width / 8)
  const out = new ImageData(image.width, image.height)
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const ink = (bits[y * bytesPerRow + (x >> 3)] >> (7 - (x & 7))) & 1
      out.data.set(ink ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * image.width + x) * 4)
    }
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(out, 0, 0)
  return canvas.toDataURL('image/png')
}
