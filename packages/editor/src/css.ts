import { blockTree, type Block, type Edit } from './ast'

/**
 * The CSS rule at the caret, as text ranges — the style pane's model. No CSS parser: a label's
 * `<style>` is `selector { prop: value; … }` (nested rules allowed); a string/paren-aware split on
 * `;` is all it takes, and every edit is a text-range edit so the source stays the truth.
 */
export type Declaration = { prop: string; value: string; start: number; end: number; valueStart: number; valueEnd: number }
export type Rule = {
  selector: string
  start: number // head start (`.title`)
  end: number // after `}`
  bodyStart: number // after `{`
  bodyEnd: number // at `}`
  declarations: Declaration[]
}

/**
 * One thing an element's styling comes from — a global, element, class or id rule. The
 * Inspector's selector pills are this list in cascade order; `rule` is null when the selector
 * has no rule yet (the first edit creates it). `origin` is the style block the rule lives in:
 * a snippet's name, `null` for the file-level one, `undefined` while there is no rule at all.
 */
export type StyleTarget = {
  kind: 'global' | 'tag' | 'class' | 'id'
  selector: string
  label: string
  rule: Rule | null
  origin?: string | null
}

/** Innermost rule containing `offset` inside any `<style>` block (main or snippet). */
export function ruleAt(source: string, offset: number): Rule | null {
  const TAG = /^<(\w+)/
  let hit: Block | null = null
  const visit = (blocks: Block[], inStyle: boolean) => {
    for (const b of blocks) {
      if (offset < b.start || offset > b.end) continue
      const tag = b.kind === 'sfc' ? TAG.exec(source.slice(b.start, b.end))?.[1] : null
      const style = inStyle || tag === 'style'
      if (b.kind === 'brace' && style) hit = b
      visit(b.children, style)
    }
  }
  visit(blockTree(source), false)
  return hit ? parseRule(source, hit) : null
}

export function parseRule(source: string, b: Block): Rule {
  const open = source.indexOf('{', b.start)
  const bodyStart = open + 1, bodyEnd = b.end - 1
  const holes = b.children.map((c) => [c.start, c.end] as const)
  const declarations: Declaration[] = []
  let i = bodyStart, segStart = bodyStart, depth = 0, quote: string | null = null
  const flush = (end: number) => {
    const text = source.slice(segStart, end)
    const colon = text.indexOf(':')
    if (colon > 0) {
      const prop = text.slice(0, colon).trim()
      const rawValue = text.slice(colon + 1)
      const lead = rawValue.length - rawValue.trimStart().length
      const value = rawValue.trim()
      if (prop && value) {
        const valueStart = segStart + colon + 1 + lead
        const valueEnd = valueStart + value.length
        declarations.push({ prop, value, start: segStart + (text.length - text.trimStart().length), end: valueEnd, valueStart, valueEnd })
      }
    }
    segStart = end + 1
  }
  while (i < bodyEnd) {
    const hole = holes.find(([s]) => s === i)
    if (hole) { i = hole[1]; segStart = i; continue } // nested rule: not a declaration
    const c = source[i]
    if (quote) { if (c === quote) quote = null }
    else if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ';' && depth === 0) flush(i)
    i++
  }
  flush(bodyEnd) // last declaration may lack its `;`
  return { selector: source.slice(b.start, open).trim(), start: b.start, end: b.end, bodyStart, bodyEnd, declarations }
}

/** Set (`value`), or remove (`null`), one declaration of a rule as a single text edit. */
export function setDeclaration(source: string, rule: Rule, prop: string, value: string | null): Edit {
  const d = rule.declarations.find((x) => x.prop === prop)
  if (d) {
    if (value !== null) return { start: d.valueStart, end: d.valueEnd, text: value }
    // Remove `prop: value;` plus the whitespace before it, and the `;` if present.
    let end = d.end
    if (source[end] === ';') end++
    let start = d.start
    while (start > rule.bodyStart && /\s/.test(source[start - 1])) start--
    return { start, end, text: '' }
  }
  if (value === null) return { start: rule.bodyEnd, end: rule.bodyEnd, text: '' }
  // Append before `}`: multi-line rules get their own line, one-liners stay one line.
  const body = source.slice(rule.bodyStart, rule.bodyEnd)
  const multi = body.includes('\n')
  const last = rule.declarations.at(-1)
  const semi = last && source[last.end] !== ';' ? ';' : ''
  const at = last ? (source[last.end] === ';' ? last.end + 1 : last.end) : rule.bodyStart
  const indent = multi ? (/\n([ \t]*)\S/.exec(body)?.[1] ?? '  ') : ''
  return { start: at, end: at, text: multi ? `${semi}\n${indent}${prop}: ${value};` : `${semi} ${prop}: ${value};` }
}

/** `12mm` → { n: 12, unit: 'mm' }; anything else null. */
export function parseLength(value: string | undefined): { n: number; unit: string } | null {
  const m = value && /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim())
  return m ? { n: Number(m[1]), unit: m[2] || '' } : null
}

/** All rules (top level, in order) of the `<style>` block that contains `at` — or of the first `<style>` in [from,to). */
export function rulesIn(source: string, from: number, to: number): Rule[] {
  const TAG = /^<(\w+)/
  const out: Rule[] = []
  const visit = (blocks: Block[], inStyle: boolean) => {
    for (const b of blocks) {
      if (b.end < from || b.start > to) continue
      const tag = b.kind === 'sfc' ? TAG.exec(source.slice(b.start, b.end))?.[1] : null
      const style = inStyle || tag === 'style'
      if (b.kind === 'brace' && style) out.push(parseRule(source, b))
      else visit(b.children, style)
    }
  }
  visit(blockTree(source), false)
  return out
}

/** The rule whose selector list contains `.cls` exactly (`.a, .b { }` matches both). */
export function findRule(rules: Rule[], cls: string): Rule | undefined {
  return rules.find((r) => r.selector.split(',').some((part) => part.trim() === `.${cls}`))
}
