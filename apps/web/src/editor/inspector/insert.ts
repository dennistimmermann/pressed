import { parserOptions } from '@vue/compiler-dom'
import { subset, type ElementRule } from '@pressed/core'
import type { ComponentSchema } from '../types'

/** An icon snippet, plus the `<svg>` the badge draws — `null` when the source's markup was
    rejected by the sanitiser and the row falls back to a text badge. */
export type IconSchema = ComponentSchema & { glyph?: string | null }

/** One entry of the insert popup: a library component, a snippet, an icon, or a plain HTML element. */
export type InsertItem = {
  name: string
  kind: 'component' | 'snippet' | 'icon' | 'html' | 'variable'
  /** What is inserted; `|` marks where the caret lands. */
  text: string
  hint: string
  /** Icons only: sanitised `<svg>` markup for the badge. */
  glyph?: string | null
  /** HTML only: allowed only directly inside one of these parents (li → ul/ol). */
  parents?: string[]
  /** Set when the current parent does not allow it: the row stays visible but muted (SPEC §4.8). */
  illegal?: string
}

/**
 * Is this a plain HTML element? The parser already knows every native tag, so ask it instead
 * of keeping a second list in sync. Anything else in a template is a component or a snippet.
 */
export function isHtmlTag(tag: string): boolean {
  return !!parserOptions.isNativeTag?.(tag)
}

/** `<QrCode value="" ecc="M" />` — required props only, bound when they are not strings; caret in the first value. */
export function componentText(item: ComponentSchema): string {
  const attrs = item.props.filter((p) => p.required).map((p) => (p.type === 'string' ? ` ${p.name}="|"` : ` :${p.name}="|"`)).join('')
  const text = `<${item.name}${attrs} />`
  const first = text.indexOf('|')
  return first === -1 ? `<${item.name}${attrs} />|` : text.slice(0, first + 1) + text.slice(first + 1).replaceAll('|', '')
}

/**
 * Everything insertable at a spot whose enclosing element is `parent` (null at the template root).
 * The HTML rows are the render subset's own element list — offer a tag the validator then warns
 * about and the popup is lying. `elements` is that list unless a test hands in a synthetic one.
 */
export function insertItems(
  components: ComponentSchema[],
  snippets: ComponentSchema[],
  parent: string | null,
  elements: Record<string, ElementRule> = subset.elements,
  icons: IconSchema[] = [],
): InsertItem[] {
  const only = parent ? elements[parent]?.children : undefined
  // Inside a parent that only takes specific children the rest is not listed at all; elsewhere a
  // tag with a parent rule stays visible and says why it cannot go here.
  const html: InsertItem[] = Object.entries(elements)
    .filter(([tag]) => !only || only.includes(tag))
    .map(([tag, e]) => ({
      name: tag, kind: 'html', hint: e.hint ?? '', parents: e.parents,
      illegal: e.parents && !(parent !== null && e.parents.includes(parent)) ? `only inside ${e.parents.join(' · ')}` : undefined,
      text: e.void ? `<${tag} />|` : e.inline ? `<${tag}>|</${tag}>` : `<${tag}>\n  |\n</${tag}>`,
    }))
  if (only) return html
  return [
    ...components.map((c) => ({ name: c.name, kind: 'component' as const, hint: c.props.map((p) => p.name).join(' '), text: componentText(c) })),
    ...snippets.map((c) => ({ name: c.name, kind: 'snippet' as const, hint: c.props.map((p) => p.name).join(' '), text: componentText(c) })),
    // After the snippets, before the HTML. No hint: once it is in the file, where the icon came
    // from no longer matters to Insert — the badge says what it is.
    ...icons.map((c) => ({ name: c.name, kind: 'icon' as const, hint: '', text: componentText(c), glyph: c.glyph })),
    ...html,
  ]
}
