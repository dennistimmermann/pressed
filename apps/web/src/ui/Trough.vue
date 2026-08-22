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
    <p class="absolute top-[10px] left-[14px] font-mono text-[10px] text-[var(--meta-foreground)]">{{ caption }}</p>
    <slot />
  </div>
</template>
