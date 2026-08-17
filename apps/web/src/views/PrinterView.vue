<!--
  Minimal Printer view: which backend, is the device there, what profile it prints with.
  No design spec for this view yet — tokens only, mono for every measurement.
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { K30F, PRINTERS } from '@/printers'
import { data } from '@/stores/data'
import { meta } from '@/stores/editor'
import { connectDevice, printer, printerId, refreshDevice } from '@/stores/printer'

const PROFILE = [
  ['dpi', K30F.dpi],
  ['max dots', K30F.maxDots],
  ['gap', `${K30F.gapMm} mm`],
  ['density', K30F.density],
] as const

onMounted(refreshDevice)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col gap-4 p-4">
    <div class="flex flex-col gap-2">
      <label class="eyebrow" for="printer-backend">Printer</label>
      <select
        id="printer-backend" v-model="printerId"
        class="h-8 w-[300px] rounded-[6px] border border-input bg-card px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option v-for="p in PRINTERS" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
    </div>

    <div class="flex items-center gap-3">
      <span class="font-mono text-[11.5px]" :class="printer.deviceStatus.claimed ? 'text-[var(--ok)]' : 'text-muted-foreground'">
        {{ printer.deviceStatus.claimed ? '●' : '○' }} {{ printer.deviceStatus.label }}
      </span>
      <button type="button" class="h-8 rounded-[6px] border border-border px-2.5 text-[12px] hover:bg-muted" @click="connectDevice">
        Connect
      </button>
      <span class="font-mono text-[10.5px] text-muted-foreground">USB printer class devices only</span>
    </div>

    <div class="w-fit rounded-[8px] border border-border p-3">
      <p class="eyebrow mb-2">Profile — K30F</p>
      <dl class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        <template v-for="[key, value] in PROFILE" :key="key">
          <dt class="text-[12px] text-muted-foreground">{{ key }}</dt>
          <dd class="text-right font-mono text-[11.5px]">{{ value }}</dd>
        </template>
      </dl>
    </div>

    <p class="font-mono text-[11.5px] text-muted-foreground">
      {{ data.selected.size }} rows · {{ meta.size.width }} × {{ meta.size.height }} mm{{ meta.gap ? ` · gap ${meta.gap}` : '' }}
      · print with ⌘⏎
    </p>

    <p v-if="printer.busy" class="font-mono text-[11.5px] text-muted-foreground">printing…</p>
    <p v-if="printer.lastPrint" class="font-mono text-[11.5px] text-[var(--ok)]">{{ printer.lastPrint }}</p>
    <!-- Inline, never a toast (invariant 5). -->
    <p v-if="printer.error" class="font-mono text-[11.5px] text-destructive">{{ printer.error }}</p>
  </section>
</template>
