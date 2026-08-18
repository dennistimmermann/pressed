import type { ComponentSchema } from '../types'

/** One entry of the insert popup: a library component, a snippet, or a plain HTML element. */
export type InsertItem = {
  name: string
  kind: 'component' | 'snippet' | 'html' | 'variable'
  /** What is inserted; `|` marks where the caret lands. */
  text: string
  hint: string
  /** HTML only: allowed only directly inside one of these parents (li → ul/ol). */
  parents?: string[]
}

/** The everyday HTML for a label, with the parent rules that make the list context-aware. */
const HTML: { tag: string; hint: string; parents?: string[]; children?: string[]; inline?: boolean }[] = [
  { tag: 'div', hint: 'block' },
  { tag: 'span', hint: 'inline', inline: true },
  { tag: 'p', hint: 'paragraph' },
  { tag: 'strong', hint: 'bold', inline: true },
  { tag: 'em', hint: 'italic', inline: true },
  { tag: 'br', hint: 'line break' },
  { tag: 'ul', hint: 'list', children: ['li'] },
  { tag: 'ol', hint: 'numbered list', children: ['li'] },
  { tag: 'li', hint: 'list item', parents: ['ul', 'ol'] },
  { tag: 'table', hint: 'table', children: ['tr', 'thead', 'tbody'] },
  { tag: 'tr', hint: 'row', parents: ['table', 'thead', 'tbody'], children: ['td', 'th'] },
  { tag: 'td', hint: 'cell', parents: ['tr'] },
  { tag: 'th', hint: 'header cell', parents: ['tr'] },
  { tag: 'img', hint: 'image', inline: true },
  { tag: 'hr', hint: 'rule' },
]
const VOID = new Set(['br', 'hr', 'img'])
/** Parents that only accept specific children (inside `ul` you get `li`, nothing else). */
const ONLY_CHILDREN = new Map(HTML.filter((h) => h.children).map((h) => [h.tag, h.children!]))

/** `<QrCode value="" ecc="M" />` — required props only, bound when they are not strings; caret in the first value. */
export function componentText(item: ComponentSchema): string {
  const attrs = item.props.filter((p) => p.required).map((p) => (p.type === 'string' ? ` ${p.name}="|"` : ` :${p.name}="|"`)).join('')
  const text = `<${item.name}${attrs} />`
  const first = text.indexOf('|')
  return first === -1 ? `<${item.name}${attrs} />|` : text.slice(0, first + 1) + text.slice(first + 1).replaceAll('|', '')
}

/** Everything insertable at a spot whose enclosing element is `parent` (null at the template root). */
export function insertItems(components: ComponentSchema[], snippets: ComponentSchema[], parent: string | null): InsertItem[] {
  const only = parent ? ONLY_CHILDREN.get(parent) : undefined
  const html: InsertItem[] = HTML.filter((h) => (only ? only.includes(h.tag) : !h.parents || (parent !== null && h.parents.includes(parent))))
    .map((h) => ({
      name: h.tag, kind: 'html', hint: h.hint, parents: h.parents,
      text: VOID.has(h.tag) ? `<${h.tag} />|` : h.inline ? `<${h.tag}>|</${h.tag}>` : `<${h.tag}>\n  |\n</${h.tag}>`,
    }))
  if (only) return html // inside a list/table row only its own children make sense
  return [
    ...components.map((c) => ({ name: c.name, kind: 'component' as const, hint: c.props.map((p) => p.name).join(' '), text: componentText(c) })),
    ...snippets.map((c) => ({ name: c.name, kind: 'snippet' as const, hint: c.props.map((p) => p.name).join(' '), text: componentText(c) })),
    ...html,
  ]
}
