import { expect, test } from 'vitest'
import { compileTemplate, parseTemplate } from './loader'
import { render } from './render'
import { componentSchemas } from './schemas'
import { labelDocument } from './label'

const errorsOnly = (m: { kind: string }[]) => m.filter((e) => e.kind === 'compile' || e.kind === 'render')

test('minimal template: <template> only, no script', async () => {
  const compiled = compileTemplate('<template><div class="t">{{ row.name }}</div></template>')
  expect(errorsOnly(compiled.errors)).toEqual([])
  const { html } = await render(compiled, { name: 'PLA Black' })
  expect(html).toBe('<div class="t">PLA Black</div>')
})

test('<meta> is parsed, and defaults fill the gaps', () => {
  const withMeta = parseTemplate('<meta>{ "name": "Spool", "size": { "width": 60, "height": 40 }, "gap": 2 }</meta>\n<template><i/></template>')
  expect(withMeta.meta).toEqual({ name: 'Spool', size: { width: 60, height: 40 }, gap: 2 })

  const bare = parseTemplate('<template><i/></template>')
  expect(bare.meta).toEqual({ name: 'Untitled', size: { width: 50, height: 30 } })

  const broken = parseTemplate('<meta>{ nope }</meta><template><i/></template>')
  expect(broken.errors[0].message).toMatch(/<meta> is not valid JSON/)
})

test('shorthand snippet: body is the template, props="…" are string props', async () => {
  const compiled = compileTemplate(`
<snippet name="badge" props="text">
  <span class="badge">{{ text }}</span>
</snippet>
<template><badge text="almost empty" /></template>`)
  expect(errorsOnly(compiled.errors)).toEqual([])
  const { html } = await render(compiled, {})
  expect(html).toContain('<span class="badge">almost empty</span>')
})

test('full snippet: <script setup> + scoped <style>', async () => {
  const compiled = compileTemplate(`
<snippet name="temp">
  <script setup lang="ts">
  const props = defineProps<{ label: string; min: number }>()
  const text = \`\${props.min} °C\`
  </script>
  <template><span class="k">{{ label }}</span> {{ text }}</template>
  <style scoped>.k { color: #666 }</style>
</snippet>
<template><temp label="Nozzle" :min="215" /></template>`)
  expect(errorsOnly(compiled.errors)).toEqual([])
  const { html, css } = await render(compiled, {})
  expect(html).toContain('Nozzle')
  expect(html).toContain('215 °C')
  expect(html).toMatch(/data-v-sprint-temp/) // scope id applied
  expect(css).toMatch(/\.k\[data-v-sprint-temp\]/) // scoped style rewritten
})

test('a snippet may not take a library component name', () => {
  const { errors } = parseTemplate('<snippet name="QrCode"><i/></snippet><template><i/></template>')
  expect(errors[0].message).toMatch(/clashes with the library component/)
})

test('snippets may not nest', () => {
  const { errors } = parseTemplate('<snippet name="a"><snippet name="b"><i/></snippet></snippet><template><i/></template>')
  expect(errors.some((e) => /may not nest/.test(e.message) && e.file === 'snippet:a')).toBe(true)
})

test('purity lint warns with file and line', () => {
  const { errors } = compileTemplate(`<script setup>
const t = setTimeout(() => {}, 1)
</script>
<template><i/></template>`)
  const purity = errors.filter((e) => e.kind === 'purity')
  expect(purity).toHaveLength(1)
  expect(purity[0]).toMatchObject({ kind: 'purity', file: 'main', line: 2 })
  expect(purity[0].message).toMatch(/setTimeout is not allowed/)
})

test('inspector adds data-loc with offsets into the file', async () => {
  const source = '<template><div><b>x</b></div></template>'
  const compiled = compileTemplate(source, { inspector: true })
  const { html } = await render(compiled, {})
  const [, start, end] = /data-loc="(\d+):(\d+)"/.exec(html)!
  expect(source.slice(+start, +end)).toBe('<div><b>x</b></div>')
  expect(html.match(/data-loc/g)).toHaveLength(2) // both elements
})

test('asset: URLs become data URLs in html and css, unknown ones warn', async () => {
  const compiled = compileTemplate(`
<template><Img src="asset:logo.svg" /></template>
<style>.a { background: url(asset:logo.svg) } .b { background: url(asset:gone.png) }</style>`)
  const { html, css, warnings } = await render(compiled, {}, { 'logo.svg': { mime: 'image/svg+xml', base64: 'PHN2Zy8+' } })
  expect(html).toContain('src="data:image/svg+xml;base64,PHN2Zy8+"')
  expect(css).toContain('url(data:image/svg+xml;base64,PHN2Zy8+)')
  expect(css).toContain('url(asset:gone.png)')
  expect(warnings.map((w) => w.message)).toContain('unknown asset "gone.png"')
})

test('library components render: QrCode and Barcode produce SVG', async () => {
  const compiled = compileTemplate('<template><QrCode value="spool:7" size="18mm" /><Barcode value="AB" /></template>')
  expect(errorsOnly(compiled.errors)).toEqual([])
  const { html } = await render(compiled, {})
  expect(html).toContain('width="18mm"')
  expect(html).toMatch(/<path d="M/)
  expect(html).toMatch(/<rect/)
})

test('componentSchemas: runtime props + JSDoc @format from the source', () => {
  const compiled = compileTemplate(`
<snippet name="chip">
  <script setup lang="ts">
  defineProps<{
    /** Text on the chip. */
    text: string
    /** Corner radius. @format mm */
    radius?: string
    tone?: 'warn' | 'ok'
  }>()
  </script>
  <template><span>{{ text }}</span></template>
</snippet>
<template><chip text="x" /></template>`)
  const schemas = componentSchemas(compiled)
  const chip = schemas.find((s) => s.name === 'chip')!
  expect(chip.props).toEqual([
    { name: 'text', type: 'string', required: true, doc: 'Text on the chip.' },
    { name: 'radius', type: 'string', required: false, doc: 'Corner radius.', format: 'mm' },
    { name: 'tone', type: 'enum', values: ['warn', 'ok'], required: false },
  ])
  // The library is described the same way, from the same code path.
  const qr = schemas.find((s) => s.name === 'QrCode')!
  expect(qr.props.find((p) => p.name === 'size')).toMatchObject({ type: 'string', format: 'mm', default: '18mm' })
  expect(qr.props.find((p) => p.name === 'ecc')).toMatchObject({ type: 'enum', values: ['L', 'M', 'Q', 'H'] })
})

test('labelDocument wraps a rendered label in real millimetres', () => {
  const doc = labelDocument({ html: ['<i>a</i>', '<i>b</i>'], css: '.x{}' }, { width: 60, height: 40 }, true)
  expect(doc).toContain('width:60mm;height:40mm')
  expect(doc).toContain('@page { size: 60mm 40mm; margin: 0 }')
  expect(doc.match(/class="label"/g)).toHaveLength(2)
})
