<script setup lang="ts">
import { Button } from '@/components/ui/button'
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
    <!-- The lockup: the flat-pressed p (its overrun foot is the wordmark's baseline), then the
         wordmark. Primary stroke on ink chrome, per the identity's surface rule. -->
    <div class="flex items-end gap-[7px] pr-1 select-none">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" class="mb-[2px]">
        <g fill="none" stroke="var(--primary)" stroke-width="3.5" stroke-linecap="butt" stroke-linejoin="miter">
          <path d="M5.4 3.5V18.25H20.9" />
          <circle cx="9.8" cy="9.3" r="4.4" />
        </g>
      </svg>
      <span class="font-mono text-[16px] font-semibold tracking-[-0.02em] lowercase">pressed</span>
    </div>

    <!-- One segmented control, three views, each with the badge that makes tabs worth it. -->
    <nav
      class="flex items-center gap-[3px] rounded-[var(--radius-trough)] border border-[var(--ink-well-border)] bg-[var(--ink-well)] p-[3px]"
      aria-label="Views"
    >
      <!-- Active = a white pill: an ink-on-ink active tab fails contrast (VISUAL-SPEC §2). -->
      <button
        v-for="tab in TABS" :key="tab.id" type="button"
        class="flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 transition-colors duration-120 ease-out"
        :class="view === tab.id
          ? 'bg-card shadow-[var(--shadow-pill)] text-[var(--ink)]'
          : 'text-[var(--ink-muted)] hover:text-[var(--ink-foreground)]'"
        :aria-current="view === tab.id ? 'page' : undefined"
        @click="view = tab.id"
      >
        <span class="text-[12px]" :class="view === tab.id ? 'font-semibold' : 'font-normal'">{{ tab.label }}</span>
        <!-- F29: a fixed 96px slot. The badge's words and dots change; the geometry never does,
             so the tab group cannot shift under the pointer (atlas 48). -->
        <span
          class="w-[96px] overflow-hidden text-left font-mono text-[var(--t6)] text-ellipsis whitespace-nowrap"
          :class="view === tab.id ? 'text-[var(--muted-foreground-2)]' : 'text-[var(--ink-faint)]'"
          :title="props.badges[tab.id]"
        >{{ props.badges[tab.id] }}</span>
      </button>
    </nav>

    <div class="flex-1" />

    <!-- The only filled button in the app (design invariant 1); disabled keeps the fill at 38%,
         never a grey ghost (F1). -->
    <Button class="h-8 gap-2 rounded-[var(--radius-control)] disabled:opacity-[0.38]" :disabled="printCount === 0" @click="emit('print')">
      Print {{ printCount }}
    </Button>
  </header>
</template>
