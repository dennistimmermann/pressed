import { computed, reactive, toRaw } from 'vue'
import groceriesCsv from '../../../../examples/groceries.csv?raw'
import { applyMapping, rowTypeOf, suggestMappings } from '@pressed/core'
import type { Row } from '@pressed/core'
import { buildTree, type VarNode } from '@/editor/inspector/row-tree'
import { settings } from './settings'

/** Which source the rows came from — one per module in `@/sources`. */
export type SourceId = 'csv' | 'spoolman' | 'none'

/** Rows from the current data source, and which of them get printed. */
export const data = reactive({
  sourceId: 'none' as SourceId,
  rows: [] as Row[],
  /** Indices into `rows`. A Set because selection is a membership test, not a list. */
  selected: new Set<number>(),
  rowType: '{ n: number }',
  previewRowIndex: 0,
  /** Where the rows came from, in a few words: the file, the host. Panels fill it in. */
  brief: '',
})

/** Not exported: the raw row never leaves this module — everything downstream reads the
    mapped one below. */
const previewRow = computed<Row>(() => data.rows[data.previewRowIndex] ?? {})

export function setRows(sourceId: SourceId, rows: Row[], rowType: string) {
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

// ---------------------------------------------------------------- mapping
// The template asks for `row.filament.name`; a CSV brings `Brand`. A mapping bends one into
// the other, and *everything downstream reads the mapped rows* — raw rows never leave here.

/**
 * The leaves of the example row: what a mapping can map *from*. Same tree the `{ }` picker is
 * built from, minus its `row.` prefix — a source field is a key in the row, not an expression.
 */
export const sourceFields = computed<{ path: string; sample: string }[]>(() => {
  const out: { path: string; sample: string }[] = []
  const walk = (nodes: VarNode[]) => {
    for (const n of nodes) {
      if (n.kind === 'leaf') out.push({ path: n.path.slice('row.'.length), sample: n.value })
      else walk(n.children)
    }
  }
  walk(buildTree(data.rowType, previewRow.value))
  return out
})

/** The mapping in force: source field path → row path, for the source the rows came from. */
export const mapping = computed<Record<string, string>>(() => settings.mappings[data.sourceId] ?? {})

/** `rowPath` is what the template writes (`row.id`) or null to unmap; stored without the prefix. */
export function setMapping(sourcePath: string, rowPath: string | null) {
  const map = (settings.mappings[data.sourceId] ??= {})
  if (rowPath) map[sourcePath] = rowPath.replace(/^row\./, '')
  else delete map[sourcePath]
}

const mapped = computed(() => Object.keys(mapping.value).length > 0)

/** `toRaw`: mapped rows are plain objects that get structured-cloned to the runtime frame, so
    they must not carry Vue proxies from the reactive store in their nested values. */
export const mappedRows = computed<Row[]>(() =>
  mapped.value ? data.rows.map((row) => applyMapping(toRaw(row), mapping.value)) : data.rows,
)
export const mappedSelectedRows = computed(() =>
  [...data.selected].sort((a, b) => a - b).map((i) => mappedRows.value[i]),
)
export const mappedPreviewRow = computed<Row>(() => mappedRows.value[data.previewRowIndex] ?? {})
/** A mapping changes the row's shape, so the source's own type text stops describing it. */
export const mappedRowType = computed(() =>
  mapped.value && data.rows.length ? rowTypeOf(mappedRows.value[0]) : data.rowType,
)

/** The Suggest button: exact-name matches only (core `suggestMappings`), applied on top of
    what is already mapped — returns the source fields it wired, so the view can flash them. */
export function suggestUnmapped(neededPaths: string[]): string[] {
  const taken = new Set(Object.keys(mapping.value))
  const fields = sourceFields.value.map((f) => f.path).filter((f) => !taken.has(f))
  const found = suggestMappings(neededPaths, fields)
  for (const [from, to] of Object.entries(found)) setMapping(from, to)
  return Object.keys(found)
}

/** Boot seed: the bundled grocery example, so a fresh visit shows the whole flow working —
    rows in the table, the Grocery template's checklist all green — instead of empty panes. */
export async function seedExample() {
  if (data.rows.length) return
  const { csvSource } = await import('@pressed/core')
  const { rows, rowType } = await csvSource.load(groceriesCsv)
  setRows('csv', rows, rowType)
  data.brief = 'groceries.csv (example)'
}
