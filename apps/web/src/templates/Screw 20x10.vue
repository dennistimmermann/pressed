<meta>
{ "name": "Screw 20×10", "size": { "width": 20, "height": 10 },
  "description": "Tiny drawer label for fasteners: no rules at all — thread × length fills the left, head and drive stack right-aligned. Reads flat CSV headers (size, length_mm, head, drive)." }
</meta>

<template>
  <div class="size">{{ row.size ?? 'M–' }}×{{ row.length_mm ?? '–' }}</div>
  <div class="spec">
    <span>{{ row.head ?? '–' }}</span>
    <span>{{ row.drive ?? '–' }}</span>
  </div>
</template>

<style>
/* Everything on this label is a machine value, so the whole thing is mono — and type does
   all the work: no plate, no column rules, no dividers. */
.label {
  flex-direction: row;
  align-items: center;
  gap: 1.25mm;
  padding: 0.75mm 1.25mm;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  color: #000;
}

.size { flex: 1; font-size: 11pt; font-weight: 700; letter-spacing: -0.02em }

.spec {
  align-items: flex-end;
  gap: 0.25mm;
  font-size: 4.6pt;
  font-weight: 600;
  text-transform: uppercase;
}
</style>
