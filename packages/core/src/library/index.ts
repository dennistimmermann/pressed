import QrCode from './QrCode.vue'
import Barcode from './Barcode.vue'
import Img from './Img.vue'
import Fit from './Fit.vue'

/** The built-in component library, compiled by Vite (for hosts that want the real components). */
export const libraryComponents = { QrCode, Barcode, Img, Fit }

/**
 * The same .vue files as source text, for the runtime frame — it compiles them with the very
 * same loader that compiles user snippets, so a snippet and a library component are the same
 * thing (spec §4.1). One file per component, two consumers, no duplication.
 */
const raw = import.meta.glob('./*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export const librarySources: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, source]) => [path.replace(/^\.\/|\.vue$/g, ''), source]),
)

export const LIBRARY_NAMES = Object.keys(libraryComponents)
