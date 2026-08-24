// @pressed/core — DOM-free: template compile/render, dither, TSPL, data sources.
// Consumed as TypeScript source (no build step); browser-only and Node-only adapters
// live in apps/*.

export * from './types'

export { TsplJob, rasterLabel, parseStatus, STATUS_REQUEST } from './tspl/tspl'
export { toBits, encodeTspl } from './raster/dither'
export type { ImageDataLike } from './raster/dither'

export * from './template/index'

// The render subset (docs/render-subset.md) as data: the tag list the validator enforces is the
// same one the editor's insert popup and property editor read.
export { subset } from './subset'
export type { SubsetConfig, ElementRule } from './subset'

// Imposition: how many labels land on a sheet or a roll. Pure millimetre maths — the
// spoolserver prints sheets too, so it lives here rather than in the web app.
export { countCopies, expandCopies, MAX_LABELS, sheetFit, rollFit } from './imposition'
export type { Copies } from './imposition'

// The variables/mapping tree over a row type + example row. Parses the type text `rowTypeOf`
// emits, so it lives beside it — and the web app's data domain reads it without reaching into
// editor internals (ARC-02).
export { buildTree, flatten } from './template/row-tree'
export type { VarNode } from './template/row-tree'

export type { DataSource } from './sources/types'
export { csvSource, parseCsv, csvRowType } from './sources/csv'
export { spoolmanSource, SPOOL_ROW_TYPE } from './sources/spoolman'
export { noneSource } from './sources/none'

export { LIBRARY_NAMES, librarySources } from './library/index'
export { code128bBars, code128bValues } from './library/code128'
