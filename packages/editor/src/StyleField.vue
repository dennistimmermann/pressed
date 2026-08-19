<!--
  One field of the STYLE grid = one declaration (DESIGN "Field anatomy"): a 25px filled control
  holding the value and, on the right, the unit as a chip-select. Unset shows `–`; a keyword
  (`auto`) is kept as typed and greys the chip; ↑↓ steps, ⇧ ×10. Empty removes the declaration.
  A value that is in force but not written here (from a shorthand, from the base sheet) is drawn
  in `--inherited-foreground`; typing over it writes this field's own declaration. `×` — on
  hover or focus, only while there *is* an own declaration — removes it again.
  The same control does colours (swatch + hex), a select, and free text with suggestions.
  `disabled` is the driven twin of a shorthand's leader: the value it follows, read-only and
  greyed. `mark` is the 9px group badge — same mark, same value.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseLength } from './css'
import type { Marker } from './editor-handle'
import Msgs from './Msgs.vue'
import { aria, hasError } from './inspector/markers'

const props = withDefaults(
  defineProps<{
    /** The declaration this field writes — also the title, the aria label and the message id. */
    prop: string
    /** 9px label above the field; omitted when `icon` says which side it is instead. */
    label?: string
    /** Side icon in the leading slot (the inside of a 12×12 `viewBox` = real px), for side rows. */
    icon?: string
    value?: string
    /** What applies when there is no own value — a shorthand's share, the base sheet: shown greyed. */
    inherited?: string
    /** Where that greyed value comes from, for the title (`from padding`). */
    from?: string
    kind?: 'length' | 'colour' | 'select' | 'text'
    /** Unit chip: one entry renders it fixed, several make it a select. Omit for no chip. */
    units?: string[]
    /** The unit a fresh number gets — the chip shows it while the field is unset. */
    unit?: string
    step?: number
    /** `select`: the options. `text`: suggestions, free text still allowed. */
    options?: string[]
    /** Driven by another field (a shorthand's leader): shown, never edited. `from` says by what. */
    disabled?: boolean
    /** Which value group this field is in — same mark, same value. None at four values. */
    mark?: 'filled' | 'unfilled' | 'hatch'
    markers?: Marker[]
  }>(),
  { kind: 'length' },
)
const emit = defineEmits<{
  set: [value: string | null]
  /** The text as typed, before commit — the parent mirrors it into linked twins; null on commit/blur. */
  draft: [value: string | null]
}>()

const id = computed(() => `css-msg-${props.prop}`)
const bad = computed(() => hasError(props.markers))

/** Written here — the only state in which `×` has anything to remove. */
const own = computed(() => !!props.value)
const len = computed(() => parseLength(props.value))
const inh = computed(() => (own.value ? null : parseLength(props.inherited)))
/** A word, not a length (`auto`, `solid 1px`): kept verbatim, and the unit chip goes quiet. */
const keyword = computed(() => own.value && !len.value)
/** The chip the *next* number gets: what is written, else what is in force, else the default. */
const picked = ref<string | null>(null)
// `||`, not `??`: a bare number parses with unit '' — the next write still deserves the default.
const unit = computed(() => (len.value ?? inh.value)?.unit || picked.value || props.unit || '')
const shown = computed(() => (len.value ? String(len.value.n) : props.value ?? ''))
/** The greyed stand-in: the inherited value the same way, else the plain `–`. */
const hint = computed(() => (inh.value ? String(inh.value.n) : props.inherited || '–'))

const NUMBER = /^-?\d*\.?\d+$/
function commit(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  emit('draft', null)
  emit('set', !raw ? null : NUMBER.test(raw) ? raw + unit.value : raw)
}
function pickUnit(event: Event) {
  picked.value = (event.target as HTMLSelectElement).value
  if (len.value) emit('set', `${len.value.n}${picked.value}`)
}
/** ↑↓ step (SPEC §4.3): the design's 0.5 for mm/pt, 1 otherwise, ⇧ ×10. Words are left alone. */
const step = computed(() => props.step ?? (unit.value === 'mm' || unit.value === 'pt' ? 0.5 : 1))
function onKey(event: KeyboardEvent) {
  if (props.disabled || props.kind !== 'length' || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  const raw = (event.target as HTMLInputElement).value.trim()
  // An empty field steps off whatever it inherits, so ↑ on a greyed `3` gives 3.5, not 0.5.
  const cur = parseLength(raw) ?? (raw ? null : inh.value)
  if (raw && !cur) return
  event.preventDefault()
  const by = step.value * (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1)
  emit('set', `${Number(((cur?.n ?? 0) + by).toFixed(3))}${cur?.unit || unit.value}`)
}

/** The native picker needs #rrggbb; anything else stays in the text half only. */
const hex = computed(() => {
  const v = props.value
  if (!v || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return '#000000'
  return v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v
})
</script>

<template>
  <div class="f" :class="{ bad, driven: disabled }" :title="disabled ? `follows ${from}` : !own && from ? `from ${from}` : prop">
    <span v-if="label" class="k">{{ label }}</span>
    <div class="ctl" :class="{ sel: kind === 'select' }">
      <!-- Same mark = same value: which sides this shorthand's tokens are shared between. -->
      <span v-if="mark" class="pm" aria-hidden="true">
        <svg viewBox="0 0 9 9">
          <rect class="bg" width="9" height="9" rx="1.5" />
          <rect v-if="mark === 'filled'" class="fg" width="9" height="9" rx="1.5" />
          <template v-else>
            <path v-if="mark === 'hatch'" class="ln" d="M-1 3L3 -1M-1 7L7 -1M1 9L9 1M5 9L9 5" />
            <rect class="ln" x="0.6" y="0.6" width="7.8" height="7.8" rx="1.5" />
          </template>
        </svg>
      </span>
      <select
        v-if="kind === 'select'" class="v" :class="{ inh: !own }" :value="value ?? ''" :aria-label="prop"
        v-bind="aria(id, markers)" @change="emit('set', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">{{ hint }}</option>
        <option v-for="o in options ?? []" :key="o" :value="o">{{ o }}</option>
      </select>
      <template v-else>
        <svg v-if="icon" class="ico" viewBox="0 0 12 12" aria-hidden="true" v-html="icon" />
        <input
          v-if="kind === 'colour'" class="sw" type="color" :value="hex" :aria-label="`${prop} swatch`"
          @change="emit('set', ($event.target as HTMLInputElement).value)"
        >
        <input
          class="v" :class="{ inh: !own }" :value="shown" :placeholder="hint" spellcheck="false"
          :list="options ? `${id}-opts` : undefined" :readonly="disabled"
          :aria-label="prop" v-bind="aria(id, markers)" @change="commit" @keydown="onKey"
          @input="emit('draft', ($event.target as HTMLInputElement).value)" @blur="emit('draft', null)"
        >
        <datalist v-if="options" :id="`${id}-opts`">
          <option v-for="o in options" :key="o" :value="o" />
        </datalist>
      </template>
      <!-- Removes this declaration; nothing to remove while the value only comes from elsewhere. -->
      <button v-if="own && !disabled" type="button" class="x" title="unset" @click="emit('set', null)">×</button>
      <span v-if="units" class="u" :class="{ off: keyword || disabled }">
        <select v-if="units.length > 1 && !disabled" :value="unit" :aria-label="`${prop} unit`" @change="pickUnit">
          <option v-for="u in units" :key="u" :value="u">{{ u || '–' }}</option>
        </select>
        <template v-else>{{ units.length > 1 ? unit : units[0] }}</template>
      </span>
    </div>
    <Msgs :id="id" :markers="markers" />
  </div>
</template>

<style scoped>
.f { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.k { font-family: var(--font-sans); font-size: 9px; font-weight: 450; color: var(--muted-foreground-2); }
/* Filled, borderless, 25px — focus swaps the border to --primary and the fill to --pane (§3). */
.ctl {
  position: relative;
  display: flex; align-items: center; height: 25px; min-width: 0; padding: 0 0 0 7px;
  border: 1px solid transparent; border-radius: var(--radius-control); background-color: var(--field);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:focus-within { border-color: var(--primary); background-color: var(--pane); outline: none; }
.ctl:has(.ico) { padding-left: 5px; }
.v {
  flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; padding: 0; outline: none;
  font: inherit; color: inherit;
}
/* Unset: the faint `–`. In force but written elsewhere: the value itself, a notch fainter still. */
.v::placeholder { color: var(--faint-foreground); }
.v.inh::placeholder { color: var(--inherited-foreground); }
/* Which side this field is: the box with that edge (or corner) picked out, never a letter. */
.ico {
  flex: none; width: 12px; height: 12px; margin-right: 3px;
  color: var(--faint-foreground); stroke: currentColor; fill: none;
  stroke-width: 1; stroke-linecap: round; stroke-linejoin: round;
}
/* Unset ×: on hover or focus, left of the unit chip (and last in a field that has no chip). */
.x {
  flex: none; display: none; width: 14px; height: 14px; align-items: center; justify-content: center;
  margin-right: 3px; padding: 0; border: 0; border-radius: 3px; background: transparent;
  font-family: var(--font-mono); font-size: 10px; line-height: 1; color: var(--meta-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.ctl:hover .x, .ctl:focus-within .x { display: flex; }
.x:hover { background: var(--field-border); color: var(--foreground); }
/* The unit chip: a select wearing the chip, so it stays one keyboard stop. */
.u {
  flex: none; display: flex; align-items: center; height: 19px; margin: 0 3px 0 4px; padding: 0 5px;
  border-radius: var(--radius-badge); background: var(--field-border);
  font-family: var(--font-mono); font-size: 8.5px; color: var(--muted-foreground);
}
.x + .u { margin-left: 0; }
.u:has(select)::after { content: "▾"; margin-left: 2px; font-size: 6px; color: var(--meta-foreground); }
.u.off { opacity: 0.45; }
.u select {
  appearance: none; border: 0; background: transparent; padding: 0; outline: none;
  font: inherit; color: inherit;
}
/* A select that looks like the field, with the same little chevron on the right — drawn on the
   wrapper so the × can sit between the value and it, as it does in every other field. */
.ctl.sel { padding-right: 7px; }
.ctl.sel::after { content: "▾"; flex: none; margin-left: 2px; font-size: 7px; color: var(--meta-foreground); }
.ctl.sel .v { appearance: none; text-overflow: ellipsis; }
.ctl.sel .v.inh { color: var(--inherited-foreground); }
.sw {
  flex: none; width: 13px; height: 13px; margin-right: 6px; padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 3px; background: none;
}
.sw::-webkit-color-swatch-wrapper { padding: 0; }
.sw::-webkit-color-swatch { border: 0; border-radius: 2px; }
/* Driven by another field: the value is shown as what it is — in force, but written elsewhere. */
.f.driven .v { color: var(--inherited-foreground); }
/* The group mark — a 9px rounded square hung over the field's top-right corner, in the gap.
   Filled · outlined · crosshatched, monochrome: it is a pattern to match, never a colour code. */
.pm { position: absolute; top: -4px; right: 6px; width: 9px; height: 9px; color: var(--meta-foreground); }
.pm svg { display: block; width: 9px; height: 9px; border-radius: 2px; box-shadow: 0 0 0 1px var(--pane); }
.pm .bg { fill: var(--pane); }
.pm .fg { fill: currentColor; }
.pm .ln { fill: none; stroke: currentColor; stroke-width: 1.2; }
/* A diagnostic on this declaration's own range — same treatment as an attribute field. */
.f.bad .ctl { border-color: var(--destructive); }
</style>
