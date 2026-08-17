import { expect, test } from 'vitest'
import { csvSource, parseCsv } from './csv'

test('quoted fields, escaped quotes, embedded newlines, CRLF', () => {
  const rows = parseCsv('name,note\r\n"PLA, black","he said ""hi"""\r\n"multi\nline",x\r\n')
  expect(rows).toEqual([
    { name: 'PLA, black', note: 'he said "hi"' },
    { name: 'multi\nline', note: 'x' },
  ])
})

test('missing trailing fields become empty strings; a header-only file has no rows', () => {
  expect(parseCsv('a,b,c\n1\n')).toEqual([{ a: '1', b: '', c: '' }])
  expect(parseCsv('a,b\n')).toEqual([])
  expect(parseCsv('')).toEqual([])
})

test('the source reports a Row type built from the header', async () => {
  const { rows, rowType } = await csvSource.load('id,name\n1,PLA\n')
  expect(rows).toEqual([{ id: '1', name: 'PLA' }])
  expect(rowType).toBe('{ "id": string; "name": string }')
})
