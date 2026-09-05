<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** The code on the badge: a designator (R, DS, IC), a thread (M3), a material (PETG), a cell (18650). */
    text: string
    /** Black badge, text knocked out. */
    filled?: boolean
    /** Height; the width follows the text. @format mm */
    size?: string
  }>(),
  { filled: false, size: '4mm' },
)

// Tabler's square badge on its 24 grid: a 2 stroke, a 2 corner radius, letters 10 tall. The same
// fractions of the height here, so a badge sits next to a drawn icon of the same size.
const mm = computed(() => parseFloat(props.size) || 4)
const style = computed(() => ({
  height: `${mm.value}mm`,
  minWidth: `${mm.value}mm`,
  padding: `0 ${mm.value / 6}mm`,
  borderWidth: `${mm.value / 12}mm`,
  borderRadius: `${mm.value / 10}mm`,
  fontSize: `${mm.value * 0.55}mm`,
}))
</script>

<template>
  <span class="pressed-badge" :class="{ filled }" :style="style">{{ text }}</span>
</template>

<style>
.pressed-badge {
  display: flex; align-items: center; justify-content: center; align-self: flex-start; box-sizing: border-box;
  border-style: solid; border-color: #000; color: #000; background: #fff;
  font-family: 'IBM Plex Mono', monospace; font-weight: 700; line-height: 1; letter-spacing: 0.02em; white-space: nowrap;
}
.pressed-badge.filled { background: #000; color: #fff }
</style>
