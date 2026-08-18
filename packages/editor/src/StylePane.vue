<!--
  Style pane (the slot below the editor on Style tabs): the rule at the caret as typed controls —
  layout, box, type, colour. Every change is one text-range edit of that rule (undo-able); the
  CSS text stays the source of truth, this is only a view onto it. Empty field = declaration removed.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { parseLength, setDeclaration, type Rule } from './css'
import type { EditorHandle } from './editor-handle'

const props = defineProps<{
  rule: Rule | null
  handle: EditorHandle | null
  source: string
  /** Show "Remove from element" — the host has an element the rule's class is on. */
  detachable?: boolean
}>()
const emit = defineEmits<{ rename: [selector: string]; detach: []; delete: [] }>()
function onRename(e: Event) {
  const next = (e.target as HTMLInputElement).value.trim()
  if (props.rule && next && next !== props.rule.selector) emit('rename', next)
  else (e.target as HTMLInputElement).value = props.rule?.selector ?? ''
}

const get = (prop: string) => props.rule?.declarations.find((d) => d.prop === prop)?.value
function set(prop: string, value: string | null) {
  if (!props.rule || !props.handle) return
  props.handle.executeEdits([setDeclaration(props.source, props.rule, prop, value === '' ? null : value)])
}

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
type LengthProp = { prop: string; label: string; unit: string }
const BOX: LengthProp[] = [
  { prop: 'width', label: 'w', unit: 'mm' }, { prop: 'height', label: 'h', unit: 'mm' },
  { prop: 'padding', label: 'pad', unit: 'mm' }, { prop: 'margin', label: 'mar', unit: 'mm' }, { prop: 'gap', label: 'gap', unit: 'mm' },
]
const OFFSETS: LengthProp[] = ['top', 'right', 'bottom', 'left'].map((p) => ({ prop: p, label: p[0], unit: 'mm' }))
const TYPE: LengthProp[] = [{ prop: 'font-size', label: 'size', unit: 'pt' }, { prop: 'line-height', label: 'lh', unit: '' }, { prop: 'letter-spacing', label: 'ls', unit: 'em' }]

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
const lengthOf = (p: LengthProp) => parseLength(get(p.prop))
const rawOf = (p: LengthProp) => { const v = get(p.prop); return v && !parseLength(v) ? v : null } // e.g. `auto`, `1mm 2mm`

/** Colour: the picker needs #rrggbb; anything else is shown in the text field only. */
const hex = (v: string | undefined) => (v && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? (v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v) : null)
</script>

<template>
  <div class="pane">
    <div class="handle"><span /></div>
    <!-- Toolbar: eyebrow · selector field · spacer · Remove · Delete. -->
    <div class="head">
      <span class="eyebrow">Style</span>
      <input
        v-if="rule" :key="rule.start" class="sel" :value="rule.selector" spellcheck="false" aria-label="selector"
        @change="onRename" @keydown.enter="($event.target as HTMLInputElement).blur()"
      >
      <span v-else class="meta">place the caret inside a rule</span>
      <span class="grow" />
      <template v-if="rule">
        <button v-if="detachable" type="button" class="btn" title="remove the class from this element (the rule stays)" @click="emit('detach')">Remove</button>
        <button type="button" class="btn danger" title="delete the rule from the style block" @click="emit('delete')">Delete</button>
      </template>
    </div>

    <div v-if="rule" class="body">
      <!-- Layout -->
      <section class="group">
        <span class="gname">layout</span>
        <label class="field"><span class="key">display</span>
          <select class="ctl" :value="get('display') ?? ''" @change="set('display', ($event.target as HTMLSelectElement).value)">
            <option value="">—</option>
            <option v-for="c in CHOICES.display" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>
        <template v-if="isFlex">
          <div v-for="prop in ['flex-direction', 'justify-content', 'align-items']" :key="prop" class="field">
            <span class="key">{{ prop.replace('flex-', '').replace('-items', '').replace('-content', '') }}</span>
            <span class="seg" role="radiogroup">
              <button
                v-for="c in CHOICES[prop]" :key="c.value" type="button" role="radio" :title="c.title"
                :aria-checked="get(prop) === c.value" :class="{ on: get(prop) === c.value }"
                @click="set(prop, get(prop) === c.value ? null : c.value)"
              >{{ c.label }}</button>
            </span>
          </div>
        </template>
        <label class="field"><span class="key">position</span>
          <select class="ctl" :value="get('position') ?? ''" @change="set('position', ($event.target as HTMLSelectElement).value)">
            <option value="">—</option>
            <option v-for="c in CHOICES.position" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>
      </section>

      <!-- Box -->
      <section class="group">
        <span class="gname">box</span>
        <div v-for="p in [...BOX, ...(positioned ? OFFSETS : [])]" :key="p.prop" class="field" :title="p.prop">
          <span class="key">{{ p.label }}</span>
          <template v-if="rawOf(p)">
            <input class="ctl raw" :value="rawOf(p)" @change="set(p.prop, ($event.target as HTMLInputElement).value)">
          </template>
          <template v-else>
            <input class="ctl num" type="number" step="0.5" :value="lengthOf(p)?.n ?? ''" placeholder="—" @change="onLength(p, $event)">
            <select class="unit" :value="lengthOf(p)?.unit ?? p.unit" @change="onUnit(p, $event)">
              <option v-for="u in UNITS" :key="u" :value="u">{{ u || '·' }}</option>
            </select>
          </template>
        </div>
      </section>

      <!-- Type -->
      <section class="group">
        <span class="gname">type</span>
        <label class="field wide"><span class="key">font</span>
          <input class="ctl" :value="get('font-family') ?? ''" placeholder="system-ui, sans-serif" @change="set('font-family', ($event.target as HTMLInputElement).value)">
        </label>
        <div v-for="p in TYPE" :key="p.prop" class="field" :title="p.prop">
          <span class="key">{{ p.label }}</span>
          <input class="ctl num" type="number" :step="p.prop === 'font-size' ? 0.5 : 0.1" :value="lengthOf(p)?.n ?? ''" placeholder="—" @change="onLength(p, $event)">
          <select v-if="p.prop !== 'line-height'" class="unit" :value="lengthOf(p)?.unit ?? p.unit" @change="onUnit(p, $event)">
            <option v-for="u in UNITS" :key="u" :value="u">{{ u || '·' }}</option>
          </select>
        </div>
        <label class="field"><span class="key">weight</span>
          <select class="ctl" :value="get('font-weight') ?? ''" @change="set('font-weight', ($event.target as HTMLSelectElement).value)">
            <option value="">—</option>
            <option v-for="c in CHOICES['font-weight']" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>
        <div class="field"><span class="key">align</span>
          <span class="seg" role="radiogroup">
            <button
              v-for="c in CHOICES['text-align']" :key="c.value" type="button" role="radio" :title="c.title"
              :aria-checked="get('text-align') === c.value" :class="{ on: get('text-align') === c.value }"
              @click="set('text-align', get('text-align') === c.value ? null : c.value)"
            >{{ c.label }}</button>
          </span>
        </div>
      </section>

      <!-- Colour -->
      <section class="group">
        <span class="gname">colour</span>
        <div v-for="prop in ['color', 'background']" :key="prop" class="field" :title="prop">
          <span class="key">{{ prop === 'color' ? 'text' : 'bg' }}</span>
          <input class="swatch" type="color" :value="hex(get(prop)) ?? '#000000'" @change="set(prop, ($event.target as HTMLInputElement).value)">
          <input class="ctl hex" :value="get(prop) ?? ''" placeholder="—" @change="set(prop, ($event.target as HTMLInputElement).value)">
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pane {
  height: 100%;
  box-sizing: border-box;
  border-top: 1px solid var(--border);
  background: var(--card);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.handle { display: flex; align-items: center; justify-content: center; height: 10px; flex: none; }
.handle span { width: 34px; height: 3px; border-radius: 2px; background: var(--border); }
.head { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; flex: none; border-bottom: 1px solid var(--border); }
.grow { flex: 1; }
.sel {
  font-family: var(--font-mono); font-weight: 600; font-size: 12px; color: var(--foreground);
  width: 160px; height: 28px; padding: 0 8px;
  border: 1px solid var(--input); border-radius: 6px; background: var(--card); outline: none;
}
.sel:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
/* Ghost buttons, like the file strip's Save: 1px border, never filled. */
.btn {
  height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent;
  font-size: 12px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}
.btn:hover { background: var(--muted); }
.btn.danger { color: var(--destructive); }
.btn.danger:hover { border-color: var(--destructive); background: oklch(0.975 0.015 25); }
.meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted-foreground); }

.body { display: flex; flex-wrap: wrap; gap: 8px 22px; padding: 4px 12px 10px; overflow: auto; align-content: flex-start; }
.group { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 10px; }
.gname { width: 100%; font-size: 9.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); }
.field { display: flex; flex-direction: column; gap: 3px; }
.field.wide .ctl { width: 180px; }
.key { font-size: 10.5px; font-weight: 500; color: var(--muted-foreground); }
.ctl, .unit, .swatch {
  height: 28px; border: 1px solid var(--input); border-radius: 6px; background: var(--card);
  font-family: var(--font-mono); font-size: 11.5px; padding: 0 6px; color: var(--foreground);
}
.ctl:focus-visible, .unit:focus-visible, .swatch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ring); }
.ctl.num { width: 64px; }
.ctl.raw { width: 96px; }
.ctl.hex { width: 84px; }
select.ctl { width: 104px; }
.field:has(.num) { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px; }
.field:has(.num) .key { width: 100%; }
.unit { width: 46px; padding: 0 2px; color: var(--muted-foreground); }
.swatch { width: 28px; padding: 2px; }
.field:has(.swatch) { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px; }
.field:has(.swatch) .key { width: 100%; }
.seg { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); }
.seg button {
  min-width: 26px; height: 22px; padding: 0 6px; border: 0; border-radius: 4px; background: transparent;
  font-family: var(--font-mono); font-size: 11.5px; color: var(--muted-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.seg button.on { background: var(--accent); color: var(--accent-foreground); box-shadow: inset 0 0 0 1px var(--accent-border); }
</style>
