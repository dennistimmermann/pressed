<!--
  The Inspector (SPEC §4.3 · §4.4): whatever is at the caret, in every mode. A 36px header —
  kind chip, name, locator — then the sections, with the same header pattern as Layers.

    element  PROPS (snippet scopes only) · ATTRIBUTES · LOGIC · STYLE
    rule     SELECTOR · USED BY · STYLE, then `Delete rule` as the last row of the scroller
    script   PROPS only (E8)

  Label-agnostic and stateless: rows are ranges in the source, every codeless action leaves as
  an event (or, where the rule already exists, as one text edit through the handle) — one ⌘Z.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import Msgs from './Msgs.vue'
import PropertyEditor from './PropertyEditor.vue'
import StylePane from './StylePane.vue'
import { AddRow, EmptyState, Menu, type MenuItem, PaneSection } from '@/ui'
import { aria, hasError, level } from './inspector/markers'
import { ruleAt, setDeclarations, type Declaration, type Rule, type StyleTarget } from './css'
import { DIRECTIVE_FIELDS } from './ast'
import type { ElementInfo, LayerNode, Loc } from './ast'
import type { EditorHandle, Marker } from './editor-handle'
import type { ComponentSchema } from './types'

type Section = 'props' | 'attributes' | 'logic' | 'style'

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
  scopeProps?: { name: string; type: string; value: string | null; callers: number; markers?: Marker[] }[] | null
  /** Everything that styles this element, in cascade order (`* · tag · .class · #id`). */
  targets?: StyleTarget[]
  /** Classes the `+` menu can offer beyond the ones already on the element, and where each lives. */
  classes?: { name: string; declarations: number; origin?: string | null }[]
  /** What the `{ }` picker offers on text-y fields. */
  variables?: { path: string; hint: string }[]
  /**
   * What the renderer actually computes for this element, for the enumerated properties only
   * (`display`, `justify-content`, …). It is what the STYLE grid shows muted where the rule
   * itself says nothing. Absent until the first render snapshot arrives.
   */
  computedStyle?: Record<string, string> | null
  /** Diagnostics inside `element` — ATTRIBUTES shows each one under the field it belongs to. */
  markers?: Marker[]
  /** Diagnostics anywhere in the style block(s) rules come from; the grid keeps the rule's own. */
  styleMarkers?: Marker[]
  /** Rule mode: the rule at the caret, and the elements it matches. */
  rule?: Rule | null
  usedBy?: LayerNode[]
  /** Which block that rule lives in: `scopeName` or `null` (the file-level one). */
  ruleOrigin?: string | null
  /** True inside a snippet scope — the STYLE meta says so. */
  scoped?: boolean
  /** The active snippet's name, `null` in the file's own scope — the two rule homes. */
  scopeName?: string | null
  /** What the host calls its file-level style block (`label`); this pane owns no such word. */
  rootName?: string
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
  'add-prop': [name: string]
  'rename-rule': [selector: string]
  'delete-rule': []
  /** A `USED BY` chip: put the caret on that element. */
  select: [loc: Loc]
  /** After a style edit: jump the editor to the declaration we wrote, switching tabs to reach it. */
  reveal: [offset: number]
  /** A style change on a pill that has no rule yet: create it, then set the declaration. */
  declare: [{ selector: string; prop: string; value: string | null }]
}>()

const open = (s: Section) => !props.collapsed?.[s]

// ---------------------------------------------------------------- sections
// The scroller below the header bar is the one scroller; the layout is CSS (`.head` / `.body`).
// Which sections exist depends on the mode, so a header's place in the two sticky stacks —
// `--i` above it, `--below` under it — is read off the rendered list.
const sections = computed<Section[]>(() => {
  if (props.kind === 'script') return ['props']
  if (props.kind === 'rule') return ['props', 'attributes', 'style']
  return props.scopeProps ? ['props', 'attributes', 'logic', 'style'] : ['attributes', 'logic', 'style']
})
const at = (s: Section) => ({
  index: sections.value.indexOf(s),
  below: sections.value.length - 1 - sections.value.indexOf(s),
  collapsed: !open(s),
})

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

/** A pill is a *(selector, origin)* pair: the same `.k` can live in both style blocks. */
const pillKey = (t: { selector: string; origin?: string | null }) => `${t.selector}@${t.origin ?? ''}`
/** A rule that came from the file's style block while we are inside a snippet scope. */
const foreign = (t: { rule: Rule | null; origin?: string | null }) =>
  props.scopeName != null && !!t.rule && t.origin === null

const picked = ref<string | null>(null)
/** The pill whose rule the grid edits: the one clicked, else the most specific that applies. */
const active = computed<StyleTarget | null>(
  () => props.targets?.find((t) => pillKey(t) === picked.value) ?? props.targets?.at(-1) ?? null,
)
const activeRule = computed(() => (props.kind === 'rule' ? props.rule ?? null : active.value?.rule ?? null))
/** Which rule the grid is on — never the rule object, which is re-parsed on every keystroke.
 *  The grid remounts when this changes, so its own state (open rows, arity history) starts over. */
const styleKey = computed(() =>
  props.kind === 'rule' ? `rule@${props.rule?.selector ?? ''}` : active.value ? pillKey(active.value) : 'none',
)

/**
 * What is in force on this element without the rule saying so — the grid draws it muted instead
 * of unset. The rendered document knows the real answer (the whole cascade, the base stylesheet,
 * the browser's own defaults), so `computedStyle` is it; `BASE_STYLE` only stands in until the
 * first snapshot arrives, and knows the one rule the runtime puts under every label
 * (`packages/core` · `:where(div){display:flex;flex-direction:column}`).
 */
const BASE_STYLE: Record<string, Record<string, string>> = {
  div: { display: 'flex', 'flex-direction': 'column' },
}
const inherited = computed(
  () =>
    props.computedStyle ??
    BASE_STYLE[(props.kind === 'rule' ? props.rule?.selector : props.element?.tag)?.trim() ?? ''] ??
    {},
)

/** The grid edits one rule; it shows the diagnostics that start in it. */
const ruleMarkers = computed(() => {
  const rule = activeRule.value
  return rule ? (props.styleMarkers ?? []).filter((m) => m.start >= rule.start && m.start < rule.end) : []
})
/** The selector is everything before `{` — a bad one is reported there, not in the body. */
const selectorMarkers = computed(() => {
  const rule = props.rule
  return rule ? ruleMarkers.value.filter((m) => m.start < rule.bodyStart) : []
})
/** …so the grid does not repeat it: rule mode has a SELECTOR field, element mode does not. */
const gridMarkers = computed(() =>
  props.kind === 'rule' ? ruleMarkers.value.filter((m) => !selectorMarkers.value.includes(m)) : ruleMarkers.value,
)

/** The `+ class` menu — `ui/Menu`, so it is anchored and teleported like everything else. */
const classAnchor = ref<DOMRect | null>(null)
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
  classAnchor.value = classAnchor.value ? null : (event.currentTarget as HTMLElement).getBoundingClientRect()
}

/** Classes that exist but are not on this element, then the tag / `*` rules that do not exist
    yet — the second kind *creates* a rule, so its hint says what it would match. */
const classItems = computed<MenuItem[]>(() => [
  ...otherClasses.value.map((c) => ({
    value: `.${c.name}`, label: `.${c.name}`, mono: true,
    hint: `${c.declarations}${scopeName.value ? (c.origin === null ? ` · ${props.rootName}` : ' · snippet') : ''}`,
  })),
  ...otherTargets.value.map((sel) => ({
    value: sel, label: sel, mono: true, hint: sel === '*' ? 'every element' : `every ${sel}`,
  })),
])
const scopeName = computed(() => props.scopeName)

/** A `.name` row adds the class; a `tag` / `*` row ensures the selector. */
function pickClassItem(value: string) {
  const c = otherClasses.value.find((x) => `.${x.name}` === value)
  if (c) return addClass(c.name, c.origin ?? null)
  pickSelector(value)
}

// The rule is created in the active scope's own block; `origin` only says which pill to select
// afterwards — an existing class keeps the block it already lives in.
function addClass(raw: string, origin: string | null = props.scopeName ?? null) {
  const cls = raw.trim().replace(/^\./, '')
  classAnchor.value = null
  newClass.value = ''
  if (!cls) return
  picked.value = pillKey({ selector: `.${cls}`, origin })
  emit('add-class', cls)
}
function pickSelector(selector: string) {
  classAnchor.value = null
  picked.value = pillKey({ selector, origin: props.scopeName ?? null })
  emit('ensure-selector', selector)
}

// ---------------------------------------------------------------- style edits
// The rule exists → one text edit from here. It does not → the host creates it first.

function onSet(changes: { prop: string; value: string | null }[]) {
  const rule = activeRule.value
  if (rule) {
    const edit = setDeclarations(props.source, rule, changes)
    props.handle?.executeEdits([edit])
    // Jump the editor to the declaration we just wrote — same as clicking a diagnostic, which
    // switches to the owning tab if the Style block is not the one on screen. Re-read the fresh
    // value so the offset is post-edit; the rule head never moves, so ruleAt still hits.
    const prop = [...changes].reverse().find((c) => c.value !== null)?.prop
    const src = props.handle?.getValue()
    const d = prop && src ? ruleAt(src, rule.start + 1)?.declarations.find((x) => x.prop === prop) : null
    emit('reveal', d?.start ?? edit.start)
    return
  }
  const selector = active.value?.selector
  if (selector) for (const c of changes) emit('declare', { selector, ...c })
}

/** `all properties…`: renaming a property is one edit over the property's own range. */
function renameProp(d: Declaration, prop: string) {
  if (!prop.trim()) return onSet([{ prop: d.prop, value: null }])
  props.handle?.executeEdits([{ start: d.start, end: d.start + d.prop.length, text: prop.trim() }])
}

// ---------------------------------------------------------------- rule mode


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

/** PROPS: what Volar says about each `defineProps` member, under the row that declares it. */
const propMarkers = computed(() => (props.scopeProps ?? []).flatMap((p) => p.markers ?? []))

/** What LOGIC owns: the `v-` props, and `key` — which belongs to the loop row while `v-for` is set. */
const logicProps = computed(() => {
  const all = props.element?.props ?? []
  const loop = all.some((p) => p.name === 'v-for')
  return all.filter((p) => p.name.startsWith('v-') || (loop && p.name === 'key'))
})
const logicCount = computed(() => logicProps.value.filter((p) => DIRECTIVE_FIELDS.includes(p.name)).length)
/** …so ATTRIBUTES shows the rest: plain attributes, `class` and event-less props included. */
const attrCount = computed(() => props.element?.props.filter((p) => !p.isEvent && !logicProps.value.includes(p)).length ?? 0)

/** The section headers say something is wrong in there even while the section is collapsed. */
const logicMarkers = computed(() =>
  (props.markers ?? []).filter((m) => logicProps.value.some((p) => m.start >= p.loc.start && m.start < p.loc.end)),
)
const attrMarkers = computed(() => (props.markers ?? []).filter((m) => !logicMarkers.value.includes(m)))
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

    <EmptyState v-if="!name" :text="emptyHint" />

    <div v-else class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <!-- ------------------------------------------------------ PROPS / SELECTOR -->
      <template v-if="kind === 'rule'">
        <PaneSection
          v-bind="at('props')" title="Selector" body-class="gap-1"
          :meta="scopeName ? (ruleOrigin === null ? `in ${rootName}` : `in snippet ${scopeName}`) : 'rename = one edit'"
          @toggle="emit('toggle', 'props')"
        >
          <template v-if="level(selectorMarkers)" #meta>
            <span class="meta dot" :class="level(selectorMarkers)">● {{ selectorMarkers.length }}</span>
          </template>
          <input
            :key="rule?.start ?? 0" class="sel" :class="{ bad: hasError(selectorMarkers) }" :value="rule?.selector ?? ''"
            spellcheck="false" aria-label="selector" v-bind="aria('msg-selector', selectorMarkers)"
            @change="commitRename" @keydown.enter="($event.target as HTMLInputElement).blur()"
          >
          <Msgs id="msg-selector" :markers="selectorMarkers" />
        </PaneSection>
      </template>

      <template v-else-if="scopeProps || kind === 'script'">
        <PaneSection
          v-bind="at('props')" title="Props" body-class="gap-2"
          :meta="`${(scopeProps ?? []).length} · what callers pass in`" @toggle="emit('toggle', 'props')"
        >
          <template v-if="level(propMarkers)" #meta>
            <span class="meta dot" :class="level(propMarkers)">● {{ propMarkers.length }}</span>
          </template>
          <template v-for="p in scopeProps ?? []" :key="p.name">
            <div class="prop-row" :class="{ bad: hasError(p.markers) }" v-bind="aria(`msg-prop-${p.name}`, p.markers)">
              <span>{{ p.name }}</span>
              <span class="type">{{ p.type }}</span>
              <span class="flex-1" />
              <span v-if="p.callers > 1" class="callers">+{{ p.callers - 1 }} callers</span>
              <span class="passed" :class="{ none: !p.value }">{{ p.value ?? '–' }}</span>
            </div>
            <Msgs :id="`msg-prop-${p.name}`" :markers="p.markers" />
          </template>
          <p v-if="!scopeProps?.length" class="none">no props yet</p>
          <div v-if="scopeProps">
            <input
              v-if="addingProp" :ref="autofocus" v-model="newProp" class="sel" placeholder="name"
              aria-label="new prop name" @change="addProp" @keydown.esc="addingProp = false"
            >
            <button v-else type="button" class="more" @click="addingProp = true">+ prop</button>
          </div>
        </PaneSection>
      </template>

      <template v-if="kind === 'element'">
        <!-- ---------------------------------------------------- ATTRIBUTES -->
        <PaneSection v-bind="at('attributes')" title="Attributes" hairline :meta="attrCount" @toggle="emit('toggle', 'attributes')">
          <template v-if="level(attrMarkers)" #meta>
            <span class="meta dot" :class="level(attrMarkers)">● {{ attrMarkers.length }}</span>
          </template>
          <PropertyEditor
            :element="element" :schema="schema" :handle="handle" :variables="variables" :markers="markers"
            @set-text="emit('set-text', $event)"
          />
        </PaneSection>

        <!-- ---------------------------------------------------- LOGIC -->
        <PaneSection v-bind="at('logic')" title="Logic" hairline :meta="logicCount" @toggle="emit('toggle', 'logic')">
          <template v-if="level(logicMarkers)" #meta>
            <span class="meta dot" :class="level(logicMarkers)">● {{ logicMarkers.length }}</span>
          </template>
          <PropertyEditor
            part="logic" :element="element" :schema="schema" :handle="handle" :variables="variables" :markers="markers"
          />
        </PaneSection>
      </template>

      <!-- ------------------------------------------------------ USED BY (rule mode) -->
      <template v-else-if="kind === 'rule'">
        <PaneSection
          v-bind="at('attributes')" title="Used by" hairline body-class="flex-wrap items-center gap-[5px]"
          @toggle="emit('toggle', 'attributes')"
        >
          <template #meta>
            <span class="meta" :class="{ unused: !usedBy?.length }">
              {{ usedBy?.length ? `${usedBy.length} · click to jump` : 'unused' }}
            </span>
          </template>
          <button v-for="node in usedBy ?? []" :key="node.loc.start" type="button" class="pill" @click="emit('select', node.loc)">
            {{ node.tag }}<span v-if="node.classes.length" class="cls"> .{{ node.classes.join('.') }}</span>
          </button>
        </PaneSection>
      </template>

      <!-- ------------------------------------------------------------ STYLE -->
      <template v-if="kind !== 'script'">
        <PaneSection
          v-bind="at('style')" title="Style" hairline body-class="gap-2"
          :meta="kind === 'rule' ? `${rule?.declarations.length ?? 0} set` : scoped ? 'applies · in this snippet' : 'applies · cascade order'"
          @toggle="emit('toggle', 'style')"
        >
          <template v-if="level(gridMarkers)" #meta>
            <span class="meta dot" :class="level(gridMarkers)">● {{ gridMarkers.length }}</span>
          </template>
          <!-- Selector pills, cascade order. The active one scopes the grid below. -->
          <div v-if="kind === 'element'" class="row-wrap">
            <button
              v-for="t in targets ?? []" :key="pillKey(t)" type="button" class="pill"
              :class="{ on: active && pillKey(active) === pillKey(t), faint: !t.rule || foreign(t) }"
              :title="!t.rule ? `${t.selector} — no rule yet` : !scopeName ? t.selector : foreign(t) ? `${t.selector} — in ${rootName}` : `${t.selector} — in this snippet`"
              @click="picked = pillKey(t)"
            >
              {{ t.label }}
              <span v-if="foreign(t)" class="from">{{ rootName }}</span>
              <span v-if="t.kind === 'class'" class="x" title="take this class off the element" @click.stop="emit('detach', t.selector.slice(1))">✕</span>
            </button>
            <!-- The one add grammar: a dashed `+ noun`, never a bare `+` (F18). -->
            <AddRow noun="class" inline title="add a class to this element" @click="openClassMenu" />
            <Menu :anchor="classAnchor" :items="classItems" :width="240" @pick="pickClassItem" @close="classAnchor = null">
              <input :ref="autofocus" v-model="newClass" class="new" placeholder="new class…" aria-label="new class" @change="addClass(newClass)" @keydown.esc="classAnchor = null">
            </Menu>
          </div>

          <StylePane :key="styleKey" :rule="activeRule" :markers="gridMarkers" :inherited="inherited" @set="onSet" @rename-prop="renameProp" />
        </PaneSection>
      </template>

      <!-- Delete is the last row of the pane's content, under its own separator — in the flow,
           so it never sits over the STYLE grid it was pinned across (atlas 26). It says what it
           costs; no confirm, because it is one edit and ⌘Z undoes it. -->
      <footer v-if="kind === 'rule' && rule" class="foot">
        <button type="button" class="danger" @click="emit('delete-rule')">Delete rule</button>
        <span class="meta">also strips {{ rule.selector }} from {{ usedBy?.length ?? 0 }} elements</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ---- header 36px (SPEC §5) ---- */
.head-bar {
  display: flex; align-items: center; gap: 7px; flex: none; height: 36px; padding: 0 12px;
  border-bottom: 1px solid var(--section-border);
}
.chip {
  flex: none; padding: 3px 5px; border-radius: var(--radius-badge); background: var(--field);
  font-family: var(--font-sans); font-size: 8.5px; font-weight: 600; line-height: 1; color: var(--muted-foreground);
}
.name { font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.name.accent { color: var(--accent-link); }
.cls { font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--accent-link); }
.loc { font-family: var(--font-mono); font-size: 10px; font-weight: 450; color: var(--meta-foreground); }

/* The sections are `@/ui` PaneSections; what stays here is what goes *in* a header. */
.meta { font-family: var(--font-mono); font-size: 10px; font-weight: 450; color: var(--meta-foreground); }
.meta.unused { color: var(--warning-foreground); }
/* Same dot as the block tabs: what is wrong in a section, visible while it is collapsed. */
.meta.dot { font-weight: 600; }
.meta.dot.error { color: var(--destructive); }
.meta.dot.warning { color: var(--warning-foreground); }
.row-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.none { margin: 0; font-size: 11px; color: var(--muted-foreground); }

/* ---- props ---- */
.prop-row {
  display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 8px;
  border: 1px solid transparent; border-radius: var(--radius-control); background: var(--field);
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
}
.prop-row .type { font-weight: 450; font-size: 10px; color: var(--info); }
.prop-row .passed {
  min-width: 0; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 450; font-size: 9.5px; color: var(--muted-foreground);
}
.prop-row .passed.none { color: var(--faint-foreground); }
.prop-row .callers { flex: none; white-space: nowrap; font-size: 9px; color: var(--meta-foreground); }

/* ---- pills (SPEC §4.3: radius 5, active = accent + 600) ---- */
.pill {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: var(--radius-control);
  border: 1px solid var(--field-border); background: var(--pane);
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 500; color: var(--muted-foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out;
}
.pill:hover { background: var(--field); }
/* THE selection recipe: --accent wash + 1px inset ring (F14). */
.pill.on { border-color: transparent; background: var(--accent); font-weight: 600; color: var(--accent-foreground); }
.pill:focus { outline: none; box-shadow: inset 0 0 0 1px var(--muted-foreground); }
.pill.on:focus { box-shadow: inset 0 0 0 1px var(--primary); }
.pill.faint { opacity: 0.6; }
/* Where the rule lives, when that is not the scope you are in. */
.pill .from { font-size: 9px; font-weight: 450; color: var(--meta-foreground); }
.pill.on .from { color: inherit; }
.pill .x { font-weight: 400; opacity: 0.6; }
.pill .x:hover { opacity: 1; color: var(--destructive); }
.pill .cls { font-size: 10.5px; color: var(--muted-foreground); }

.sel {
  width: 150px; height: 26px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-control);
  background: var(--field); font-family: var(--font-mono); font-size: 11px; font-weight: 500; outline: none;
}
.sel:focus-visible { border-color: var(--primary); background: var(--pane); }
/* A diagnostic on this row's own range — same treatment as an attribute field. */
.sel.bad, .prop-row.bad { border-color: var(--destructive); }
.more { align-self: flex-start; border: 0; background: transparent; padding: 0; font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; color: var(--accent-link); }
.more:hover { text-decoration: underline; }

/* The one input that rides inside a Menu (the `new class…` name). */
.new {
  width: 100%; height: 26px; margin-top: 4px; padding: 0 9px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field);
  font-family: var(--font-mono); font-size: var(--t3); outline: none;
}
.new:focus-visible { border-color: var(--primary); background: var(--pane); }

/* ---- the delete row: in the flow, its own separator, destructive text, no confirm ---- */
.foot {
  display: flex; align-items: center; gap: 8px; flex: none; margin-top: 4px; padding: 10px 12px 14px;
  border-top: 1px solid var(--section-border); font-size: 11px; line-height: 1.35;
}
.foot .danger { border: 0; background: transparent; padding: 0; font-size: 11px; font-weight: 500; color: var(--destructive); }
.foot .danger:hover { text-decoration: underline; }
.foot .meta { font-size: 9.5px; }
</style>
