<script setup lang="ts">
defineProps<{
  /** Box width the content must fit into. @format mm */
  width?: string
  /** Box height the content must fit into. @format mm */
  height?: string
}>()
// ponytail: stub — renders the slot at its natural size. Real shrink-to-fit needs measured
// text, which SSR does not have; do it in the preview/raster pass (WP3) or with CSS
// `container-query` units once the label document supports them.
</script>

<template>
  <div :style="{ width, height, overflow: 'hidden' }"><slot /></div>
</template>
