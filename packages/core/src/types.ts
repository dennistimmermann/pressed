/** One record from a data source. Nested objects allowed (Spoolman: `row.filament.vendor.name`). */
export type Row = Record<string, unknown>

/** `<meta>` block contents. Sizes are millimetres — mm in the model, pixels only at raster time. */
export type Meta = {
  name: string
  /** The label's size — the layout truth: spacing, counts, fit math and imposition all use it. */
  size: { width: number; height: number }
  /**
   * Unprintable inset in mm: content keeps this far from the label edge. The box stays `size`
   * — only the printable area inside it shrinks.
   */
  margin?: number
  description?: string
}

export const DEFAULT_META: Meta = { name: 'Untitled', size: { width: 50, height: 30 } }

/** A compiled/rendered label: an HTML fragment plus the template's CSS. */
export type RenderedLabel = { html: string; css: string }

export type PrinterProfile = {
  dpi: number
  /** Widest printable raster in dots (head width). */
  maxDots: number
  gapMm: number
  density: number
  speed?: number
}

/** Every message the pipeline can produce. `file` is 'main' or `snippet:<name>`. */
export type Message = {
  kind: 'compile' | 'render' | 'purity' | 'subset'
  message: string
  file: string
  line?: number
  col?: number
  /** Index of the row that failed, for per-row render errors. */
  row?: number
}

/**
 * Warnings never block: purity and subset messages say what the print engine will not honour,
 * the label still compiles, renders and prints. Everything else is fatal.
 */
export const isWarning = (m: Message) => m.kind === 'purity' || m.kind === 'subset'

/** Prop schema for the property editor, derived from `defineProps` + JSDoc. */
export type PropSchema = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'unknown'
  values?: string[]
  required: boolean
  default?: unknown
  doc?: string
  /** JSDoc `@format` tag: `mm`, `color`, `url`, … — picks the property-editor control. */
  format?: string
}

export type ComponentSchema = { name: string; props: PropSchema[] }
