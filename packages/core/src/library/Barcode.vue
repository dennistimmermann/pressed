<script setup lang="ts">
import { computed } from 'vue'
import { code128bBars } from 'pressed'

const props = withDefaults(defineProps<{
  /** Text encoded in the barcode (printable ASCII). */
  value: string
  /** Symbology. Only Code 128 subset B is implemented. */
  type?: 'code128'
  /** Bar height. @format mm */
  height?: string
}>(), { type: 'code128', height: '10mm' })

const code = computed(() => code128bBars(props.value || ' '))
</script>

<template>
  <svg
    :height="height" :viewBox="`0 0 ${code.modules} 10`" preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="width: 100%"
  >
    <rect v-for="(b, i) in code.bars" :key="i" :x="b.x" y="0" :width="b.width" height="10" fill="#000" />
  </svg>
</template>
