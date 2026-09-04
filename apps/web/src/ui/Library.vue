<!--
  The library dialog (Components board): a 760 × 520 modal with a header (title · search ·
  ghost actions · ✕), an optional note row, and a 176px facet nav beside the content.

  Templates and Icons are the same piece of furniture with different cards in it, so the
  furniture lives here once. Everything specific — what a card looks like, what a facet means —
  arrives as slots and data; this file knows nothing about templates, icons or millimetres.
-->
<script lang="ts">
/** One nav row. `on` is the caller's answer: two facet groups can be lit at the same time. */
export type Facet = { key: string; label: string; count?: number | string; on?: boolean }
</script>

<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const props = defineProps<{
  open: boolean
  /** The header's heading. */
  title: string
  /** The dialog's accessible name, when it differs from the heading ("Manage templates"). */
  label?: string
  /** Facet groups in nav order; a hairline separates one group from the next, and every group
      after the first is mono — it answers a machine's question (a size, a variant). */
  groups?: Facet[][]
  searchLabel?: string
  /** What the last action would not take: a sans lead, then a mono list. Never a toast. */
  note?: { lead: string; detail: string } | null
}>()

const query = defineModel<string>('search', { default: '' })
const emit = defineEmits<{ close: []; pick: [key: string]; submit: [] }>()

defineSlots<{
  actions?(): unknown
  /** The dialog element: a modal `<dialog>` owns the top layer, so a Menu raised from inside
      one has to be teleported into it (see `ui/Menu`'s `to`). */
  default(props: { dialog: HTMLDialogElement | null }): unknown
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
// A native <dialog> gives us the focus trap, Esc and the backdrop for free.
watch(() => props.open, (open) => (open ? dialog.value?.showModal() : dialog.value?.close()))
</script>

<template>
  <!-- m-auto: Tailwind's preflight zeroes the margin a native modal centres itself with. -->
  <dialog
    ref="dialog"
    class="m-auto h-[520px] w-[760px] rounded-[var(--radius-trough)] border border-input bg-popover p-0 text-popover-foreground shadow-[var(--shadow-popover)] backdrop:bg-black/35"
    :aria-label="label ?? title"
    @close="emit('close')"
  >
    <div class="flex h-full flex-col">
      <header class="flex flex-none items-center gap-2 border-b border-[var(--section-border)] px-3 py-2">
        <h2 class="text-[13px] font-semibold">{{ title }}</h2>
        <input
          v-model="query" type="search" placeholder="search…" :aria-label="searchLabel ?? 'Search'"
          class="ml-2 h-[30px] w-[180px] rounded-[var(--radius-control)] border border-transparent bg-muted px-2 text-[12px] outline-none focus:border-primary focus:bg-card"
          @keydown.enter.prevent="emit('submit')"
        >
        <span class="flex-1" />
        <!-- Ghost, not filled: Print is the only filled button in the app (invariant 1). -->
        <slot name="actions" />
        <button type="button" aria-label="Close" class="ml-1 size-8 rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted" @click="emit('close')">
          ✕
        </button>
      </header>

      <p v-if="note" class="border-b border-[var(--section-border)] px-3 py-1.5 text-[11px] text-muted-foreground">
        {{ note.lead }} <span class="font-mono">{{ note.detail }}</span>
      </p>

      <div class="flex min-h-0 flex-1">
        <nav v-if="groups?.length" class="flex w-[176px] flex-none flex-col gap-px overflow-y-auto border-r border-[var(--section-border)] p-2" aria-label="Filter">
          <template v-for="(group, i) in groups" :key="i">
            <span v-if="i && group.length" class="my-1.5 h-px flex-none bg-[var(--section-border)]" />
            <button
              v-for="f in group" :key="f.key" type="button"
              class="flex flex-none items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[12px] transition-colors duration-120 ease-out outline-none focus:ring-1 focus:ring-inset"
              :class="f.on ? 'bg-accent text-accent-foreground focus:ring-primary' : 'hover:bg-muted focus:ring-[var(--muted-foreground)]'"
              @click="emit('pick', f.key)"
            >
              <span class="truncate" :class="{ 'font-mono text-[11px]': i }">{{ f.label }}</span>
              <span class="flex-1" />
              <span v-if="f.count !== undefined" class="font-mono text-[10px] text-muted-foreground">{{ f.count }}</span>
            </button>
          </template>
        </nav>

        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <slot :dialog="dialog" />
        </div>
      </div>
    </div>
  </dialog>
</template>
