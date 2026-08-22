<!--
  The A4/Letter page with its real grid, scaled from the same millimetres the document builder
  uses — so a slot is where the label will be. The label pixels are rasterized PNGs
  (invariant 3); only the chrome is themed.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { PAGE_FORMATS, sheetOrigin } from '@sprint/core/template/label.ts'
import { Trough } from '@/ui'
import { printSize } from '@/stores/printer'
import { settings } from '@/stores/settings'
import Cell from './Cell.vue'

const props = defineProps<{
  /** One entry per visible slot, in print order: a PNG data URL, 'ghost' (assumed label —
      placeholder, dimmed), or undefined (a cell of the raster nothing prints on: dotted). */
  slots: (string | undefined)[]
  page: number
  pages: number
  /** Ghost raster shown in empty slots when nothing is selected — the template, not a job. */
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:page': [number] }>()

const PAGE_H = 490 // px — the page fills the trough without touching its edges

const sheet = settings.print.sheet
const size = printSize // the label's footprint on the paper: rotation is already in it
const paper = computed(() => PAGE_FORMATS[sheet.format])
/** px per mm. One scale for the whole drawing, so gaps and margins stay in proportion. */
const k = computed(() => PAGE_H / paper.value.height)
const px = (mm: number) => `${mm * k.value}px`

const caption = computed(
  () => `${sheet.format} · ${size.value.width} × ${size.value.height} mm · ${sheet.countH} × ${sheet.countV}`,
)

const pageStyle = computed(() => ({
  width: px(paper.value.width),
  height: px(paper.value.height),
  paddingTop: px(sheetOrigin(sheet, size.value).top),
  paddingLeft: px(sheetOrigin(sheet, size.value).left),
  gridTemplateColumns: `repeat(${sheet.countH}, ${px(size.value.width)})`,
  gridAutoRows: px(size.value.height),
  columnGap: px(sheet.gapH),
  rowGap: px(sheet.gapV),
}))
</script>

<template>
  <Trough :caption="caption">
    <div class="mt-[38px] grid flex-none overflow-hidden border border-[var(--dashed)] bg-[var(--sheet)]" :style="pageStyle">
      <Cell v-for="(src, i) in props.slots" :key="i" :src="src" :placeholder="placeholder" :rotation="settings.print.rotation" :w="size.width * k" :h="size.height * k" />
    </div>
    <div v-if="pages > 1" class="mt-[10px] flex items-center gap-[10px] font-mono text-[10.5px] text-[var(--meta-foreground)]">
      <button type="button" class="text-[var(--faint-foreground)] disabled:opacity-40" :disabled="page === 0" @click="emit('update:page', page - 1)">‹</button>
      sheet {{ page + 1 }} / {{ pages }}
      <button type="button" class="text-[var(--faint-foreground)] disabled:opacity-40" :disabled="page + 1 >= pages" @click="emit('update:page', page + 1)">›</button>
    </div>
  </Trough>
</template>
