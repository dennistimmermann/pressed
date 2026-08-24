import { reactive, watch } from 'vue'
import { debounce } from '@/editor/runtime-client.ts'
import type { EditorMode, TabRef } from '@/editor'

/** A reactive object mirrored into localStorage. Plain modules, no Pinia — there is one app.
    The write is debounced (a splitter drag mutates on every pointer-move) and shielded — a
    quota or privacy-mode failure loses persistence, never the session. */
export function persisted<T extends object>(key: string, initial: T): T {
  let stored: Partial<T> = {}
  try { stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T> } catch { /* corrupt entry: start over */ }
  const state = reactive({ ...initial, ...stored }) as T
  const write = debounce(() => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* not persisted this session */ }
  }, 150)
  watch(state, write, { deep: true })
  return state
}

// The print domain's config shapes moved to `@/printers/types` (ARC-03); re-exported here so
// existing importers keep working — the store persists them, the domain defines them.
import type { PrinterSettings, PrintSettings } from '@/printers/types'
export type { PrinterConfig, PrinterSettings, PrintSettings, TsplConfig } from '@/printers/types'

/** A function, not a const: both call sites need their own object to mutate.
    TSPL defaults are a ChiTenk K30F, measured. */
const defaultPrinter = (): PrinterSettings => ({
  backend: 'browser',
  protocol: 'tspl',
  tspl: { dpi: 203, maxDots: 576, density: 8, speed: null },
})

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
 * One normalize pass over whatever storage held. Still developing: no versions, no ordered
 * migrations — a stored shape too old to recognize is simply reset to its default. Every new
 * shape check lands here, not as another loose statement.
 */
function normalize(s: Settings) {
  // F10: a pane width restored from storage is clamped to the minimum its Splitter would allow.
  // A stored `0` — what dragging a splitter shut used to write — made the pane invisible with no
  // way back (atlas 11); collapsing is what the section chevrons and the 28px rail are for.
  const MIN_WIDTH = { layersWidth: 180, inspectorWidth: 300, dataWidth: 200, printerWidth: 240 } as const
  for (const [key, min] of Object.entries(MIN_WIDTH) as [keyof typeof MIN_WIDTH, number][])
    s[key] = Math.max(min, s[key] || min)
  if (!('backend' in s.printer)) s.printer = defaultPrinter()
  if (!('printer' in s.printerCollapsed))
    s.printerCollapsed = { label: false, output: false, printer: false, copies: false }
  s.print.rotation ??= 0
  if (!('alignH' in s.print.sheet))
    s.print.sheet = { format: 'A4', countH: 3, countV: 8, gapH: 7, gapV: 5, alignH: 'center', alignV: 'center', marginTop: 10, marginLeft: 10 }
}
normalize(settings)
