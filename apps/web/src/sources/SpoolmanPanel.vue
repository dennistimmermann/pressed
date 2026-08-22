<!-- A Spoolman instance over HTTP. The base URL is a setting, so it survives a reload. -->
<script setup lang="ts">
import { spoolmanSource } from '@sprint/core'
import { Labeled } from '@/ui'
import { settings } from '@/stores/settings'
import type { Run } from './index'

const props = defineProps<{ run: Run; busy?: boolean }>()

/** The host is what the status strip shows — the whole URL is in the field above it. */
const brief = () => settings.spoolmanUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
const load = () => props.run(() => spoolmanSource.load(settings.spoolmanUrl), brief())
</script>

<template>
  <Labeled label="base URL">
    <input v-model="settings.spoolmanUrl" type="url" spellcheck="false" class="ctl" aria-label="Spoolman base URL">
  </Labeled>
  <div class="flex items-center gap-[8px]">
    <button type="button" class="ghost" :disabled="busy" @click="load">Reload</button>
    <span class="note">every spool the instance has</span>
  </div>
</template>

<style scoped>
/* The 25px filled control, borderless until focus (DESIGN "Field anatomy"). */
.ctl {
  width: 100%; min-width: 0; height: 25px; padding: 0 7px; border: 1px solid transparent;
  border-radius: var(--radius-control); background: var(--field); outline: none;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:focus-visible { border-color: var(--primary); background: var(--pane); }
/* The ghost: 1px border, no fill — the only filled button in the app is Print (invariant 1). */
.ghost {
  height: 25px; flex: none; padding: 0 9px; border: 1px solid var(--field-border);
  border-radius: var(--radius-control); background: var(--pane); font-size: 11px; color: var(--foreground);
  transition: background-color 120ms ease-out;
}
.ghost:hover:not(:disabled) { background: var(--row-hover); }
.ghost:disabled { opacity: 0.4; }
.note { min-width: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
