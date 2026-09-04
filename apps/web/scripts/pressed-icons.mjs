// The Pressed icon set, drawn from geometry: `node scripts/pressed-icons.mjs` writes src/icons/pressed.ts
// and a preview.html (path printed) showing every icon at 96/48/24/16. Rules and recipes: docs/icons-pressed.md.
// Tabler grid: 24 × 24; line = stroke 2, round caps/joins, no fill; fill = currentColor, holes by even-odd.
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const f = (n) => +n.toFixed(2)
const u = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
const at = (c, r, deg) => [f(c[0] + r * u(deg)[0]), f(c[1] + r * u(deg)[1])]
const polar = (r, deg) => at([12, 12], r, deg)
const p = (pt) => pt.join(' ')
const poly = (pts) => 'M' + pts.map(p).join('L') + 'z'
const ngon = (n, r, start) => poly(Array.from({ length: n }, (_, i) => polar(r, start + (360 / n) * i)))
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`
// A bar of half-width w from radius r1 to r2 along angle a — the pozidriv ticks, the tri-wing arms.
const bar = (a, r1, r2, w) => poly([at(polar(r1, a), w, a - 90), at(polar(r2, a), w, a - 90), at(polar(r2, a), w, a + 90), at(polar(r1, a), w, a + 90)])

// Hexalobular: a six-point star, valleys at r3 and each tip rounded with a quadratic through r5.9.
const torx = (() => {
  const d = []
  for (let i = 0; i < 6; i++) {
    const a = -90 + 60 * i
    d.push(`${i ? 'L' : 'M'}${p(polar(3, a - 30))}L${p(polar(5.2, a - 9))}Q${p(polar(5.9, a))} ${p(polar(5.2, a + 9))}`)
  }
  return d.join('') + 'z'
})()
// The Y of a tri-wing as one polygon: arm ends, then the inner corner on the bisector.
const triWing = (L, w) => poly([-90, 30, 150].flatMap((a) => [at(polar(L, a), w, a - 90), at(polar(L, a), w, a + 90), polar(w / Math.sin(Math.PI / 3), a + 60)]))

// ── Drives, top view ───────────────────────────────────────────────────────────────────────────
// Outline: a ring r9 with the recess inside r5. Filled: a disc r10 with the recess cut out.
const RING = 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0'
const DISC = 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0'
const CROSS = 'M12 7.5v9M7.5 12h9'
const CROSS_F = 'M10.75 6h2.5v4.75H18v2.5h-4.75V18h-2.5v-4.75H6v-2.5h4.75z'
const DOT = 'M12 12v.01'
const DOT_F = 'M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0'
const dot = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
const hexSocket = ngon(6, 4.6, 0)
const ticks = (r1, r2, w) => [45, 135, 225, 315].map((a) => bar(a, r1, r2, w)).join('')

const drives = [
  ['slotted', 'Slotted', 'M7.5 12h9', rect(6, 10.75, 12, 2.5)],
  ['phillips', 'Phillips', CROSS, CROSS_F],
  ['pozidriv', 'Pozidriv', 'M12 8v8M8 12h8M15.2 15.2l.9 .9M8.8 15.2l-.9 .9M8.8 8.8l-.9 -.9M15.2 8.8l.9 -.9', CROSS_F + ticks(3.8, 6.2, 0.7)],
  ['jis', 'JIS', CROSS + 'M9 15v.01', CROSS_F + dot(8.5, 15.5, 1)],
  ['robertson', 'Robertson', rect(8.5, 8.5, 7, 7), rect(8.5, 8.5, 7, 7)],
  ['hex', 'Hex socket', hexSocket, ngon(6, 5, 0)],
  ['hex-pin', 'Hex, pin', hexSocket + DOT, ngon(6, 5, 0) + DOT_F],
  ['torx', 'Torx', torx, torx],
  ['torx-pin', 'Torx, pin', torx + DOT, torx + DOT_F],
  ['spanner', 'Spanner', 'M8.5 12v.01M15.5 12v.01', dot(8.5, 12, 1.5) + dot(15.5, 12, 1.5)],
  ['tri-wing', 'Tri-wing', 'M12 12v-5M12 12l-4.33 2.5M12 12l4.33 2.5', triWing(5.5, 1.2)],
  ['triangle', 'Triangle', ngon(3, 4.8, -90), ngon(3, 5.2, -90)],
].flatMap(([id, label, outline, filled]) => [
  { name: `drive-${id}`, label, body: RING + outline },
  { name: `drive-${id}-filled`, label, body: DISC + filled, filled: true },
])

// ── Heads, side view ───────────────────────────────────────────────────────────────────────────
// Every head sits on the same straight 6-wide shank (x 9…15); no thread. `-wood` ends in a point,
// `-machine` ends flat. Line: the head contour is open at the bottom, the shank hangs off it. Fill: one
// silhouette — the head's top contour runs left-bottom → right-bottom, then the shank closes the shape.
const SHANK = { wood: 'M9 9v9l3 3l3 -3V9', machine: 'M9 9v12h6V9' }
const tail = { wood: (xl) => `H15v9l-3 4l-3 -4V9H${xl}z`, machine: (xl) => `H15v13H9V9H${xl}z` }
const heads = [
  ['cap', 'Cap', 'M7 9V5a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4', (t) => 'M7 9V4a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v5' + t(7)],
  ['cheese', 'Cheese', 'M6 9V4h12v5', (t) => 'M6 9V3h12v6' + t(6)],
  ['button', 'Button', 'M5 9a8.5 8.5 0 0 1 14 0', (t) => 'M5 9a7.5 7.5 0 0 1 14 0' + t(5)],
  ['pan', 'Pan', 'M5 9V6a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v3', (t) => 'M5 9V5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v4' + t(5)],
  ['countersunk', 'Countersunk', 'M9 9l-4 -5h14l-4 5', (t) => 'M9 9L5 4h14l-4 5' + t(9)],
  ['oval', 'Oval', 'M9 9l-4 -5a10 10 0 0 1 14 0l-4 5', (t) => 'M9 9L5 5a11 11 0 0 1 14 0l-4 4' + t(9)],
  ['hex', 'Hex', 'M5 9V4h14v5M12 4v5', (t) => 'M5 9V5l1 -1h12l1 1v4' + t(5)],
  ['flange', 'Hex flange', 'M8 9V3h8v6M12 3v6M4 9h16', (t) => 'M4 9V7.5h4V3h8v4.5h4V9' + t(4)],
  // Headless (grub): the shank alone, a flat top where the head would be.
  ['headless', 'Headless', 'M9 9V5h6v4', (t) => 'M9 3h6v6' + t(9)],
].flatMap(([id, label, outline, filled]) =>
  ['wood', 'machine'].flatMap((end) => [
    { name: `head-${id}-${end}`, label: `${label}, ${end}`, body: outline + SHANK[end] },
    { name: `head-${id}-${end}-filled`, label: `${label}, ${end}`, body: filled(tail[end]), filled: true },
  ]),
)

const OUTLINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const FILLED = 'fill="currentColor" fill-rule="evenodd"'
const svg = (icon, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${icon.filled ? FILLED : OUTLINE}><path d="${icon.body}"/></svg>`

// ── Output ─────────────────────────────────────────────────────────────────────────────────────
const row = (i) => `  ${i.filled ? 'fill' : 'line'}('${i.name}', '${i.body}'),`
writeFileSync(new URL('../src/icons/pressed.ts', import.meta.url), `import type { Icon, IconSet } from './types'

/**
 * Ours, hand-drawn: the marks a *label* needs and a general icon set does not draw. Same 24 grid as
 * Tabler, every shape in both of Tabler's dialects — \`line\` (2px round stroke, no fill) and
 * \`fill\` (one silhouette in currentColor, holes by even-odd). Bodies are already in sanitised
 * form: one \`<path>\`.
 *
 * GENERATED by scripts/pressed-icons.mjs — edit the geometry there, not here. docs/icons-pressed.md.
 */
const line = (name: string, d: string): Icon => ({
  name,
  viewBox: '0 0 24 24',
  body: \`<path ${OUTLINE} d="\${d}"/>\`,
})
const fill = (name: string, d: string): Icon => ({
  name,
  viewBox: '0 0 24 24',
  body: \`<path ${FILLED} d="\${d}"/>\`,
})

/** Screw drives, seen from above: the head is a ring (line) or a disc (fill), the recess inside r5. */
const DRIVES: Icon[] = [
${drives.map(row).join('\n')}
]

/** Screw heads, seen from the side: the head's silhouette above y 9 on the same 6-wide shank, pointed (wood) or flat (machine). */
const HEADS: Icon[] = [
${heads.map(row).join('\n')}
]

const PRESSED: Icon[] = [...DRIVES, ...HEADS]

export const pressed: IconSet = { id: 'pressed', label: 'Pressed', load: async () => PRESSED }
`)

const cell = (i) => `<div class="c"><div class="row">${[96, 48, 24, 16].map((s) => svg(i, s)).join('')}</div><span>${i.name}</span></div>`
const preview = join(tmpdir(), 'pressed-icons.html')
writeFileSync(
  preview,
  `<style>body{background:#f6f5f3;color:#33302c;font:12px ui-monospace;margin:24px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}.c{background:#fff;border:1px solid #e3e2df;padding:12px}.row{display:flex;align-items:flex-end;gap:16px}h2{font:600 12px system-ui;text-transform:uppercase;letter-spacing:.07em}</style>
<h2>Drives</h2><div class="g">${drives.map(cell).join('')}</div>
<h2>Heads</h2><div class="g">${heads.map(cell).join('')}</div>`,
)
console.log(`${drives.length + heads.length} icons → src/icons/pressed.ts · preview: ${preview}`)

// For a sheet or a design canvas built from the same geometry.
export { drives, heads, svg }
