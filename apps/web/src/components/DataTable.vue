<!--
  The rows themselves: one column per source field, a checkbox per row, and — under the header —
  the mapping, where it belongs: `→ filament.name` says this column *is* that template variable.
  Clicking a mapping chip opens the template's variables; there is no guessing anywhere.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getPath, type Row } from '@sprint/core'
import { anchorMenu } from '@/ui'
import { data, mapping, setMapping, sourceFields, toggleSelected } from '@/stores/data'
import { neededPaths } from '@/stores/editor'

defineProps<{
  /** The rows to draw, filtered by the host; `index` is the one in `data.rows`. */
  rows: { index: number; row: Row }[]
}>()

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

// ---------------------------------------------------------------- the mapping menu
const open = ref<string | null>(null)
const pos = ref<Record<string, string>>({})
function openMenu(event: MouseEvent, path: string) {
  pos.value = anchorMenu((event.currentTarget as HTMLElement).getBoundingClientRect(), 260, { height: 240 })
  open.value = open.value === path ? null : path
}
function pick(sourcePath: string, target: string | null) {
  setMapping(sourcePath, target)
  open.value = null
}
</script>

<template>
  <div class="tbl">
    <div v-if="!data.rows.length" class="empty">load data to start — the source pane is on the left</div>
    <div v-else class="scroll">
      <div class="inner">
        <div class="tr head" :style="{ gridTemplateColumns: template }">
          <span />
          <b v-for="field in columns" :key="field.path" :title="field.path" class="hcell">
            {{ field.path }}
            <span class="grip" @pointerdown.stop="startResize($event, field.path)" />
          </b>
        </div>
        <!-- The mapping lives in the header: each column says which template variable it is. -->
        <div class="tr maprow" :style="{ gridTemplateColumns: template }">
          <span />
          <button
            v-for="field in columns" :key="field.path" type="button"
            class="m" :class="{ unset: !mapping[field.path] }" @click="openMenu($event, field.path)"
          >→ {{ mapping[field.path] ?? '–' }}</button>
        </div>
        <div
          v-for="{ index, row } in rows" :key="index"
          class="tr" :class="{ sel: data.selected.has(index) }" :style="{ gridTemplateColumns: template }"
          @click="toggleSelected(index)"
        >
          <span class="cb" :class="{ on: data.selected.has(index) }" />
          <span v-for="field in columns" :key="field.path" class="v">{{ cell(row, field.path) }}</span>
        </div>
        <p v-if="!rows.length" class="empty">nothing matches the filter</p>
      </div>
    </div>

    <template v-if="open">
      <span class="backdrop" @click="open = null" />
      <div class="menu" :style="pos">
        <button
          v-for="path in neededPaths" :key="path" type="button" class="item"
          :class="{ on: mapping[open] === rowPath(path) }" @click="pick(open, path)"
        >{{ path }}</button>
        <p v-if="!neededPaths.length" class="none">this template reads nothing off row</p>
        <button type="button" class="item unset" @click="pick(open, null)">– (unmap)</button>
      </div>
    </template>
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
.tr:not(.head):not(.maprow):hover { background: var(--row-hover); }
.tr.head, .tr.maprow { position: sticky; z-index: 1; }
.tr.head {
  top: 0; height: 30px; font-size: 9.5px; color: var(--muted-foreground); background: var(--row-hover);
}
.tr.head b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tr.maprow {
  top: 30px; height: 26px; border-bottom-color: var(--field-border); background: var(--pane); font-size: 9px;
}
/* Selection is --accent plus a 2px inset edge, never a fill (invariant 1). */
.tr.sel { background: var(--accent); box-shadow: inset 2px 0 0 var(--primary); }
.tr.sel:hover { background: var(--accent); }
.v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }

.maprow .m {
  display: flex; align-items: center; gap: 3px; min-width: 0; padding: 0;
  border: 0; background: transparent; font: inherit; color: var(--accent-link); text-align: left;
}
.maprow .m::after { content: "▾"; font-size: 6px; color: var(--meta-foreground); }
.maprow .m.unset { color: var(--faint-foreground); }
.maprow .m:hover { text-decoration: underline; }

.cb {
  width: 12px; height: 12px; margin-left: 4px; flex: none; position: relative;
  border: 1px solid var(--field-border); border-radius: 3px; background: var(--pane);
}
.cb.on { background: var(--primary); border-color: var(--primary); }
.cb.on::after {
  content: "✓"; position: absolute; inset: 0; text-align: center;
  font-size: 9px; line-height: 12px; color: var(--primary-foreground);
}

.empty {
  display: grid; place-items: center; flex: 1; margin: 0; padding: 24px;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--meta-foreground);
}

/* ---- the mapping menu (the InspectorPane recipe: a backdrop and a fixed card) ---- */
.backdrop { position: fixed; inset: 0; z-index: 19; }
.menu {
  position: fixed; z-index: 60; width: 260px; max-height: 320px; overflow-y: auto; padding: 6px;
  border: 1px solid var(--field-border); border-radius: var(--radius-trough); background: var(--popover);
  box-shadow: var(--shadow-popover);
}
.menu .item {
  display: flex; align-items: center; width: 100%; height: 26px; padding: 0 9px;
  border: 0; border-radius: var(--radius-control); background: transparent;
  font-family: var(--font-mono); font-size: 11px; color: var(--popover-foreground); text-align: left;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.menu .item:hover { background: var(--accent); }
.menu .item.on { color: var(--accent-foreground); box-shadow: inset 0 0 0 1px var(--primary); }
.menu .item.unset { color: var(--faint-foreground); }
.menu .none { margin: 0; padding: 4px 9px; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
.hcell { position: relative; padding-right: 8px; }
.grip {
  position: absolute; top: 0; right: 0; bottom: 0; width: 7px; cursor: col-resize;
  /* the visible line only on hover — the header stays quiet */
  background: linear-gradient(var(--field-border), var(--field-border)) 100% 50% / 1px 60% no-repeat;
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.hcell:hover .grip, .grip:active { opacity: 1; }
</style>
