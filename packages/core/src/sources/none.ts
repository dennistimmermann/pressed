import type { DataSource } from './types'

/** No data: print the template as-is, N times. Rows are `{ n: 1 }`, `{ n: 2 }`, … */
export const noneSource: DataSource<number> = {
  id: 'none',
  label: 'None',
  async load(copies) {
    return {
      rows: Array.from({ length: Math.max(1, copies) }, (_, i) => ({ n: i + 1 })),
      rowType: '{ n: number }',
    }
  },
}
