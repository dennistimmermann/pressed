import { subset } from '@pressed/core'

/**
 * The element allowlist *is* `subset.svgElements` (plan decision 5): one source of truth, so a
 * sanitised icon can never fail `validateSubset`. Anything else rejects the whole icon rather
 * than being stripped — a `<defs>`-less icon is a *wrong* icon, and a wrong icon on a printed
 * label is worse than no icon.
 *
 * Browser-only (DOMParser). The app is the only importer; core never reaches for the DOM.
 */
const ELEMENTS = new Set(Object.keys(subset.svgElements))

/** Non-visual: dropping them changes nothing on the label, so they do not cost the icon. */
const DROPPED = new Set(['title', 'desc', 'metadata'])

const ATTRIBUTES = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'viewBox', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-miterlimit',
  'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule',
  'id', 'class',
])

/** `url(…)` points at a `<defs>` the subset does not have; `javascript:` needs no explanation. */
const DANGEROUS = /url\(|javascript:/i

/** The tag travels as the message — `erasableSyntaxOnly` rules out a parameter property. */
class NotInSubset extends Error {}

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, '&quot;')

/**
 * Serialising by hand rather than with XMLSerializer keeps attribute order and self-closing
 * tags exactly as authored (a Tabler body survives byte-identical) and never re-emits an
 * `xmlns` the walk just dropped.
 */
function render(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.nodeValue ?? '')
  if (node.nodeType !== Node.ELEMENT_NODE) return '' // comments, CDATA: nothing to draw
  const el = node as Element
  const tag = el.tagName
  if (DROPPED.has(tag)) return ''
  if (!ELEMENTS.has(tag)) throw new NotInSubset(tag)
  const attrs = el
    .getAttributeNames()
    .filter((name) => ATTRIBUTES.has(name) && !DANGEROUS.test(el.getAttribute(name) ?? ''))
    .map((name) => ` ${name}="${escapeAttr(el.getAttribute(name)!)}"`)
    .join('')
  const inner = [...el.childNodes].map(render).join('')
  return inner ? `<${tag}${attrs}>${inner}</${tag}>` : `<${tag}${attrs}/>`
}

/** Takes inner SVG markup, gives back inner SVG markup — the `<svg>` wrapper is the caller's. */
export function sanitizeSvg(inner: string): { body: string } | { reason: string } {
  // No `xmlns` on the wrapper: with no namespace in play the walk sees tag names as written
  // (`viewBox`, `clipPath`) and nothing re-introduces a namespace declaration on output.
  const doc = new DOMParser().parseFromString(`<svg>${inner}</svg>`, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return { reason: 'is not well-formed XML' }
  try {
    return { body: [...doc.documentElement.childNodes].map(render).join('') }
  } catch (error) {
    if (error instanceof NotInSubset) return { reason: `uses <${error.message}> — not in the render subset` }
    throw error
  }
}
