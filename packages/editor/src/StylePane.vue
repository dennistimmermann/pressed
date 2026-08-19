<!--
  The Inspector's STYLE grid (SPEC §4.3): one rule as typed controls — layout, box, type,
  colour — in a 3-column grid, then `all properties…` for every declaration as it is written.
  Presentational only: it reads a parsed rule and emits what the user asked for; the Inspector
  turns that into one text edit (and creates the rule first when the pill has none yet).
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseLength, type Declaration, type Rule } from './css'
import type { Marker } from './editor-handle'
import Msgs from './Msgs.vue'
import { aria, hasError, msgsBy } from './inspector/markers'

const props = defineProps<{
  rule: Rule | null
  /** Diagnostics inside the rule — each declaration shows the ones on its own range. */
  markers?: Marker[]
}>()
const emit = defineEmits<{
  /** Set (or, with `null`, remove) one declaration. */
  set: [prop: string, value: string | null]
  /** `all properties…`: rename the property of a declaration in place. */
  'rename-prop': [d: Declaration, prop: string]
}>()

const get = (prop: string) => props.rule?.declarations.find((d) => d.prop === prop)?.value
const set = (prop: string, value: string | null) => emit('set', prop, value === '' ? null : value)

/** A declaration's own diagnostics, under the control that writes it. `''` = in the rule but in
 *  no declaration (a stray token, the selector): those go under `all properties…`. */
const byDecl = computed(() =>
  msgsBy(props.markers ?? [], (props.rule?.declarations ?? []).map((d) => ({ key: d.prop, loc: d }))),
)
const msgs = (prop: string) => byDecl.value[prop]
const bad = (prop: string) => hasError(byDecl.value[prop])
const msgId = (prop: string) => `css-msg-${prop}`

// ---- controls -------------------------------------------------------------
type Choice = { value: string; label: string; title?: string }
const CHOICES: Record<string, Choice[]> = {
  display: ['block', 'flex', 'grid', 'inline', 'inline-block', 'none'].map((v) => ({ value: v, label: v })),
  'flex-direction': [{ value: 'row', label: '→', title: 'row' }, { value: 'column', label: '↓', title: 'column' }],
  'justify-content': [
    { value: 'flex-start', label: '⇤', title: 'start' }, { value: 'center', label: '↔', title: 'center' },
    { value: 'flex-end', label: '⇥', title: 'end' }, { value: 'space-between', label: '⇹', title: 'space between' },
  ],
  'align-items': [
    { value: 'flex-start', label: '⤒', title: 'start' }, { value: 'center', label: '↕', title: 'center' },
    { value: 'flex-end', label: '⤓', title: 'end' }, { value: 'stretch', label: '⇳', title: 'stretch' },
  ],
  position: ['static', 'relative', 'absolute'].map((v) => ({ value: v, label: v })),
  'text-align': [{ value: 'left', label: '⇤', title: 'left' }, { value: 'center', label: '↔', title: 'center' }, { value: 'right', label: '⇥', title: 'right' }],
  'font-weight': [{ value: '400', label: '400' }, { value: '500', label: '500' }, { value: '600', label: '600' }, { value: '700', label: '700' }],
}
const UNITS = ['mm', 'pt', 'px', '%', 'em', '']
type LengthProp = { prop: string; label: string; unit: string; step?: number }
const BOX: LengthProp[] = [
  { prop: 'width', label: 'w', unit: 'mm' }, { prop: 'height', label: 'h', unit: 'mm' },
  { prop: 'padding', label: 'pad', unit: 'mm' }, { prop: 'margin', label: 'mar', unit: 'mm' }, { prop: 'gap', label: 'gap', unit: 'mm' },
]
const OFFSETS: LengthProp[] = ['top', 'right', 'bottom', 'left'].map((p) => ({ prop: p, label: p[0], unit: 'mm' }))
const TYPE: LengthProp[] = [
  { prop: 'font-size', label: 'size', unit: 'pt' },
  { prop: 'line-height', label: 'lh', unit: '', step: 0.1 },
  { prop: 'letter-spacing', label: 'ls', unit: 'em', step: 0.1 },
]

const isFlex = computed(() => get('display') === 'flex')
const positioned = computed(() => (get('position') ?? 'static') !== 'static')

/** A length control: number + unit; typing a number keeps the value's unit, else the prop's default. */
function onLength(p: LengthProp, e: Event) {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') return set(p.prop, null)
  const cur = parseLength(get(p.prop))
  set(p.prop, `${raw}${cur?.unit ?? p.unit}`)
}
function onUnit(p: LengthProp, e: Event) {
  const cur = parseLength(get(p.prop))
  if (cur) set(p.prop, `${cur.n}${(e.target as HTMLSelectElement).value}`)
}
/** ⇧↑ / ⇧↓ steps by ten (SPEC §4.3); the plain arrows are the input's own. */
function onStep(p: LengthProp, e: KeyboardEvent) {
  if (!e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  const cur = parseLength(get(p.prop))
  const step = (p.step ?? 0.5) * 10 * (e.key === 'ArrowUp' ? 1 : -1)
  set(p.prop, `${Number(((cur?.n ?? 0) + step).toFixed(3))}${cur?.unit ?? p.unit}`)
}
const lengthOf = (p: LengthProp) => parseLength(get(p.prop))
const rawOf = (p: LengthProp) => { const v = get(p.prop); return v && !parseLength(v) ? v : null } // e.g. `auto`, `1mm 2mm`

/** Colour: the picker needs #rrggbb; anything else is shown in the text field only. */
const hex = (v: string | undefined) => (v && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? (v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v) : null)

// ---- `all properties…`: the rule as written, one row per declaration -------
const all = ref(false)
const value = (e: Event) => (e.target as HTMLInputElement).value
</script>

<template>
  <div class="grid">
    <span class="gname">layout</span>
    <label class="field" :class="{ bad: bad('display') }"><span class="key">display</span>
      <select
        class="ctl" :value="get('display') ?? ''" v-bind="aria(msgId('display'), msgs('display'))"
        @change="set('display', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">–</option>
        <option v-for="c in CHOICES.display" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
      <Msgs :id="msgId('display')" :markers="msgs('display')" />
    </label>
    <label class="field" :class="{ bad: bad('position') }"><span class="key">position</span>
      <select
        class="ctl" :value="get('position') ?? ''" v-bind="aria(msgId('position'), msgs('position'))"
        @change="set('position', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">–</option>
        <option v-for="c in CHOICES.position" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
      <Msgs :id="msgId('position')" :markers="msgs('position')" />
    </label>
    <div v-for="prop in isFlex ? ['flex-direction', 'justify-content', 'align-items'] : []" :key="prop" class="field span2" :class="{ bad: bad(prop) }">
      <span class="key">{{ prop.replace('flex-', '').replace('-items', '').replace('-content', '') }}</span>
      <span class="seg" role="radiogroup" v-bind="aria(msgId(prop), msgs(prop))">
        <button
          v-for="c in CHOICES[prop]" :key="c.value" type="button" role="radio" :title="c.title"
          :aria-checked="get(prop) === c.value" :class="{ on: get(prop) === c.value }"
          @click="set(prop, get(prop) === c.value ? null : c.value)"
        >{{ c.label }}</button>
      </span>
      <Msgs :id="msgId(prop)" :markers="msgs(prop)" />
    </div>

    <span class="gname">box</span>
    <div v-for="p in [...BOX, ...(positioned ? OFFSETS : [])]" :key="p.prop" class="field" :class="{ bad: bad(p.prop) }" :title="p.prop">
      <span class="key">{{ p.label }}</span>
      <input v-if="rawOf(p)" class="ctl" :value="rawOf(p)" v-bind="aria(msgId(p.prop), msgs(p.prop))" @change="set(p.prop, value($event))">
      <span v-else class="num">
        <input
          class="ctl" type="number" step="0.5" :value="lengthOf(p)?.n ?? ''" placeholder="–"
          v-bind="aria(msgId(p.prop), msgs(p.prop))" @change="onLength(p, $event)" @keydown="onStep(p, $event)"
        >
        <select class="unit" :value="lengthOf(p)?.unit ?? p.unit" @change="onUnit(p, $event)">
          <option v-for="u in UNITS" :key="u" :value="u">{{ u || '·' }}</option>
        </select>
      </span>
      <Msgs :id="msgId(p.prop)" :markers="msgs(p.prop)" />
    </div>

    <span class="gname">type</span>
    <label class="field span3" :class="{ bad: bad('font-family') }"><span class="key">font</span>
      <input
        class="ctl" :value="get('font-family') ?? ''" placeholder="–"
        v-bind="aria(msgId('font-family'), msgs('font-family'))" @change="set('font-family', value($event))"
      >
      <Msgs :id="msgId('font-family')" :markers="msgs('font-family')" />
    </label>
    <div v-for="p in TYPE" :key="p.prop" class="field" :class="{ bad: bad(p.prop) }" :title="p.prop">
      <span class="key">{{ p.label }}</span>
      <span class="num">
        <input
          class="ctl" type="number" :step="p.step ?? 0.5" :value="lengthOf(p)?.n ?? ''" placeholder="–"
          v-bind="aria(msgId(p.prop), msgs(p.prop))" @change="onLength(p, $event)" @keydown="onStep(p, $event)"
        >
        <select v-if="p.prop !== 'line-height'" class="unit" :value="lengthOf(p)?.unit ?? p.unit" @change="onUnit(p, $event)">
          <option v-for="u in UNITS" :key="u" :value="u">{{ u || '·' }}</option>
        </select>
      </span>
      <Msgs :id="msgId(p.prop)" :markers="msgs(p.prop)" />
    </div>
    <label class="field" :class="{ bad: bad('font-weight') }"><span class="key">weight</span>
      <select
        class="ctl" :value="get('font-weight') ?? ''" v-bind="aria(msgId('font-weight'), msgs('font-weight'))"
        @change="set('font-weight', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">–</option>
        <option v-for="c in CHOICES['font-weight']" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
      <Msgs :id="msgId('font-weight')" :markers="msgs('font-weight')" />
    </label>
    <div class="field span2" :class="{ bad: bad('text-align') }"><span class="key">align</span>
      <span class="seg" role="radiogroup" v-bind="aria(msgId('text-align'), msgs('text-align'))">
        <button
          v-for="c in CHOICES['text-align']" :key="c.value" type="button" role="radio" :title="c.title"
          :aria-checked="get('text-align') === c.value" :class="{ on: get('text-align') === c.value }"
          @click="set('text-align', get('text-align') === c.value ? null : c.value)"
        >{{ c.label }}</button>
      </span>
      <Msgs :id="msgId('text-align')" :markers="msgs('text-align')" />
    </div>

    <span class="gname">colour</span>
    <div v-for="prop in ['color', 'background']" :key="prop" class="field" :class="{ bad: bad(prop) }" :title="prop">
      <span class="key">{{ prop === 'color' ? 'text' : 'bg' }}</span>
      <span class="colour">
        <input class="swatch" type="color" :value="hex(get(prop)) ?? '#000000'" :aria-label="prop" @change="set(prop, value($event))">
        <input class="ctl" :value="get(prop) ?? ''" placeholder="–" v-bind="aria(msgId(prop), msgs(prop))" @change="set(prop, value($event))">
      </span>
      <Msgs :id="msgId(prop)" :markers="msgs(prop)" />
    </div>

    <!-- Every declaration of the rule as it is written — the escape hatch from the typed grid. -->
    <button type="button" class="more" @click="all = !all">{{ all ? 'fewer properties' : 'all properties…' }}</button>
    <!-- In the rule but in no declaration — a stray token, a bad selector: nowhere else to put it. -->
    <Msgs class="span3" :markers="byDecl['']" />
    <template v-if="all">
      <template v-for="d in rule?.declarations ?? []" :key="d.start">
        <div class="field span3 row" :class="{ bad: bad(d.prop) }">
          <input
            class="ctl prop" :value="d.prop" spellcheck="false" aria-label="property"
            @change="emit('rename-prop', d, value($event))"
          >
          <input class="ctl" :value="d.value" spellcheck="false" aria-label="value" @change="set(d.prop, value($event))">
        </div>
        <Msgs class="span3" :markers="msgs(d.prop)" />
      </template>
      <p v-if="!rule?.declarations.length" class="none">nothing set yet</p>
    </template>
  </div>
</template>

<style scoped>
/* SPEC §4.3 / §5: 3-column grid, fields 25px, gaps 7×8, radius 5, labels 9px sans muted. */
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px 8px; align-items: end; }
.gname {
  grid-column: 1 / -1; margin-top: 3px;
  font-family: var(--font-sans); font-size: 9px; font-weight: 600; letter-spacing: 0.07em;
  text-transform: uppercase; color: var(--muted-foreground-2);
}
.gname:first-child { margin-top: 0; }
.field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.field.span2 { grid-column: span 2; }
.field.span3 { grid-column: 1 / -1; }
.key { font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground-2); }
/* Filled, borderless — focus swaps the border to --primary and the fill to --pane (§3). */
.ctl, .unit, .swatch {
  height: 25px; min-width: 0; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--field);
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 450; padding: 0 7px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl { width: 100%; }
.ctl::placeholder { color: var(--faint-foreground); }
.ctl:focus-visible, .unit:focus-visible, .swatch:focus-visible { outline: none; border-color: var(--primary); background: var(--pane); }
.num, .colour { display: flex; align-items: center; gap: 4px; min-width: 0; }
.unit { flex: none; width: 38px; padding: 0 2px; font-size: 8.5px; color: var(--faint-foreground); }
.swatch { flex: none; width: 25px; padding: 2px; }
/* A diagnostic on this declaration's own range — same treatment as an attribute field. */
.field.bad .ctl, .field.bad .unit, .field.bad .swatch, .field.bad .seg { border-color: var(--destructive); }
.span3 { grid-column: 1 / -1; }
.row { flex-direction: row; gap: 6px; }
.row .prop { flex: none; width: 44%; }
.none { grid-column: 1 / -1; margin: 0; font-size: 11px; color: var(--muted-foreground); }
.seg { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--field-border); border-radius: var(--radius-control); background: var(--field); }
.seg button {
  min-width: 24px; height: 19px; padding: 0 5px; border: 0; border-radius: var(--radius-badge); background: transparent;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg button.on { background: var(--accent); color: var(--accent-foreground); box-shadow: inset 0 0 0 1px var(--primary); }
/* Plain text action, like every other "one more thing" in the app. */
.more {
  grid-column: 1 / -1; justify-self: start; margin-top: 2px; border: 0; background: transparent; padding: 0;
  font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--accent-link);
}
.more:hover { text-decoration: underline; }
</style>
