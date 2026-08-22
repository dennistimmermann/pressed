<meta>
{ "name": "Grocery 40×30", "size": { "width": 40, "height": 30 },
  "description": "Pantry jar label: a double rule, a serif name and a mono line of weight and dates. Reads flat CSV headers (name, weight, packed, use_by)." }
</meta>

<template>
  <div class="frame">
    <div class="inner" />
    <div class="eyebrow">· Pantry ·</div>
    <div class="middle">
      <div class="name">{{ row.name ?? '–' }}</div>
    </div>
    <div class="rule" />
    <div class="foot">
      {{ row.weight ?? '–' }} · packed {{ row.packed ?? '–' }} · use by {{ String(row.use_by ?? '').slice(5) }}
    </div>
  </div>
</template>

<style>
.label {
  --sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, monospace;
  padding: 1.75mm;
  font-family: var(--sans);
  color: #000;
}

.frame {
  flex: 1;
  position: relative;
  align-items: center;
  border: 0.2mm solid #000;
  padding: 1.75mm 2mm 1.5mm;
}
/* The second, inset rule of the double border. */
.inner { position: absolute; top: 0.5mm; right: 0.5mm; bottom: 0.5mm; left: 0.5mm; border: 0.15mm solid #000 }

.eyebrow { font-size: 3.5pt; letter-spacing: 0.28em; text-transform: uppercase }

.middle { flex: 1; align-self: stretch; justify-content: center }
.name {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 10.5pt;
  font-style: italic;
  text-align: center;
  line-height: 1.1;
}

.rule { width: 70%; border-top: 0.15mm dashed #000 }

.foot { margin-top: 1.1mm; font-family: var(--mono); font-size: 3.6pt; white-space: nowrap }
</style>
