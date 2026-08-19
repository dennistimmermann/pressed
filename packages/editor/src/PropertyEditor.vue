<!--
  The Inspector's ATTRIBUTES section (SPEC §4.3): the element at the caret as a form — its text,
  its tag, its id, the schema-typed props of a component, whatever else is set on it, and
  `+ attribute` for the rest. Nothing here owns state: every change is one text-range edit on
  the attribute, so ⌘Z in the editor undoes it. Structure lives in Layers, classes in the pills.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { attributeEdit, type ElementInfo, type PropInfo } from './ast'
import type { EditorHandle } from './editor-handle'
import type { PropSchema } from '@sprint/core'
import type { ComponentSchema } from './types'
import { htmlAttrsFor } from './inspector/html-attrs'
import { HTML_TAGS, isHtmlTag } from './inspector/insert'

const props = defineProps<{
  element: ElementInfo | null
  /** Schema for `element.tag`, looked up by the host in library + snippets; null for HTML tags. */
  schema: (ComponentSchema & { doc?: string }) | null
  handle: EditorHandle | null
  /** What the `{ }` picker offers: `row.*` paths, or a snippet's props. */
  variables?: { path: string; hint: string }[]
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
}

/** Not reactive: it only steers the next ref callback, and re-rendering for it is pointless. */
let focusName: string | undefined

/**
 * Which fields the section shows: `id` always, a component's declared props always (set or
 * not), and everything else that is actually on the element — `class` included, as a plain
 * attribute row (SPEC §7). Directives and event handlers are code and stay in the editor.
 */
const fields = computed<Field[]>(() => {
  const element = props.element
  if (!element) return []
  const byName = (name: string) => element.props.find((p) => p.name === name)
  const known: Field[] = [
    field('id', undefined, byName('id')),
    ...(props.schema?.props ?? []).map((schema) => field(schema.name, schema, byName(schema.name))),
  ]
  const extra = element.props
    .filter((p) => !known.some((f) => f.name === p.name) && !p.isEvent && !p.name.startsWith('v-'))
    .map((p) => field(p.name, undefined, p))
  return [...known, ...extra]
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

function commit(name: string, kind: 'set-static' | 'set-binding' | 'remove', text?: string | boolean) {
  if (!props.element || !props.handle) return
  props.handle.executeEdits([attributeEdit(props.element, name, kind, text)])
}

/** An emptied field means "unset" — writing `prop=""` would be a value, not the absence of one. */
function setStatic(field: Field, text: string) {
  if (text === '') return field.prop ? commit(field.name, 'remove') : undefined
  commit(field.name, 'set-static', text)
}

function setExpression(field: Field, text: string) {
  if (text.trim() === '') return field.prop ? commit(field.name, 'remove') : undefined
  commit(field.name, 'set-binding', text)
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
  commit(name, 'set-binding', path)
}

// --- the trailing `+ attribute` row: pick a name, then straight into its value
const adding = ref(false)
const newAttr = ref('')

function addAttribute(name: string) {
  const clean = name.trim()
  adding.value = false
  newAttr.value = ''
  if (!clean) return
  focusName = clean
  commit(clean, 'set-static', '')
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
    <div v-if="element.text" class="field">
      <label for="prop-text" class="key">text</label>
      <div class="line">
        <textarea
          v-if="element.text.value.includes('\n')"
          id="prop-text" rows="3" class="ctl tall" :value="element.text.value"
          @change="emit('set-text', onInput($event))"
        />
        <input
          v-else id="prop-text" type="text" class="ctl" :class="element.text.value.includes('{{') ? '' : 'prose'"
          :value="element.text.value" @change="emit('set-text', onInput($event))"
        >
        <button v-if="variables?.length" type="button" class="pick" title="insert a variable" @click="openPicker($event, 'text')">{ }</button>
      </div>
    </div>

    <div class="field">
      <label for="prop-tag" class="key">tag</label>
      <select
        id="prop-tag" class="ctl" :value="element.tag" :disabled="!isHtmlTag(element.tag)"
        :title="isHtmlTag(element.tag) ? 'change the tag' : 'components keep their name'"
        @change="emit('change-tag', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="tag in tagOptions" :key="tag" :value="tag">{{ tag }}</option>
      </select>
    </div>

    <div v-for="f in fields" :key="f.name" class="field" :class="{ wide: f.control === 'expression' }" :title="f.hint">
      <label :for="`prop-${f.name}`" class="key">
        {{ f.name }}<span v-if="f.prop?.isBinding" class="bound">:</span>
      </label>

      <!-- Bound: the expression is authoritative, and it is code — mono, accent. -->
      <div v-if="f.control === 'expression'" class="line">
        <input
          :id="`prop-${f.name}`" class="ctl expr" :value="value(f)" spellcheck="false" placeholder="–"
          @change="setExpression(f, onInput($event))"
        >
        <button v-if="variables?.length" type="button" class="pick" title="insert a variable" @click="openPicker($event, f.name)">{ }</button>
      </div>

      <input
        v-else-if="f.control === 'number'" :id="`prop-${f.name}`" type="number" step="0.1" class="ctl"
        :value="value(f).replace(/[a-z]+$/i, '')" :placeholder="String(f.schema?.default ?? '–')"
        @change="setStatic(f, onInput($event) + (f.schema?.format === 'mm' ? 'mm' : ''))"
      >

      <select
        v-else-if="f.control === 'enum'" :id="`prop-${f.name}`" class="ctl" :value="value(f)"
        @change="setStatic(f, onInput($event))"
      >
        <option value="">–</option>
        <option v-for="option in f.schema?.values ?? []" :key="option" :value="option">{{ option }}</option>
      </select>

      <input
        v-else-if="f.control === 'boolean'" :id="`prop-${f.name}`" type="checkbox" class="check"
        :checked="!!f.prop" @change="commit(f.name, ($event.target as HTMLInputElement).checked ? 'set-static' : 'remove', true)"
      >

      <div v-else-if="f.control === 'color'" class="line">
        <input
          :id="`prop-${f.name}`" type="color" class="swatch" :value="value(f) || '#000000'"
          @change="setStatic(f, onInput($event))"
        >
        <input class="ctl" :value="value(f)" aria-label="hex value" placeholder="–" @change="setStatic(f, onInput($event))">
      </div>

      <div v-else class="line">
        <input
          :id="`prop-${f.name}`" type="text" class="ctl" :value="value(f)"
          :placeholder="String(f.schema?.default ?? '–')" @change="setStatic(f, onInput($event))"
        >
        <button v-if="variables?.length" type="button" class="pick" title="insert a variable" @click="openPicker($event, f.name)">{ }</button>
      </div>
    </div>

    <div class="add">
      <input
        v-if="adding && !addable.length" :ref="autofocus" v-model="newAttr" placeholder="name"
        aria-label="new attribute name" class="ctl" @change="addAttribute(newAttr)" @keydown.esc="adding = false"
      >
      <button v-else type="button" class="more" @click="adding = !adding">+ attribute</button>
    </div>

    <!-- Popovers: the column is narrow and clips, so both hang off the button in fixed space. -->
    <template v-if="picker || (adding && addable.length)">
      <span class="backdrop" @click="((picker = null), (adding = false))" />

      <div v-if="picker" class="menu" :style="{ top: `${pickerPos.top}px`, left: `${pickerPos.left}px` }" @keydown.escape="picker = null">
        <input v-if="(variables?.length ?? 0) > 8" :ref="autofocus" v-model="query" placeholder="variable…" aria-label="filter">
        <ul role="listbox">
          <li v-for="v in variableList" :key="v.path" role="option" @mousedown.prevent="pickVariable(v.path)">
            <span class="name">{{ v.path }}</span><span class="hint">{{ v.hint }}</span>
          </li>
          <li v-if="!variableList.length" class="none">nothing to insert here</li>
        </ul>
      </div>

      <div v-else class="menu at-add">
        <button v-for="name in addable" :key="name" type="button" class="item" @click="addAttribute(name)">{{ name }}</button>
        <input :ref="autofocus" v-model="newAttr" placeholder="new…" aria-label="new attribute name" @change="addAttribute(newAttr)" @keydown.esc="adding = false">
      </div>
    </template>
  </div>
</template>

<style scoped>
/* SPEC §4.3 / §5: fields 26px, radius 6, label 9px sans muted 3px above the control. */
.attrs { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.field:has(.tall), .field:has(#prop-text), .field.wide { grid-column: 1 / -1; }
.key { font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground); }
.bound { color: var(--info); }
.line { display: flex; align-items: center; gap: 5px; min-width: 0; }
.ctl {
  flex: 1; min-width: 0; height: 26px; padding: 0 8px;
  border: 1px solid var(--input); border-radius: 6px; background: var(--card);
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 450; color: var(--foreground); outline: none;
}
.ctl::placeholder { color: oklch(0.68 0.008 60); }
.ctl:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
.ctl.tall { height: auto; padding: 4px 8px; line-height: 1.5; }
/* Prose is prose (CLAUDE.md); text with `{{ }}` in it is code and stays mono. */
.ctl.prose { font-family: var(--font-sans); font-size: 11px; }
.ctl.expr { color: var(--primary); }
.swatch { flex: none; width: 26px; height: 26px; padding: 2px; border: 1px solid var(--input); border-radius: 6px; background: var(--card); }
.check { width: 30px; height: 18px; appearance: none; border: 1px solid var(--input); border-radius: 9px; background: var(--muted); transition: background-color 120ms ease-out; }
.check:checked { background: var(--primary); }
.pick {
  flex: none; width: 26px; height: 26px; display: grid; place-items: center;
  border: 1px solid var(--input); border-radius: 6px; background: var(--card);
  font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--primary);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.pick:hover { border-color: var(--primary); background: var(--accent); }
.add { grid-column: 1 / -1; }
.more { border: 0; background: transparent; padding: 0; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--primary); }
.more:hover { text-decoration: underline; }

/* Popover shell — SPEC §4.8, the same one Layers uses. */
.backdrop { position: fixed; inset: 0; z-index: 19; }
.menu {
  position: fixed; z-index: 60; width: 260px; padding: 6px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--popover);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.10);
}
.menu.at-add { position: absolute; left: 0; bottom: 22px; }
.menu input { width: 100%; height: 26px; padding: 0 8px; border: 1px solid var(--input); border-radius: 6px; background: var(--card); font-family: var(--font-mono); font-size: 11px; outline: none; }
.menu input:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
.menu ul { max-height: 260px; margin: 4px 0 0; padding: 0; overflow: auto; list-style: none; }
.menu li, .menu .item {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 26px; padding: 0 9px;
  border: 0; border-radius: 5px; background: transparent; cursor: default;
  font-family: var(--font-mono); font-size: 11px; color: var(--popover-foreground); text-align: left;
}
.menu li:hover, .menu .item:hover { background: var(--accent); }
.menu li.none { color: var(--muted-foreground); }
.menu .hint { margin-left: auto; font-size: 10px; color: var(--muted-foreground); }
.menu .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
