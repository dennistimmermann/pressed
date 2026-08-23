import { reactive, watch } from 'vue'
import type { EditorMode, TabRef } from '@/editor'
import type { RollLayout, Rotation, SheetLayout } from '@pressed/core'
import type { Copies } from '@pressed/core'

/** A reactive object mirrored into localStorage. Plain modules, no Pinia — there is one app. */
export function persisted<T extends object>(key: string, initial: T): T {
  let stored: Partial<T> = {}
  try { stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T> } catch { /* corrupt entry: start over */ }
  const state = reactive({ ...initial, ...stored }) as T
  watch(state, () => localStorage.setItem(key, JSON.stringify(state)), { deep: true })
  return state
}

/** Everything TSPL has to be told: the head (dpi, printable dots) and the burn (density, speed).
    `speed` null = leave the printer's own default. Defaults below are a ChiTenk K30F, measured. */
export type TsplConfig = { dpi: number; maxDots: number; density: number; speed: number | null }

/** Which backend prints, and — for the direct one — over which protocol, configured how. */
export type PrinterSettings = { backend: 'browser' | 'direct'; protocol: 'tspl'; tspl: TsplConfig }

/** A function, not a const: both call sites need their own object to mutate. */
const defaultPrinter = (): PrinterSettings => ({
  backend: 'browser',
  protocol: 'tspl',
  tspl: { dpi: 203, maxDots: 576, density: 8, speed: null },
})

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

export type Settings = {
  printer: PrinterSettings
  /** Editor mode per template id (SPEC §6); `split` is the default. */
  modeByTemplate: Record<string, EditorMode>
  /** Scope + block per template id (SPEC §6): where you were in that file. */
  tabByTemplate: Record<string, TabRef>
  /** Work-area column widths in px — the design gives them in px, so percentages would lie. */
  layersWidth: number
  inspectorWidth: number
  /** Which Layers sections are collapsed (SPEC §4.2: collapse persists). */
  layersCollapsed: Record<'layers' | 'rules' | 'script', boolean>
  /** Which Inspector sections are collapsed (SPEC §4.3). The keys are the element-mode names;
      rule mode reuses them in order (props → SELECTOR, attributes → USED BY). */
  inspectorCollapsed: Record<'props' | 'attributes' | 'logic' | 'style', boolean>
  /** Printer view: the one rail's width in px, and which of its sections are collapsed. */
  printerWidth: number
  printerCollapsed: Record<'label' | 'output' | 'printer' | 'copies', boolean>
  /** Canvas size inside Split mode (height, or width when side by side) and the flip. */
  splitSize: number
  /** Code mode: height of the Preview above the Inspector, px (SPEC §2 default 240). */
  previewHeight: number
  /** Editor shows the active block only, or the whole file with the tabs following the caret. */
  editorView: 'block' | 'file'
  splitSideBySide: boolean
  previewMode: 'rendered' | 'raster'
  /** Canvas zoom (SPEC §6): Blocks and Split share one, the Code Preview keeps its own. */
  zoomCanvas: 'fit' | number
  zoomPreview: 'fit' | number
  /** Data view: the left pane's width, which sections are collapsed, and which tab it shows. */
  dataWidth: number
  dataView: 'table' | 'mapping'
  dataCollapsed: Record<'source' | 'config' | 'template', boolean>
  /** Per source id: source field path → the `row` path the template reads it as. Mapping is
      the user's, not the source's, so it belongs here and survives a reload. */
  mappings: Record<string, Record<string, string>>
  /** The template to reopen on the next visit. */
  lastTemplateId: string | null
  spoolmanUrl: string
  /** How a job is imposed (Printer view). Both layouts are kept, so switching output is free. */
  print: PrintSettings
}

export const settings = persisted<Settings>('pressed.settings', {
  printer: defaultPrinter(),
  modeByTemplate: {},
  tabByTemplate: {},
  layersWidth: 236,
  inspectorWidth: 340,
  layersCollapsed: { layers: false, rules: true, script: true },
  inspectorCollapsed: { props: false, attributes: false, logic: false, style: false },
  printerWidth: 300,
  printerCollapsed: { label: false, output: false, printer: false, copies: false },
  splitSize: 326,
  previewHeight: 240,
  editorView: 'block',
  splitSideBySide: false,
  previewMode: 'rendered',
  zoomCanvas: 'fit',
  zoomPreview: 'fit',
  dataWidth: 230,
  dataView: 'table',
  dataCollapsed: { source: false, config: false, template: false },
  mappings: {},
  lastTemplateId: null,
  spoolmanUrl: 'http://localhost:7912',
  print: {
    output: 'sheet',
    sheet: { format: 'A4', countH: 3, countV: 8, gapH: 7, gapV: 5, alignH: 'center', alignV: 'center', marginTop: 10, marginLeft: 10 },
    roll: { across: 1, down: 1, marginH: 2, marginV: 1, gap: 2 },  // 2 mm: the die-cut advance of the roll on the shelf; TSPL GAP
    copies: 1,
    rotation: 0,
  },
})

/**
 * F10: a pane width restored from storage is clamped to the minimum its Splitter would allow.
 * A stored `0` — what dragging a splitter shut used to write — made the pane invisible with no
 * way back (atlas 11); collapsing is what the section chevrons and the 28px rail are for.
 */
const MIN_WIDTH = { layersWidth: 180, inspectorWidth: 300, dataWidth: 200, printerWidth: 240 } as const
for (const [key, min] of Object.entries(MIN_WIDTH) as [keyof typeof MIN_WIDTH, number][])
  settings[key] = Math.max(min, settings[key] || min)

// Still developing: no migrations — a stored sheet from an older shape is simply reset.
if (!('backend' in settings.printer)) settings.printer = defaultPrinter()
if (!('printer' in settings.printerCollapsed))
  settings.printerCollapsed = { label: false, output: false, printer: false, copies: false }
settings.print.rotation ??= 0
if (!('alignH' in settings.print.sheet))
  settings.print.sheet = { format: 'A4', countH: 3, countV: 8, gapH: 7, gapV: 5, alignH: 'center', alignV: 'center', marginTop: 10, marginLeft: 10 }
