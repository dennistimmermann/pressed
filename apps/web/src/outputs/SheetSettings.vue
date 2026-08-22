<!--
  How a job is imposed on a cut sheet: the paper, the grid, where the grid sits on it. The last
  line is the fit check — the grid's extent against the page.
-->
<script setup lang="ts">
import { Field, Labeled, Seg } from '@/ui'
import { plan, printSize } from '@/stores/printer'
import { settings } from '@/stores/settings'
import { ICON } from './icons'

const sheet = settings.print.sheet
const round = (n: number) => Math.round(n * 10) / 10

/** A segment per option of a two-way setting; the one in force is the chosen one. */
const seg = <T extends string>(value: T, options: { value: T; icon?: string; label?: string; title?: string }[]) =>
  options.map((o) => ({ ...o, on: o.value === value }))
</script>

<template>
  <Labeled label="sheet">
    <select v-model="sheet.format" class="ctl" aria-label="sheet format">
      <option value="A4">A4 · 210 × 297</option>
      <option value="Letter">Letter · 216 × 279</option>
    </select>
  </Labeled>
  <Labeled label="count" cells>
    <Field v-model="sheet.countH" :icon="ICON.cols" />
    <Field v-model="sheet.countV" :icon="ICON.rows" />
  </Labeled>
  <Labeled label="gap" cells>
    <Field v-model="sheet.gapH" :icon="ICON.gapH" unit="mm" />
    <Field v-model="sheet.gapV" :icon="ICON.gapV" unit="mm" />
  </Labeled>
  <!-- Per-axis origin: a centered axis places itself; left/top axes get a margin field. -->
  <Labeled label="origin" cells>
    <Seg
      :box="12"
      :choices="seg(sheet.alignH, [
        { value: 'left', icon: ICON.marginLeft, title: 'from the left margin' },
        { value: 'center', icon: ICON.centerH, title: 'centered horizontally' },
      ])"
      @pick="sheet.alignH = $event as typeof sheet.alignH"
    />
    <Seg
      :box="12"
      :choices="seg(sheet.alignV, [
        { value: 'top', icon: ICON.marginTop, title: 'from the top margin' },
        { value: 'center', icon: ICON.centerV, title: 'centered vertically' },
      ])"
      @pick="sheet.alignV = $event as typeof sheet.alignV"
    />
  </Labeled>
  <Labeled v-if="sheet.alignV === 'top' || sheet.alignH === 'left'" label="margins" cells>
    <Field v-if="sheet.alignV === 'top'" v-model="sheet.marginTop" :icon="ICON.marginTop" unit="mm" />
    <Field v-if="sheet.alignH === 'left'" v-model="sheet.marginLeft" :icon="ICON.marginLeft" unit="mm" />
  </Labeled>
  <p class="note">
    {{ sheet.countH }} × {{ sheet.countV }} · {{ printSize.width }} × {{ printSize.height }} mm →
    <span :class="plan.sheet.fits ? 'text-foreground' : 'text-destructive'">
      {{ round(plan.sheet.needed.width) }} × {{ round(plan.sheet.needed.height) }} mm
    </span>
    <span :class="plan.sheet.fits ? '' : 'text-destructive'">
      — {{ plan.sheet.fits ? 'fits' : 'does not fit' }} {{ sheet.format }}
    </span>
  </p>
</template>

<style scoped>
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
