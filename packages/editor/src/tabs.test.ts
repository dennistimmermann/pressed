import { describe, expect, it } from 'vitest'
import { blockOf, insertBlock, tabAt, tabsModel } from './tabs'

const src = `<meta>
{ "name": "x" }
</meta>

<snippet name="temp">
  <script setup lang="ts">
  const a = 1
  </script>
  <template><span>{{ a }}</span></template>
</snippet>

<snippet name="badge" props="text"><b>{{ text }}</b></snippet>

<template>
  <div><span /></div>
  <p />
</template>

<style>
.a { }
.b { }
</style>`

describe('tabsModel', () => {
  const m = tabsModel(src)
  it('lists blocks in use order with counts and content lines', () => {
    expect(m.blocks.map((b) => [b.kind, b.count, b.lines])).toEqual([
      ['template', 3, { first: 15, last: 16 }],
      ['style', 2, { first: 20, last: 21 }],
    ])
    expect(m.meta).toEqual({ start: 0, end: src.indexOf('</meta>') + 7 })
  })
  it('snippets: full and shorthand', () => {
    expect(m.snippets.map((s) => [s.name, s.shorthand, s.blocks.map((b) => b.kind)])).toEqual([
      ['temp', false, ['template', 'script']],
      ['badge', true, ['template']],
    ])
    expect(src.slice(m.snippets[0].nameLoc.start, m.snippets[0].nameLoc.end)).toBe('temp')
    // one-liner template inside temp: the tag line stays (nothing else to show)
    expect(blockOf(m, { scope: 'temp', kind: 'template' })!.lines).toEqual({ first: 9, last: 9 })
    expect(blockOf(m, { scope: 'temp', kind: 'script' })!.lines).toEqual({ first: 7, last: 7 })
  })
  it('tabAt maps offsets to tabs', () => {
    expect(tabAt(m, src.indexOf('const a'))).toEqual({ scope: 'temp', kind: 'script' })
    expect(tabAt(m, src.indexOf('<p />'))).toEqual({ scope: null, kind: 'template' })
    expect(tabAt(m, src.indexOf('.b {'))).toEqual({ scope: null, kind: 'style' })
    expect(tabAt(m, 2)).toBeNull()
  })
})

describe('insertBlock', () => {
  it('inserts a script in file order (after snippets, before template)', () => {
    const m = tabsModel(src)
    const e = insertBlock(src, m, 'script')
    expect(e.start).toBe(m.snippets[1].end)
    expect(e.text).toContain('<script setup lang="ts">')
  })
  it('inserts a snippet after the last snippet, or after meta when none', () => {
    const m = tabsModel(src)
    expect(insertBlock(src, m, 'snippet', 'x').start).toBe(m.snippets[1].end)
    const bare = `<meta>\n{}\n</meta>\n\n<template>\n<div />\n</template>`
    const e = insertBlock(bare, tabsModel(bare), 'snippet', 'x')
    expect(e.start).toBe(bare.indexOf('</meta>') + 7)
  })
  it('adds a style to a snippet, expanding a shorthand body first', () => {
    const m = tabsModel(src)
    const e = insertBlock(src, m, 'style', undefined, 'badge')
    const out = src.slice(0, e.start) + e.text + src.slice(e.end)
    expect(out).toContain('<snippet name="badge" props="text">\n  <template>\n  <b>{{ text }}</b>\n  </template>\n  <style>')
    const e2 = insertBlock(src, m, 'style', undefined, 'temp')
    const out2 = src.slice(0, e2.start) + e2.text + src.slice(e2.end)
    expect(out2).toMatch(/<\/template>\n  <style>\n\n  <\/style>\n<\/snippet>/)
  })
})
