import { describe, expect, it } from 'vitest'
import { buildTree, flatten, parseMembers } from './row-tree'

const TYPE = `{
  id: number
  filament: {
    name?: string
    vendor?: { id: number; name: string }
    price?: number
  }
  tags: string[]
  archived: boolean
}`

const ROW = { id: 7, filament: { name: 'PLA Black', vendor: { id: 2, name: 'Prusa' } }, tags: ['a', 'b'] }

describe('parseMembers', () => {
  it('splits a type literal without nesting into the members', () => {
    expect(Object.keys(parseMembers(TYPE))).toEqual(['id', 'filament', 'tags', 'archived'])
    expect(parseMembers(TYPE).filament).toContain('vendor?: { id: number; name: string }')
    expect(parseMembers('string')).toEqual({})
  })
})

describe('buildTree', () => {
  const tree = buildTree(TYPE, ROW)
  const find = (path: string) => flatten(tree, new Set(), '').find((n) => n.path === path)

  it('takes values from the example row', () => {
    expect(find('row.id')).toMatchObject({ kind: 'leaf', value: '7', depth: 0 })
    expect(find('row.filament.vendor.name')).toMatchObject({ kind: 'leaf', value: 'Prusa', depth: 2 })
  })

  it('keeps type-only fields as valueless leaves', () => {
    expect(find('row.filament.price')).toMatchObject({ kind: 'leaf', value: '—' })
    expect(find('row.archived')).toMatchObject({ kind: 'leaf', value: '—' })
  })

  it('shows objects and arrays as containers', () => {
    expect(find('row.filament')).toMatchObject({ kind: 'object', value: '{ … }' })
    expect(find('row.tags')).toMatchObject({ kind: 'leaf', value: '[2]' }) // array of primitives: nothing to expand
  })

  it('expands the first element of an array of objects', () => {
    const rows = buildTree('{ lines: { text: string }[] }', { lines: [{ text: 'hi' }] })
    const flat = flatten(rows, new Set(), '')
    expect(flat.map((n) => n.path)).toEqual(['row.lines', 'row.lines[0].text'])
    expect(flat[0].value).toBe('[1]')
  })
})

describe('flatten', () => {
  const tree = buildTree(TYPE, ROW)

  it('hides the subtree of a collapsed object', () => {
    const paths = flatten(tree, new Set(['row.filament']), '').map((n) => n.path)
    expect(paths).toEqual(['row.id', 'row.filament', 'row.tags', 'row.archived'])
  })

  it('filters to matching leaves across levels', () => {
    expect(flatten(tree, new Set(), 'vendor').map((n) => n.path)).toEqual([
      'row.filament.vendor.id',
      'row.filament.vendor.name',
    ])
  })
})
