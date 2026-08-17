import { computed, reactive } from 'vue'
import type { Row } from '@sprint/core'

/** Rows from the current data source, and which of them get printed. */
export const data = reactive({
  sourceId: 'none' as 'csv' | 'spoolman' | 'none',
  rows: [] as Row[],
  /** Indices into `rows`. A Set because selection is a membership test, not a list. */
  selected: new Set<number>(),
  rowType: '{ n: number }',
  previewRowIndex: 0,
})

export const selectedRows = computed(() => [...data.selected].sort((a, b) => a - b).map((i) => data.rows[i]))
export const previewRow = computed<Row>(() => data.rows[data.previewRowIndex] ?? {})

export function setRows(sourceId: typeof data.sourceId, rows: Row[], rowType: string) {
  data.sourceId = sourceId
  data.rows = rows
  data.rowType = rowType
  data.selected = new Set(rows.map((_, i) => i)) // loading data means you want to print it
  data.previewRowIndex = 0
}

export function toggleSelected(index: number) {
  if (!data.selected.delete(index)) data.selected.add(index)
  data.selected = new Set(data.selected) // reassign so computeds re-run
}

export function selectAll(on: boolean) {
  data.selected = on ? new Set(data.rows.map((_, i) => i)) : new Set()
}

/** A row's title in the list: its first non-empty string field, else the row number. */
export function rowTitle(row: Row, index: number): string {
  const first = Object.values(row).find((v) => typeof v === 'string' && v.trim())
  return (first as string) ?? `row ${index + 1}`
}
