<!--
  The element at the caret as a form (design §3.4). Nothing in this pane owns state: every
  change is one text-range edit on the attribute, so ⌘Z in the editor undoes it.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { parserOptions } from '@vue/compiler-dom'
import { attributeEdit, type ElementInfo, type PropInfo } from './ast'
import type { EditorHandle } from './editor-handle'
import type { PropSchema } from '@sprint/core'
import type { ComponentSchema } from './types'
import { badgeFor } from './inspector/badges'
import { htmlAttrsFor } from './inspector/html-attrs'

const props = defineProps<{
  element: ElementInfo | null
  /** Schema for `element.tag`, looked up by the host in library + snippets; null for HTML tags. */
  schema: (ComponentSchema & { doc?: string }) | null
  handle: EditorHandle | null
  /** 1-based caret line, for the header. */
  line: number
}>()

type Control = 'expression' | 'number' | 'enum' | 'boolean' | 'color' | 'text'
type Field = {
  name: string
  schema?: PropSchema
  prop?: PropInfo
  control: Control
  hint: string
  /** The static value a literal binding would downgrade to. */
  literal?: string
}

const editingExpression = ref<string>()
/** Not reactive: it only steers the next ref callback, and re-rendering for it is pointless. */
let focusName: string | undefined

const origin = computed(() =>
  props.schema ? 'from defineProps + JSDoc'
  : props.element && parserOptions.isNativeTag?.(props.element.tag) ? 'html element'
  : 'unknown tag',
)

const fields = computed<Field[]>(() => {
  const element = props.element
  if (!element) return []
  const byName = (name: string) => element.props.find((p) => p.name === name)

  const known: Field[] = props.schema
    ? props.schema.props.map((schema) => field(schema.name, schema, byName(schema.name)))
    : htmlAttrsFor(element.tag).map((name) => field(name, undefined, byName(name)))

  // Whatever is on the element but not in the schema still needs a control; structural
  // directives and event handlers are code, not properties, and stay in the editor.
  const extra = element.props
    .filter((p) => !known.some((f) => f.name === p.name) && !p.isEvent && !p.name.startsWith('v-'))
    .map((p) => field(p.name, undefined, p))

  return [...known, ...extra]
})

function field(name: string, schema: PropSchema | undefined, prop: PropInfo | undefined): Field {
  const hint = schema
    ? [schema.format ?? (schema.type === 'enum' ? (schema.values ?? []).join(' ') : schema.type), schema.required ? 'required' : '']
        .filter(Boolean)
        .join(' · ')
    : 'attr'
  return { name, schema, prop, control: controlFor(schema, prop), hint, literal: literalOf(prop) }
}

function controlFor(schema: PropSchema | undefined, prop: PropInfo | undefined): Control {
  if (prop?.isBinding) return 'expression'
  if (schema?.format === 'color') return 'color'
  if (schema?.format === 'mm' || schema?.type === 'number') return 'number'
  if (schema?.type === 'enum') return 'enum'
  if (schema?.type === 'boolean') return 'boolean'
  return 'text'
}

/** `'x'`, `"x"`, `12`, `true` — the only expressions that survive being made static. */
function literalOf(prop: PropInfo | undefined): string | undefined {
  if (!prop?.isBinding || !prop.value) return undefined
  const text = prop.value.trim()
  const quoted = /^'([^']*)'$|^"([^"]*)"$/.exec(text)
  if (quoted) return quoted[1] ?? quoted[2]
  if (/^-?\d+(\.\d+)?$|^(true|false)$/.test(text)) return text
  return undefined
}

function value(field: Field): string {
  return field.prop?.value ?? ''
}

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
  editingExpression.value = undefined
  if (text.trim() === '') return field.prop ? commit(field.name, 'remove') : undefined
  commit(field.name, 'set-binding', text)
}

function convertToStatic(field: Field) {
  if (field.literal === 'false') return commit(field.name, 'remove')
  commit(field.name, 'set-static', field.literal === 'true' ? true : field.literal)
}

// --- the trailing `+ attribute` row: a name field, then straight into its value
const newAttr = ref<string>()

function addAttribute(name: string) {
  const clean = name.trim()
  newAttr.value = undefined
  if (!clean) return
  focusName = clean
  commit(clean, 'set-static', '')
}

function onInput(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function autofocus(el: unknown) {
  ;(el as HTMLInputElement | null)?.focus()
}

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

const INPUT =
  'h-[26px] rounded-md border border-input bg-background px-2 font-mono text-[11px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-card text-card-foreground">
    <template v-if="element">
      <header class="flex h-[34px] flex-none items-baseline gap-2 border-b border-border px-3">
        <span
          class="relative top-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-[5px] bg-[var(--info-bg)] font-mono text-[9.5px] font-semibold text-[var(--info)]"
          aria-hidden="true"
        >
          {{ schema ? badgeFor(schema.name) : '<>' }}
        </span>
        <span class="font-mono text-[12px] font-semibold">{{ element.tag }}</span>
        <span class="flex-none font-mono text-[10.5px] text-muted-foreground">line {{ line }} · cursor</span>
        <span v-if="schema?.doc" class="min-w-0 truncate text-[11px] text-muted-foreground">{{ schema.doc }}</span>
        <span class="ml-auto flex-none font-mono text-[10.5px] text-muted-foreground">{{ origin }}</span>
      </header>

      <div class="flex min-h-0 flex-1 flex-wrap content-start items-start gap-x-4 gap-y-3 overflow-y-auto px-3 py-3">
        <div v-for="f in fields" :key="f.name" class="flex flex-col gap-1">
          <label :for="`prop-${f.name}`" class="flex items-baseline gap-1.5">
            <span class="text-[10.5px] font-medium">{{ f.name }}</span>
            <span v-if="f.prop?.isBinding" class="font-mono text-[10px] text-[var(--info)]">:{{ f.name }}</span>
            <span class="font-mono text-[9.5px] text-muted-foreground">{{ f.hint }}</span>
            <span
              v-if="f.prop?.isBinding"
              class="rounded-[4px] bg-[oklch(0.94_0.03_250)] px-1 font-mono text-[9px] text-[oklch(0.40_0.10_250)]"
            >
              bound
            </span>
          </label>

          <!-- Bound: the expression is authoritative; the code field opens on click. -->
          <template v-if="f.control === 'expression'">
            <input
              v-if="editingExpression === f.name"
              :id="`prop-${f.name}`"
              :ref="autofocus"
              :value="value(f)"
              :class="[INPUT, 'w-[220px] text-[var(--primary)]']"
              @change="setExpression(f, onInput($event))"
              @keydown.esc="editingExpression = undefined"
            />
            <button
              v-else
              :id="`prop-${f.name}`"
              type="button"
              :class="[INPUT, 'w-[220px] truncate bg-muted text-left text-[var(--primary)]']"
              @click="editingExpression = f.name"
            >
              {{ value(f) || '—' }}
            </button>
            <button
              v-if="f.literal !== undefined"
              type="button"
              class="self-start text-[10px] text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              @click="convertToStatic(f)"
            >
              convert to static value
            </button>
          </template>

          <input
            v-else-if="f.control === 'number'"
            :id="`prop-${f.name}`"
            type="number"
            step="0.1"
            :value="value(f).replace(/[a-z]+$/i, '')"
            :placeholder="String(f.schema?.default ?? '')"
            :class="[INPUT, 'w-[104px]']"
            @change="setStatic(f, onInput($event) + (f.schema?.format === 'mm' ? 'mm' : ''))"
          />

          <select
            v-else-if="f.control === 'enum'"
            :id="`prop-${f.name}`"
            :value="value(f)"
            :class="[INPUT, 'w-[118px]']"
            @change="setStatic(f, onInput($event))"
          >
            <option value="">—</option>
            <option v-for="option in f.schema?.values ?? []" :key="option" :value="option">{{ option }}</option>
          </select>

          <input
            v-else-if="f.control === 'boolean'"
            :id="`prop-${f.name}`"
            type="checkbox"
            role="switch"
            class="h-[18px] w-[30px] appearance-none rounded-full border border-input bg-muted outline-none transition-colors duration-[120ms] ease-out checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            :checked="!!f.prop"
            @change="commit(f.name, ($event.target as HTMLInputElement).checked ? 'set-static' : 'remove', true)"
          />

          <div v-else-if="f.control === 'color'" class="flex items-center gap-1.5">
            <input
              :id="`prop-${f.name}`"
              type="color"
              :value="value(f) || '#000000'"
              class="h-[26px] w-[34px] rounded-md border border-input bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              @change="setStatic(f, onInput($event))"
            />
            <input
              :value="value(f)"
              aria-label="hex value"
              :class="[INPUT, 'w-[84px]']"
              @change="setStatic(f, onInput($event))"
            />
          </div>

          <input
            v-else
            :id="`prop-${f.name}`"
            type="text"
            :value="value(f)"
            :placeholder="String(f.schema?.default ?? '')"
            :class="[INPUT, 'w-[150px]']"
            @change="setStatic(f, onInput($event))"
          />
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-[10.5px] font-medium text-transparent select-none" aria-hidden="true">.</span>
          <input
            v-if="newAttr !== undefined"
            :ref="autofocus"
            v-model="newAttr"
            aria-label="new attribute name"
            placeholder="name"
            :class="[INPUT, 'h-[30px] w-[120px]']"
            @change="addAttribute(newAttr ?? '')"
            @keydown.esc="newAttr = undefined"
          />
          <button
            v-else
            type="button"
            class="h-[30px] rounded-md border border-dashed border-input px-2.5 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            @click="newAttr = ''"
          >
            + attribute
          </button>
        </div>
      </div>

      <footer class="flex-none border-t border-border px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
        edits are text-range edits in the editor — undo-able with ⌘Z · unknown props fall back to a text field
      </footer>
    </template>

    <p v-else class="flex flex-1 items-center justify-center text-[12px] text-muted-foreground">
      Place the caret inside a tag
    </p>
  </div>
</template>
