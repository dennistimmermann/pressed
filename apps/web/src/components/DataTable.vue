<!--
  The rows themselves: one column per source field, a checkbox per row, and — under the header —
  the mapping, where it belongs: `→ filament.name` says this column *is* that template variable.
  Clicking a mapping chip opens the template's variables; there is no guessing anywhere.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getPath, type Row } from '@pressed/core'
import { EmptyState, Picker, type PickerRow } from '@/ui'
import { data, mapping, mappedPreviewRow, setMapping, sourceFields, toggleSelected } from '@/stores/data'
import { effectiveMapping, neededPaths } from '@/stores/editor'

withDefaults(
  defineProps<{
    /** The rows to draw, filtered by the host; `index` is the one in `data.rows`. */
    rows: { index: number; row: Row }[]
    /** Source paths whose mapping just changed — their header chips flash (F6). */
    flash?: string[]
  }>(),
  { flash: () => [] },
)

// ponytail: the first 20 fields, not a column picker — a source with more is what the Mapping
// tab is for. Widen it here if a real source ever needs 40 columns on screen.
const columns = computed(() => sourceFields.value.slice(0, 20))
/** Dragged column widths, by field path — untouched columns share the leftover space.
    ponytail: runtime-only; widths reset with the source, which is when they stop meaning anything. */
const widths = ref<Record<string, number>>({})
watch(() => data.sourceId, () => (widths.value = {}))
const template = computed(() =>
  `30px ${columns.value.map((c) => (widths.value[c.path] ? `${widths.value[c.path]}px` : 'minmax(110px, 1fr)')).join(' ')}`,
)
/** The header edge is a Splitter in miniature: pointer capture, min 60px. */
function startResize(e: PointerEvent, path: string) {
  const cell = (e.currentTarget as HTMLElement).parentElement!
  const start = e.clientX
  const base = cell.getBoundingClientRect().width
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => { widths.value = { ...widths.value, [path]: Math.max(60, Math.round(base + ev.clientX - start)) } }
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}

/** The menu offers `row.id`; a mapping stores what it sets on the row: `id`. */
const rowPath = (path: string) => path.replace(/^row\./, '')

const cell = (row: Row, path: string) => {
  const value = getPath(row, path)
  return value == null ? '' : String(value)
}

// ---------------------------------------------------------------- the mapping picker
// The one `{ }` shape: search over 8 rows, a live value preview per row, the unbind as an action.
const open = ref<string | null>(null)
const anchor = ref<DOMRect | null>(null)
function openMenu(event: MouseEvent, path: string) {
  const next = open.value === path ? null : path
  anchor.value = next ? (event.currentTarget as HTMLElement).getBoundingClientRect() : null
  open.value = next
}
const close = () => { open.value = null; anchor.value = null }
function pick(sourcePath: string, target: string | null) {
  setMapping(sourcePath, target)
  close()
}
/** What the template asks for, each showing the value it would carry for the preview row. */
const variableRows = computed<PickerRow[]>(() =>
  neededPaths.value.map((path) => ({
    value: path,
    label: path,
    preview: String(getPath(mappedPreviewRow.value, rowPath(path)) ?? ''),
    on: open.value ? effectiveMapping.value[open.value] === rowPath(path) : false,
  })),
)
/** A column wired only because it is *named* like the variable has no mapping to take away. */
const canUnmap = computed(() => !!open.value && !!mapping.value[open.value])
</script>

<template>
  <div class="tbl">
    <EmptyState v-if="!data.rows.length" text="load a CSV or connect Spoolman to get rows" />
    <div v-else class="scroll">
      <div class="inner">
        <!--
          One 42px header cell per column, two lines: the field name, then what it is wired to.
          The mapping belongs in the header — but as a second *line of the same cell*, not a
          second row of its own; that was the ragged strip of 9px glyphs (F2, atlas 02).
        -->
        <div class="tr head" :style="{ gridTemplateColumns: template }">
          <span />
          <div v-for="field in columns" :key="field.path" class="hcell">
            <b :title="field.path">{{ field.path }}</b>
            <button
              type="button" class="m"
              :class="{ unset: !effectiveMapping[field.path], flash: flash.includes(field.path) }"
              :title="effectiveMapping[field.path] ? `feeds row.${effectiveMapping[field.path]}` : 'not mapped'"
              @click.stop="openMenu($event, field.path)"
            >{{ effectiveMapping[field.path] ? `→ ${effectiveMapping[field.path]}` : '–' }}</button>
            <span class="grip" @pointerdown.stop="startResize($event, field.path)" />
          </div>
        </div>
        <!-- Zebra is the table's own rhythm and stays whatever the selection is; deselecting a
             row empties its checkbox and nothing else (F4, atlas 04). -->
        <div
          v-for="({ index, row }, i) in rows" :key="index"
          class="tr" :class="{ sel: data.selected.has(index), alt: i % 2 === 1 }" :style="{ gridTemplateColumns: template }"
          @click="toggleSelected(index)"
        >
          <span class="cb" :class="{ on: data.selected.has(index) }" />
          <span v-for="field in columns" :key="field.path" class="v">{{ cell(row, field.path) }}</span>
        </div>
        <EmptyState v-if="!rows.length" text="no row matches this filter" />
      </div>
    </div>

    <Picker
      :anchor="anchor" :rows="variableRows" :action="canUnmap ? '– unmapped' : undefined" :width="260"
      placeholder="variable…" empty="this template reads nothing off a row"
      @pick="pick(open!, $event)" @action="pick(open!, null)" @close="close"
    />
  </div>
</template>

<style scoped>
.tbl {
  display: flex; flex-direction: column; min-height: 0; flex: 1;
  margin: 0 14px 12px; border: 1px solid var(--field-border); border-radius: var(--radius-trough);
  background: var(--pane); overflow: hidden;
}
/* The region owns both scrollbars: many columns scroll sideways, the header stays put. */
.scroll { min-height: 0; flex: 1; overflow: auto; }
.inner { min-width: min-content; }

/* ponytail: a plain v-for over every row. Virtualise if a source ever brings 10k rows. */
.tr {
  display: grid; align-items: center; height: 28px; padding: 0 6px;
  border-bottom: 1px solid var(--hairline);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out;
}
.tr:last-child { border-bottom: 0; }
/* The zebra: a row's own stripe, independent of whether it is selected (F4). */
.tr.alt:not(.sel) { background: var(--row-hover); }
.tr:not(.head):hover { background: var(--field); }
.tr.head {
  position: sticky; top: 0; z-index: 1; align-items: stretch; height: 42px;
  border-bottom-color: var(--field-border); background: var(--pane); color: var(--muted-foreground);
}
/* THE selection recipe: --accent wash plus a 1px inset ring, everywhere (F14). */
.tr.sel { background: var(--accent); box-shadow: inset 0 0 0 1px var(--primary); }
.tr.sel:hover { background: var(--accent); }
.v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }

/* One cell, two lines: the field name over the mapping it carries. */
.hcell {
  position: relative; display: flex; flex-direction: column; justify-content: center; gap: 1px;
  min-width: 0; padding-right: 8px;
}
.hcell b {
  font-size: var(--t5); font-weight: 450; line-height: 1.5; color: var(--foreground);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hcell .m {
  min-width: 0; margin: 0 -4px; padding: 0 4px; border: 0; border-radius: var(--radius-badge);
  background: transparent;
  font-family: var(--font-mono); font-size: 9.5px; line-height: 1.4; color: var(--accent-link);
  text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.hcell .m.unset { color: var(--faint-foreground); }
.hcell .m:hover { text-decoration: underline; }
/* Suggest just wrote this one — a colour change, 120ms, nothing moves (invariant 6). */
.hcell .m.flash { background: var(--accent); color: var(--accent-foreground); }

.cb {
  width: 12px; height: 12px; margin-left: 4px; flex: none; position: relative;
  border: 1px solid var(--field-border); border-radius: 3px; background: var(--pane);
}
.cb.on { background: var(--primary); border-color: var(--primary); }
.cb.on::after {
  content: "✓"; position: absolute; inset: 0; text-align: center;
  font-size: 9px; line-height: 12px; color: var(--primary-foreground);
}

.grip {
  position: absolute; top: 0; right: 0; bottom: 0; width: 7px; cursor: col-resize;
  /* the visible line only on hover — the header stays quiet */
  background: linear-gradient(var(--field-border), var(--field-border)) 100% 50% / 1px 60% no-repeat;
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.hcell:hover .grip, .grip:active { opacity: 1; }
</style>
