<!--
  The `{ }` popover (Components board), and the only list-with-a-search in the app: a search
  field above 8 rows, one row per candidate with a **live value preview** on the right, and — at
  the top, styled as an action rather than a list item — the row that unbinds.

  One recipe everywhere: the editor's variable picker, the printer's copies picker, the mapping
  pickers and the insert-element popup are all this component (atlas 25 vs 42).

  Rows are mono (they are paths, tags, selectors); the action row is a sentence, so it is sans.
-->
<script lang="ts">
export type PickerRow = {
  value: string
  label: string
  /** The live value, or what the thing is: right-aligned, ellipsized, mono meta. */
  preview?: string
  /** A 2-letter kind marker in front of the label (`C`, `S`, `<>`). */
  badge?: string
  badgeKind?: 'comp' | 'snip' | 'html'
  /** Cannot be picked; `preview` says why. */
  disabled?: boolean
  on?: boolean
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Menu from './Menu.vue'

const props = withDefaults(
  defineProps<{
    anchor: DOMRect | null
    rows: PickerRow[]
    /** The unbind / reset row, above the list. Omit for a picker that only picks. */
    action?: string
    width?: number
    align?: 'left' | 'right'
    placeholder?: string
    /** Nothing to offer. */
    empty?: string
  }>(),
  { width: 240, align: 'left', placeholder: 'search…', empty: 'nothing to pick here' },
)

const emit = defineEmits<{
  pick: [value: string, event: Event]
  action: []
  close: []
}>()

const query = ref('')
watch(() => props.anchor, () => (query.value = ''))

/** The board's rule: a search field once the list is longer than 8 rows. */
const searchable = computed(() => props.rows.length > 8)
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.rows.filter((r) => r.label.toLowerCase().includes(q)) : props.rows
})
/** Enter takes the first row that can actually be picked. */
const onEnter = (e: KeyboardEvent) => {
  const first = shown.value.find((r) => !r.disabled)
  if (first) emit('pick', first.value, e)
}
const focus = (el: unknown) => (el as HTMLInputElement | null)?.focus()
</script>

<template>
  <Menu :anchor="anchor" :width="width" :align="align" @close="emit('close')">
    <template #top>
      <input
        v-if="searchable" :ref="focus" v-model="query" class="search" :placeholder="placeholder"
        aria-label="filter" @keydown.enter.prevent="onEnter"
      >
      <button v-if="action" type="button" class="act" @click="emit('action')">{{ action }}</button>
    </template>
    <button
      v-for="row in shown" :key="row.value" type="button" class="row"
      :class="{ off: row.disabled, on: row.on }" @click="emit('pick', row.value, $event)"
    >
      <span v-if="row.badge" class="badge" :class="row.badgeKind">{{ row.badge }}</span>
      <span class="l">{{ row.label }}</span>
      <span v-if="row.preview" class="p">{{ row.preview }}</span>
    </button>
    <p v-if="!shown.length" class="none">{{ empty }}</p>
  </Menu>
</template>

<style scoped>
.search {
  width: calc(100% - 4px); height: var(--h-control); margin: 2px 2px 4px; padding: 0 7px;
  border: 1px solid var(--primary); border-radius: var(--radius-control); background: var(--pane);
  font-family: var(--font-mono); font-size: var(--t5); color: var(--foreground); outline: none;
}
.search::placeholder { color: var(--faint-foreground); }
/* An action, not a list item: sans, quieter, and cut off from the rows by a hairline. */
.act {
  display: flex; align-items: center; width: 100%; height: var(--h-list); margin-bottom: 3px;
  padding: 0 9px; border: 0; border-bottom: 1px solid var(--hairline); border-radius: 5px 5px 0 0;
  background: transparent; text-align: left;
  font-family: var(--font-sans); font-size: var(--t5); color: var(--muted-foreground);
  transition: background-color 120ms ease-out;
}
.act:hover { background: var(--row-hover); }
.row {
  display: flex; align-items: baseline; gap: 8px; width: 100%; height: var(--h-list); padding: 0 9px;
  border: 0; border-radius: 5px; background: transparent; text-align: left;
  font-family: var(--font-mono); font-size: var(--t5); color: var(--foreground);
  transition: background-color 120ms ease-out;
}
.row:hover:not(.off) { background: var(--row-hover); }
.row.off { opacity: 0.45; }
/* The active binding: accent wash, no ring. The ring follows focus — the last-clicked row. */
.row.on { background: var(--accent); color: var(--accent-foreground); }
.row:focus { outline: none; box-shadow: inset 0 0 0 1px var(--muted-foreground); }
.row.on:focus { box-shadow: inset 0 0 0 1px var(--primary); }
.row .l { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .p {
  margin-left: auto; flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--t2); color: var(--meta-foreground);
}
.badge {
  flex: none; align-self: center; padding: 2.5px 4px; border-radius: var(--radius-badge);
  font-family: var(--font-sans); font-size: 8.5px; font-weight: 600; line-height: 1;
  background: var(--field); color: var(--muted-foreground);
}
.badge.snip { background: var(--info-bg); color: var(--info); }
.badge.comp { background: var(--comp-bg); color: var(--comp-fg); }
.none { margin: 0; padding: 5px 9px; font-family: var(--font-sans); font-size: var(--t3); color: var(--muted-foreground); }
</style>
