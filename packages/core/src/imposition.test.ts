import { describe, expect, it } from 'vitest'
import type { RollLayout, SheetLayout } from './template/label'
import { rotatedSize } from './template/label'
import { countCopies, expandCopies, MAX_LABELS, rollFit, sheetFit } from './imposition'

const sheet: SheetLayout = { format: 'A4', countH: 3, countV: 8, gapH: 7, gapV: 5, alignH: 'left', alignV: 'top', marginTop: 12, marginLeft: 15 }
const roll: RollLayout = { across: 2, down: 1, marginH: 2, marginV: 1, gap: 2 }

describe('expandCopies', () => {
  const rows = [{ n: 1, qty: '3' }, { n: 2, qty: 'x' }, { n: 3, qty: 0 }]

  it('repeats every entry before the next one', () => {
    expect(expandCopies([{ n: 1 }, { n: 2 }], 2).map((r) => r.n)).toEqual([1, 1, 2, 2])
  })

  it('reads the count from a column', () => {
    expect(expandCopies(rows, { column: 'qty' }).map((r) => r.n)).toEqual([1, 1, 1, 2])
  })

  it('prints junk once and honours an explicit zero', () => {
    expect(expandCopies([{ qty: 'x' }], { column: 'qty' })).toHaveLength(1)
    expect(expandCopies([{ qty: null }], { column: 'qty' })).toHaveLength(1) // blank cell ≠ "print none"
    expect(expandCopies([{ qty: '' }], { column: 'qty' })).toHaveLength(1)
    expect(expandCopies([{ qty: 0 }], { column: 'qty' })).toHaveLength(0)
    expect(expandCopies([{ qty: 2.7 }], { column: 'qty' })).toHaveLength(2)
    expect(expandCopies([{ qty: -4 }], { column: 'qty' })).toHaveLength(0)
  })
})

describe('countCopies (COR-08)', () => {
  it('counts exactly what expandCopies would materialize', () => {
    const rows = [{ qty: '3' }, { qty: 'x' }, { qty: 0 }, { qty: null }, { qty: 2.7 }]
    expect(countCopies(rows, { column: 'qty' })).toBe(expandCopies(rows, { column: 'qty' }).length)
    expect(countCopies(rows, 2)).toBe(rows.length * 2)
  })

  it('counts a tab-freezing job without allocating it', () => {
    // A price column bound as copies: the count is instant, nothing is materialized.
    expect(countCopies([{ price: 1_000_000_000 }], { column: 'price' })).toBeGreaterThan(MAX_LABELS)
  })
})

describe('sheetFit', () => {
  it('measures the extent the last label reaches', () => {
    const fit = sheetFit(sheet, { width: 50, height: 30 })
    expect(fit.needed).toEqual({ width: 179, height: 287 }) // 15+150+14 , 12+240+35
    expect(fit.fits).toBe(true)
    expect(fit.perSheet).toBe(24)
  })

  it('does not fit once the grid runs off the paper', () => {
    expect(sheetFit({ ...sheet, countH: 4 }, { width: 50, height: 30 }).fits).toBe(false)
    expect(sheetFit({ ...sheet, countV: 9 }, { width: 50, height: 30 }).fits).toBe(false)
  })

  it('counts sheets with the remainder on its own page', () => {
    const fit = sheetFit(sheet, { width: 50, height: 30 })
    expect([fit.sheets(1), fit.sheets(24), fit.sheets(25)]).toEqual([1, 1, 2])
  })
})

describe('rollFit', () => {
  const fit = rollFit(roll, { width: 22, height: 22 })

  // No fit check on a roll: we cannot know what stock is loaded.
  it('sizes one set', () => {
    expect(fit.set).toEqual({ width: 46, height: 22 })
  })

  it('counts sets and roll length, advance included', () => {
    expect(fit.sets(38)).toBe(19)
    expect(fit.lengthM(38)).toBeCloseTo(0.456) // 19 × (22 + 2) mm
  })
})

it('centered sheets need only the grid to fit — margins are nobody\'s input', () => {
  const fit = sheetFit({ ...sheet, alignH: 'center' as const, alignV: 'center' as const }, { width: 50, height: 30 })
  expect(fit.needed).toEqual({ width: 164, height: 275 })
  expect(fit.fits).toBe(true)
})

describe('rotation reaches the fit through the size', () => {
  it('re-measures the sheet grid on the rotated label', () => {
    const label = { width: 50, height: 30 }
    const grid = { ...sheet, countH: 3, countV: 8 }
    expect(sheetFit(grid, label).fits).toBe(true)                       // 164 × 275 on A4
    expect(sheetFit(grid, rotatedSize(label, 90)).fits).toBe(false)     // 104 × 435: too tall
    // 15 + (3*30 + 2*7) wide, 12 + (5*50 + 4*5) tall — the margins, then the rotated pitch
    expect(sheetFit({ ...grid, countV: 5 }, rotatedSize(label, 90)).needed).toEqual({ width: 119, height: 282 })
  })

  it('re-measures the roll set on the rotated label', () => {
    const label = { width: 50, height: 30 }
    expect(rollFit(roll, label).set).toEqual(rollFit(roll, rotatedSize(label, 180)).set)
    expect(rollFit(roll, rotatedSize(label, 90)).set).toEqual(rollFit({ ...roll }, { width: 30, height: 50 }).set)
  })
})
