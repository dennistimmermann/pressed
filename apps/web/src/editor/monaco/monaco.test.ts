import { expect, test } from 'vitest'
import { tabsModel } from '../tabs'
import { snippetSfc, toFileOffset } from './snippets'
import { ENV_URI, SPRINT_MODULE_URI, sprintEnv } from './sprint-env'

test('sprint-env declares the context type and one global component per library entry', () => {
  const files = sprintEnv('{ id: number }', ['QrCode', 'Img'])
  expect(files[ENV_URI]).toContain('type Row = { id: number }')
  expect(files[ENV_URI]).toContain('interface ComponentCustomProperties { row: Row }')
  expect(files[ENV_URI]).toContain("QrCode: typeof import('./sprint/QrCode.vue').default")
  expect(files[ENV_URI]).toContain("Img: typeof import('./sprint/Img.vue').default")
  // Module augmentation only works in a module — the `export {}` is load-bearing.
  expect(files[ENV_URI]).toContain('export {}')
  expect(files[SPRINT_MODULE_URI]).toContain('export function useRow(): { id: number }')
})

test('sprint-env lists the file\'s snippets as global components too', () => {
  const files = sprintEnv('{}', ['QrCode'], ['temp', 'badge'])
  expect(files[ENV_URI]).toContain('"temp": typeof import(\'./sprint/snippets/temp.vue\').default')
})

const SOURCE = [
  '<snippet name="temp">',
  '  <template>{{ label }}</template>',
  '</snippet>',
  '',
  '<snippet name="badge" props="text label">',
  '  <span>{{ text }}</span>',
  '</snippet>',
  '',
  '<template><temp /></template>',
].join('\n')

test('a full snippet is its body verbatim, and offsets map straight back', () => {
  const s = snippetSfc(SOURCE, tabsModel(SOURCE).snippets[0])
  expect(s.text).toBe('\n  <template>{{ label }}</template>\n')
  // `label` in the snippet SFC is `label` in the file.
  expect(toFileOffset(s, s.text.indexOf('label'))).toBe(SOURCE.indexOf('label'))
})

test('a shorthand snippet gets typed props and a wrapper the mapping skips', () => {
  const s = snippetSfc(SOURCE, tabsModel(SOURCE).snippets[1])
  expect(s.text).toContain('defineProps<{ text: string; label: string }>()')
  expect(s.text).toContain('<template>\n  <span>{{ text }}</span>\n</template>')
  expect(toFileOffset(s, s.text.indexOf('{{ text }}'))).toBe(SOURCE.indexOf('{{ text }}'))
  expect(toFileOffset(s, 0)).toBeNull() // inside the synthesized <script setup>
})
