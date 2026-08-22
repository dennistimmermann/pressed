<meta>
{ "name": "Spool 40×15 barcode", "size": { "width": 40, "height": 15 },
  "description": "Narrow spool strip: a Code 128 of the lot number across the full width, with the name and the lot number underneath. Reads flat CSV headers (name, lot_nr, id)." }
</meta>

<template>
  <Barcode :value="String(row.lot_nr ?? row.id ?? '')" height="10mm" />
  <div class="cap">
    <span>{{ row.name ?? '–' }}</span>
    <span>{{ row.lot_nr ?? row.id }}</span>
  </div>
</template>

<style>
.label {
  justify-content: space-between;
  padding: 1.25mm 1.75mm 1mm;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  color: #000;
}

.cap { flex-direction: row; justify-content: space-between; font-size: 4pt }
</style>
