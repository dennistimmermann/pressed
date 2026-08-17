import { reactive, watch, watchEffect } from 'vue'

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
  /** Splitter layouts in percent, keyed by group id (design §3): `cols`, `left`, `centre`, `right`. */
  paneSizes: Record<string, number[]>
  /** Collapsed left-column panes (design §3.8), keyed by pane id. */
  collapsed: Record<string, boolean>
  previewMode: 'rendered' | 'raster'
  /** Dashed outlines around every component in the preview (design §3.5). */
  outlines: boolean
  /** Folded `<meta>`/`<snippet>` region names, per template id. */
  folded: Record<string, string[]>
  lastTemplateId: string | null
  spoolmanUrl: string
}

export const settings = persisted<Settings>('sprint.settings', {
  theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  printerId: 'browser',
  paneSizes: {},
  collapsed: {},
  previewMode: 'rendered',
  outlines: false,
  folded: {},
  lastTemplateId: null,
  spoolmanUrl: 'http://localhost:7912',
})

// The theme lives on <html> so the runtime frame (a separate document) can never inherit it —
// the rendered label is never themed (design invariant 3).
watchEffect(() => document.documentElement.classList.toggle('dark', settings.theme === 'dark'))

export const toggleTheme = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark' }
