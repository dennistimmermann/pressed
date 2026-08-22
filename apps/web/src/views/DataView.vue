<!--
  Data view (design artifact "sprint Data view", see docs/design/deviations.md): the left pane
  is the question "where do the rows come from, and what does the template need?", the middle
  is the answer — the rows themselves (Table) or the wiring between the two (Mapping).

  Same skeleton as the Printer view: a `@/ui` section stack on the left, a Splitter, the work
  in the middle, one ink strip across the foot.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PaneSection, StatusBar, Tabs } from '@/ui'
import Splitter from '@/components/Splitter.vue'
import DataMapping from '@/components/DataMapping.vue'
import DataTable from '@/components/DataTable.vue'
import { SOURCES, type Run } from '@/sources'
import { data, mapping, selectAll, setRows, sourceFields , suggestUnmapped } from '@/stores/data'
import { load as loadTemplate, editor, mappedState, meta, neededPaths } from '@/stores/editor'
import { settings } from '@/stores/settings'
import { templateName, templates } from '@/stores/templates'

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
const active = computed(() => SOURCES.find((s) => s.id === tab.value) ?? SOURCES[0])
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
const allTemplates = computed(() => [...templates.mine, ...templates.bundled])
const checklist = computed(() => neededPaths.value.map((path) => ({ path, state: mappedState.value[path] })))
const unmapped = computed(() => checklist.value.filter((c) => c.state === false).length)
const mappedFields = computed(() => Object.keys(mapping.value).length)

const templateMeta = computed(() => {
  const n = neededPaths.value.length
  if (!n) return 'this template reads nothing off row'
  if (!data.rows.length) return `needs ${n} field${n === 1 ? '' : 's'} — no data yet`
  if (unmapped.value) return `needs ${n} fields — ${unmapped.value} unmapped`
  return mappedFields.value ? `needs ${n} fields — all mapped` : `needs ${n} fields — source names match, nothing to map`
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
const wired = computed(() => checklist.value.filter((c) => c.state === true).length)

/** Suggest: exact-name matches only, never a guess (core rule set); the meta line reports it. */
const suggested = ref('')
function suggest() {
  const n = suggestUnmapped(neededPaths.value)
  const left = checklist.value.filter((c) => c.state === false).length
  suggested.value = n
    ? `mapped ${n} by name${left ? ` — ${left} still unmapped` : ''}`
    : 'no exact name matches — map by hand'
}
watch([() => data.sourceId, neededPaths], () => (suggested.value = ''))
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="flex min-h-0 flex-1">
      <div class="col" :style="{ width: `${settings.dataWidth}px` }">
        <!-- 1 · source: one row per module in src/sources ---------------------->
        <PaneSection
          v-bind="at('source')" title="Source" body-class="gap-[4px]"
          :meta="active.label" @toggle="toggle('source')"
        >
          <button
            v-for="source in SOURCES" :key="source.id" type="button"
            class="srcrow" :class="{ on: tab === source.id }" @click="tab = source.id"
          >
            <span>{{ source.label }}</span>
            <span class="n">{{ data.sourceId === source.id && data.rows.length ? data.rows.length : '–' }}</span>
          </button>
          <p class="note mt-[4px]">a source is a file in src/sources/</p>
        </PaneSection>

        <!-- 2 · its configuration: the source's own panel ---------------------->
        <PaneSection
          v-bind="at('config')" :title="active.label" body-class="gap-[7px]"
          :meta="data.brief" @toggle="toggle('config')"
        >
          <component :is="active.Panel" :run="run" :busy="busy" />
          <!-- Inline, never a toast (invariant 5). -->
          <p v-if="status" class="note">{{ status }}</p>
          <p v-if="error" class="note text-[var(--destructive)]">{{ error }}</p>
        </PaneSection>

        <!-- 3 · the template and what it asks of a row ------------------------->
        <PaneSection
          v-bind="at('template')" title="Template" body-class="gap-[6px]"
          :meta="meta.name" @toggle="toggle('template')"
        >
          <select
            class="ctl" aria-label="template"
            :value="editor.templateId ?? ''" @change="loadTemplate(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="t in allTemplates" :key="t.id" :value="t.id">{{ templateName(t) }}</option>
          </select>
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

      <Splitter v-model:size="settings.dataWidth" :min="200" :max="360" />

      <div class="flex min-w-0 flex-1 flex-col border-l border-[var(--pane-border)]">
        <!-- One bar: the view tabs in the trough, then the active view's controls — the same
             shape as the editor's top bars (tabs left, controls trailing). -->
        <div class="toolbar">
          <Tabs
            v-model="settings.dataView"
            :tabs="[{ id: 'table', label: 'Table', count: data.rows.length || undefined }, { id: 'mapping', label: 'Mapping', count: `${wired}/${neededPaths.length}` }]"
          />
          <template v-if="settings.dataView === 'table'">
            <input v-model="filter" class="search" placeholder="filter…" aria-label="filter rows">
            <span class="cnt">
              <span class="text-foreground">{{ data.selected.size }}</span> / {{ data.rows.length }} selected
            </span>
            <button type="button" class="ghost" :disabled="!data.rows.length" @click="selectAll(true)">all</button>
            <button type="button" class="ghost" :disabled="!allSelected && !data.selected.size" @click="selectAll(false)">none</button>
          </template>
          <span v-else class="cnt">{{ wired }} of {{ neededPaths.length }} variables wired</span>
        </div>

        <DataTable v-if="settings.dataView === 'table'" :rows="rows" />
        <DataMapping v-else />
      </div>
    </div>

    <!-- One ink strip across the foot: the selection, the fields, and what the template still
         wants. Inline, never a toast (invariant 5). -->
    <StatusBar eyebrow="Data" class="on-ink flex-none">
      <span class="text-[var(--ink-foreground)]">{{ data.selected.size }} of {{ data.rows.length }}</span>
      rows selected · {{ sourceFields.length }} field{{ sourceFields.length === 1 ? '' : 's' }}<template v-if="mappedFields">, {{ mappedFields }} mapped</template>
      <template v-if="neededPaths.length">
        · template needs {{ neededPaths.length }} —
        <span v-if="!data.rows.length">no data yet</span>
        <span v-else-if="unmapped" class="text-[var(--ink-warning)]">{{ unmapped }} unmapped</span>
        <span v-else class="text-[var(--ink-foreground)]">{{ mappedFields ? 'all mapped' : 'all match' }}</span>
      </template>
      <span v-if="busy">· loading…</span>
      <span v-if="error" class="text-[var(--ink-destructive)]">· {{ error }}</span>
      <template #end>{{ active.label }}<template v-if="data.brief"> · {{ data.brief }}</template></template>
    </StatusBar>
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

/* The 25px filled control, borderless until focus — what a `<select>` wears to match a Field. */
.ctl {
  width: 100%; min-width: 0; height: 25px; padding: 0 7px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field); outline: none;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:focus-visible { border-color: var(--primary); background: var(--pane); }

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
.cnt { margin-left: auto; font-family: var(--font-mono); font-size: 10.5px; color: var(--meta-foreground); }
/* The ghost: 1px border, no fill — the only filled button in the app is Print (invariant 1). */
.ghost {
  height: 25px; flex: none; padding: 0 9px; border: 1px solid var(--field-border);
  border-radius: var(--radius-control); background: var(--pane); font-size: 11px; color: var(--foreground);
  transition: background-color 120ms ease-out;
}
.ghost:hover:not(:disabled) { background: var(--row-hover); }
.ghost:disabled { opacity: 0.4; }
</style>
