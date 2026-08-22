import { parse } from '@vue/compiler-sfc'
import { expect, test } from 'vitest'
import { subset, validateSubset } from './subset'
import { compileTemplate } from './template/loader'

/** The subset messages of a template, in source order. */
const violations = (source: string) =>
  compileTemplate(source).errors.filter((e) => e.kind === 'subset').map((e) => e.message)

const inTemplate = (markup: string) => violations(`<template>${markup}</template>`)
const inStyle = (css: string) => violations(`<template><div/></template>\n<style>\n${css}\n</style>`)

test('elements: only the whitelisted tags, SVG tags only inside <svg>', () => {
  expect(inTemplate('<table><tr><td>x</td></tr></table>')).toEqual([
    '<table> is not in the subset',
    '<tr> is not in the subset',
    '<td> is not in the subset',
  ])
  expect(inTemplate('<path d="M0 0" />')).toEqual(['<path> is not in the subset'])
  expect(inTemplate('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')).toEqual([])
  // Components are the template's own vocabulary, not HTML.
  expect(inTemplate('<QrCode text="x" /><template v-if="true"><div/></template>')).toEqual([])
})

/**
 * Nesting is the mechanism behind a future `<li>` ⊂ `<ul>`; no whitelisted element carries the
 * rules yet, so it is tested on a config that does.
 */
const withLists = {
  ...subset,
  elements: { ...subset.elements, ul: { children: ['li'] }, ol: { children: ['li'] }, li: { parents: ['ul', 'ol'] } },
}
const nested = (markup: string) =>
  validateSubset(parse(`<template>${markup}</template>`).descriptor, 'main', 0, withLists).map((m) => m.message)

test('nesting: parents and children rules', () => {
  expect(nested('<ul><li>x</li></ul>')).toEqual([])
  expect(nested('<li>x</li>')).toEqual(['<li> is only allowed inside <ul>/<ol>'])
  expect(nested('<div><li>x</li></div>')).toEqual(['<li> is only allowed inside <ul>/<ol>'])
  expect(nested('<ul><div>x</div></ul>')).toEqual(['<ul> only allows <li> here'])
  // A `<template v-for>` is not an element: the `<li>` still sees the `<ul>`.
  expect(nested('<ul><template v-for="x in y"><li>{{ x }}</li></template></ul>')).toEqual([])
})

test('a static style attribute is checked like a declaration block', () => {
  expect(inTemplate('<div style="float:left">x</div>')).toEqual(['float is not in the subset'])
  expect(inTemplate('<div style="padding: 2mm; color: #000">x</div>')).toEqual([])
})

test('properties: unknown ones, and the enumerated ones by value', () => {
  expect(inStyle('.a { float: left }')).toEqual(['float is not in the subset'])
  expect(inStyle('.a { display: table-cell }')).toEqual(['display: table-cell is not in the subset'])
  expect(inStyle('.a { display: flex; position: absolute }')).toEqual([])
  // Custom properties are open, and `var()` reads them back.
  expect(inStyle('.a { --pad: 2mm; padding: var(--pad) }')).toEqual([])
})

test('values: units, functions and url() prefixes', () => {
  expect(inStyle('.a { height: 10vh }')).toEqual([])
  expect(inStyle('.a { height: 10ch }')).toEqual(['unit ch is not in the subset'])
  expect(inStyle('.a { padding-top: env(safe-area-inset-top) }')).toEqual(['env() is not in the subset'])
  expect(inStyle('.a { width: calc(100% - 4mm); transform: rotate(90deg) }')).toEqual([])
  expect(inStyle('.a { background-image: url(https://x/y.png) }')[0]).toMatch(/^url\(https:\/\/x\/y.png…\) is not in the subset/)
  expect(inStyle('.a { background-image: url(data:image/png;base64,iVBOR) }')).toEqual([])
  // A hex colour is not a dimension.
  expect(inStyle('.a { color: #e5484d; border: 1px solid #48d }')).toEqual([])
})

test('selectors: pseudo-classes and attribute selectors', () => {
  expect(inStyle('.a:hover { color: #000 }')).toEqual([':hover is not in the subset'])
  expect(inStyle('.a::before { color: #000 }')).toEqual(['::before is not in the subset'])
  expect(inStyle('.a:first-child, .b:nth-child(2n) > div { color: #000 }')).toEqual([])
  expect(inStyle('[data-x] { color: #000 }')).toEqual(['attribute selectors are not in the subset'])
})

test('at-rules: only @font-face, and its body is value-checked', () => {
  expect(inStyle('@media print { .a { color: #000 } }')).toEqual(['@media is not in the subset'])
  expect(inStyle('@import "x.css";')).toEqual(['@import is not in the subset'])
  expect(inStyle('@font-face { font-family: Label; src: url(data:font/woff2;base64,d09) }')).toEqual([])
  expect(inStyle('@font-face { src: url(https://x/f.woff2) }')).toHaveLength(1)
})

test('CSS nesting is not in the subset', () => {
  expect(inStyle('.a { color: #000; .b { color: #111 } }')).toEqual(['CSS nesting is not in the subset'])
})

test('messages carry kind and position', () => {
  const errors = compileTemplate('<template>\n  <hr/>\n</template>\n<style>\n.a { float: left }\n</style>')
  const subsetErrors = errors.errors.filter((e) => e.kind === 'subset')
  expect(subsetErrors.map((e) => [e.message, e.file, e.line])).toEqual([
    ['<hr> is not in the subset', 'main', 2],
    ['float is not in the subset', 'main', 5],
  ])
})

test('a snippet is checked under its own file name', () => {
  const errors = compileTemplate(
    '<snippet name="badge">\n<template><table>x</table></template>\n<style>.k:hover { color: #000 }</style>\n</snippet>\n<template><badge/></template>',
  ).errors.filter((e) => e.kind === 'subset')
  expect(errors.map((e) => [e.file, e.message])).toEqual([
    ['snippet:badge', '<table> is not in the subset'],
    ['snippet:badge', ':hover is not in the subset'],
  ])
})

test('a realistic label template is clean', () => {
  expect(
    violations(`<meta>{ "name": "Spool", "size": { "width": 50, "height": 30 } }</meta>
<template>
  <div class="card">
    <span class="name">{{ row.name }}</span>
    <div class="meta"><span>{{ row.material }}</span><b>{{ row.weight }} g</b></div>
    <QrCode :text="row.id" size="12mm" />
  </div>
</template>
<style>
.card { display: flex; flex-direction: column; gap: 1.5mm; padding: 2mm; height: 100% }
.name { font-size: 11pt; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap }
.meta { display: flex; justify-content: space-between; color: #444; font-size: 7pt }
.meta span:first-child { text-transform: uppercase }
.card > div { border-top: 1px solid #000; padding-top: 1mm }
</style>`),
  ).toEqual([])
})
