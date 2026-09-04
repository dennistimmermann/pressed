import { sanitizeSvg } from './sanitize'
import type { Icon, Rejection } from './types'

/**
 * Iconify JSON is the one interchange format: it is what `@iconify-json/*` ships and what a
 * user exports from any icon set worth importing. Everything else here converts *into* it.
 */
export type IconifyJSON = {
  prefix?: string
  width?: number
  height?: number
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number; hidden?: boolean }>
  aliases?: Record<string, { parent: string; hFlip?: boolean; vFlip?: boolean; rotate?: number }>
}

/** A name becomes a tag (`<icon-recycle />`), so it has to survive as one. */
export const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const TAG = /^[a-z][a-z0-9-]*$/

export function fromIconify(json: IconifyJSON): { icons: Icon[]; rejected: Rejection[] } {
  const icons: Icon[] = []
  const rejected: Rejection[] = []
  const byName = new Map<string, Icon>()

  for (const [name, def] of Object.entries(json.icons ?? {})) {
    // `hidden` is how Iconify keeps a deprecated name resolvable without listing it (Tabler: 48).
    if (def.hidden) continue
    const out = sanitizeSvg(def.body)
    if ('reason' in out) {
      rejected.push({ name, reason: out.reason })
      continue
    }
    const box = `${def.left ?? 0} ${def.top ?? 0} ${def.width ?? json.width ?? 16} ${def.height ?? json.height ?? 16}`
    const icon = { name, viewBox: box, body: out.body }
    byName.set(name, icon)
    icons.push(icon)
  }

  for (const [name, alias] of Object.entries(json.aliases ?? {})) {
    // ponytail: no transforms. A flipped/rotated alias would need a wrapping <g transform>,
    // and nothing in Tabler needs one — drop it rather than draw the icon the wrong way round.
    if (alias.hFlip || alias.vFlip || alias.rotate) continue
    const parent = byName.get(alias.parent)
    if (parent) icons.push({ ...parent, name })
  }

  return { icons, rejected }
}

/** Attributes a user's `<svg>` carries for its whole drawing — kept on a wrapping `<g>` so it still looks right. */
const CARRIED = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-miterlimit', 'fill-rule', 'opacity']

export function fromSvg(name: string, svgText: string): { icon: Icon } | { reason: string } {
  const id = kebab(name)
  if (!TAG.test(id)) return { reason: `“${name}” is not usable as a tag name` }

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return { reason: 'is not well-formed XML' }
  const root = doc.documentElement
  if (root.tagName !== 'svg') return { reason: `starts with <${root.tagName}>, not <svg>` }

  const width = root.getAttribute('width')
  const height = root.getAttribute('height')
  const viewBox = root.getAttribute('viewBox') ?? (width && height ? `0 0 ${parseFloat(width)} ${parseFloat(height)}` : null)
  if (!viewBox) return { reason: 'has no viewBox and no width/height' }

  // Quote-free values only: everything a presentation attribute holds is a keyword, a colour or
  // a number, so skipping the odd one out costs nothing and saves an escaping round.
  const carried = CARRIED.map((attr) => [attr, root.getAttribute(attr)] as const)
    .filter(([, value]) => value && !/["&<]/.test(value))
    .map(([attr, value]) => ` ${attr}="${value}"`)
    .join('')
  const out = sanitizeSvg(carried ? `<g${carried}>${root.innerHTML}</g>` : root.innerHTML)
  return 'reason' in out ? out : { icon: { name: id, viewBox, body: out.body } }
}
