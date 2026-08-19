<!--
  The Inspector (SPEC §4.3 · §4.4): whatever is at the caret, in every mode. A 36px header —
  kind chip, name, locator — then three sections with the same header pattern as Layers.

    element  PROPS (snippet scopes only) · ATTRIBUTES · STYLE
    rule     SELECTOR · USED BY · STYLE, and `Delete rule…` in the pane footer
    script   PROPS only (E8)

  Label-agnostic and stateless: rows are ranges in the source, every codeless action leaves as
  an event (or, where the rule already exists, as one text edit through the handle) — one ⌘Z.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PropertyEditor from './PropertyEditor.vue'
import StylePane from './StylePane.vue'
import { setDeclaration, type Declaration, type Rule, type StyleTarget } from './css'
import type { ElementInfo, LayerNode, Loc } from './ast'
import type { EditorHandle } from './editor-handle'
import type { ComponentSchema } from './types'

type Section = 'props' | 'attributes' | 'style'

const props = defineProps<{
  /** What is at the caret. `script` is E8: props only. */
  kind: 'element' | 'rule' | 'script'
  /** Header right: `line N · caret` in Split/Code, `selection` in Blocks, `in badge` in a scope. */
  locator: string
  element: ElementInfo | null
  schema: (ComponentSchema & { doc?: string }) | null
  handle: EditorHandle | null
  source: string
  /** Inside a snippet scope: its declared props and what the first caller passes in. */
  scopeProps?: { name: string; type: string; value: string | null; callers: number }[] | null
  /** Everything that styles this element, in cascade order (`* · tag · .class · #id`). */
  targets?: StyleTarget[]
  /** Classes the `+` menu can offer beyond the ones already on the element. */
  classes?: { name: string; declarations: number }[]
  /** What the `{ }` picker offers on text-y fields. */
  variables?: { path: string; hint: string }[]
  /** Rule mode: the rule at the caret, and the elements it matches. */
  rule?: Rule | null
  usedBy?: LayerNode[]
  /** True inside a snippet scope — the STYLE meta says so. */
  scoped?: boolean
  collapsed?: Partial<Record<Section, boolean>>
  /** The no-selection line; it names the host's own surfaces, so the host writes it. */
  emptyHint: string
}>()

const emit = defineEmits<{
  toggle: [section: Section]
  /** Pills `+`: an existing or brand-new class (writes `class=` and creates the rule). */
  'add-class': [name: string]
  /** Pills `+`: `*` or the element's tag — the rule alone. */
  'ensure-selector': [selector: string]
  /** `✕` on a class pill: take the class off this element, the rule survives. */
  detach: [cls: string]
  'set-text': [text: string]
  'change-tag': [tag: string]
  'add-prop': [name: string]
  'rename-rule': [selector: string]
  'delete-rule': []
  /** A `USED BY` chip: put the caret on that element. */
  select: [loc: Loc]
  /** A style change on a pill that has no rule yet: create it, then set the declaration. */
  declare: [{ selector: string; prop: string; value: string | null }]
}>()

const open = (s: Section) => !props.collapsed?.[s]

// ---------------------------------------------------------------- header

const name = computed(() => {
  // A style block with the caret between rules has nothing to inspect either.
  if (props.kind === 'rule') return props.rule ? { text: props.rule.selector, classes: '', accent: true } : null
  if (props.kind === 'script') return { text: 'script', classes: '', accent: false }
  const el = props.element
  if (!el) return null
  const classes = el.props.find((p) => p.name === 'class' && !p.isBinding)?.value?.split(/\s+/).filter(Boolean) ?? []
  return { text: el.tag, classes: classes.map((c) => `.${c}`).join(' '), accent: false }
})

// ---------------------------------------------------------------- style pills

const picked = ref<string | null>(null)
/** The pill whose rule the grid edits: the one clicked, else the most specific that applies. */
const active = computed<StyleTarget | null>(
  () => props.targets?.find((t) => t.selector === picked.value) ?? props.targets?.at(-1) ?? null,
)
const activeRule = computed(() => (props.kind === 'rule' ? props.rule ?? null : active.value?.rule ?? null))

/** The column is narrow and clips its overflow, so the menu is placed in fixed space. */
const classMenu = ref(false)
const menuPos = ref({ top: 0, left: 0 })
const newClass = ref('')
/** The `+` menu: classes that exist but are not on this element, then the missing tag / `*` rules. */
const otherClasses = computed(() => {
  const on = new Set((props.targets ?? []).map((t) => t.selector))
  return (props.classes ?? []).filter((c) => !on.has(`.${c.name}`))
})
const otherTargets = computed(() => {
  const has = new Set((props.targets ?? []).map((t) => t.selector))
  return [props.element?.tag, '*'].filter((sel): sel is string => !!sel && !has.has(sel))
})

function openClassMenu(event: MouseEvent) {
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menuPos.value = { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 248)) }
  classMenu.value = !classMenu.value
}

function addClass(raw: string) {
  const cls = raw.trim().replace(/^\./, '')
  classMenu.value = false
  newClass.value = ''
  if (!cls) return
  picked.value = `.${cls}`
  emit('add-class', cls)
}
function pickSelector(selector: string) {
  classMenu.value = false
  picked.value = selector
  emit('ensure-selector', selector)
}

// ---------------------------------------------------------------- style edits
// The rule exists → one text edit from here. It does not → the host creates it first.

function onSet(prop: string, value: string | null) {
  const rule = activeRule.value
  if (rule) return props.handle?.executeEdits([setDeclaration(props.source, rule, prop, value)])
  const selector = active.value?.selector
  if (selector) emit('declare', { selector, prop, value })
}

/** `all properties…`: renaming a property is one edit over the property's own range. */
function renameProp(d: Declaration, prop: string) {
  if (!prop.trim()) return onSet(d.prop, null)
  props.handle?.executeEdits([{ start: d.start, end: d.start + d.prop.length, text: prop.trim() }])
}

// ---------------------------------------------------------------- rule mode

const pendingDelete = ref(false)
watch(() => props.rule?.start, () => { pendingDelete.value = false })

function commitRename(event: Event) {
  const next = (event.target as HTMLInputElement).value.trim()
  if (props.rule && next && next !== props.rule.selector) emit('rename-rule', next)
  else (event.target as HTMLInputElement).value = props.rule?.selector ?? ''
}

// ---------------------------------------------------------------- props section

const addingProp = ref(false)
const newProp = ref('')
const autofocus = (el: unknown) => (el as HTMLInputElement | null)?.focus()

function addProp() {
  const name = newProp.value.trim()
  addingProp.value = false
  newProp.value = ''
  if (name) emit('add-prop', name)
}

const attrCount = computed(() => props.element?.props.filter((p) => !p.isEvent && !p.name.startsWith('v-')).length ?? 0)
</script>

<template>
  <div class="inspector flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground">
    <!-- ---------------------------------------------------------- header -->
    <header class="head-bar">
      <template v-if="name">
        <span class="chip" aria-hidden="true">{{ kind === 'element' ? '&lt;&gt;' : '{ }' }}</span>
        <span class="name" :class="{ accent: name.accent }">{{ name.text }}</span>
        <span v-if="name.classes" class="cls">{{ name.classes }}</span>
        <span v-if="kind === 'rule'" class="loc">rule</span>
      </template>
      <span v-else class="loc">nothing selected</span>
      <span class="flex-1" />
      <span v-if="name" class="loc">{{ locator }}</span>
    </header>

    <p v-if="!name" class="empty">{{ emptyHint }}</p>

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <!-- ------------------------------------------------------ PROPS / SELECTOR -->
      <template v-if="kind === 'rule'">
        <button type="button" class="head" @click="emit('toggle', 'props')">
          <span class="eyebrow flex-1 text-left">Selector</span>
          <span class="meta">rename = one edit</span>
          <span class="chev">{{ open('props') ? '▾' : '▸' }}</span>
        </button>
        <div v-if="open('props')" class="body">
          <input
            :key="rule?.start ?? 0" class="sel" :value="rule?.selector ?? ''" spellcheck="false" aria-label="selector"
            @change="commitRename" @keydown.enter="($event.target as HTMLInputElement).blur()"
          >
        </div>
      </template>

      <template v-else-if="scopeProps || kind === 'script'">
        <button type="button" class="head" @click="emit('toggle', 'props')">
          <span class="eyebrow flex-1 text-left">Props</span>
          <span class="meta">{{ (scopeProps ?? []).length }} · what callers pass in</span>
          <span class="chev">{{ open('props') ? '▾' : '▸' }}</span>
        </button>
        <div v-if="open('props')" class="body gap-2">
          <div v-for="p in scopeProps ?? []" :key="p.name" class="prop-row">
            <span>{{ p.name }}</span>
            <span class="type">{{ p.type }}</span>
            <span class="flex-1" />
            <span v-if="p.callers > 1" class="callers">+{{ p.callers - 1 }} callers</span>
            <span class="passed" :class="{ none: !p.value }">{{ p.value ?? '–' }}</span>
          </div>
          <p v-if="!scopeProps?.length" class="none">no props yet</p>
          <div v-if="scopeProps">
            <input
              v-if="addingProp" :ref="autofocus" v-model="newProp" class="sel" placeholder="name"
              aria-label="new prop name" @change="addProp" @keydown.esc="addingProp = false"
            >
            <button v-else type="button" class="more" @click="addingProp = true">+ prop</button>
          </div>
        </div>
      </template>

      <template v-if="kind === 'element'">
        <!-- ---------------------------------------------------- ATTRIBUTES -->
        <button type="button" class="head hair" @click="emit('toggle', 'attributes')">
          <span class="eyebrow flex-1 text-left">Attributes</span>
          <span class="meta">{{ attrCount }}</span>
          <span class="chev">{{ open('attributes') ? '▾' : '▸' }}</span>
        </button>
        <div v-if="open('attributes')" class="body">
          <PropertyEditor
            :element="element" :schema="schema" :handle="handle" :variables="variables"
            @set-text="emit('set-text', $event)" @change-tag="emit('change-tag', $event)"
          />
        </div>
      </template>

      <!-- ------------------------------------------------------ USED BY (rule mode) -->
      <template v-else-if="kind === 'rule'">
        <button type="button" class="head hair" @click="emit('toggle', 'attributes')">
          <span class="eyebrow flex-1 text-left">Used by</span>
          <span class="meta" :class="{ unused: !usedBy?.length }">
            {{ usedBy?.length ? `${usedBy.length} · click to jump` : 'unused' }}
          </span>
          <span class="chev">{{ open('attributes') ? '▾' : '▸' }}</span>
        </button>
        <div v-if="open('attributes')" class="body row-wrap">
          <button v-for="node in usedBy ?? []" :key="node.loc.start" type="button" class="pill" @click="emit('select', node.loc)">
            {{ node.tag }}<span v-if="node.classes.length" class="cls"> .{{ node.classes.join('.') }}</span>
          </button>
        </div>
      </template>

      <!-- ------------------------------------------------------------ STYLE -->
      <template v-if="kind !== 'script'">
        <button type="button" class="head hair" @click="emit('toggle', 'style')">
          <span class="eyebrow flex-1 text-left">Style</span>
          <span class="meta">
            {{ kind === 'rule' ? `${rule?.declarations.length ?? 0} set` : scoped ? 'applies · in this snippet' : 'applies · cascade order' }}
          </span>
          <span class="chev">{{ open('style') ? '▾' : '▸' }}</span>
        </button>
        <div v-if="open('style')" class="body gap-2">
          <!-- Selector pills, cascade order. The active one scopes the grid below. -->
          <div v-if="kind === 'element'" class="row-wrap">
            <button
              v-for="t in targets ?? []" :key="t.selector" type="button" class="pill"
              :class="{ on: active?.selector === t.selector, faint: !t.rule }"
              :title="t.rule ? t.selector : `${t.selector} — no rule yet`" @click="picked = t.selector"
            >
              {{ t.label }}
              <span v-if="t.kind === 'class'" class="x" title="take this class off the element" @click.stop="emit('detach', t.selector.slice(1))">✕</span>
            </button>
            <span class="add-wrap">
              <button type="button" class="pill dashed" title="add a class to this element" @click="openClassMenu">+</button>
              <template v-if="classMenu">
                <span class="backdrop" @click="classMenu = false" />
                <div class="menu" :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }">
                  <button v-for="c in otherClasses" :key="c.name" type="button" class="item" @click="addClass(c.name)">
                    <span class="flex-1 text-left">.{{ c.name }}</span>
                    <span class="hint">{{ c.declarations }}</span>
                  </button>
                  <button v-for="sel in otherTargets" :key="sel" type="button" class="item" @click="pickSelector(sel)">
                    <span class="flex-1 text-left">{{ sel }}</span>
                    <span class="hint">{{ sel === '*' ? 'every element' : `every ${sel}` }}</span>
                  </button>
                  <input :ref="autofocus" v-model="newClass" placeholder="new class…" aria-label="new class" @change="addClass(newClass)" @keydown.esc="classMenu = false">
                </div>
              </template>
            </span>
          </div>
          <p v-if="kind === 'element' && !targets?.length" class="none">no class on this element yet — add one with +</p>

          <StylePane :rule="activeRule" @set="onSet" @rename-prop="renameProp" />
        </div>
      </template>
    </div>

    <!-- Delete lives at the foot of the pane, and says what it costs. Confirm is inline. -->
    <footer v-if="kind === 'rule' && rule" class="foot">
      <template v-if="pendingDelete">
        <span class="flex-1">Delete {{ rule.selector }} and strip it from {{ usedBy?.length ?? 0 }} elements?</span>
        <button type="button" class="danger" @click="((pendingDelete = false), emit('delete-rule'))">Delete</button>
        <button type="button" class="cancel" @click="pendingDelete = false">Cancel</button>
      </template>
      <template v-else>
        <button type="button" class="danger" @click="pendingDelete = true">Delete rule…</button>
        <span class="meta">also strips {{ rule.selector }} from {{ usedBy?.length ?? 0 }} elements</span>
      </template>
    </footer>
  </div>
</template>

<style scoped>
/* ---- header 36px (SPEC §5) ---- */
.head-bar {
  display: flex; align-items: center; gap: 7px; flex: none; height: 36px; padding: 0 12px;
  border-bottom: 1px solid var(--border);
}
.chip {
  flex: none; padding: 3px 5px; border-radius: 4px; background: var(--muted);
  font-family: var(--font-sans); font-size: 8.5px; font-weight: 600; line-height: 1; color: var(--muted-foreground);
}
.name { font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.name.accent { color: var(--primary); }
.cls { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--primary); }
.loc { font-family: var(--font-mono); font-size: 10px; font-weight: 450; color: oklch(0.68 0.008 60); }
.empty { padding: 12px; margin: 0; font-size: 11px; color: var(--muted-foreground); }

/* ---- section header: the Layers pattern, 34px ---- */
.head {
  display: flex; align-items: center; gap: 8px; width: 100%; flex: none;
  height: 34px; padding: 10px 12px 8px; background: transparent; border: 0;
}
.head.hair { border-top: 1px solid var(--border); }
.eyebrow { font-family: var(--font-sans); font-size: 10px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted-foreground); }
.meta { font-family: var(--font-mono); font-size: 10px; font-weight: 450; color: oklch(0.68 0.008 60); }
.meta.unused { color: var(--warning-foreground); }
.chev { flex: none; font-size: 8px; color: var(--muted-foreground); }
.body { display: flex; flex-direction: column; padding: 0 12px 11px; }
.row-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.none { margin: 0; font-size: 11px; color: var(--muted-foreground); }

/* ---- props ---- */
.prop-row {
  display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px;
  border: 1px solid var(--border); border-radius: 6px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
}
.prop-row .type { font-weight: 450; font-size: 10px; color: var(--info); }
.prop-row .passed {
  min-width: 0; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 450; font-size: 9.5px; color: var(--muted-foreground);
}
.prop-row .passed.none { color: oklch(0.68 0.008 60); }
.prop-row .callers { flex: none; white-space: nowrap; font-size: 9px; color: var(--muted-foreground); }

/* ---- pills (SPEC §4.3: radius 5, active = accent + 600) ---- */
.pill {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 5px;
  border: 1px solid var(--border); background: var(--card);
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 500; color: var(--muted-foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}
.pill:hover { background: var(--muted); }
.pill.on { border-color: var(--accent-border); background: var(--accent); font-weight: 600; color: var(--accent-foreground); }
.pill.faint { opacity: 0.6; }
.pill.dashed { border-style: dashed; }
.pill .x { font-weight: 400; opacity: 0.6; }
.pill .x:hover { opacity: 1; color: var(--destructive); }
.pill .cls { font-size: 10.5px; color: var(--muted-foreground); }

.sel {
  width: 150px; height: 26px; padding: 0 8px; border: 1px solid var(--input); border-radius: 6px;
  background: var(--card); font-family: var(--font-mono); font-size: 11px; font-weight: 500; outline: none;
}
.sel:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
.more { align-self: flex-start; border: 0; background: transparent; padding: 0; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--primary); }
.more:hover { text-decoration: underline; }

/* ---- the `+` menu (SPEC §4.8) ---- */
.add-wrap { position: relative; }
.backdrop { position: fixed; inset: 0; z-index: 19; }
.menu {
  position: fixed; z-index: 60; width: 240px; padding: 6px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--popover);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.10);
}
.menu .item {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 26px; padding: 0 9px;
  border: 0; border-radius: 5px; background: transparent;
  font-family: var(--font-mono); font-size: 11px; color: var(--popover-foreground);
}
.menu .item:hover { background: var(--accent); }
.menu .hint { font-size: 10px; color: var(--muted-foreground); }
.menu input {
  width: 100%; height: 26px; margin-top: 4px; padding: 0 9px; border: 1px solid var(--input);
  border-radius: 6px; background: var(--card); font-family: var(--font-mono); font-size: 11px; outline: none;
}
.menu input:focus-visible { box-shadow: 0 0 0 2px var(--ring); }

/* ---- footer: destructive text + inline confirm, never a modal ---- */
.foot {
  display: flex; align-items: center; gap: 8px; flex: none; padding: 10px 12px;
  border-top: 1px solid var(--border); font-size: 11px; line-height: 1.35;
}
.foot .danger { border: 0; background: transparent; padding: 0; font-size: 11px; font-weight: 500; color: var(--destructive); }
.foot .danger:hover { text-decoration: underline; }
.foot .cancel { border: 0; background: transparent; padding: 0; font-size: 11px; color: var(--muted-foreground); }
.foot .cancel:hover { color: var(--foreground); }
.foot .meta { font-size: 9.5px; }
</style>
