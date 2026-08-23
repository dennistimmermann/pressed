<!--
  The canvas a drawing sits on: a full-height surface with a caption in the top-left corner and
  whatever is being previewed centred in it. Generic by contract — it knows nothing of what the
  drawing is.
-->
<script setup lang="ts">
defineProps<{ caption: string }>()
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col items-center overflow-hidden bg-[var(--canvas)]">
    <div class="absolute top-[8px] left-[14px] z-1 flex items-center gap-2">
      <p class="font-mono text-[var(--t6)] text-[var(--meta-foreground)]">{{ caption }}</p>
      <!-- What the drawing is *not* showing — `no data`, say. A status chip, never a control. -->
      <slot name="tag" />
    </div>
    <slot />
  </div>
</template>
