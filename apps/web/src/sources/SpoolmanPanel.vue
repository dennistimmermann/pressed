<!-- A Spoolman instance over HTTP. The base URL is a setting, so it survives a reload. -->
<script setup lang="ts">
import { spoolmanSource } from '@pressed/core'
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
/* `.ctl` and `.ghost` come from ui/controls.css (UI-03). */
.note { min-width: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
