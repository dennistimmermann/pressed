import { describe, expect, it } from 'vitest'
import { parseLength, ruleAt, setDeclaration } from './css'

const src = `<template><div class="a"/></template>
<style>
.title { font-size: 13pt; font-weight: 700; padding-right: 18mm }
.qr {
  position: absolute;
  right: 3mm;
  .nested { top: 1mm }
  background: url("x;y.png")
}
</style>`
const apply = (e: { start: number; end: number; text: string }) => src.slice(0, e.start) + e.text + src.slice(e.end)

describe('ruleAt / parseRule', () => {
  it('reads declarations of a one-line rule', () => {
    const r = ruleAt(src, src.indexOf('font-weight'))!
    expect(r.selector).toBe('.title')
    expect(r.declarations.map((d) => [d.prop, d.value])).toEqual([['font-size', '13pt'], ['font-weight', '700'], ['padding-right', '18mm']])
  })
  it('skips nested rules and respects strings', () => {
    const r = ruleAt(src, src.indexOf('right: 3mm'))!
    expect(r.selector).toBe('.qr')
    expect(r.declarations.map((d) => d.prop)).toEqual(['position', 'right', 'background'])
    expect(r.declarations[2].value).toBe('url("x;y.png")')
    expect(ruleAt(src, src.indexOf('top: 1mm'))!.selector).toBe('.nested')
  })
  it('is null outside style blocks', () => {
    expect(ruleAt(src, 5)).toBeNull()
  })
})

describe('setDeclaration', () => {
  it('replaces, appends and removes in a one-liner', () => {
    const r = ruleAt(src, src.indexOf('font-weight'))!
    expect(apply(setDeclaration(src, r, 'font-weight', '600'))).toContain('font-weight: 600;')
    expect(apply(setDeclaration(src, r, 'color', '#000'))).toContain('padding-right: 18mm; color: #000; }')
    expect(apply(setDeclaration(src, r, 'font-weight', null))).toContain('.title { font-size: 13pt; padding-right: 18mm }')
  })
  it('appends on its own line in a multi-line rule', () => {
    const r = ruleAt(src, src.indexOf('right: 3mm'))!
    expect(apply(setDeclaration(src, r, 'left', '2mm'))).toContain('background: url("x;y.png");\n  left: 2mm;\n}')
  })
  it('parseLength', () => {
    expect(parseLength('18mm')).toEqual({ n: 18, unit: 'mm' })
    expect(parseLength('1.5')).toEqual({ n: 1.5, unit: '' })
    expect(parseLength('auto')).toBeNull()
  })
})

it('rulesIn / findRule', async () => {
  const { rulesIn, findRule } = await import('./css')
  const rules = rulesIn(src, src.indexOf('<style>'), src.length)
  expect(rules.map((r) => r.selector)).toEqual(['.title', '.qr'])
  expect(findRule(rules, 'qr')?.selector).toBe('.qr')
  expect(findRule(rules, 'nested')).toBeUndefined() // nested rules are not top-level targets
  const multi = `<style>\n.a, .b { x: y }\n</style>`
  expect(findRule(rulesIn(multi, 0, multi.length), 'b')?.selector).toBe('.a, .b')
})
