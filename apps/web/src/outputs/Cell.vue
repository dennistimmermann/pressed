<!--
  One cell of the imposition raster, shared by both previews: a rendered label, or an empty cell
  nothing prints on, drawn as a dotted outline. There is no third state — a job with no rows is
  all dotted outlines, never a ghost of the template that reads like a real job (F28).

  The cell is already the *rotated* footprint (the fit math sized it); the raster inside is a
  plain unrotated label image, turned here from the px size the parent already knows.
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { Rotation } from '@pressed/core'

/** `w`/`h`: the cell's own px size — the parent computed it for the grid anyway. A quarter-turned
    image needs those dimensions *swapped*, and CSS cannot express "width = parent height"
    (container-query units mis-resolve here, and ResizeObserver stalls in throttled tabs). */
const props = defineProps<{ src?: string; rounded?: boolean; rotation?: Rotation; w: number; h: number }>()

const turned = computed(() => (props.rotation ?? 0) % 360)
const imgStyle = computed(() => {
  if (!turned.value) return undefined
  if (turned.value === 180) return { transform: 'rotate(180deg)' }
  return {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    width: `${props.h}px`,
    height: `${props.w}px`,
    // Tailwind preflight clamps img to `max-width: 100%` — of the *unrotated* cell, which
    // squashes the quarter-turned box. Lift it.
    maxWidth: 'none' as const,
    transform: `translate(-50%, -50%) rotate(${turned.value}deg)`,
  }
})
</script>

<template>
  <div
    class="relative overflow-hidden border bg-[var(--sheet)]"
    :class="[
      src ? 'border-[var(--field-border)]' : 'border-dashed border-[var(--dashed)]',
      rounded && 'rounded-[var(--radius-control)]',
    ]"
  >
    <img v-if="src" :src="src" alt="" class="h-full w-full object-fill" :style="imgStyle">
  </div>
</template>
