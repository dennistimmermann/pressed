import { countCopies, MAX_LABELS, rollFit, sheetFit } from '@pressed/core'
import type { Row } from '@pressed/core'
import type { PrintSettings } from './types'

/**
 * How many labels a job is and what that costs in sheets or roll — pure millimetre-and-count
 * maths over the selected rows, shared by the Job section, the Print button and `printSelected`.
 * Counted, never expanded: a junk copies column must not freeze the tab (COR-08).
 */
export function planJob(rows: Row[], size: { width: number; height: number }, print: PrintSettings) {
  const labels = countCopies(rows, print.copies)
  return {
    entries: rows.length,
    labels,
    oversized: labels > MAX_LABELS,
    sheet: sheetFit(print.sheet, size),
    roll: rollFit(print.roll, size),
  }
}
