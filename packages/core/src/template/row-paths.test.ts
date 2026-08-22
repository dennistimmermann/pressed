import { describe, expect, it } from 'vitest'
import { applyMapping, rowPathsUsed, rowTypeOf , suggestMappings } from './row-paths'

describe('rowPathsUsed', () => {
  it('collects paths from template, snippet and script, deduped and sorted', () => {
    const source = `
      <snippet name="badge">{{ row.id }}</snippet>
      <template>
        <div>{{ row.filament.name }}</div>
        <temp :value="row.filament.settings_bed_temp" />
        <span>{{ row.id }}</span>
      </template>
      <script setup lang="ts">const left = row.remaining_weight</script>
    `
    expect(rowPathsUsed(source)).toEqual([
      'row.filament.name', 'row.filament.settings_bed_temp', 'row.id', 'row.remaining_weight',
    ])
  })

  it('reads optional chaining as a plain path', () => {
    expect(rowPathsUsed('{{ row.filament?.vendor?.name }}')).toEqual(['row.filament.vendor.name'])
  })

  it('needs a word boundary — arrow.x and rowdy.y are not row paths', () => {
    expect(rowPathsUsed('arrow.x + rowdy.y + narrow.z')).toEqual([])
  })

  it('is empty for a template that reads nothing', () => {
    expect(rowPathsUsed('<template><b>hello</b></template>')).toEqual([])
  })
})

describe('applyMapping', () => {
  const row = { Brand: 'Prusament', 'Weight (g)': '812', filament: { name: 'PLA' } }

  it('is identity with no mapping', () => {
    expect(applyMapping(row, {})).toEqual(row)
  })

  it('overlays a mapped field without losing the original', () => {
    expect(applyMapping(row, { Brand: 'vendor' })).toEqual({ ...row, vendor: 'Prusament' })
  })

  it('sets a nested path without mutating the source row', () => {
    const out = applyMapping(row, { Brand: 'filament.vendor.name' })
    expect(out.filament).toEqual({ name: 'PLA', vendor: { name: 'Prusament' } })
    expect(row.filament).toEqual({ name: 'PLA' })
  })

  it('leaves the target alone when the source path is missing', () => {
    expect(applyMapping(row, { nope: 'id' })).toEqual(row)
  })
})

describe('rowTypeOf', () => {
  it('writes the row shape as type text', () => {
    expect(rowTypeOf({ id: 1, filament: { name: 'PLA' } })).toBe('{ "id": number; "filament": { "name": string } }')
  })
})

describe('suggestMappings', () => {
  const needed = ['row.filament.diameter', 'row.filament.name', 'row.filament.vendor.name', 'row.remaining_weight']

  it('matches leaf names, underscored paths and the vendor-name idiom — deterministically', () => {
    expect(suggestMappings(needed, ['diameter', 'name', 'vendor', 'remaining_weight', 'comment'])).toEqual({
      diameter: 'filament.diameter',
      name: 'filament.name',
      vendor: 'filament.vendor.name',
      remaining_weight: 'remaining_weight',
    })
  })

  it('never guesses on ambiguity and uses a field only once', () => {
    // two fields normalising to "diameter" → skipped; "name" is consumed by filament.name first
    expect(suggestMappings(needed, ['Diameter', 'diameter ', 'name'])).toEqual({ name: 'filament.name' })
  })

  it('prefers the full path over the leaf', () => {
    expect(suggestMappings(['row.filament.diameter'], ['diameter', 'filament_diameter'])).toEqual({
      filament_diameter: 'filament.diameter',
    })
  })
})
