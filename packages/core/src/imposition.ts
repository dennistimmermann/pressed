import { PAGE_FORMATS, sheetExtent, type RollLayout, type SheetLayout } from './template/label'

/** How often each data entry prints: a fixed number, or a count read from a data column. */
export type Copies = number | { column: string }

type Size = { width: number; height: number }

/**
 * A job larger than this is a mistake, not a print run — a price or id column bound as copies
 * would otherwise freeze the tab expanding millions of entries before anyone can object.
 */
export const MAX_LABELS = 10_000

/** Copies for one entry. ponytail: junk data prints one, never zero silently — a blank or
    unparseable cell is not a decision to print nothing; an explicit 0 is. */
function perRow<T extends object>(row: T, copies: Copies): number {
  const cell = typeof copies === 'number' ? copies : (row as Record<string, unknown>)[copies.column]
  const raw = cell === '' || cell == null ? NaN : Number(cell)
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 1
}

/** Job size without materializing it — the plan (and the MAX_LABELS check) needs only the count. */
export function countCopies<T extends object>(rows: T[], copies: Copies): number {
  return rows.reduce((n, row) => n + perRow(row, copies), 0)
}

/**
 * Entry-major: every copy of entry 1, then every copy of entry 2 — a sheet of one label is the
 * odd case, a strip of *this* spool's labels is the normal one.
 */
export function expandCopies<T extends object>(rows: T[], copies: Copies): T[] {
  const out: T[] = []
  for (const row of rows) {
    const n = perRow(row, copies)
    for (let i = 0; i < n; i++) out.push(row)
  }
  return out
}

/**
 * Does the grid land on the sheet, and how many sheets does a job take? `needed` is the extent
 * the last label reaches — leading margin plus labels plus gaps; a trailing margin is not
 * required for the print to be on paper.
 */
export function sheetFit(sheet: SheetLayout, label: Size) {
  const page = PAGE_FORMATS[sheet.format]
  const extent = sheetExtent(sheet, label)
  // A centered axis needs only the grid; a margin-placed axis counts its margin too.
  const needed = {
    width: (sheet.alignH === 'left' ? sheet.marginLeft : 0) + extent.width,
    height: (sheet.alignV === 'top' ? sheet.marginTop : 0) + extent.height,
  }
  const perSheet = Math.max(1, sheet.countH * sheet.countV)
  return {
    needed,
    page,
    fits: needed.width <= page.width && needed.height <= page.height,
    perSheet,
    sheets: (n: number) => Math.ceil(n / perSheet),
  }
}

/** The same question for a roll: one set wide enough for the head, and how much roll it eats. */
export function rollFit(roll: RollLayout, label: Size) {
  const set = {
    width: roll.across * label.width + (roll.across - 1) * roll.marginH,
    height: roll.down * label.height + (roll.down - 1) * roll.marginV,
  }
  const perSet = Math.max(1, roll.across * roll.down)
  const sets = (n: number) => Math.ceil(n / perSet)
  return {
    set,
    perSet,
    sets,
    // Each set costs its own height plus the advance to the next one.
    lengthM: (n: number) => (sets(n) * (set.height + roll.gap)) / 1000,
  }
}
