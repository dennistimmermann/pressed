<!-- Library + snippet palette; a click inserts the tag at the caret (design §3.1). -->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { insertAt } from './ast'
import type { EditorHandle } from './editor-handle'
import type { ComponentSchema } from './types'
import { badgeFor } from './inspector/badges'
import { useListNav } from './inspector/listbox'

const props = defineProps<{
  library: ComponentSchema[]
  snippets: ComponentSchema[]
  handle: EditorHandle | null
  /** Ring the row of the component the caret is in; falls back to the last inserted one. */
  selectedName?: string
  /** Editor selection, if the host tracks one — without it there is nothing to extract. */
  selection?: { start: number; end: number }
}>()

const emit = defineEmits<{
  'extract-snippet': [{ text: string; start: number; end: number }]
  promote: [name: string]
}>()

type Item = ComponentSchema & { isSnippet: boolean; index: number }

const filter = ref('')
const lastInserted = ref<string>()
const listId = useId()
const inputId = useId()

const groups = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  const match = (c: ComponentSchema) =>
    !needle || c.name.toLowerCase().includes(needle) || c.props.some((p) => p.name.toLowerCase().includes(needle))
  let index = 0
  const take = (list: ComponentSchema[], isSnippet: boolean): Item[] =>
    list.filter(match).map((c) => ({ ...c, isSnippet, index: index++ }))
  return [
    { label: 'Library', items: take(props.library, false) },
    { label: `Snippets in this file (${props.snippets.length})`, items: take(props.snippets, true) },
  ]
})

const items = computed(() => groups.value.flatMap((g) => g.items))
const { active, onKeydown, optionId } = useListNav(
  computed(() => items.value.length),
  listId,
  (index) => insert(items.value[index]),
)

const ringed = computed(() => props.selectedName ?? lastInserted.value)

/** `<QrCode value="" ecc="M" />` — required props only, bound when they are not strings. */
function stub(item: ComponentSchema): string {
  const attrs = item.props
    .filter((p) => p.required)
    .map((p) => (p.type === 'string' ? ` ${p.name}=""` : ` :${p.name}=""`))
    .join('')
  return `<${item.name}${attrs} />`
}

function insert(item: Item | undefined) {
  if (!item || !props.handle) return
  const offset = props.handle.getOffset()
  const text = stub(item)
  props.handle.executeEdits([insertAt(offset, text)])
  // Land the caret between the quotes of the first stubbed prop, else after the tag.
  const empty = text.indexOf('""')
  props.handle.setCaret(offset + (empty === -1 ? text.length : empty + 1))
  props.handle.focus()
  lastInserted.value = item.name
  active.value = item.index
}

// Hover popover: the prop table from defineProps + JSDoc, after a beat so it does not flicker
// while the pointer crosses the list.
const hovered = ref<{ item: Item; top: number; left: number }>()
let hoverTimer: ReturnType<typeof setTimeout> | undefined

function onEnterRow(event: MouseEvent, item: Item) {
  clearTimeout(hoverTimer)
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hoverTimer = setTimeout(() => (hovered.value = { item, top: rect.top, left: rect.right + 8 }), 300)
}

function onLeaveRow() {
  clearTimeout(hoverTimer)
  hovered.value = undefined
}

const extractable = computed(() => !!props.selection && props.selection.end > props.selection.start)

function extract() {
  const { start, end } = props.selection!
  emit('extract-snippet', { text: props.handle?.getValue().slice(start, end) ?? '', start, end })
}

const promotable = computed(() => items.value.find((i) => i.name === ringed.value && i.isSnippet))
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-card text-card-foreground">
    <header class="flex h-[34px] flex-none items-center border-b border-border px-3">
      <span class="eyebrow">Components</span>
      <span class="ml-auto font-mono text-[10.5px] text-muted-foreground">click = insert</span>
    </header>

    <div class="flex-none px-2 py-2">
      <label :for="inputId" class="sr-only">Filter components</label>
      <input
        :id="inputId"
        v-model="filter"
        type="search"
        placeholder="filter"
        class="h-7 w-full rounded-md border border-input bg-background px-2 font-mono text-[11px] outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </div>

    <div
      role="listbox"
      tabindex="0"
      aria-label="Components"
      :aria-activedescendant="items.length ? optionId(active) : undefined"
      class="min-h-0 flex-1 overflow-y-auto px-1 pb-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      @keydown="onKeydown"
    >
      <template v-for="group in groups" :key="group.label">
        <div class="px-2 pt-2 pb-1 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {{ group.label }}
        </div>
        <div
          v-for="item in group.items"
          :id="optionId(item.index)"
          :key="item.name"
          role="option"
          :aria-selected="item.name === ringed"
          class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors duration-[120ms] ease-out hover:bg-muted"
          :class="[
            item.name === ringed && 'bg-accent text-accent-foreground ring-1 ring-accent-border ring-inset',
            item.index === active && 'bg-muted',
          ]"
          @click="insert(item)"
          @mouseenter="onEnterRow($event, item)"
          @mouseleave="onLeaveRow"
        >
          <span
            class="mt-px flex h-5 w-5 flex-none items-center justify-center rounded-[5px] bg-[var(--info-bg)] font-mono text-[9.5px] font-semibold text-[var(--info)]"
            aria-hidden="true"
          >
            {{ badgeFor(item.name) }}
          </span>
          <span class="min-w-0">
            <span class="block font-mono text-[11.5px] font-medium">{{ item.name }}</span>
            <span class="block truncate font-mono text-[10px] text-muted-foreground">
              {{ item.props.map((p) => p.name).join(' ') || '—' }}
            </span>
          </span>
        </div>
      </template>
    </div>

    <footer class="flex-none border-t border-border px-3 py-2">
      <button
        v-if="extractable"
        type="button"
        class="block text-left text-[11px] text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        @click="extract"
      >
        Extract selection → snippet
      </button>
      <button
        type="button"
        class="mt-1 block text-left font-mono text-[10px] text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        :disabled="!promotable"
        @click="promotable && emit('promote', promotable.name)"
      >
        promote snippet → library file
      </button>
    </footer>

    <!-- Props popover: plain fixed positioning, the pane is not a layer host. -->
    <Teleport to="body">
      <div
        v-if="hovered"
        role="tooltip"
        class="pointer-events-none fixed z-50 w-[260px] rounded-[10px] border border-border bg-popover p-3 text-popover-foreground shadow-[0_18px_40px_-14px_rgb(0_0_0/.30)]"
        :style="{ top: `${hovered.top}px`, left: `${hovered.left}px` }"
      >
        <div class="font-mono text-[11.5px] font-medium">{{ hovered.item.name }}</div>
        <div v-if="!hovered.item.props.length" class="mt-1 text-[11px] text-muted-foreground">no props</div>
        <div v-for="prop in hovered.item.props" :key="prop.name" class="mt-2">
          <div class="flex items-baseline gap-2">
            <span class="font-mono text-[11px] text-[var(--info)]">{{ prop.name }}</span>
            <span class="font-mono text-[9.5px] text-muted-foreground">
              {{
                [prop.values ? prop.values.join(' ') : prop.type, prop.format, prop.required ? 'required' : '']
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </div>
          <div v-if="prop.doc" class="text-[11px] text-muted-foreground">{{ prop.doc }}</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
