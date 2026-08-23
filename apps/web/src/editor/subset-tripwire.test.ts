import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import subset from '@pressed/core/subset.json'

/**
 * The STYLE grid may only offer what the render subset allows — a control that writes a
 * property the compiler then warns about is a trap. This reads the pane's source rather than
 * its runtime, so adding a control is enough to trip it.
 */
const source = readFileSync(fileURLToPath(new URL('./StylePane.vue', import.meta.url)), 'utf8')
const PROPS = subset.properties as Record<string, true | string[] | undefined>
const all = (re: RegExp, text = source) => [...text.matchAll(re)].map((m) => m[1])

/** Every property the pane writes: the grid's own list, the four-side groups, the controls. */
const properties = new Set([
  ...all(/'([a-z-]+)'/g, /const GRID_PROPS = new Set\(\[([\s\S]*?)\]\)/.exec(source)![1]),
  ...all(/sides: \[([^\]]*)\]/g).flatMap((list) => all(/'([a-z-]+)'/g, list)),
  ...all(/\sprop="([a-z-]+)"/g), // unbound only: `:prop="p"` is a loop variable
  ...all(/\bset\('([a-z-]+)'/g),
])

/** Every keyword it offers for one: the segmented controls, the selects, the B/I/U toggles. */
const values = new Map<string, string[]>()
const offer = (prop: string, list: string[]) => values.set(prop, [...(values.get(prop) ?? []), ...list])
for (const [, prop, body] of source.matchAll(/^\s*'?([a-z-]+)'?: \[((?:[^[\]]|\[[^\]]*\])*)\],$/gm))
  if (/value: '/.test(body)) offer(prop, all(/value: '([^']+)'/g, body))
for (const [, tag] of source.matchAll(/<StyleField([\s\S]*?)\/>/g)) {
  const prop = /\bprop="([a-z-]+)"/.exec(tag)?.[1]
  const options = /:options="\[([^\]]*)\]"/.exec(tag)?.[1]
  if (prop && options) offer(prop, all(/'([a-z-]+)'/g, options))
}
for (const [, prop, value] of source.matchAll(/set\('([a-z-]+)',[^)]*?'([a-z-]+)'\)/g)) offer(prop, [value])

test('every property the STYLE grid writes is in the subset', () => {
  expect([...properties].filter((p) => !p.startsWith('--') && PROPS[p] === undefined)).toEqual([])
})

test('every keyword the STYLE grid offers is in the subset', () => {
  const bad = [...values].flatMap(([prop, list]) => {
    const allowed = PROPS[prop]
    return Array.isArray(allowed) ? list.filter((v) => !allowed.includes(v)).map((v) => `${prop}: ${v}`) : []
  })
  expect(bad).toEqual([])
})

test('the tripwire actually reads the pane', () => {
  expect(properties.size).toBeGreaterThan(30)
  expect(values.get('display')).toEqual(['flex', 'grid', 'block', 'inline', 'none'])
})
