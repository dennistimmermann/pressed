import { expandCopies, isWarning } from '@pressed/core'
import type { Assets, Copies, RenderedLabel, Row } from '@pressed/core'
import { runtime } from '@/render/runtime-client'
import { embedFonts } from '@/fonts/embed'

/**
 * Render the selected rows for printing: one render of all rows through the runtime frame
 * (no `data-loc` — it must never reach paper), then copies applied entry-major. Arguments,
 * not store reads, so the print render is testable without the app around it (ARC-03).
 * Throws on the first fatal compile/render message.
 */
export async function renderPrintLabels(source: string, assets: Assets, rows: Row[], copies: Copies): Promise<RenderedLabel[]> {
  const result = await runtime().render({ source, assets, rows, inspector: false })
  const fatal = result.errors.filter((e) => !isWarning(e))
  if (fatal.length) throw new Error(`${fatal[0].file}: ${fatal[0].message}`)
  const { css } = await embedFonts({ css: result.css, html: result.html })
  // Pair each row with its render *before* expanding, so a column-bound copy count is read
  // off the row it belongs to.
  const paired = rows.map((row, i) => ({ ...row, _label: { html: result.html[i], css } }))
  return expandCopies(paired, copies).map((p) => p._label)
}
