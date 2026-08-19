<!--
  A 9px drag handle for one boundary (SPEC §2). reka-ui's splitter sizes panes in percent,
  and the design gives the work-area columns in px — so this does the arithmetic itself:
  it owns nothing but the drag, and the pane it sizes lives in the parent's `settings`.
  Dragging well past the minimum collapses the pane to 0; dragging back out restores it.
-->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Current size of the pane this handle sizes, in px. */
    size: number
    min: number
    max: number
    /** `y` for a horizontal handle between stacked panes. */
    dir?: 'x' | 'y'
    /** True when the pane sits *after* the handle, so dragging back grows it. */
    invert?: boolean
  }>(),
  { dir: 'x', invert: false },
)
const emit = defineEmits<{ 'update:size': [px: number] }>()

const COLLAPSE = 40 // px past the minimum before the pane snaps shut

function onPointerDown(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement
  const axis = (ev: PointerEvent) => (props.dir === 'y' ? ev.clientY : ev.clientX)
  const from = props.size
  const start = axis(e)
  handle.setPointerCapture(e.pointerId)

  const move = (ev: PointerEvent) => {
    const want = from + (axis(ev) - start) * (props.invert ? -1 : 1)
    emit('update:size', want < props.min - COLLAPSE ? 0 : Math.round(Math.min(props.max, Math.max(props.min, want))))
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
.handle {
  flex: none;
  background: var(--border);
  background-clip: content-box;
  transition: background-color 120ms ease-out;
}
.handle:hover {
  background: var(--primary);
}
.handle.x {
  width: 9px;
  padding: 0 4px;
  cursor: col-resize;
}
.handle.y {
  height: 9px;
  padding: 4px 0;
  cursor: row-resize;
}
</style>
