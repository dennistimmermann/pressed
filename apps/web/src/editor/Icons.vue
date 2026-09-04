<!--
  The Icons library (plan-icons WP2): the Templates overlay with icon tiles in it. Three
  catalogues — tabler, mine, pressed — one grid, and a click that *adds* the icon to the file as
  a `<snippet name="icon-*">`. Adding is idempotent and the dialog stays open: you add, then place.

  Presentational: the sets arrive as props, every act leaves as an event. What is in the file
  (`present`) and what an import rejected (`rejected`) are the host's answers, not this file's.
-->
<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { Library, Menu, type Facet, type MenuItem } from '@/ui'
import { iconSnippetName } from '@/icons/snippet'
import type { Icon, IconSet, Rejection } from '@/icons/types'

const props = defineProps<{
  open: boolean
  /** Tab order: `iconSets` from the store. */
  sets: IconSet[]
  /** Snippet names already in the file — a tile whose name is here is `on`. */
  present: Set<string>
  /** What the last import would not take. Inline under the header, never a toast (invariant 5). */
  rejected?: Rejection[]
  /** Bumped by the host whenever Mine changed on disk; the set is then re-read. */
  revision?: number
}>()

const emit = defineEmits<{
  add: [icon: Icon]
  import: [files: File[]]
  rename: [name: string, next: string]
  remove: [name: string]
  close: []
}>()

/** At most this many tiles at once — the section eyebrow says so and asks for a narrower search. */
const CAP = 200

const active = ref(props.sets[0]?.id ?? 'tabler')
const query = ref('')

// Shallow: a catalogue is 6,000 objects and nothing in it ever changes in place, so making
// every icon reactive would cost a lot for nothing.
const loaded = shallowRef<Record<string, Icon[]>>({})
const failed = reactive<Record<string, string>>({})
const loading = reactive<Record<string, boolean>>({})

async function read(set: IconSet, again = false) {
  if (loading[set.id] || (loaded.value[set.id] && !again)) return
  loading[set.id] = true
  delete failed[set.id]
  try {
    // Await first, then spread: three sets load at once, and a spread evaluated *before* the
    // await would snapshot the map as it was and drop whatever landed in the meantime.
    const icons = await set.load()
    loaded.value = { ...loaded.value, [set.id]: icons }
  } catch (error) {
    failed[set.id] = error instanceof Error ? error.message : String(error)
  } finally {
    loading[set.id] = false
  }
}

// Every set on open: the active one has to load anyway, and the other two are a promise and an
// IndexedDB read — which is what puts a count beside every source in the nav.
watch(() => props.open, (open) => open && props.sets.forEach((set) => void read(set)))
// Mine changed under us (an import, a rename, a removal): re-read it.
watch(() => props.revision, () => {
  const mine = props.sets.find((s) => s.id === 'mine')
  if (mine) void read(mine, true)
})

const all = computed(() => loaded.value[active.value] ?? [])
// An icon is what it is: no outline/filled facet of ours — a set's `-filled` twins are just
// more icons, and the name search finds them.
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? all.value.filter((icon) => icon.name.toLowerCase().includes(q)) : all.value
})
const shown = computed(() => matches.value.slice(0, CAP))

/** `5 912` — a five-digit count reads as a number, not an id. */
const spaced = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ')

const sources = computed<Facet[]>(() =>
  props.sets.map((set) => ({
    key: set.id,
    label: set.label.toLowerCase(),
    count: loaded.value[set.id] ? spaced(loaded.value[set.id].length) : undefined,
    on: active.value === set.id,
  })),
)
const pickFacet = (key: string) => (active.value = key as IconSet['id'])

const note = computed(() =>
  props.rejected?.length
    ? { lead: 'rejected:', detail: props.rejected.map((r) => `${r.name} — ${r.reason}`).join(' · ') }
    : null,
)

/** A set with nothing in it says what would put something there — one sentence, no second phrasing. */
const emptyText = computed(() =>
  active.value === 'mine' ? 'import an .svg or an Iconify .json to start a library' : 'nothing here yet',
)
const countText = computed(() =>
  shown.value.length < matches.value.length
    ? `${spaced(shown.value.length)} of ${spaced(matches.value.length)} · type to narrow`
    : spaced(shown.value.length),
)

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = '' // so importing the same file twice still fires
  if (!files.length) return
  emit('import', files)
  active.value = 'mine' // an import goes to Mine whatever was on screen
}

// ---------------------------------------------------------------- the Mine tile's ⋯

const menuName = ref<string | null>(null)
const menuAnchor = ref<DOMRect | null>(null)
const renaming = ref<string | null>(null)

const menuItems: MenuItem[] = [
  { value: 'rename', label: 'Rename' },
  { value: 'remove', label: 'Remove from mine', destructive: true },
]

function openMenu(name: string, e: MouseEvent) {
  const same = menuName.value === name
  menuAnchor.value = same ? null : (e.currentTarget as HTMLElement).getBoundingClientRect()
  menuName.value = same ? null : name
}
const closeMenu = () => { menuName.value = null; menuAnchor.value = null }

function onMenu(action: string) {
  const name = menuName.value
  closeMenu()
  if (!name) return
  if (action === 'rename') return void (renaming.value = name)
  emit('remove', name)
}

/** `autofocus` is only honoured when the dialog opens, and this input arrives long after. */
const focus = (el: unknown) => (el as HTMLInputElement | null)?.select()

function commitRename(name: string, e: Event) {
  const next = (e.target as HTMLInputElement).value.trim()
  renaming.value = null
  if (next && next !== name) emit('rename', name, next)
}
</script>

<template>
  <Library
    v-model:search="query"
    :open="open" title="Icons" search-label="Search icons"
    :groups="[sources]" :note="note"
    @close="emit('close')"
    @pick="pickFacet"
    @submit="shown[0] && emit('add', shown[0])"
  >
    <template #actions>
      <!-- Ghost, not filled: Print is the only filled button in the app (invariant 1). -->
      <label class="flex h-8 cursor-pointer items-center rounded-[var(--radius-control)] border border-input px-2.5 text-[12px] hover:bg-muted">
        Import .svg / .json
        <input type="file" accept=".svg,.json" multiple class="sr-only" @change="onImport">
      </label>
    </template>

    <template #default="{ dialog }">
      <p v-if="failed[active]" class="err">could not load {{ active }} — {{ failed[active] }}</p>
      <p v-else-if="!loaded[active]" class="status">loading {{ active }}…</p>
      <p v-else-if="!all.length" class="empty">{{ emptyText }}</p>
      <p v-else-if="!shown.length" class="empty">no icon matches this search</p>
      <section v-else class="sec">
        <h3>{{ active }} <span class="n">{{ countText }}</span></h3>
        <ul class="tiles">
          <li v-for="icon in shown" :key="icon.name" class="cell">
            <button
              type="button" class="tile" :class="{ on: present.has(iconSnippetName(icon.name)) }"
              :aria-label="`Add ${icon.name} to this file`" @click="emit('add', icon)"
            >
              <!-- v-html is safe here and only here because every `Icon.body` was run through
                   `icons/sanitize` on the way into the catalogue — nothing else may build an Icon. -->
              <span class="well"><svg :viewBox="icon.viewBox" v-html="icon.body" /></span>
              <span class="nm">{{ icon.name }}</span>
            </button>

            <template v-if="active === 'mine'">
              <input
                v-if="renaming === icon.name" :ref="focus" class="rename" :value="icon.name" aria-label="Icon name"
                @keydown.enter="commitRename(icon.name, $event)"
                @keydown.esc="renaming = null"
                @blur="commitRename(icon.name, $event)"
              >
              <button
                v-else type="button" class="dots" :aria-label="`Actions for ${icon.name}`"
                @click="openMenu(icon.name, $event)"
              >
                ⋯
              </button>
            </template>
          </li>
        </ul>
      </section>

      <!-- Teleported *into* the dialog: a modal `<dialog>` owns the top layer, so a menu parked
           on `<body>` would be both under it and dead to the mouse. -->
      <Menu :to="dialog" :anchor="menuAnchor" :items="menuItems" :width="140" align="right" @pick="onMenu" @close="closeMenu" />
    </template>
  </Library>
</template>

<style scoped>
.sec { display: flex; flex-direction: column; gap: 6px; }
.sec h3 {
  display: flex; align-items: baseline; gap: 8px; margin: 0;
  font-family: var(--font-sans); font-size: var(--t6); font-weight: 600; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--muted-foreground);
}
.sec h3 .n {
  font-family: var(--font-mono); font-size: var(--t6); font-weight: 400; letter-spacing: 0;
  text-transform: none; color: var(--meta-foreground);
}

.tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.cell { position: relative; min-width: 0; }

/* A tile is the templates card at icon density: the same edge, the same well, the same states. */
.tile {
  display: flex; flex-direction: column; gap: 5px; width: 100%; padding: 6px;
  border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--pane);
  transition: background-color 120ms ease-out;
}
.tile:hover { background: var(--row-hover); }
/* `on` = already in this file. Many tiles can be on at once, so it keeps the accent fill and
   leaves the ring to focus — the two-tier rule (Seg, Chip, the templates nav). */
.tile.on { background: var(--accent); }
.tile.on .nm { color: var(--accent-foreground); }
.tile:focus { outline: none; box-shadow: inset 0 0 0 1px var(--muted-foreground); }
.tile.on:focus { box-shadow: inset 0 0 0 1px var(--primary); }

.well {
  display: flex; align-items: center; justify-content: center; height: 44px;
  border: 1px solid var(--field-border); border-radius: var(--radius-control);
  background: var(--canvas); color: var(--foreground);
}
/* Size only: the body carries its own fill/stroke, and a filled glyph would vanish under a
   `fill: none` of ours. `currentColor` resolves against the well. */
.well svg { width: 20px; height: 20px; }
.nm {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-mono); font-size: var(--t5); color: var(--foreground);
}

.dots {
  position: absolute; top: 4px; right: 4px;
  display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  border-radius: var(--radius-control); background: color-mix(in srgb, var(--pane) 80%, transparent);
  font-family: var(--font-sans); font-size: var(--t3); color: var(--muted-foreground);
}
.dots:hover { background: var(--field); }
/* Over the tile's name row, so the well stays visible while the name is being typed. */
.rename {
  position: absolute; right: 6px; bottom: 6px; left: 6px; height: 18px; padding: 0 4px;
  border: 1px solid var(--primary); border-radius: var(--radius-badge); background: var(--pane);
  font-family: var(--font-mono); font-size: var(--t5); outline: none;
}

.empty { margin: 0; font-family: var(--font-sans); font-size: var(--t3); color: var(--muted-foreground); }
.status { margin: 0; font-family: var(--font-mono); font-size: var(--t5); color: var(--meta-foreground); }
.err { margin: 0; font-family: var(--font-mono); font-size: var(--t5); color: var(--destructive); }
</style>
