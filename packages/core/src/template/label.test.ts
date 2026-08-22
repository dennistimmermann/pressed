import { describe, expect, it } from 'vitest'
import { PAGE_FORMATS, labelDocument, rotatedSize, setDocument, sheetDocument, sheetOrigin, type RollLayout, type SheetLayout } from './label'

const size = { width: 50, height: 30 }
const sheet: SheetLayout = { format: 'A4', countH: 3, countV: 8, gapH: 7, gapV: 5, alignH: 'left', alignV: 'top', marginTop: 12, marginLeft: 15 }
const roll: RollLayout = { across: 2, down: 2, marginH: 2, marginV: 1, gap: 3 }
const labels = (n: number) => ({ html: Array.from({ length: n }, (_, i) => `<b>${i}</b>`), css: '.x{}' })

describe('sheetDocument', () => {
  it('sets @page to the paper, not the label', () => {
    const doc = sheetDocument(labels(1), size, sheet)
    expect(doc).toContain('@page { size: 210mm 297mm; margin: 0 }')
    expect(doc).toContain(`width:${PAGE_FORMATS.A4.width}mm;height:${PAGE_FORMATS.A4.height}mm`)
  })

  it('places labels entry-major with margins and gaps', () => {
    const doc = sheetDocument(labels(4), size, sheet)
    expect(doc).toContain('left:15mm;top:12mm"><b>0</b>')       // first slot = the margins
    expect(doc).toContain('left:72mm;top:12mm"><b>1</b>')        // 15 + (50 + 7)
    expect(doc).toContain('left:129mm;top:12mm"><b>2</b>')
    expect(doc).toContain('left:15mm;top:47mm"><b>3</b>')        // wraps: 12 + (30 + 5)
  })

  it('pads the label for the margin, without moving or resizing a single slot', () => {
    const doc = sheetDocument(labels(2), size, sheet, 2)
    expect(doc).toContain('padding:2mm')
    expect(doc).toContain('width:50mm;height:30mm')
    expect(doc).toContain('left:15mm;top:12mm"><b>0</b>')
    expect(doc).toContain('left:72mm;top:12mm"><b>1</b>')
  })

  it('spills onto as many pages as it takes', () => {
    const pages = (n: number) => sheetDocument(labels(n), size, sheet).split('class="page"').length - 1
    expect(pages(1)).toBe(1)
    expect(pages(24)).toBe(1)
    expect(pages(25)).toBe(2)
    expect(pages(49)).toBe(3)
  })
})

describe('setDocument', () => {
  it('sizes the set from the labels and their inner margins, never the advance gap', () => {
    const set = setDocument(labels(4), size, roll)
    expect(set.size).toEqual({ width: 102, height: 61 }) // 2*50+2 , 2*30+1
    expect(set.html).toContain('width:102mm;height:61mm')
  })

  it('places labels entry-major inside the set', () => {
    const set = setDocument(labels(4), size, roll)
    expect(set.html).toContain('left:0mm;top:0mm"><b>0</b>')
    expect(set.html).toContain('left:52mm;top:0mm"><b>1</b>')
    expect(set.html).toContain('left:0mm;top:31mm"><b>2</b>')
    expect(set.html).toContain('left:52mm;top:31mm"><b>3</b>')
  })

  it('pads the labels for the margin; the set keeps its size and its slot positions', () => {
    const set = setDocument(labels(4), size, roll, 2)
    expect(set.size).toEqual({ width: 102, height: 61 })
    expect(set.html).toContain('width:102mm;height:61mm')
    expect(set.html.match(/padding:2mm/g)).toHaveLength(4)
    expect(set.html).toContain('left:52mm;top:31mm"><b>3</b>')
  })

  it('carries the label css through untouched', () => {
    expect(setDocument(labels(1), size, roll).css).toBe('.x{}')
  })
})

it('a centered grid computes its own origin from the page', () => {
  const centered: SheetLayout = { ...sheet, alignH: 'center' as const, alignV: 'center' as const }
  // extent 3×50 + 2×7 = 164 wide, 8×30 + 7×5 = 275 tall on 210 × 297
  expect(sheetOrigin(centered, { width: 50, height: 30 })).toEqual({ left: 23, top: 11 })
  expect(sheetDocument({ html: ['x'], css: '' }, { width: 50, height: 30 }, centered)).toContain('left:23mm')
})

describe('rotation', () => {
  it('swaps the footprint on the quarter turns only', () => {
    expect(rotatedSize(size, 0)).toEqual({ width: 50, height: 30 })
    expect(rotatedSize(size, 90)).toEqual({ width: 30, height: 50 })
    expect(rotatedSize(size, 180)).toEqual({ width: 50, height: 30 })
    expect(rotatedSize(size, 270)).toEqual({ width: 30, height: 50 })
  })

  it('gives the sheet slot the rotated box and the label its own', () => {
    const doc = sheetDocument(labels(2), size, sheet, 0, 90)
    // slot: 30 × 50, placed on the grid; label inside keeps 50 × 30 and swings about top-left
    expect(doc).toContain('class="slot" style="position:relative;width:30mm;height:50mm')
    expect(doc).toContain('left:15mm;top:12mm')      // first slot = the margins
    expect(doc).toContain('left:52mm;top:12mm')      // 15 + (30 + 7) — the *rotated* pitch
    expect(doc).toContain('width:50mm;height:30mm')
    expect(doc).toContain('transform:rotate(90deg) translateY(-30mm)')
  })

  it('swaps the set size on a roll', () => {
    expect(setDocument(labels(4), size, roll, 0, 90).size).toEqual({ width: 62, height: 101 }) // 2*30+2 , 2*50+1
    expect(setDocument(labels(4), size, roll, 0, 270).html).toContain('transform:rotate(270deg) translateX(-50mm)')
  })

  it('keeps the box at 180° and only spins the ink', () => {
    const set = setDocument(labels(4), size, roll, 0, 180)
    expect(set.size).toEqual({ width: 102, height: 61 })
    expect(set.html).toContain('transform:rotate(180deg)')
    expect(set.html).not.toContain('transform-origin')
  })

  it('sizes a printed page from the rotated label', () => {
    expect(labelDocument(labels(1), size, true, 0, 90)).toContain('@page { size: 30mm 50mm; margin: 0 }')
  })
})
