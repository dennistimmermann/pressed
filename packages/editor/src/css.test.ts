import { describe, expect, it } from 'vitest'
import { expandSides, impliedArity, parseLength, regroup, ruleAt, setDeclaration, setDeclarations, splitSides } from './css'

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
  // A link toggle writes the four sides and drops the shorthand: one edit, one ⌘Z.
  it('batches several declarations into one edit', () => {
    const r = ruleAt(src, src.indexOf('right: 3mm'))!
    const out = apply(setDeclarations(src, r, [
      { prop: 'padding-top', value: '1mm' },
      { prop: 'padding-left', value: '2mm' },
      { prop: 'position', value: null },
      { prop: 'right', value: '4mm' },
    ]))
    expect(out).toContain('padding-top: 1mm;')
    expect(out).toContain('padding-left: 2mm;')
    expect(out).toContain('right: 4mm;')
    expect(out).not.toContain('position: absolute')
    expect(out).toContain('.nested { top: 1mm }') // nested rules survive the body rewrite
  })

  // A side with no declaration of its own shows what the shorthand gives it, greyed.
  it('expandSides', () => {
    expect(expandSides('3mm')).toEqual(['3mm', '3mm', '3mm', '3mm'])
    expect(expandSides('1mm 2mm')).toEqual(['1mm', '2mm', '1mm', '2mm'])
    expect(expandSides(' 1mm  2mm 3mm ')).toEqual(['1mm', '2mm', '3mm', '2mm'])
    expect(expandSides('1mm 2mm 3mm 4mm')).toEqual(['1mm', '2mm', '3mm', '4mm'])
    expect(expandSides(undefined)).toBeNull()
    expect(expandSides('')).toBeNull()
    expect(expandSides('1 2 3 4 5')).toBeNull()
    expect(expandSides('calc(1mm + 2mm)')).toBeNull() // cannot be split on whitespace
  })

  // The arity toggle: the shorthand as written, and re-cut to another number of values.
  it('splitSides keeps the arity as written', () => {
    expect(splitSides('3mm')).toEqual(['3mm'])
    expect(splitSides(' 1mm  2mm 3mm ')).toEqual(['1mm', '2mm', '3mm'])
    expect(splitSides('1 2 3 4 5')).toBeNull()
    expect(splitSides('calc(1mm + 2mm)')).toBeNull()
    expect(splitSides(undefined)).toBeNull()
  })

  it('regroup takes the value first in property order', () => {
    const four = expandSides('1mm 2mm 3mm 4mm')!
    expect(regroup(four, 4)).toEqual(['1mm', '2mm', '3mm', '4mm'])
    expect(regroup(four, 3)).toEqual(['1mm', '2mm', '3mm']) // R wins over L
    expect(regroup(four, 2)).toEqual(['1mm', '2mm']) // T over B, R over L
    expect(regroup(four, 1)).toEqual(['1mm'])
    expect(regroup(expandSides('1mm 2mm 3mm')!, 2)).toEqual(['1mm', '2mm'])
    // Round trip: widening a shorthand re-states what it already meant.
    for (const v of ['2mm', '2mm 6mm', '1mm 4mm 1mm']) {
      expect(regroup(expandSides(v)!, 4).join(' ')).toBe(expandSides(v)!.join(' '))
      expect(regroup(expandSides(v)!, splitSides(v)!.length)).toEqual(splitSides(v))
    }
    // Radius reads the same tuple as TL·TR·BR·BL: `1mm 4mm` is the two diagonals.
    expect(expandSides('1mm 4mm')).toEqual(['1mm', '4mm', '1mm', '4mm'])
    expect(regroup(expandSides('1mm 4mm')!, 3)).toEqual(['1mm', '4mm', '1mm'])
  })

  it('impliedArity is the shortest shorthand that says the same thing', () => {
    expect(impliedArity(['0', '0', '0', '0'])).toBe(1)
    expect(impliedArity(['2mm', '0', '2mm', '0'])).toBe(2)
    expect(impliedArity(['2mm', '0', '0', '0'])).toBe(3) // top · left+right · bottom
    expect(impliedArity(['0', '18mm', '0', '0'])).toBe(4) // right ≠ left: nothing to share
    // Whatever it says can be written at that arity and read back unchanged.
    for (const v of ['2mm', '2mm 6mm', '1mm 4mm 1mm', '1mm 2mm 3mm 4mm']) {
      const four = expandSides(v)!
      expect(expandSides(regroup(four, impliedArity(four)).join(' '))).toEqual(four)
    }
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
