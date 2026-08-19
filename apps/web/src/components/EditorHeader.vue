<!--
  The two full-width strip rows above the work area (SPEC §2): the file row (36) with the mode
  toggle, and the scope row (42) — the file tab, this file's snippets and, while a snippet scope
  is active, the scope actions. The block tabs live in the editor pane header (SPEC §4.6).
-->
<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { FileStrip, LabelSetup, ScopeRow } from '@sprint/editor'
import type { EditorMode } from '@sprint/editor'
import {
  addBlock, badges, deleteSnippet, dirty, editor, enterScope, errorCount, filename, leaveScope, meta,
  promoteSnippet, renameSnippet, save, tabs, warningCount, writeMeta,
} from '@/stores/editor'

defineProps<{ mode?: EditorMode | null; modes?: EditorMode[]; sideBySide?: boolean }>()
defineEmits<{ 'save-as': []; 'update:mode': [mode: EditorMode]; flip: [] }>()

const pendingDelete = ref<string | null>(null)

/** `meta.printer` names a device model, not a backend — there is one profile so far. */
const PRINTER_PROFILES = [{ id: 'K30F', label: 'K30F' }]

/** Geometry is context for every block, so it sits in the strip, read-only (README-tabs §6). */
const sizeText = computed(() =>
  `${meta.value.size.width} × ${meta.value.size.height}${meta.value.gap ? ` · gap ${meta.value.gap}` : ''}`,
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
      class="flex-none"
      :dirty="dirty" :size-text="sizeText"
      :error-count="errorCount" :warning-count="warningCount" :saved-at="editor.savedAt ?? undefined"
      :mode="mode" :modes="modes" :side-by-side="sideBySide"
      @update:mode="$emit('update:mode', $event)" @flip="$emit('flip')"
      @save="save()" @save-as="$emit('save-as')" @manage="editor.manageOpen = true"
      @label-setup="editor.labelSetupOpen = true"
    />

    <ScopeRow
      class="flex-none"
      :model="tabs" :scope="editor.activeTab.scope" :file="filename" :dirty="dirty" :badges="badges"
      leave-label="label"
      @leave-scope="leaveScope" @enter-scope="enterScope" @add="addBlock('snippet')"
      @rename="renameSnippet(editor.activeTab.scope ?? '', $event)"
      @promote="promoteSnippet" @delete="pendingDelete = $event"
    />

    <!-- Deleting a block of the user's file asks first — inline, because a question is not a dialog. -->
    <div v-if="pendingDelete === editor.activeTab.scope && pendingDelete" class="flex h-[34px] flex-none items-center gap-2 border-b border-border bg-muted px-3 text-[12px]">
      <span>Delete snippet <span class="font-mono">{{ pendingDelete }}</span>? Its uses in the template stay as they are.</span>
      <button type="button" class="ml-auto h-[26px] rounded-[6px] border border-border px-2 text-[11px] text-destructive hover:bg-card" @click="deleteSnippet(pendingDelete); pendingDelete = null">
        Delete
      </button>
      <button type="button" class="text-[11px] text-muted-foreground hover:text-foreground" @click="pendingDelete = null">Cancel</button>
    </div>

    <!-- Under `Label setup…` in the strip. -->
    <div v-if="editor.labelSetupOpen" ref="setup" class="absolute top-[36px] z-30" :style="{ left: `${setupLeft}px` }">
      <LabelSetup :meta="meta" :open="editor.labelSetupOpen" :printers="PRINTER_PROFILES" @update="writeMeta" @close="closeSetup" />
    </div>
  </div>
</template>
