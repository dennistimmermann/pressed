import { describe, expect, it } from 'vitest'
import { attributeEdit, cursorContext, elementAt, insertVar } from './ast'

const SOURCE = `<meta>
{ "name": "T", "size": { "width": 60, "height": 40 } }
</meta>

<snippet name="temp">
  <script setup lang="ts">
  const props = defineProps<{ label: string }>()
  </script>
  <template><span class="k">{{ label }}</span></template>
</snippet>

<snippet name="badge" props="text">
  <b class="badge">{{ text }}</b>
</snippet>

<template>
  <div class="title">{{ row.name }}</div>
  <div class="temps"><temp label="Nozzle" :value="row.temp" /></div>
  <QrCode :value="\`spool:\${row.id}\`" size="16mm" />
</template>

<style>.title { font-weight: 700 }</style>
`

/** Offset just after `needle` (or at `at` inside it). */
function at(needle: string, inside = 0): number {
  const i = SOURCE.indexOf(needle)
  expect(i, `not found: ${needle}`).toBeGreaterThan(-1)
  return i + inside
}

describe('elementAt', () => {
  it('finds an element in the main template', () => {
    const el = elementAt(SOURCE, at('<QrCode', 3))!
    expect(el.tag).toBe('QrCode')
    expect(el.file).toBe('main')
    expect(el.selfClosing).toBe(true)
    expect(SOURCE.slice(el.nameLoc.start, el.nameLoc.end)).toBe('QrCode')
    expect(el.props.map((p) => [p.name, p.value, p.isBinding])).toEqual([
      ['value', '`spool:${row.id}`', true],
      ['size', '16mm', false],
    ])
    expect(SOURCE.slice(el.props[1].valueLoc!.start, el.props[1].valueLoc!.end)).toBe('16mm')
  })

  it('picks the innermost of nested elements', () => {
    expect(elementAt(SOURCE, at('<temp label', 2))!.tag).toBe('temp')
    expect(elementAt(SOURCE, at('class="temps"'))!.tag).toBe('div')
  })

  it('finds elements inside a full snippet, with file-absolute offsets', () => {
    const el = elementAt(SOURCE, at('<span class="k"', 2))!
    expect(el.tag).toBe('span')
    expect(el.file).toBe('snippet:temp')
    expect(SOURCE.slice(el.loc.start, el.loc.end)).toBe('<span class="k">{{ label }}</span>')
  })

  it('finds elements inside a shorthand snippet', () => {
    const el = elementAt(SOURCE, at('<b class="badge"', 2))!
    expect(el.tag).toBe('b')
    expect(el.file).toBe('snippet:badge')
    expect(SOURCE.slice(el.loc.start, el.loc.end)).toBe('<b class="badge">{{ text }}</b>')
  })

  it('returns null outside any template', () => {
    expect(elementAt(SOURCE, at('"width"'))).toBeNull() // <meta>
    expect(elementAt(SOURCE, at('defineProps'))).toBeNull() // snippet <script>
    expect(elementAt(SOURCE, at('font-weight'))).toBeNull() // <style>
  })

  it('survives a half-typed template', () => {
    expect(() => elementAt('<template><div class="', 20)).not.toThrow()
  })
})

describe('cursorContext', () => {
  it('classifies the caret', () => {
    expect(cursorContext(SOURCE, at('{{ row.name }}', 3))).toBe('interpolation')
    expect(cursorContext(SOURCE, at('</div>\n  <div class="temps"', 2))).toBe('text')
    expect(cursorContext(SOURCE, at('row.temp'))).toBe('attr-value-binding')
    expect(cursorContext(SOURCE, at('Nozzle'))).toBe('attr-value-static')
    expect(cursorContext(SOURCE, at('16mm'))).toBe('attr-value-static')
    expect(cursorContext(SOURCE, at('defineProps'))).toBe('script')
    expect(cursorContext(SOURCE, at('"height"'))).toBe('other')
    expect(cursorContext(SOURCE, at('<QrCode :value', 8))).toBe('other') // between attributes
  })

  it('drives the insertion form', () => {
    expect(insertVar(SOURCE, at('{{ row.name }}', 3), 'row.a').text).toBe('row.a')
    expect(insertVar(SOURCE, at('row.temp'), 'row.a').text).toBe('row.a')
    expect(insertVar(SOURCE, at('</div>\n  <div class="temps"', 2), 'row.a').text).toBe('{{ row.a }}')
    expect(insertVar(SOURCE, at('Nozzle'), 'row.a').text).toBe('{{ row.a }}')
  })
})

describe('attributeEdit', () => {
  const qr = () => elementAt(SOURCE, at('<QrCode', 3))!
  const apply = (edit: { start: number; end: number; text: string }) =>
    SOURCE.slice(0, edit.start) + edit.text + SOURCE.slice(edit.end)

  it('replaces an existing static attribute', () => {
    expect(apply(attributeEdit(qr(), 'size', 'set-static', '20mm'))).toContain('size="20mm" />')
  })

  it('replaces a binding with a static value and escapes quotes', () => {
    expect(apply(attributeEdit(qr(), 'value', 'set-static', 'a"b'))).toContain('<QrCode value="a&quot;b" size=')
  })

  it('turns a static attribute into a binding', () => {
    expect(apply(attributeEdit(qr(), 'size', 'set-binding', 'row.size'))).toContain(':size="row.size" />')
  })

  it('appends a new attribute before the self-closing slash', () => {
    expect(apply(attributeEdit(qr(), 'ecc', 'set-static', 'H'))).toContain('size="16mm" ecc="H" />')
    expect(apply(attributeEdit(qr(), 'ecc', 'set-binding', 'row.ecc'))).toContain('size="16mm" :ecc="row.ecc" />')
  })

  it('writes a bare attribute for static true', () => {
    expect(apply(attributeEdit(qr(), 'hidden', 'set-static', true))).toContain('size="16mm" hidden />')
  })

  it('removes an attribute with its preceding space', () => {
    expect(apply(attributeEdit(qr(), 'size', 'remove'))).toContain('<QrCode :value="`spool:${row.id}`" />')
  })

  it('appends to an element without attributes', () => {
    const el = elementAt('<template><div>x</div></template>', 12)!
    const edit = attributeEdit(el, 'class', 'set-static', 'a')
    expect(edit).toEqual({ start: 14, end: 14, text: ' class="a"' })
  })
})

import { boxAt } from './ast'

describe('boxAt', () => {
  const src = `<meta>
{ "name": "x", "size": { "width": 60, "height": 40 } }
</meta>

<template>
  <div class="a"><span>t</span></div>
  <p>open
</template>

<style>
.title { font-size: 16pt; }
.k { color: red; .nested { x: y } }
</style>`
  const at = (needle: string, plus = 1) => src.indexOf(needle) + plus

  it('boxes a well-formed element with children as holes', () => {
    const b = boxAt(src, at('<div'))!
    expect(src.slice(b.start, b.end)).toBe('<div class="a"><span>t</span></div>')
    expect(b.holes.map((h) => src.slice(h.start, h.end))).toEqual(['<span>t</span>'])
  })
  it('draws no box for an unclosed element', () => {
    expect(boxAt(src, at('<p>'))).toBeNull()
  })
  it('boxes the innermost css rule with nested rules as holes', () => {
    const b = boxAt(src, at('color'))!
    expect(src.slice(b.start, b.end)).toBe('.k { color: red; .nested { x: y } }')
    expect(b.holes.map((h) => src.slice(h.start, h.end))).toEqual(['.nested { x: y }'])
    const inner = boxAt(src, at('x: y'))!
    expect(src.slice(inner.start, inner.end)).toBe('.nested { x: y }')
  })
  it('boxes json objects in meta and the block itself outside braces', () => {
    const b = boxAt(src, at('"width"'))!
    expect(src.slice(b.start, b.end)).toBe('"size": { "width": 60, "height": 40 }')
    const whole = boxAt(src, at('<meta>', 2))!
    expect(src.slice(whole.start, whole.end).startsWith('<meta>')).toBe(true)
  })
  it('draws no box inside an unbalanced style block', () => {
    const bad = `<style>\n.a { color: red;\n</style>`
    expect(boxAt(bad, bad.indexOf('color'))).toBeNull()
  })
})

it('boxAt: caret on the selector head selects that rule, not the whole style block', () => {
  const src = `<style>\n.label { padding: 3mm }\n.title { font-size: 16pt }\n</style>`
  const b = boxAt(src, src.indexOf('.title') + 2)!
  expect(src.slice(b.start, b.end)).toBe('.title { font-size: 16pt }')
})

it('boxAt: <snippet> holes are its script/template/style blocks; script text outside braces = the script block', () => {
  const src = `<snippet name="t">
  <script setup lang="ts">
  const props = defineProps<{ label: string }>()
  const text = props.label
  </script>
  <template>{{ text }}</template>
</snippet>`
  const snip = boxAt(src, 3)!
  expect(src.slice(snip.start, snip.end)).toBe(src)
  expect(snip.holes.map((h) => src.slice(h.start, h.end).slice(0, 8))).toEqual(['<script ', '<templat'])
  const scr = boxAt(src, src.indexOf('const text'))!
  expect(src.slice(scr.start, scr.end).startsWith('<script')).toBe(true)
  expect(scr.holes.map((h) => src.slice(h.start, h.end))).toEqual(['const props = defineProps<{ label: string }'])
})
