import { expect, it } from 'vitest'
import { FACES, FAMILIES, weightsOf } from './catalogue'
import { familiesIn, inlineStyles, planFonts } from './embed'

it('every family in the catalogue has its faces on disk', () => {
  for (const f of FAMILIES) expect(weightsOf(f.family), f.family).toContain(400)
  expect(FACES.length).toBe(38)
})

it('reads families out of declarations, shorthands and Vue-rendered inline styles', () => {
  expect(familiesIn(`.a { font-family: "IBM Plex Sans", sans-serif } .b { font: italic 700 12pt/1.2 Nunito, serif }`)).toEqual([
    ['IBM Plex Sans', 'sans-serif'],
    ['Nunito', 'serif'],
  ])
  expect(familiesIn(inlineStyles(`<span style="font-size:12pt;font-family:&#39;Press Start 2P&#39;, monospace;" class="x">`))).toEqual([['Press Start 2P', 'monospace']])
  expect(familiesIn(`.c { font-weight: 700; font-size: 3mm }`)).toEqual([])
  // A template's own tokens, the way the bundled examples write them.
  expect(familiesIn(`.label { --mono: "IBM Plex Mono", monospace } .t { font-family: var(--mono) }`)).toEqual([['IBM Plex Mono', 'monospace']])
})

it('plans the default plus every bundled family named, and warns about the rest', () => {
  const plan = planFonts(
    `@font-face { font-family: Mine; src: url(asset:mine.woff2) }
     .a { font-family: Nunito } .b { font-family: Mine } .c { font-family: Comic Sans MS, cursive } .d { font-family: sans-serif }`,
    ['<div style="font-family:&#39;VT323&#39;">x</div>'],
  )
  expect([...new Set(plan.faces.map((f) => f.family))]).toEqual(['IBM Plex Sans', 'Nunito', 'VT323'])
  expect(plan.messages.map((m) => m.message)).toEqual([
    'font "Comic Sans MS" is not bundled — pick one from the font list, or bundle it as an asset with @font-face',
    'font "sans-serif" is a system font and prints differently on every machine — pick a bundled one',
  ])
  expect(plan.messages.every((m) => m.kind === 'purity')).toBe(true)
})
