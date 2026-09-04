<!--
  The two full-width strip rows above the work area (SPEC §2): the file row (36) with the mode
  toggle, and the scope row (42) — the file tab, this file's snippets and, while a snippet scope
  is active, the scope actions. The block tabs live in the editor pane header (SPEC §4.6).
-->
<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { FileStrip, LabelSetup, ScopeRow } from '@/editor'
import type { EditorMode } from '@/editor'
import {
  addBlock, badges, deleteSnippet, dirty, editor, enterScope, errorCount, filename, leaveScope, meta,
  promoteSnippet, renameSnippet, save, tabs, warningCount, writeMeta,
} from '@/stores/editor'

defineProps<{ mode?: EditorMode | null; modes?: EditorMode[] }>()
defineEmits<{ 'save-as': []; 'update:mode': [mode: EditorMode] }>()

/** Geometry is context for every block, so it sits in the strip, read-only (README-tabs §6). */
const sizeText = computed(() =>
  `${meta.value.size.width} × ${meta.value.size.height}${meta.value.margin ? ` · margin ${meta.value.margin}` : ''}`,
)

// Label setup: opened from the strip, closed by Esc or a click elsewhere (never by the
// button, which would fight the outside-click handler).
const root = useTemplateRef<HTMLElement>('root')
const setup = useTemplateRef<HTMLElement>('setup')
const setupLeft = ref(0)
const closeSetup = () => { editor.labelSetupOpen = false }
onClickOutside(setup, closeSetup)
onKeyStroke('Escape', () => editor.labelSetupOpen && closeSetup())

// The popover hangs under its own button, wherever the strip put it (the filename moves it),
// pulled back in when the area is too narrow for its 392px.
watch(() => editor.labelSetupOpen, (open) => {
  const button = open && [...(root.value?.querySelectorAll('button') ?? [])]
    .find((b) => b.textContent?.trim().startsWith('Label setup'))
  if (!button) return
  const area = root.value!.getBoundingClientRect()
  setupLeft.value = Math.max(0, Math.min(button.getBoundingClientRect().left - area.left, area.width - 400))
})
</script>

<template>
  <div ref="root" class="relative flex-none">
    <FileStrip
      class="on-ink flex-none"
      :dirty="dirty" :size-text="sizeText"
      :error-count="errorCount" :warning-count="warningCount" :saved-at="editor.savedAt ?? undefined"
      :mode="mode" :modes="modes"
      @update:mode="$emit('update:mode', $event)"
      @save="save()" @save-as="$emit('save-as')" @manage="editor.manageOpen = true"
      @label-setup="editor.labelSetupOpen = true"
    />

    <ScopeRow
      class="flex-none"
      :model="tabs" :scope="editor.activeTab.scope" :file="filename" :dirty="dirty" :badges="badges"
      @leave-scope="leaveScope" @enter-scope="enterScope" @add="addBlock('snippet')"
      @add-icon="editor.iconsOpen = true"
      @rename="renameSnippet(editor.activeTab.scope ?? '', $event)"
      @promote="promoteSnippet" @delete="deleteSnippet"
    />

    <!-- Under `Label setup…` in the strip. -->
    <div v-if="editor.labelSetupOpen" ref="setup" class="absolute top-[36px] z-30" :style="{ left: `${setupLeft}px` }">
      <LabelSetup :meta="meta" :open="editor.labelSetupOpen" @update="writeMeta" @close="closeSetup" />
    </div>
  </div>
</template>
