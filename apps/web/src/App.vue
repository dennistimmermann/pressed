<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import TopBar from './components/TopBar.vue'
import DataView from './views/DataView.vue'
import PrinterView from './views/PrinterView.vue'

// The Editor drags Monaco + Volar (megabytes) — loaded on first visit, not at boot (PERF-01).
const EditorView = defineAsyncComponent(() => import('./views/EditorView.vue'))
import { data } from './stores/data'
import {
  confirmDiscard, confirmSaveAs, dirty, editor, filename, initEditor, meta, pendingId,
  save, saveAsName,
} from './stores/editor'
import { findTemplate, templateName } from './stores/templates'
import { seedExample } from './stores/data'
import { plan, printSelected, printerBadge, refreshDevice } from './stores/printer'
import { view, type View } from './stores/view'

const sourceLabel = computed(() => ({ csv: 'CSV', spoolman: 'Spoolman', none: 'None' })[data.sourceId])
const badges = computed<Record<View, string>>(() => ({
  data: `${sourceLabel.value} · ${data.selected.size} / ${data.rows.length}`,
  editor: `${meta.value.size.width} × ${meta.value.size.height}${meta.value.margin ? ` · margin ${meta.value.margin}` : ''}`,
  printer: printerBadge.value,
}))

// Shortcuts live here so every view gets them; they all act on stores, so nothing depends
// on which view happens to be mounted (design §2).
const shortcuts: Record<string, () => void> = {
  '1': () => (view.value = 'data'),
  '2': () => (view.value = 'editor'),
  '3': () => (view.value = 'printer'),
  Enter: () => void printSelected(),
  s: () => void save(),
  p: () => { view.value = 'editor'; editor.manageOpen = true },
}

function onKeydown(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey)) return
  const run = shortcuts[e.key]
  if (!run) return
  e.preventDefault()
  run()
}

/** The current buffer's name, for the save-as default. */
function copyName() {
  const record = findTemplate(editor.templateId)
  return `${record ? templateName(record) : 'Untitled'} copy`
}

// COR-01: closing the tab is the one switch no dialog can catch — the browser's own prompt
// stands in while the buffer is the only copy of unsaved work.
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}

onMounted(() => {
  addEventListener('keydown', onKeydown)
  addEventListener('beforeunload', onBeforeUnload)
  void initEditor()
  void seedExample()
  void refreshDevice()
})
onUnmounted(() => {
  removeEventListener('keydown', onKeydown)
  removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="relative flex h-screen min-w-[800px] flex-col bg-background text-foreground">
    <TopBar v-model="view" :badges="badges" :print-count="plan.labels" :print-disabled="plan.oversized" @print="printSelected" />
    <main class="min-h-0 flex-1">
      <DataView v-if="view === 'data'" />
      <EditorView v-else-if="view === 'editor'" />
      <PrinterView v-else />
    </main>

    <!-- Dirty confirm and save-as: inline, because a question is not an error dialog. App-level,
         because a template switch can start from any view (COR-01). -->
    <div
      v-if="pendingId || saveAsName !== null"
      class="absolute top-[80px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-trough)] border border-input bg-popover px-3 py-2 shadow-[var(--shadow-popover)]"
    >
      <template v-if="saveAsName !== null">
        <label class="text-[12px]" for="save-as-name">Save current as</label>
        <input
          id="save-as-name" v-model="saveAsName" autofocus
          class="h-[28px] w-[180px] rounded-[var(--radius-control)] border border-transparent bg-muted px-2 text-[12px] outline-none focus:border-primary focus:bg-card"
          @keydown.enter="confirmSaveAs"
        >
        <button type="button" class="h-[28px] rounded-[var(--radius-control)] border border-input px-2 text-[12px] hover:bg-muted" @click="confirmSaveAs">Save</button>
        <button type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="saveAsName = null">Cancel</button>
      </template>
      <template v-else>
        <span class="text-[12px]">{{ filename }} has unsaved changes.</span>
        <button type="button" class="h-[28px] rounded-[var(--radius-control)] border border-input px-2 text-[12px] hover:bg-muted" @click="saveAsName = copyName()">
          Save as new template…
        </button>
        <button type="button" class="h-[28px] rounded-[var(--radius-control)] border border-input px-2 text-[12px] hover:bg-muted" @click="save().then(confirmDiscard)">Save</button>
        <button type="button" class="text-[12px] text-destructive hover:underline" @click="confirmDiscard">Discard</button>
        <button type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="pendingId = null">Cancel</button>
      </template>
    </div>
  </div>
</template>
