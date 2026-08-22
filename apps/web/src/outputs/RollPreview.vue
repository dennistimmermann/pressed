<!--
  The liner strip: die-cut sets separated by the printer's advance, against a millimetre ruler.
  Everything is scaled from the same millimetres the job is imposed in; the label pixels are
  rasterized PNGs (invariant 3), only the chrome is themed.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Trough } from '@/ui'
import { printSize } from '@/stores/printer'
import { settings } from '@/stores/settings'
import Cell from './Cell.vue'

const props = defineProps<{
  /** One entry per visible slot, in print order: a PNG data URL, 'ghost' (assumed label —
      placeholder, dimmed), or undefined (a cell of the raster nothing prints on: dotted). */
  slots: (string | undefined)[]
  /** A roll never pages — the strip just runs on. Taken for the same shape as the sheet. */
  page: number
  pages: number
  /** Ghost raster shown in empty slots when nothing is selected — the template, not a job. */
  placeholder?: string
}>()

const roll = settings.print.roll
const size = printSize // the label's footprint on the liner: rotation is already in it
/** The strip is the set plus a little liner each side — we cannot know the real roll width. */
const setWidth = computed(() => roll.across * size.value.width + (roll.across - 1) * roll.marginH)
/** px per mm: zoom so the strip *fits the trough by width* (capped so a lone tiny label
    cannot balloon); the length scrolls. One scale for the whole drawing, gaps included. */
const wrap = ref<HTMLElement>()
const wrapW = ref(0)
// Plain ResizeObserver: vueuse's useElementSize sat at 0 here — measured is measured.
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => { wrapW.value = e.contentRect.width })
  if (wrap.value) ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())
const k = computed(() => {
  const available = Math.max(120, (wrapW.value || 400) - 34 /* ruler */ - 56 /* breathing room */)
  return Math.min(6, available / (setWidth.value + 8))
})
const stripW = computed(() => `${(setWidth.value + 8) * k.value}px`)
const px = (mm: number) => `${mm * k.value}px`

const caption = computed(
  () => `${size.value.width} × ${size.value.height} mm · set ${roll.across} × ${roll.down} · gap ${roll.gap} mm`,
)

// The roll is drawn set by set: the set's own grid, then the advance before the next one.
const perSet = computed(() => Math.max(1, roll.across * roll.down))
const setHeight = computed(() => roll.down * size.value.height + (roll.down - 1) * roll.marginV)
const sets = computed(() =>
  Array.from({ length: Math.ceil(props.slots.length / perSet.value) }, (_, s) => ({
    slots: props.slots.slice(s * perSet.value, (s + 1) * perSet.value),
    /** Where this set starts on the roll, mm — the ruler reads the same number. */
    at: Math.round(s * (setHeight.value + roll.gap)),
  })),
)
const setStyle = computed(() => ({
  gridTemplateColumns: `repeat(${roll.across}, ${px(size.value.width)})`,
  gridAutoRows: px(size.value.height),
  columnGap: px(roll.marginH),
  rowGap: px(roll.marginV),
  marginBottom: px(roll.gap),
}))
</script>

<template>
  <Trough :caption="caption">
    <div ref="wrap" class="mt-[38px] flex min-h-0 w-full flex-1 justify-center self-stretch overflow-y-auto pb-[34px]">
      <!-- the ruler reads millimetres of roll, one tick per set -->
      <div class="relative w-[34px] flex-none">
        <span
          v-for="set in sets" :key="set.at"
          class="absolute right-[8px] -translate-y-[4px] font-mono text-[7.5px] text-[var(--inherited-foreground)] after:absolute after:top-[4px] after:left-[calc(100%+2px)] after:h-px after:w-[4px] after:bg-[var(--dashed)] after:content-['']"
          :style="{ top: px(set.at) }"
        >{{ set.at }}</span>
      </div>
      <!-- liner stock: a material colour, not a theme surface -->
      <div
        class="flex h-fit min-h-full flex-none flex-col items-center border border-b-0 border-[var(--dashed)] bg-[#f6f5f2] px-[10px]"
        :style="{ width: stripW }"
      >
        <div v-for="set in sets" :key="set.at" class="grid flex-none" :style="setStyle">
          <Cell v-for="(src, i) in set.slots" :key="i" :src="src" :placeholder="placeholder" :rotation="settings.print.rotation" :w="size.width * k" :h="size.height * k" rounded />
        </div>
      </div>
      <p class="absolute bottom-[12px] font-mono text-[10px] text-[var(--meta-foreground)]">↓ feed</p>
    </div>
  </Trough>
</template>
