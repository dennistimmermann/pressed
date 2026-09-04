<!--
  The same mappings as the Table tab, seen as wiring: the source's fields on the left, the
  template's variables on the right, a line for every one that is wired. Click a source field
  to pick its variable; dragging one onto a variable does the same thing with the mouse.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPath } from '@pressed/core'
import { EmptyState, Picker, type PickerRow } from '@/ui'
import { effectiveMapping, mappedPreviewRow, mapping, neededPaths, setMapping, sourceFields } from '@/stores/data'
import { meta } from '@/stores/editor'

/** The menu offers `row.id`; a mapping stores what it sets on the row: `id`. */
const rowPath = (path: string) => path.replace(/^row\./, '')

const wrap = ref<HTMLElement>()
const sourceEls = new Map<string, HTMLElement>()
const targetEls = new Map<string, HTMLElement>()
const keep = (map: Map<string, HTMLElement>, key: string) => (el: unknown) => {
  if (el) map.set(key, el as HTMLElement)
  else map.delete(key)
}

/**
 * Which target a source field is wired to, and the other way round — read off the *effective*
 * mapping, so a field that feeds a variable simply by having its name is drawn as the wire it
 * is. The wiring count and the picture come from the one answer (F5, atlas 05).
 */
const targetOf = (path: string) => (effectiveMapping.value[path] ? `row.${effectiveMapping.value[path]}` : null)
const sourceOf = (target: string) =>
  Object.keys(effectiveMapping.value).find((from) => effectiveMapping.value[from] === rowPath(target)) ?? null
/** Wired by name alone: there is no mapping to take away, and the wire says so (dashed). */
const implicit = (path: string) => !!effectiveMapping.value[path] && !mapping.value[path]

// Geometry is measured, not computed: the chips are laid out by flexbox, so ask the DOM where
// they landed. One observer on the wrapper; `tick` is what makes a measurement reactive.
const tick = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(() => tick.value++)
  if (wrap.value) ro.observe(wrap.value)
  tick.value++
})
onBeforeUnmount(() => ro?.disconnect())
watch([mapping, sourceFields, neededPaths], () => void nextTick(() => tick.value++))

type Wire = { key: string; d: string; end: [number, number]; byName: boolean }
const wires = computed<Wire[]>(() => {
  void tick.value
  const box = wrap.value?.getBoundingClientRect()
  if (!box) return []
  return sourceFields.value.flatMap<Wire>((field) => {
    const target = targetOf(field.path)
    const a = sourceEls.get(field.path)
    const b = target ? targetEls.get(target) : undefined
    if (!a || !b) return []
    const ra = a.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    const x1 = ra.right - box.left, y1 = ra.top + ra.height / 2 - box.top
    const x2 = rb.left - box.left, y2 = rb.top + rb.height / 2 - box.top
    const mid = (x1 + x2) / 2
    return [{ key: field.path, d: `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, end: [x2, y2], byName: implicit(field.path) }]
  })
})

// ---------------------------------------------------------------- picking
const open = ref<{ kind: 'source' | 'target'; key: string } | null>(null)
const anchor = ref<DOMRect | null>(null)
function openMenu(event: { currentTarget: EventTarget | null }, kind: 'source' | 'target', key: string) {
  const same = open.value?.key === key && open.value.kind === kind
  anchor.value = same ? null : (event.currentTarget as HTMLElement).getBoundingClientRect()
  open.value = same ? null : { kind, key }
}
const close = () => { open.value = null; anchor.value = null }
function pick(sourcePath: string, target: string | null) {
  setMapping(sourcePath, target)
  close()
}

/** The one `{ }` shape, both ways round: from a field, which variable it feeds — from a
    variable, which field feeds it. Every row carries the value it would actually carry. */
const pickerRows = computed<PickerRow[]>(() => {
  const o = open.value
  if (!o) return []
  if (o.kind === 'source')
    return neededPaths.value.map((path) => ({
      value: path,
      label: path,
      preview: String(getPath(mappedPreviewRow.value, rowPath(path)) ?? ''),
      on: targetOf(o.key) === path,
    }))
  return sourceFields.value.map((f) => ({
    value: f.path, label: f.path, preview: f.sample, on: sourceOf(o.key) === f.path,
  }))
})

/** A pair wired by name alone has no mapping to take away — the unbind row is not offered. */
const canUnmap = computed(() => {
  const o = open.value
  if (!o) return false
  const from = o.kind === 'source' ? o.key : sourceOf(o.key)
  return !!from && !!mapping.value[from]
})

/** Picking from a variable means wiring the chosen field to it. */
const onPick = (value: string) => {
  const o = open.value
  if (o) pick(o.kind === 'source' ? o.key : value, o.kind === 'source' ? value : o.key)
}
const onUnmap = () => {
  const o = open.value
  if (!o) return
  const from = o.kind === 'source' ? o.key : sourceOf(o.key)
  if (from) pick(from, null)
  else close()
}

// ---------------------------------------------------------------- dragging
// The flourish: drag a field onto a variable. `elementFromPoint` is what a drop is — the
// pointer is captured, so the target never gets an event of its own.
const ghost = ref<{ from: [number, number]; to: [number, number] } | null>(null)
function onPointerDown(event: PointerEvent, path: string) {
  const el = event.currentTarget as HTMLElement
  const box = wrap.value?.getBoundingClientRect()
  if (!box) return
  const r = el.getBoundingClientRect()
  const from: [number, number] = [r.right - box.left, r.top + r.height / 2 - box.top]
  const start = { x: event.clientX, y: event.clientY }
  el.setPointerCapture(event.pointerId)

  const move = (e: PointerEvent) => {
    if (!ghost.value && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 4) return
    ghost.value = { from, to: [e.clientX - box.left, e.clientY - box.top] }
  }
  const up = (e: PointerEvent) => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    if (!ghost.value) return openMenu({ currentTarget: el }, 'source', path) // a click, not a drag
    ghost.value = null
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-target]')
    if (target) pick(path, target.getAttribute('data-target'))
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}

const ghostPath = computed(() => {
  const g = ghost.value
  if (!g) return ''
  const mid = (g.from[0] + g.to[0]) / 2
  return `M${g.from[0]} ${g.from[1]} C${mid} ${g.from[1]}, ${mid} ${g.to[1]}, ${g.to[0]} ${g.to[1]}`
})
</script>

<template>
  <div class="stage">
    <div ref="wrap" class="wrap">
      <div class="col">
        <p class="eyebrow">Source fields</p>
        <button
          v-for="field in sourceFields" :key="field.path" type="button"
          :ref="keep(sourceEls, field.path)"
          class="chip src" :class="{ wired: !!targetOf(field.path), 'by-name': implicit(field.path) }"
          @pointerdown="onPointerDown($event, field.path)"
        >
          <span>{{ field.path }}</span>
          <span class="sample">{{ field.sample }}</span>
        </button>
        <EmptyState v-if="!sourceFields.length" text="load a CSV or connect Spoolman to get rows" />
      </div>

      <!-- One line per mapping, drawn between the chip edges it connects. -->
      <svg class="wires" aria-hidden="true">
        <path v-for="w in wires" :key="w.key" :d="w.d" :class="{ 'by-name': w.byName }" />
        <circle v-for="w in wires" :key="`${w.key}-end`" :cx="w.end[0]" :cy="w.end[1]" r="2.5" />
        <path v-if="ghostPath" class="ghost" :d="ghostPath" />
      </svg>

      <div class="col">
        <p class="eyebrow">{{ meta.name }}</p>
        <button
          v-for="path in neededPaths" :key="path" type="button"
          :ref="keep(targetEls, path)" :data-target="path"
          class="chip tgt" :class="{ on: !!sourceOf(path) }"
          @click="openMenu($event, 'target', path)"
        >{{ path }}</button>
        <EmptyState v-if="!neededPaths.length" text="this template reads nothing off a row" />
      </div>
    </div>
    <p class="foot">
      the same wiring as the Table tab — drag a field onto a variable to wire it<template v-if="wires.some((w) => w.byName)">; a dashed wire is a name that already matches</template>
    </p>

    <Picker
      :anchor="anchor" :rows="pickerRows" :action="canUnmap ? '– unmapped' : undefined" :width="260" placeholder="variable…"
      @pick="onPick" @action="onUnmap" @close="close"
    />
  </div>
</template>

<style scoped>
.stage { display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: auto; }
.wrap { position: relative; display: flex; gap: 220px; align-self: center; padding: 26px 0; }
.col { display: flex; flex-direction: column; gap: 14px; }
.col .eyebrow { margin: 0; }

.chip {
  display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
  height: 34px; min-width: 150px; padding: 3px 10px;
  border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--field);
  font-family: var(--font-mono); font-size: 10px; color: var(--foreground); text-align: left;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.chip:hover { border-color: var(--primary); }
.chip .sample { font-size: 8.5px; color: var(--meta-foreground); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.src { cursor: grab; }
.src.wired { background: var(--pane); }
.src.by-name { border-style: dashed; }
/* A wired variable is --accent plus the 1px ring; an unwired one is a dashed outline (invariant 1). */
.tgt { justify-content: center; border-style: dashed; color: var(--meta-foreground); }
/* A wired variable is an active state: --accent wash, no ring (F14). */
.tgt.on {
  border-style: solid; border-color: transparent; background: var(--accent);
  color: var(--accent-foreground);
}
/* The ring follows focus — the last-clicked variable: blue if wired, dark grey if not. */
.chip:focus { outline: none; box-shadow: inset 0 0 0 1px var(--muted-foreground); }
.chip.wired:focus, .chip.on:focus { box-shadow: inset 0 0 0 1px var(--primary); }

.wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.wires path { fill: none; stroke: var(--primary); stroke-width: 1.5; }
/* Wired because the names agree, not because anyone said so: the same wire, drawn lighter. */
.wires path.by-name { stroke: var(--ok); stroke-dasharray: 4 3; }
.wires circle { fill: var(--primary); }
.wires .ghost { stroke: var(--faint-foreground); stroke-dasharray: 3 3; }

.note, .foot {
  margin: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground);
}
.foot { padding: 0 14px 12px; text-align: center; }
</style>
