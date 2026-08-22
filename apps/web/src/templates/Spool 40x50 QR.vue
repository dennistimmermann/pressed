<meta>
{ "name": "Spool 40×50 QR", "size": { "width": 40, "height": 50 },
  "description": "Filament spool, portrait: a big QR of the spool id, the name and vendor, and a ruled footer with material and temperatures. Reads flat CSV headers (id, name, vendor, material, settings_extruder_temp, settings_bed_temp)." }
</meta>

<template>
  <QrCode :value="`spool:${row.id}`" size="24.5mm" />
  <div class="name">{{ row.name ?? '–' }}</div>
  <div class="vendor">{{ row.vendor ?? '–' }}</div>
  <div class="spacer" />
  <div class="foot">
    <span><b>MAT</b> {{ row.material ?? '–' }}</span>
    <span><b>NOZ</b> {{ row.settings_extruder_temp ?? '–' }}°</span>
    <span><b>BED</b> {{ row.settings_bed_temp ?? '–' }}°</span>
  </div>
</template>

<style>
.label {
  --sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;
  align-items: center;
  padding: 1.9mm 2mm 1.75mm;
  font-family: var(--sans);
  color: #000;
}

.name { margin-top: 1.6mm; font-size: 9.5pt; font-weight: 700; text-align: center; line-height: 1.1 }
.vendor {
  margin-top: 0.6mm;
  font-size: 4.25pt;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #333;
}
.spacer { flex: 1 }

.foot {
  width: 100%;
  flex-direction: row;
  justify-content: space-between;
  border-top: 0.25mm solid #000;
  padding-top: 1.4mm;
  font-family: var(--mono);
  font-size: 5.3pt;
}
.foot b { font-size: 3.5pt }
</style>
