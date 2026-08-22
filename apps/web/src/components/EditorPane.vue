<!--
  The editor pane (SPEC §4.6): a 40px header with the current scope's block tabs and `Format`,
  one Monaco model for the whole file showing the block of the active tab, and a 26px footer
  saying what typing does in this block. It stays mounted in every mode (it owns the
  language-service worker and the EditorHandle every codeless edit goes through), so Blocks
  mode hides it rather than unmounting it.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { isWarning } from '@sprint/core'
import { librarySources } from '@sprint/core/library/index.ts'
import { BlockTabs, SfcEditor } from '@/editor'
import type { EditorHandle } from '@/editor/editor-handle.ts'
import type { BlockKind } from '@/editor/tabs.ts'
import { mappedRowType } from '@/stores/data'
import { settings } from '@/stores/settings'
import { activeBlock, addBlock, badges, editor, filename, formatBlock, handle, insertables, offsetOf, switchTab, tabs, variables, visible } from '@/stores/editor'

/** Split mode only: the `⇄` that puts the canvas beside the editor lives in this header. */
defineProps<{ flippable?: boolean }>()

const kind = computed(() => editor.activeTab.kind)

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
const emptyText = computed(() => (activeBlock.value?.empty && settings.editorView === 'block' ? EMPTY[kind.value] : null))

/** One line per block: what typing does here (SPEC §4.6 / §8). */
const FOOTER: Record<BlockKind, string> = {
  template: 'typing < lists tags · components · snippets',
  style: 'typing a selector starts a rule',
  script: 'props are read by the label and by Layers',
}

/**
 * E11: the compiler's own messages as wavy underlines. `offsetOf` rebases a snippet's line
 * numbers onto the one model, and the squiggle runs to the end of that line — the compiler
 * reports a point, not a range.
 */
const markers = computed(() =>
  editor.messages.flatMap((m) => {
    const start = offsetOf(m)
    if (start == null) return []
    const eol = editor.source.indexOf('\n', start)
    return [{
      start,
      end: eol < 0 ? editor.source.length : eol,
      message: m.message,
      severity: (isWarning(m) ? 'warning' : 'error') as 'warning' | 'error',
    }]
  }),
)

const editorProps = computed(() => ({
  modelValue: editor.source,
  'onUpdate:modelValue': (value: string) => { editor.source = value },
  contextType: mappedRowType.value,
  libraryComponents: librarySources,
  filename: filename.value,
  visible: visible.value,
  emptyText: emptyText.value,
  markers: markers.value,
  // The `+ component` / `+ variable` buttons are a template-block thing: nothing to insert
  // into a `<style>` rule or a `<script>` body, so the props (and with them the buttons) go away.
  insertables: kind.value === 'template' ? insertables.value : null,
  variables: kind.value === 'template' ? variables.value : null,
  onCaret: (offset: number) => { editor.caret = offset },
  onReady: (h: EditorHandle) => { handle.value = h },
}))
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- The block tabs appear with the code they switch between, never above the panes (SPEC §7). -->
    <!-- Too narrow: the header scrolls sideways (`scroll-thin`), its parts never shrink. -->
    <header class="flex h-[46px] flex-none items-center gap-2 overflow-x-auto border-b border-[var(--section-border)] px-[6px] whitespace-nowrap [scrollbar-width:thin] [&>*]:shrink-0">
      <BlockTabs
        :model="tabs" :active="editor.activeTab" :scope="editor.activeTab.scope" :badges="badges"
        @select="switchTab" @add="addBlock"
      />
      <span class="flex-1" />
      <!-- Block: hidden areas show the active block only. File: the whole file, tabs follow the caret. -->
      <div class="view" role="tablist" aria-label="editor view">
        <button
          v-for="v in (['block', 'file'] as const)" :key="v" type="button" role="tab" :aria-selected="settings.editorView === v"
          class="view-tab" :class="{ on: settings.editorView === v }" @click="settings.editorView = v"
        >{{ v === 'block' ? 'Split' : 'Full' }}</button>
      </div>
      <button
        v-if="flippable" type="button" class="flip" :class="{ on: settings.splitSideBySide }"
        title="canvas beside the editor" aria-label="flip the split" @click="settings.splitSideBySide = !settings.splitSideBySide"
      >⇄</button>
      <button type="button" class="text-[11px] text-muted-foreground transition-colors hover:text-foreground" @click="formatBlock">Format</button>
    </header>

    <SfcEditor v-bind="editorProps" class="min-h-0 flex-1" />

    <footer class="flex h-[26px] flex-none items-center border-t border-[var(--section-border)] px-3 font-mono text-[10px] text-[var(--meta-foreground)]">
      {{ FOOTER[kind] }}
    </footer>
  </div>
</template>

<style scoped>
/* The block-tab trough one size down (the mode toggle's proportions), on the pane surface. */
.view {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-trough);
  background: var(--field);
}
.view-tab {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  font-size: 11px;
  font-weight: 450;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out, box-shadow 120ms ease-out, color 120ms ease-out;
}
.view-tab.on {
  background: var(--pane);
  box-shadow: var(--shadow-pill);
  font-weight: 600;
  color: var(--foreground);
}
/* Small bordered chip on the pane surface; `on` = side by side. */
.flip {
  height: 22px;
  width: 26px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-control);
  background: var(--field);
  font-size: 12px;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out;
}
.flip:hover,
.flip.on {
  border-color: var(--primary);
  background: var(--accent);
  color: var(--accent-foreground);
}
</style>
