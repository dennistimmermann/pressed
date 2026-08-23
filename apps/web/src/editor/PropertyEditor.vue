<!--
  The Inspector's ATTRIBUTES and LOGIC sections (SPEC §4.3): the element at the caret as a form —
  its text, its tag, its id, the schema-typed props of a component, whatever else is set on it and
  `+ attribute` (`part: 'attributes'`), or the directive rows and `+ directive` (`part: 'logic'`).
  One instance per section. Nothing here owns state: every change is one text-range edit on
  the attribute, so ⌘Z in the editor undoes it. Structure lives in Layers, classes in the pills.
-->
<script setup lang="ts">
import { AddRow, Menu, type MenuItem, Picker, type PickerRow } from '@/ui'
import { computed, nextTick, ref, watch } from 'vue'
import { attributeEdit, elementAt, loopAlias, loopClause, siblingsOf, type Edit, type ElementInfo, type Loc, type PropInfo, DIRECTIVE_LABELS } from './ast'
import type { EditorHandle, Marker } from './editor-handle'
import type { PropSchema } from '@pressed/core'
import type { ComponentSchema } from './types'
import Msgs from './Msgs.vue'
import { aria as ariaFor, hasError, msgsBy } from './inspector/markers'
import { htmlAttrsFor } from './inspector/html-attrs'

const props = defineProps<{
  /** Which section this instance is: the attribute rows (default), or the directive rows. */
  part?: 'attributes' | 'logic'
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
  'set-text': [text: string]
}>()

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
 * The directives that decide what a label prints get a row of their own, under plain names
 * (`DIRECTIVE_LABELS`); every other `v-` directive and every `@handler` stays code in the
 * editor. They are written *verbatim*
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
  return out
})

/** `+ directive`: what is not set yet, minus what would not compile here. */
const addableDirectives = computed<string[]>(() => {
  if (!props.element) return []
  const out: string[] = []
  if (!condition.value) out.push('v-if', ...(canElse.value ? ['v-else-if', 'v-else'] : []))
  if (!loop.value) out.push('v-for')
  return out
})

/**
 * Which fields the section shows: the directives that are set, a component's declared props
 * always (set or not), and everything else that is actually on the element — `class` and `id`
 * included, but only when set (SPEC §7); an absent `id` is reachable via `+ attribute`.
 * Event handlers stay in the editor.
 */
const attrFields = computed<Field[]>(() => {
  const element = props.element
  if (!element) return []
  const known: Field[] = [
    ...(props.schema?.props ?? []).map((schema) => field(schema.name, schema, prop(schema.name))),
  ]
  const taken = [...known, ...directiveFields.value]
  const extra = element.props
    .filter((p) => !taken.some((f) => f.name === p.name) && !p.isEvent && !p.name.startsWith('v-'))
    .map((p) => field(p.name, undefined, p))
  return [...known, ...extra]
})

/** Every row of both sections — what `addable` excludes and what `msgs` splits the markers over. */
const fields = computed<Field[]>(() => [...attrFields.value, ...directiveFields.value])

/** The rows *this* instance renders; the markers of the other section's rows are simply ignored. */
const rows = computed(() => (props.part === 'logic' ? directiveFields.value : attrFields.value))

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
/** `item`, `index` and `list` are three inputs of one `v-for`; empty all round removes it. */
function setLoop(item: string, index: string, list: string) {
  if (!item.trim() && !index.trim() && !list.trim()) return loop.value ? commit('v-for', 'remove') : undefined
  commit('v-for', 'set-static', `${loopAlias(item, index)} in ${list.trim()}`)
}

// --- `{ }` picker: the one home for inserting a variable besides typing (SPEC §4.6).
// `ui/Picker` is that one shape — search over 8 rows, a live value on every row — and the
// printer's copies picker is the same component (atlas 25 vs 42).
const picker = ref<string | null>(null) // field name, or `text`
const pickerAnchor = ref<DOMRect | null>(null)

/** Both add-menus are `ui/Menu`: anchored, teleported, viewport-safe. */
const addAnchor = ref<DOMRect | null>(null)
function toggleAdd(kind: 'attribute' | 'directive', e: MouseEvent) {
  if (adding.value === kind) return closeAdd()
  addAnchor.value = (e.currentTarget as HTMLElement).getBoundingClientRect()
  adding.value = kind
}
const closeAdd = () => { adding.value = null; addAnchor.value = null }
const closePicker = () => { picker.value = null; pickerAnchor.value = null }

function openPicker(event: MouseEvent, name: string) {
  const same = picker.value === name
  pickerAnchor.value = same ? null : (event.currentTarget as HTMLElement).getBoundingClientRect()
  picker.value = same ? null : name
}

/** `hint` is the variable's live value (or its type, in a snippet): the row's preview. */
const variableRows = computed<PickerRow[]>(() =>
  (props.variables ?? []).map((v) => ({ value: v.path, label: v.path, preview: v.hint })),
)
const directiveItems = computed<MenuItem[]>(() =>
  addableDirectives.value.map((name) => ({ value: name, label: DIRECTIVE_LABELS[name] ?? name })),
)
const attributeItems = computed<MenuItem[]>(() => addable.value.map((name) => ({ value: name, mono: true, label: name })))

/** A binding is what a variable in an attribute *is*: `:size="row.x"`. In text it is `{{ x }}`. */
function pickVariable(path: string) {
  const name = picker.value
  closePicker()
  if (!name || !props.element) return
  if (name === 'text') {
    const current = props.element.text?.value ?? ''
    return emit('set-text', current ? `${current} {{ ${path} }}` : `{{ ${path} }}`)
  }
  if (name === 'v-for') return setLoop(loopParts.value.item, loopParts.value.index, path)
  commit(name, name.startsWith('v-') ? 'set-static' : 'set-binding', path)
}

// --- the trailing `+ attribute` / `+ directive` row: pick a name, then straight into its value
const adding = ref<'attribute' | 'directive' | null>(null)
const newAttr = ref('')

function addAttribute(name: string) {
  const clean = name.trim()
  closeAdd()
  newAttr.value = ''
  if (!clean) return
  focusName = clean
  commit(clean, 'set-static', '')
}

/** An empty directive, then straight into it: `v-else` is the one that carries no expression. */
function addDirective(name: string) {
  closeAdd()
  if (name === 'v-else') return commit(name, 'set-static', true)
  if (name === 'v-for') {
    // A loop always comes with its index (numbered lists are the everyday case) and is keyed by it.
    if (!props.element || !props.handle) return
    focusName = 'v-for-list'
    const edit = attributeEdit(props.element, 'v-for', 'set-static', '(item, i) in ')
    return props.handle.executeEdits([{ ...edit, text: `${edit.text} :key="i"` }])
  }
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
    <template v-if="part !== 'logic'">
    <!-- The element's own text, when it has no child elements. `{{ }}` is code: mono. -->
    <div v-if="element.text" class="field" :class="{ bad: bad('text') }">
      <label for="prop-text" class="key">text</label>
      <div class="line">
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

    <!-- Whatever no field owns — an unknown component, a prop the schema does not have — sits on the tag. -->
    <div v-if="msgs.tag?.length" class="field wide" :class="{ bad: bad('tag') }">
      <span class="key">{{ element.tag }}</span>
      <Msgs id="msg-tag" :markers="msgs.tag" />
    </div>
    </template>

    <template v-for="f in rows" :key="f.name">
    <div
      class="field"
      :class="{ wide: f.control === 'expression', bad: bad(f.name) }" :title="f.hint"
    >
      <label :for="`prop-${f.name}`" class="key">
        {{ DIRECTIVE_LABELS[f.name] ?? f.name }}<span v-if="f.prop?.isBinding && !DIRECTIVE_LABELS[f.name]" class="bound">:</span>
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
            :title="kind !== 'v-if' && !canElse ? 'needs an if before it' : ''"
          >{{ text }}</option>
        </select>
        <template v-if="f.role === 'loop'">
          <input
            :id="`prop-${f.name}`" class="ctl expr alias" :value="loopParts.item" spellcheck="false"
            placeholder="item" aria-label="item" @change="setLoop(onInput($event), loopParts.index, loopParts.list)"
          >
          <span class="in">,</span>
          <input
            class="ctl expr alias index" :value="loopParts.index" spellcheck="false"
            placeholder="i" aria-label="index" @change="setLoop(loopParts.item, onInput($event), loopParts.list)"
          >
          <span class="in">in</span>
        </template>

        <span v-if="f.name === 'v-else'" class="muted">–</span>
        <input
          v-else :id="f.role === 'loop' ? 'prop-v-for-list' : `prop-${f.name}`" class="ctl expr"
          :value="f.role === 'loop' ? loopParts.list : value(f)" spellcheck="false" placeholder="–"
          v-bind="aria(f.name)" :aria-label="f.role === 'loop' ? 'list' : undefined"
          @change="f.role === 'loop' ? setLoop(loopParts.item, loopParts.index, onInput($event)) : setExpression(f, onInput($event))"
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
        <!-- The dash is "unset"; the parens are the default that then applies. -->
        <option value="">{{ f.schema?.default != null ? `– (${f.schema.default})` : '–' }}</option>
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

    <!-- The one add grammar: a dashed `+ noun` at the foot of the list it extends (F18). -->
    <div v-if="part !== 'logic'" class="add">
      <input
        v-if="adding === 'attribute' && !addable.length" :ref="autofocus" v-model="newAttr" placeholder="name"
        aria-label="new attribute name" class="ctl" @change="addAttribute(newAttr)" @keydown.esc="closeAdd"
      >
      <AddRow v-else noun="attribute" @click="toggleAdd('attribute', $event)" />
    </div>
    <div v-if="part === 'logic' && addableDirectives.length" class="add">
      <AddRow noun="directive" @click="toggleAdd('directive', $event)" />
    </div>

    <!-- One popover shape for both, placed by anchorMenu and teleported out of the pane. -->
    <Picker
      :anchor="pickerAnchor" :rows="variableRows" :width="260" align="right" placeholder="variable…"
      empty="nothing to insert here" @pick="pickVariable" @close="closePicker"
    />
    <Menu
      :anchor="adding === 'directive' ? addAnchor : null" :items="directiveItems" :width="260"
      @pick="addDirective" @close="closeAdd"
    />
    <Menu
      :anchor="adding === 'attribute' && addable.length ? addAnchor : null" :items="attributeItems"
      :width="260" @pick="addAttribute" @close="closeAdd"
    >
      <input :ref="autofocus" v-model="newAttr" class="new" placeholder="new…" aria-label="new attribute name" @change="addAttribute(newAttr)" @keydown.esc="closeAdd">
    </Menu>
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
/* What a row has instead of a control: bare `else`. */
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
.ctl.alias { flex: none; width: 80px; }
.ctl.alias.index { width: 44px; }
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

/* The one input that rides inside a Menu (the `new…` attribute name). */
.new {
  width: 100%; height: 26px; margin-top: 4px; padding: 0 9px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field);
  font-family: var(--font-mono); font-size: var(--t3); outline: none;
}
.new:focus-visible { border-color: var(--primary); background: var(--pane); }
</style>
