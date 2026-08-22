<!--
  How a job is imposed on a continuous roll: one set of labels across the liner, and the advance
  to the next set. No fit check — we cannot know what stock is loaded.
-->
<script setup lang="ts">
import { Field, Labeled } from '@/ui'
import { plan } from '@/stores/printer'
import { settings } from '@/stores/settings'
import { ICON } from './icons'

const roll = settings.print.roll
const round = (n: number) => Math.round(n * 10) / 10
</script>

<template>
  <Labeled label="set" cells>
    <Field v-model="roll.across" :icon="ICON.cols" />
    <Field v-model="roll.down" :icon="ICON.rows" />
  </Labeled>
  <!-- No fit check on a roll: we cannot know what stock is loaded — just say how wide the set is. -->
  <p class="note">
    set <span class="text-foreground">{{ roll.across }} × {{ roll.down }}</span> =
    <span class="text-foreground">{{ round(plan.roll.set.width) }} mm</span> wide
  </p>
  <Labeled label="margins" cells>
    <Field v-model="roll.marginH" :icon="ICON.marginSides" unit="mm" />
    <Field v-model="roll.marginV" :icon="ICON.marginTB" unit="mm" />
  </Labeled>
  <Labeled label="gap" cells>
    <Field v-model="roll.gap" :icon="ICON.advance" unit="mm" />
  </Labeled>
  <p class="note">
    gap = advance between sets · preset from the profile's die-cut (TSPL <span class="text-foreground">GAP</span>)
  </p>
</template>

<style scoped>
.note { margin: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
