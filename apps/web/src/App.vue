<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import TopBar from './components/TopBar.vue'
import DataView from './views/DataView.vue'
import EditorView from './views/EditorView.vue'
import PrinterView from './views/PrinterView.vue'
import { data } from './stores/data'
import { editor, initEditor, meta, save } from './stores/editor'
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

onMounted(() => {
  addEventListener('keydown', onKeydown)
  void initEditor()
  void seedExample()
  void refreshDevice()
})
onUnmounted(() => removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex h-screen min-w-[800px] flex-col bg-background text-foreground">
    <TopBar v-model="view" :badges="badges" :print-count="plan.labels" @print="printSelected" />
    <main class="min-h-0 flex-1">
      <DataView v-if="view === 'data'" />
      <EditorView v-else-if="view === 'editor'" />
      <PrinterView v-else />
    </main>
  </div>
</template>
