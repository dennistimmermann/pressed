<!--
  The left pane (SPEC §4.2): three sections — LAYERS (the element tree of the scope's template
  block), RULES (its style block, with use counts) and SCRIPT (read-only summary). Label-agnostic
  and stateless: rows are ranges in the source, every command is an event the host turns into one
  text edit, and collapse state is a prop the host persists.
-->
<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { LayerNode, Loc } from './ast'
import { insertItems, type InsertItem } from './inspector/insert'
import type { ComponentSchema } from './types'

/** What a row's commands may do — `can` comes from the host, which asks the AST primitives. */
type Caps = { up: boolean; down: boolean; indent: boolean; outdent: boolean; unwrap: boolean; duplicate: boolean }
type RuleRow = { selector: string; start: number; uses: number }
type Section = 'layers' | 'rules' | 'script'
type Position = 'before' | 'after' | 'inside'
type Row = { node: LayerNode; depth: number }

const props = defineProps<{
  tree: LayerNode[]
  /** The element at the caret; the ringed row. */
  selected?: Loc | null
  /** Elements in the block, for the header. Counted from the tree when omitted. */
  count?: number
  /** Snippet names — a row with one of these tags carries `S` and enters that scope on double-click. */
  snippets?: string[]
  /** What `+ Insert element` can insert (components / snippets / HTML, filtered by the parent of the selection). */
  insertables?: { components: ComponentSchema[]; snippets: ComponentSchema[] } | null
  /** Extra tags `Wrap in…` offers on top of div/span/p. */
  wrapChoices?: string[]
  /** Which commands are possible for a given row — the `⋯` menu's disabled items. */
  can?: (loc: Loc) => Caps
  /** The scope's style rules, with how many elements each one matches. */
  rules?: RuleRow[]
  /** Start offset of the rule at the caret, while a style block is the active one. */
  selectedRule?: number | null
  /** The scope's script block, or null when it has none. */
  script?: { props: { name: string; type: string }[]; lines: number } | null
  /** Which section the active block tab points at; it takes the remaining height. */
  active?: Section
  collapsed?: Partial<Record<Section, boolean>>
  /** Blocks mode has no editor pane, so opening the script means switching mode. */
  opensCode?: boolean
  /** Filter hook: rows this says no to are dimmed to 45%. No filter UI yet. */
  matches?: (node: LayerNode) => boolean
  /** ≤900px (SPEC §3 E12): the whole pane collapses to one header with a `<select>`. */
  compact?: boolean
}>()

const emit = defineEmits<{
  select: [loc: Loc]
  move: [{ loc: Loc; target: Loc; position: Position }]
  /** `up` · `down` · `indent` · `outdent` · `unwrap` · `duplicate` · `delete` · `wrap:<tag>`. */
  command: [{ kind: string; loc: Loc }]
  'enter-scope': [name: string]
  /** Insert `item.text` (`|` = caret) after — or, with `inside`, into — the selected row. */
  insert: [{ item: InsertItem; after: Loc | null; inside: boolean }]
  toggle: [section: Section]
  'select-rule': [start: number]
  'rename-rule': [{ start: number; selector: string }]
  'delete-rule': [start: number]
  'new-rule': [selector: string]
  'open-script': []
}>()

const ALL: Caps = { up: true, down: true, indent: true, outdent: true, unwrap: true, duplicate: true }
const isOpen = (s: Section) => !props.collapsed?.[s]
/** The expanded section the active block points at grows; the others stay their natural height. */
const grows = (s: Section) => isOpen(s) && (props.active ?? 'layers') === s

// ---------------------------------------------------------------- rows

/** Which tree rows are folded shut — the pane's own state; section collapse is the host's. */
const folded = ref(new Set<number>())

/** The visible rows, flattened: a tree of `<div>`s cannot be one keyboard widget. */
const rows = computed(() => {
  const out: Row[] = []
  const walk = (nodes: LayerNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth })
      if (!folded.value.has(node.loc.start)) walk(node.children, depth + 1)
    }
  }
  walk(props.tree, 0)
  return out
})

const total = computed(() => {
  const count = (nodes: LayerNode[]): number => nodes.reduce((n, c) => n + 1 + count(c.children), 0)
  return props.count ?? count(props.tree)
})

const isSelected = (node: LayerNode) => props.selected?.start === node.loc.start
const activeIndex = computed(() => rows.value.findIndex((r) => isSelected(r.node)))
const rowId = (i: number) => `layer-${i}`
const isSnippet = (node: LayerNode) => node.isComponent && !!props.snippets?.includes(node.tag)

function toggleRow(node: LayerNode) {
  const set = new Set(folded.value)
  if (!set.delete(node.loc.start)) set.add(node.loc.start)
  folded.value = set
}

function onDoubleClick(node: LayerNode) {
  if (isSnippet(node)) emit('enter-scope', node.tag)
}

// ---------------------------------------------------------------- popovers
// The column is narrow and clips overflow, so every popover is fixed-positioned under its button.

const menuPos = ref({ top: 0, left: 0 })
function anchor(event: MouseEvent, width = 220) {
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menuPos.value = { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) }
}

/** The `⋯` menu: the only home for the structure commands besides the keyboard (SPEC §4.2). */
const rowMenu = ref<LayerNode | null>(null)
const wrapping = ref(false)
const ruleMenu = ref<RuleRow | null>(null)

function openRowMenu(event: MouseEvent, node: LayerNode) {
  anchor(event)
  wrapping.value = false
  rowMenu.value = rowMenu.value?.loc.start === node.loc.start ? null : node
}

const rowCommands = computed(() => {
  const node = rowMenu.value
  if (!node) return []
  const caps = props.can?.(node.loc) ?? ALL
  return [
    { kind: 'up', label: 'Move up', key: '⌥⇧↑', on: caps.up },
    { kind: 'down', label: 'Move down', key: '⌥⇧↓', on: caps.down },
    { kind: 'indent', label: 'Indent', key: '⌥⇧→', on: caps.indent },
    { kind: 'outdent', label: 'Outdent', key: '⌥⇧←', on: caps.outdent },
    { kind: 'unwrap', label: 'Unwrap', key: '', on: caps.unwrap },
    { kind: 'duplicate', label: 'Duplicate', key: '⌘⇧D', on: caps.duplicate },
  ]
})

const wrapTags = computed(() => ['div', 'span', 'p', ...(props.wrapChoices ?? [])])

function runCommand(kind: string, on = true) {
  const node = rowMenu.value
  if (!node || !on) return
  rowMenu.value = null
  emit('command', { kind, loc: node.loc })
}

// ---------------------------------------------------------------- insert menu

const insertOpen = ref(false)
const insertQuery = ref('')
const insertInput = useTemplateRef<HTMLInputElement>('insertInput')

/** Parent tag of the selected row (null at the block root) — decides which HTML fits (li in ul…). */
const parentTagOfSelected = computed(() => {
  if (!props.selected) return null
  const find = (nodes: LayerNode[], parent: LayerNode | null): LayerNode | null | undefined => {
    for (const n of nodes) {
      if (n.loc.start === props.selected!.start) return parent
      const hit = find(n.children, n)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  return find(props.tree, null)?.tag ?? null
})

const insertList = computed(() => {
  if (!props.insertables) return []
  const all = insertItems(props.insertables.components, props.insertables.snippets, parentTagOfSelected.value)
  const q = insertQuery.value.trim().toLowerCase()
  return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all
})

function openInsert(event: MouseEvent) {
  anchor(event, 288)
  insertOpen.value = true
  insertQuery.value = ''
  void nextTick(() => insertInput.value?.focus())
}

/** Enter inserts after the selection, ⌥Enter inside it (SPEC §4.8). */
function pickInsert(item: InsertItem | undefined, inside = false) {
  if (!item || item.illegal) return
  insertOpen.value = false
  emit('insert', { item, after: props.selected ?? null, inside })
}

// ---------------------------------------------------------------- rules

const renaming = ref<number | null>(null)
const renameText = ref('')
const pendingDelete = ref<RuleRow | null>(null)
const newRule = ref<string | null>(null)
const ruleInput = useTemplateRef<HTMLInputElement>('ruleInput')

function startRename(rule: RuleRow) {
  ruleMenu.value = null
  renaming.value = rule.start
  renameText.value = rule.selector
}

function commitRename() {
  const start = renaming.value
  const selector = renameText.value.trim()
  renaming.value = null
  if (start != null && selector) emit('rename-rule', { start, selector })
}

function commitNewRule() {
  const selector = newRule.value?.trim()
  newRule.value = null
  if (selector) emit('new-rule', selector)
}

function confirmDelete() {
  const rule = pendingDelete.value
  pendingDelete.value = null
  if (rule) emit('delete-rule', rule.start)
}

watch(newRule, (v) => { if (v !== null) void nextTick(() => ruleInput.value?.focus()) })

// ---- keyboard (design: real keyboard, no mouse-only affordances) ------------
const ALT_COMMANDS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'outdent', ArrowRight: 'indent' } as const

function onKeydown(event: KeyboardEvent) {
  const list = rows.value
  if (!list.length) return
  const i = activeIndex.value
  const current = list[i]?.node
  const step = (to: number) => emit('select', list[Math.min(Math.max(to, 0), list.length - 1)].node.loc)

  if (event.altKey && current && event.key in ALT_COMMANDS)
    emit('command', { kind: ALT_COMMANDS[event.key as keyof typeof ALT_COMMANDS], loc: current.loc })
  else if (event.key === 'ArrowDown') step(i + 1)
  else if (event.key === 'ArrowUp') step(i < 0 ? 0 : i - 1)
  else if (!current) return
  else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    if (current.children.length) toggleRow(current)
    else return
  } else if (event.key === 'Backspace' || event.key === 'Delete') emit('command', { kind: 'delete', loc: current.loc })
  else if (event.key === 'Enter') emit('select', current.loc)
  else return
  event.preventDefault()
}

// ---- drag & drop (native HTML5: no library, no ghost element of our own) ----
const dragging = ref<Loc>()
const drop = ref<{ start: number; position: Position }>()

function onDragStart(event: DragEvent, node: LayerNode) {
  dragging.value = node.loc
  // Firefox starts no drag at all without payload; the payload itself is never read.
  event.dataTransfer?.setData('text/plain', node.tag)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/** Top third = before, bottom third = after, middle = inside — where a child can go at all. */
function positionIn(event: DragEvent, node: LayerNode): Position {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const third = (event.clientY - box.top) / box.height
  if (node.selfClosing) return third < 0.5 ? 'before' : 'after'
  return third < 0.33 ? 'before' : third > 0.67 ? 'after' : 'inside'
}

function onDragOver(event: DragEvent, node: LayerNode) {
  if (!dragging.value || node.loc.start === dragging.value.start) return
  event.preventDefault() // "yes, you may drop here"
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  drop.value = { start: node.loc.start, position: positionIn(event, node) }
}

function onDrop(event: DragEvent, node: LayerNode) {
  event.preventDefault()
  const loc = dragging.value
  const position = drop.value?.position
  dragging.value = undefined
  drop.value = undefined
  if (loc && position && node.loc.start !== loc.start) emit('move', { loc, target: node.loc, position })
}

const dropAt = (node: LayerNode, position: Position) =>
  drop.value?.start === node.loc.start && drop.value.position === position

// ---- compact (E12) ---------------------------------------------------------
// One `<select>` instead of the lists: the active section's elements or rules, choosing one
// is the same `select` / `select-rule` a row click emits. `\u00a0` because a `<select>`
// collapses ordinary leading spaces, and depth is the only structure left in one line.
const onRules = computed(() => props.active === 'rules')

const pickOptions = computed(() =>
  onRules.value
    ? (props.rules ?? []).map((r) => ({ value: `r${r.start}`, label: `${r.selector} \u00d7${r.uses}` }))
    : rows.value.map((r) => ({
        value: `e${r.node.loc.start}`,
        label: '\u00a0\u00a0'.repeat(r.depth) + r.node.tag + (r.node.classes.length ? `.${r.node.classes.join('.')}` : ''),
      })),
)

const pickValue = computed(() =>
  onRules.value
    ? (props.selectedRule != null ? `r${props.selectedRule}` : '')
    : (props.selected ? `e${props.selected.start}` : ''),
)

function onPick(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const at = Number(value.slice(1))
  if (value.startsWith('r')) return emit('select-rule', at)
  const row = rows.value.find((r) => r.node.loc.start === at)
  if (row) emit('select', row.node.loc)
}
</script>

<template>
  <div class="layers-pane flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground">
    <!-- E12: one header, one select, the section's own dashed action. Same events. -->
    <template v-if="compact">
      <div class="head on">
        <span class="eyebrow">{{ onRules ? 'Rules' : 'Layers' }}</span>
        <select class="pick" :value="pickValue" :aria-label="onRules ? 'Rules' : 'Layers'" @change="onPick">
          <option value="" disabled>{{ pickOptions.length ? 'pick…' : (onRules ? 'no rules yet — add one with +' : 'no elements yet — insert one with +') }}</option>
          <option v-for="o in pickOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div class="px-2 py-2">
        <input
          v-if="onRules && newRule !== null" ref="ruleInput" v-model="newRule" class="rule-input" placeholder=".selector"
          @keydown.enter.prevent="commitNewRule" @keydown.escape="newRule = null" @blur="commitNewRule"
        >
        <button v-else-if="onRules" type="button" class="dashed" @click="newRule = ''">+ New rule</button>
        <button v-else-if="insertables" type="button" class="dashed" @click="openInsert">+ Insert element</button>
      </div>
    </template>

    <template v-else>
    <!-- ---------------------------------------------------------- LAYERS -->
    <button type="button" class="head" :class="{ on: active === 'layers' }" @click="emit('toggle', 'layers')">
      <span class="eyebrow flex-1 text-left">Layers</span>
      <span class="meta">{{ total }} element{{ total === 1 ? '' : 's' }}</span>
      <span class="chev">{{ isOpen('layers') ? '▾' : '▸' }}</span>
    </button>

    <div
      v-if="isOpen('layers')"
      role="tree"
      tabindex="0"
      aria-label="Layers"
      :aria-activedescendant="activeIndex >= 0 ? rowId(activeIndex) : undefined"
      class="list"
      :class="grows('layers') ? 'min-h-0 flex-1' : 'max-h-[38%] flex-none'"
      @keydown="onKeydown"
    >
      <div
        v-for="(row, i) in rows"
        :id="rowId(i)"
        :key="row.node.loc.start"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-selected="isSelected(row.node)"
        :aria-expanded="row.node.children.length ? !folded.has(row.node.loc.start) : undefined"
        draggable="true"
        class="row group"
        :class="[
          isSelected(row.node) && 'selected',
          dropAt(row.node, 'inside') && 'ring-1 ring-[var(--primary)] ring-inset',
          matches && !matches(row.node) && 'opacity-45',
        ]"
        :style="{ paddingLeft: `${9 + row.depth * 23}px` }"
        @click="emit('select', row.node.loc)"
        @dblclick="onDoubleClick(row.node)"
        @dragstart="onDragStart($event, row.node)"
        @dragend="((dragging = undefined), (drop = undefined))"
        @dragover="onDragOver($event, row.node)"
        @drop="onDrop($event, row.node)"
      >
        <span v-if="dropAt(row.node, 'before')" class="line" style="top: -1px" />
        <span v-if="dropAt(row.node, 'after')" class="line" style="bottom: -1px" />

        <button
          v-if="row.node.children.length"
          type="button"
          class="caret"
          :title="folded.has(row.node.loc.start) ? 'expand' : 'collapse'"
          @click.stop="toggleRow(row.node)"
        >{{ folded.has(row.node.loc.start) ? '▸' : '▾' }}</button>

        <span class="tag">{{ row.node.tag }}</span>
        <span v-if="row.node.classes.length" class="cls min-w-0 truncate">.{{ row.node.classes.join('.') }}</span>
        <span v-if="row.node.isComponent" class="badge" :class="isSnippet(row.node) ? 'snip' : 'comp'" aria-hidden="true">
          {{ isSnippet(row.node) ? 'S' : 'C' }}
        </span>

        <span class="flex-1" />
        <span v-for="hint in row.node.hints" :key="hint" class="hint">{{ hint }}</span>
        <button type="button" class="dots" aria-label="commands" @click.stop="openRowMenu($event, row.node)">⋯</button>
      </div>

      <p v-if="!rows.length" class="empty">no elements yet — insert one with +</p>
    </div>

    <div v-if="isOpen('layers')" class="px-2 pb-2">
      <button v-if="insertables" type="button" class="dashed" @click="openInsert">+ Insert element</button>
    </div>

    <!-- ----------------------------------------------------------- RULES -->
    <button type="button" class="head hair" :class="{ on: active === 'rules' }" @click="emit('toggle', 'rules')">
      <span class="eyebrow flex-1 text-left">Rules</span>
      <span class="meta">{{ rules?.length ?? 0 }}</span>
      <span class="chev">{{ isOpen('rules') ? '▾' : '▸' }}</span>
    </button>

    <div v-if="isOpen('rules')" class="list" :class="grows('rules') ? 'min-h-0 flex-1' : 'max-h-[38%] flex-none'">
      <div
        v-for="rule in rules"
        :key="rule.start"
        class="row group"
        :class="selectedRule === rule.start && 'selected'"
        @click="emit('select-rule', rule.start)"
      >
        <input
          v-if="renaming === rule.start" v-model="renameText" class="rename"
          @click.stop @keydown.enter.prevent="commitRename" @keydown.escape="renaming = null" @blur="commitRename"
        >
        <template v-else>
          <span class="tag">{{ rule.selector }}</span>
          <span class="flex-1" />
          <span class="hint" :class="!rule.uses && 'unused'">×{{ rule.uses }}</span>
          <button type="button" class="dots" aria-label="commands" @click.stop="(anchor($event), (ruleMenu = ruleMenu?.start === rule.start ? null : rule))">⋯</button>
        </template>
      </div>

      <p v-if="!rules?.length" class="empty">no rules yet — add one with +</p>
    </div>

    <div v-if="isOpen('rules')" class="px-2 pb-2">
      <!-- Delete confirm and the new-rule input are inline bars under the section they belong to. -->
      <div v-if="pendingDelete" class="confirm">
        <span class="flex-1">Delete {{ pendingDelete.selector }} and strip it from {{ pendingDelete.uses }} elements?</span>
        <button type="button" class="text-[var(--destructive)] hover:underline" @click="confirmDelete">Delete</button>
        <button type="button" class="text-muted-foreground hover:text-foreground" @click="pendingDelete = null">Cancel</button>
      </div>
      <input
        v-else-if="newRule !== null" ref="ruleInput" v-model="newRule" class="rule-input" placeholder=".selector"
        @keydown.enter.prevent="commitNewRule" @keydown.escape="newRule = null" @blur="commitNewRule"
      >
      <button v-else type="button" class="dashed" @click="newRule = ''">+ New rule</button>
    </div>

    <!-- ---------------------------------------------------------- SCRIPT -->
    <div class="head hair" :class="{ on: active === 'script' }">
      <button type="button" class="flex flex-1 items-center gap-2" @click="emit('open-script')">
        <span class="eyebrow flex-1 text-left">Script</span>
        <!-- E1 · E2: `opens Code` in Blocks (there is no editor pane there), `→ tab` otherwise. -->
        <span class="meta">{{ !script ? '–' : opensCode ? 'opens Code' : '→ tab' }}</span>
      </button>
      <button v-if="script" type="button" class="chev" @click="emit('toggle', 'script')">{{ isOpen('script') ? '▾' : '▸' }}</button>
    </div>

    <div v-if="script && isOpen('script')" class="list" :class="grows('script') ? 'min-h-0 flex-1' : 'flex-none'">
      <div v-for="p in script.props" :key="p.name" class="row cursor-default">
        <span class="tag">{{ p.name }}</span>
        <span class="cls">{{ p.type }}</span>
      </div>
      <p v-if="!script.props.length" class="empty !pb-2 font-mono">{{ script.lines }} lines</p>
    </div>

    </template>

    <!-- --------------------------------------------------------- popovers -->
    <template v-if="rowMenu || ruleMenu || insertOpen">
      <span class="backdrop" @click="((rowMenu = null), (ruleMenu = null), (insertOpen = false))" />

      <!-- `⋯` on an element row -->
      <div v-if="rowMenu" class="menu" :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, width: '220px' }">
        <template v-if="wrapping">
          <button type="button" class="item" @click="wrapping = false"><span class="flex-1 text-left">‹ Back</span></button>
          <button v-for="tag in wrapTags" :key="tag" type="button" class="item mono" @click="runCommand(`wrap:${tag}`)">
            <span class="flex-1 text-left">{{ tag }}</span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="item in rowCommands" :key="item.kind" type="button" class="item"
            :disabled="!item.on" @click="runCommand(item.kind, item.on)"
          >
            <span class="flex-1 text-left">{{ item.label }}</span>
            <span class="key">{{ item.key }}</span>
          </button>
          <button type="button" class="item" @click.stop="wrapping = true">
            <span class="flex-1 text-left">Wrap in…</span><span class="key">›</span>
          </button>
          <button
            v-if="isSnippet(rowMenu)" type="button" class="item"
            @click="((emit('enter-scope', rowMenu!.tag)), (rowMenu = null))"
          >
            <span class="flex-1 text-left">Enter scope</span>
          </button>
          <hr>
          <button type="button" class="item danger" @click="runCommand('delete')">
            <span class="flex-1 text-left">Delete</span><span class="key">⌘⇧K</span>
          </button>
        </template>
      </div>

      <!-- `⋯` on a rule row -->
      <div v-if="ruleMenu" class="menu" :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, width: '260px' }">
        <button type="button" class="item" @click="startRename(ruleMenu)"><span class="flex-1 text-left">Rename</span></button>
        <hr>
        <button type="button" class="item danger" @click="((pendingDelete = ruleMenu), (ruleMenu = null))">
          <span class="flex-1 text-left">Delete rule… — also strips {{ ruleMenu.selector }} from {{ ruleMenu.uses }} elements</span>
        </button>
      </div>

      <!-- `+ Insert element` -->
      <div v-if="insertOpen" class="menu" :style="{ top: `${menuPos.top}px`, left: `${menuPos.left}px`, width: '288px' }" @keydown.escape="insertOpen = false">
        <input
          ref="insertInput" v-model="insertQuery" placeholder="component or element…"
          @keydown.enter.prevent="pickInsert(insertList.find((i) => !i.illegal), $event.altKey)"
        >
        <ul role="listbox">
          <li
            v-for="item in insertList" :key="item.kind + item.name" role="option"
            :class="item.illegal && 'off'" @mousedown.prevent="pickInsert(item, $event.altKey)"
          >
            <span class="badge" :class="item.kind === 'html' ? 'html' : item.kind === 'snippet' ? 'snip' : 'comp'">
              {{ item.kind === 'html' ? '&lt;&gt;' : item.kind === 'snippet' ? 'S' : 'C' }}
            </span>
            <span class="name">{{ item.name }}</span>
            <span class="hint">{{ item.illegal ?? item.hint }}</span>
          </li>
          <li v-if="!insertList.length" class="none">nothing fits here</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Row colours are tokens (VISUAL-SPEC §3); `--row-hover` and the component badge live in
   tokens.css so nothing here names a colour of its own. */
.layers-pane {
  --row-tag: var(--foreground);
  --row-class: var(--muted-foreground);
}

/* ---- section header: 34px, eyebrow left, mono meta right, ▾ collapse ---- */
.head {
  display: flex; align-items: center; gap: 8px; flex: none;
  height: 34px; padding: 10px 12px 8px; background: transparent; border: 0; width: 100%;
}
.head.hair { border-top: 1px solid var(--section-border); }
.head.on .eyebrow { color: var(--foreground); }
.meta { font-family: var(--font-mono); font-size: 10.5px; font-weight: 450; color: var(--meta-foreground); }
.chev { flex: none; font-size: 8px; color: var(--muted-foreground); background: transparent; border: 0; }

/* ---- rows ---- */
.list { padding: 0 8px 8px; overflow-y: auto; outline: none; }
.list:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.row {
  position: relative; display: flex; align-items: center; gap: 7px;
  height: 27px; padding: 0 9px; border-radius: var(--radius-control); cursor: pointer;
  font-family: var(--font-mono); font-size: 11.5px; font-weight: 500; color: var(--row-tag);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.row:hover { background: var(--row-hover); }
.row.selected {
  background: var(--accent); color: var(--accent-foreground);
  box-shadow: inset 0 0 0 1px var(--primary);
}
.tag { flex: none; }
.cls { color: var(--row-class); }
.row.selected .cls { color: inherit; opacity: 0.65; }
.hint { font-family: var(--font-mono); font-size: 9px; font-weight: 450; color: var(--meta-foreground); }
.hint.unused { color: var(--warning-foreground); }
.empty { padding: 6px 9px 28px; text-align: center; font-size: 11px; color: var(--muted-foreground); }

.badge {
  flex: none; padding: 2.5px 4px; border-radius: var(--radius-badge);
  font-family: var(--font-sans); font-size: 8.5px; font-weight: 600; line-height: 1;
}
.badge.snip { background: var(--info-bg); color: var(--info); }
.badge.comp { background: var(--comp-bg); color: var(--comp-fg); }
.badge.html { background: var(--field); color: var(--muted-foreground); }

.caret { flex: none; font-size: 8px; color: var(--muted-foreground); background: transparent; border: 0; }
/* `⋯` appears on hover, and stays on the selected row. */
.dots {
  flex: none; width: 14px; border: 0; background: transparent; color: var(--muted-foreground);
  opacity: 0; font-size: 12px; line-height: 1;
}
.row:hover .dots, .row.selected .dots, .dots:focus-visible { opacity: 1; }
.row.selected .dots { color: inherit; font-weight: 600; }
.caret:focus-visible, .dots:focus-visible { outline: 2px solid var(--primary); border-radius: var(--radius-control); }

/* Drop indicator: a 2px accent rule between rows; "inside" is an inset ring on the row. */
.line { position: absolute; left: 9px; right: 9px; height: 2px; border-radius: 999px; background: var(--primary); pointer-events: none; }

/* ---- footer actions: the one dashed control per section ---- */
.dashed {
  width: 100%; height: 32px; border: 1px dashed var(--dashed); border-radius: var(--radius-control); background: transparent;
  font-size: 11px; font-weight: 500; color: var(--accent-link);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.dashed:hover { border-color: var(--primary); background: var(--accent); }
.pick {
  flex: 1; min-width: 0; height: 24px; padding: 0 6px; border: 1px solid transparent; border-radius: var(--radius-control);
  background: var(--field); font-family: var(--font-mono); font-size: 11.5px; color: var(--foreground);
}
.rule-input, .rename {
  width: 100%; height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-control);
  background: var(--field); font-family: var(--font-mono); font-size: 11.5px; outline: none;
}
.rule-input:focus-visible, .rename:focus-visible { border-color: var(--primary); background: var(--pane); }
.confirm { display: flex; align-items: center; gap: 8px; padding: 6px 2px; font-size: 11px; line-height: 1.35; }

/* ---- popovers (SPEC §4.8) ---- */
.backdrop { position: fixed; inset: 0; z-index: 19; }
.menu {
  position: fixed; z-index: 60; padding: 6px;
  border: 1px solid var(--field-border); border-radius: var(--radius-trough); background: var(--popover);
  box-shadow: var(--shadow-popover);
}
.menu hr { margin: 4px 0; border: 0; border-top: 1px solid var(--section-border); }
.item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 9px; border: 0; border-radius: var(--radius-control);
  background: transparent; font-size: 12px; color: var(--popover-foreground); text-align: left;
}
.item.mono { font-family: var(--font-mono); font-size: 11.5px; }
.item:hover:not(:disabled) { background: var(--accent); }
.item:disabled { opacity: 0.4; }
.item.danger { color: var(--destructive); }
.key { font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }

.menu input { width: 100%; height: 28px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--field); font-size: 12px; outline: none; }
.menu input:focus-visible { border-color: var(--primary); background: var(--pane); }
.menu ul { max-height: 260px; margin: 6px 0 0; padding: 0; overflow: auto; list-style: none; }
.menu li { display: flex; align-items: center; gap: 8px; height: 26px; padding: 0 6px; border-radius: var(--radius-control); cursor: default; }
.menu li:hover:not(.off) { background: var(--accent); }
.menu li.off { opacity: 0.45; }
.menu li.none { color: var(--muted-foreground); font-size: 11px; }
.menu .name { font-family: var(--font-mono); font-size: 11.5px; font-weight: 500; }
.menu .hint { margin-left: auto; }
</style>
