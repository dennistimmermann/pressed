<!--
  The editor pane (SPEC §4.6): a 40px header with the current scope's block tabs and `Format`,
  one Monaco model for the whole file showing the block of the active tab, and a 26px footer
  saying what typing does in this block. It stays mounted in every mode (it owns the
  language-service worker and the EditorHandle every codeless edit goes through), so Blocks
  mode hides it rather than unmounting it.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { librarySources } from '@sprint/core/library/index.ts'
import { BlockTabs, SfcEditor } from '@sprint/editor'
import { boxAt } from '@sprint/editor/ast.ts'
import type { EditorHandle } from '@sprint/editor/editor-handle.ts'
import type { BlockKind } from '@sprint/editor/tabs.ts'
import { data } from '@/stores/data'
import { activeBlock, addBlock, badges, editor, filename, formatBlock, handle, offsetOf, switchTab, tabs, visible } from '@/stores/editor'

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
const emptyText = computed(() => (activeBlock.value?.empty ? EMPTY[kind.value] : null))

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
      severity: (m.kind === 'purity' ? 'warning' : 'error') as 'warning' | 'error',
    }]
  }),
)

const editorProps = computed(() => ({
  modelValue: editor.source,
  'onUpdate:modelValue': (value: string) => { editor.source = value },
  contextType: data.rowType,
  libraryComponents: librarySources,
  filename: filename.value,
  highlight: boxAt(editor.source, editor.caret),
  visible: visible.value,
  emptyText: emptyText.value,
  markers: markers.value,
  onCaret: (offset: number) => { editor.caret = offset },
  onReady: (h: EditorHandle) => { handle.value = h },
}))
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- The block tabs appear with the code they switch between, never above the panes (SPEC §7). -->
    <header class="flex h-[40px] flex-none items-center gap-2 border-b border-border bg-[oklch(0.975_0.003_90)] px-3 dark:bg-muted">
      <BlockTabs
        :model="tabs" :active="editor.activeTab" :scope="editor.activeTab.scope" :badges="badges"
        @select="switchTab" @add="addBlock"
      />
      <span class="flex-1" />
      <button type="button" class="text-[11px] text-muted-foreground transition-colors hover:text-foreground" @click="formatBlock">Format</button>
      <span class="font-mono text-[10px] text-muted-foreground">⇧⌥F · ⌥1…9 · ⌘⌥[ ]</span>
    </header>

    <SfcEditor v-bind="editorProps" class="min-h-0 flex-1" />

    <footer class="flex h-[26px] flex-none items-center border-t border-border px-3 font-mono text-[10px] text-muted-foreground">
      {{ FOOTER[kind] }}
    </footer>
  </div>
</template>
