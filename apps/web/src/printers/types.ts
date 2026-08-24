import type { Copies, Meta, RenderedLabel, RollLayout, Rotation, SheetLayout } from '@pressed/core'

// The print domain's config shapes live here, not in the settings store: adapters receive
// them as arguments and never read app state (ARC-03). The store imports these types back.

/** Everything TSPL has to be told: the head (dpi, printable dots) and the burn (density, speed).
    `speed` null = leave the printer's own default. Defaults are a ChiTenk K30F, measured. */
export type TsplConfig = { dpi: number; maxDots: number; density: number; speed: number | null }

/** Which backend prints, and — for the direct one — over which protocol, configured how. */
export type PrinterSettings = { backend: 'browser' | 'direct'; protocol: 'tspl'; tspl: TsplConfig }

/** What a backend is handed alongside the job: the protocol choice and each protocol's config. */
export type PrinterConfig = Omit<PrinterSettings, 'backend'>

/** How a job is imposed: the chosen output and the layout of every one of them. */
export type PrintSettings = {
  output: 'sheet' | 'roll'
  sheet: SheetLayout
  roll: RollLayout
  copies: Copies
  /** How the label sits on the medium — imposition, shared by both outputs (a wide label on a
      narrow roll is the reason it exists). The template never sees it. */
  rotation: Rotation
}

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

/** A printer backend: given a job and its config, put it on paper. */
export type Printer = {
  id: string
  label: string
  print(job: PrintJob, ctx: PrinterConfig): Promise<void>
}
