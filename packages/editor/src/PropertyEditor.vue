<!--
  The Inspector's ATTRIBUTES section (SPEC §4.3): the element at the caret as a form — its text,
  its tag, its id, the schema-typed props of a component, whatever else is set on it, and
  `+ attribute` for the rest. Nothing here owns state: every change is one text-range edit on
  the attribute, so ⌘Z in the editor undoes it. Structure lives in Layers, classes in the pills.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { attributeEdit, elementAt, loopClause, siblingsOf, type Edit, type ElementInfo, type Loc, type PropInfo } from './ast'
import type { EditorHandle, Marker } from './editor-handle'
import type { PropSchema } from '@sprint/core'
import type { ComponentSchema } from './types'
import Msgs from './Msgs.vue'
import { aria as ariaFor, hasError, msgsBy } from './inspector/markers'
import { htmlAttrsFor } from './inspector/html-attrs'
import { HTML_TAGS, isHtmlTag } from './inspector/insert'

const props = defineProps<{
  element: ElementInfo | null
  /** Schema for `element.tag`, looked up by the host in library + snippets; null for HTML tags. */
  schema: (ComponentSchema & { doc?: string }) | null
  handle: EditorHandle | null
  /** What the `{ }` picker offers: `row.*` paths, or a snippet's props. */
  variables?: { path: string; hint: string }[]
  /** Diagnostics anywhere in `element` — each field shows the ones on its own range. */
  markers?: Marker[]
}>()
const emit = defineEmits<{
  'change-tag': [tag: string]
  'set-text': [text: string]
}>()

/** Change tag is for HTML only: renaming a component means picking a different component. */
const tagOptions = computed(() => {
  const tag = props.element?.tag ?? ''
  return HTML_TAGS.includes(tag) ? HTML_TAGS : [tag, ...HTML_TAGS]
})

type Control = 'expression' | 'number' | 'enum' | 'boolean' | 'color' | 'text'
type Field = {
  name: string
  schema?: PropSchema
  prop?: PropInfo
  control: Control
  hint: string
  /** Directive rows needing more than one control: the condition's kind, the loop's alias. */
  role?: 'condition' | 'loop'
}

/** Not reactive: it only steers the next ref callback, and re-rendering for it is pointless. */
let focusName: string | undefined

const prop = (name: string) => props.element?.props.find((p) => p.name === name)

// ---------------------------------------------------------------- directives
/**
 * The five directives that decide what a label prints get a row of their own; every other
 * `v-` directive and every `@handler` stays code in the editor. They are written *verbatim*
 * with `set-static` (`v-if="row.x"`, bare `v-else`) — `set-binding` would emit `:v-if=`.
 */
const CONDITIONS = ['v-if', 'v-else-if', 'v-else'] as const
type Condition = (typeof CONDITIONS)[number]
const KINDS: [Condition, string][] = [['v-if', 'if'], ['v-else-if', 'else if'], ['v-else', 'else']]

const condition = computed(() => CONDITIONS.map((name) => prop(name)).find(Boolean))
const loop = computed(() => prop('v-for'))

/** `item in list` · `(item, i) of list` — the two halves the loop row edits separately. */
const loopParts = computed(() => loopClause(loop.value?.value ?? ''))

/** `v-else` / `v-else-if` only mean anything after a sibling that opened the chain. */
const canElse = computed(() => {
  const el = props.element
  const source = props.handle?.getValue()
  if (!el || !source) return false
  const siblings = siblingsOf(source, el)
  const i = siblings.findIndex((s) => s.start === el.loc.start)
  const previous = i > 0 ? elementAt(source, siblings[i - 1].start + 1) : null
  return !!previous?.props.some((p) => p.name === 'v-if' || p.name === 'v-else-if')
})

const exprField = (name: string, role?: Field['role']): Field =>
  ({ name, prop: prop(name), control: 'expression', hint: '', role })

/** The rows in directive order; `:key` belongs to the loop, so it leaves the generic rows. */
const directiveFields = computed<Field[]>(() => {
  const out: Field[] = []
  if (condition.value) out.push(exprField(condition.value.name, 'condition'))
  if (loop.value) out.push(exprField('v-for', 'loop'), exprField('key'))
  if (prop('v-html')) out.push(exprField('v-html'))
  return out
})

/** `+ directive`: what is not set yet, minus what would not compile here. */
const addableDirectives = computed<string[]>(() => {
  if (!props.element) return []
  const out: string[] = []
  if (!condition.value) out.push('v-if', ...(canElse.value ? ['v-else-if', 'v-else'] : []))
  if (!loop.value) out.push('v-for')
  if (!prop('v-html')) out.push('v-html')
  return out
})

/**
 * Which fields the section shows: `id` always, the directives that are set, a component's
 * declared props always (set or not), and everything else that is actually on the element —
 * `class` included, as a plain attribute row (SPEC §7). Event handlers stay in the editor.
 */
const fields = computed<Field[]>(() => {
  const element = props.element
  if (!element) return []
  const known: Field[] = [
    field('id', undefined, prop('id')),
    ...(props.schema?.props ?? []).map((schema) => field(schema.name, schema, prop(schema.name))),
  ]
  const taken = [...known, ...directiveFields.value]
  const extra = element.props
    .filter((p) => !taken.some((f) => f.name === p.name) && !p.isEvent && !p.name.startsWith('v-'))
    .map((p) => field(p.name, undefined, p))
  // Attributes first, then the `logic` group (directives) — `+ attribute` sits between them.
  return [...known, ...extra, ...directiveFields.value]
})

/** `+ attribute`: the tag's HTML attributes and any schema prop that has no field yet. */
const addable = computed(() => {
  const element = props.element
  if (!element) return []
  const shown = new Set(fields.value.map((f) => f.name))
  return [...htmlAttrsFor(element.tag), ...(props.schema?.props ?? []).map((p) => p.name)]
    .filter((name, i, list) => !shown.has(name) && list.indexOf(name) === i)
})

function field(name: string, schema: PropSchema | undefined, prop: PropInfo | undefined): Field {
  const hint = schema
    ? [schema.format ?? (schema.type === 'enum' ? (schema.values ?? []).join(' ') : schema.type), schema.required ? 'required' : '']
        .filter(Boolean)
        .join(' · ')
    : ''
  return { name, schema, prop, control: controlFor(schema, prop), hint }
}

function controlFor(schema: PropSchema | undefined, prop: PropInfo | undefined): Control {
  if (prop?.isBinding) return 'expression'
  if (schema?.format === 'color') return 'color'
  if (schema?.format === 'mm' || schema?.type === 'number') return 'number'
  if (schema?.type === 'enum') return 'enum'
  if (schema?.type === 'boolean') return 'boolean'
  return 'text'
}

const value = (field: Field) => field.prop?.value ?? ''

/**
 * The element's diagnostics, split over the rows that own their source range — so
 * `Property 'filament' does not exist on type Row` sits under the field you fix it in.
 * A marker belongs to the row it *starts* in: the compiler reports a point and the squiggle
 * runs to the end of the line, which would otherwise claim every attribute after it. What
 * starts in no field and in no child element is the element's own and shows under `tag`.
 */
const msgs = computed<Record<string, Marker[]>>(() => {
  const el = props.element
  const all = props.markers ?? []
  if (!el || !all.length) return {}
  const rows: { key: string; loc: Loc }[] = el.text ? [{ key: 'text', loc: el.text }] : []
  for (const f of fields.value) if (f.prop) rows.push({ key: f.name, loc: f.prop.loc })
  // The host already dropped the children's markers; what no field claims belongs to the tag.
  const { '': rest = [], ...out } = msgsBy(all, rows)
  return rest.length ? { ...out, tag: rest } : out
})

const bad = (key: string) => hasError(msgs.value[key])
const aria = (key: string) => ariaFor(`msg-${key}`, msgs.value[key])

/** Every codeless action here is one `executeEdits`, so it is exactly one ⌘Z. */
const apply = (edits: Edit[]) => props.handle?.executeEdits(edits)

function commit(name: string, kind: 'set-static' | 'set-binding' | 'remove', text?: string | boolean) {
  if (!props.element) return
  apply([attributeEdit(props.element, name, kind, text)])
}

/** An emptied field means "unset" — writing `prop=""` would be a value, not the absence of one. */
function setStatic(field: Field, text: string) {
  if (text === '') return field.prop ? commit(field.name, 'remove') : undefined
  commit(field.name, 'set-static', text)
}

function setExpression(field: Field, text: string) {
  if (text.trim() === '') return field.prop ? commit(field.name, 'remove') : undefined
  commit(field.name, field.name.startsWith('v-') ? 'set-static' : 'set-binding', text)
}

/** Switching kind is a rename: the old directive out, the new one in, in one edit batch. */
function setCondition(next: Condition) {
  const el = props.element
  const current = condition.value
  if (!el || !current || current.name === next) return
  apply([
    attributeEdit(el, current.name, 'remove'),
    attributeEdit(el, next, 'set-static', next === 'v-else' ? true : current.value ?? ''),
  ])
}

/** Both halves empty means the loop is gone; anything else is written back verbatim. */
function setLoop(alias: string, list: string) {
  if (!alias.trim() && !list.trim()) return loop.value ? commit('v-for', 'remove') : undefined
  commit('v-for', 'set-static', `${alias.trim()} in ${list.trim()}`)
}

// --- `{ }` picker: the one home for inserting a variable besides typing (SPEC §4.6)
const picker = ref<string | null>(null) // field name, or `text`
const pickerPos = ref({ top: 0, left: 0 })
const query = ref('')

function openPicker(event: MouseEvent, name: string) {
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPos.value = { top: r.bottom + 6, left: Math.max(8, Math.min(r.right - 260, window.innerWidth - 268)) }
  query.value = ''
  picker.value = picker.value === name ? null : name
}

const variableList = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = props.variables ?? []
  return q ? all.filter((v) => v.path.toLowerCase().includes(q)) : all
})

/** A binding is what a variable in an attribute *is*: `:size="row.x"`. In text it is `{{ x }}`. */
function pickVariable(path: string) {
  const name = picker.value
  picker.value = null
  if (!name || !props.element) return
  if (name === 'text') {
    const current = props.element.text?.value ?? ''
    return emit('set-text', current ? `${current} {{ ${path} }}` : `{{ ${path} }}`)
  }
  if (name === 'v-for') return setLoop(loopParts.value.alias, path)
  commit(name, name.startsWith('v-') ? 'set-static' : 'set-binding', path)
}

// --- the trailing `+ attribute` / `+ directive` row: pick a name, then straight into its value
const adding = ref<'attribute' | 'directive' | null>(null)
const newAttr = ref('')

function addAttribute(name: string) {
  const clean = name.trim()
  adding.value = null
  newAttr.value = ''
  if (!clean) return
  focusName = clean
  commit(clean, 'set-static', '')
}

/** An empty directive, then straight into it: `v-else` is the one that carries no expression. */
function addDirective(name: string) {
  adding.value = null
  if (name === 'v-else') return commit(name, 'set-static', true)
  focusName = name
  commit(name, 'set-static', '')
}

const onInput = (event: Event) => (event.target as HTMLInputElement).value
const autofocus = (el: unknown) => (el as HTMLInputElement | null)?.focus()

// A freshly added attribute should be ready to type into; its field only exists once the
// host has re-parsed the source and handed us a new element.
watch(
  () => props.element,
  () => {
    if (!focusName) return
    const id = `prop-${focusName}`
    focusName = undefined
    nextTick(() => document.getElementById(id)?.focus())
  },
  { flush: 'post' },
)
</script>

<template>
  <div v-if="element" class="attrs">
    <!-- The element's own text, when it has no child elements. `{{ }}` is code: mono. -->
    <div v-if="element.text" class="field" :class="{ bad: bad('text') }">
      <label for="prop-text" class="key">text</label>
      <!-- Vue renders `v-html` instead of the children, so the field would edit nothing. -->
      <span v-if="prop('v-html')" class="muted">– overridden by v-html</span>
      <div v-else class="line">
        <textarea
          v-if="element.text.value.includes('\n')"
          id="prop-text" rows="3" class="ctl tall" :value="element.text.value" v-bind="aria('text')"
          @change="emit('set-text', onInput($event))"
        />
        <input
          v-else id="prop-text" type="text" class="ctl" :class="element.text.value.includes('{{') ? '' : 'prose'"
          :value="element.text.value" v-bind="aria('text')" @change="emit('set-text', onInput($event))"
        >
        <button v-if="variables?.length" type="button" class="pick" title="insert a variable" @click="openPicker($event, 'text')">{ }</button>
      </div>
      <Msgs id="msg-text" :markers="msgs.text" />
    </div>

    <div class="field" :class="{ bad: bad('tag') }">
      <label for="prop-tag" class="key">tag</label>
      <select
        id="prop-tag" class="ctl" :value="element.tag" :disabled="!isHtmlTag(element.tag)"
        :title="isHtmlTag(element.tag) ? 'change the tag' : 'components keep their name'"
        v-bind="aria('tag')" @change="emit('change-tag', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="tag in tagOptions" :key="tag" :value="tag">{{ tag }}</option>
      </select>
      <!-- Whatever no field owns: an unknown component, a prop the schema does not have. -->
      <Msgs id="msg-tag" :markers="msgs.tag" />
    </div>

    <template v-for="f in fields" :key="f.name">
    <!-- The directive group opens after the attribute rows; `+ attribute` closes the attribute group. -->
    <template v-if="f === directiveFields[0]">
      <div class="add">
        <input
          v-if="adding === 'attribute' && !addable.length" :ref="autofocus" v-model="newAttr" placeholder="name"
          aria-label="new attribute name" class="ctl" @change="addAttribute(newAttr)" @keydown.esc="adding = null"
        >
        <button v-else type="button" class="more" @click="adding = adding === 'attribute' ? null : 'attribute'">+ attribute</button>
      </div>
      <span class="gname">logic</span>
    </template>
    <div
      class="field"
      :class="{ wide: f.control === 'expression', bad: bad(f.name) }" :title="f.hint"
    >
      <label :for="`prop-${f.name}`" class="key" :class="{ mono: f.name.startsWith('v-') }">
        {{ f.name }}<span v-if="f.prop?.isBinding" class="bound">:</span>
      </label>

      <!-- Bound: the expression is authoritative, and it is code — mono, accent. -->
      <div v-if="f.control === 'expression'" class="line">
        <!-- `v-if` · `v-else-if` · `v-else` are one row: the kind is a select, the rest follows. -->
        <select
          v-if="f.role === 'condition'" :id="f.name === 'v-else' ? 'prop-v-else' : undefined"
          class="ctl kind" :value="f.name" aria-label="condition"
          @change="setCondition(onInput($event) as Condition)"
        >
          <option
            v-for="[kind, text] in KINDS" :key="kind" :value="kind" :disabled="kind !== 'v-if' && !canElse"
            :title="kind !== 'v-if' && !canElse ? 'needs a v-if before it' : ''"
          >{{ text }}</option>
        </select>
        <template v-if="f.role === 'loop'">
          <input
            :id="`prop-${f.name}`" class="ctl expr alias" :value="loopParts.alias" spellcheck="false"
            placeholder="item" @change="setLoop(onInput($event), loopParts.list)"
          >
          <span class="in">in</span>
        </template>

        <span v-if="f.name === 'v-else'" class="muted">–</span>
        <input
          v-else :id="f.role === 'loop' ? 'prop-v-for-list' : `prop-${f.name}`" class="ctl expr"
          :value="f.role === 'loop' ? loopParts.list : value(f)" spellcheck="false" placeholder="–"
          v-bind="aria(f.name)" :aria-label="f.role === 'loop' ? 'list' : undefined"
          @change="f.role === 'loop' ? setLoop(loopParts.alias, onInput($event)) : setExpression(f, onInput($event))"
        >
        <button
          v-if="variables?.length && f.name !== 'v-else'" type="button" class="pick"
          title="insert a variable" @click="openPicker($event, f.name)"
        >{ }</button>
      </div>

      <input
        v-else-if="f.control === 'number'" :id="`prop-${f.name}`" type="number" step="0.1" class="ctl"
        :value="value(f).replace(/[a-z]+$/i, '')" :placeholder="String(f.schema?.default ?? '–')"
        v-bind="aria(f.name)" @change="setStatic(f, onInput($event) + (f.schema?.format === 'mm' ? 'mm' : ''))"
      >

      <select
        v-else-if="f.control === 'enum'" :id="`prop-${f.name}`" class="ctl" :value="value(f)"
        v-bind="aria(f.name)" @change="setStatic(f, onInput($event))"
      >
        <option value="">–</option>
        <option v-for="option in f.schema?.values ?? []" :key="option" :value="option">{{ option }}</option>
      </select>

      <input
        v-else-if="f.control === 'boolean'" :id="`prop-${f.name}`" type="checkbox" class="check"
        :checked="!!f.prop" v-bind="aria(f.name)"
        @change="commit(f.name, ($event.target as HTMLInputElement).checked ? 'set-static' : 'remove', true)"
      >

      <div v-else-if="f.control === 'color'" class="line">
        <input
          :id="`prop-${f.name}`" type="color" class="swatch" :value="value(f) || '#000000'"
          v-bind="aria(f.name)" @change="setStatic(f, onInput($event))"
        >
        <input class="ctl" :value="value(f)" aria-label="hex value" placeholder="–" @change="setStatic(f, onInput($event))">
      </div>

      <div v-else class="line">
        <input
          :id="`prop-${f.name}`" type="text" class="ctl" :value="value(f)"
          :placeholder="String(f.schema?.default ?? '–')" v-bind="aria(f.name)" @change="setStatic(f, onInput($event))"
        >
        <button v-if="variables?.length" type="button" class="pick" title="insert a variable" @click="openPicker($event, f.name)">{ }</button>
      </div>

      <Msgs :id="`msg-${f.name}`" :markers="msgs[f.name]" />
    </div>
    </template>

    <!-- No directive yet: the attribute group closes here and the logic group is just its add action. -->
    <template v-if="!directiveFields.length">
      <div class="add">
        <input
          v-if="adding === 'attribute' && !addable.length" :ref="autofocus" v-model="newAttr" placeholder="name"
          aria-label="new attribute name" class="ctl" @change="addAttribute(newAttr)" @keydown.esc="adding = null"
        >
        <button v-else type="button" class="more" @click="adding = adding === 'attribute' ? null : 'attribute'">+ attribute</button>
      </div>
      <span v-if="addableDirectives.length" class="gname">logic</span>
    </template>
    <div v-if="addableDirectives.length" class="add">
      <button type="button" class="more" @click="adding = adding === 'directive' ? null : 'directive'">+ directive</button>
    </div>

    <!-- Popovers: the column is narrow and clips, so both hang off the button in fixed space. -->
    <template v-if="picker || adding === 'directive' || (adding === 'attribute' && addable.length)">
      <span class="backdrop" @click="((picker = null), (adding = null))" />

      <div v-if="picker" class="menu" :style="{ top: `${pickerPos.top}px`, left: `${pickerPos.left}px` }" @keydown.escape="picker = null">
        <input v-if="(variables?.length ?? 0) > 8" :ref="autofocus" v-model="query" placeholder="variable…" aria-label="filter">
        <ul role="listbox">
          <li v-for="v in variableList" :key="v.path" role="option" @mousedown.prevent="pickVariable(v.path)">
            <span class="name">{{ v.path }}</span><span class="hint">{{ v.hint }}</span>
          </li>
          <li v-if="!variableList.length" class="none">nothing to insert here</li>
        </ul>
      </div>

      <div v-else-if="adding === 'directive'" class="menu at-add">
        <button v-for="name in addableDirectives" :key="name" type="button" class="item" @click="addDirective(name)">{{ name }}</button>
      </div>

      <div v-else class="menu at-add">
        <button v-for="name in addable" :key="name" type="button" class="item" @click="addAttribute(name)">{{ name }}</button>
        <input :ref="autofocus" v-model="newAttr" placeholder="new…" aria-label="new attribute name" @change="addAttribute(newAttr)" @keydown.esc="adding = null">
      </div>
    </template>
  </div>
</template>

<style scoped>
/* SPEC §4.3 / §5: fields 26px, radius 6, label 9px sans muted 3px above the control. */
.attrs { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.field:has(.tall), .field:has(#prop-text), .field.wide { grid-column: 1 / -1; }
.key { font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground-2); }
/* A directive's name is the machine's word for it (CLAUDE.md), so the label is mono. */
.key.mono { font-family: var(--font-mono); font-size: 9.5px; }
.bound { color: var(--accent-link); }
/* What a row has instead of a control: bare `v-else`, text under `v-html`. */
.muted { display: flex; align-items: center; height: 26px; font-family: var(--font-sans); font-size: 10.5px; color: var(--muted-foreground); }
.line { display: flex; align-items: center; gap: 5px; min-width: 0; }
/* Filled, borderless — focus swaps the border to --primary and the fill to --pane (§3). */
.ctl {
  flex: 1; min-width: 0; height: 26px; padding: 0 8px;
  border: 1px solid transparent; border-radius: var(--radius-control); background: var(--field);
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 450; color: var(--foreground); outline: none;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl::placeholder { color: var(--faint-foreground); }
.ctl:focus-visible { border-color: var(--primary); background: var(--pane); }
/* A diagnostic on this field's own range — the message the editor only shows on hover. */
.field.bad .ctl, .field.bad .swatch { border-color: var(--destructive); }
.ctl.tall { height: auto; padding: 4px 8px; line-height: 1.5; }
/* Prose is prose (CLAUDE.md); text with `{{ }}` in it is code and stays mono. */
.ctl.prose { font-family: var(--font-sans); font-size: 11px; }
.ctl.expr { color: var(--accent-link); }
/* The condition's kind and the loop's alias sit before the expression, at their own width. */
.ctl.kind { flex: none; width: 78px; }
.ctl.alias { flex: none; width: 92px; }
.in { flex: none; font-family: var(--font-mono); font-size: 10.5px; color: var(--muted-foreground-2); }
.swatch { flex: none; width: 26px; height: 26px; padding: 2px; border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--pane); }
.check { width: 30px; height: 18px; appearance: none; border: 1px solid var(--field-border); border-radius: 999px; background: var(--field); transition: background-color 120ms ease-out; }
.check:checked { background: var(--primary); }
.pick {
  flex: none; width: 26px; height: 26px; display: grid; place-items: center;
  border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--pane);
  font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--accent-link);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.pick:hover { border-color: var(--primary); background: var(--accent); }
.add { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
/* Group label, same as the STYLE grid's (`layout` · `box` …). */
.gname {
  grid-column: 1 / -1; margin-top: 3px;
  font-family: var(--font-sans); font-size: 9px; font-weight: 600; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--muted-foreground-2);
}
.more { border: 0; background: transparent; padding: 0; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--accent-link); }
.more:hover { text-decoration: underline; }

/* Popover shell — SPEC §4.8, the same one Layers uses. */
.backdrop { position: fixed; inset: 0; z-index: 19; }
.menu {
  position: fixed; z-index: 60; width: 260px; padding: 6px;
  border: 1px solid var(--field-border); border-radius: var(--radius-trough); background: var(--popover);
  box-shadow: var(--shadow-popover);
}
.menu.at-add { position: absolute; left: 0; bottom: 22px; }
.menu input { width: 100%; height: 26px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--field); font-family: var(--font-mono); font-size: 11px; outline: none; }
.menu input:focus-visible { border-color: var(--primary); background: var(--pane); }
.menu ul { max-height: 260px; margin: 4px 0 0; padding: 0; overflow: auto; list-style: none; }
.menu li, .menu .item {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 26px; padding: 0 9px;
  border: 0; border-radius: var(--radius-control); background: transparent; cursor: default;
  font-family: var(--font-mono); font-size: 11px; color: var(--popover-foreground); text-align: left;
}
.menu li:hover, .menu .item:hover { background: var(--accent); }
.menu li.none { color: var(--muted-foreground); }
.menu .hint { margin-left: auto; font-size: 10px; color: var(--meta-foreground); }
.menu .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
