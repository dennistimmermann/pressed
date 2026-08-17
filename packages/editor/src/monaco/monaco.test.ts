import { expect, test } from 'vitest'
import { foldRegions } from './folding'
import { ENV_URI, SPRINT_MODULE_URI, sprintEnv } from './sprint-env'

const source = `<meta>
{ "name": "Spool label" }
</meta>

<snippet name="temp">
  <template>a</template>
</snippet>

<snippet name="badge" props="text"><span>{{ text }}</span></snippet>

<template>
  <div>hi</div>
</template>
`

test('fold regions cover <meta> and every multi-line <snippet>', () => {
  expect(foldRegions(source)).toEqual([
    { id: 'meta', start: 1, end: 2 },
    { id: 'snippet:temp', start: 5, end: 6 },
  ])
})

test('a one-line snippet has nothing to fold', () => {
  expect(foldRegions('<snippet name="badge"><span/></snippet>')).toEqual([])
})

test('an unclosed block is not a fold region', () => {
  expect(foldRegions('<meta>\n{}\n')).toEqual([])
})

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
