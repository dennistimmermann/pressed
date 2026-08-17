import type { Row } from '../types'
import type { DataSource } from './types'

/** RFC 4180-ish: quoted fields, "" escapes, newlines inside quotes, CRLF. First line = header. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let field = '', line: string[] = [], quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { line.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      line.push(field); rows.push(line); field = ''; line = []
    } else field += c
  }
  if (field || line.length) { line.push(field); rows.push(line) }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '')
  if (!header) return []
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])))
}

/** `Row` type text built from the actual header — every CSV column is a string. */
export function csvRowType(rows: Row[]): string {
  const keys = Object.keys(rows[0] ?? {})
  if (!keys.length) return 'Record<string, string>'
  return `{ ${keys.map((k) => `${JSON.stringify(k)}: string`).join('; ')} }`
}

export const csvSource: DataSource<string> = {
  id: 'csv',
  label: 'CSV',
  async load(text) {
    const rows = parseCsv(text)
    return { rows, rowType: csvRowType(rows) }
  },
}
