<!--
  The Inspector's STYLE grid (SPEC §4.3, DESIGN "STYLE section"): one rule as typed controls —
  Layout · Size · Space · Type · Colour · Border · Effects, each a 9px eyebrow with a hairline
  over a 3-column grid of 25px fields — then `all properties…` for every declaration as written.

  Presentational only: it reads a parsed rule and emits what the user asked for; the Inspector
  turns that into one text edit (and creates the rule first when the pill has none yet). Rows
  that write several declarations at once (B/I/U) emit them together, so they are one ⌘Z.

  Conditional rows: the flex controls only when `display` is flex/grid, the offsets only
  when `position` ≠ static, the four `border` sides only when `per side` is open.

  padding · margin · radius are the one stateful corner: an arity toggle over a 2×2 of sides,
  writing the shorthand and only the shorthand. The toggle's history of the other arities lives
  here, so the pane is mounted with a `:key` on the pill — a different rule starts over.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { expandSides, impliedArity, regroup, SIDE_GROUPS, splitSides, type Declaration, type Rule } from './css'
import type { Marker } from './editor-handle'
import Msgs from './Msgs.vue'
import StyleField from './StyleField.vue'
import StyleSeg, { type Segment } from './StyleSeg.vue'
import { Labeled } from '@/ui'
import { hasError, msgsBy } from './inspector/markers'

const props = defineProps<{
  rule: Rule | null
  /** Diagnostics inside the rule — each declaration shows the ones on its own range. */
  markers?: Marker[]
  /** What is in force without this rule saying so (`div` → flex / column): shown muted. For the
   *  enumerated properties this is what the renderer computed; the rest is the base stylesheet. */
  inherited?: Record<string, string>
}>()
const emit = defineEmits<{
  /** Set (`value`) or remove (`null`) declarations — a list, applied as one undoable edit. */
  set: [changes: { prop: string; value: string | null }[]]
  /** `all properties…`: rename the property of a declaration in place. */
  'rename-prop': [d: Declaration, prop: string]
}>()

const get = (prop: string) => props.rule?.declarations.find((d) => d.prop === prop)?.value
const inh = (prop: string) => props.inherited?.[prop]
/** What is in force: the rule's own declaration, else the base stylesheet's. */
const eff = (prop: string) => get(prop) ?? inh(prop)
const set = (prop: string, value: string | null) => emit('set', [{ prop, value: value === '' ? null : value }])

/** A declaration's own diagnostics, under the control that writes it. `''` = in the rule but in
 *  no declaration (a stray token, the selector): those go under `all properties…`. */
const byDecl = computed(() =>
  msgsBy(props.markers ?? [], (props.rule?.declarations ?? []).map((d) => ({ key: d.prop, loc: d }))),
)
const msgs = (...keys: string[]) => keys.flatMap((k) => byDecl.value[k] ?? [])

// ---- units ----------------------------------------------------------------
const LEN = ['mm', 'pt', 'px', '%', 'em']
const SIZE = ['pt', 'mm', 'px', 'em', '%']

// ---- segmented controls ---------------------------------------------------
/** The design's line icons, as the inside of a 16×16 `viewBox` (stroked, never filled). */
const I = {
  block: '<rect x="2" y="3" width="12" height="4"/><rect x="2" y="9" width="12" height="4"/>',
  flex: '<rect x="2" y="3" width="3.5" height="10"/><rect x="6.5" y="3" width="3.5" height="10"/><rect x="11" y="3" width="3" height="10"/>',
  grid: '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>',
  inline: '<path d="M2 8h12M5 5h6M5 11h6"/>',
  none: '<path d="M3 3l10 10M13 3L3 13"/>',
  row: '<path d="M2 8h11M9 4l4 4-4 4"/>',
  column: '<path d="M8 2v11M4 9l4 4 4-4"/>',
  jStart: '<path d="M2 2v12M5 5h7v2H5zM5 9h4v2H5z"/>',
  jCenter: '<path d="M8 2v12M4 5h8v2H4zM5 9h6v2H5z"/>',
  jEnd: '<path d="M14 2v12M4 5h7v2H4zM7 9h4v2H7z"/>',
  jBetween: '<path d="M2 2v12M14 2v12M4 6h3v4H4zM9 6h3v4H9z"/>',
  aStart: '<path d="M2 2h12M5 5h2v6H5zM9 5h2v4H9z"/>',
  aCenter: '<path d="M2 8h12M5 4h2v8H5zM9 5h2v6H9z"/>',
  aEnd: '<path d="M2 14h12M5 5h2v6H5zM9 7h2v4H9z"/>',
  aStretch: '<path d="M2 2h12M2 14h12M5 4h2v8H5zM9 4h2v8H9z"/>',
  tLeft: '<path d="M2 4h12M2 8h8M2 12h10"/>',
  tCenter: '<path d="M2 4h12M4 8h8M3 12h10"/>',
  tRight: '<path d="M2 4h12M6 8h8M4 12h10"/>',
  tJustify: '<path d="M2 4h12M2 8h12M2 12h12"/>',
}

const CHOICES: Record<string, Segment[]> = {
  display: [
    { value: 'flex', icon: I.flex }, { value: 'grid', icon: I.grid }, { value: 'block', icon: I.block },
    { value: 'inline', icon: I.inline }, { value: 'none', icon: I.none },
  ],
  'flex-direction': [{ value: 'row', icon: I.row }, { value: 'column', icon: I.column }],
  'justify-content': [
    { value: 'flex-start', icon: I.jStart, title: 'start' }, { value: 'center', icon: I.jCenter },
    { value: 'flex-end', icon: I.jEnd, title: 'end' }, { value: 'space-between', icon: I.jBetween, title: 'space between' },
  ],
  'align-items': [
    { value: 'flex-start', icon: I.aStart, title: 'start' }, { value: 'center', icon: I.aCenter },
    { value: 'flex-end', icon: I.aEnd, title: 'end' }, { value: 'stretch', icon: I.aStretch },
  ],
  'flex-wrap': [{ value: 'nowrap', label: 'no' }, { value: 'wrap', label: 'wrap' }],
  'text-align': [
    { value: 'left', icon: I.tLeft }, { value: 'center', icon: I.tCenter },
    { value: 'right', icon: I.tRight }, { value: 'justify', icon: I.tJustify },
  ],
  'text-transform': [
    { value: 'none', label: '–' }, { value: 'uppercase', label: 'AA' },
    { value: 'lowercase', label: 'aa' }, { value: 'capitalize', label: 'Aa' },
  ],
  overflow: [{ value: 'visible', label: 'show' }, { value: 'hidden', label: 'clip' }],
}

/** `on` = written in this rule, `muted` = in effect but written elsewhere. */
const seg = (prop: string) =>
  CHOICES[prop].map((c) => ({ ...c, on: get(prop) === c.value, muted: !get(prop) && inh(prop) === c.value }))
/** Clicking the segment that is already written removes the declaration; a muted one writes it. */
const pick = (prop: string, value: string) => set(prop, get(prop) === value ? null : value)

// B / I / U: three independent declarations sharing one trough.
const bold = computed(() => Number(get('font-weight')) >= 600)
const italic = computed(() => get('font-style') === 'italic')
const underline = computed(() => get('text-decoration') === 'underline')
const styleSeg = computed<Segment[]>(() => [
  { value: 'b', label: 'B', title: 'bold', on: bold.value, muted: !get('font-weight') && Number(inh('font-weight')) >= 600 },
  { value: 'i', label: 'I', title: 'italic', on: italic.value, muted: !get('font-style') && inh('font-style') === 'italic' },
  { value: 'u', label: 'U', title: 'underline', on: underline.value, muted: !get('text-decoration') && inh('text-decoration') === 'underline' },
])
function pickStyle(which: string) {
  if (which === 'b') set('font-weight', bold.value ? null : '600')
  else if (which === 'i') set('font-style', italic.value ? null : 'italic')
  else set('text-decoration', underline.value ? null : 'underline')
}

// ---- conditional rows -----------------------------------------------------
const isFlex = computed(() => ['flex', 'grid', 'inline-flex'].includes(eff('display') ?? ''))
const positioned = computed(() => (get('position') ?? 'static') !== 'static')

// ---- the four-sides widgets (padding · margin · radius) -------------------
/** Which side a field is: the box, with that edge (or corner) at 2px. Order is always T·R·B·L. */
const BOX = '<rect x="1.5" y="1.5" width="9" height="9"/>'
const EDGE = [
  `${BOX}<path d="M1.5 1.5h9" stroke-width="2"/>`,
  `${BOX}<path d="M10.5 1.5v9" stroke-width="2"/>`,
  `${BOX}<path d="M1.5 10.5h9" stroke-width="2"/>`,
  `${BOX}<path d="M1.5 1.5v9" stroke-width="2"/>`,
]
const CORNER = [
  `${BOX}<path d="M1.5 5V1.5H5" stroke-width="2"/>`,
  `${BOX}<path d="M7 1.5h3.5V5" stroke-width="2"/>`,
  `${BOX}<path d="M10.5 7v3.5H7" stroke-width="2"/>`,
  `${BOX}<path d="M5 10.5H1.5V7" stroke-width="2"/>`,
]

/** `whole`: the shorthand is not split per side — every side of `border` gets all of it. */
type Sides = { prop: string; label: string; sides: string[]; icons: string[]; whole?: boolean }
const SIDES: Record<string, Sides> = {
  padding: { prop: 'padding', label: 'padding', sides: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], icons: EDGE },
  margin: { prop: 'margin', label: 'margin', sides: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], icons: EDGE },
  radius: {
    prop: 'border-radius', label: 'radius', icons: CORNER,
    sides: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  },
  border: {
    prop: 'border', label: 'border', icons: EDGE, whole: true,
    sides: ['border-top', 'border-right', 'border-bottom', 'border-left'],
  },
}
/**
 * Shorthand and sides coexist, exactly as in CSS: `padding: 3mm; padding-left: 10mm` is a legal
 * rule and both declarations stay. So the button beside the shorthand is a plain disclosure —
 * it shows the side row, it never rewrites anything. Open is remembered per property; until the
 * user says otherwise a row opens itself when one of its sides is written.
 */
const opened = ref<Record<string, boolean>>({})
const isOpen = (s: Sides) => opened.value[s.prop] ?? s.sides.some((p) => get(p))
const toggleSides = (s: Sides) => (opened.value[s.prop] = !isOpen(s))
/** Editing a side pins its row open — unsetting the last one must not close the row under you. */
const setSide = (s: Sides, prop: string, value: string | null) => {
  opened.value[s.prop] = true
  set(prop, value)
}
/** What a side without a declaration of its own gets from the shorthand — greyed, not written. */
const fromShorthand = (s: Sides, i: number) =>
  get(s.sides[i]) ? undefined : s.whole ? get(s.prop) : expandSides(get(s.prop))?.[i]

// ---- padding · margin · radius: the arity toggle over a 2×2 ---------------
/**
 * One shorthand, four fields. The toggle says how many values the shorthand is written with
 * (1–4); the fields that share a value are marked alike, and only the first of each group —
 * first in the grid, so the pair you can see — is editable. Everything writes the shorthand
 * and nothing but the shorthand, so a whole box is always one declaration and one ⌘Z.
 *
 * The toggle icons (16×16): the box, with the links it makes drawn faint over it — a crosshair
 * for sides, the diagonals for corners.
 */
const RING = '<path d="M5.2 3h5.6M5.2 13h5.6M3 5.2v5.6M13 5.2v5.6"/>'
const ROUND = '<path d="M3 6V6a3 3 0 0 1 3-3M10 3a3 3 0 0 1 3 3M13 10a3 3 0 0 1-3 3M6 13a3 3 0 0 1-3-3"/>'
const ARITY_SPACE = [
  '<rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M8 3.9v8.2M3.9 8h8.2" stroke-opacity=".4"/>',
  `${RING}<path d="M8 3.9v8.2M3.9 8h8.2" stroke-opacity=".4"/>`,
  `${RING}<path d="M3.9 8h8.2" stroke-opacity=".4"/>`,
  RING,
]
const ARITY_RADIUS = [
  '<rect x="3" y="3" width="10" height="10" rx="3.5"/><path d="M5.4 5.4l5.2 5.2M10.6 5.4L5.4 10.6" stroke-opacity=".4"/>',
  `${ROUND}<path d="M5.4 5.4l5.2 5.2M10.6 5.4L5.4 10.6" stroke-opacity=".4"/>`,
  `${ROUND}<path d="M10.6 5.4L5.4 10.6" stroke-opacity=".4"/>`,
  ROUND,
]

/** `order`: the four grid cells (T,L / B,R · TL,TR / BL,BR) as CSS-order indices. */
type Box = { key: string; prop: string; label: string; order: number[]; icons: string[]; sides: string[]; names: string[]; toggle: string[]; titles: string[] }
const SIDE_TITLES = ['1 value — all sides', '2 values — top+bottom · left+right', '3 values — top · left+right · bottom', '4 values — each side']
const CORNER_TITLES = ['1 value — all corners', '2 values — the two diagonals', '3 values — top left · the anti-diagonal · bottom right', '4 values — each corner']
const SHORTHAND: Record<string, Box> = {
  padding: {
    key: 'padding', prop: 'padding', label: 'padding', order: [0, 3, 2, 1], icons: EDGE,
    sides: SIDES.padding.sides, names: ['top', 'right', 'bottom', 'left'], toggle: ARITY_SPACE, titles: SIDE_TITLES,
  },
  margin: {
    key: 'margin', prop: 'margin', label: 'margin', order: [0, 3, 2, 1], icons: EDGE,
    sides: SIDES.margin.sides, names: ['top', 'right', 'bottom', 'left'], toggle: ARITY_SPACE, titles: SIDE_TITLES,
  },
  radius: {
    key: 'radius', prop: 'border-radius', label: 'radius', order: [0, 1, 3, 2], icons: CORNER,
    sides: SIDES.radius.sides, names: ['top left', 'top right', 'bottom right', 'bottom left'],
    toggle: ARITY_RADIUS, titles: CORNER_TITLES,
  },
}
const BOXES = [SHORTHAND.padding, SHORTHAND.margin, SHORTHAND.radius]
const MARKS = ['filled', 'unfilled', 'hatch'] as const

/** Hand-written longhands (`padding-top: 3mm`) win: the grid then edits them, as it used to. */
const longhand = (b: Box) => b.sides.some((p) => get(p))
/** A shorthand that cannot be split (`calc()`, `var()`, five tokens) is edited as one text field —
 *  the only state with nothing to toggle. */
const raw = (b: Box) => get(b.prop) != null && !splitSides(get(b.prop))
/** What the four sides are in force: own longhand, else the shorthand's share, else the base, else 0. */
const effective = (b: Box) => {
  const short = expandSides(get(b.prop))
  const base = expandSides(inh(b.prop))
  return b.sides.map((p, i) => get(p) ?? short?.[i] ?? base?.[i] ?? '0')
}

/**
 * The toggle always says something. A shorthand states its arity outright; anything else — an
 * unset property, sides written as longhands — has one *implied*, shown muted like a value that
 * comes from the base stylesheet. Unset implies 4 (four free fields, nothing paired yet); on
 * longhands it is the shortest shorthand that would say the same thing. Until the property is
 * written the toggle only parks an arity — the layout, with no edit.
 */
const pending = ref<Record<string, number>>({})
const arity = (b: Box) =>
  splitSides(get(b.prop))?.length ?? (longhand(b) ? impliedArity(effective(b)) : pending.value[b.key] ?? 4)
const explicit = (b: Box) => !raw(b) && !!(splitSides(get(b.prop)) || (!longhand(b) && pending.value[b.key]))
const aritySeg = (b: Box): Segment[] =>
  b.toggle.map((icon, i) => ({
    value: String(i + 1), icon, title: b.titles[i],
    on: explicit(b) && arity(b) === i + 1,
    muted: !raw(b) && !explicit(b) && arity(b) === i + 1,
  }))

/** The four fields in grid order: what each shows, which one of a group is the editable one. */
function cells(b: Box) {
  const lh = longhand(b)
  const n = arity(b)
  const groups = SIDE_GROUPS[n]
  const short = expandSides(get(b.prop))
  const base = expandSides(inh(b.prop))
  return b.order.map((i, pos) => {
    const group = groups.findIndex((g) => g.includes(i))
    const leader = b.order.find((j) => groups[group].includes(j))
    // While a leader is being typed into, the whole group — the leader itself included — shows
    // the draft: re-rendering on each keystroke would otherwise reset the input to the old value.
    const draft = drafts.value[b.key]
    const mirrored = !lh && draft && draft.group === group ? draft.text : undefined
    const value = mirrored ?? (lh ? get(b.sides[i]) : short?.[i])
    // Longhands are four separate declarations: the marks say which agree, but each is its own.
    const driven = !lh && leader !== i
    return {
      group, prop: b.sides[i], icon: b.icons[i], value,
      disabled: driven,
      inherited: value ? undefined : (lh ? short?.[i] : undefined) ?? base?.[i],
      from: driven ? `${b.names[leader!]} — ${n} values` : lh ? b.prop : undefined,
      mark: n === 4 ? undefined : MARKS[group],
      // The shorthand's diagnostics belong to the whole box: they go under its first field.
      markers: lh ? msgs(b.sides[i]) : pos === 0 ? msgs(b.prop) : undefined,
    }
  })
}

/**
 * Toggling keeps what the other arities held, so switching back restores them instead of
 * recomputing. Editing a value makes that history a lie, and so does an edit in the code —
 * `written` is what we last wrote, and anything else in the source means somebody else did it.
 */
/** What is being typed into a leader right now, mirrored into its driven twins live. */
const drafts = ref<Record<string, { group: number; text: string } | null>>({})
const history = ref<Record<string, Record<number, string>>>({})
const written = ref<Record<string, string | undefined>>({})
watch(
  () => BOXES.map((b) => get(b.prop) ?? '').join('|'),
  () => {
    for (const b of BOXES) {
      if (get(b.prop) === written.value[b.key]) continue
      delete history.value[b.key]
      delete written.value[b.key]
    }
  },
)

function write(b: Box, value: string | null, also: { prop: string; value: string | null }[] = []) {
  drafts.value[b.key] = null
  written.value[b.key] = value ?? undefined
  emit('set', [...also, { prop: b.prop, value: value === '' ? null : value }])
}
/** A field edit: that group's token, in a shorthand at the current arity. `×` drops the lot. */
function setCell(b: Box, group: number, value: string | null) {
  delete history.value[b.key]
  if (value === null) return write(b, null)
  const n = arity(b)
  const tokens = splitSides(get(b.prop)) ?? regroup(expandSides(inh(b.prop)) ?? ['0', '0', '0', '0'], n)
  tokens[group] = value
  write(b, tokens.join(' '))
}
/** The toggle: what this arity held before, else the shorthand re-cut to it. */
function setArity(b: Box, n: number) {
  if (raw(b)) return
  const cur = get(b.prop)
  const tokens = splitSides(cur)
  // Sides written as longhands: the click takes them over — the four values in force become one
  // shorthand at the arity asked for, and the longhands go, all in one edit.
  if (longhand(b)) return write(b, regroup(effective(b), n).join(' '), b.sides.map((p) => ({ prop: p, value: null })))
  if (!tokens) return (pending.value[b.key] = n)
  if (tokens.length === n) return
  const kept = (history.value[b.key] ??= {})
  kept[tokens.length] = cur!
  write(b, kept[n] ?? regroup(expandSides(cur)!, n).join(' '))
}
const editCell = (b: Box, c: { prop: string; group: number }, value: string | null) =>
  longhand(b) ? set(c.prop, value) : setCell(b, c.group, value)

// ---- opacity: a slider and a % field, one declaration ---------------------
/** Written as a percentage (the field says `%`); a bare `0.5` still reads back as 50. */
const opacity = computed(() => {
  const v = get('opacity')
  if (v == null) return null
  const n = Number(v.replace('%', ''))
  return Number.isNaN(n) ? null : v.includes('%') ? n : n * 100
})
function setOpacity(v: string | number | null) {
  if (v == null || v === '') return set('opacity', null)
  const n = Number(String(v).replace('%', ''))
  set('opacity', Number.isNaN(n) ? String(v) : `${n}%`)
}

// ---- rotate: the one transform the grid understands ------------------------
const ROTATE = /^rotate\((-?[\d.]+)deg\)$/
const rotate = computed(() => ROTATE.exec(get('transform') ?? '')?.[1])
const setRotate = (v: string | null) =>
  set('transform', v == null ? null : /^-?\d*\.?\d+$/.test(v.replace('°', '')) ? `rotate(${v.replace('°', '')}deg)` : v)

// ---- group `more` toggles --------------------------------------------------
const minmax = ref(false)

// ---- `all properties…`: the rule as written, one row per declaration -------
const all = ref(false)
const value = (e: Event) => (e.target as HTMLInputElement).value
/** Everything the grid above can write — the rest is what `all properties…` is for. */
const GRID_PROPS = new Set([
  'display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'flex-wrap', 'position',
  'top', 'right', 'bottom', 'left', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  ...SIDES.padding.sides, ...SIDES.margin.sides, ...SIDES.radius.sides, 'padding', 'margin', 'border-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'font-style', 'text-decoration', 'color', 'background',
  'border-width', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'opacity', 'overflow', 'transform', 'white-space',
])
const declarations = computed(() => props.rule?.declarations ?? [])
const outside = computed(() => declarations.value.filter((d) => !GRID_PROPS.has(d.prop)).length)
</script>

<template>
  <div class="pane">
    <!-- ── Layout ─────────────────────────────────────────────────────── -->
    <div class="gname"><span>Layout</span><span class="rule" /></div>
    <StyleSeg id="css-msg-display" label="display" :choices="seg('display')" :markers="msgs('display')" @pick="pick('display', $event)" />
    <div v-if="isFlex" class="grid3">
      <StyleSeg id="css-msg-flex-direction" label="direction" :choices="seg('flex-direction')" :markers="msgs('flex-direction')" @pick="pick('flex-direction', $event)" />
      <StyleSeg id="css-msg-justify-content" label="justify" :choices="seg('justify-content')" :markers="msgs('justify-content')" @pick="pick('justify-content', $event)" />
      <StyleSeg id="css-msg-align-items" label="align" :choices="seg('align-items')" :markers="msgs('align-items')" @pick="pick('align-items', $event)" />
    </div>
    <div class="grid3">
      <StyleField prop="gap" label="gap" :value="get('gap')" :units="LEN" unit="mm" :markers="msgs('gap')" @set="set('gap', $event)" />
      <StyleSeg v-if="isFlex" id="css-msg-flex-wrap" label="wrap" :choices="seg('flex-wrap')" :markers="msgs('flex-wrap')" @pick="pick('flex-wrap', $event)" />
      <StyleField
        prop="position" label="position" kind="select" :value="get('position')" :inherited="inh('position')"
        :options="['static', 'relative', 'absolute']" :markers="msgs('position')" @set="set('position', $event)"
      />
    </div>
    <!-- Only when the element is taken out of the flow: the four offsets, the same 2×2 as
         Space (columns top/bottom · left/right). Four separate properties, so no toggle. -->
    <Labeled v-if="positioned" label="offset" cells>
      <StyleField prop="top" :icon="EDGE[0]" :value="get('top')" :units="LEN" unit="mm" :markers="msgs('top')" @set="set('top', $event)" />
      <StyleField prop="left" :icon="EDGE[3]" :value="get('left')" :units="LEN" unit="mm" :markers="msgs('left')" @set="set('left', $event)" />
      <StyleField prop="bottom" :icon="EDGE[2]" :value="get('bottom')" :units="LEN" unit="mm" :markers="msgs('bottom')" @set="set('bottom', $event)" />
      <StyleField prop="right" :icon="EDGE[1]" :value="get('right')" :units="LEN" unit="mm" :markers="msgs('right')" @set="set('right', $event)" />
    </Labeled>

    <!-- ── Size ───────────────────────────────────────────────────────── -->
    <div class="gname">
      <span>Size</span><span class="rule" />
      <button type="button" class="more" @click="minmax = !minmax">min · max</button>
    </div>
    <div class="grid2">
      <StyleField prop="width" label="width" :value="get('width')" :units="LEN" unit="mm" :markers="msgs('width')" @set="set('width', $event)" />
      <StyleField prop="height" label="height" :value="get('height')" :units="LEN" unit="mm" :markers="msgs('height')" @set="set('height', $event)" />
      <template v-if="minmax">
        <StyleField
          v-for="p in ['min-width', 'max-width', 'min-height', 'max-height']" :key="p" :prop="p"
          :label="p.replace('-', ' ')" :value="get(p)" :units="LEN" unit="mm" :markers="msgs(p)" @set="set(p, $event)"
        />
      </template>
    </div>

    <!-- ── Space ──────────────────────────────────────────────────────── -->
    <div class="gname"><span>Space</span><span class="rule" /></div>
    <!-- One block per shorthand: the arity toggle in the header, the four sides as a 2×2. -->
    <Labeled v-for="b in [SHORTHAND.padding, SHORTHAND.margin]" :key="b.key" :label="b.label" :cells="!raw(b)">
      <template #aside>
        <span class="tog" :class="{ off: raw(b) }" :title="raw(b) ? 'edit as text' : undefined">
          <StyleSeg :id="`css-msg-${b.prop}-arity`" :choices="aritySeg(b)" @pick="setArity(b, Number($event))" />
        </span>
      </template>
      <StyleField v-if="raw(b)" :prop="b.prop" kind="text" :value="get(b.prop)" :markers="msgs(b.prop)" @set="write(b, $event)" />
      <StyleField
        v-for="c in cells(b)" v-else :key="c.prop" :prop="c.prop" :icon="c.icon" :value="c.value"
        :inherited="c.inherited" :from="c.from" :disabled="c.disabled" :mark="c.mark"
        :units="LEN" unit="mm" :markers="c.markers" @set="editCell(b, c, $event)"
        @draft="drafts[b.key] = $event == null ? null : { group: c.group, text: $event }"
      />
    </Labeled>

    <!-- ── Type ───────────────────────────────────────────────────────── -->
    <div class="gname"><span>Type</span><span class="rule" /></div>
    <StyleField
      prop="font-family" label="font" kind="text" :value="get('font-family')"
      :options="['sans-serif', 'serif', 'monospace', '\'IBM Plex Sans\', sans-serif', '\'IBM Plex Mono\', monospace']"
      :markers="msgs('font-family')" @set="set('font-family', $event)"
    />
    <div class="grid3">
      <StyleField prop="font-size" label="size" :value="get('font-size')" :units="SIZE" unit="pt" :markers="msgs('font-size')" @set="set('font-size', $event)" />
      <StyleField
        prop="font-weight" label="weight" kind="select" :value="get('font-weight')" :inherited="inh('font-weight')"
        :options="['300', '400', '500', '600', '700']" :markers="msgs('font-weight')" @set="set('font-weight', $event)"
      />
      <StyleField
        prop="line-height" label="line height" :value="get('line-height')" :units="['', 'em', '%']" unit=""
        :step="0.1" :markers="msgs('line-height')" @set="set('line-height', $event)"
      />
    </div>
    <div class="grid3">
      <StyleField
        prop="letter-spacing" label="letter spacing" :value="get('letter-spacing')" :units="['em', 'mm', 'pt', 'px']"
        unit="em" :step="0.01" :markers="msgs('letter-spacing')" @set="set('letter-spacing', $event)"
      />
      <StyleSeg id="css-msg-text-align" class="span2" label="align" :choices="seg('text-align')" :markers="msgs('text-align')" @pick="pick('text-align', $event)" />
    </div>
    <div class="grid3">
      <StyleSeg id="css-msg-text-transform" class="span2" label="case" :choices="seg('text-transform')" :markers="msgs('text-transform')" @pick="pick('text-transform', $event)" />
      <StyleSeg
        id="css-msg-font-style" label="style" :choices="styleSeg"
        :markers="msgs('font-weight', 'font-style', 'text-decoration')" @pick="pickStyle"
      />
    </div>

    <!-- ── Colour ─────────────────────────────────────────────────────── -->
    <div class="gname"><span>Colour</span><span class="rule" /></div>
    <div class="grid2">
      <StyleField prop="color" label="text" kind="colour" :value="get('color')" :markers="msgs('color')" @set="set('color', $event)" />
      <StyleField prop="background" label="background" kind="colour" :value="get('background')" :markers="msgs('background')" @set="set('background', $event)" />
    </div>

    <!-- ── Border ─────────────────────────────────────────────────────── -->
    <div class="gname">
      <span>Border</span><span class="rule" />
      <button type="button" class="more" :aria-expanded="isOpen(SIDES.border)" @click="toggleSides(SIDES.border)">per side</button>
    </div>
    <div class="grid3">
      <StyleField prop="border-width" label="width" :value="get('border-width')" :units="['px', 'mm', 'pt']" unit="px" :markers="msgs('border-width')" @set="set('border-width', $event)" />
      <StyleField
        prop="border-style" label="style" kind="select" :value="get('border-style')" :inherited="inh('border-style')"
        :options="['solid', 'dashed', 'dotted', 'none']" :markers="msgs('border-style')" @set="set('border-style', $event)"
      />
      <StyleField prop="border-color" label="colour" kind="colour" :value="get('border-color')" :markers="msgs('border-color')" @set="set('border-color', $event)" />
    </div>
    <div v-if="isOpen(SIDES.border)" class="sides">
      <StyleField
        v-for="(p, i) in SIDES.border.sides" :key="p" :prop="p" kind="text" :icon="EDGE[i]" :value="get(p)"
        :inherited="fromShorthand(SIDES.border, i)" from="border" :markers="msgs(p)" @set="setSide(SIDES.border, p, $event)"
      />
    </div>
    <!-- The corners read as the same 2×2, spatially: TL·TR over BL·BR. -->
    <Labeled v-for="b in [SHORTHAND.radius]" :key="b.key" :label="b.label" :cells="!raw(b)">
      <template #aside>
        <span class="tog" :class="{ off: raw(b) }" :title="raw(b) ? 'edit as text' : undefined">
          <StyleSeg :id="`css-msg-${b.prop}-arity`" :choices="aritySeg(b)" @pick="setArity(b, Number($event))" />
        </span>
      </template>
      <StyleField v-if="raw(b)" :prop="b.prop" kind="text" :value="get(b.prop)" :markers="msgs(b.prop)" @set="write(b, $event)" />
      <StyleField
        v-for="c in cells(b)" v-else :key="c.prop" :prop="c.prop" :icon="c.icon" :value="c.value"
        :inherited="c.inherited" :from="c.from" :disabled="c.disabled" :mark="c.mark"
        :units="LEN" unit="mm" :markers="c.markers" @set="editCell(b, c, $event)"
        @draft="drafts[b.key] = $event == null ? null : { group: c.group, text: $event }"
      />
    </Labeled>
    <Labeled label="opacity">
      <div class="slider-row">
        <input
          class="slider" type="range" min="0" max="100" step="1" aria-label="opacity"
          :value="opacity ?? 100" @change="setOpacity(value($event))"
        >
        <StyleField
          class="pct" prop="opacity" :value="opacity == null ? undefined : String(opacity)" :units="['%']"
          unit="%" :markers="msgs('opacity')" @set="setOpacity"
        />
      </div>
    </Labeled>

    <!-- ── Effects ────────────────────────────────────────────────────── -->
    <div class="gname"><span>Effects</span><span class="rule" /></div>
    <div class="grid3">
      <StyleSeg id="css-msg-overflow" label="overflow" :choices="seg('overflow')" :markers="msgs('overflow')" @pick="pick('overflow', $event)" />
      <StyleField prop="transform" label="rotate" :value="rotate" :units="['°']" :markers="msgs('transform')" @set="setRotate($event)" />
      <StyleField
        prop="white-space" label="white space" kind="select" :value="get('white-space')" :inherited="inh('white-space')"
        :options="['normal', 'nowrap', 'pre', 'pre-wrap']" :markers="msgs('white-space')" @set="set('white-space', $event)"
      />
    </div>

    <!-- Every declaration of the rule as it is written — the escape hatch from the typed grid. -->
    <div class="all-row">
      <button type="button" class="more link-text" @click="all = !all">{{ all ? 'fewer properties' : 'all properties…' }}</button>
      <span class="note">{{ declarations.length }} set · {{ outside }} not in the grid</span>
    </div>
    <!-- In the rule but in no declaration — a stray token, a bad selector: nowhere else to put it. -->
    <Msgs :markers="byDecl['']" />
    <template v-if="all">
      <template v-for="d in declarations" :key="d.start">
        <div class="row" :class="{ bad: hasError(msgs(d.prop)) }">
          <input
            class="ctl prop" :value="d.prop" spellcheck="false" aria-label="property"
            @change="emit('rename-prop', d, value($event))"
          >
          <input class="ctl" :value="d.value" spellcheck="false" aria-label="value" @change="set(d.prop, value($event))">
        </div>
        <Msgs :markers="msgs(d.prop)" />
      </template>
      <p v-if="!declarations.length" class="none">nothing set yet</p>
    </template>
  </div>
</template>

<style scoped>
/* DESIGN "STYLE section": groups of a 9px eyebrow with a hairline, over 2/3-column grids of
   25px fields; gaps 7 × 8, radius 6, labels 9px sans muted. */
.pane { display: flex; flex-direction: column; gap: 7px; }
.gname {
  display: flex; align-items: center; gap: 8px; margin-top: 4px;
  font-family: var(--font-sans); font-size: 9px; font-weight: 600; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--muted-foreground-2);
}
.gname:first-child { margin-top: 0; }
.gname .rule { flex: 1; height: 1px; background: var(--hairline); }
.gname .more {
  flex: none; border: 0; background: transparent; padding: 0;
  font-family: var(--font-mono); font-size: 9px; font-weight: 450; letter-spacing: 0;
  text-transform: none; color: var(--meta-foreground);
}
.gname .more:hover { color: var(--accent-link); }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px 8px; align-items: end; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 8px; align-items: end; }
.span2 { grid-column: span 2; }
.sides {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px;
  margin-left: 10px; padding-left: 9px; border-left: 1px solid var(--field-border);
}
/* padding · margin · radius: the label with the arity toggle beside it (the row's `aside`),
   over the 2×2 of sides — column 1 is T/B (TL/BL), column 2 is L/R (TR/BR). */
.tog { flex: none; }
/* Nothing to toggle: a shorthand the pane cannot split, or sides written as longhands. */
.tog.off :deep(.seg button) { pointer-events: none; color: var(--inherited-foreground); }

/* Opacity: the one place a slider earns its keep — a percentage you drag. */
.slider-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.slider-row .pct { flex: none; width: 54px; }
.slider { flex: 1; min-width: 0; height: 25px; appearance: none; background: transparent; }
.slider::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: var(--field-border); }
.slider::-webkit-slider-thumb {
  appearance: none; width: 11px; height: 11px; margin-top: -4px; border-radius: 50%;
  background: var(--pane); border: 1.5px solid var(--primary); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.slider:focus-visible { outline: none; }
.slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--accent); }

/* `all properties…` — a plain text action, like every other "one more thing" in the app. */
.all-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.more.link-text { border: 0; background: transparent; padding: 0; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--accent-link); }
.more.link-text:hover { text-decoration: underline; }
.note { font-family: var(--font-mono); font-size: 9px; color: var(--meta-foreground); }
.row { display: flex; gap: 6px; min-width: 0; }
.row .prop { flex: none; width: 44%; }
.ctl {
  width: 100%; min-width: 0; height: 25px; padding: 0 7px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field); outline: none;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:focus-visible { border-color: var(--primary); background: var(--pane); }
.row.bad .ctl { border-color: var(--destructive); }
.none { margin: 0; font-size: 11px; color: var(--muted-foreground); }
</style>
