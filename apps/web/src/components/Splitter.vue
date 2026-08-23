<!--
  The 9px splitter rail between two panes (MIGRATION §3): `--splitter` surface, a 1px
  `--pane-border` on both long edges, a 28 × 3px `--splitter-grip` pill in the middle.
  reka-ui's splitter sizes panes in percent and the design gives the work-area columns in px,
  so this does the arithmetic itself: it owns nothing but the drag, and the pane it sizes lives
  in the parent's `settings`. Dragging well past the minimum collapses the pane to 0; dragging
  back out restores it.
-->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Current size of the pane this handle sizes, in px. */
    size: number
    min: number
    /** Upper bound; unbounded when omitted — the flex layout clamps it to what is left. */
    max?: number
    /** `y` for a horizontal handle between stacked panes. */
    dir?: 'x' | 'y'
    /** True when the pane sits *after* the handle, so dragging back grows it. */
    invert?: boolean
    /** The pane can become a rail: dragging past the minimum emits `collapse` instead of a
        width. Without it the drag simply stops at `min` — a pane is never sized to 0 (F10). */
    collapsible?: boolean
  }>(),
  { dir: 'x', invert: false, max: Infinity, collapsible: false },
)
const emit = defineEmits<{ 'update:size': [px: number]; collapse: [] }>()

const COLLAPSE = 40 // px past the minimum before the pane snaps to its rail

function onPointerDown(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement
  const axis = (ev: PointerEvent) => (props.dir === 'y' ? ev.clientY : ev.clientX)
  const from = props.size
  const start = axis(e)
  handle.setPointerCapture(e.pointerId)

  const move = (ev: PointerEvent) => {
    const want = from + (axis(ev) - start) * (props.invert ? -1 : 1)
    if (props.collapsible && want < props.min - COLLAPSE) return emit('collapse')
    emit('update:size', Math.round(Math.min(props.max, Math.max(props.min, want))))
  }
  const up = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', up)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', up)
}
</script>

<template>
  <div
    class="handle" :class="dir" role="separator" :aria-orientation="dir === 'y' ? 'horizontal' : 'vertical'"
    @pointerdown="onPointerDown"
  />
</template>

<style scoped>
/* 9px border-box: 1px --pane-border, 7px --splitter, 1px --pane-border. `::after` is a
   transparent 13px overlay so the pointer target stays comfortable without widening the rail. */
.handle {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--splitter);
  border: 0 solid var(--pane-border);
  transition: background-color 120ms ease-out;
}
.handle::before {
  content: "";
  display: block;
  border-radius: 999px;
  background: var(--splitter-grip);
}
.handle::after {
  content: "";
  position: absolute;
  inset: 0;
}
/* Widen the hit area along the drag axis only: growing it on the other axis pokes 2px past
   the viewport at the column's end and gives the whole page scrollbars. */
.handle.x::after { left: -2px; right: -2px; }
.handle.y::after { top: -2px; bottom: -2px; }
.handle:hover {
  background: var(--splitter-hover);
}
.handle.x {
  width: 9px;
  border-left-width: 1px;
  border-right-width: 1px;
  cursor: col-resize;
}
.handle.x::before {
  width: 3px;
  height: 28px;
}
.handle.y {
  height: 9px;
  border-top-width: 1px;
  border-bottom-width: 1px;
  cursor: row-resize;
}
.handle.y::before {
  width: 28px;
  height: 3px;
}
</style>
