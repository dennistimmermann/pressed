<!--
  The A4/Letter page with its real grid, scaled from the same millimetres the document builder
  uses — so a slot is where the label will be. The label pixels are rasterized PNGs
  (invariant 3); only the chrome is themed.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PAGE_FORMATS, sheetOrigin } from '@pressed/core/template/label.ts'
import { Chip, Trough } from '@/ui'
import { printSize } from '@/stores/printer'
import { settings } from '@/stores/settings'
import Cell from './Cell.vue'

const props = defineProps<{
  /** One entry per visible slot, in print order: a PNG data URL, or undefined (a cell of the
      raster nothing prints on: dotted). */
  slots: (string | undefined)[]
  page: number
  pages: number
  /** Nothing is selected: every slot is a dotted outline and the trough says `no data` (F28). */
  empty?: boolean
}>()
const emit = defineEmits<{ 'update:page': [number] }>()

const sheet = settings.print.sheet
const size = printSize // the label's footprint on the paper: rotation is already in it
const paper = computed(() => PAGE_FORMATS[sheet.format])

/**
 * The page fills the trough it is in, minus a 24px inset — a fixed 490px left 350px of dead
 * canvas under it on a tall window and overflowed a short one (F: atlas 40).
 */
const wrap = ref<HTMLElement>()
const room = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => { room.value = e.contentRect.height })
  if (wrap.value) { ro.observe(wrap.value); room.value = wrap.value.clientHeight }
})
onBeforeUnmount(() => ro?.disconnect())
/** px per mm. One scale for the whole drawing, so gaps and margins stay in proportion. */
const k = computed(() => Math.max(80, (room.value || 560) - 48 - (props.pages > 1 ? 36 : 0)) / paper.value.height)
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
    <template v-if="empty" #tag><Chip dot="off">no data</Chip></template>
    <!-- The page is centred in what is left under the caption row: no dead canvas. -->
    <div ref="wrap" class="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[10px] pt-[30px] pb-[6px]">
      <div class="grid flex-none overflow-hidden border border-[var(--dashed)] bg-[var(--sheet)]" :style="pageStyle">
        <Cell v-for="(src, i) in props.slots" :key="i" :src="src" :rotation="settings.print.rotation" :w="size.width * k" :h="size.height * k" />
      </div>
      <div v-if="pages > 1" class="flex flex-none items-center gap-[10px] font-mono text-[10.5px] text-[var(--meta-foreground)]">
        <button type="button" class="text-[var(--faint-foreground)] disabled:opacity-40" :disabled="page === 0" @click="emit('update:page', page - 1)">‹</button>
        sheet {{ page + 1 }} / {{ pages }}
        <button type="button" class="text-[var(--faint-foreground)] disabled:opacity-40" :disabled="page + 1 >= pages" @click="emit('update:page', page + 1)">›</button>
      </div>
    </div>
  </Trough>
</template>
