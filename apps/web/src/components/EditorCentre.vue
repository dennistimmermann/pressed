<!--
  The centre column: the editor for the active block over a tabbed bottom pane — Template:
  Attributes · Components · Variables; Style: the style pane; Script: nothing.

  The tab's kind decides the body's shape (README-tabs §4) — Template gets the property
  editor, Style the alignment slot, Script nothing at all — and that moving geometry is the
  honest signal of what each block has to offer, so it is written down once, here.
-->
<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { librarySources } from '@sprint/core/library/index.ts'
import { PropertyEditor, SfcEditor, StylePane } from '@sprint/editor'
import type { ComponentSchema } from '@sprint/editor/types.ts'
import { ruleAt } from '@sprint/editor/css.ts'
import { boxAt } from '@sprint/editor/ast.ts'
import type { EditorHandle } from '@sprint/editor/editor-handle.ts'
import type { BlockKind } from '@sprint/editor/tabs.ts'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { data } from '@/stores/data'
import { activeBlock, addClassToElement, availableClasses, caretLine, deleteRule, editor, element, elementSchema, ensureSelector, filename, handle, removeClassFromElement, renameRule, styleTargets, visible } from '@/stores/editor'
import { settings } from '@/stores/settings'

// Pane props are assembled by the view (they need data/preview state) and passed through.
/** What the editor's `+` popups offer: the library/snippet schemas and the flat variable list. */
const props = defineProps<{
  insertComponents: { library: ComponentSchema[]; snippets: ComponentSchema[] }
  insertVariables: { path: string; hint: string }[]
}>()

const kind = computed(() => editor.activeTab.kind)
type BottomTab = 'attributes' | 'style'
const BOTTOM: { id: BottomTab; label: string }[] = [{ id: 'attributes', label: 'Attributes' }, { id: 'style', label: 'Style' }]
const bottom = ref<BottomTab>('attributes')

// Style tab (on Template): one sub-tab per class of the element at the caret, `+` adds one.
// Everything that styles the caret's element, in cascade order: `*` → tag → classes → #id (store: styleTargets).
const classes = computed(() => styleTargets.value.filter((t) => t.kind === 'class').map((t) => t.selector.slice(1)))
const styleClass = ref<string | null>(null) // selected target's selector
const currentTarget = computed(() => styleTargets.value.find((t) => t.selector === styleClass.value) ?? styleTargets.value.at(-1) ?? null)
const currentClass = computed(() => (currentTarget.value?.kind === 'class' ? currentTarget.value.selector.slice(1) : null))
const classRule = computed(() => currentTarget.value?.rule ?? null)
// `+` opens a small menu: existing classes not yet on the element, plus a "new" line.
const classMenu = ref(false)
const newClass = ref('')
const newClassInput = useTemplateRef<HTMLInputElement>('newClassInput')
const otherClasses = computed(() => (classMenu.value ? availableClasses().filter((c) => !classes.value.includes(c.name)) : []))
/** Element / global rules that don't exist yet — offered by the menu as well. */
const otherTargets = computed(() => {
  if (!classMenu.value || !element.value) return []
  const has = new Set(styleTargets.value.map((t) => t.selector))
  return [element.value.tag, '*'].filter((sel) => !has.has(sel))
})
watch(classMenu, (open) => { if (open) { newClass.value = ''; void nextTick(() => newClassInput.value?.focus()) } })
function pickClass(name: string) {
  const cls = name.trim().replace(/^\./, '')
  classMenu.value = false
  if (!cls) return
  addClassToElement(cls)
  styleClass.value = `.${cls}`
}
function pickSelector(selector: string) {
  classMenu.value = false
  ensureSelector(selector)
  styleClass.value = selector
}
/** A class chip in Attributes opens that class in the Style tab (no jump to the Style block). */
function showClass(cls: string) { styleClass.value = `.${cls}`; bottom.value = 'style' }
const rule = computed(() => (kind.value === 'style' ? ruleAt(editor.source, editor.caret) : null))

// A block that exists but is empty says what it is *for* (README-tabs §7); typing dismisses it.
const EMPTY: Record<BlockKind, { title: string; body: string }> = {
  template: {
    title: 'Nothing here yet',
    body: 'The markup that becomes the label. Click a component on the left to insert it, or type HTML — a field of the current row goes in as `{{ row.name }}`, and the classes you use here are the ones you style.',
  },
  style: {
    title: 'Nothing here yet',
    body: 'Rules you write here apply to this label only. Class names come from the template — `.title`, `.qr` — and `mm` is a real millimetre.',
  },
  script: {
    title: 'Nothing here yet',
    body: 'TypeScript that runs once per row before the label renders: compute here what the template should not have to, e.g. `const grams = Math.round(row.remaining_weight)`. It runs in the sandboxed runtime frame, so no timers and no fetching.',
  },
}
const emptyText = computed(() => (activeBlock.value?.empty ? EMPTY[kind.value] : null))

const editorProps = computed(() => ({
  modelValue: editor.source,
  'onUpdate:modelValue': (value: string) => { editor.source = value },
  contextType: data.rowType,
  libraryComponents: librarySources,
  filename: filename.value,
  highlight: boxAt(editor.source, editor.caret),
  visible: visible.value,
  emptyText: emptyText.value,
  insertables: kind.value === 'template' ? { components: props.insertComponents.library, snippets: props.insertComponents.snippets } : null,
  variables: kind.value === 'template' ? props.insertVariables : null,
  onCaret: (offset: number) => { editor.caret = offset },
  onReady: (h: EditorHandle) => { handle.value = h },
}))

const sizes = computed(() => settings.paneSizes.centre ?? [80, 20])
// The Script tab has one panel; a `[100]` layout is not a split worth remembering.
const persistCentre = (layout: number[]) => { if (layout.length === 2) settings.paneSizes.centre = layout }
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!--
      One editor for every tab: SfcEditor stays mounted across switches (it owns a language
      service worker — remounting it per tab would spawn a new one each time). Only the pane
      under it changes: property editor on Template, the alignment slot on Style, nothing on
      Script (design §3.4, README-tabs §4/§8).
    -->
    <ResizablePanelGroup direction="vertical" class="min-h-0 flex-1" @layout="persistCentre">
      <ResizablePanel :order="1" :default-size="kind === 'script' ? 100 : sizes[0]" :min-size="30">
        <SfcEditor v-bind="editorProps" class="h-full" />
      </ResizablePanel>
      <template v-if="kind !== 'script'">
        <ResizableHandle with-handle class="cursor-row-resize [&>div]:h-[34px] [&>div]:w-[3px]" />
        <ResizablePanel :order="2" :default-size="sizes[1]" :min-size="10">
          <div v-if="kind === 'template'" class="flex h-full min-h-0 flex-col">
            <!-- The bottom pane's own strip: the same troughs as the block tabs above. With Style
                 selected, a second trough lists the element's classes, `+` adds one. -->
            <div class="strip">
              <div class="trough" role="tablist">
                <button
                  v-for="t in BOTTOM" :key="t.id" type="button" role="tab" :aria-selected="bottom === t.id"
                  class="pill" :class="{ on: bottom === t.id }" @click="bottom = t.id"
                ><span class="label">{{ t.label }}</span></button>
              </div>
              <template v-if="bottom === 'style' && element">
                <span class="eyebrow">applies</span>
                <div class="trough" role="tablist">
                  <template v-for="(t, i) in styleTargets" :key="t.selector">
                    <!-- A dot between cascade levels: * · div · .a .b · #id -->
                    <span v-if="i > 0 && styleTargets[i - 1].kind !== t.kind" class="sep" aria-hidden="true">·</span>
                    <button
                      type="button" role="tab" :aria-selected="currentTarget?.selector === t.selector"
                      class="pill mono" :class="{ on: currentTarget?.selector === t.selector, faint: !t.rule }" :title="t.rule ? t.selector : `${t.selector} — no rule yet`"
                      @click="styleClass = t.selector"
                    ><span class="label">{{ t.label }}</span></button>
                  </template>
                  <span class="add-wrap">
                    <button type="button" class="add" :class="{ open: classMenu }" title="add a class to this element" aria-label="add class" @click="classMenu = !classMenu">+</button>
                    <template v-if="classMenu">
                      <span class="backdrop" @click="classMenu = false" />
                      <div class="menu">
                        <div class="menu-head">Add</div>
                        <button v-for="sel in otherTargets" :key="sel" type="button" class="menu-item" @click="pickSelector(sel)">
                          <span class="k">{{ sel }}</span>
                          <span class="d">{{ sel === '*' ? 'every element' : 'every ' + sel }}</span>
                        </button>
                        <button v-for="c in otherClasses" :key="c.name" type="button" class="menu-item" @click="pickClass(c.name)">
                          <span class="k">.{{ c.name }}</span>
                          <span class="d">{{ c.declarations }} declaration{{ c.declarations === 1 ? '' : 's' }}</span>
                        </button>
                        <div v-if="!otherClasses.length && !otherTargets.length" class="menu-empty">everything already applies here</div>
                        <div class="menu-new">
                          <input
                            ref="newClassInput" v-model="newClass" placeholder="new class…" class="new-class"
                            @keydown.enter="pickClass(newClass)" @keydown.escape="classMenu = false"
                          >
                        </div>
                      </div>
                    </template>
                  </span>
                </div>
              </template>
            </div>
            <div class="min-h-0 flex-1">
              <PropertyEditor v-if="bottom === 'attributes'" :element="element" :schema="elementSchema" :handle="handle" :line="caretLine" class="h-full" @style="showClass" />
              <div v-else class="flex h-full min-h-0 flex-col">
                <div class="min-h-0 flex-1">
                  <StylePane
                    v-if="classRule" :rule="classRule" :handle="handle" :source="editor.source" class="h-full" :detachable="currentTarget?.kind === 'class'"
                    @rename="renameRule(classRule!, $event)" @detach="removeClassFromElement(currentClass!)" @delete="deleteRule(classRule!)"
                  />
                  <div v-else-if="currentTarget" class="flex h-full items-center justify-center gap-3 text-[12px] text-muted-foreground">
                    <span>no rule for <span class="font-mono">{{ currentTarget.selector }}</span> yet</span>
                    <button type="button" class="h-[26px] rounded-[6px] border border-border px-2 text-[11px] text-foreground hover:bg-muted" @click="ensureSelector(currentTarget.selector)">create rule</button>
                  </div>
                  <div v-else class="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                    {{ element ? 'no class on this element yet — add one with +' : 'Place the caret inside a tag' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Style block: one pane, but the same strip so the layout reads the same on every tab. -->
          <div v-else class="flex h-full min-h-0 flex-col">
            <div class="strip">
              <div class="trough" role="tablist">
                <button type="button" role="tab" aria-selected="true" class="pill on"><span class="label">Style</span></button>
              </div>
              <span v-if="rule" class="rule-name">{{ rule.selector }}</span>
            </div>
            <div class="min-h-0 flex-1">
              <StylePane :rule="rule" :handle="handle" :source="editor.source" class="h-full" @rename="renameRule(rule!, $event)" @delete="deleteRule(rule!)" />
            </div>
          </div>
        </ResizablePanel>
      </template>
    </ResizablePanelGroup>

    <!-- Script: no bottom pane, and the footer says so rather than leaving a hole (§4). -->
    <p v-if="kind === 'script'" class="flex-none border-t border-border px-3 py-2 font-mono text-[10.5px] text-muted-foreground">
      no side panes · nothing to inspect in TypeScript
    </p>

  </div>
</template>

<style scoped>
.strip { display: flex; align-items: center; gap: 10px; height: 44px; flex: none; padding: 0 10px; border-bottom: 1px solid var(--border); }
.trough { display: flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 9px; background: var(--muted); }
.pill { display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; transition: background-color 120ms ease-out, box-shadow 120ms ease-out; }
.pill .label { font-family: var(--font-sans); font-size: 12px; font-weight: 450; color: oklch(0.45 0.01 60); }
.pill.mono .label { font-family: var(--font-mono); font-size: 11.5px; }
.pill.on { background: var(--card); box-shadow: 0 1px 2px rgb(0 0 0 / 0.07); }
.pill.on .label { font-weight: 600; color: var(--foreground); }
.pill.faint .label { opacity: 0.55; }
.sep { padding: 0 3px; font-family: var(--font-mono); font-size: 12px; color: var(--muted-foreground); user-select: none; }
.rule-name { font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; color: var(--foreground); }
.add { height: 28px; padding: 0 10px; display: grid; place-items: center; border: 1px dashed var(--border); border-radius: 6px; background: transparent; font-family: var(--font-mono); font-size: 12px; color: var(--muted-foreground); transition: background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out; }
.add:hover { border: 1px solid var(--primary); background: var(--accent); color: var(--primary); }
.add-wrap { position: relative; }
.backdrop { position: fixed; inset: 0; z-index: 19; }
.menu {
  position: absolute; left: 0; top: 34px; z-index: 20; width: 260px; padding: 4px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--popover);
  box-shadow: 0 18px 40px -14px rgb(0 0 0 / 0.3);
}
.menu-head { padding: 6px 9px 4px; font-size: 9.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-foreground); }
.menu-item { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 6px 9px; border: 0; border-radius: 6px; background: transparent; text-align: left; }
.menu-item:hover { background: var(--accent); }
.menu-item .k { font-family: var(--font-mono); font-size: 11.5px; font-weight: 500; }
.menu-item .d { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--muted-foreground); }
.menu-empty { padding: 6px 9px; font-size: 11px; color: var(--muted-foreground); }
.menu-new { padding: 4px; border-top: 1px solid var(--border); margin-top: 4px; }
.new-class { height: 28px; width: 100%; padding: 0 8px; border: 1px solid var(--input); border-radius: 6px; background: var(--card); font-family: var(--font-mono); font-size: 11.5px; outline: none; }
.new-class:focus-visible { box-shadow: 0 0 0 2px var(--ring); }
.add.open { border: 1px solid var(--primary); background: var(--accent); color: var(--primary); }
</style>
