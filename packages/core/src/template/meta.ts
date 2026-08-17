import { DEFAULT_META, type Meta } from '../types'

/**
 * Read the `<meta>` block. Its own module (and no compiler-sfc import) so the app can show
 * the size badge without pulling the whole SFC compiler into its bundle.
 *
 * `<meta>` is a void element in HTML, so compiler-sfc never hands us a body for it — the
 * raw text is the only place to get it.
 */
export function parseMeta(source: string): { meta: Meta; error?: { message: string; line: number } } {
  const block = /<meta\b[^>]*>([\s\S]*?)<\/meta\s*>/i.exec(source)
  if (!block) return { meta: { ...DEFAULT_META } }
  try {
    const parsed = JSON.parse(block[1]) as Partial<Meta>
    return { meta: { ...DEFAULT_META, ...parsed, size: { ...DEFAULT_META.size, ...parsed.size } } }
  } catch (e) {
    return {
      meta: { ...DEFAULT_META },
      error: {
        message: `<meta> is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        line: source.slice(0, block.index).split('\n').length,
      },
    }
  }
}
