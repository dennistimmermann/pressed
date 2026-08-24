import { expect, test } from 'vitest'
import { MAX_LABELS } from '@pressed/core'
import { planJob } from './plan'

const print = {
  output: 'sheet' as const,
  sheet: { format: 'A4' as const, countH: 3, countV: 8, gapH: 7, gapV: 5, alignH: 'center' as const, alignV: 'center' as const, marginTop: 10, marginLeft: 10 },
  roll: { across: 1, down: 1, marginH: 2, marginV: 1, gap: 2 },
  copies: 2 as number | { column: string },
  rotation: 0 as const,
}
const size = { width: 50, height: 30 }

test('planJob counts without expanding and flags oversized jobs (COR-08)', () => {
  const ok = planJob([{ n: 1 }, { n: 2 }], size, print)
  expect(ok).toMatchObject({ entries: 2, labels: 4, oversized: false })

  // A price column bound as copies: counted instantly, flagged, nothing allocated.
  const bad = planJob([{ price: 1_000_000_000 }], size, { ...print, copies: { column: 'price' } })
  expect(bad.labels).toBeGreaterThan(MAX_LABELS)
  expect(bad.oversized).toBe(true)
})
