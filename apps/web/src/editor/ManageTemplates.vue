<script setup lang="ts">
import { Menu, type MenuItem } from '@/ui'
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
  /** Label size in mm — the well shows the label at its true aspect, fitted. */
  size?: { width: number; height: number }
}

const props = defineProps<{
  open: boolean
  items: Item[]
  /**
   * Pick mode: one dialog, two jobs. The Data view opens it to choose the template it maps
   * against, so every management affordance — ⋯, rename, Import, New — is gone and a card
   * click is the whole interaction (S3).
   */
  pick?: boolean
  /** The template in hand; it wears the app's one selection recipe. */
  selectedId?: string | null
}>()

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
const menuAnchor = ref<DOMRect | null>(null)

/** Fit the label (mm → CSS px at 96/25.4) into the 152 × 74 well, aspect intact. */
const PX_PER_MM = 96 / 25.4
function fit(size?: { width: number; height: number }) {
  const { width, height } = size ?? { width: 50, height: 30 }
  const w = width * PX_PER_MM
  const h = height * PX_PER_MM
  const k = Math.min(152 / w, 74 / h)
  return { w: `${w * k}px`, h: `${h * k}px`, iw: `${w}px`, ih: `${h}px`, k: `scale(${k})` }
}
const toggleMenu = (id: string, e: MouseEvent) => {
  const same = menuId.value === id
  menuAnchor.value = same ? null : (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuId.value = same ? null : id
}
const closeMenu = () => { menuId.value = null; menuAnchor.value = null }

/** Destructive last is `ui/Menu`'s rule; built-ins simply cannot be renamed or deleted. */
const menuItems = computed<MenuItem[]>(() => {
  const item = props.items.find((i) => i.id === menuId.value)
  if (!item) return []
  return [
    { value: 'duplicate', label: 'Duplicate' },
    ...(item.kind === 'mine' ? [{ value: 'rename', label: 'Rename' }] : []),
    { value: 'export', label: 'Export' },
    ...(item.kind === 'mine' ? [{ value: 'delete', label: 'Delete', destructive: true }] : []),
  ]
})

function onMenu(action: string) {
  const id = menuId.value
  closeMenu()
  if (!id) return
  if (action === 'rename') return void (renamingId.value = id)
  if (action === 'duplicate') return emit('duplicate', id)
  if (action === 'export') return emit('export', id)
  emit('delete', id)
}
const renamingId = ref<string | null>(null)

// A native <dialog> gives us the focus trap, Esc and the backdrop for free.
watch(() => props.open, (open) => (open ? dialog.value?.showModal() : dialog.value?.close()))

/** The rail asks two different questions, so a hairline separates them: whose template is
    this, and what size is it (F32 · atlas 34). */
const facets = computed(() => [
  { key: 'all', label: 'All', count: props.items.length },
  { key: 'mine', label: 'Mine', count: props.items.filter((i) => i.kind === 'mine').length },
  { key: 'built-in', label: 'Built-in', count: props.items.filter((i) => i.kind === 'built-in').length },
])
const sizes = computed(() =>
  [...new Set(props.items.map((i) => i.media))].sort().map((media) => ({
    key: `media:${media}`, label: media, count: props.items.filter((i) => i.media === media).length,
  })),
)

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

/** Mine and built-in never sit in one run of cards: what you made and what shipped with the
    app are different libraries, and the eyebrow says which is which (F24). */
const groups = computed(() =>
  (['mine', 'built-in'] as const)
    .map((kind) => ({ kind, items: shown.value.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length),
)

/** Files the picker let through but the importer would silently drop — named instead (COR-07). */
const skipped = ref<string[]>([])

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  skipped.value = files.filter((f) => !f.name.endsWith('.vue')).map((f) => f.name)
  const usable = files.filter((f) => f.name.endsWith('.vue'))
  if (usable.length) emit('import', usable)
  input.value = '' // so importing the same file twice still fires
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
    :aria-label="pick ? 'Choose a template' : 'Manage templates'"
    @close="emit('close')"
  >
    <div class="flex h-full flex-col">
      <header class="flex flex-none items-center gap-2 border-b border-[var(--section-border)] px-3 py-2">
        <h2 class="text-[13px] font-semibold">{{ pick ? 'Choose a template' : 'Templates' }}</h2>
        <label class="sr-only" for="manage-search">Search templates</label>
        <input
          id="manage-search" v-model="query" type="search" placeholder="search…"
          class="ml-2 h-[30px] w-[180px] rounded-[var(--radius-control)] border border-transparent bg-muted px-2 text-[12px] outline-none focus:border-primary focus:bg-card"
        >
        <span class="flex-1" />
        <!-- Nothing is managed in pick mode: the dialog is a chooser there, not the library. -->
        <template v-if="!pick">
          <!-- Ghost, not filled: Print is the only filled button in the app (invariant 1). -->
          <label class="flex h-8 cursor-pointer items-center rounded-[var(--radius-control)] border border-input px-2.5 text-[12px] hover:bg-muted">
            Import .vue
            <input type="file" accept=".vue" multiple class="sr-only" @change="onImport">
          </label>
          <button type="button" class="h-8 rounded-[var(--radius-control)] border border-input px-2.5 text-[12px] hover:bg-muted" @click="emit('create')">
            New template
          </button>
        </template>
        <button type="button" aria-label="Close" class="ml-1 size-8 rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted" @click="emit('close')">
          ✕
        </button>
      </header>

      <p v-if="skipped.length" class="border-b border-[var(--section-border)] px-3 py-1.5 text-[11px] text-muted-foreground">
        skipped (only .vue imports): <span class="font-mono">{{ skipped.join(', ') }}</span>
      </p>

      <div class="flex min-h-0 flex-1">
        <nav class="flex w-[176px] flex-none flex-col gap-px overflow-y-auto border-r border-[var(--section-border)] p-2" aria-label="Filter">
          <template v-for="(group, i) in [facets, sizes]" :key="i">
            <!-- Whose it is, then how big it is: two questions, one hairline between them. -->
            <span v-if="i && group.length" class="my-1.5 h-px flex-none bg-[var(--section-border)]" />
            <button
              v-for="f in group" :key="f.key" type="button"
              class="flex flex-none items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[12px] transition-colors duration-120 ease-out"
              :class="filter === f.key ? 'bg-accent text-accent-foreground ring-1 ring-inset ring-primary' : 'hover:bg-muted'"
              @click="filter = f.key"
            >
              <span class="truncate" :class="{ 'font-mono text-[11px]': i }">{{ f.label }}</span>
              <span class="flex-1" />
              <span class="font-mono text-[10px] text-muted-foreground">{{ f.count }}</span>
            </button>
          </template>
        </nav>

        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <section v-for="group in groups" :key="group.kind" class="mb-3 last:mb-0">
            <h3 class="mb-1.5 text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">{{ group.kind }}</h3>
            <ul class="flex flex-wrap gap-2.5">
              <li
                v-for="item in group.items" :key="item.id"
                class="relative w-[170px] rounded-[var(--radius-control)] border bg-card p-2 transition-colors duration-120 ease-out"
                :class="item.id === selectedId ? 'border-primary bg-accent' : 'border-input'"
              >
                <button
                  type="button"
                  class="block h-[74px] w-full overflow-hidden rounded-[var(--radius-control)] border border-input bg-[var(--canvas)]"
                  :aria-label="`${pick ? 'Use' : 'Open'} ${item.name}`"
                  @click="emit('open', item.id)"
                >
                  <!-- The label at its true aspect, fitted into the well and centred. -->
                  <span
                    v-if="item.thumbnail" class="flex h-full w-full items-center justify-center"
                  >
                    <span
                      class="block overflow-hidden border border-[var(--field-border)] bg-[var(--sheet)]"
                      :style="{ width: fit(item.size).w, height: fit(item.size).h }"
                    >
                      <iframe
                        :srcdoc="item.thumbnail" sandbox="" tabindex="-1" aria-hidden="true"
                        class="pointer-events-none origin-top-left border-0"
                        :style="{ width: fit(item.size).iw, height: fit(item.size).ih, transform: fit(item.size).k }"
                      />
                    </span>
                  </span>
                  <!-- Nothing rendered yet: a neutral mark, so a fresh template does not read
                       as a broken one (F24). -->
                  <span v-else class="flex h-full w-full items-center justify-center font-mono text-[14px] text-[var(--faint-foreground)]">–</span>
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

                <button
                  v-if="!pick"
                  type="button" :aria-label="`Actions for ${item.name}`"
                  class="absolute top-1.5 right-1.5 size-6 rounded-[var(--radius-control)] bg-card/80 text-muted-foreground hover:bg-muted"
                  @click="toggleMenu(item.id, $event)"
                >
                  ⋯
                </button>
              </li>
            </ul>
          </section>
          <p v-if="!shown.length" class="text-[11px] text-muted-foreground">no template matches this filter</p>
        </div>
      </div>
    </div>
    <!-- Teleported *into* this dialog: a modal `<dialog>` owns the top layer and makes the rest
         of the document inert, so a menu parked on `<body>` would be both under it and dead. -->
    <Menu :to="dialog" :anchor="menuAnchor" :items="menuItems" :width="140" align="right" @pick="onMenu" @close="closeMenu" />
  </dialog>
</template>
