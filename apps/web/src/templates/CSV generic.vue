<meta>
{ "name": "CSV generic", "size": { "width": 50, "height": 30 }, "gap": 2,
  "description": "Two columns of a CSV plus a barcode. Rename row.name / row.code to your headers." }
</meta>

<template>
  <div class="title">{{ row.name }}</div>
  <div class="sub">{{ row.code }}</div>
  <Barcode class="bc" :value="String(row.code ?? '')" height="8mm" />
</template>

<style>
.label { font-family: system-ui, sans-serif; padding: 2.5mm; color: #000 }
.title { font-size: 12pt; font-weight: 700; line-height: 1.1 }
.sub { font-size: 9pt; font-family: ui-monospace, monospace; margin-top: 0.5mm }
.bc { display: block; margin-top: 2mm; width: 100% }
</style>
