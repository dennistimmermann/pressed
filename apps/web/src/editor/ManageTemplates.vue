<script setup lang="ts">
import { anchorMenu } from '@/ui'
import { computed, ref, useTemplateRef, watch } from 'vue'

type Item = {
  id: string
  name: string
  /** Mono meta line under the name, e.g. `60 × 40 mm · mine`. */
  meta: string
  /** The size axis the filter rail groups by, e.g. `60 × 40`. */
  media: string
  kind: 'mine' | 'built-in'
  /** e.g. `3 assets · 412 KB`. */
  assetsSummary?: string
  /** Standalone HTML document for the thumbnail well. */
  thumbnail?: string
}

const props = defineProps<{ open: boolean; items: Item[] }>()

const emit = defineEmits<{
  close: []
  open: [id: string]
  duplicate: [id: string]
  rename: [id: string, name: string]
  export: [id: string]
  delete: [id: string]
  import: [files: File[]]
  create: []
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const query = ref('')
const filter = ref('all')
const menuId = ref<string | null>(null)
const menuPos = ref<Record<string, string>>({})
const toggleMenu = (id: string, e: MouseEvent) => {
  menuPos.value = anchorMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), 132, { align: 'right', height: 140 })
  menuId.value = menuId.value === id ? null : id
}
const renamingId = ref<string | null>(null)

// A native <dialog> gives us the focus trap, Esc and the backdrop for free.
watch(() => props.open, (open) => (open ? dialog.value?.showModal() : dialog.value?.close()))

const filters = computed(() => [
  { key: 'all', label: 'All', count: props.items.length },
  { key: 'mine', label: 'Mine', count: props.items.filter((i) => i.kind === 'mine').length },
  { key: 'built-in', label: 'Built-in', count: props.items.filter((i) => i.kind === 'built-in').length },
  ...[...new Set(props.items.map((i) => i.media))].sort().map((media) => ({
    key: `media:${media}`, label: media, count: props.items.filter((i) => i.media === media).length,
  })),
])

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.items.filter((i) =>
    (!q || `${i.name} ${i.meta}`.toLowerCase().includes(q)) &&
    (filter.value === 'all' ||
      (filter.value === 'mine' && i.kind === 'mine') ||
      (filter.value === 'built-in' && i.kind === 'built-in') ||
      filter.value === `media:${i.media}`),
  )
})

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) emit('import', [...input.files])
  input.value = '' // so importing the same file twice still fires
}

function closeMenuOnLeave(e: FocusEvent) {
  const wrapper = e.currentTarget as HTMLElement
  if (!wrapper.contains(e.relatedTarget as Node | null)) menuId.value = null
}

function commitRename(id: string, e: Event) {
  const name = (e.target as HTMLInputElement).value.trim()
  renamingId.value = null
  if (name) emit('rename', id, name)
}
</script>

<template>
  <!-- m-auto: Tailwind's preflight zeroes the margin a native modal centres itself with. -->
  <dialog
    ref="dialog"
    class="m-auto h-[520px] w-[760px] rounded-[var(--radius-trough)] border border-input bg-popover p-0 text-popover-foreground shadow-[var(--shadow-popover)] backdrop:bg-black/35"
    aria-label="Manage templates"
    @close="emit('close')"
  >
    <div class="flex h-full flex-col">
      <header class="flex flex-none items-center gap-2 border-b border-[var(--section-border)] px-3 py-2">
        <h2 class="text-[13px] font-semibold">Templates</h2>
        <label class="sr-only" for="manage-search">Search templates</label>
        <input
          id="manage-search" v-model="query" type="search" placeholder="Search"
          class="ml-2 h-[30px] w-[180px] rounded-[var(--radius-control)] border border-transparent bg-muted px-2 text-[12px] outline-none focus:border-primary focus:bg-card"
        >
        <span class="flex-1" />
        <!-- Ghost, not filled: Print is the only filled button in the app (invariant 1). -->
        <label class="flex h-8 cursor-pointer items-center rounded-[var(--radius-control)] border border-input px-2.5 text-[12px] hover:bg-muted">
          Import .vue / .zip
          <input type="file" accept=".vue,.zip" multiple class="sr-only" @change="onImport">
        </label>
        <button type="button" class="h-8 rounded-[var(--radius-control)] border border-input px-2.5 text-[12px] hover:bg-muted" @click="emit('create')">
          New template
        </button>
        <button type="button" aria-label="Close" class="ml-1 size-8 rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="flex min-h-0 flex-1">
        <nav class="flex w-[176px] flex-none flex-col border-r border-[var(--section-border)] p-2" aria-label="Filter">
          <button
            v-for="f in filters" :key="f.key" type="button"
            class="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[12px] transition-colors duration-120 ease-out"
            :class="filter === f.key ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary' : 'hover:bg-muted'"
            @click="filter = f.key"
          >
            <span class="truncate">{{ f.label }}</span>
            <span class="flex-1" />
            <span class="font-mono text-[10px] text-muted-foreground">{{ f.count }}</span>
          </button>
          <span class="flex-1" />
          <p class="px-2 font-mono text-[10px] leading-relaxed text-muted-foreground">stored in IndexedDB</p>
        </nav>

        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <ul class="flex flex-wrap gap-2.5">
            <li
              v-for="item in shown" :key="item.id"
              class="relative w-[170px] rounded-[var(--radius-control)] border border-input bg-card p-2"
            >
              <button
                type="button"
                class="block h-[74px] w-full overflow-hidden rounded-[var(--radius-control)] border border-input bg-[var(--canvas)]"
                :aria-label="`Open ${item.name}`"
                @click="emit('open', item.id)"
              >
                <!-- ponytail: fixed 380px viewport scaled to the well; wide labels clip.
                     Give the host a size prop if that ever matters. -->
                <iframe
                  v-if="item.thumbnail" :srcdoc="item.thumbnail" sandbox="" tabindex="-1" aria-hidden="true"
                  class="pointer-events-none h-[280px] w-[380px] origin-top-left border-0"
                  style="transform: scale(0.4)"
                />
              </button>

              <input
                v-if="renamingId === item.id"
                :value="item.name" autofocus
                class="mt-1.5 h-[26px] w-full rounded-[var(--radius-control)] border border-transparent bg-muted px-1.5 text-[11.5px] outline-none focus:border-primary focus:bg-card"
                @keydown.enter="commitRename(item.id, $event)"
                @blur="commitRename(item.id, $event)"
              >
              <p v-else class="mt-1.5 truncate text-[11.5px] font-medium">{{ item.name }}</p>

              <p class="font-mono text-[10px] text-muted-foreground">{{ item.meta }}</p>
              <p v-if="item.assetsSummary" class="font-mono text-[10px] text-muted-foreground">{{ item.assetsSummary }}</p>

              <!-- Close only when focus really leaves: closing on any focusout would unmount
                   the menu on mousedown and the click would never land. -->
              <div class="absolute top-1.5 right-1.5" @focusout="closeMenuOnLeave">
                <button
                  type="button" :aria-label="`Actions for ${item.name}`"
                  class="size-6 rounded-[var(--radius-control)] bg-card/80 text-muted-foreground hover:bg-muted"
                  @click="toggleMenu(item.id, $event)"
                >
                  ⋯
                </button>
                <div
                  v-if="menuId === item.id"
                  class="fixed z-30 w-[132px] rounded-[var(--radius-trough)] border border-input bg-popover p-1 shadow-[var(--shadow-popover)]"
                  :style="menuPos"
                >
                  <button type="button" class="block w-full rounded-[var(--radius-control)] px-2 py-1 text-left text-[12px] hover:bg-muted" @click="menuId = null; emit('duplicate', item.id)">Duplicate</button>
                  <button v-if="item.kind === 'mine'" type="button" class="block w-full rounded-[var(--radius-control)] px-2 py-1 text-left text-[12px] hover:bg-muted" @click="menuId = null; renamingId = item.id">Rename</button>
                  <button type="button" class="block w-full rounded-[var(--radius-control)] px-2 py-1 text-left text-[12px] hover:bg-muted" @click="menuId = null; emit('export', item.id)">Export</button>
                  <button v-if="item.kind === 'mine'" type="button" class="block w-full rounded-[var(--radius-control)] px-2 py-1 text-left text-[12px] text-destructive hover:bg-muted" @click="menuId = null; emit('delete', item.id)">Delete</button>
                </div>
              </div>
            </li>
          </ul>
          <p v-if="!shown.length" class="text-[12px] text-muted-foreground">No template matches.</p>
        </div>
      </div>
    </div>
  </dialog>
</template>
