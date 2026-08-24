<!-- No data at all: n copies of the template, each row just its own number. -->
<script setup lang="ts">
import { ref } from 'vue'
import { noneSource } from '@pressed/core'
import { Field, Labeled } from '@/ui'
import type { Run } from './index'

const props = defineProps<{ run: Run; busy?: boolean }>()
const copies = ref(1)
const load = () => props.run(() => noneSource.load(copies.value), `${copies.value} copies`)
</script>

<template>
  <Labeled label="copies">
    <Field v-model="copies" unit="×" />
  </Labeled>
  <div class="flex items-center gap-[8px]">
    <button type="button" class="ghost" :disabled="busy" @click="load">Use {{ copies }}</button>
    <span class="note">rows are {{ '{ n }' }}</span>
  </div>
</template>

<style scoped>
.note { min-width: 0; font-family: var(--font-mono); font-size: 10px; color: var(--meta-foreground); }
</style>
