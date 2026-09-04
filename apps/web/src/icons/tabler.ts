import { fromIconify, type IconifyJSON } from './iconify'
import type { IconSet } from './types'

/**
 * Tabler: ~6,200 icons on the same 24-grid/2px-stroke as the app, plus ~1,000 filled variants
 * that survive a 1-bit raster at 2 mm. Lazy-imported, so none of the 2 MB JSON is in the initial
 * bundle — the module system caches the chunk after the first time the tab opens.
 */
export const tabler: IconSet = {
  id: 'tabler',
  label: 'Tabler',
  async load() {
    // The specifier is widened to `string` so TypeScript does not pull a 2 MB JSON literal into
    // the type graph; the literal survives type erasure, so Vite still emits the lazy chunk.
    const module = (await import('@iconify-json/tabler/icons.json' as string)) as { default: IconifyJSON }
    const { icons, rejected } = fromIconify(module.default)
    // Expected ≈ 0 — Tabler draws in the same subset we render. A jump means the set changed shape.
    if (rejected.length) console.info(`tabler: ${rejected.length} of ${icons.length + rejected.length} icons are outside the render subset`)
    return icons
  },
}
