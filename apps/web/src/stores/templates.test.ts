import { expect, test } from 'vitest'
import { parseMeta } from '@sprint/core/template/meta.ts'
import { withMetaName } from './templates'

// Rename rewrites the file, because <meta> is the source of truth for the name (spec §4.1).
test('withMetaName renames in place and leaves the rest of the block alone', () => {
  const source = '<meta>\n{ "name": "A", "size": { "width": 60, "height": 40 }, "gap": 2 }\n</meta>\n<template>x</template>'
  const renamed = withMetaName(source, 'B')
  expect(parseMeta(renamed).meta).toMatchObject({ name: 'B', size: { width: 60, height: 40 }, gap: 2 })
  expect(renamed).toContain('<template>x</template>')
})

test('withMetaName writes a <meta> block when the file has none', () => {
  const renamed = withMetaName('<template>x</template>', 'B')
  expect(parseMeta(renamed).meta.name).toBe('B')
})
