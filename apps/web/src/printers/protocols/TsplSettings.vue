<!--
  What a TSPL printer has to be told: the head it burns with, and how hard. Everything else in
  the job (SIZE, GAP) comes from the label and the roll output, so it is not repeated here.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Field, Labeled } from '@/ui'
import type { TsplConfig } from '../types'

// The config arrives as a prop (the store's reactive slice, mutated in place) — protocol
// settings panes are adapters and never read app stores themselves (ARC-03).
const props = defineProps<{ cfg: TsplConfig }>()
const tspl = props.cfg

/** The head width in real millimetres — the number that decides whether a label fits. */
const printableMm = computed(() => Math.round((tspl.maxDots / tspl.dpi) * 25.4 * 10) / 10)

// DENSITY is 0..15; the encoder throws outside that, so the field never leaves it.
const density = computed({
  get: () => tspl.density,
  set: (n: number) => { tspl.density = Math.min(15, Math.round(n)) },
})

/** SPEED is optional — null means "say nothing", so the printer keeps its own. */
const speed = computed({
  get: () => tspl.speed ?? 4,
  set: (n: number) => { tspl.speed = n },
})
</script>

<template>
  <Labeled label="dpi">
    <Field v-model="tspl.dpi" />
  </Labeled>
  <Labeled label="max dots">
    <Field v-model="tspl.maxDots" unit="dots" />
  </Labeled>
  <p class="note">
    <span class="text-foreground">{{ tspl.maxDots }}</span> dots @
    <span class="text-foreground">{{ tspl.dpi }}</span> dpi =
    <span class="text-foreground">{{ printableMm }} mm</span> printable
  </p>
  <Labeled label="density">
    <Field v-model="density" unit="0–15" unit-off />
  </Labeled>
  <Labeled label="speed">
    <!-- Two states, like Copies: a stand-in you click to type a number, or the number with an ×. -->
    <Field
      v-if="tspl.speed === null" text="printer default" unit="ips" unit-off class="cursor-text"
      title="click to set a speed" @click="tspl.speed = 4"
    />
    <Field v-else v-model="speed" unit="ips" unset @unset="tspl.speed = null" />
  </Labeled>
  <p class="note">empty speed = the printer's own default</p>
</template>

<style scoped>
.note { margin: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
