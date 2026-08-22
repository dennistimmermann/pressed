<meta>
{ "name": "Spool label", "size": { "width": 60, "height": 40 },
  "description": "Filament spool label from Spoolman: vendor, material, temperatures and a QR of the spool id." }
</meta>

<snippet name="temp">
  <script setup lang="ts">
  const props = defineProps<{
    /** What the temperature is for. */
    label: string
    /** Recommended temperature in °C. */
    value?: number
    /** Width of the range added on top, in °C. */
    spread?: number
  }>()
  const text = props.value == null
    ? '—'
    : props.spread ? `${props.value}–${props.value + props.spread}` : `${props.value}`
  </script>
  <template><span class="k">{{ label }}</span> {{ text }} °C</template>
  <style scoped>.k { color: #555; font-size: 8pt }</style>
</snippet>

<snippet name="badge" props="text">
  <span class="badge">{{ text }}</span>
</snippet>

<template>
  <div class="title">{{ row.filament?.vendor?.name }} {{ row.filament?.name }}</div>
  <div class="material">{{ row.filament?.material }} · {{ row.filament?.diameter }} mm</div>
  <div class="temps">
    <temp label="Nozzle" :value="row.filament?.settings_extruder_temp" :spread="15" />
    <temp label="Bed" :value="row.filament?.settings_bed_temp" />
  </div>
  <div class="left">{{ Math.round(row.remaining_weight ?? 0) }} g left</div>
  <badge v-if="(row.remaining_weight ?? 0) < 100" text="almost empty" />
  <QrCode class="qr" :value="`spool:${row.id}`" size="16mm" />
</template>

<style>
.label { font-family: system-ui, sans-serif; padding: 3mm; position: relative; color: #000 }
.title { font-size: 13pt; font-weight: 700; padding-right: 18mm; line-height: 1.1 }
.material { font-size: 9pt; color: #333; margin-top: 1mm }
.temps { margin-top: 2mm; font-size: 9pt; display: grid; gap: 0.5mm }
.left { position: absolute; left: 3mm; bottom: 3mm; font-size: 10pt; font-weight: 600 }
.badge { position: absolute; right: 3mm; bottom: 3mm; font-size: 7pt; border: 1px solid #000; padding: 0.5mm 1mm; border-radius: 1mm }
.qr { position: absolute; right: 3mm; top: 3mm }
</style>
