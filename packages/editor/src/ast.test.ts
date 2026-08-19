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

// ---------------------------------------------------------------- structure

import {
  changeTag, countMatching, deleteElement, duplicateElement, elementTree, indentElement, moveElement,
  outdentElement, parentOf, reparentElement, setText, siblingsOf, unwrapElement, wrapElement,
  type Loc, type StructureEdit,
} from './ast'

const T = `<template>
  <div class="left">
    <span class="a">Nozzle</span>
    <span class="b">{{ row.temp }}</span>
  </div>
  <temp label="Bed" />
  <hr />
</template>
`

/** Apply a command's edits back to front — exactly what the host does. */
function run(source: string, result: StructureEdit): string {
  let out = source
  for (const e of result.edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

const el = (source: string, needle: string) => elementAt(source, source.indexOf(needle) + 1)!
/** The tag the command re-selected, read out of the *new* text. */
const selected = (source: string, r: StructureEdit) => elementAt(run(source, r), r.selectAt!)?.tag

describe('parentOf / siblingsOf', () => {
  it('walks up and sideways', () => {
    expect(parentOf(T, el(T, '<span class="b"'))!.tag).toBe('div')
    expect(parentOf(T, el(T, '<div class="left"'))).toBeNull()
    expect(siblingsOf(T, el(T, '<span class="a"')).map((s) => T.slice(s.start, s.start + 11))).toEqual([
      '<span class', '<span class',
    ])
    expect(siblingsOf(T, el(T, '<temp ')).length).toBe(3) // div, temp, hr
  })
})

describe('elementTree', () => {
  const block: Loc = { start: T.indexOf('<template>'), end: T.indexOf('</template>') + 11 }

  it('mirrors the template with classes and component flags', () => {
    const tree = elementTree(T, block)
    expect(tree.map((n) => n.tag)).toEqual(['div', 'temp', 'hr'])
    expect(tree[0].classes).toEqual(['left'])
    expect(tree[0].children.map((n) => n.tag)).toEqual(['span', 'span'])
    expect(tree.map((n) => n.isComponent)).toEqual([false, true, false])
    expect(T.slice(tree[1].loc.start, tree[1].loc.end)).toBe('<temp label="Bed" />')
  })

  it('scopes to a snippet block', () => {
    const at = SOURCE.indexOf('<template><span class="k"')
    expect(elementTree(SOURCE, { start: at, end: at + 40 }).map((n) => n.tag)).toEqual(['span'])
  })
})

describe('moveElement', () => {
  it('swaps with the sibling and follows the element', () => {
    const out = run(T, moveElement(T, el(T, '<temp '), 'up'))
    expect(out.indexOf('<temp ')).toBeLessThan(out.indexOf('<div class="left"'))
    expect(selected(T, moveElement(T, el(T, '<temp '), 'up'))).toBe('temp')
    const down = moveElement(T, el(T, '<span class="a"'), 'down')
    expect(run(T, down)).toContain('<span class="b">{{ row.temp }}</span>\n    <span class="a">Nozzle</span>')
    expect(selected(T, down)).toBe('span')
    expect(elementAt(run(T, down), down.selectAt!)!.props[0].value).toBe('a')
  })

  it('is a no-op at the ends', () => {
    expect(moveElement(T, el(T, '<div class="left"'), 'up')).toEqual({ edits: [], selectAt: null })
    expect(moveElement(T, el(T, '<hr'), 'down').edits).toEqual([])
  })
})

describe('indentElement / outdentElement', () => {
  it('nests into the previous sibling and re-indents', () => {
    const r = indentElement(T, el(T, '<temp '))
    expect(run(T, r)).toBe(`<template>
  <div class="left">
    <span class="a">Nozzle</span>
    <span class="b">{{ row.temp }}</span>
    <temp label="Bed" />
  </div>
  <hr />
</template>
`)
    expect(selected(T, r)).toBe('temp')
  })

  it('refuses a void or missing previous sibling', () => {
    expect(indentElement(T, el(T, '<hr')).edits).toEqual([]) // previous sibling <temp /> is self-closing
    expect(indentElement(T, el(T, '<div class="left"')).edits).toEqual([])
  })

  it('outdents to after the parent, and round-trips with indent', () => {
    const r = outdentElement(T, el(T, '<span class="b"'))
    expect(run(T, r)).toBe(`<template>
  <div class="left">
    <span class="a">Nozzle</span>
  </div>
  <span class="b">{{ row.temp }}</span>
  <temp label="Bed" />
  <hr />
</template>
`)
    const back = run(T, r)
    expect(run(back, indentElement(back, el(back, '<span class="b"')))).toBe(T)
  })

  it('does not outdent a top-level element', () => {
    expect(outdentElement(T, el(T, '<temp ')).edits).toEqual([])
  })

  it('breaks a one-line parent open when nesting into it', () => {
    const src = `<template>\n  <div>x</div>\n  <b>y</b>\n</template>\n`
    expect(run(src, indentElement(src, el(src, '<b>')))).toBe(
      `<template>\n  <div>x\n    <b>y</b>\n  </div>\n</template>\n`,
    )
  })
})

describe('wrapElement / unwrapElement', () => {
  it('round-trips', () => {
    const r = wrapElement(T, el(T, '<temp '), 'div')
    expect(run(T, r)).toContain('  <div>\n    <temp label="Bed" />\n  </div>\n')
    expect(selected(T, r)).toBe('div')
    const wrapped = run(T, r)
    expect(run(wrapped, unwrapElement(wrapped, el(wrapped, '<div>')))).toBe(T)
  })

  it('takes a component stub with props', () => {
    expect(run(T, wrapElement(T, el(T, '<hr'), 'Fit mode="shrink"'))).toContain(
      '  <Fit mode="shrink">\n    <hr />\n  </Fit>',
    )
  })

  it('unwraps a container to its children', () => {
    const r = unwrapElement(T, el(T, '<div class="left"'))
    expect(run(T, r)).toBe(`<template>
  <span class="a">Nozzle</span>
  <span class="b">{{ row.temp }}</span>
  <temp label="Bed" />
  <hr />
</template>
`)
  })

  it('will not unwrap a void element', () => {
    expect(unwrapElement(T, el(T, '<hr')).edits).toEqual([])
  })
})

describe('duplicateElement / deleteElement', () => {
  it('copies onto the next line and selects the copy', () => {
    const r = duplicateElement(T, el(T, '<temp '))
    expect(run(T, r)).toContain('  <temp label="Bed" />\n  <temp label="Bed" />\n')
    expect(elementAt(run(T, r), r.selectAt!)!.tag).toBe('temp')
  })

  it('removes the element and its line', () => {
    expect(run(T, deleteElement(T, el(T, '<temp ')))).toBe(`<template>
  <div class="left">
    <span class="a">Nozzle</span>
    <span class="b">{{ row.temp }}</span>
  </div>
  <hr />
</template>
`)
  })

  it('keeps the line when something else shares it', () => {
    const src = `<template>\n  <p>a<b>c</b>d</p>\n</template>\n`
    expect(run(src, deleteElement(src, el(src, '<b>')))).toBe(`<template>\n  <p>ad</p>\n</template>\n`)
  })
})

describe('changeTag', () => {
  it('renames both tags', () => {
    expect(run(T, changeTag(T, el(T, '<div class="left"'), 'section'))).toContain('<section class="left">')
    expect(run(T, changeTag(T, el(T, '<div class="left"'), 'section'))).toContain('</section>')
  })

  it('grows a body when a void tag becomes a normal one', () => {
    expect(run(T, changeTag(T, el(T, '<hr'), 'p'))).toContain('<p></p>')
    expect(run(T, changeTag(T, el(T, '<temp '), 'p'))).toContain('<p label="Bed"></p>')
  })

  it('drops the body when a normal tag becomes void', () => {
    expect(run(T, changeTag(T, el(T, '<span class="a"'), 'br'))).toContain('<br class="a" />')
  })
})

describe('setText', () => {
  it('is offered for text-only elements and replaces their content', () => {
    const span = el(T, '<span class="a"')
    expect(span.text!.value).toBe('Nozzle')
    expect(run(T, setText(T, span, 'Bed {{ row.n }}'))).toContain('<span class="a">Bed {{ row.n }}</span>')
    expect(el(T, '<span class="b"').text!.value).toBe('{{ row.temp }}')
    expect(el(T, '<div class="left"').text).toBeUndefined() // has child elements
    expect(el(T, '<temp ').text).toBeUndefined() // self-closing
  })

  it('fills an empty element', () => {
    const src = `<template>\n  <div class="k"></div>\n</template>\n`
    const div = el(src, '<div')
    expect(div.text!.value).toBe('')
    expect(run(src, setText(src, div, 'hi'))).toContain('<div class="k">hi</div>')
  })
})

describe('reparentElement', () => {
  const loc = (needle: string) => el(T, needle).loc

  it('drops before, after and inside', () => {
    expect(run(T, reparentElement(T, el(T, '<temp '), loc('<span class="a"'), 'before'))).toContain(
      '    <temp label="Bed" />\n    <span class="a">',
    )
    expect(run(T, reparentElement(T, el(T, '<hr'), loc('<span class="a"'), 'after'))).toContain(
      '<span class="a">Nozzle</span>\n    <hr />',
    )
    const inside = reparentElement(T, el(T, '<hr'), loc('<div class="left"'), 'inside')
    expect(run(T, inside)).toContain('<span class="b">{{ row.temp }}</span>\n    <hr />\n  </div>')
    expect(selected(T, inside)).toBe('hr')
  })

  it('refuses its own subtree, itself, and a void parent', () => {
    expect(reparentElement(T, el(T, '<div class="left"'), loc('<span class="a"'), 'inside').edits).toEqual([])
    expect(reparentElement(T, el(T, '<temp '), loc('<temp '), 'after').edits).toEqual([])
    expect(reparentElement(T, el(T, '<temp '), loc('<hr'), 'inside').edits).toEqual([])
  })
})

it('refuses to restructure the block\'s own <template> tag', () => {
  const block = elementAt(T, 0)! // the caret in empty template space resolves to the block
  expect(block.tag).toBe('template')
  expect(deleteElement(T, block).edits).toEqual([])
  expect(wrapElement(T, block, 'div').edits).toEqual([])
  expect(setText(T, block, 'x').edits).toEqual([])
})

describe('malformed elements', () => {
  const bad = `<template>\n  <div class="a">\n  <p>x</p>\n</template>\n`
  const div = elementAt(bad, bad.indexOf('<div') + 1)!

  it('yields no edits at all', () => {
    expect(div.wellFormed).toBe(false)
    for (const r of [
      moveElement(bad, div, 'up'), moveElement(bad, div, 'down'), indentElement(bad, div),
      outdentElement(bad, div), wrapElement(bad, div, 'div'), unwrapElement(bad, div),
      duplicateElement(bad, div), deleteElement(bad, div), changeTag(bad, div, 'p'),
      setText(bad, div, 'x'), reparentElement(bad, div, div.loc, 'after'),
    ])
      expect(r).toEqual({ edits: [], selectAt: null })
  })
})

it('insertElementText: after an element, or at the end of the block', async () => {
  const { insertElementText, elementAt } = await import('./ast')
  const src = `<template>\n  <div class="a" />\n  <ul>\n    <li>x</li>\n  </ul>\n</template>`
  const block = { start: 0, end: src.length }
  const li = elementAt(src, src.indexOf('<li>') + 1)!
  const r = insertElementText(src, '<li>|</li>', li.loc, block)
  const out = src.slice(0, r.edits[0].start) + r.edits[0].text + src.slice(r.edits[0].end)
  expect(out).toContain('    <li>x</li>\n    <li></li>\n  </ul>')
  expect(out.slice(r.selectAt!)).toMatch(/^<\/li>/)
  const tail = insertElementText(src, '<span>|</span>', null, block)
  const out2 = src.slice(0, tail.edits[0].start) + tail.edits[0].text + src.slice(tail.edits[0].end)
  expect(out2).toContain('  </ul>\n  <span></span>\n</template>')
})

it('insertElementText: ⌥Enter puts it inside the anchor', async () => {
  const { insertElementText, elementAt } = await import('./ast')
  const src = `<template>\n  <div class="a">\n    <span>x</span>\n  </div>\n</template>`
  const div = elementAt(src, src.indexOf('<div') + 1)!
  const r = insertElementText(src, '<em>|</em>', div.loc, { start: 0, end: src.length }, 'inside')
  const out = src.slice(0, r.edits[0].start) + r.edits[0].text + src.slice(r.edits[0].end)
  expect(out).toContain('    <span>x</span>\n    <em></em>\n  </div>')
  expect(out.slice(r.selectAt!)).toMatch(/^<\/em>/)
})

describe('countMatching', () => {
  const block: Loc = { start: T.indexOf('<template>'), end: T.indexOf('</template>') + 11 }
  const tree = elementTree(T, block)

  it('counts elements a simple selector matches', () => {
    expect(countMatching(tree, '.a')).toBe(1)
    expect(countMatching(tree, 'span')).toBe(2)
    expect(countMatching(tree, '*')).toBe(5)
    expect(countMatching(tree, '.a, .b')).toBe(2)
    expect(countMatching(tree, '.gone')).toBe(0)
    expect(countMatching(tree, 'div span')).toBe(0) // ponytail: descendants are not supported
  })
})
