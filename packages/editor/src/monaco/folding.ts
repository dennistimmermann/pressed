/**
 * Fold ranges for the SFC's custom blocks: `<meta>` and every `<snippet name="…">`
 * (design §3.3 — "`<meta>` and each `<snippet>` are foldable regions, folded state
 * persisted per template").
 *
 * A regex over the source rather than the Vue parser: the editor asks for this on every
 * keystroke, including while the file is syntactically broken, and a folding range is a
 * pair of line numbers — nothing an AST would tell us better.
 */
export type FoldRegion = {
  /** Stable id used to persist the folded state: `meta` or `snippet:<name>`. */
  id: string
  /** 1-based line of the opening tag. */
  start: number
  /** 1-based last line that folds away (the closing tag stays visible). */
  end: number
}

const OPEN = /^\s*<(meta|snippet)\b([^>]*)>/
const NAME = /name\s*=\s*["']([^"']*)["']/

export function foldRegions(source: string): FoldRegion[] {
  const lines = source.split('\n')
  const regions: FoldRegion[] = []

  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i])
    if (!open) continue
    const [, tag, attrs] = open
    const close = lines.findIndex((line, j) => j > i && new RegExp(`</${tag}\\s*>`).test(line))
    if (close < 0) continue
    const id = tag === 'meta' ? 'meta' : `snippet:${NAME.exec(attrs)?.[1] ?? ''}`
    // Fold down to the line before the closing tag, so `</snippet>` stays readable.
    if (close - 1 > i) regions.push({ id, start: i + 1, end: close })
    i = close
  }
  return regions
}
