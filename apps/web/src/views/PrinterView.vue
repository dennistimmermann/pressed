<!--
  Printer view (Output board): the preview trough, and **one** settings rail beside it —
  LABEL · OUTPUT · PRINTER · COPIES. The second pane is gone: Backend, Protocol and Connection
  were three sections holding one select and a button between them, and left ~90% of a 260px
  column empty (F31, atlas 40 · 50). They are the PRINTER section now.

  Every section is a `@/ui` PaneSection of labelled rows over full-width controls — the same
  recipe the Inspector is built from.
-->
<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { debounce } from '@/editor/runtime-client.ts'
import type { PrinterProfile } from '@pressed/core'
import { Field, Labeled, PaneRail, PaneSection, Picker, type PickerRow, Seg, StatusBar, type StatusCell } from '@/ui'
import Splitter from '@/components/Splitter.vue'
import { expandCopies, MAX_LABELS } from '@pressed/core'
import { OUTPUTS } from '@/outputs'
import { BACKENDS } from '@/printers'
import { PROTOCOLS, protocolById } from '@/printers/protocols'
import { rasterDataUrl } from '@/render/raster'
import { runtime } from '@/render/runtime-client'
import { mappedPreviewRow, mappedSelectedRows } from '@/stores/data'
import { editor, meta } from '@/stores/editor'
import { connectDevice, device, plan, printSize, printer, refreshDevice } from '@/stores/printer'
import { settings } from '@/stores/settings'

const print = settings.print

// ---------------------------------------------------------------- sections
// One sticky stack: where a header sits in it — headers above it, headers below it.
type Section = keyof typeof settings.printerCollapsed
const SECTIONS = ['label', 'output', 'printer', 'copies'] as const
const TITLES: Record<Section, string> = { label: 'Label', output: 'Output', printer: 'Printer', copies: 'Copies' }
const at = (s: Section) => ({
  index: SECTIONS.indexOf(s),
  below: SECTIONS.length - 1 - SECTIONS.indexOf(s),
  collapsed: settings.printerCollapsed[s],
  hairline: SECTIONS.indexOf(s) > 0,
})
const toggle = (s: Section) => { settings.printerCollapsed[s] = !settings.printerCollapsed[s] }

/** Every section shut is a 28px rail, and the trough takes the width back (F8). */
const railed = computed(() => SECTIONS.every((n) => settings.printerCollapsed[n]))
const railTitles = SECTIONS.map((n) => TITLES[n])
const expand = (title: string) => { settings.printerCollapsed[SECTIONS[railTitles.indexOf(title)]] = false }
const railAll = () => { for (const n of SECTIONS) settings.printerCollapsed[n] = true }

// ---------------------------------------------------------------- the printer
/**
 * Backend and protocol are one choice to the user — "how does this print" — so they are one
 * select. `browser` prints through the system dialog; every other option is the direct backend
 * speaking one protocol.
 */
const config = settings.printer
const protocol = computed(() => protocolById(config.protocol))
const printerOptions = computed(() => [
  ...BACKENDS.filter((b) => b.id !== 'direct').map((b) => ({ value: b.id, label: b.label })),
  ...PROTOCOLS.map((p) => ({ value: `direct:${p.id}`, label: `Direct · ${p.label} over WebUSB` })),
])
const printerChoice = computed({
  get: () => (config.backend === 'direct' ? `direct:${config.protocol}` : config.backend),
  set: (value: string) => {
    const [backend, proto] = value.split(':')
    config.backend = backend as typeof config.backend
    if (proto) config.protocol = proto as typeof config.protocol
  },
})
const printerMeta = computed(() =>
  config.backend === 'browser' ? 'browser dialog' : `${config.protocol} · ${config.tspl.dpi} dpi`,
)

/** A segment per option of a two-way setting; the one in force is the chosen one. */
const seg = <T extends string>(value: T, options: { value: T; icon?: string; label?: string; title?: string; disabled?: boolean }[]) =>
  options.map((o) => ({ ...o, on: o.value === value }))

/** Quarter turns of the label on the medium — imposition, so both outputs share the one setting. */
const ROTATIONS = [0, 90, 180, 270] as const

/** The output in force — its fields, its preview, its share of the Job section. */
const output = computed(() => OUTPUTS.find((o) => o.id === print.output) ?? OUTPUTS[0])

// ---------------------------------------------------------------- what the preview shows

/** How many sets of the roll fit on screen before the strip fades out. */

/** Print order as row indices — the same expansion the job itself gets. Oversized jobs never
    expand (COR-08): the plan already counted them, the status cell says why the trough is empty. */
const sequence = computed(() =>
  plan.value.oversized
    ? []
    : expandCopies(mappedSelectedRows.value.map((row, i) => ({ ...toRaw(row), _i: i })), print.copies).map((r) => r._i),
)
/** Sheet pages; the roll never pages — its preview scrolls the whole job instead. */
const perPage = computed(() =>
  print.output === 'sheet' ? plan.value.sheet.perSheet : Math.max(1, sequence.value.length),
)
const pages = computed(() => Math.max(1, Math.ceil(sequence.value.length / perPage.value)))
const page = ref(0)
watch([pages, () => print.output], () => { page.value = 0 })

/**
 * F28: with nothing selected there is no job, and the trough says so — dashed slots and a
 * `no data` chip, never a rendered label at 40% that reads as a real one (atlas 47). The
 * template still has a face; that is what the LABEL section's thumbnail is for.
 */
const empty = computed(() => sequence.value.length === 0)
const visible = computed(() => {
  const from = print.output === 'sheet' ? page.value * perPage.value : 0
  const slots: (number | undefined)[] = sequence.value.slice(from, from + perPage.value)
  // Pad with empties: the rest of the raster, drawn as dotted outlines, never printed.
  const perSet = plan.value.roll.perSet
  const upTo = print.output === 'sheet' ? perPage.value : Math.max(perSet, Math.ceil(slots.length / perSet) * perSet)
  return [...slots, ...Array<number | undefined>(Math.max(0, upTo - slots.length)).fill(undefined)]
})

// ---------------------------------------------------------------- thumbnails
// One raster per *entry*, cached: a sheet of 24 slots is usually a handful of distinct rows.
// 150 dpi is a thumbnail, not the print — the real dots are the backend's business.
const THUMB: PrinterProfile = { dpi: 150, maxDots: 4000, gapMm: 0, density: 8 }
const thumbs = ref<Record<number, string>>({})
let token = 0

const refreshThumbs = debounce(() => {
  const want = [...new Set(visible.value.filter((i): i is number => i !== undefined))]
    .filter((i) => !thumbs.value[i])
  if (!want.length) return
  const mine = ++token
  void (async () => {
    try {
      // `toRaw`: a Vue proxy cannot be structured-cloned through postMessage.
      const result = await runtime().render({
        source: editor.source,
        assets: toRaw(editor.assets),
        rows: want.map((i) => toRaw(mappedSelectedRows.value[i])),
        inspector: false,
      })
      const urls = await Promise.all(
        result.html.map((html) => rasterDataUrl({ html, css: result.css }, meta.value.size, THUMB, meta.value.margin ?? 0)),
      )
      if (mine !== token) return // a newer render won
      thumbs.value = { ...thumbs.value, ...Object.fromEntries(want.map((i, k) => [i, urls[k]])) }
    } catch { /* a preview that will not render is empty slots, never an error banner */ }
  })()
}, 150)

/** With nothing selected there is still a template: render the preview row once so the
    Label thumb and the trough show the label, ghosted, instead of a blank page. */
const placeholder = ref<string>()
let placeholderToken = 0
const refreshPlaceholder = debounce(() => {
  const mine = ++placeholderToken
  void (async () => {
    try {
      const result = await runtime().render({
        source: editor.source, assets: toRaw(editor.assets), rows: [toRaw(mappedPreviewRow.value)], inspector: false,
      })
      if (result.html[0] == null) return
      const url = await rasterDataUrl({ html: result.html[0], css: result.css }, meta.value.size, THUMB, meta.value.margin ?? 0)
      if (mine !== placeholderToken) return // a newer render won
      placeholder.value = url
    } catch { /* no placeholder is an empty slot, never an error banner */ }
  })()
}, 150)
watch([() => editor.source, mappedPreviewRow], refreshPlaceholder, { immediate: true })

const unbind = () => { print.copies = 1 }

// A different template or a different selection makes every cached raster a lie.
watch([() => editor.source, mappedSelectedRows], () => { token++; thumbs.value = {}; refreshThumbs() })
watch(visible, refreshThumbs, { immediate: true })

const slots = computed(() => visible.value.map((i) => (i === undefined ? undefined : thumbs.value[i])))

/** The Label section: entry 1, at true proportion. */
const thumbWidth = computed(() => Math.min(140, meta.value.size.width * 2.5))

// ---------------------------------------------------------------- copy

const columns = computed(() => Object.keys(mappedPreviewRow.value))
const boundColumn = computed(() => (typeof print.copies === 'number' ? null : print.copies.column))
const columnRange = computed(() => {
  const col = boundColumn.value
  if (!col) return ''
  const counts = mappedSelectedRows.value.map((r) => Number(r[col])).filter(Number.isFinite)
  return counts.length ? `${Math.min(...counts)}…${Math.max(...counts)}` : ''
})

const copiesMeta = computed(() => {
  if (boundColumn.value) return null // rendered with the column in accent
  const n = print.copies as number
  return n === 1 ? 'each data entry prints once' : `each data entry prints ${n}× before the next`
})

const entries = computed(() => `${plan.value.entries} entr${plan.value.entries === 1 ? 'y' : 'ies'}`)
/** The last clause of the cost line is the number that matters, so it gets the ink. */
const jobCostSplit = computed(() => output.value.plan(print, printSize.value, plan.value.labels))

/** The field only edits the fixed count; a bound column is set through the popover. */
const fixedCopies = computed({
  get: () => (typeof print.copies === 'number' ? print.copies : 1),
  set: (n: number) => { print.copies = n },
})

// The `{ }` picker — the same shape as the editor's, live value preview and all (atlas 25/42).
const copiesAnchor = ref<DOMRect | null>(null)
const toggleCopies = (e: MouseEvent) => {
  copiesAnchor.value = copiesAnchor.value ? null : (e.currentTarget as HTMLElement).getBoundingClientRect()
}
const copiesRows = computed<PickerRow[]>(() =>
  columns.value.map((column) => ({
    value: column,
    label: `row.${column}`,
    preview: String(mappedPreviewRow.value[column] ?? ''),
    on: boundColumn.value === column,
  })),
)
const bind = (column: string | null) => {
  print.copies = column ? { column } : 1
  copiesAnchor.value = null
}

/** The foot: what will print, as labelled cells rather than one running sentence (F9). */
const cells = computed<StatusCell[]>(() => {
  if (config.backend === 'browser') {
    const out: StatusCell[] = [{ k: 'printer', v: 'Browser Print' }]
    if (plan.value.oversized) out.push(oversizedCell.value)
    else if (empty.value) out.push({ v: 'no data' })
    if (printer.busy) out.push({ v: 'printing…' })
    if (printer.lastPrint) out.push({ k: 'last', v: printer.lastPrint })
    if (printer.error) out.push({ v: printer.error, tone: 'error' })
    return out
  }
  const out: StatusCell[] = [
    { k: 'printer', v: `${protocol.value.label} · ${config.tspl.dpi} dpi` },
    { k: 'density', v: String(config.tspl.density) },
    device.claimed
      ? { v: `● ${device.label}`, tone: 'ok' }
      : { v: '○ not connected' },
  ]
  if (plan.value.oversized) out.push(oversizedCell.value)
  else if (empty.value) out.push({ v: 'no data' })
  if (printer.busy) out.push({ v: 'printing…' })
  if (printer.lastPrint) out.push({ k: 'last', v: printer.lastPrint })
  if (printer.error) out.push({ v: printer.error, tone: 'error' })
  return out
})

/** COR-08: the plan refused to expand — say how big the job is and where the cap sits. */
const oversizedCell = computed<StatusCell>(() => ({
  v: `${plan.value.labels.toLocaleString()} labels — over the ${MAX_LABELS.toLocaleString()} cap; check the copies column`,
  tone: 'error',
}))

onMounted(refreshDevice)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="flex min-h-0 flex-1">
    <component
      :is="output.Preview"
      :slots="slots" :page="page" :pages="pages" :empty="empty"
      @update:page="page = $event"
    />

    <!-- The one settings rail: which label, arranged how, printed by what, how many. -->
    <Splitter
      v-if="!railed" v-model:size="settings.printerWidth" :min="240" :max="420" invert collapsible
      @collapse="railAll"
    />
    <PaneRail v-if="railed" :titles="railTitles" @expand="expand" />
    <div v-else class="col" :style="{ width: `${settings.printerWidth}px` }">
      <!-- 1 · label --------------------------------------------------------->
      <PaneSection
        v-bind="at('label')" title="Label" body-class="gap-[7px]"
        :meta="`${meta.size.width} × ${meta.size.height} mm`" @toggle="toggle('label')"
      >
        <div class="flex items-end gap-[10px]">
          <div
            class="flex-none border border-[var(--dashed)] bg-[var(--sheet)]"
            :style="{ width: `${thumbWidth}px`, height: `${(thumbWidth * meta.size.height) / meta.size.width}px` }"
          >
            <img v-if="thumbs[0] ?? placeholder" :src="thumbs[0] ?? placeholder" alt="" class="h-full w-full object-fill">
          </div>
          <p class="note leading-[1.6]">
            <span class="text-foreground">{{ meta.size.width }} × {{ meta.size.height }} mm</span><br>
            {{ meta.name }}<br>
            {{ plan.entries ? `entry 1 of ${plan.entries}` : 'no data' }}
          </p>
        </div>
      </PaneSection>

      <!-- 2 · output -------------------------------------------------------->
      <PaneSection
        v-bind="at('output')" title="Output" body-class="gap-[7px]"
        :meta="print.rotation ? `${print.output} · ${print.rotation}°` : print.output" @toggle="toggle('output')"
      >
        <!-- Sheet needs a page to impose on, so it is the browser backend's alone. -->
        <Seg
          :choices="seg(print.output, OUTPUTS.map((o) => ({
            value: o.id, label: o.label, disabled: o.id === 'sheet' && config.backend !== 'browser',
            title: o.id === 'sheet' && config.backend !== 'browser' ? 'a direct printer feeds from a roll — sheets need the browser dialog' : o.label,
          })))"
          @pick="print.output = $event as typeof print.output"
        />
        <!-- F26: a disabled segment gets a reason line under its group. Choosing the direct
             backend does move the job onto the roll — but it says why, in words, instead of
             flipping the setting behind the user's back (atlas 41). -->
        <p v-if="config.backend !== 'browser'" class="note">sheet needs the Browser backend — a direct printer feeds from a roll</p>
        <!-- Rotation is imposition, not design: it turns the label on sheet and roll alike, so it
             sits above the output's own fields. -->
        <Labeled label="rotation">
          <Seg
            :choices="seg(String(print.rotation), ROTATIONS.map((r) => ({ value: String(r), label: `${r}°` })))"
            @pick="print.rotation = Number($event) as typeof print.rotation"
          />
        </Labeled>
        <component :is="output.Settings" />
      </PaneSection>

      <!-- 3 · printer: backend, protocol and device, in one section (F31) ---->
      <PaneSection
        v-bind="at('printer')" title="Printer" body-class="gap-[7px]" :meta="printerMeta"
        @toggle="toggle('printer')"
      >
        <template v-if="config.backend === 'direct'" #meta>
          <span class="font-mono text-[var(--t6)]" :class="device.claimed ? 'text-[var(--ok)]' : 'text-[var(--meta-foreground)]'">●</span>
        </template>
        <select v-model="printerChoice" class="ctl" aria-label="printer">
          <option v-for="o in printerOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <p v-if="config.backend === 'browser'" class="note">prints through the system dialog — any inkjet or laser</p>
        <template v-else>
          <component :is="protocol.Settings" :cfg="config[protocol.id]" />
          <div class="flex items-center gap-2">
            <span class="font-mono text-[10.5px]" :class="device.claimed ? 'text-[var(--ok)]' : 'text-[var(--meta-foreground)]'">
              {{ device.claimed ? `● ${device.label}` : '○ not connected' }}
            </span>
            <button
              type="button"
              class="ml-auto h-[25px] flex-none rounded-[var(--radius-control)] border border-[var(--field-border)] px-[9px] text-[11px] transition-colors duration-[120ms] ease-out hover:bg-[var(--row-hover)]"
              @click="connectDevice"
            >{{ device.claimed ? 'Change…' : 'Pick printer…' }}</button>
          </div>
          <p class="note">power the printer on before plugging USB — it enumerates half-dead otherwise</p>
        </template>
      </PaneSection>

      <!-- 4 · copies -------------------------------------------------------->
      <PaneSection
        v-bind="at('copies')" title="Copies" body-class="gap-[7px]"
        :meta="boundColumn ? `row.${boundColumn}` : `${fixedCopies}×`" @toggle="toggle('copies')"
      >
        <Labeled label="per entry">
          <div class="relative flex items-center gap-[4px]">
            <Field
              v-if="boundColumn" :text="`row.${boundColumn}`" unit="×" class="min-w-0 flex-1 cursor-text"
              title="click to type a fixed number instead" @click="unbind"
            />
            <Field v-else v-model="fixedCopies" unit="×" class="min-w-0 flex-1" />
            <button
              type="button"
              class="flex h-[25px] w-[22px] flex-none items-center justify-center rounded-[var(--radius-control)] border border-[var(--field-border)] font-mono text-[9.5px] text-[var(--accent-link)] transition-colors duration-[120ms] ease-out hover:bg-[var(--row-hover)]"
              @click="toggleCopies($event)"
            >{ }</button>
            <Picker
              :anchor="copiesAnchor" :rows="copiesRows" action="– fixed number (unbind)" align="right"
              placeholder="column…" empty="no data loaded — nothing to bind to"
              @pick="bind($event)" @action="bind(null)" @close="copiesAnchor = null"
            />
          </div>
        </Labeled>
        <p class="note">
          <template v-if="copiesMeta">{{ copiesMeta }}</template>
          <template v-else>
            from column <span class="text-[var(--accent-link)]">{{ boundColumn }}</span><template v-if="columnRange"> — {{ columnRange }} per entry</template>
          </template>
        </p>
      </PaneSection>

    </div>

    </div>

    <!-- One ink strip across the whole foot: the job, its status, and what will print it.
         Inline, never a toast (invariant 5). -->
    <!-- Mirrors the panes above: printer on the left, the job on the right. -->
    <!-- The equation, right: operators plain, results in ink. -->
    <StatusBar eyebrow="Printer" :cells="cells" class="on-ink flex-none">
      <template #end>
        <span>{{ entries }}</span>
        <span v-if="boundColumn">× copies from</span><b v-if="boundColumn">row.{{ boundColumn }}</b>
        <span v-else>×</span><b v-if="!boundColumn">{{ fixedCopies }}</b>
        <span>=</span><b>{{ plan.labels }} labels</b>
        <span>·</span><b>{{ jobCostSplit[0] }}</b><span>{{ jobCostSplit[1] }}</span>
      </template>
    </StatusBar>
  </section>
</template>

<style scoped>
/* The one scroller: the section headers stay put while the column moves under them. */
.col { display: flex; flex: none; flex-direction: column; overflow-y: auto; background: var(--pane); }

/* `.ctl` comes from ui/controls.css (UI-03). */
.note { margin: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
