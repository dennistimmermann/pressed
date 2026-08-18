<!-- The 44px block-tab strip (design README-tabs §3/§5/§7/§11). Stateless apart from the
     add menu and the inline rename box: which tab is active is the host's business. -->
<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { blockOf, tabKey, type BlockKind, type TabBlock, type TabRef, type TabsModel } from './tabs'

export type Badge = { level: 'error' | 'warning'; count: number }

const props = withDefaults(
  defineProps<{
    model: TabsModel
    active: TabRef
    /** Snippet the blocks trough is scoped to; `null` = the label itself. */
    scope: string | null
    /** Worst message per tab, keyed by `tabKey` — a snippet pill sums its own blocks. */
    badges?: Record<string, Badge>
    /** ≤900px: both troughs collapse into one select (§11). */
    narrow?: boolean
  }>(),
  { badges: () => ({}), narrow: false },
)

const emit = defineEmits<{
  select: [tab: TabRef]
  'leave-scope': []
  'enter-scope': [name: string]
  add: [kind: 'script' | 'style' | 'snippet', name?: string]
  rename: [name: string]
  promote: [name: string]
  delete: [name: string]
}>()

// ---------------------------------------------------------------- pills

const blocks = computed(() =>
  props.scope === null ? props.model.blocks : (props.model.snippets.find((s) => s.name === props.scope)?.blocks ?? []),
)

const NOUN: Partial<Record<BlockKind, string>> = { template: 'element', style: 'rule' }
/** `12 elements` · `7 rules` · `empty`; script carries no count (README-tabs §12.2). */
function countText(b: TabBlock): string {
  if (b.empty) return 'empty'
  const noun = NOUN[b.kind]
  return b.count === null || !noun ? '' : `${b.count} ${noun}${b.count === 1 ? '' : 's'}`
}

const title = (kind: BlockKind) => kind[0].toUpperCase() + kind.slice(1)
const isActive = (tab: TabRef) => tabKey(tab) === tabKey(props.active)
const badgeOf = (tab: TabRef): Badge | undefined => props.badges[tabKey(tab)]

/** A snippet pill stands for the whole snippet: worst level, summed counts. */
function snippetBadge(name: string): Badge | undefined {
  const parts = (props.model.snippets.find((s) => s.name === name)?.blocks ?? [])
    .map((b) => badgeOf({ scope: name, kind: b.kind }))
    .filter((x): x is Badge => !!x)
  if (!parts.length) return undefined
  return {
    level: parts.some((p) => p.level === 'error') ? 'error' : 'warning',
    count: parts.reduce((n, p) => n + p.count, 0),
  }
}

// ---------------------------------------------------------------- add menu

const menuOpen = ref(false)
const naming = ref(false)
const newName = ref('')
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

/** Blocks that do not exist in this scope — the `+` pill in the blocks trough offers exactly these (§7). */
const addItems = computed(() => {
  const items: { kind: 'script' | 'style'; label: string; description: string }[] = []
  if (!blockOf(props.model, { scope: props.scope, kind: 'script' }))
    items.push({ kind: 'script', label: '+ script', description: '<script setup lang="ts"> for the whole label' })
  if (!blockOf(props.model, { scope: props.scope, kind: 'style' }))
    items.push({ kind: 'style', label: '+ style', description: '<style> block · rules for this label' })
  return items
})
/** All add options for the narrow <select>, snippet included. */
const allAddItems = computed(() => [...addItems.value, ...(props.scope === null ? [{ kind: 'snippet' as const, label: '+ snippet', description: '' }] : [])])

function pick(kind: 'script' | 'style' | 'snippet') {
  if (kind === 'snippet') {
    naming.value = true
    newName.value = ''
    return nextTick(() => nameInput.value?.focus())
  }
  menuOpen.value = false
  emit('add', kind)
}

function closeMenu() {
  menuOpen.value = false
}

function commitName() {
  const name = newName.value.trim()
  naming.value = false
  if (name) emit('add', 'snippet', name)
}

// ---------------------------------------------------------------- inline rename

const renaming = ref(false)
const renameText = ref('')
const renameInput = useTemplateRef<HTMLInputElement>('renameInput')

function startRename() {
  renaming.value = true
  renameText.value = props.scope ?? ''
  nextTick(() => renameInput.value?.select())
}

function commitRename() {
  const name = renameText.value.trim()
  renaming.value = false
  if (name && name !== props.scope) emit('rename', name)
}

// ---------------------------------------------------------------- ≤900px select

/** `template` / `temp` — one flat list, the add menu is its last entry (§11). */
const narrowValue = computed(() => (props.scope === null ? tabKey(props.active) : `snippet:${props.scope}`))

function onNarrowChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value.startsWith('add:')) return emit('add', value.slice(4) as 'script' | 'style' | 'snippet') // host names a new snippet
  if (value.startsWith('snippet:')) return emit('enter-scope', value.slice(8))
  const slash = value.indexOf('/')
  emit('select', slash < 0
    ? { scope: null, kind: value as BlockKind }
    : { scope: value.slice(0, slash), kind: value.slice(slash + 1) as BlockKind })
}
</script>

<template>
  <div class="strip" :class="{ narrow }">
    <template v-if="narrow">
      <select class="one" :value="narrowValue" aria-label="Block" @change="onNarrowChange">
        <option v-for="b in blocks" :key="b.kind" :value="tabKey({ scope, kind: b.kind })">
          {{ scope ? `${scope} › ` : '' }}{{ title(b.kind) }}{{ badgeOf({ scope, kind: b.kind }) ? ` ●${badgeOf({ scope, kind: b.kind })!.count}` : '' }}
        </option>
        <option v-for="s in model.snippets" :key="s.name" :value="`snippet:${s.name}`">
          {{ s.name }}{{ snippetBadge(s.name) ? ` ●${snippetBadge(s.name)!.count}` : '' }}
        </option>
        <option v-for="item in allAddItems" :key="item.kind" :value="`add:${item.kind}`">{{ item.label }}</option>
      </select>
      <button v-if="scope" type="button" class="text" @click="emit('leave-scope')">← label</button>
    </template>

    <template v-else>
      <!-- Scope chip: accent fill + inset ring, the one selection treatment in the app (§1). -->
      <span v-if="scope" class="scope">
        <button type="button" class="back" :aria-label="`Leave ${scope}`" @click="emit('leave-scope')">←</button>
        <input
          v-if="renaming"
          ref="renameInput"
          v-model="renameText"
          class="rename"
          aria-label="Snippet name"
          @keydown.enter="commitRename"
          @keydown.esc="renaming = false"
          @blur="commitRename"
        />
        <span v-else class="name">{{ scope }}</span>
        <span class="sep" aria-hidden="true">›</span>
      </span>

      <div class="trough" role="tablist" aria-label="Blocks">
        <button
          v-for="b in blocks"
          :key="b.kind"
          type="button"
          role="tab"
          class="pill"
          :class="{ on: isActive({ scope, kind: b.kind }) }"
          :aria-selected="isActive({ scope, kind: b.kind })"
          @click="emit('select', { scope, kind: b.kind })"
        >
          <span class="label">{{ title(b.kind) }}</span>
          <span v-if="countText(b)" class="count">{{ countText(b) }}</span>
          <span v-if="badgeOf({ scope, kind: b.kind })" class="badge" :class="badgeOf({ scope, kind: b.kind })!.level">
            {{ badgeOf({ scope, kind: b.kind })!.count }}
          </span>
        </button>
        <!-- `+` as a pill: adds whichever block is still missing here. -->
        <span v-if="addItems.length" class="add-wrap">
          <button type="button" class="pill plus" :class="{ open: menuOpen }" aria-label="Add block" @click="menuOpen = !menuOpen">+</button>
          <template v-if="menuOpen">
            <span class="backdrop" @click="closeMenu" />
            <div class="menu">
              <div class="menu-head">Add block</div>
              <button v-for="item in addItems" :key="item.kind" type="button" class="menu-item" @click="pick(item.kind)">
                <span class="k">{{ item.label }}</span>
                <span class="d">{{ item.description }}</span>
              </button>
              <div class="menu-foot">inserted in file order · the new tab opens focused</div>
            </div>
          </template>
        </span>
      </div>

      <template v-if="model.snippets.length || scope === null">
        <span class="snippets-label">Snippets</span>
        <div class="trough snippets" role="tablist" aria-label="Snippets">
          <button
            v-for="s in model.snippets"
            :key="s.name"
            type="button"
            role="tab"
            class="pill mono"
            :class="{ on: s.name === scope }"
            :aria-selected="s.name === scope"
            @click="emit('enter-scope', s.name)"
          >
            <span class="label">{{ s.name }}</span>
            <span v-if="snippetBadge(s.name)" class="badge" :class="snippetBadge(s.name)!.level">{{ snippetBadge(s.name)!.count }}</span>
          </button>
          <!-- `+` snippet: the name is typed right here, in the trough. -->
          <template v-if="scope === null">
            <input
              v-if="naming"
              ref="nameInput"
              v-model="newName"
              class="new-name"
              placeholder="snippet name"
              aria-label="Snippet name"
              @keydown.enter="commitName"
              @keydown.esc="naming = false"
              @blur="commitName"
            />
            <button v-else type="button" class="pill plus" aria-label="Add snippet" @click="pick('snippet')">+</button>
          </template>
        </div>
      </template>

    </template>

    <span class="grow" />

    <!-- Three actions, all one click: no ⋯ menu (§5). -->
    <template v-if="scope && !narrow">
      <button type="button" class="text" @click="startRename">Rename</button>
      <button type="button" class="text" @click="emit('promote', scope)">Promote to library</button>
      <button type="button" class="text danger" @click="emit('delete', scope)">Delete</button>
    </template>

    <span v-if="!narrow" class="hint">⌥1…9 · ⌘⌥[ ]</span>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  white-space: nowrap;
}
.strip > * {
  flex: none;
}
.grow {
  flex: 1 1 auto;
}

/* Segmented control, same vocabulary as the view switcher (§3). */
.trough {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--muted);
}
.trough.snippets {
  max-width: 260px;
  overflow-x: auto;
  scrollbar-width: none;
}
.pill {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  /* The only animation in this pass: a programmatic switch is legible (§9). */
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out;
}
.pill .label {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 12px;
  font-weight: 450;
  color: oklch(0.45 0.01 60);
}
.pill.mono .label {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
}
.pill.on {
  background: var(--card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.07);
}
.pill.on .label {
  font-weight: 600;
  color: var(--foreground);
}
.pill .count {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--muted-foreground);
}
.badge {
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.5;
}
.badge.error {
  background: oklch(0.95 0.035 25);
  color: oklch(0.48 0.17 25);
}
.badge.warning {
  background: oklch(0.96 0.035 85);
  color: oklch(0.46 0.11 75);
}

.snippets-label {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

/* Scope chip (§5): accent + 1px inset ring, never a fill of --primary. */
.scope {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 9px 0 7px;
  border-radius: 7px;
  background: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent-border);
  font-family: var(--font-mono, ui-monospace, monospace);
}
.scope .back {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 11px;
  color: oklch(0.5 0.1 40);
  cursor: pointer;
}
.scope .name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent-foreground);
}
.scope .sep {
  font-size: 11px;
  color: oklch(0.55 0.06 40);
}
.scope .rename {
  width: 9ch;
  border: 0;
  border-bottom: 1px solid var(--accent-border);
  background: transparent;
  font: 600 11.5px var(--font-mono, ui-monospace, monospace);
  color: var(--accent-foreground);
  outline: none;
}

.add-wrap {
  position: relative;
}
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 19;
}
.pill.plus {
  padding: 0 10px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  color: var(--muted-foreground);
}
.pill.plus:hover,
.pill.plus.open {
  border: 1px solid var(--primary);
  background: var(--accent);
  color: var(--primary);
}
.new-name {
  height: 28px;
  width: 140px;
  padding: 0 9px;
  border: 1px solid var(--input);
  border-radius: 6px;
  background: var(--card);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  outline: none;
}
.new-name:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
.menu {
  position: absolute;
  top: 32px;
  left: 0;
  z-index: 20;
  width: 392px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--popover);
  box-shadow: 0 18px 40px -14px rgb(0 0 0 / 0.3);
  overflow: hidden;
  white-space: normal;
}
.menu-head {
  padding: 8px 11px 6px;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.menu-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 7px 11px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}
.menu-item:hover {
  background: var(--muted);
}
.menu-item .k {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--foreground);
}
.menu-item .d {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10.5px;
  color: var(--muted-foreground);
}
.menu-foot {
  padding: 8px 11px;
  border-top: 1px solid var(--border);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--muted-foreground);
}

.text {
  border: 0;
  background: none;
  padding: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 10.5px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: color 120ms ease-out;
}
.text:hover {
  color: var(--foreground);
}
.text.danger {
  color: var(--destructive);
}
.hint {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--muted-foreground);
}

.one {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--muted);
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 12px;
  font-weight: 600;
}
</style>
