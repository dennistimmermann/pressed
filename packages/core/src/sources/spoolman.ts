import type { Row } from '../types'
import type { DataSource } from './types'

/**
 * Hand-written `Spool` type text, shipped as a string because it is fed to the editor's
 * language service (and to the variables pane) — it is documentation, not runtime code.
 * Covers what Spoolman's `GET /api/v1/spool` returns; optional fields are the ones the
 * server omits when unset.
 */
export const SPOOL_ROW_TYPE = `{
  id: number
  registered: string
  first_used?: string
  last_used?: string
  filament: {
    id: number
    name?: string
    vendor?: { id: number; name: string }
    material?: string
    price?: number
    density: number
    diameter: number
    weight?: number
    spool_weight?: number
    settings_extruder_temp?: number
    settings_bed_temp?: number
    color_hex?: string
    multi_color_hexes?: string
    extra?: Record<string, string>
  }
  price?: number
  remaining_weight?: number
  initial_weight?: number
  spool_weight?: number
  used_weight: number
  remaining_length?: number
  used_length: number
  location?: string
  lot_nr?: string
  comment?: string
  archived: boolean
  extra?: Record<string, string>
}`

/**
 * Spoolman returns nested spool → filament → vendor objects; we pass them through as-is,
 * so templates use `row.filament.name`, `row.filament.vendor.name`, `row.remaining_weight`.
 */
export const spoolmanSource: DataSource<string> = {
  id: 'spoolman',
  label: 'Spoolman',
  async load(baseUrl) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/spool`)
    // CORS is the usual failure here: Spoolman must allow this origin.
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${baseUrl}`)
    return { rows: (await res.json()) as Row[], rowType: SPOOL_ROW_TYPE }
  },
}
