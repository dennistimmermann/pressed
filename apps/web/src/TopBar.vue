<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { settings, toggleTheme } from '@/stores/settings'
import type { View } from '@/stores/view'

const view = defineModel<View>({ required: true })

const props = defineProps<{
  /** Live mono badge per tab (design §2): source · sel/total, W × H · gap G, ● device. */
  badges: Record<View, string>
  printCount: number
}>()

const emit = defineEmits<{ print: [] }>()

const TABS: { id: View; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'editor', label: 'Editor' },
  { id: 'printer', label: 'Printer' },
]
</script>

<template>
  <header class="flex h-[52px] flex-none items-center gap-3 border-b border-border px-3">
    <!-- Wordmark: Plex Mono 600 + the print head rule. Not a logo file. -->
    <div class="flex items-center gap-1.5 pr-1 select-none">
      <span class="font-mono text-[16px] font-semibold tracking-[-0.02em] lowercase">sprint</span>
      <span class="-mt-[3px] h-[3px] w-[22px] rounded-full bg-primary" />
    </div>

    <!-- One segmented control, three views, each with the badge that makes tabs worth it. -->
    <nav class="flex items-center gap-[3px] rounded-[9px] border border-border bg-muted p-[3px]" aria-label="Views">
      <button
        v-for="(tab, i) in TABS" :key="tab.id" type="button"
        class="flex items-center gap-2 rounded-[7px] px-2.5 py-1.5 transition-colors duration-120 ease-out"
        :class="view === tab.id
          ? 'bg-card shadow-[0_1px_2px_rgb(0_0_0/.07)] text-foreground'
          : 'text-muted-foreground hover:text-foreground'"
        :aria-current="view === tab.id ? 'page' : undefined"
        @click="view = tab.id"
      >
        <span class="text-[12px]" :class="view === tab.id ? 'font-semibold' : 'font-normal'">{{ tab.label }}</span>
        <span class="font-mono text-[10.5px] text-muted-foreground">{{ props.badges[tab.id] }}</span>
        <span class="sr-only">⌘{{ i + 1 }}</span>
      </button>
    </nav>

    <div class="flex-1" />

    <Button variant="ghost" size="icon" class="size-8" :aria-label="`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`" @click="toggleTheme">
      <Sun v-if="settings.theme === 'dark'" class="size-4" />
      <Moon v-else class="size-4" />
    </Button>

    <!-- The only filled button in the app (design invariant 1). -->
    <Button class="h-8 gap-2" :disabled="printCount === 0" @click="emit('print')">
      Print {{ printCount }}
      <kbd class="rounded-[4px] bg-white/20 px-1 py-0.5 font-mono text-[10.5px] leading-none">⌘⏎</kbd>
    </Button>
  </header>
</template>
