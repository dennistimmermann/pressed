import type { Message } from '@pressed/core'
import { DEFAULT_FONT } from '@pressed/core/template/label.ts'
import { facesOf, isBundled, type Face } from './catalogue'

/**
 * Fonts by name (spec §4.1): find every family a rendered label names, embed the bundled faces
 * as data-URL `@font-face` rules — the only form that survives preview, print and raster alike —
 * and warn about what cannot be resolved (spec §4.2: no system fonts).
 */

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', 'inherit', 'initial', 'unset', 'revert',
])

// A `font:` shorthand is `[style weight …] size[/line-height] family`: the size is the first token
// with a unit or a size keyword, and the family is everything after it.
const SIZE = /(?:^|\s)(?:\d[\d.]*(?:pt|px|mm|cm|in|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\/\S+)?\s+(.+)$/
const DECLARATION = /\bfont(-family)?\s*:\s*([^;}]+)/g
const FONT_FACE = /@font-face\s*\{([^}]*)\}/g

const CUSTOM = /(--[\w-]+)\s*:\s*([^;}]+)/g

const unquote = (s: string) => s.trim().replace(/^['"]|['"]$/g, '').trim()

/** A template's own `--sans: …` tokens, substituted into every `var(--sans)` — a few passes for chains. */
function resolveVars(text: string): string {
  const vars = new Map([...text.matchAll(CUSTOM)].map(([, name, value]) => [name, value.trim()]))
  if (!vars.size) return text
  let out = text
  for (let pass = 0; pass < 3 && /var\(/.test(out); pass++)
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (whole, name: string, fallback?: string) => vars.get(name) ?? fallback ?? whole)
  return out
}

/** The inline styles of rendered markup as one CSS text; Vue writes a bound style's quotes as entities. */
export const inlineStyles = (html: string) =>
  [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1].replace(/&quot;|&#39;/g, "'")).join(';\n')

/** The family lists named by `font-family:` declarations and `font:` shorthands in CSS text. */
export function familiesIn(css: string): string[][] {
  // One kind of quote, so a value can be cut at `;` and `}` without a string parser.
  const plain = resolveVars(css.replace(/"/g, "'"))
  const out: string[][] = []
  for (const [, longhand, value] of plain.matchAll(DECLARATION)) {
    const families = longhand ? value : SIZE.exec(value)?.[1]
    if (families) out.push(families.split(',').map(unquote).filter(Boolean))
  }
  return out
}

/** Which faces a label needs and what it names that nothing provides. The default is always in. */
export function planFonts(css: string, html: string[]): { faces: Face[]; messages: Message[] } {
  const declared = new Set<string>()
  const own = css.replace(FONT_FACE, (_, body: string) => {
    for (const list of familiesIn(body)) for (const f of list) declared.add(f.toLowerCase())
    return ''
  })
  const wanted = new Set([DEFAULT_FONT])
  const messages = new Map<string, Message>()
  // One text, so a `var(--sans)` in an inline style resolves against the stylesheet's tokens.
  for (const list of familiesIn([own, ...html.map(inlineStyles)].join('\n'))) {
    const hit = list.find((f) => isBundled(f) || declared.has(f.toLowerCase()))
    if (hit) {
      if (isBundled(hit)) wanted.add(hit)
      continue
    }
    const named = list.find((f) => !GENERIC.has(f.toLowerCase()))
    const message = named
      ? `font "${named}" is not bundled — pick one from the font list, or bundle it as an asset with @font-face`
      : `font "${list[0]}" is a system font and prints differently on every machine — pick a bundled one`
    messages.set(message, { kind: 'purity', message, file: 'main' })
  }
  return { faces: [...wanted].flatMap(facesOf), messages: [...messages.values()] }
}

// One fetch per face for the life of the app; a face is ~20–80 KB and every render wants it again.
const rules = new Map<Face, Promise<string>>()

function rule(face: Face): Promise<string> {
  let pending = rules.get(face)
  if (!pending) {
    pending = face.url().then(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      return `@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};src:url(data:font/woff2;base64,${base64(bytes)}) format("woff2")}`
    })
    rules.set(face, pending)
  }
  return pending
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** The label's CSS with the `@font-face` rules it needs in front, plus the font warnings. */
export async function embedFonts(label: { css: string; html: string[] }): Promise<{ css: string; messages: Message[] }> {
  const { faces, messages } = planFonts(label.css, label.html)
  const faceRules = await Promise.all(faces.map(rule))
  return { css: `${faceRules.join('\n')}\n${label.css}`, messages }
}
