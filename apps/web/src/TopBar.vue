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
  <header class="on-ink flex h-[52px] flex-none items-center gap-3 border-b border-[var(--ink-border)] bg-[var(--ink)] px-3">
    <!-- Wordmark: Plex Mono 600 + the print head rule. Not a logo file. -->
    <div class="flex items-center gap-1.5 pr-1 select-none">
      <span class="font-mono text-[16px] font-semibold tracking-[-0.02em] lowercase">sprint</span>
      <span class="-mt-[3px] h-[3px] w-[22px] rounded-full bg-primary" />
    </div>

    <!-- One segmented control, three views, each with the badge that makes tabs worth it. -->
    <nav
      class="flex items-center gap-[3px] rounded-[var(--radius-trough)] border border-[var(--ink-well-border)] bg-[var(--ink-well)] p-[3px]"
      aria-label="Views"
    >
      <!-- Active = a white pill: an ink-on-ink active tab fails contrast (VISUAL-SPEC §2). -->
      <button
        v-for="(tab, i) in TABS" :key="tab.id" type="button"
        class="flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 transition-colors duration-120 ease-out"
        :class="view === tab.id
          ? 'bg-card shadow-[var(--shadow-pill)] text-[var(--ink)]'
          : 'text-[var(--ink-muted)] hover:text-[var(--ink-foreground)]'"
        :aria-current="view === tab.id ? 'page' : undefined"
        @click="view = tab.id"
      >
        <span class="text-[12px]" :class="view === tab.id ? 'font-semibold' : 'font-normal'">{{ tab.label }}</span>
        <span
          class="font-mono text-[10.5px]"
          :class="view === tab.id ? 'text-[var(--muted-foreground-2)]' : 'text-[var(--ink-faint)]'"
        >{{ props.badges[tab.id] }}</span>
        <span class="sr-only">⌘{{ i + 1 }}</span>
      </button>
    </nav>

    <div class="flex-1" />

    <!-- Icon button on ink: the `--ink-control` recipe (VISUAL-SPEC §2). -->
    <Button
      variant="ghost" size="icon"
      class="size-8 rounded-[var(--radius-control)] border border-[var(--ink-control-border)] bg-[var(--ink-control)] text-[var(--ink-control-fg)] hover:text-[var(--ink-foreground)]"
      :aria-label="`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`" @click="toggleTheme"
    >
      <Sun v-if="settings.theme === 'dark'" class="size-4" />
      <Moon v-else class="size-4" />
    </Button>

    <!-- The only filled button in the app (design invariant 1). -->
    <Button class="h-8 gap-2 rounded-[var(--radius-control)]" :disabled="printCount === 0" @click="emit('print')">
      Print {{ printCount }}
      <kbd class="rounded-[var(--radius-badge)] bg-primary-foreground/20 px-1 py-0.5 font-mono text-[10.5px] leading-none">⌘⏎</kbd>
    </Button>
  </header>
</template>
