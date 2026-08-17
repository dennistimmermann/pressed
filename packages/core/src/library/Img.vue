<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Bundled asset (`asset:logo.svg`) or a data: URL. External URLs do not survive the raster path. @format url */
  src: string
  /** Rendered width. @format mm */
  width?: string
}>()

// asset: URLs are rewritten to data: URLs after render; anything else would silently
// print as a blank box, so refuse it loudly instead.
const ok = computed(() => /^(asset:|data:)/.test(props.src))
</script>

<template>
  <img v-if="ok" :src="src" :style="{ width }" alt="">
  <span v-else style="color: #000; border: 1px solid #000; font: 8pt monospace">
    Img: only asset: and data: URLs
  </span>
</template>
