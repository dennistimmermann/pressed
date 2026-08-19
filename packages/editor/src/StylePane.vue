<!--
  The Inspector's STYLE grid (SPEC §4.3): one rule as typed controls — layout, box, type,
  colour — in a 3-column grid, then `all properties…` for every declaration as it is written.
  Presentational only: it reads a parsed rule and emits what the user asked for; the Inspector
  turns that into one text edit (and creates the rule first when the pill has none yet).
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseLength, type Declaration, type Rule } from './css'

const props = defineProps<{ rule: Rule | null }>()
const emit = defineEmits<{
  /** Set (or, with `null`, remove) one declaration. */
  set: [prop: string, value: string | null]
  /** `all properties…`: rename the property of a declaration in place. */
  'rename-prop': [d: Declaration, prop: string]
}>()

const get = (prop: string) => props.rule?.declarations.find((d) => d.prop === prop)?.value
const set = (prop: string, value: string | null) => emit('set', prop, value === '' ? null : value)

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
    <label class="field"><span class="key">display</span>
      <select class="ctl" :value="get('display') ?? ''" @change="set('display', ($event.target as HTMLSelectElement).value)">
        <option value="">–</option>
        <option v-for="c in CHOICES.display" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </label>
    <label class="field"><span class="key">position</span>
      <select class="ctl" :value="get('position') ?? ''" @change="set('position', ($event.target as HTMLSelectElement).value)">
        <option value="">–</option>
        <option v-for="c in CHOICES.position" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </label>
    <div v-for="prop in isFlex ? ['flex-direction', 'justify-content', 'align-items'] : []" :key="prop" class="field span2">
      <span class="key">{{ prop.replace('flex-', '').replace('-items', '').replace('-content', '') }}</span>
      <span class="seg" role="radiogroup">
        <button
          v-for="c in CHOICES[prop]" :key="c.value" type="button" role="radio" :title="c.title"
          :aria-checked="get(prop) === c.value" :class="{ on: get(prop) === c.value }"
          @click="set(prop, get(prop) === c.value ? null : c.value)"
        >{{ c.label }}</button>
      </span>
    </div>

    <span class="gname">box</span>
    <div v-for="p in [...BOX, ...(positioned ? OFFSETS : [])]" :key="p.prop" class="field" :title="p.prop">
      <span class="key">{{ p.label }}</span>
      <input v-if="rawOf(p)" class="ctl" :value="rawOf(p)" @change="set(p.prop, value($event))">
      <span v-else class="num">
        <input
          class="ctl" type="number" step="0.5" :value="lengthOf(p)?.n ?? ''" placeholder="–"
          @change="onLength(p, $event)" @keydown="onStep(p, $event)"
        >
        <select class="unit" :value="lengthOf(p)?.unit ?? p.unit" @change="onUnit(p, $event)">
          <option v-for="u in UNITS" :key="u" :value="u">{{ u || '·' }}</option>
        </select>
      </span>
    </div>

    <span class="gname">type</span>
    <label class="field span3"><span class="key">font</span>
      <input class="ctl" :value="get('font-family') ?? ''" placeholder="–" @change="set('font-family', value($event))">
    </label>
    <div v-for="p in TYPE" :key="p.prop" class="field" :title="p.prop">
      <span class="key">{{ p.label }}</span>
      <span class="num">
        <input
          class="ctl" type="number" :step="p.step ?? 0.5" :value="lengthOf(p)?.n ?? ''" placeholder="–"
          @change="onLength(p, $event)" @keydown="onStep(p, $event)"
        >
        <select v-if="p.prop !== 'line-height'" class="unit" :value="lengthOf(p)?.unit ?? p.unit" @change="onUnit(p, $event)">
          <option v-for="u in UNITS" :key="u" :value="u">{{ u || '·' }}</option>
        </select>
      </span>
    </div>
    <label class="field"><span class="key">weight</span>
      <select class="ctl" :value="get('font-weight') ?? ''" @change="set('font-weight', ($event.target as HTMLSelectElement).value)">
        <option value="">–</option>
        <option v-for="c in CHOICES['font-weight']" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </label>
    <div class="field span2"><span class="key">align</span>
      <span class="seg" role="radiogroup">
        <button
          v-for="c in CHOICES['text-align']" :key="c.value" type="button" role="radio" :title="c.title"
          :aria-checked="get('text-align') === c.value" :class="{ on: get('text-align') === c.value }"
          @click="set('text-align', get('text-align') === c.value ? null : c.value)"
        >{{ c.label }}</button>
      </span>
    </div>

    <span class="gname">colour</span>
    <div v-for="prop in ['color', 'background']" :key="prop" class="field" :title="prop">
      <span class="key">{{ prop === 'color' ? 'text' : 'bg' }}</span>
      <span class="colour">
        <input class="swatch" type="color" :value="hex(get(prop)) ?? '#000000'" :aria-label="prop" @change="set(prop, value($event))">
        <input class="ctl" :value="get(prop) ?? ''" placeholder="–" @change="set(prop, value($event))">
      </span>
    </div>

    <!-- Every declaration of the rule as it is written — the escape hatch from the typed grid. -->
    <button type="button" class="more" @click="all = !all">{{ all ? 'fewer properties' : 'all properties…' }}</button>
    <template v-if="all">
      <div v-for="d in rule?.declarations ?? []" :key="d.start" class="field span3 row">
        <input
          class="ctl prop" :value="d.prop" spellcheck="false" aria-label="property"
          @change="emit('rename-prop', d, value($event))"
        >
        <input class="ctl" :value="d.value" spellcheck="false" aria-label="value" @change="set(d.prop, value($event))">
      </div>
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
  text-transform: uppercase; color: var(--muted-foreground);
}
.gname:first-child { margin-top: 0; }
.field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.field.span2 { grid-column: span 2; }
.field.span3 { grid-column: 1 / -1; }
.key { font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground); }
.ctl, .unit, .swatch {
  height: 25px; min-width: 0; border: 1px solid var(--input); border-radius: 5px; background: var(--card);
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 450; padding: 0 7px; color: var(--foreground);
}
.ctl { width: 100%; }
.ctl::placeholder { color: oklch(0.68 0.008 60); }
.ctl:focus-visible, .unit:focus-visible, .swatch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ring); }
.num, .colour { display: flex; align-items: center; gap: 4px; min-width: 0; }
.unit { flex: none; width: 38px; padding: 0 2px; font-size: 8.5px; color: oklch(0.68 0.008 60); }
.swatch { flex: none; width: 25px; padding: 2px; }
.row { flex-direction: row; gap: 6px; }
.row .prop { flex: none; width: 44%; }
.none { grid-column: 1 / -1; margin: 0; font-size: 11px; color: var(--muted-foreground); }
.seg { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--border); border-radius: 5px; background: var(--muted); }
.seg button {
  min-width: 24px; height: 19px; padding: 0 5px; border: 0; border-radius: 4px; background: transparent;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg button.on { background: var(--accent); color: var(--accent-foreground); box-shadow: inset 0 0 0 1px var(--accent-border); }
/* Plain text action, like every other "one more thing" in the app. */
.more {
  grid-column: 1 / -1; justify-self: start; margin-top: 2px; border: 0; background: transparent; padding: 0;
  font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--primary);
}
.more:hover { text-decoration: underline; }
</style>
