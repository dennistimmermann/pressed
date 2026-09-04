import type { RenderedLabel } from '../types'

/**
 * A label is always the same standalone HTML document, whether it goes to the on-screen
 * preview (iframe), the browser print dialog (iframe) or the rasterizer (SVG foreignObject).
 * That keeps the app's own CSS out of labels — and the label is never themed: black on white,
 * sized in real millimetres.
 */
/**
 * The base stylesheet under every label. `div` is a vertical stack by default (the auto-layout
 * reading of a container: children stretch, `gap` works, margins do not collapse) — at zero
 * specificity, so any rule a template writes wins without `!important`. Only `div`: `span`
 * stays inline text, `li`/`table` keep their own display, `br` keeps breaking.
 */
const BASE = 'html,body{margin:0;padding:0}:where(div){display:flex;flex-direction:column}'

/**
 * Every document carries a CSP, because a template must never load from or phone home to the
 * network (invariant 7) — and a null-origin frame only stops it reaching the *app*, not the
 * outside. Print documents forbid script outright: the print iframe is same-origin (so `print()`
 * is callable). Preview and thumbnail documents allow inline script only, for the app's own
 * inspector script (spec §4.3). The raster path never loads the document as a page — it lifts
 * `<style>` and body into a `<foreignObject>` — so the meta is inert there.
 */
const NETWORK = `default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'`
const CSP = `<meta http-equiv="Content-Security-Policy" content="${NETWORK}">`
const PREVIEW_CSP = `<meta http-equiv="Content-Security-Policy" content="${NETWORK}; script-src 'unsafe-inline'">`

type Size = { width: number; height: number }

/**
 * How the label sits on the medium — imposition, not design: the template never knows. A wide
 * label on a narrow roll is printed at 90°, and everything downstream sees the swapped box.
 */
export type Rotation = 0 | 90 | 180 | 270

/** The footprint a rotated label occupies: the quarter turns swap the axes, the half turn does not. */
export const rotatedSize = (size: Size, rotation: Rotation = 0): Size =>
  rotation % 180 ? { width: size.height, height: size.width } : size

/**
 * The turn applied to the label's own box, which keeps its true millimetres. The quarter turns
 * pivot on the top-left corner and then push the swung content back over the origin, so the
 * painted result lands exactly on `rotatedSize`; the half turn spins about the centre.
 */
const ROTATE: Record<number, (size: Size) => string> = {
  90: (s) => `;transform-origin:top left;transform:rotate(90deg) translateY(-${s.height}mm)`,
  180: () => `;transform:rotate(180deg)`,
  270: (s) => `;transform-origin:top left;transform:rotate(270deg) translateX(-${s.width}mm)`,
}

/**
 * The one `.label` recipe: a hard-sized, clipping box in millimetres. `extra` places it.
 *
 * `margin` is the unprintable inset (meta `margin`, mm): with `box-sizing:border-box` the box
 * keeps its size and the content is pushed in, and `overflow:hidden` clips whatever still
 * reaches past it. Inline, so it beats a template's own `.label { padding }` — the safe area is
 * a guarantee, not a suggestion. Omitted at 0 so a template that pads itself keeps doing so.
 *
 * Rotated, the placement moves out to a `.slot` wrapper of the rotated size and `.label` keeps
 * its own — a template's `.label` rules never have to know which way up the medium is.
 */
const labelDiv = (html: string, size: Size, extra = '', margin = 0, rotation: Rotation = 0) => {
  const box = `width:${size.width}mm;height:${size.height}mm;overflow:hidden;box-sizing:border-box${margin ? `;padding:${margin}mm` : ''}`
  if (!rotation) return `<div class="label" style="${box}${extra}">${html}</div>`
  const slot = rotatedSize(size, rotation)
  return (
    `<div class="slot" style="position:relative;width:${slot.width}mm;height:${slot.height}mm;overflow:hidden${extra}">` +
    `<div class="label" style="${box};position:absolute;left:0;top:0${ROTATE[rotation](size)}">${html}</div></div>`
  )
}

export function labelDocument(
  label: { html: string | string[]; css: string },
  size: Size,
  forPrint = false,
  margin = 0,
  rotation: Rotation = 0,
): string {
  const labels = (Array.isArray(label.html) ? label.html : [label.html])
    .map((html) => labelDiv(html, size, '', margin, rotation))
    .join('\n')
  const sheet = rotatedSize(size, rotation)
  const page = forPrint
    ? `@page { size: ${sheet.width}mm ${sheet.height}mm; margin: 0 } .label,.slot { page-break-after: always }`
    : ''
  return `<!doctype html><meta charset="utf-8">${forPrint ? CSP : PREVIEW_CSP}<style>${BASE}${page}\n${label.css}</style>${labels}`
}

/** A grid of labels on a cut sheet, in millimetres. Margins are the leading offsets. */
export type SheetLayout = {
  format: 'A4' | 'Letter'
  countH: number
  countV: number
  gapH: number
  gapV: number
  /** Per-axis origin: centered computes itself; left/top are placed by their margin. */
  alignH: 'center' | 'left'
  alignV: 'center' | 'top'
  marginTop: number
  marginLeft: number
}

/** One set of labels across a continuous roll. `gap` is the printer's advance *between* sets. */
export type RollLayout = { across: number; down: number; marginH: number; marginV: number; gap: number }

export const PAGE_FORMATS = { A4: { width: 210, height: 297 }, Letter: { width: 215.9, height: 279.4 } }

/**
 * Labels imposed on cut sheets for the browser print dialog: `@page` is the sheet, every label
 * is absolutely placed in millimetres, filled entry-major (left→right, top→bottom) and spilling
 * onto as many pages as it takes.
 */
/** The grid's outer size in mm — counts and gaps, no margins. */
export function sheetExtent(sheet: SheetLayout, size: Size) {
  return {
    width: sheet.countH * size.width + (sheet.countH - 1) * sheet.gapH,
    height: sheet.countV * size.height + (sheet.countV - 1) * sheet.gapV,
  }
}

/** Top-left corner of the grid on the page, mm — each axis aligned on its own. */
export function sheetOrigin(sheet: SheetLayout, size: Size) {
  const paper = PAGE_FORMATS[sheet.format]
  const extent = sheetExtent(sheet, size)
  return {
    left: sheet.alignH === 'left' ? sheet.marginLeft : (paper.width - extent.width) / 2,
    top: sheet.alignV === 'top' ? sheet.marginTop : (paper.height - extent.height) / 2,
  }
}

export function sheetDocument(
  label: { html: string | string[]; css: string },
  size: Size,
  sheet: SheetLayout,
  margin = 0,
  rotation: Rotation = 0,
): string {
  const paper = PAGE_FORMATS[sheet.format]
  const perPage = Math.max(1, sheet.countH * sheet.countV)
  const html = Array.isArray(label.html) ? label.html : [label.html]
  // Every millimetre of the grid is the label's footprint on the paper — the rotated one.
  const box = rotatedSize(size, rotation)
  const origin = sheetOrigin(sheet, box)

  const pages: string[] = []
  for (let start = 0; start < html.length; start += perPage) {
    const slots = html.slice(start, start + perPage).map((one, k) => {
      const left = origin.left + (k % sheet.countH) * (box.width + sheet.gapH)
      const top = origin.top + Math.floor(k / sheet.countH) * (box.height + sheet.gapV)
      return labelDiv(one, size, `;position:absolute;left:${left}mm;top:${top}mm`, margin, rotation)
    })
    pages.push(
      `<div class="page" style="position:relative;width:${paper.width}mm;height:${paper.height}mm;overflow:hidden;page-break-after:always">${slots.join('')}</div>`,
    )
  }
  const page = `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0 }`
  return `<!doctype html><meta charset="utf-8">${CSP}<style>${BASE}${page}\n${label.css}</style>${pages.join('\n')}`
}

/**
 * One roll *set* — `across × down` labels the printer burns as a single bitmap, so the app can
 * hand it to `rasterize` as if it were one big label. `roll.gap` is deliberately not part of
 * this geometry: it is the advance between sets, and the TSPL encoder owns it.
 */
export function setDocument(
  label: { html: string[]; css: string },
  size: Size,
  roll: RollLayout,
  margin = 0,
  rotation: Rotation = 0,
): { html: string; css: string; size: Size } {
  const box = rotatedSize(size, rotation)
  const set = {
    width: roll.across * box.width + (roll.across - 1) * roll.marginH,
    height: roll.down * box.height + (roll.down - 1) * roll.marginV,
  }
  const slots = label.html.map((one, k) => {
    const left = (k % roll.across) * (box.width + roll.marginH)
    const top = Math.floor(k / roll.across) * (box.height + roll.marginV)
    return labelDiv(one, size, `;position:absolute;left:${left}mm;top:${top}mm`, margin, rotation)
  })
  return {
    html: `<div class="set" style="position:relative;width:${set.width}mm;height:${set.height}mm">${slots.join('')}</div>`,
    css: label.css,
    size: set,
  }
}

export type { RenderedLabel }
