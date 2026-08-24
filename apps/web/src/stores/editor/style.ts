import { computed } from 'vue'
import { attributeEdit } from '@/editor/ast.ts'
import { blockOf, insertBlock, tabsModel, type TabBlock } from '@/editor/tabs.ts'
import { findRule, ruleAt, rulesIn, type Rule, type StyleTarget } from '@/editor/css.ts'
import type { Edit } from '@/editor/ast.ts'
import { applyEdits, editor, element, handle, markerTick, tabs } from './state'

/**
 * Every diagnostic in the style block(s) the Inspector and Layers read rules from — the scope's
 * own and, inside a snippet, the label's as well (same pair `styleTargets` collects rules from).
 * The panes filter it down to one rule; markers are Monaco's, so the tick makes it reactive.
 */
export const styleMarkers = computed(() => {
  void markerTick.value
  const h = handle.value
  if (!h) return []
  const scope = editor.activeTab.scope
  return (scope === null ? [null] : [scope, null])
    .flatMap((sc) => blockOf(tabs.value, { scope: sc, kind: 'style' }) ?? [])
    .flatMap((block) => h.markersIn(block))
})

/** The rule for `.cls` as seen from the current scope: the snippet's own style first, then the label's. */
function ruleFor(cls: string) {
  const scope = editor.activeTab.scope
  for (const sc of scope === null ? [null] : [scope, null]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    const rule = block && findRule(rulesIn(editor.source, block.start, block.end), cls)
    if (rule) return rule
  }
  return null
}

/**
 * Which style block a rule lives in — a snippet's name, or `null` for the file-level one.
 * Inside a snippet scope the panes read two blocks, and every rule has to say which.
 */
function originOf(rule: Rule): string | null {
  const scope = editor.activeTab.scope
  const block = scope === null ? undefined : blockOf(tabs.value, { scope, kind: 'style' })
  return block && rule.start >= block.start && rule.end <= block.end ? scope : null
}

/** Every rule visible from the current scope, file-level first — cascade order, the scoped one wins. */
function visibleRules(): { origin: string | null; rule: Rule }[] {
  const scope = editor.activeTab.scope
  const out: { origin: string | null; rule: Rule }[] = []
  for (const sc of scope === null ? [null] : [null, scope]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    if (block) for (const rule of rulesIn(editor.source, block.start, block.end)) out.push({ origin: sc, rule })
  }
  return out
}

/**
 * All rules that apply to the element at the caret (simple selectors, comma lists), lowest
 * specificity first. One pill per *(selector, origin)*: with `.k` in both blocks you get two,
 * the file's then the snippet's, which is the order they cascade in.
 */
export const styleTargets = computed<StyleTarget[]>(() => {
  const el = element.value
  if (!el) return []
  const attr = (name: string) => el.props.find((p) => p.name === name && !p.isBinding)?.value
  const classes = attr('class')?.split(/\s+/).filter(Boolean) ?? []
  const id = attr('id')?.trim()
  const rules = visibleRules()
  const forSelector = (kind: StyleTarget['kind'], selector: string): StyleTarget[] => {
    const hits = rules.filter((r) => r.rule.selector.split(',').some((part) => part.trim() === selector))
    return hits.length
      ? hits.map((h) => ({ kind, selector, label: selector, rule: h.rule, origin: h.origin }))
      : [{ kind, selector, label: selector, rule: null }]
  }
  const targets: StyleTarget[] = [
    ...forSelector('global', '*'),
    ...forSelector('tag', el.tag),
    ...classes.flatMap((c) => forSelector('class', `.${c}`)),
    ...(id ? forSelector('id', `#${id}`) : []),
  ]
  // Globals and element rules only show up when they exist; classes/ids are the element's own and always show.
  return targets.filter((t) => t.rule || t.kind === 'class' || t.kind === 'id')
})

/**
 * Make sure a rule with this selector exists in the *active scope's* style block. Returns the
 * offset inside its braces. Creation always lands in the block you are editing — inside a
 * snippet that is its own scoped block; the label's is one ⌥⇧← away.
 */
export function ensureSelector(selector: string): number {
  const scope = editor.activeTab.scope
  const rules = (blockOf(tabs.value, { scope, kind: 'style' }) as TabBlock | undefined)
  const existing = rules && rulesIn(editor.source, rules.start, rules.end).find((r) => r.selector.split(',').some((p) => p.trim() === selector))
  if (existing) return existing.bodyStart + 1
  if (!rules) applyEdits([insertBlock(editor.source, tabs.value, 'style', undefined, scope)])
  const block = blockOf(tabsModel(editor.source), { scope, kind: 'style' })!
  const body = editor.source.slice(block.contentStart, block.contentEnd)
  const text = `${body.trimEnd() ? '\n' : ''}${selector} {  }\n`
  const at = block.contentStart + body.trimEnd().length
  applyEdits([{ start: at, end: at, text }])
  return at + text.indexOf('{') + 2
}

/** Single-class rules visible from the current scope (snippet's own style + the label's), by name. */
export function availableClasses(): { name: string; declarations: number; origin: string | null }[] {
  const scope = editor.activeTab.scope
  const out = new Map<string, { name: string; declarations: number; origin: string | null }>()
  // Snippet's own first, so a class defined in both is offered as the one that wins.
  for (const sc of scope === null ? [null] : [scope, null]) {
    const block = blockOf(tabs.value, { scope: sc, kind: 'style' })
    if (!block) continue
    for (const r of rulesIn(editor.source, block.start, block.end)) {
      const cls = /^\.([\w-]+)$/.exec(r.selector)?.[1]
      if (cls && !out.has(cls)) out.set(cls, { name: cls, declarations: r.declarations.length, origin: sc })
    }
  }
  return [...out.values()]
}

/**
 * Make sure `.cls { }` exists (adding the style block first if needed). Returns its offset.
 * An existing rule, wherever the scope sees it from, wins over creating a new one.
 */
function ensureRule(cls: string): number {
  const existing = ruleFor(cls)
  return existing ? existing.bodyStart + 1 : ensureSelector(`.${cls}`)
}

/** Add a class to the element at the caret (and make sure its rule exists). */
export function addClassToElement(name: string) {
  const el = element.value
  const cls = name.trim().replace(/^\./, '')
  if (!el || !cls || !handle.value) return
  const current = el.props.find((p) => p.name === 'class' && !p.isBinding)?.value ?? ''
  const classes = current.split(/\s+/).filter(Boolean)
  if (!classes.includes(cls)) applyEdits([attributeEdit(el, 'class', 'set-static', [...classes, cls].join(' '))])
  ensureRule(cls)
}

/**
 * Rename a rule's selector. When both old and new are single classes (`.a` → `.b`) the class is
 * renamed in every static `class="…"` in the file too, so markup and style stay in step.
 */
export function renameRule(rule: Rule, selector: string) {
  const edits: Edit[] = [{ start: rule.start, end: editor.source.indexOf('{', rule.start), text: `${selector} ` }]
  const from = /^\.([\w-]+)$/.exec(rule.selector)?.[1], to = /^\.([\w-]+)$/.exec(selector)?.[1]
  if (from && to) {
    const attr = /class="([^"]*)"/g
    for (let m = attr.exec(editor.source); m; m = attr.exec(editor.source)) {
      const classes = m[1].split(/\s+/)
      if (!classes.includes(from)) continue
      const start = m.index + 'class="'.length
      edits.push({ start, end: start + m[1].length, text: classes.map((c) => (c === from ? to : c)).join(' ') })
    }
  }
  applyEdits(edits.sort((a, b) => b.start - a.start))
}

/**
 * Delete a rule for good: the rule itself, and — when its selector is a single class — that
 * class in every static `class="…"` of the file (main template and snippets alike).
 */
export function deleteRule(rule: Rule) {
  const edits: Edit[] = []
  let end = rule.end
  if (editor.source[end] === '\n') end++
  edits.push({ start: rule.start, end, text: '' })
  const cls = /^\.([\w-]+)$/.exec(rule.selector)?.[1]
  if (cls) {
    const attr = /\s?class="([^"]*)"/g
    for (let m = attr.exec(editor.source); m; m = attr.exec(editor.source)) {
      const classes = m[1].split(/\s+/).filter(Boolean)
      if (!classes.includes(cls)) continue
      const rest = classes.filter((c) => c !== cls)
      // Last class gone → drop the whole attribute (with its leading space); else rewrite the value.
      edits.push(rest.length
        ? { start: m.index + m[0].indexOf('"') + 1, end: m.index + m[0].length - 1, text: rest.join(' ') }
        : { start: m.index, end: m.index + m[0].length, text: '' })
    }
  }
  applyEdits(edits.sort((a, b) => b.start - a.start))
}

/** Take a class off the element at the caret; the rule is left alone. */
export function removeClassFromElement(cls: string) {
  const el = element.value
  if (!el) return
  const current = el.props.find((p) => p.name === 'class' && !p.isBinding)?.value ?? ''
  const rest = current.split(/\s+/).filter((c) => c && c !== cls)
  applyEdits([attributeEdit(el, 'class', rest.length ? 'set-static' : 'remove', rest.join(' '))])
}

/** The rule the caret sits in while a style block is active — the ringed RULES row. */
export const ruleAtCaret = computed(() =>
  editor.activeTab.kind === 'style' ? ruleAt(editor.source, editor.caret) : null,
)

/** Which block that rule lives in — the Inspector's SELECTOR meta and the direction of `Move`. */
export const ruleOrigin = computed(() => (ruleAtCaret.value ? originOf(ruleAtCaret.value) : null))
