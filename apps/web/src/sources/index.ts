import type { Component } from 'vue'
import type { Row } from '@pressed/core'
import type { SourceId } from '@/stores/data'
import CsvPanel from './CsvPanel.vue'
import NonePanel from './NonePanel.vue'
import SpoolmanPanel from './SpoolmanPanel.vue'

/**
 * What a panel is handed: its loader, and a few words on where the rows came from (the file,
 * the host) for the status strip. Busy, status and error are the view's business — a panel
 * only knows how to ask for rows.
 */
export type Run = (load: () => Promise<{ rows: Row[]; rowType: string }>, brief?: string) => void

export type Source = { id: SourceId; label: string; Panel: Component }

/** Append a source here to add one; its panel is the file next to this. */
export const SOURCES: Source[] = [
  { id: 'csv', label: 'CSV file', Panel: CsvPanel },
  { id: 'spoolman', label: 'Spoolman', Panel: SpoolmanPanel },
  { id: 'none', label: 'None', Panel: NonePanel },
]
