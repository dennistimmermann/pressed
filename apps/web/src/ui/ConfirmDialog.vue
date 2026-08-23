<!--
  The only modal question in the app: "this cannot be undone — still?". It exists for actions
  ⌘Z cannot reach (deleting a stored template); every text edit in the editor is one undo away
  and never asks (standing rule).

  A native `<dialog>` for the same reasons `ManageTemplates` uses one — focus trap, Esc and
  backdrop for free — and because `showModal()` puts it in the browser's top layer, which is
  the only way a confirm raised *from* the Templates dialog lands above it.

  No filled button: Cancel is the ghost, the destructive act is red text (invariant 1).
-->
<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** `null` is closed — one prop is the whole state, as everywhere else in `@/ui`. */
    title: string | null
    /** One line: what happens, in the user's words. */
    consequence?: string
    confirmLabel?: string
  }>(),
  { consequence: '', confirmLabel: 'Delete' },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
watch(() => props.title, (title) => (title ? dialog.value?.showModal() : dialog.value?.close()))
</script>

<template>
  <!-- m-auto: Tailwind's preflight zeroes the margin a native modal centres itself with. -->
  <dialog ref="dialog" class="box" @close="emit('cancel')" @cancel.prevent="emit('cancel')">
    <h2 class="t">{{ title }}</h2>
    <p v-if="consequence" class="c">{{ consequence }}</p>
    <div class="foot">
      <button type="button" class="ghost" @click="emit('cancel')">Cancel</button>
      <button type="button" class="destr" @click="emit('confirm')">{{ confirmLabel }}</button>
    </div>
  </dialog>
</template>

<style scoped>
.box {
  width: 320px; margin: auto; padding: 14px; border: 1px solid var(--field-border);
  border-radius: var(--radius-trough); background: var(--popover); color: var(--foreground);
  box-shadow: var(--shadow-popover);
}
.box::backdrop { background: rgb(0 0 0 / 35%); }
.t { margin: 0; font-family: var(--font-sans); font-size: 13px; font-weight: 600; }
.c { margin: 6px 0 0; font-family: var(--font-sans); font-size: 11.5px; color: var(--muted-foreground); }
.foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.ghost {
  height: 28px; padding: 0 10px; border: 1px solid var(--field-border);
  border-radius: var(--radius-control); background: var(--pane);
  font-family: var(--font-sans); font-size: 12px; color: var(--foreground);
  transition: background-color 120ms ease-out;
}
.ghost:hover { background: var(--row-hover); }
.destr {
  height: 28px; padding: 0 4px; border: 0; background: none;
  font-family: var(--font-sans); font-size: 12px; color: var(--destructive);
}
.destr:hover { text-decoration: underline; }
</style>
