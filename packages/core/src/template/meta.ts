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
  const line = source.slice(0, block.index).split('\n').length
  try {
    const parsed = JSON.parse(block[1]) as Partial<Meta>
    const meta = { ...DEFAULT_META, ...parsed, size: { ...DEFAULT_META.size, ...parsed.size } }
    // Valid JSON is not yet a valid label: sizes flow into CSS mm, imposition arithmetic and
    // canvas dimensions, where a stray string or negative turns into NaN layouts (COR-09).
    const bad = checkNumbers(meta)
    if (bad) return { meta: { ...DEFAULT_META }, error: { message: `<meta> ${bad}`, line } }
    return { meta }
  } catch (e) {
    return {
      meta: { ...DEFAULT_META },
      error: { message: `<meta> is not valid JSON: ${e instanceof Error ? e.message : String(e)}`, line },
    }
  }
}

/** Width/height must be finite and positive, margin finite and non-negative. */
function checkNumbers(meta: Meta): string | null {
  for (const axis of ['width', 'height'] as const) {
    const v: unknown = meta.size[axis]
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return `size.${axis} must be a positive number, got ${JSON.stringify(v)}`
  }
  const m: unknown = meta.margin
  if (m !== undefined && (typeof m !== 'number' || !Number.isFinite(m) || m < 0)) return `margin must be a non-negative number, got ${JSON.stringify(m)}`
  return null
}
