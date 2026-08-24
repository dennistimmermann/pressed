import { computed, shallowRef } from 'vue'
import { elementAt } from '@/editor/ast.ts'
import { ruleAt, setDeclaration } from '@/editor/css.ts'
import type { Edit, Loc } from '@/editor/ast.ts'
import type { Meta } from '@pressed/core'
import { applyEdits, editor, element, meta, scopeTemplate, tabs } from './state'
import { enterScope, goToOffset } from './navigation'
import { ensureSelector, ruleAtCaret, styleTargets } from './style'
import { reparent } from './structure'
import { ruleUsage } from './inspector'

/**
 * The snippet block we are scoped to — what the canvas keeps at full strength while
 * everything else drops to 32%. `null` in the label scope: nothing is out of scope there.
 */
export const scopeRange = computed<Loc | null>(() => {
  const s = tabs.value.snippets.find((x) => x.name === editor.activeTab.scope)
  return s ? { start: s.start, end: s.end } : null
})

/** Selecting across scopes is impossible (SPEC §6), so only ranges in this scope's template count. */
const inScope = (loc: Loc) => {
  const b = scopeTemplate.value
  return !!b && loc.start >= b.start && loc.end <= b.end
}

/**
 * A canvas click sends the whole ancestor chain (innermost first, a snippet's root carrying
 * both its own range and its call site's): the first range that belongs to this scope is the
 * element the click means. In the label scope that is the `<badge …>` call, inside the badge
 * scope it is the element the snippet itself declares.
 */
const pickLoc = (locs: Loc[]) => locs.find(inScope) ?? null

export function canvasSelect(locs: Loc[]) {
  const loc = pickLoc(locs)
  if (loc) goToOffset(loc.start, loc.end)
}

/** Double-click a snippet instance and you are in its scope; anything else just selects. */
export function canvasEnterScope(locs: Loc[]) {
  const loc = pickLoc(locs)
  const el = loc && elementAt(editor.source, loc.start + 1)
  if (el && tabs.value.snippets.some((s) => s.name === el.tag)) enterScope(el.tag)
  else canvasSelect(locs)
}

/** A canvas drag: the same primitive a Layers drag runs, so it is one text edit and one ⌘Z. */
export function canvasReorder(e: { locs: Loc[]; target: Loc[]; position: 'before' | 'after' | 'inside' }) {
  const loc = pickLoc(e.locs), target = pickLoc(e.target)
  if (loc && target && loc.start !== target.start) reparent(loc, target, e.position)
}

/** Whether a handle drag has a rule to write into — the element's own class (SPEC §4.5). */
export const classTarget = computed(() => [...styleTargets.value].reverse().find((t) => t.kind === 'class') ?? null)

/**
 * A handle drag writes `width` (and `height`) into that class rule as **one** edit batch.
 * Two appends land on the same offset, so they are merged into one edit — Monaco never sees
 * two identical ranges, and ⌘Z takes the whole resize back.
 */
export function canvasResize({ width, height }: { width: number; height: number | null }) {
  const target = classTarget.value
  if (!target) return
  const at = target.rule ? target.rule.bodyStart + 1 : ensureSelector(target.selector)
  const rule = ruleAt(editor.source, at)
  if (!rule) return
  const props: [string, string][] = [['width', `${width}mm`]]
  if (height != null) props.push(['height', `${height}mm`])
  const edits = props.reduce<Edit[]>((acc, [prop, value]) => {
    const e = setDeclaration(editor.source, rule, prop, value)
    const same = acc.find((a) => a.start === e.start && a.end === e.end)
    if (same) same.text += e.text
    else acc.push({ ...e })
    return acc
  }, [])
  applyEdits(edits)
}

/**
 * A style change on a selector pill that has no rule yet: create the rule, then set the
 * declaration. Two edits (two ⌘Z) — the second one needs the offsets the first one produced.
 */
export function declare({ selector, prop, value }: { selector: string; prop: string; value: string | null }) {
  const at = ensureSelector(selector) // creates the rule — `editor.source` only has it after this
  const rule = ruleAt(editor.source, at)
  if (rule) applyEdits([setDeclaration(editor.source, rule, prop, value)])
}

/**
 * `Label setup…` writes back into the `<meta>` JSON as one text-range edit, so ⌘Z undoes it
 * like any other edit and the file stays the source of truth (README-tabs §6).
 */
export function writeMeta(patch: Omit<Partial<Meta>, 'size'> & { size?: Partial<Meta['size']> }) {
  const next: Meta = { ...meta.value, ...patch, size: { ...meta.value.size, ...patch.size } }
  const block = /<meta\b[^>]*>([\s\S]*?)<\/meta\s*>/i.exec(editor.source)
  applyEdits([
    block
      ? { start: block.index + block[0].indexOf('>') + 1, end: block.index + block[0].lastIndexOf('</'), text: `\n${JSON.stringify(next)}\n` }
      : { start: 0, end: 0, text: `<meta>\n${JSON.stringify(next)}\n</meta>\n\n` },
  ])
}

// ------------------------------------------------- what the browser actually computes

/**
 * The effective value of the enumerated STYLE properties, per rendered element — measured inside
 * the preview frame and pushed out once per document (see `PreviewPane`'s inspector script).
 * Keyed by the `data-loc` string, which is file-absolute, so it matches an element's `loc`
 * directly. Every mount of the canvas posts its own copy; last write wins, they are identical.
 */
const computedStyles = shallowRef<Record<string, Record<string, string>>>({})

/** Browser vocabulary → the words the controls offer. Anything not listed passes through. */
const CANON: Record<string, Record<string, string>> = {
  'justify-content': { normal: 'flex-start', start: 'flex-start', end: 'flex-end', left: 'flex-start', right: 'flex-end' },
  'align-items': { normal: 'stretch', start: 'flex-start', end: 'flex-end' },
  'text-align': { start: 'left', end: 'right' },
}

export function setComputedStyles(styles: Record<string, Record<string, string>>) {
  const out: Record<string, Record<string, string>> = {}
  for (const [loc, props] of Object.entries(styles)) {
    const one: Record<string, string> = {}
    for (const [prop, raw] of Object.entries(props)) {
      // Per-side shorthands (`none solid none solid`) are nothing a single control can show.
      if (!raw || raw.includes(' ')) continue
      one[prop === 'text-decoration-line' ? 'text-decoration' : prop] = CANON[prop]?.[raw] ?? raw
    }
    out[loc] = one
  }
  computedStyles.value = out
}

/** The snapshot the Inspector is on: the caret's element, or — in rule mode — the rule's first user. */
export const elementComputed = computed(() => {
  const loc = ruleAtCaret.value ? ruleUsage.value[0]?.loc : element.value?.loc
  return loc ? computedStyles.value[`${loc.start}:${loc.end}`] : undefined
})
