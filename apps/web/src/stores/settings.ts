import { reactive, watch, watchEffect } from 'vue'
import type { EditorMode, TabRef } from '@sprint/editor'

/** A reactive object mirrored into localStorage. Plain modules, no Pinia — there is one app. */
export function persisted<T extends object>(key: string, initial: T): T {
  let stored: Partial<T> = {}
  try { stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<T> } catch { /* corrupt entry: start over */ }
  const state = reactive({ ...initial, ...stored }) as T
  watch(state, () => localStorage.setItem(key, JSON.stringify(state)), { deep: true })
  return state
}

export type Settings = {
  theme: 'light' | 'dark'
  printerId: string
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
  /** The template to reopen on the next visit. */
  lastTemplateId: string | null
  spoolmanUrl: string
}

export const settings = persisted<Settings>('sprint.settings', {
  theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  printerId: 'browser',
  modeByTemplate: {},
  tabByTemplate: {},
  layersWidth: 236,
  inspectorWidth: 340,
  layersCollapsed: { layers: false, rules: true, script: true },
  inspectorCollapsed: { props: false, attributes: false, logic: false, style: false },
  splitSize: 326,
  previewHeight: 240,
  editorView: 'block',
  splitSideBySide: false,
  previewMode: 'rendered',
  zoomCanvas: 'fit',
  zoomPreview: 'fit',
  lastTemplateId: null,
  spoolmanUrl: 'http://localhost:7912',
})

// The theme lives on <html> so the runtime frame (a separate document) can never inherit it —
// the rendered label is never themed (design invariant 3).
watchEffect(() => document.documentElement.classList.toggle('dark', settings.theme === 'dark'))

export const toggleTheme = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark' }
