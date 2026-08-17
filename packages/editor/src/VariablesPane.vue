<!-- The row's fields with the current row's values; a click inserts the path (design §3.2). -->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { insertVar } from './ast'
import type { EditorHandle } from './editor-handle'
import type { Row } from './types'
import { useListNav } from './inspector/listbox'
import { buildTree, flatten, type VarNode } from './inspector/row-tree'

const props = defineProps<{
  /** TS type text for the row, from the data source. */
  rowType: string
  /** The row whose values are shown as examples. */
  row?: Row
  /** e.g. `Spool · row 1` — the type name and which row supplies the examples. */
  rowLabel: string
  handle: EditorHandle | null
  /** Current editor text; the caret's context decides `{{ row.x }}` vs `row.x`. */
  source: string
}>()

const emit = defineEmits<{ 'go-to-data': [] }>()

const filter = ref('')
const collapsed = ref(new Set<string>())
const listId = useId()
const inputId = useId()

const tree = computed(() => buildTree(props.rowType, props.row))
const rows = computed(() => flatten(tree.value, collapsed.value, filter.value))

const { active, onKeydown, optionId } = useListNav(
  computed(() => rows.value.length),
  listId,
  (index) => activate(rows.value[index]),
)

function activate(node: VarNode | undefined) {
  if (!node) return
  if (node.kind === 'object') return toggle(node)
  if (!props.handle) return
  const offset = props.handle.getOffset()
  const edit = insertVar(props.source, offset, node.path)
  props.handle.executeEdits([edit])
  props.handle.setCaret(offset + edit.text.length)
  props.handle.focus()
}

function toggle(node: VarNode) {
  const next = new Set(collapsed.value)
  if (!next.delete(node.path)) next.add(node.path)
  collapsed.value = next
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-card text-card-foreground">
    <header class="flex h-[34px] flex-none items-center border-b border-border px-3">
      <span class="eyebrow">Variables</span>
      <span class="ml-auto font-mono text-[10px] text-muted-foreground">{{ rowLabel }}</span>
    </header>

    <template v-if="rows.length || filter">
      <div class="flex-none px-2 py-2">
        <label :for="inputId" class="sr-only">Filter variables</label>
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
        aria-label="Row variables"
        :aria-activedescendant="rows.length ? optionId(active) : undefined"
        class="min-h-0 flex-1 overflow-y-auto px-1 pb-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        @keydown="onKeydown"
      >
        <div
          v-for="(node, index) in rows"
          :id="optionId(index)"
          :key="node.path"
          role="option"
          :aria-selected="index === active"
          :aria-expanded="node.kind === 'object' ? !collapsed.has(node.path) : undefined"
          class="flex cursor-pointer items-baseline gap-2 rounded-md py-1 pr-2 transition-colors duration-[120ms] ease-out hover:bg-muted"
          :class="index === active && 'bg-muted'"
          :style="{ paddingLeft: `${8 + node.depth * 13}px` }"
          @click="activate(node)"
        >
          <span
            class="min-w-0 truncate font-mono text-[11.5px]"
            :class="node.kind === 'leaf' ? 'text-[var(--info)]' : 'text-foreground'"
          >
            <span v-if="node.kind === 'object'" class="mr-1 inline-block w-2 text-muted-foreground" aria-hidden="true">
              {{ collapsed.has(node.path) ? '▸' : '▾' }}
            </span>
            {{ node.name }}
          </span>
          <span class="ml-auto max-w-[45%] truncate font-mono text-[10.5px] text-muted-foreground">
            {{ node.value }}
          </span>
        </div>
      </div>
    </template>

    <div v-else class="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
      <p class="text-[13px] font-semibold">Load data to start</p>
      <button
        type="button"
        class="text-[11px] text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        @click="emit('go-to-data')"
      >
        Open the Data view
      </button>
    </div>
  </div>
</template>
