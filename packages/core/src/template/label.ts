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

export function labelDocument(
  label: { html: string | string[]; css: string },
  size: { width: number; height: number },
  forPrint = false,
): string {
  const labels = (Array.isArray(label.html) ? label.html : [label.html])
    .map((html) => `<div class="label" style="width:${size.width}mm;height:${size.height}mm;overflow:hidden;box-sizing:border-box">${html}</div>`)
    .join('\n')
  const page = forPrint
    ? `@page { size: ${size.width}mm ${size.height}mm; margin: 0 } .label { page-break-after: always }`
    : ''
  return `<!doctype html><meta charset="utf-8"><style>${BASE}${page}\n${label.css}</style>${labels}`
}

export type { RenderedLabel }
