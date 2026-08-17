import type { Row } from '../types'

/**
 * A data source turns one piece of user input (CSV text, a base URL, a copy count) into rows
 * plus `rowType`: the TypeScript type *text* for one row. The type text feeds the editor's
 * language service and the variables pane, so it is a string, not a runtime schema.
 */
export type DataSource<I = never> = {
  id: string
  label: string
  load(input: I): Promise<{ rows: Row[]; rowType: string }>
}
