<script setup lang="ts">
import { computed } from 'vue'
import QRCode from 'qrcode'

const props = withDefaults(defineProps<{
  /** Text encoded in the code. */
  value: string
  /** Edge length of the square code. @format mm */
  size?: string
  /** Error correction level — higher survives more damage but holds less data. */
  ecc?: 'L' | 'M' | 'Q' | 'H'
}>(), { size: '18mm', ecc: 'M' })

// `QRCode.toString()` is async and templates must render synchronously, so build the SVG
// from the sync `create()` bit matrix ourselves: one <path> of 1×1 squares, no quiet zone.
const code = computed(() => QRCode.create(props.value || ' ', { errorCorrectionLevel: props.ecc }))
const n = computed(() => code.value.modules.size)
const d = computed(() => {
  const { size, data } = code.value.modules
  let path = ''
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (data[y * size + x] & 1) path += `M${x} ${y}h1v1h-1z`
  return path
})
</script>

<template>
  <svg
    :width="size" :height="size" :viewBox="`0 0 ${n} ${n}`"
    xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"
  >
    <path :d="d" fill="#000" />
  </svg>
</template>
