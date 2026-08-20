// @sprint/core — DOM-free: template compile/render, dither, TSPL, data sources.
// Consumed as TypeScript source (no build step); browser-only and Node-only adapters
// live in apps/*.

export * from './types'

export { TsplJob, rasterLabel, parseStatus, STATUS_REQUEST } from './tspl/tspl'
export { toBits, encodeTspl } from './raster/dither'
export type { ImageDataLike } from './raster/dither'

export * from './template/index'

export type { DataSource } from './sources/types'
export { csvSource, parseCsv, csvRowType } from './sources/csv'
export { spoolmanSource, SPOOL_ROW_TYPE } from './sources/spoolman'
export { noneSource } from './sources/none'

export { LIBRARY_NAMES, librarySources } from './library/index'
export { code128bBars, code128bValues } from './library/code128'
