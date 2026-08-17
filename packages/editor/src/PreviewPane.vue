<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'

/**
 * The scaled preview (design §3.5 + §3.7).
 *
 * The document arrives ready-made from the host (`labelDocument` in core) and is shown in a
 * `sandbox="allow-scripts"` iframe at its true size in millimetres, scaled by CSS. The only
 * thing this pane adds to that document is a few lines of inspector script — and the two
 * outline colours it needs are literals, because app tokens must never reach the document.
 */
const props = withDefaults(
  defineProps<{
    /** Standalone HTML document, or null when there is nothing to show. */
    document: string | null
    sizeMm: { width: number; height: number }
    mode?: 'rendered' | 'raster'
    /** Data URL of the 1-bit bitmap, shown in `raster` mode. */
    rasterSrc?: string
    caption?: string
    /** Right of the eyebrow, e.g. `row 1 of 12 · picked in Data`. */
    subtitle?: string
    state?: 'ok' | 'error' | 'no-data' | 'no-row'
    /** Source range of the selected element; gets the 2px outline. */
    selectedLoc?: { start: number; end: number } | null
    outlines?: boolean
  }>(),
  { mode: 'rendered', rasterSrc: '', caption: '', subtitle: '', state: 'ok', selectedLoc: null, outlines: false },
)

const emit = defineEmits<{
  'update:mode': [mode: 'rendered' | 'raster']
  'select-node': [loc: { start: number; end: number }]
}>()

const PX_PER_MM = 96 / 25.4

// ---------------------------------------------------------------- the document

/**
 * Never blank the preview: on a compile error the last good document stays, at 75% opacity
 * with a destructive outline, so the user sees the before/after (design §3.7).
 */
const lastGood = shallowRef<string | null>(null)
watch(
  () => [props.document, props.state] as const,
  ([doc, state]) => {
    if (doc && state !== 'error') lastGood.value = doc
  },
  { immediate: true },
)

/**
 * Appended to the host's document. It forwards clicks on the nearest `[data-loc]` and
 * paints the selection/outlines — nothing else, and nothing from the app reaches it.
 */
const INSPECTOR = `
<style>
  /* Preview only: the sheet is exactly one label, a scrollbar would be a lie about its size. */
  html, body { overflow: hidden }
  html.sprint-outlines [data-loc] { outline: 1px dashed oklch(0.45 0.10 215); outline-offset: 1px }
  [data-sprint-selected] { outline: 2px solid oklch(0.58 0.15 40) !important; outline-offset: 3px }
</style>
<script>
  addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-loc]')
    if (el) parent.postMessage({ type: 'select-node', loc: el.getAttribute('data-loc') }, '*')
  })
  addEventListener('message', function (e) {
    var d = e.data || {}
    if (d.type !== 'sprint-highlight') return
    document.documentElement.classList.toggle('sprint-outlines', !!d.outlines)
    var was = document.querySelectorAll('[data-sprint-selected]')
    for (var i = 0; i < was.length; i++) was[i].removeAttribute('data-sprint-selected')
    if (d.loc) {
      var el = document.querySelector('[data-loc="' + d.loc + '"]')
      if (el) el.setAttribute('data-sprint-selected', '')
    }
    parent.postMessage({ type: 'sprint-ready' }, '*')
  })
<\/script>`

const srcdoc = computed(() => {
  const doc = props.state === 'error' ? lastGood.value : (props.document ?? lastGood.value)
  return doc ? doc + INSPECTOR : null
})

// ---------------------------------------------------------------- scale

const body = useTemplateRef('body')
const zoom = ref<'fit' | number>('fit')
const fitScale = ref(1)

const scale = computed(() => (zoom.value === 'fit' ? fitScale.value : zoom.value))
const sheet = computed(() => ({
  width: `${props.sizeMm.width * PX_PER_MM * scale.value}px`,
  height: `${props.sizeMm.height * PX_PER_MM * scale.value}px`,
}))

function recomputeFit() {
  const el = body.value
  if (!el) return
  const padding = 48
  const w = (el.clientWidth - padding) / (props.sizeMm.width * PX_PER_MM)
  const h = (el.clientHeight - padding) / (props.sizeMm.height * PX_PER_MM)
  fitScale.value = Math.max(0.1, Math.min(w, h))
}

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(recomputeFit)
  observer.observe(body.value!)
  recomputeFit()
  addEventListener('message', onFrameMessage)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  removeEventListener('message', onFrameMessage)
})
watch(() => props.sizeMm, recomputeFit, { deep: true })

/** fit → 1:1 → custom (the +/- steppers appear), then back. */
function cycleZoom() {
  zoom.value = zoom.value === 'fit' ? 1 : zoom.value === 1 ? Number(scale.value.toFixed(2)) + 0.5 : 'fit'
}
const step = (by: number) => (zoom.value = Math.max(0.1, Number((scale.value + by).toFixed(2))))

// ---------------------------------------------------------------- the frame

const frame = useTemplateRef('frame')

function onFrameMessage(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow) return
  const data = event.data as { type?: string; loc?: string }
  if (data?.type !== 'select-node' || !data.loc) return
  const [start, end] = data.loc.split(':').map(Number)
  emit('select-node', { start, end })
}

/** Push the selection into the frame instead of re-rendering it — no flash, no reload. */
function pushHighlight() {
  frame.value?.contentWindow?.postMessage(
    {
      type: 'sprint-highlight',
      loc: props.selectedLoc ? `${props.selectedLoc.start}:${props.selectedLoc.end}` : null,
      outlines: props.outlines,
    },
    '*',
  )
}
watch(() => [props.selectedLoc, props.outlines], pushHighlight, { deep: true })
</script>

<template>
  <section class="pane">
    <header class="head">
      <span class="eyebrow">Preview</span>
      <span class="sub">{{ subtitle }}</span>
      <span class="spacer" />

      <div class="segmented" role="group" aria-label="Preview mode">
        <button
          type="button"
          :class="{ on: mode === 'rendered' }"
          :aria-pressed="mode === 'rendered'"
          @click="emit('update:mode', 'rendered')"
        >
          Rendered
        </button>
        <button
          type="button"
          :class="{ on: mode === 'raster' }"
          :aria-pressed="mode === 'raster'"
          @click="emit('update:mode', 'raster')"
        >
          Raster 1-bit
        </button>
      </div>

      <button type="button" class="chip" :title="zoom === 'fit' ? 'fit' : 'custom'" @click="cycleZoom">
        ×{{ scale.toFixed(1) }}
      </button>
      <template v-if="zoom !== 'fit'">
        <button type="button" class="chip" aria-label="zoom out" @click="step(-0.25)">−</button>
        <button type="button" class="chip" aria-label="zoom in" @click="step(0.25)">+</button>
      </template>
    </header>

    <div ref="body" class="body dot-grid">
      <div v-if="state === 'no-row'" class="placeholder" :style="sheet">
        <strong>Select a row</strong>
        <span>Pick a record in Data to preview it.</span>
      </div>

      <div v-else class="wrap" :style="sheet" :class="{ stale: state === 'error' }">
        <img
          v-if="mode === 'raster'"
          class="raster"
          :src="rasterSrc"
          :width="sheet.width"
          alt="1-bit raster preview"
        />
        <iframe
          v-else-if="srcdoc"
          ref="frame"
          sandbox="allow-scripts"
          title="Preview"
          :srcdoc="srcdoc"
          :style="{
            width: `${sizeMm.width}mm`,
            height: `${sizeMm.height}mm`,
            transform: `scale(${scale})`,
          }"
          @load="pushHighlight"
        />
      </div>

      <p v-if="caption" class="caption">{{ caption }}</p>
    </div>
  </section>
</template>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
}
.head > * {
  flex: none;
}
.spacer {
  flex: 1 1 auto;
}
.eyebrow {
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.sub,
.caption {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: var(--muted-foreground);
}

/* Selection is --accent plus a ring, never a fill (CLAUDE.md invariant 1). */
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: 7px;
}
.segmented button {
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.segmented button.on {
  background: var(--accent);
  border-color: var(--accent-border);
  color: var(--accent-foreground);
}

.chip {
  height: 22px;
  min-width: 22px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out;
}
.chip:hover {
  background: var(--muted);
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  overflow: auto;
}

.wrap {
  position: relative;
  overflow: hidden;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.1), 0 12px 30px -12px rgb(0 0 0 / 0.28);
}
/* Compile error: keep the last good render, dimmed and outlined. Never blank (§3.7). */
.wrap.stale {
  opacity: 0.75;
  outline: 1.5px solid var(--destructive);
  outline-offset: 2px;
}
.wrap iframe {
  display: block;
  border: 0;
  transform-origin: 0 0;
}
.raster {
  display: block;
  width: 100%;
  height: auto;
  image-rendering: pixelated;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1.5px dashed var(--border);
  border-radius: 2px;
  text-align: center;
}
.placeholder strong {
  font-size: 13px;
  font-weight: 600;
}
.placeholder span {
  font-size: 11px;
  color: var(--muted-foreground);
}
</style>
