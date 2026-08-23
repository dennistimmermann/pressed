<!--
  Data view (design artifact "pressed Data view", see docs/design/deviations.md): the left pane
  is the question "where do the rows come from, and what does the template need?", the middle
  is the answer — the rows themselves (Table) or the wiring between the two (Mapping).

  Same skeleton as the Printer view: a `@/ui` section stack on the left, a Splitter, the work
  in the middle, one ink strip across the foot.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Chip, PaneRail, PaneSection, StatusBar, type StatusCell, Tabs } from '@/ui'
import { ManageTemplates } from '@/editor'
import Splitter from '@/components/Splitter.vue'
import DataMapping from '@/components/DataMapping.vue'
import DataTable from '@/components/DataTable.vue'
import { SOURCES, type Run } from '@/sources'
import { data, selectAll, setRows, sourceFields , suggestUnmapped } from '@/stores/data'
import { load as loadTemplate, editor, mappedState, meta, neededPaths, wiredPaths } from '@/stores/editor'
import { settings } from '@/stores/settings'
import { ensureThumbnails, templateCards } from '@/stores/templateCards'

// ---------------------------------------------------------------- sections
type Section = keyof typeof settings.dataCollapsed
const names = ['source', 'config', 'template'] as const
const at = (s: Section) => ({
  index: names.indexOf(s),
  below: names.length - 1 - names.indexOf(s),
  collapsed: settings.dataCollapsed[s],
  hairline: names.indexOf(s) > 0,
})
const toggle = (s: Section) => { settings.dataCollapsed[s] = !settings.dataCollapsed[s] }

// ---------------------------------------------------------------- the source
/** The source whose panel is open — not necessarily the one the rows in hand came from. */
const tab = ref(data.sourceId)
// A load moves the rail to the source that loaded (the boot seed lands after mount).
watch(() => data.sourceId, (id) => (tab.value = id))
const active = computed(() => SOURCES.find((s) => s.id === tab.value) ?? SOURCES[0])
/** Collapsing always buys space: with every section shut the pane is a 28px rail and the table
    takes the width back (F8). Expanding a title restores the persisted width. */
const railed = computed(() => names.every((n) => settings.dataCollapsed[n]))
const railTitles = computed(() => ['Source', active.value.label, 'Template'])
const expand = (title: string) => { settings.dataCollapsed[names[railTitles.value.indexOf(title)]] = false }
/** Dragging the splitter past its minimum is the same gesture: the pane becomes the rail. */
const railAll = () => { for (const n of names) settings.dataCollapsed[n] = true }

const status = ref('')
const error = ref('')
const busy = ref(false)

/** Every loader ends the same way: rows in, everything selected, status line updated. */
const run: Run = (load, brief) => { void (async () => {
  const id = active.value.id
  busy.value = true
  error.value = ''
  status.value = 'loading…'
  try {
    const { rows, rowType } = await load()
    setRows(id, rows, rowType)
    data.brief = brief ?? ''
    status.value = `${rows.length} rows`
  } catch (e) {
    status.value = ''
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
})() }

// ---------------------------------------------------------------- the template
/** One dialog, two modes: the Editor manages the library, this view only picks out of it (S3).
    No second grid, no second set of thumbnails. */
const pickOpen = ref(false)
function openPicker() {
  pickOpen.value = true
  void ensureThumbnails()
}
function pickTemplate(id: string) {
  pickOpen.value = false
  loadTemplate(id)
}

/** F6: what the template still wants comes first — the satisfied paths sort to the bottom, so
    Suggest visibly shortens the list it was pressed for. */
const checklist = computed(() =>
  neededPaths.value
    .map((path) => ({ path, state: mappedState.value[path] }))
    .sort((a, b) => Number(a.state === true) - Number(b.state === true)),
)
const unmapped = computed(() => checklist.value.filter((c) => c.state === false).length)
/** One meaning, everywhere: how many of the template's variables something feeds (F3 · F5). */
const wired = computed(() => wiredPaths.value.length)

const templateMeta = computed(() => {
  const n = neededPaths.value.length
  if (!n) return 'this template reads nothing off a row'
  if (!data.rows.length) return `needs ${n} field${n === 1 ? '' : 's'} — no data yet`
  if (unmapped.value) return `needs ${n} fields — ${unmapped.value} unmapped`
  return `needs ${n} fields — all mapped`
})

/** The foot: labelled facts split by dividers, never a running sentence (F9). Counters hide
    at zero, and whatever is happening right now (loading, a failure) takes the last cell. */
const cells = computed<StatusCell[]>(() => {
  const out: StatusCell[] = [
    { k: 'selected', v: `${data.selected.size} / ${data.rows.length}` },
    { k: 'fields', v: String(sourceFields.value.length) },
  ]
  if (neededPaths.value.length)
    out.push({
      k: 'mapped',
      v: `${wired.value} / ${neededPaths.value.length}`,
      tone: !data.rows.length ? undefined : unmapped.value ? 'warn' : 'ok',
    })
  if (busy.value) out.push({ v: 'loading…' })
  if (error.value) out.push({ v: error.value, tone: 'error' })
  return out
})

// ---------------------------------------------------------------- the rows
const filter = ref('')
/** Case-insensitive across everything a row says; the index rides along, selection is by index. */
const rows = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return data.rows
    .map((row, index) => ({ index, row }))
    .filter(({ row }) => !needle || Object.values(row).some((v) => String(v).toLowerCase().includes(needle)))
})
const allSelected = computed(() => data.rows.length > 0 && data.selected.size === data.rows.length)

/**
 * Suggest: exact-name matches only, never a guess (core rule set). It says what it did in three
 * places at once — the note under the button, the checklist re-sorting the satisfied paths to
 * the bottom, and the header chips it changed flashing (F6, atlas 06 · 07).
 */
const suggested = ref('')
const flashed = ref<string[]>([])
let flashTimer: ReturnType<typeof setTimeout> | undefined
function suggest() {
  const added = suggestUnmapped(neededPaths.value)
  const left = checklist.value.filter((c) => c.state === false).length
  suggested.value = added.length
    ? `mapped ${added.length} by name${left ? ` — ${left} still unmapped` : ''}`
    : 'no exact name matches — map by hand'
  flashed.value = added
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flashed.value = []), 900)
}
watch([() => data.sourceId, neededPaths], () => (suggested.value = ''))

// ---------------------------------------------------------------- source ⇄ data
/** Which source the rows in hand actually came from — not necessarily the panel on screen. */
const loaded = computed(() => SOURCES.find((s) => s.id === data.sourceId) ?? null)
/** The open panel is not the one that produced these rows: it has nothing of its own to show
    yet, and says so rather than borrowing the other source's file name (F7, atlas 08). */
const connected = computed(() => tab.value === data.sourceId && data.rows.length > 0)
const sourceMeta = computed(() =>
  data.rows.length && loaded.value ? `${loaded.value.id} · ${data.rows.length} rows` : 'no source',
)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="flex min-h-0 flex-1">
      <PaneRail v-if="railed" :titles="railTitles" @expand="expand" />
      <div v-else class="col" :style="{ width: `${settings.dataWidth}px` }">
        <!-- 1 · source: one row per module in src/sources ---------------------->
        <PaneSection
          v-bind="at('source')" title="Source" body-class="gap-[4px]"
          :meta="sourceMeta" @toggle="toggle('source')"
        >
          <button
            v-for="source in SOURCES" :key="source.id" type="button"
            class="srcrow" :class="{ on: tab === source.id }" @click="tab = source.id"
          >
            <span>{{ source.label }}</span>
            <span class="n">{{ data.sourceId === source.id && data.rows.length ? data.rows.length : '–' }}</span>
          </button>
        </PaneSection>

        <!-- 2 · its configuration: the source's own panel ---------------------->
        <PaneSection
          v-bind="at('config')" :title="active.label" body-class="gap-[7px]"
          :meta="connected ? data.brief : undefined" @toggle="toggle('config')"
        >
          <template v-if="!connected" #meta>
            <Chip dot="off">not connected</Chip>
          </template>
          <component :is="active.Panel" :run="run" :busy="busy" />
          <!-- Inline, never a toast (invariant 5). -->
          <p v-if="status" class="note">{{ status }}</p>
          <p v-if="error" class="note text-[var(--destructive)]">{{ error }}</p>
        </PaneSection>

        <!-- 3 · the template and what it asks of a row ------------------------->
        <PaneSection
          v-bind="at('template')" title="Template" body-class="gap-[6px]"
          :meta="neededPaths.length ? `${wired} / ${neededPaths.length} mapped` : meta.name"
          @toggle="toggle('template')"
        >
          <!-- The field is the trigger: it shows what is loaded and opens the one Templates
               dialog in pick mode, rather than a second, poorer list of the same thing. -->
          <button type="button" class="ctl" aria-label="template" @click="openPicker">
            <span class="v">{{ meta.name }}</span>
            <span class="mm">{{ meta.size.width }} × {{ meta.size.height }}</span>
            <span class="dd">▾</span>
          </button>
          <div v-for="item in checklist" :key="item.path" class="chk">
            <span class="path" :title="item.path">{{ item.path }}</span>
            <span v-if="item.state === null" class="text-[var(--faint-foreground)]">–</span>
            <span v-else-if="item.state" class="text-[var(--ok)]">✓</span>
            <span v-else class="text-[var(--destructive)]">✗ unmapped</span>
          </div>
          <div v-if="unmapped" class="flex items-center gap-2">
            <button type="button" class="ghost" @click="suggest">Suggest</button>
            <span class="note">exact names only — nothing is guessed</span>
          </div>
          <p class="note">{{ suggested || templateMeta }}</p>
        </PaneSection>
      </div>

      <Splitter v-if="!railed" v-model:size="settings.dataWidth" :min="200" :max="360" collapsible @collapse="railAll" />

      <div class="flex min-w-0 flex-1 flex-col border-l border-[var(--pane-border)]">
        <!-- One bar: the view tabs in the trough, then the active view's controls — the same
             shape as the editor's top bars (tabs left, controls trailing). -->
        <div class="toolbar">
          <!-- One meaning per badge: Table counts the rows you can *see* (the filter is part of
               the question), Wiring counts variables — and says so in its own name (F3). -->
          <Tabs
            v-model="settings.dataView"
            :tabs="[
              { id: 'table', label: 'Table', count: rows.length || undefined },
              { id: 'mapping', label: 'Wiring', count: `${wired}/${neededPaths.length}` },
            ]"
          />
          <template v-if="settings.dataView === 'table'">
            <input v-model="filter" class="search" placeholder="filter rows…" aria-label="filter rows">
            <Chip class="ml-auto">{{ data.selected.size }} / {{ data.rows.length }} selected</Chip>
            <button type="button" class="ghost" :disabled="!data.rows.length" @click="selectAll(true)">all</button>
            <button type="button" class="ghost" :disabled="!allSelected && !data.selected.size" @click="selectAll(false)">none</button>
          </template>
          <Chip v-else class="ml-auto" :dot="unmapped ? 'warn' : 'ok'">{{ wired }} / {{ neededPaths.length }} wired</Chip>
        </div>

        <DataTable v-if="settings.dataView === 'table'" :rows="rows" :flash="flashed" />
        <DataMapping v-else />
      </div>
    </div>

    <!-- One ink strip across the foot: the selection, the fields, and what the template still
         wants. Inline, never a toast (invariant 5). -->
    <StatusBar eyebrow="Data" :cells="cells" class="on-ink flex-none">
      <template #end>
        <span>{{ loaded?.label ?? 'no source' }}</span><b v-if="data.rows.length && data.brief">{{ data.brief }}</b>
      </template>
    </StatusBar>

    <ManageTemplates
      pick :open="pickOpen" :items="templateCards" :selected-id="editor.templateId"
      @close="pickOpen = false" @open="pickTemplate"
    />
  </section>
</template>

<style scoped>
/* The one scroller: the section headers stay put while the column moves under them. */
.col { display: flex; flex: none; flex-direction: column; overflow-y: auto; background: var(--pane); }

/* One source per row: selection is --accent plus a 1px inset ring, never a fill (invariant 1). */
.srcrow {
  display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px;
  border: 0; border-radius: var(--radius-control); background: transparent;
  font-family: var(--font-sans); font-size: 11px; color: var(--foreground); text-align: left;
  transition: background-color 120ms ease-out;
}
.srcrow:hover { background: var(--row-hover); }
.srcrow.on { background: var(--accent); color: var(--accent-foreground); box-shadow: inset 0 0 0 1px var(--primary); }
.srcrow .n { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
.srcrow.on .n { color: var(--accent-foreground); }

/* The 25px filled control, borderless until focus — a Field's clothes on the dialog trigger. */
.ctl {
  display: flex; align-items: center; gap: 6px;
  width: 100%; min-width: 0; height: 25px; padding: 0 7px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field); outline: none;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground); text-align: left;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:hover { background: var(--row-hover); }
.ctl:focus-visible { border-color: var(--primary); background: var(--pane); }
.ctl .v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl .mm { flex: none; color: var(--meta-foreground); }
.ctl .dd { flex: none; font-size: 7px; color: var(--meta-foreground); }

/* One `row.…` the template reads, and whether the data answers it. */
.chk { display: flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: 10px; }
.chk .path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chk > :last-child { flex: none; white-space: nowrap; }

.note { margin: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }

.toolbar { display: flex; align-items: center; gap: 8px; flex: none; padding: 10px 14px; }
.search {
  width: 200px; height: 25px; padding: 0 8px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field); outline: none;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
}
.search::placeholder { color: var(--faint-foreground); }
.search:focus-visible { border-color: var(--primary); background: var(--pane); }
/* The ghost: 1px border, no fill — the only filled button in the app is Print (invariant 1). */
.ghost {
  height: 25px; flex: none; padding: 0 9px; border: 1px solid var(--field-border);
  border-radius: var(--radius-control); background: var(--pane); font-size: 11px; color: var(--foreground);
  transition: background-color 120ms ease-out;
}
.ghost:hover:not(:disabled) { background: var(--row-hover); }
.ghost:disabled { opacity: 0.4; }
</style>
