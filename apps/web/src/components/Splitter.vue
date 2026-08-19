<!--
  The gutter between two cards *is* the splitter (VISUAL-SPEC §1): 8px of tray, dragged to
  resize, with a 12px hit area that overlaps the cards by 2px each side. reka-ui's splitter
  sizes panes in percent,
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
/* No rail, no grabber: the gutter is tray until the pointer is on it. `background-clip`
   keeps the tint at the 8px the eye sees while the padding widens the target to 12px, and
   the negative margin gives those 4px back to the layout. */
.handle {
  position: relative;
  z-index: 1;
  flex: none;
  background: transparent;
  background-clip: content-box;
  transition: background-color 120ms ease-out;
}
.handle:hover {
  background: var(--gutter-hover);
}
.handle.x {
  width: calc(var(--tray-gutter) + 4px);
  margin: 0 -2px;
  padding: 0 2px;
  cursor: col-resize;
}
.handle.y {
  height: calc(var(--tray-gutter) + 4px);
  margin: -2px 0;
  padding: 2px 0;
  cursor: row-resize;
}
</style>
