import type { Meta, RenderedLabel, RollLayout, Rotation, SheetLayout } from '@sprint/core'

/**
 * One print run. `labels` is already expanded — copies were applied upstream, so a backend
 * only has to impose them: `output` picks which of the two layouts below applies.
 */
export type PrintJob = {
  labels: RenderedLabel[]
  size: Meta['size']
  /** The template's unprintable inset, mm — the document builders turn it into label padding. */
  margin: number
  output: 'sheet' | 'roll'
  sheet: SheetLayout
  roll: RollLayout
  /** Quarter turns on the medium — the document builders own the geometry, `size` stays true. */
  rotation: Rotation
}

/** A printer backend: given a job, put it on paper. */
export type Printer = {
  id: string
  label: string
  print(job: PrintJob): Promise<void>
}
