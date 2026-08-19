import type { Marker } from '../editor-handle'

/**
 * Routing diagnostics to the field that owns them — shared by every pane that shows a range
 * as a control (ATTRIBUTES, STYLE, SELECTOR, PROPS).
 */

/** A marker belongs to the row it *starts* in: a compiler message runs to the end of its line,
 *  and matching on overlap would repeat it under every row after it. What no row owns lands
 *  under `''`, so the caller can decide where the leftovers go. */
export function msgsBy(
  markers: Marker[],
  rows: { key: string; loc: { start: number; end: number } }[],
): Record<string, Marker[]> {
  const out: Record<string, Marker[]> = {}
  for (const m of markers) {
    const own = rows.find((r) => r.loc.start <= m.start && m.start < r.loc.end)
    ;(out[own?.key ?? ''] ??= []).push(m)
  }
  return out
}

export const hasError = (markers: Marker[] | undefined) => !!markers?.some((m) => m.severity === 'error')

/** `aria-describedby` points at the single `<Msgs>` list under the control. */
export const aria = (id: string, markers: Marker[] | undefined) =>
  markers?.length ? { 'aria-describedby': id, 'aria-invalid': hasError(markers) } : {}

/** The header dot (`● N`): the worst severity in there, or null when it is clean. */
export const level = (markers: Marker[] | undefined): 'error' | 'warning' | null =>
  !markers?.length ? null : hasError(markers) ? 'error' : 'warning'
