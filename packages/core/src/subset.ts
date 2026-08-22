import type { SFCDescriptor } from '@vue/compiler-sfc'
import config from './subset.json'
import type { Message } from './types'

/**
 * The approved HTML/CSS subset (docs/render-subset.md), enforced against the *static* markup
 * and CSS of a template. Violations are warnings on the same surface as the purity lint: the
 * label still renders, the Status pane says what the print engine will not honour.
 *
 * ponytail: static text only — a `:style` binding, a computed class or a value built at render
 * time is invisible here. Checking those would mean running the template, which is the
 * renderer's job, not the compiler's.
 */

/** What the config may say about one whitelisted tag. Everything is optional: bare `{}` = allowed. */
export type ElementRule = {
  /** Insert-popup label. */
  hint?: string
  /** Inserted as `<b>|</b>` rather than on three lines. */
  inline?: boolean
  /** Inserted as `<br />`. */
  void?: boolean
  /** Attributes the property editor offers on top of the common ones. */
  attrs?: string[]
  /** Legal only directly inside one of these (`li` → `ul`/`ol`). */
  parents?: string[]
  /** Accepts only these as direct element children. */
  children?: string[]
}

export type SubsetConfig = {
  elements: Record<string, ElementRule>
  svgElements: Record<string, ElementRule>
  properties: Record<string, true | string[] | undefined>
  units: string[]
  functions: string[]
  urlPrefixes: string[]
  pseudoClasses: string[]
  atRules: string[]
}

/** The bundled subset — the one list of tags the validator, the insert popup and the property editor share. */
export const subset = config as unknown as SubsetConfig

type Node = {
  type: number
  tag?: string
  /** 0 = a real HTML/SVG element; anything else is a component, a slot or `<template>`. */
  tagType?: number
  /** 1 = inside an `<svg>` — the parser threads the namespace for us. */
  ns?: number
  props?: { type: number; name?: string; value?: { content?: string }; loc: Loc }[]
  children?: Node[]
  loc: Loc
}
type Loc = { start: { line: number; column: number } }

/** `config` is the bundled subset unless a caller (a test) hands in a synthetic one. */
export function validateSubset(descriptor: SFCDescriptor, file: string, lineBase = 0, config = subset): Message[] {
  const out: Message[] = []
  const at = (line: number, col: number) => (message: string) => out.push({ kind: 'subset', message, file, line: lineBase + line, col })

  const root = descriptor.template?.ast as unknown as Node | undefined
  if (root) walk(root, at, config)

  for (const style of descriptor.styles) scanCss(style.content, style.loc.start.line, at, config)
  return out
}

type Report = (line: number, col: number) => (message: string) => void

// ---------------------------------------------------------------- markup

const tags = (list: string[]) => list.map((t) => `<${t}>`).join('/')

/**
 * `parent` is the nearest enclosing *element* — `<template v-for>` and component call sites are
 * transparent, so `<li>` inside a `v-for` inside a `<ul>` still sees the `<ul>`.
 */
function walk(node: Node, at: Report, s: SubsetConfig, parent?: { tag: string; rule: ElementRule }) {
  let inner = parent
  // `tagType`/`ns` come from the parser: a snippet or library call site is a *component*, not an
  // element, and everything under an `<svg>` carries the SVG namespace.
  if (node.type === 1 /* ELEMENT */) {
    const tag = node.tag ?? ''
    const allowed = node.ns === 1 /* SVG */ ? s.svgElements : s.elements
    if (node.tagType === 0) {
      const say = at(node.loc.start.line, node.loc.start.column)
      const rule = allowed[tag]
      if (!rule) say(`<${tag}> is not in the subset`)
      else {
        if (rule.parents && !(parent && rule.parents.includes(parent.tag)))
          say(`<${tag}> is only allowed inside ${tags(rule.parents)}`)
        if (parent?.rule.children && !parent.rule.children.includes(tag))
          say(`<${parent.tag}> only allows ${tags(parent.rule.children)} here`)
        inner = { tag, rule }
      }
    }

    const style = node.props?.find((p) => p.type === 6 /* ATTRIBUTE */ && p.name === 'style' && p.value?.content)
    if (style) {
      const where = at(style.loc.start.line, style.loc.start.column)
      for (const decl of style.value!.content!.split(';')) checkDeclaration(decl, false, where, s)
    }
  }
  for (const child of node.children ?? []) walk(child, at, s, inner)
}

// ---------------------------------------------------------------- css

/**
 * A flat scan, not a parser: strings, comments and parens are skipped over so a `;` inside a
 * `url(data:…;base64,…)` does not end the declaration. One brace level is a rule; a second is
 * CSS nesting, which the subset does not have.
 */
function scanCss(css: string, lineBase: number, at: Report, s: SubsetConfig) {
  const line = (i: number) => lineBase + css.slice(0, i).split('\n').length - 1
  const col = (i: number) => i - css.lastIndexOf('\n', i - 1)
  const where = (i: number) => at(line(i), col(i))

  let depth = 0
  let parens = 0
  let inAtRule = false
  let buf = ''
  let start = 0

  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end < 0 ? css.length : end + 1
      continue
    }
    if (c === '"' || c === "'") {
      const end = css.indexOf(c, i + 1)
      buf += css.slice(i, end < 0 ? css.length : end + 1)
      i = end < 0 ? css.length : end
      continue
    }
    if (c === '(') parens++
    if (c === ')') parens = Math.max(0, parens - 1)

    if (c === '{' && parens === 0) {
      const prelude = buf.trim()
      // Rules inside an at-rule are that at-rule's business — and it has already been rejected.
      if (depth > 0 && !inAtRule) where(i)('CSS nesting is not in the subset')
      else if (prelude.startsWith('@')) checkAtRule(prelude, where(start), s)
      else checkSelector(prelude, where(start), s)
      if (depth === 0) inAtRule = prelude.startsWith('@')
      depth++
      buf = ''
      start = i + 1
      continue
    }
    if ((c === ';' || c === '}') && parens === 0) {
      const text = buf.trim()
      if (text && depth > 0) checkDeclaration(text, inAtRule, where(start), s)
      else if (text.startsWith('@')) checkAtRule(text, where(start), s) // block-less: `@import "x";`
      if (c === '}') {
        depth = Math.max(0, depth - 1)
        if (depth === 0) inAtRule = false
      }
      buf = ''
      start = i + 1
      continue
    }
    if (!buf.trim()) start = i
    buf += c
  }
}

function checkAtRule(prelude: string, say: (m: string) => void, s: SubsetConfig) {
  const name = /^@([\w-]+)/.exec(prelude)?.[1] ?? ''
  if (!s.atRules.includes(name)) say(`@${name} is not in the subset`)
  else checkValue(prelude, say, s) // `@font-face` has no prelude, but a bad one is still worth naming
}

function checkSelector(selector: string, say: (m: string) => void, s: SubsetConfig) {
  // `:nth-child(2n)` — the argument belongs to the pseudo-class, so it is not a value to check.
  const bare = selector.replace(/\([^)]*\)/g, '')
  if (bare.includes('[')) say('attribute selectors are not in the subset')
  for (const [token, name] of bare.matchAll(/::?([\w-]+)/g))
    if (!s.pseudoClasses.includes(name)) say(`${token} is not in the subset`)
}

/** Inside an at-rule body the names are descriptors (`src`, `font-family`), not properties. */
function checkDeclaration(text: string, inAtRule: boolean, say: (m: string) => void, s: SubsetConfig) {
  const colon = text.indexOf(':')
  if (colon < 0) return
  const prop = text.slice(0, colon).trim().toLowerCase()
  const value = text.slice(colon + 1).trim()
  if (!inAtRule && !prop.startsWith('--')) {
    const allowed = s.properties[prop]
    if (allowed === undefined) return say(`${prop} is not in the subset`)
    // Only enumerated properties restrict their values, and only when the value is one keyword.
    if (Array.isArray(allowed) && /^[a-z-]+$/.test(value) && !allowed.includes(value))
      return say(`${prop}: ${value} is not in the subset`)
  }
  checkValue(value, say, s)
}

function checkValue(value: string, say: (m: string) => void, s: SubsetConfig) {
  // A number followed by letters is a dimension — but not the tail of an identifier (`woff2`)
  // nor a hex colour (`#123abc`).
  for (const [, unit] of value.matchAll(/(?<![\w#-])[\d.]+([a-z%]+)/gi))
    if (!s.units.includes(unit)) say(`unit ${unit} is not in the subset`)
  for (const [, fn] of value.matchAll(/([a-z][\w-]*)\(/gi))
    if (!s.functions.includes(fn)) say(`${fn}() is not in the subset`)
  for (const [, arg] of value.matchAll(/url\(\s*([^)]*)\)/gi)) {
    const target = arg.trim().replace(/^['"]|['"]$/g, '')
    if (!s.urlPrefixes.some((p) => target.startsWith(p)))
      say(`url(${target.slice(0, 24)}…) is not in the subset — only ${s.urlPrefixes.join(' / ')}`)
  }
}
