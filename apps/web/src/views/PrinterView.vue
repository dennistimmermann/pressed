<!--
  Printer view (design artifact "sprint Print View", see docs/design/deviations.md): two resizable
  settings panes with the preview trough between them. The left one is the job — which label, how
  it is imposed, how many of each, what it costs; the right one is the printer — which backend,
  which protocol, which device. Both are `@/ui` sections (labelled row over a full-width control),
  the same recipe the Inspector is built from.
-->
<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { debounce } from '@/editor/runtime-client.ts'
import type { PrinterProfile } from '@sprint/core'
import { Field, Labeled, PaneSection, Seg, StatusBar, anchorMenu } from '@/ui'
import Splitter from '@/components/Splitter.vue'
import { expandCopies } from '@sprint/core'
import { OUTPUTS } from '@/outputs'
import { BACKENDS } from '@/printers'
import { PROTOCOLS, protocolById } from '@/printers/protocols'
import { rasterDataUrl } from '@/render/raster'
import { runtime } from '@/render/runtime-client'
import { mappedPreviewRow, mappedSelectedRows } from '@/stores/data'
import { editor, meta } from '@/stores/editor'
import { connectDevice, plan, printSize, printer, refreshDevice } from '@/stores/printer'
import { settings } from '@/stores/settings'

const print = settings.print

// ---------------------------------------------------------------- sections
// Each pane is its own sticky stack: where a header sits in it — headers above, headers below.
type Section = keyof typeof settings.printerCollapsed
const stack = <T extends Section>(names: readonly T[]) => (s: T) => ({
  index: names.indexOf(s),
  below: names.length - 1 - names.indexOf(s),
  collapsed: settings.printerCollapsed[s],
  hairline: names.indexOf(s) > 0,
})
const at = stack(['label', 'output', 'copies'] as const)
const atRight = stack(['backend', 'protocol', 'connection'] as const)
const toggle = (s: Section) => { settings.printerCollapsed[s] = !settings.printerCollapsed[s] }

/** The right pane: which backend prints, and — when it is the direct one — how. */
const config = settings.printer
const backendLabel = computed(() => BACKENDS.find((b) => b.id === config.backend)?.label ?? config.backend)
const protocol = computed(() => protocolById(config.protocol))

/** A segment per option of a two-way setting; the one in force is the chosen one. */
const seg = <T extends string>(value: T, options: { value: T; icon?: string; label?: string; title?: string; disabled?: boolean }[]) =>
  options.map((o) => ({ ...o, on: o.value === value }))

/** Quarter turns of the label on the medium — imposition, so both outputs share the one setting. */
const ROTATIONS = [0, 90, 180, 270] as const

/** The output in force — its fields, its preview, its share of the Job section. */
const output = computed(() => OUTPUTS.find((o) => o.id === print.output) ?? OUTPUTS[0])

// ---------------------------------------------------------------- what the preview shows

/** How many sets of the roll fit on screen before the strip fades out. */

/** Print order as row indices — the same expansion the job itself gets. */
const sequence = computed(() =>
  expandCopies(mappedSelectedRows.value.map((row, i) => ({ ...toRaw(row), _i: i })), print.copies).map((r) => r._i),
)
/** Sheet pages; the roll never pages — its preview scrolls the whole job instead. */
const perPage = computed(() =>
  print.output === 'sheet' ? plan.value.sheet.perSheet : Math.max(1, sequence.value.length),
)
const pages = computed(() => Math.max(1, Math.ceil(sequence.value.length / perPage.value)))
const page = ref(0)
watch([pages, () => print.output], () => { page.value = 0 })

/** -1 = the one assumed label when no data is loaded (1 entry × 1 copy), shown ghosted. */
const visible = computed(() => {
  const from = print.output === 'sheet' ? page.value * perPage.value : 0
  const slots: (number | undefined)[] = sequence.value.slice(from, from + perPage.value)
  if (!slots.length) slots.push(-1) // no data → assume one copy of the template
  // Pad with empties: the rest of the raster, drawn as dotted outlines, never printed.
  const upTo = print.output === 'sheet' ? perPage.value : Math.ceil(slots.length / plan.value.roll.perSet) * plan.value.roll.perSet
  return [...slots, ...Array<number | undefined>(Math.max(0, upTo - slots.length)).fill(undefined)]
})

// ---------------------------------------------------------------- thumbnails
// One raster per *entry*, cached: a sheet of 24 slots is usually a handful of distinct rows.
// 150 dpi is a thumbnail, not the print — the real dots are the backend's business.
const THUMB: PrinterProfile = { dpi: 150, maxDots: 4000, gapMm: 0, density: 8 }
const thumbs = ref<Record<number, string>>({})
const GHOST = 'ghost' // sentinel: render the placeholder, dimmed — a data URL can never equal it
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
const refreshPlaceholder = debounce(() => {
  void (async () => {
    try {
      const result = await runtime().render({
        source: editor.source, assets: toRaw(editor.assets), rows: [toRaw(mappedPreviewRow.value)], inspector: false,
      })
      if (result.html[0] != null)
        placeholder.value = await rasterDataUrl({ html: result.html[0], css: result.css }, meta.value.size, THUMB, meta.value.margin ?? 0)
    } catch { /* no placeholder is an empty slot, never an error banner */ }
  })()
}, 150)
watch([() => editor.source, mappedPreviewRow], refreshPlaceholder, { immediate: true })

const unbind = () => { print.copies = 1 }

// A different template or a different selection makes every cached raster a lie.
watch([() => editor.source, mappedSelectedRows], () => { token++; thumbs.value = {}; refreshThumbs() })
watch(visible, refreshThumbs, { immediate: true })

const slots = computed(() => visible.value.map((i) => (i === undefined ? undefined : i === -1 ? GHOST : thumbs.value[i])))

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

const copiesOpen = ref(false)
const copiesPos = ref<Record<string, string>>({})
const toggleCopies = (e: MouseEvent) => {
  copiesPos.value = anchorMenu((e.currentTarget as HTMLElement).getBoundingClientRect(), 160, { align: 'right', height: 180 })
  copiesOpen.value = !copiesOpen.value
}
const copiesPopover = ref<HTMLElement>()
onClickOutside(copiesPopover, () => { copiesOpen.value = false })
const bind = (column: string | null) => {
  print.copies = column ? { column } : 1
  copiesOpen.value = false
}

/** The whole job in one strip sentence: `12 entries × 2 copies = 24 labels · 1 sheet of A4`. */
const jobLine = computed(() => {
  const copies = boundColumn.value ? `· copies from ${boundColumn.value}` : `× ${fixedCopies.value} copies`
  return `${entries.value} ${copies} = ${plan.value.labels} labels · ${jobCostSplit.value[0]}${jobCostSplit.value[1]}`
})
/** Brief printer settings for the bar's right side. */
const printerBrief = computed(() => {
  if (config.backend === 'browser') return 'Browser Print'
  const device = printer.deviceStatus.claimed ? `● ${printer.deviceStatus.label}` : '○ not connected'
  return `Direct · ${protocol.value.label} · ${config.tspl.dpi} dpi · density ${config.tspl.density} · ${device}`
})

onMounted(refreshDevice)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="flex min-h-0 flex-1">
    <!-- The printer itself leads: which backend, which protocol, which device — then the job. -->
    <div class="col" :style="{ width: `${settings.printerPaneWidth}px` }">
      <!-- 1 · backend ------------------------------------------------------->
      <PaneSection
        v-bind="atRight('backend')" title="Backend" body-class="gap-[7px]" :meta="backendLabel"
        @toggle="toggle('backend')"
      >
        <select v-model="config.backend" class="ctl" aria-label="backend">
          <option v-for="b in BACKENDS" :key="b.id" :value="b.id">{{ b.label }}</option>
        </select>
        <p v-if="config.backend === 'browser'" class="note">prints through the system dialog — any inkjet or laser</p>
      </PaneSection>

      <!-- 2 · protocol ------------------------------------------------------>
      <PaneSection
        v-if="config.backend === 'direct'"
        v-bind="atRight('protocol')" title="Protocol" body-class="gap-[7px]"
        :meta="`${protocol.label} · ${config.tspl.dpi} dpi`" @toggle="toggle('protocol')"
      >
        <select v-model="config.protocol" class="ctl" aria-label="protocol">
          <option v-for="p in PROTOCOLS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <component :is="protocol.Settings" />
      </PaneSection>

      <!-- 3 · connection ---------------------------------------------------->
      <PaneSection
        v-if="config.backend === 'direct'"
        v-bind="atRight('connection')" title="Connection" body-class="gap-[7px]"
        :meta="printer.deviceStatus.claimed ? printer.deviceStatus.label : '—'" @toggle="toggle('connection')"
      >
        <div class="flex items-center gap-2">
          <span class="font-mono text-[10.5px]" :class="printer.deviceStatus.claimed ? 'text-[var(--ok)]' : 'text-[var(--meta-foreground)]'">
            {{ printer.deviceStatus.claimed ? `● ${printer.deviceStatus.label}` : '○ not connected' }}
          </span>
          <button
            type="button"
            class="ml-auto h-[25px] flex-none rounded-[var(--radius-control)] border border-[var(--field-border)] px-[9px] text-[11px] transition-colors duration-[120ms] ease-out hover:bg-[var(--row-hover)]"
            @click="connectDevice"
          >Pick printer…</button>
        </div>
        <p class="note">power the printer on before plugging USB — it enumerates half-dead otherwise</p>
      </PaneSection>
    </div>
    <Splitter v-model:size="settings.printerPaneWidth" :min="220" :max="380" />

    <component
      :is="output.Preview"
      :slots="slots" :page="page" :pages="pages" :placeholder="placeholder"
      @update:page="page = $event"
    />

    <!-- The job pane on the far side of the trough: which label, arranged how, how many. -->
    <Splitter v-model:size="settings.printerWidth" :min="240" :max="420" invert />
    <div class="col" :style="{ width: `${settings.printerWidth}px` }">
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

      <!-- 3 · copies -------------------------------------------------------->
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
            <div
              v-if="copiesOpen" ref="copiesPopover"
              class="fixed z-30 flex w-[160px] flex-col rounded-[var(--radius-trough)] border border-[var(--field-border)] bg-[var(--pane)] p-1 shadow-[var(--shadow-popover)]"
            :style="copiesPos"
            >
              <button
                type="button" class="rounded-[var(--radius-control)] px-2 py-1 text-left text-[11px] hover:bg-[var(--row-hover)]"
                @click="bind(null)"
              >fixed number</button>
              <button
                v-for="column in columns" :key="column" type="button"
                class="rounded-[var(--radius-control)] px-2 py-1 text-left font-mono text-[10.5px] text-[var(--accent-link)] hover:bg-[var(--row-hover)]"
                @click="bind(column)"
              >row.{{ column }}</button>
            </div>
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
    <StatusBar eyebrow="Printer" class="on-ink flex-none">
      {{ printerBrief }}
      <span v-if="printer.busy">· printing…</span>
      <span v-if="printer.lastPrint">· {{ printer.lastPrint }}</span>
      <span v-if="printer.error" class="text-[var(--ink-destructive)]">· {{ printer.error }}</span>
      <template #end>{{ jobLine }}</template>
    </StatusBar>
  </section>
</template>

<style scoped>
/* The one scroller: the section headers stay put while the column moves under them. */
.col { display: flex; flex: none; flex-direction: column; overflow-y: auto; background: var(--pane); }

/* The 25px filled control, borderless until focus — what a `<select>` wears to match a Field. */
.ctl {
  width: 100%; min-width: 0; height: 25px; padding: 0 7px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field); outline: none;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:focus-visible { border-color: var(--primary); background: var(--pane); }

.note { margin: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
