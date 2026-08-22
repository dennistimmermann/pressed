<meta>
{ "name": "Spool 50×30", "size": { "width": 50, "height": 30 },
  "description": "Filament spool, landscape: a full-height colour bar in the filament's own colour, the name, the vendor and a nozzle/bed block. Reads flat CSV headers (name, vendor, material, color_hex, settings_extruder_temp, settings_bed_temp)." }
</meta>

<template>
  <div class="bar" :style="{ background: '#' + (row.color_hex ?? '000000') }" />
  <div class="body">
    <div class="name">{{ row.name ?? '–' }}</div>
    <div class="vendor">{{ row.vendor ?? '–' }}</div>
    <div class="spacer" />
    <div class="foot">
      <div class="chip">{{ row.material ?? '–' }}</div>
      <div class="temps">
        <div>NOZ {{ row.settings_extruder_temp ?? '–' }}°</div>
        <div>BED {{ row.settings_bed_temp ?? '–' }}°</div>
      </div>
    </div>
  </div>
</template>

<style>
.label {
  --sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;
  flex-direction: row;
  font-family: var(--sans);
  color: #000;
}

/* Full bleed, full height — the one thing on the label that is not black on white. */
.bar { width: 6mm; flex-shrink: 0 }

.body { flex: 1; padding: 1.6mm 2mm 1.5mm }
.name { font-size: 13pt; font-weight: 700; line-height: 1.02; letter-spacing: -0.01em }
.vendor {
  margin-top: 0.75mm;
  font-size: 5pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #333;
}
.spacer { flex: 1 }

.foot { flex-direction: row; align-items: flex-end; justify-content: space-between }
.chip {
  border: 0.3mm solid #000;
  border-radius: 0.9mm;
  padding: 0.6mm 1.75mm;
  font-size: 6.75pt;
  font-weight: 700;
}
.temps { font-family: var(--mono); font-size: 5.7pt; line-height: 1.45; text-align: right }
</style>
