import { expect, test } from 'vitest'
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
