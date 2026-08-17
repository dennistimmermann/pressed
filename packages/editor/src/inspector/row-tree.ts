/**
 * The variables tree: the example row is the primary source (the user is reading their data,
 * design §3.2), the `Row` type text fills in fields the example happens not to carry.
 *
 * ponytail: the type text is parsed with brace counting, not a TS parser — `{ a: string; b: { c } }`
 * and `X[]` are all a row type ever is. If a source ever ships generics or unions of objects,
 * swap this for the `typescript` package that Volar already loads.
 */
export type VarNode = {
  name: string
  /** Insertable expression, e.g. `row.filament.vendor.name`. */
  path: string
  depth: number
  kind: 'object' | 'leaf'
  /** Example value for a leaf, `{ … }` / `[n]` for an object. */
  value: string
  children: VarNode[]
}

export function buildTree(rowType: string, row: unknown): VarNode[] {
  return childrenOf(rowType, row, 'row', 0)
}

function childrenOf(typeText: string | undefined, value: unknown, path: string, depth: number): VarNode[] {
  const members = parseMembers(typeText)
  const object = isObject(value) ? value : {}
  const names = [...new Set([...Object.keys(object), ...Object.keys(members)])]
  return names.map((name) => node(name, members[name], object[name], `${path}.${name}`, depth))
}

function node(name: string, typeText: string | undefined, value: unknown, path: string, depth: number): VarNode {
  if (Array.isArray(value)) {
    // Arrays are shown as `[n]`; the first element stands for all of them.
    const children = childrenOf(elementType(typeText), value[0], `${path}[0]`, depth + 1)
    if (children.length) return { name, path, depth, kind: 'object', value: `[${value.length}]`, children }
  } else if (isObject(value) || isObjectType(typeText)) {
    const children = childrenOf(typeText, value, path, depth + 1)
    if (children.length) return { name, path, depth, kind: 'object', value: '{ … }', children }
  }
  return { name, path, depth, kind: 'leaf', value: format(value), children: [] }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isObjectType(typeText: string | undefined): boolean {
  return !!typeText?.trimStart().startsWith('{')
}

function format(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (Array.isArray(value)) return `[${value.length}]`
  if (typeof value === 'object') return '{ … }'
  return String(value)
}

/** `X[]` / `Array<X>` → `X`. */
function elementType(typeText: string | undefined): string | undefined {
  if (!typeText) return undefined
  const text = typeText.trim()
  if (text.endsWith('[]')) return text.slice(0, -2)
  return /^Array<([\s\S]*)>$/.exec(text)?.[1] ?? undefined
}

/** `{ a: string; b: { c: number } }` → `{ a: 'string', b: '{ c: number }' }`. */
export function parseMembers(typeText: string | undefined): Record<string, string> {
  const text = typeText?.trim() ?? ''
  if (!text.startsWith('{') || !text.endsWith('}')) return {}
  const body = text.slice(1, -1)
  const out: Record<string, string> = {}
  for (const member of splitMembers(body)) {
    const match = /^\s*(\w+)\s*\??\s*:\s*([\s\S]+)$/.exec(member)
    if (match) out[match[1]] = match[2].trim()
  }
  return out
}

/** Split on `;` and newlines that are not nested in braces, brackets or parens. */
function splitMembers(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '{' || c === '[' || c === '(' || c === '<') depth++
    else if (c === '}' || c === ']' || c === ')' || c === '>') depth--
    else if (depth === 0 && (c === ';' || c === ',' || c === '\n')) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts.filter((p) => p.trim())
}

/** Flatten for rendering: collapsed objects hide their subtree; a filter shows every match. */
export function flatten(nodes: VarNode[], collapsed: Set<string>, filter: string): VarNode[] {
  const needle = filter.trim().toLowerCase()
  const out: VarNode[] = []
  const walk = (list: VarNode[]) => {
    for (const node of list) {
      if (needle) {
        if (node.kind === 'leaf' && node.path.toLowerCase().includes(needle)) out.push(node)
        walk(node.children)
      } else {
        out.push(node)
        if (!collapsed.has(node.path)) walk(node.children)
      }
    }
  }
  walk(nodes)
  return out
}
